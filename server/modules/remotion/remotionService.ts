import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { isGeminiConfigured } from "../../geminiClient.ts";
import {
  estimateSpeechDurationSeconds,
  synthesizeSpeechBuffer,
} from "../ttsSynth.ts";
import {
  generateVideoScript,
  type VideoScriptDraft,
  type VideoTone,
} from "../videoScriptService.ts";
import {
  JARVIS_VIDEO_COMPOSITIONS,
  JARVIS_VIDEO_FPS,
  JARVIS_VIDEO_SIZES,
  type JarvisVideoFormat,
  type JarvisVideoProps,
  type JarvisVideoScene,
} from "../../../remotion/video/types.ts";

/**
 * Service Remotion isolé (additif).
 *
 * Pipeline réel : prompt → script Gemini → aperçu (still Remotion) → voix off
 * (TTS existant) → composition React → MP4 (CLI Remotion).
 *
 * Le rendu se fait dans un processus enfant : le serveur HTTP n'est jamais bloqué.
 * Un seul rendu actif à la fois (contrainte CPU du palier gratuit).
 *
 * Aucune fonctionnalité HyperFrames n'est implémentée ici : son statut est
 * uniquement relevé depuis la documentation et le binaire installés.
 */

const OUTPUT_ROOT = path.resolve(process.cwd(), "public", "generated", "remotion");
const AUDIO_ROOT = path.resolve(
  process.cwd(),
  "remotion",
  "public",
  "generated",
  "remotion"
);
const PROPS_ROOT = path.resolve(process.cwd(), "server", ".data", "remotion");
const ENTRY_POINT = "remotion/index.ts";
const CLI_PATH = path.resolve(
  process.cwd(),
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js"
);
const HYPERFRAMES_CLI = path.resolve(
  process.cwd(),
  "node_modules",
  "hyperframes",
  "bin",
  "hyperframes.mjs"
);

const MUSIC_FILE = existsSync(
  path.resolve(process.cwd(), "remotion", "public", "reel", "audio", "music.mp3")
)
  ? "reel/audio/music.mp3"
  : null;

const RENDER_TIMEOUT_MS = 20 * 60 * 1000;
const PREVIEW_TIMEOUT_MS = 4 * 60 * 1000;
/**
 * Échelle de rendu : 1 par défaut pour respecter exactement les formats demandés
 * (1080×1920, 1920×1080, 1080×1080). Un hébergeur très contraint peut définir
 * JARVIS_REMOTION_SCALE=0.5 ou 0.25 ; les dimensions réelles du fichier sont alors
 * renvoyées telles quelles dans le job.
 */
const RENDER_SCALE = String(process.env.JARVIS_REMOTION_SCALE || "1").trim();
const RENDER_SCALE_NUMBER =
  Number.isFinite(Number(RENDER_SCALE)) && Number(RENDER_SCALE) > 0
    ? Number(RENDER_SCALE)
    : 1;

export type RemotionStyle = "documentaire" | "dynamique" | "inspirant" | "minimal";
export type RemotionJobStatus =
  | "queued"
  | "scripting"
  | "preview"
  | "voicing"
  | "rendering"
  | "done"
  | "error"
  | "canceled";

export interface RemotionPreview {
  url: string;
  width: number;
  height: number;
}

