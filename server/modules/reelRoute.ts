import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";

/**
 * Studio Reels - rendu Remotion cote serveur.
 *
 * Les MP4 rendus sont ecrits dans public/reels et servis par Vite (dev) ou Express (prod).
 * Un seul rendu a la fois : le rendu Remotion est gourmand en CPU.
 */

const REELS_DIR = path.resolve(process.cwd(), "public", "reels");
const ENTRY_POINT = "remotion/index.ts";
const RENDER_TIMEOUT_MS = 15 * 60 * 1000;

export interface ReelComposition {
  id: string;
  label: string;
  slug: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

/** Compositions Remotion rendables depuis le Studio. */
const COMPOSITIONS: ReelComposition[] = [
  {
    id: "InstagramReel",
    label: "Reel Instagram",
    slug: "reel",
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: 19,
  },
  {
    id: "DernierSignal",
    label: "Le Dernier Signal (48 s)",
    slug: "dernier-signal",
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: 48,
  },
  {
    id: "JourUn",
    label: "JOUR 1 · Ne réponds pas (48 s)",
    slug: "jour-1",
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: 48,
  },
  {
    id: "Horror",
    label: "JOUR 1 · Le couloir — horreur (48 s)",
    slug: "horreur-couloir",
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: 48,
  },
];

const DEFAULT_COMPOSITION_ID = COMPOSITIONS[0].id;

function findComposition(id: string | undefined): ReelComposition {
  return (
    COMPOSITIONS.find((composition) => composition.id === id) ??
    COMPOSITIONS.find((composition) => composition.id === DEFAULT_COMPOSITION_ID)!
  );
}

export interface ReelItem {
  name: string;
  url: string;
  sizeBytes: number;
  updatedAt: string;
}

export type ReelRenderStatus = "idle" | "running" | "done" | "error";

interface RenderJob {
  id: string;
  status: ReelRenderStatus;
  progress: number;
  fileName: string | null;
  url: string | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

let currentJob: RenderJob | null = null;
let currentProcess: ChildProcess | null = null;

function remotionCliPath(): string {
  return path.resolve(
    process.cwd(),
    "node_modules",
    "@remotion",
    "cli",
    "remotion-cli.js"
  );
}

async function ensureReelsDir(): Promise<void> {
  await fs.mkdir(REELS_DIR, { recursive: true });
}

async function listReelFiles(): Promise<ReelItem[]> {
  await ensureReelsDir();
  const entries = await fs.readdir(REELS_DIR, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
      .map(async (entry) => {
        const stats = await fs.stat(path.join(REELS_DIR, entry.name));
        return {
          name: entry.name,
          url: `/reels/${encodeURIComponent(entry.name)}`,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString(),
        } satisfies ReelItem;
      })
  );
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function publicJob(job: RenderJob): RenderJob {
  return { ...job };
}

function updateJobFromLine(job: RenderJob, line: string): void {
  const rendered = /Rendered (\d+)\/(\d+)/.exec(line);
  if (rendered) {
    const done = Number(rendered[1]);
    const total = Number(rendered[2]);
    if (total > 0) job.progress = Math.min(95, Math.round((done / total) * 95));
    return;
  }
  const encoded = /Encoded (\d+)\/(\d+)/.exec(line);
  if (encoded) {
    const done = Number(encoded[1]);
    const total = Number(encoded[2]);
    if (total > 0)
      job.progress = Math.max(job.progress, 95 + Math.round((done / total) * 4));
  }
}

function startRender(composition: ReelComposition): RenderJob {
  const id = `render-${Date.now()}`;
  const fileName = `${composition.slug}-${Date.now()}.mp4`;
  const outputPath = path.join(REELS_DIR, fileName);

  const job: RenderJob = {
    id,
    status: "running",
    progress: 0,
    fileName,
    url: null,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };

  const child = spawn(
    process.execPath,
    [remotionCliPath(), "render", ENTRY_POINT, composition.id, outputPath],
    { cwd: process.cwd(), env: process.env, windowsHide: true }
  );
  currentProcess = child;

  const timeout = setTimeout(() => {
    child.kill();
    job.status = "error";
    job.error = "Rendu interrompu apres 15 minutes.";
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
      job.url = `/reels/${encodeURIComponent(fileName)}`;
    } else if (job.status !== "error") {
      job.status = "error";
      job.error =
        stderr.replace(/\u001b\[[0-9;]*m/g, "").trim() ||
        `Le rendu a echoue (code ${code ?? "inconnu"}).`;
    }
    job.finishedAt = Date.now();
  });

  return job;
}

export function createReelRouter(): Router {
  const router = Router();

  router.get("/reels", async (_req: Request, res: Response) => {
    try {
      const reels = await listReelFiles();
      res.json({
        reels,
        compositions: COMPOSITIONS,
        composition: COMPOSITIONS[0],
        job: currentJob ? publicJob(currentJob) : null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Lecture des Reels impossible.",
      });
    }
  });

  router.get("/reels/render", (_req: Request, res: Response) => {
    res.json({ job: currentJob ? publicJob(currentJob) : null });
  });

  router.post("/reels/render", async (req: Request, res: Response) => {
    if (currentJob?.status === "running") {
      res.status(409).json({
        error: "Un rendu est deja en cours.",
        job: publicJob(currentJob),
      });
      return;
    }
    await ensureReelsDir();
    const compositionId =
      typeof req.body?.compositionId === "string" ? req.body.compositionId : undefined;
    try {
      currentJob = startRender(findComposition(compositionId));
      res.status(202).json({ job: publicJob(currentJob) });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Demarrage du rendu impossible.",
      });
    }
  });

  router.delete("/reels/render", (_req: Request, res: Response) => {
    if (!currentProcess) {
      res.status(409).json({ error: "Aucun rendu en cours." });
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
