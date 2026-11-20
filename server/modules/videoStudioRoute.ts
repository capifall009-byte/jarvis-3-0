import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import {
  JARVIS_VIDEO_COMPOSITIONS,
  JARVIS_VIDEO_FPS,
  type JarvisVideoFormat,
  type JarvisVideoProps,
  type JarvisVideoScene,
} from "../../remotion/video/types.ts";
import { estimateSpeechDurationSeconds, synthesizeSpeechBuffer } from "./ttsSynth.ts";
import {
  generateVideoScript,
  type VideoScriptRequest,
  type VideoSourceKind,
  type VideoTone,
} from "./videoScriptService.ts";

/**
 * Générateur vidéo JARVIS.
 *
 * Pipeline : source (sujet / texte / URL) → script Gemini → voix off HenriNeural →
 * composition Remotion JarvisVideo → MP4 vertical et/ou horizontal.
 *
 * Un seul rendu à la fois : Remotion sature le CPU.
 */

const GENERATED_ROOT = path.resolve(process.cwd(), "public", "generated");
const AUDIO_ROOT = path.resolve(process.cwd(), "remotion", "public", "generated");
const PROPS_ROOT = path.resolve(process.cwd(), "server", ".data", "video-studio");

/** Phase 9.5 : identifiant de job strictement alphanumérique (généré localement). */
const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class InvalidJobIdError extends Error {
  readonly code = "INVALID_JOB_ID";
  constructor() {
    super("Identifiant de job vidéo invalide.");
  }
}

/** Refuse absolus, `..`, séparateurs, NUL, encodages et tout caractère inattendu. */
export function validateJobId(value: unknown): string {
  const id = String(value ?? "");
  // La regex interdit séparateurs, NUL, espaces et encodages divers.
  // `path.isAbsolute()` écarte explicitement les chemins absolus.
  if (!JOB_ID_PATTERN.test(id) || path.isAbsolute(id) || id.includes("/") || id.includes("\\")) {
    throw new InvalidJobIdError();
  }
  return id;
}

function isStrictlyInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Résout un chemin de suppression avec défense en profondeur :
 * validateur d'ID, containment lexical, realpath (liens symboliques inclus),
 * vérification du type de ressource. Retourne null si la cible n'existe pas.
 */
export async function resolveSafeJobPath(root: string, value: unknown): Promise<string | null> {
  const id = validateJobId(value);
  const candidate = path.resolve(root, id);
  if (!isStrictlyInside(root, candidate)) throw new InvalidJobIdError();

  const realRoot = await fs.realpath(root).catch(() => null);
  const realRootStat = realRoot ? await fs.stat(realRoot).catch(() => null) : null;
  if (!realRoot || !realRootStat?.isDirectory()) throw new InvalidJobIdError();

  const linkCheck = await fs.lstat(candidate).catch(() => null);
  if (!linkCheck) return null;
  if (linkCheck.isSymbolicLink() || (!linkCheck.isDirectory() && !linkCheck.isFile())) {
    throw new InvalidJobIdError();
  }

  const realCandidate = await fs.realpath(candidate).catch(() => null);
  if (!realCandidate || !isStrictlyInside(realRoot, realCandidate)) throw new InvalidJobIdError();
  const stat = await fs.stat(realCandidate);
  if (!stat.isDirectory() && !stat.isFile()) throw new InvalidJobIdError();
  return realCandidate;
}
const ENTRY_POINT = "remotion/index.ts";
const RENDER_TIMEOUT_MS = 20 * 60 * 1000;

const MAX_TOPIC_CHARS = 500;
const MAX_TEXT_CHARS = 8000;
const MAX_URL_CHARS = 2000;
const MIN_DURATION_SEC = 30;
const MAX_DURATION_SEC = 120;
const DEFAULT_DURATION_SEC = 75;
/** Tolérance autour de la cible avant de retirer des scènes. */
const MAX_TOTAL_SEC = 100;
const MIN_TOTAL_SEC = 45;

