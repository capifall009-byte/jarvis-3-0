/**
 * Client du service Remotion isolé.
 * Toutes les URLs sont relatives : Vite (dev) et Express (prod) les servent.
 */

export type RemotionFormat = "vertical" | "horizontal" | "square";
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

export interface RemotionFormatInfo {
  id: RemotionFormat;
  width: number;
  height: number;
  composition: string;
}

export interface RemotionStatus {
  engine: string;
  remotion: {
    installed: boolean;
    version: string | null;
    entryPoint: string;
    renderScale: string;
  };
  formats: RemotionFormatInfo[];
  styles: Array<{ id: RemotionStyle; label: string }>;
  geminiConfigured: boolean;
  musicAvailable: boolean;
  concurrentRenders: number;
  hyperframes: {
    installed: boolean;
    documented: boolean;
    validated: boolean;
    note: string;
  };
  activeRender: boolean;
}

export interface RemotionPreview {
  url: string;
  width: number;
  height: number;
}

export interface RemotionFile {
  format: RemotionFormat;
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
  format: RemotionFormat;
  durationSec: number;
  style: RemotionStyle;
  tone: string;
  title: string | null;
  sceneCount: number;
  warning: string | null;
  error: string | null;
  preview: RemotionPreview | null;
  result: {
    durationSec: number;
    sceneCount: number;
    files: RemotionFile[];
  } | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface StartRemotionJobInput {
  prompt: string;
  format: RemotionFormat;
  durationSec: number;
  style: RemotionStyle;
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return {} as T & { error?: string };
  }
}

export function isRemotionJobRunning(job: RemotionJob | null): boolean {
  return (
    !!job &&
    (job.status === "queued" ||
      job.status === "scripting" ||
      job.status === "preview" ||
      job.status === "voicing" ||
      job.status === "rendering")
  );
}

export async function getRemotionStatus(): Promise<RemotionStatus> {
  const res = await fetch("/api/remotion/status");
  const data = await readJson<RemotionStatus>(res);
  if (!res.ok) {
    throw new Error(data.error || `Statut Remotion indisponible (${res.status}).`);
  }
  return data;
}

export async function listRemotionJobs(): Promise<RemotionJob[]> {
  const res = await fetch("/api/remotion/jobs");
  const data = await readJson<{ jobs: RemotionJob[] }>(res);
  if (!res.ok) throw new Error(data.error || `Liste des rendus impossible (${res.status}).`);
  return data.jobs ?? [];
}

export async function getRemotionJob(id: string): Promise<RemotionJob> {
  const res = await fetch(`/api/remotion/jobs/${encodeURIComponent(id)}`);
  const data = await readJson<{ job: RemotionJob }>(res);
  if (!res.ok || !data.job) {
    throw new Error(data.error || `Statut du rendu indisponible (${res.status}).`);
  }
  return data.job;
}

export async function startRemotionJob(input: StartRemotionJobInput): Promise<RemotionJob> {
  const res = await fetch("/api/remotion/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<{ job: RemotionJob }>(res);
  if (!res.ok || !data.job) {
    throw new Error(data.error || `Lancement du rendu impossible (${res.status}).`);
  }
  return data.job;
}

export async function cancelRemotionJob(id: string): Promise<void> {
  const res = await fetch(`/api/remotion/jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await readJson<{ ok?: boolean }>(res);
  if (!res.ok) throw new Error(data.error || `Annulation impossible (${res.status}).`);
}
