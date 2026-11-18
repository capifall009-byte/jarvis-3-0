import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface AiVideoJob {
  id: string;
  title: string;
  provider: string;
  mode: string;
  filePath?: string;
  mimeType?: string;
  storyboard: unknown[];
  createdAt: number;
  workDir: string;
}

const jobs = new Map<string, AiVideoJob>();

export function getAiVideoJob(id: string): AiVideoJob | null {
  return jobs.get(id) ?? null;
}

export function setAiVideoJob(job: AiVideoJob): void {
  jobs.set(job.id, job);
  pruneOldJobs();
}

export function listAiVideoJobs(): AiVideoJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function pruneOldJobs() {
  if (jobs.size <= 16) return;
  const entries = Array.from(jobs.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (entries.length > 16) {
    const oldest = entries.shift();
    if (!oldest) break;
    jobs.delete(oldest[0]);
    void fs.rm(oldest[1].workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function createWorkDir(id: string): string {
  return path.join(os.tmpdir(), "jarvis-ai-video", id);
}