export interface HyperframesItem {
  name: string;
  url: string;
  sizeBytes: number;
  updatedAt: string;
}

export type HyperframesRenderStatus = "idle" | "running" | "done" | "error";

export interface HyperframesRenderJob {
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

export interface HyperframesProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  entry: string;
}

export interface HyperframesLibrary {
  renders: HyperframesItem[];
  projects: HyperframesProject[];
  job: HyperframesRenderJob | null;
}

export async function listHyperframes(): Promise<HyperframesLibrary> {
  const res = await fetch("/api/hyperframes");
  const data = (await res.json()) as HyperframesLibrary & { error?: string };
  if (!res.ok) {
    throw new Error(
      data.error || `Chargement des projets Hyperframes impossible (${res.status}).`
    );
  }
  return {
    renders: data.renders ?? [],
    projects: data.projects ?? [],
    job: data.job ?? null,
  };
}

export async function startHyperframesRender(
  projectId?: string
): Promise<HyperframesRenderJob> {
  const res = await fetch("/api/hyperframes/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  const data = (await res.json()) as { job?: HyperframesRenderJob; error?: string };
  if (res.status === 409 && data.job) return data.job;
  if (!res.ok || !data.job) {
    throw new Error(data.error || `Rendu Hyperframes impossible (${res.status}).`);
  }
  return data.job;
}

export async function getHyperframesRenderJob(): Promise<HyperframesRenderJob | null> {
  const res = await fetch("/api/hyperframes/render");
  const data = (await res.json()) as { job?: HyperframesRenderJob | null; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Statut du rendu indisponible (${res.status}).`);
  }
  return data.job ?? null;
}

export async function cancelHyperframesRender(): Promise<void> {
  const res = await fetch("/api/hyperframes/render", { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || `Annulation impossible (${res.status}).`);
  }
}