export type VideoStudioStatus =
  | "queued"
  | "scripting"
  | "voicing"
  | "rendering"
  | "done"
  | "error"
  | "canceled";

export interface VideoStudioFile {
  format: JarvisVideoFormat;
  url: string;
  fileName: string;
  sizeBytes: number;
}

export interface VideoStudioResult {
  durationSec: number;
  sceneCount: number;
  files: VideoStudioFile[];
}

export interface VideoStudioJob {
  id: string;
  status: VideoStudioStatus;
  step: string;
  progress: number;
  formats: JarvisVideoFormat[];
  durationTargetSec: number;
  tone: VideoTone;
  sourceKind: VideoSourceKind;
  title: string | null;
  sceneCount: number;
  warning: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  result: VideoStudioResult | null;
}

interface RenderContext {
  job: VideoStudioJob;
  child: ChildProcess | null;
  canceled: boolean;
}

const jobs = new Map<string, VideoStudioJob>();
let activeRender: RenderContext | null = null;

const TONES: VideoTone[] = ["pedagogique", "energique", "inspirant"];

function isRunning(job: VideoStudioJob | null): boolean {
  return (
    !!job &&
    (job.status === "queued" ||
      job.status === "scripting" ||
      job.status === "voicing" ||
      job.status === "rendering")
  );
}

function publicJob(job: VideoStudioJob): VideoStudioJob {
  return JSON.parse(JSON.stringify(job)) as VideoStudioJob;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function persist(job: VideoStudioJob): Promise<void> {
  try {
    const dir = path.join(GENERATED_ROOT, job.id);
    await ensureDir(dir);
    await fs.writeFile(
      path.join(dir, "job.json"),
      JSON.stringify(job, null, 2),
      "utf8"
    );
  } catch (error) {
    console.warn("[video-studio] Persistance du job impossible :", error);
  }
}

async function readPersistedJobs(): Promise<VideoStudioJob[]> {
  try {
    const entries = await fs.readdir(GENERATED_ROOT, { withFileTypes: true });
    const result: VideoStudioJob[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await fs.readFile(
          path.join(GENERATED_ROOT, entry.name, "job.json"),
          "utf8"
        );
        const parsed = JSON.parse(raw) as VideoStudioJob;
        if (parsed && typeof parsed.id === "string") {
          // Un job interrompu par un redémarrage ne doit pas paraître actif.
          if (isRunning(parsed)) {
            parsed.status = "error";
            parsed.step = "Interrompu par un redémarrage du serveur";
            parsed.error = "Rendu interrompu par un redémarrage du serveur.";
            parsed.finishedAt = Date.now();
          }
          result.push(parsed);
        }
      } catch {
        // Dossier sans job.json : ignoré.
      }
    }
    return result;
  } catch {
    return [];
  }
}

async function listJobs(): Promise<VideoStudioJob[]> {
  const persisted = await readPersistedJobs();
  const merged = new Map<string, VideoStudioJob>();
  for (const job of persisted) merged.set(job.id, job);
  for (const job of jobs.values()) merged.set(job.id, job);
  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function normalizeFormatInput(value: unknown): JarvisVideoFormat[] {
  if (value === "both") return ["vertical", "horizontal"];
  if (value === "horizontal") return ["horizontal"];
  return ["vertical"];
}

function normalizeSourceKind(
  body: Record<string, unknown>
): { kind: VideoSourceKind; topic: string; text: string; url: string } {
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, MAX_TOPIC_CHARS) : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  const url = typeof body.url === "string" ? body.url.trim().slice(0, MAX_URL_CHARS) : "";

  const declared = body.sourceKind;
  if (declared === "url" && url) return { kind: "url", topic, text, url };
  if (declared === "text" && text) return { kind: "text", topic, text, url };
  if (declared === "topic" && topic) return { kind: "topic", topic, text, url };

  if (url) return { kind: "url", topic, text, url };
  if (text) return { kind: "text", topic, text, url };
  return { kind: "topic", topic, text, url };
}

