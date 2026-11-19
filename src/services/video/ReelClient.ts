export interface ReelItem {
  name: string;
  url: string;
  sizeBytes: number;
  updatedAt: string;
}

export type ReelRenderStatus = "idle" | "running" | "done" | "error";

export interface ReelRenderJob {
  id: string;
  status: ReelRenderStatus;
  progress: number;
  fileName: string | null;
  url: string | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface ReelComposition {
  id: string;
  label: string;
  slug: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

export interface ReelLibrary {
  reels: ReelItem[];
  compositions: ReelComposition[];
  job: ReelRenderJob | null;
}

export const DEFAULT_STORY_COMPOSITION: ReelComposition = {
  id: "DernierSignal",
  label: "Le Dernier Signal (48 s)",
  slug: "dernier-signal",
  width: 1080,
  height: 1920,
  fps: 30,
  durationSec: 48,
};

export const DEFAULT_SERIAL_COMPOSITION: ReelComposition = {
  id: "JourUn",
  label: "JOUR 1 · Ne réponds pas (48 s)",
  slug: "jour-1",
  width: 1080,
  height: 1920,
  fps: 30,
  durationSec: 48,
};

export const DEFAULT_HORROR_COMPOSITION: ReelComposition = {
  id: "Horror",
  label: "JOUR 1 · Le couloir — horreur (48 s)",
  slug: "horreur-couloir",
  width: 1080,
  height: 1920,
  fps: 30,
  durationSec: 48,
};

export async function listReels(): Promise<ReelLibrary> {
  const res = await fetch("/api/reels");
  const data = (await res.json()) as ReelLibrary & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Chargement des Reels impossible (${res.status}).`);
  }
  return {
    reels: data.reels ?? [],
    compositions: data.compositions ?? [],
    job: data.job ?? null,
  };
}

export async function startReelRender(compositionId?: string): Promise<ReelRenderJob> {
  const res = await fetch("/api/reels/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compositionId }),
  });
  const data = (await res.json()) as { job?: ReelRenderJob; error?: string };
  if (res.status === 409 && data.job) return data.job;
  if (!res.ok || !data.job) {
    throw new Error(data.error || `Rendu impossible (${res.status}).`);
  }
  return data.job;
}

export async function getReelRenderJob(): Promise<ReelRenderJob | null> {
  const res = await fetch("/api/reels/render");
  const data = (await res.json()) as { job?: ReelRenderJob | null; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Statut du rendu indisponible (${res.status}).`);
  }
  return data.job ?? null;
}

export async function cancelReelRender(): Promise<void> {
  const res = await fetch("/api/reels/render", { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || `Annulation impossible (${res.status}).`);
  }
}
