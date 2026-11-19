import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";

/**
 * Studio Reels - rendu Hyperframes cote serveur.
 *
 * Les projets Hyperframes sont des compositions HTML (hyperframes/<projet>/index.html).
 * La CLI rend une image par seconde en deplacement d'une timeline GSAP, puis encode un MP4
 * dans public/hyperframes, servi par Express (dev et prod).
 */

const PROJECTS_DIR = path.resolve(process.cwd(), "hyperframes");
const OUTPUT_DIR = path.resolve(process.cwd(), "public", "hyperframes");
const CLI_PATH = path.resolve(
  process.cwd(),
  "node_modules",
  "hyperframes",
  "bin",
  "hyperframes.mjs"
);
const RENDER_TIMEOUT_MS = 15 * 60 * 1000;

export interface HyperframesProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  entry: string;
}

export interface HyperframesItem {
  name: string;
  url: string;
  sizeBytes: number;
  updatedAt: string;
}

export type HyperframesRenderStatus = "idle" | "running" | "done" | "error";

interface RenderJob {
  id: string;
  status: HyperframesRenderStatus;
  progress: number;
  projectId: string | null;
  fileName: string | null;
  url: string | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

let currentJob: RenderJob | null = null;
let currentProcess: ChildProcess | null = null;

/**
 * Windows : le telechargement Chrome de Hyperframes peut etre bloque. On reuse alors
 * Edge (present sur la machine) ou Chrome deja installe, sauf si l'utilisateur a
 * explicitement defini HYPERFRAMES_BROWSER_PATH.
 */
function renderEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // La CLI Hyperframes a besoin de FFmpeg/FFprobe. Remotion embarque deja ces binaires :
  // on les reutilise pour eviter une installation systeme supplementaire.
  if (!env.HYPERFRAMES_FFMPEG_PATH) {
    const ffmpeg = fullFfmpegBinary() ?? bundledFfBinary("ffmpeg");
    if (ffmpeg) env.HYPERFRAMES_FFMPEG_PATH = ffmpeg;
  }
  if (!env.HYPERFRAMES_FFPROBE_PATH) {
    const ffprobe = bundledFfBinary("ffprobe");
    if (ffprobe) env.HYPERFRAMES_FFPROBE_PATH = ffprobe;
  }

  if (env.HYPERFRAMES_BROWSER_PATH) return env;
  if (process.platform !== "win32") return env;
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) env.HYPERFRAMES_BROWSER_PATH = found;
  return env;
}

/**
 * Hyperframes utilise des filtres (notamment `setparams`) absents du FFmpeg reduit de
 * Remotion. Le paquet ffmpeg-static fournit un binaire complet et est utilise en priorite.
 */
function fullFfmpegBinary(): string | null {
  const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidate = path.resolve(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    executable
  );
  return existsSync(candidate) ? candidate : null;
}