function toneProsody(tone: VideoTone): { rate: string; pitch: string; volume: string } {
  if (tone === "energique") return { rate: "+8%", pitch: "+2Hz", volume: "+0%" };
  if (tone === "inspirant") return { rate: "-4%", pitch: "-2Hz", volume: "+0%" };
  return { rate: "+0%", pitch: "+0Hz", volume: "+0%" };
}

/** Retire des scènes du milieu si le script dépasse largement la cible. */
function trimScenes(scenes: JarvisVideoScene[]): JarvisVideoScene[] {
  const totalSeconds = () =>
    scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0) / JARVIS_VIDEO_FPS;

  while (scenes.length > 3 && totalSeconds() > MAX_TOTAL_SEC) {
    // On retire l'avant-dernière scène pour préserver l'accroche et le CTA.
    scenes.splice(scenes.length - 2, 1);
  }
  return scenes;
}

function updateRenderProgress(
  job: VideoStudioJob,
  line: string,
  formatIndex: number
): void {
  const cleaned = line.replace(/\u001b\[[0-9;]*m/g, "");
  const rendered = /Rendered (\d+)\/(\d+)/.exec(cleaned);
  if (!rendered) return;
  const done = Number(rendered[1]);
  const total = Number(rendered[2]);
  if (!total) return;
  const ratio = Math.min(1, done / total);
  const formatCount = Math.max(1, job.formats.length);
  // Progression globale du rendu : 50 % → 95 %.
  const base = 50 + Math.round((45 / formatCount) * formatIndex);
  const span = 45 / formatCount;
  job.progress = Math.min(95, base + Math.round(span * ratio));
}

function renderFormat(
  context: RenderContext,
  format: JarvisVideoFormat,
  propsPath: string,
  outputPath: string,
  formatIndex: number
): Promise<void> {
  const { job } = context;
  const compositionId = JARVIS_VIDEO_COMPOSITIONS[format];
  job.step = `Rendu ${format === "vertical" ? "9:16" : "16:9"} (${formatIndex + 1}/${job.formats.length})`;
  job.progress = Math.max(job.progress, 50 + Math.round((45 / job.formats.length) * formatIndex));

  return new Promise((resolve, reject) => {
    const cliPath = path.resolve(
      process.cwd(),
      "node_modules",
      "@remotion",
      "cli",
      "remotion-cli.js"
    );

    const child = spawn(
      process.execPath,
      [
        cliPath,
        "render",
        ENTRY_POINT,
        compositionId,
        outputPath,
        `--props=${propsPath}`,
        // Render free tier : 1 CPU / 512 Mo. Un seul onglet Chrome, échelle
        // réduite et tas Node étendu pour éviter l'OOM (540×960 → 270×480).
        "--concurrency=1",
        "--scale=0.25",
        "--crf=20",
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
        env: {
          ...process.env,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=384`.trim(),
        },
      }
    );

    context.child = child;
    let stdoutBuffer = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("Rendu interrompu après 20 minutes."));
    }, RENDER_TIMEOUT_MS);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      context.child = null;
      if (error) reject(error);
      else resolve();
    };

    const consume = (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) updateRenderProgress(job, line, formatIndex);
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
        finish();
        return;
      }
      const detail = stderr.replace(/\u001b\[[0-9;]*m/g, "").trim();
      finish(
        new Error(
          detail
            ? `Échec du rendu Remotion : ${detail.slice(-1600)}`
            : `Échec du rendu Remotion (code ${code ?? "inconnu"}).`
        )
      );
    });
  });
}

async function runJob(job: VideoStudioJob, request: VideoScriptRequest): Promise<void> {
  const audioDir = path.join(AUDIO_ROOT, job.id);
  const outputDir = path.join(GENERATED_ROOT, job.id);
  const propsDir = path.join(PROPS_ROOT, job.id);
  const context: RenderContext =
    activeRender && activeRender.job.id === job.id
      ? activeRender
      : { job, child: null, canceled: false };
  activeRender = context;

  try {
    await Promise.all([ensureDir(audioDir), ensureDir(outputDir), ensureDir(propsDir)]);

    job.status = "scripting";
    job.step = "Écriture du script (Gemini)";
    job.progress = 5;
    await persist(job);

    const script = await generateVideoScript(request);
    job.title = script.title;
    job.sceneCount = script.scenes.length;
    job.warning = script.warning;
    await persist(job);

    job.status = "voicing";
    const scenes: JarvisVideoScene[] = [];
    const prosody = toneProsody(request.tone);

    for (let index = 0; index < script.scenes.length; index += 1) {
      if (context.canceled) {
        throw new Error("Rendu annulé.");
      }
      const draft = script.scenes[index];
      job.step = `Voix off ${index + 1}/${script.scenes.length}`;
      job.progress = 10 + Math.round((35 / script.scenes.length) * index);
      await persist(job);

      const buffer = await synthesizeSpeechBuffer(draft.narration, prosody);
      const fileName = `scene-${String(index + 1).padStart(2, "0")}.mp3`;
      await fs.writeFile(path.join(audioDir, fileName), buffer);

      const speechSeconds = estimateSpeechDurationSeconds(buffer.length);
      const frames = Math.max(
        Math.round(2.6 * JARVIS_VIDEO_FPS),
        Math.round((speechSeconds + 0.7) * JARVIS_VIDEO_FPS)
      );

      scenes.push({
        id: `scene-${index + 1}`,
        kind: draft.kind,
        headline: draft.headline,
        subline: draft.subline,
        narration: draft.narration,
        audio: `generated/${job.id}/${fileName}`,
        durationInFrames: frames,
        audioOffsetInFrames: 6,
      });
    }

    const trimmed = trimScenes(scenes);
    const durationSec =
      trimmed.reduce((sum, scene) => sum + scene.durationInFrames, 0) / JARVIS_VIDEO_FPS;
    job.sceneCount = trimmed.length;

    if (durationSec < MIN_TOTAL_SEC) {
      job.warning = job.warning
        ? `${job.warning} Vidéo courte (${Math.round(durationSec)} s).`
        : `Vidéo courte : ${Math.round(durationSec)} s de voix off.`;
    }

    job.status = "rendering";
    job.progress = 50;
    await persist(job);

    const files: VideoStudioFile[] = [];

    for (let index = 0; index < job.formats.length; index += 1) {
      const format = job.formats[index];
      const props: JarvisVideoProps = {
        title: script.title,
        kicker: script.kicker,
        accent: script.accent,
        format,
        music: "reel/audio/music.mp3",
        musicVolume: 0.08,
        scenes: trimmed,
      };

      const propsPath = path.join(propsDir, `props-${format}.json`);
      await fs.writeFile(propsPath, JSON.stringify(props, null, 2), "utf8");

      const fileName = `video-${format}.mp4`;
      const outputPath = path.join(outputDir, fileName);
      await renderFormat(context, format, propsPath, outputPath, index);

      const stats = await fs.stat(outputPath);
      files.push({
        format,
        url: `/generated/${job.id}/${fileName}`,
        fileName,
        sizeBytes: stats.size,
      });

      job.progress = Math.min(95, 50 + Math.round((45 / job.formats.length) * (index + 1)));
      await persist(job);
    }

    job.status = "done";
    job.progress = 100;
    job.step = "Terminé";
    job.finishedAt = Date.now();
    job.result = {
      durationSec: Math.round(durationSec),
      sceneCount: trimmed.length,
      files,
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
        : "Génération vidéo impossible.";
    job.finishedAt = Date.now();
    await persist(job);
  } finally {
    if (activeRender?.job.id === job.id) {
      activeRender = null;
    }
  }
}

export function createVideoStudioRouter(): Router {
  const router = Router();

  router.get("/video-studio/jobs", async (_req: Request, res: Response) => {
    try {
      const list = await listJobs();
      res.json({ jobs: list.map(publicJob) });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Lecture des vidéos impossible.",
      });
    }
  });

  router.get("/video-studio/jobs/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id ?? "");
    const job = jobs.get(id);
    if (job) {
      res.json({ job: publicJob(job) });
      return;
    }
    const persisted = (await listJobs()).find((entry) => entry.id === id);
    if (!persisted) {
      res.status(404).json({ error: "Vidéo introuvable." });
      return;
    }
    res.json({ job: persisted });
  });

  router.post("/video-studio/generate", async (req: Request, res: Response) => {
    const running = [...jobs.values()].find((job) => isRunning(job));
    if (running) {
      res.status(409).json({
        error: "Une génération est déjà en cours.",
        job: publicJob(running),
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const source = normalizeSourceKind(body);

    if (source.kind === "topic" && source.topic.length < 3) {
      res.status(400).json({ error: "Indique un sujet (3 caractères minimum)." });
      return;
    }
    if (source.kind === "text" && source.text.length < 40) {
      res.status(400).json({ error: "Le texte est trop court (40 caractères minimum)." });
      return;
    }
    if (source.kind === "url" && !/^https?:\/\//i.test(source.url)) {
      res.status(400).json({ error: "URL invalide (http ou https attendu)." });
      return;
    }

    const requestedDuration = Number(body.durationSec);
    const durationSec = Number.isFinite(requestedDuration)
      ? Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(requestedDuration)))
      : DEFAULT_DURATION_SEC;

    const tone = TONES.includes(body.tone as VideoTone)
      ? (body.tone as VideoTone)
      : "pedagogique";

    const formats = normalizeFormatInput(body.formats);
    const id = `video-${Date.now().toString(36)}`;

    const job: VideoStudioJob = {
      id,
      status: "queued",
      step: "En file d'attente",
      progress: 0,
      formats,
      durationTargetSec: durationSec,
      tone,
      sourceKind: source.kind,
      title: null,
      sceneCount: 0,
      warning: null,
      error: null,
      createdAt: Date.now(),
      finishedAt: null,
      result: null,
    };

    jobs.set(id, job);
    activeRender = { job, child: null, canceled: false };

    const request: VideoScriptRequest = {
      sourceKind: source.kind,
      topic: source.topic,
      text: source.text,
      url: source.url,
      durationSec,
      tone,
    };

    res.status(202).json({ job: publicJob(job) });

    void runJob(job, request);
  });

  router.delete("/video-studio/jobs/:id", async (req: Request, res: Response) => {
    let id: string;
    try {
      id = validateJobId(req.params.id);
    } catch {
      res.status(400).json({ ok: false, code: "INVALID_JOB_ID", error: "Identifiant de job vidéo invalide." });
      return;
    }
    const job = jobs.get(id);

    if (job && isRunning(job)) {
      if (activeRender?.job.id === id) {
        activeRender.canceled = true;
        activeRender.child?.kill();
      }
      job.status = "canceled";
      job.step = "Annulé";
      job.finishedAt = Date.now();
      await persist(job);
      res.json({ ok: true, job: publicJob(job) });
      return;
    }

    try {
      // Toutes les cibles sont résolues et validées AVANT la première suppression.
      const targets = await Promise.all([
        resolveSafeJobPath(GENERATED_ROOT, id),
        resolveSafeJobPath(AUDIO_ROOT, id),
        resolveSafeJobPath(PROPS_ROOT, id),
      ]);
      for (const target of targets) {
        if (target) await fs.rm(target, { recursive: true, force: false });
      }
      jobs.delete(id);
      res.json({ ok: true });
    } catch {
      res.status(400).json({ ok: false, code: "INVALID_JOB_ID", error: "Chemin de suppression refusé." });
    }
  });

  return router;
}
