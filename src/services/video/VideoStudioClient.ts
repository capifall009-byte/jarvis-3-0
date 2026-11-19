/**
 * Client du générateur vidéo JARVIS (script Gemini + voix off + rendu Remotion).
 */

export type VideoStudioFormat = "vertical" | "horizontal";
export type VideoStudioSourceKind = "topic" | "text" | "url";
export type VideoStudioTone = "pedagogique" | "energique" | "inspirant";

export type VideoStudioStatus =
  | "queued"
  | "scripting"
  | "voicing"
  | "rendering"
  | "done"
  | "error"
  | "canceled";

export interface VideoStudioFile {
  format: VideoStudioFormat;
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
  formats: VideoStudioFormat[];
  durationTargetSec: number;
  tone: VideoStudioTone;
  sourceKind: VideoStudioSourceKind;
  title: string | null;
  sceneCount: number;
  warning: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  result: VideoStudioResult | null;
}

export interface StartVideoInput {
  sourceKind: VideoStudioSourceKind;
  topic?: string;
  text?: string;
  url?: string;
  formats: "vertical" | "horizontal" | "both";
  durationSec: number;
  tone: VideoStudioTone;
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return {} as T & { error?: string };
  }
}

export function isJobRunning(job: VideoStudioJob | null): boolean {
  return (
    !!job &&
    (job.status === "queued" ||
      job.status === "scripting" ||
      job.status === "voicing" ||
      job.status === "rendering")
  );
}

export async function listVideoJobs(): Promise<VideoStudioJob[]> {
  const res = await fetch("/api/video-studio/jobs");
  const data = await readJson<{ jobs: VideoStudioJob[] }>(res);
  if (!res.ok) {
    throw new Error(data.error || `Chargement des vidéos impossible (${res.status}).`);
  }
  return data.jobs ?? [];
}

export async function getVideoJob(id: string): Promise<VideoStudioJob> {
  const res = await fetch(`/api/video-studio/jobs/${encodeURIComponent(id)}`);
  const data = await readJson<{ job: VideoStudioJob }>(res);
  if (!res.ok || !data.job) {
    throw new Error(data.error || `Statut de la vidéo indisponible (${res.status}).`);
  }
  return data.job;
}

export async function startVideoGeneration(
  input: StartVideoInput
): Promise<VideoStudioJob> {
  const res = await fetch("/api/video-studio/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<{ job: VideoStudioJob }>(res);
  if (res.status === 409 && data.job) return data.job;
  if (!res.ok || !data.job) {
    throw new Error(data.error || `Génération impossible (${res.status}).`);
  }
  return data.job;
}

export async function cancelVideoJob(id: string): Promise<void> {
  const res = await fetch(`/api/video-studio/jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await readJson<{ ok?: boolean }>(res);
  if (!res.ok) {
    throw new Error(data.error || `Annulation impossible (${res.status}).`);
  }
}

export async function deleteVideoJob(id: string): Promise<void> {
  const res = await fetch(`/api/video-studio/jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await readJson<{ ok?: boolean }>(res);
  if (!res.ok) {
    throw new Error(data.error || `Suppression impossible (${res.status}).`);
  }
}