/** Binaires FFmpeg/FFprobe fournis par le compositor Remotion installe. */
function bundledFfBinary(name: "ffmpeg" | "ffprobe"): string | null {
  const remotionDir = path.resolve(process.cwd(), "node_modules", "@remotion");
  try {
    const dirs = readdirSync(remotionDir);
    const executable = process.platform === "win32" ? `${name}.exe` : name;
    for (const dir of dirs.filter((entry) => entry.startsWith("compositor-"))) {
      const candidate = path.join(remotionDir, dir, executable);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Remotion n'est pas installe : la CLI utilisera les binaires du PATH.
  }
  return null;
}

async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function numericAttribute(html: string, attribute: string, fallback: number): number {
  const match = new RegExp(`${attribute}="([\\d.]+)"`).exec(html);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function listProjects(): Promise<HyperframesProject[]> {
  let entries;
  try {
    entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry): Promise<HyperframesProject | null> => {
        const dir = path.join(PROJECTS_DIR, entry.name);
        const entryFile = path.join(dir, "index.html");
        if (!existsSync(entryFile)) return null;
        const html = await fs.readFile(entryFile, "utf8");

        let name = entry.name;
        try {
          const meta = JSON.parse(
            await fs.readFile(path.join(dir, "meta.json"), "utf8")
          ) as { name?: string };
          if (typeof meta.name === "string" && meta.name.trim()) name = meta.name.trim();
        } catch {
          // meta.json est optionnel.
        }

        return {
          id: entry.name,
          name,
          width: numericAttribute(html, "data-width", 1080),
          height: numericAttribute(html, "data-height", 1920),
          fps: numericAttribute(html, "data-fps", 30),
          durationSec: numericAttribute(html, "data-duration", 10),
          entry: "index.html",
        };
      })
  );

  return projects
    .filter((project): project is HyperframesProject => project !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function listRenders(): Promise<HyperframesItem[]> {
  await ensureOutputDir();
  const entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
      .map(async (entry) => {
        const stats = await fs.stat(path.join(OUTPUT_DIR, entry.name));
        return {
          name: entry.name,
          url: `/hyperframes/${encodeURIComponent(entry.name)}`,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString(),
        } satisfies HyperframesItem;
      })
  );
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function updateJobFromLine(job: RenderJob, line: string): void {
  // Hyperframes affiche des compteurs du type "samples 4/9", "frame 128/300"...
  const progress = /(\d+)\s*\/\s*(\d+)/.exec(line);
  if (!progress) return;
  const done = Number(progress[1]);
  const total = Number(progress[2]);
  if (total > 0) job.progress = Math.max(job.progress, Math.min(95, Math.round((done / total) * 95)));
}

function startRender(project: HyperframesProject): RenderJob {
  const id = `hf-render-${Date.now()}`;
  const fileName = `${project.id}-${Date.now()}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, fileName);
  const projectDir = path.join(PROJECTS_DIR, project.id);

  const job: RenderJob = {
    id,
    status: "running",
    progress: 0,
    projectId: project.id,
    fileName,
    url: null,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };

  const child = spawn(
    process.execPath,
    [
      CLI_PATH,
      "render",
      projectDir,
      "-o",
      outputPath,
      "--workers=1",
      "--no-wait",
    ],
    { cwd: process.cwd(), env: renderEnvironment(), windowsHide: true }
  );
  currentProcess = child;

  const timeout = setTimeout(() => {
    child.kill();
    job.status = "error";
    job.error = "Rendu Hyperframes interrompu apres 15 minutes.";
    job.finishedAt = Date.now();
  }, RENDER_TIMEOUT_MS);

  let buffer = "";
  let stderr = "";

  const consume = (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      updateJobFromLine(job, line.replace(/\u001b\[[0-9;]*m/g, ""));
    }
  };

  child.stdout?.on("data", consume);
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString("utf8")}`.slice(-2000);
    consume(chunk);
  });

  child.on("error", (error) => {
    clearTimeout(timeout);
    job.status = "error";
    job.error = error.message;
    job.finishedAt = Date.now();
    currentProcess = null;
  });

  child.on("close", (code) => {
    clearTimeout(timeout);
    currentProcess = null;
    if (code === 0) {
      job.status = "done";
      job.progress = 100;
      job.url = `/hyperframes/${encodeURIComponent(fileName)}`;
    } else if (job.status !== "error") {
      job.status = "error";
      job.error =
        stderr.replace(/\u001b\[[0-9;]*m/g, "").trim() ||
        `Le rendu Hyperframes a echoue (code ${code ?? "inconnu"}).`;
    }
    job.finishedAt = Date.now();
  });

  return job;
}

export function createHyperframesRouter(): Router {
  const router = Router();

  router.get("/hyperframes", async (_req: Request, res: Response) => {
    try {
      const [renders, projects] = await Promise.all([listRenders(), listProjects()]);
      res.json({
        renders,
        projects,
        job: currentJob ? { ...currentJob } : null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Lecture des projets Hyperframes impossible.",
      });
    }
  });

  router.get("/hyperframes/render", (_req: Request, res: Response) => {
    res.json({ job: currentJob ? { ...currentJob } : null });
  });

  router.post("/hyperframes/render", async (req: Request, res: Response) => {
    if (currentJob?.status === "running") {
      res.status(409).json({
        error: "Un rendu Hyperframes est deja en cours.",
        job: { ...currentJob },
      });
      return;
    }
    await ensureOutputDir();
    const projectId =
      typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
    const projects = await listProjects();
    const project =
      projects.find((item) => item.id === projectId) ?? projects[0] ?? null;
    if (!project) {
      res.status(404).json({ error: "Aucun projet Hyperframes trouve dans hyperframes/." });
      return;
    }
    try {
      currentJob = startRender(project);
      res.status(202).json({ job: { ...currentJob } });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Demarrage du rendu impossible.",
      });
    }
  });

  router.delete("/hyperframes/render", (_req: Request, res: Response) => {
    if (!currentProcess) {
      res.status(409).json({ error: "Aucun rendu Hyperframes en cours." });
      return;
    }
    currentProcess.kill();
    currentProcess = null;
    if (currentJob) {
      currentJob.status = "idle";
      currentJob.progress = 0;
      currentJob.error = null;
      currentJob.finishedAt = Date.now();
    }
    res.json({ ok: true });
  });

  return router;
}