export interface RemotionFile {
  format: JarvisVideoFormat;
  url: string;
  fileName: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface RemotionJob {
  id: string;
  status: RemotionJobStatus;
  step: string;
  progress: number;
  prompt: string;
  format: JarvisVideoFormat;
  durationSec: number;
  style: RemotionStyle;
  tone: VideoTone;
  title: string | null;
  sceneCount: number;
  warning: string | null;
  error: string | null;
  preview: RemotionPreview | null;
  result: { durationSec: number; sceneCount: number; files: RemotionFile[] } | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface StartRemotionInput {
  prompt: string;
  format: JarvisVideoFormat;
  durationSec: number;
  style: RemotionStyle;
}

interface JobContext {
  job: RemotionJob;
  child: ChildProcess | null;
  canceled: boolean;
}

const STYLES: Record<
  RemotionStyle,
  { tone: VideoTone; accent: "cyan" | "violet" | "amber"; label: string }
> = {
  documentaire: { tone: "pedagogique", accent: "cyan", label: "Documentaire / pédagogique" },
  dynamique: { tone: "energique", accent: "amber", label: "Dynamique" },
  inspirant: { tone: "inspirant", accent: "violet", label: "Inspirant" },
  minimal: { tone: "pedagogique", accent: "cyan", label: "Minimal" },
};

const FORMATS = Object.keys(JARVIS_VIDEO_SIZES) as JarvisVideoFormat[];
const jobs = new Map<string, RemotionJob>();
let active: JobContext | null = null;
let loaded = false;

function isRunning(status: RemotionJobStatus): boolean {
  return (
    status === "queued" ||
    status === "scripting" ||
    status === "preview" ||
    status === "voicing" ||
    status === "rendering"
  );
}

function publicJob(job: RemotionJob): RemotionJob {
  return JSON.parse(JSON.stringify(job)) as RemotionJob;
}

function normalizeFormat(value: unknown): JarvisVideoFormat {
  return FORMATS.includes(value as JarvisVideoFormat)
    ? (value as JarvisVideoFormat)
    : "vertical";
}

function normalizeStyle(value: unknown): RemotionStyle {
  return typeof value === "string" && value in STYLES
    ? (value as RemotionStyle)
    : "documentaire";
}

function normalizeDuration(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(120, Math.max(10, Math.round(parsed)));
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function persist(job: RemotionJob): Promise<void> {
  try {
    await ensureDir(path.join(OUTPUT_ROOT, job.id));
    await fs.writeFile(
      path.join(OUTPUT_ROOT, job.id, "job.json"),
      JSON.stringify(job, null, 2),
      "utf8"
    );
  } catch (error) {
    console.warn("[remotion] Persistance du job impossible :", error);
  }
}

async function loadPersistedJobs(): Promise<void> {
  try {
    const entries = await fs.readdir(OUTPUT_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await fs.readFile(
          path.join(OUTPUT_ROOT, entry.name, "job.json"),
          "utf8"
        );
        const job = JSON.parse(raw) as RemotionJob;
        if (!job || typeof job.id !== "string") continue;
        if (isRunning(job.status)) {
          job.status = "error";
          job.step = "Interrompu";
          job.error = "Rendu interrompu par un redémarrage du serveur.";
          job.finishedAt = Date.now();
        }
        jobs.set(job.id, job);
      } catch {
        // Dossier sans job.json exploitable : ignoré.
      }
    }
  } catch {
    // Aucun rendu précédent.
  }
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  await loadPersistedJobs();
}

function readPackageVersion(packageDir: string): string | null {
  try {
    const raw = readFileSync(path.join(packageDir, "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

export async function getRemotionStatus(): Promise<Record<string, unknown>> {
  const cliAvailable = existsSync(CLI_PATH);
  return {
    engine: "remotion",
    remotion: {
      installed: cliAvailable,
      version: readPackageVersion(path.resolve(process.cwd(), "node_modules", "remotion")),
      entryPoint: ENTRY_POINT,
      renderScale: RENDER_SCALE,
    },
    formats: FORMATS.map((format) => {
      const size = JARVIS_VIDEO_SIZES[format];
      return {
        id: format,
        width: size.width,
        height: size.height,
        composition: JARVIS_VIDEO_COMPOSITIONS[format],
      };
    }),
    styles: Object.entries(STYLES).map(([id, value]) => ({ id, label: value.label })),
    geminiConfigured: isGeminiConfigured(),
    musicAvailable: existsSync(
      path.resolve(process.cwd(), "remotion", "public", "reel", "audio", "music.mp3")
    ),
    concurrentRenders: 1,
    hyperframes: {
      installed: existsSync(HYPERFRAMES_CLI),
      documented: existsSync(
        path.resolve(process.cwd(), "node_modules", "hyperframes", "README.md")
      ),
      validated: false,
      note:
        "CLI HyperFrames détectée et documentée, mais aucun rendu HyperFrames n'a été exécuté ni validé dans cette session. Aucune fonctionnalité n'est annoncée comme opérationnelle.",
    },
  };
}

export async function listRemotionJobs(): Promise<RemotionJob[]> {
  await ensureLoaded();
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(publicJob);
}

export async function getRemotionJob(id: string): Promise<RemotionJob | null> {
  await ensureLoaded();
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

export function hasActiveRender(): boolean {
  return !!active && isRunning(active.job.status);
}

/**
 * Nombre de scènes cohérent avec la durée choisie : ~6 secondes par scène.
 * Évite qu'une cible de 10 s produise une vidéo d'une minute à cause de la voix off.
 */
function targetSceneCount(draft: VideoScriptDraft, durationSec: number): number {
  return Math.max(2, Math.min(draft.scenes.length, Math.round(durationSec / 6)));
}

/** Scènes sans audio pour l'aperçu : aucune voix off n'est synthétisée à ce stade. */
function buildPreviewScenes(draft: VideoScriptDraft, durationSec: number): JarvisVideoScene[] {
  const count = targetSceneCount(draft, durationSec);
  const perSceneFrames = Math.max(
    Math.round(2.6 * JARVIS_VIDEO_FPS),
    Math.round((durationSec / count) * JARVIS_VIDEO_FPS)
  );
  return draft.scenes.slice(0, count).map((scene, index) => ({
    id: `scene-${index + 1}`,
    kind: scene.kind,
    headline: scene.headline,
    subline: scene.subline,
    narration: scene.narration,
    audio: null,
    durationInFrames: perSceneFrames,
    audioOffsetInFrames: 6,
  }));
}

interface RunResult {
  stderr: string;
}

function runCli(options: {
  args: string[];
  context: JobContext;
  timeoutMs: number;
  timeoutMessage: string;
  onLine?: (line: string) => void;
}): Promise<RunResult> {
  const { args, context, timeoutMs, timeoutMessage, onLine } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=384`.trim(),
      },
    });
    context.child = child;
    let settled = false;
    let stdoutBuffer = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error(timeoutMessage));
    }, timeoutMs);

    const finish = (error?: Error, result?: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      context.child = null;
      if (error) reject(error);
      else resolve(result ?? { stderr });
    };

    const consume = (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) onLine?.(line.replace(/\u001b\[[0-9;]*m/g, ""));
    };

    child.stdout?.on("data", consume);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4000);
      consume(chunk);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (context.canceled) {
        finish(new Error("Rendu annulé."));
        return;
      }
      if (code === 0) {
        finish(undefined, { stderr });
        return;
      }
      const detail = stderr.trim();
      finish(
        new Error(
          detail
            ? `Échec Remotion : ${detail.slice(-1200)}`
            : `Échec Remotion (code ${code ?? "inconnu"}).`
        )
      );
    });
  });
}

function updateProgress(job: RemotionJob, line: string): void {
  const rendered = /Rendered (\d+)\/(\d+)/.exec(line);
  if (rendered) {
    const done = Number(rendered[1]);
    const total = Number(rendered[2]);
    if (total > 0) job.progress = Math.min(95, 50 + Math.round((done / total) * 45));
    return;
  }
  const encoded = /Encoded (\d+)\/(\d+)/.exec(line);
  if (encoded) {
    const done = Number(encoded[1]);
    const total = Number(encoded[2]);
    if (total > 0) job.progress = Math.min(99, Math.max(job.progress, 95 + Math.round((done / total) * 4)));
  }
}

async function createPreview(
  job: RemotionJob,
  context: JobContext,
  draft: VideoScriptDraft
): Promise<void> {
  job.status = "preview";
  job.step = "Aperçu Remotion (image réelle)";
  job.progress = 24;
  await persist(job);

  const props: JarvisVideoProps = {
    title: draft.title,
    kicker: draft.kicker,
    accent: STYLES[job.style].accent,
    format: job.format,
    music: null,
    musicVolume: 0,
    scenes: buildPreviewScenes(draft, job.durationSec),
  };
  const propsPath = path.join(PROPS_ROOT, job.id, `preview-${job.format}.json`);
  await fs.writeFile(propsPath, JSON.stringify(props, null, 2), "utf8");

  const size = JARVIS_VIDEO_SIZES[job.format];
  const outputPath = path.join(OUTPUT_ROOT, job.id, "preview.png");
  await runCli({
    args: [
      "still",
      ENTRY_POINT,
      JARVIS_VIDEO_COMPOSITIONS[job.format],
      outputPath,
      `--props=${propsPath}`,
      "--frame=12",
      "--scale=0.5",
      "--log=error",
    ],
    context,
    timeoutMs: PREVIEW_TIMEOUT_MS,
    timeoutMessage: "Aperçu Remotion interrompu après 4 minutes.",
  });

  await fs.stat(outputPath);
  job.preview = {
    url: `/generated/remotion/${job.id}/preview.png`,
    width: size.width,
    height: size.height,
  };
  job.progress = 34;
  await persist(job);
}

async function createVoicedScenes(
  job: RemotionJob,
  draft: VideoScriptDraft
): Promise<JarvisVideoScene[]> {
  const audioDir = path.join(AUDIO_ROOT, job.id);
  await ensureDir(audioDir);
  const scenes: JarvisVideoScene[] = [];
  let voicesFailed = 0;
  let shortened = 0;
  const count = targetSceneCount(draft, job.durationSec);
  const perSceneSeconds = job.durationSec / count;
  const maxFrames = Math.round(perSceneSeconds * JARVIS_VIDEO_FPS);
  const maxNarrationChars = Math.max(50, Math.round(perSceneSeconds * 13));

  for (let index = 0; index < count; index += 1) {
    if (active && active.job.id === job.id && active.canceled) {
      throw new Error("Rendu annulé.");
    }
    const draftScene = draft.scenes[index];
    const narration =
      draftScene.narration.length > maxNarrationChars
        ? `${draftScene.narration.slice(0, maxNarrationChars).trimEnd()}…`
        : draftScene.narration;
    job.step = `Voix off ${index + 1}/${count}`;
    job.progress = 35 + Math.round((14 / count) * index);
    await persist(job);

    let audio: string | null = null;
    let frames = maxFrames;
    try {
      const prosody =
        STYLES[job.style].tone === "energique"
          ? { rate: "+8%", pitch: "+2Hz", volume: "+0%" }
          : STYLES[job.style].tone === "inspirant"
            ? { rate: "-4%", pitch: "-2Hz", volume: "+0%" }
            : { rate: "+0%", pitch: "+0Hz", volume: "+0%" };
      const buffer = await synthesizeSpeechBuffer(narration, prosody);
      const fileName = `scene-${String(index + 1).padStart(2, "0")}.mp3`;
      await fs.writeFile(path.join(audioDir, fileName), buffer);
      const speechSeconds = estimateSpeechDurationSeconds(buffer.length);
      const wantedFrames = Math.max(
        Math.round(2 * JARVIS_VIDEO_FPS),
        Math.round((speechSeconds + 0.5) * JARVIS_VIDEO_FPS)
      );
      frames = Math.min(maxFrames, wantedFrames);
      if (wantedFrames > maxFrames) shortened += 1;
      audio = `generated/remotion/${job.id}/${fileName}`;
    } catch {
      voicesFailed += 1;
    }

    scenes.push({
      id: `scene-${index + 1}`,
      kind: draftScene.kind,
      headline: draftScene.headline,
      subline: draftScene.subline,
      narration,
      audio,
      durationInFrames: frames,
      audioOffsetInFrames: 6,
    });
  }

  if (voicesFailed > 0) {
    const note = `Voix off indisponible pour ${voicesFailed}/${scenes.length} scène(s) : rendu assuré sans ces pistes audio.`;
    job.warning = job.warning ? `${job.warning} ${note}` : note;
  }
  if (shortened > 0) {
    const note = `${shortened} narration(s) raccourcie(s) pour respecter la durée cible de ${job.durationSec} s.`;
    job.warning = job.warning ? `${job.warning} ${note}` : note;
  }
  return scenes;
}

async function runJob(job: RemotionJob, input: StartRemotionInput): Promise<void> {
  const context: JobContext = { job, child: null, canceled: false };
  active = context;

  try {
    await Promise.all([
      ensureDir(path.join(OUTPUT_ROOT, job.id)),
      ensureDir(path.join(PROPS_ROOT, job.id)),
      ensureDir(AUDIO_ROOT),
    ]);

    job.status = "scripting";
    job.step = "Script Gemini";
    job.progress = 6;
    await persist(job);

    const draft = await generateVideoScript({
      sourceKind: "topic",
      topic: input.prompt,
      durationSec: input.durationSec,
      tone: STYLES[input.style].tone,
    });
    job.title = draft.title;
    job.sceneCount = draft.scenes.length;
    job.warning = draft.warning;
    await persist(job);

    if (context.canceled) throw new Error("Rendu annulé.");

    try {
      await createPreview(job, context, draft);
    } catch (error) {
      // L'aperçu est un plus, mais un échec ne doit pas empêcher le MP4 réel.
      const message = error instanceof Error ? error.message : "Aperçu indisponible.";
      job.warning = job.warning
        ? `${job.warning} Aperçu indisponible : ${message}`
        : `Aperçu indisponible : ${message}`;
      job.preview = null;
      await persist(job);
    }

    if (context.canceled) throw new Error("Rendu annulé.");

    const scenes = await createVoicedScenes(job, draft);
    job.status = "rendering";
    job.step = `Rendu ${job.format} (${JARVIS_VIDEO_SIZES[job.format].width}×${JARVIS_VIDEO_SIZES[job.format].height})`;
    job.progress = 50;
    await persist(job);

    const props: JarvisVideoProps = {
      title: draft.title,
      kicker: draft.kicker,
      accent: STYLES[job.style].accent,
      format: job.format,
      music: MUSIC_FILE,
      musicVolume: 0.08,
      scenes,
    };
    const propsPath = path.join(PROPS_ROOT, job.id, `video-${job.format}.json`);
    await fs.writeFile(propsPath, JSON.stringify(props, null, 2), "utf8");

    const fileName = `video-${job.format}.mp4`;
    const outputPath = path.join(OUTPUT_ROOT, job.id, fileName);
    await runCli({
      args: [
        "render",
        ENTRY_POINT,
        JARVIS_VIDEO_COMPOSITIONS[job.format],
        outputPath,
        `--props=${propsPath}`,
        "--concurrency=1",
        `--scale=${RENDER_SCALE}`,
        "--crf=20",
      ],
      context,
      timeoutMs: RENDER_TIMEOUT_MS,
      timeoutMessage: "Rendu Remotion interrompu après 20 minutes.",
      onLine: (line) => updateProgress(job, line),
    });

    const stats = await fs.stat(outputPath);
    const size = JARVIS_VIDEO_SIZES[job.format];
    job.status = "done";
    job.step = "Terminé";
    job.progress = 100;
    job.finishedAt = Date.now();
    job.result = {
      durationSec: Math.round(scenes.reduce((sum, s) => sum + s.durationInFrames, 0) / JARVIS_VIDEO_FPS),
      sceneCount: scenes.length,
      files: [
        {
          format: job.format,
          url: `/generated/remotion/${job.id}/${fileName}`,
          fileName,
          sizeBytes: stats.size,
          width: Math.round(size.width * RENDER_SCALE_NUMBER),
          height: Math.round(size.height * RENDER_SCALE_NUMBER),
        },
      ],
    };
    await persist(job);
  } catch (error) {
    const canceled = context.canceled;
    job.status = canceled ? "canceled" : "error";
    job.step = canceled ? "Annulé" : "Échec";
    job.error = canceled
      ? null
      : error instanceof Error
        ? error.message
        : "Rendu Remotion impossible.";
    job.finishedAt = Date.now();
    await persist(job);
  } finally {
    if (active === context) active = null;
  }
}

export async function createRemotionJob(
  input: StartRemotionInput
): Promise<RemotionJob | null> {
  await ensureLoaded();
  if (hasActiveRender()) return null;

  const normalized: StartRemotionInput = {
    prompt: String(input.prompt || "").trim().slice(0, 1200),
    format: normalizeFormat(input.format),
    durationSec: normalizeDuration(input.durationSec),
    style: normalizeStyle(input.style),
  };

  const job: RemotionJob = {
    id: `remotion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: "queued",
    step: "En file d'attente",
    progress: 0,
    prompt: normalized.prompt,
    format: normalized.format,
    durationSec: normalized.durationSec,
    style: normalized.style,
    tone: STYLES[normalized.style].tone,
    title: null,
    sceneCount: 0,
    warning: null,
    error: null,
    preview: null,
    result: null,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  await persist(job);
  // Non bloquant : le processus enfant vit hors du cycle de la requête HTTP.
  void runJob(job, normalized);
  return publicJob(job);
}

export async function cancelRemotionJob(id: string): Promise<"ok" | "not_running" | "not_found"> {
  await ensureLoaded();
  const job = jobs.get(id);
  if (!job) return "not_found";
  if (!isRunning(job.status) || !active || active.job.id !== id) return "not_running";
  active.canceled = true;
  active.child?.kill();
  job.status = "canceled";
  job.step = "Annulé";
  job.finishedAt = Date.now();
  await persist(job);
  return "ok";
}
