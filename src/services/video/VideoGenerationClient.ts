import type {
  StoryboardScene,
  VideoAspectRatio,
  VideoCameraMotion,
  VideoGenerationMode,
  VideoGenerationResult,
  VideoProviderInfo,
  VideoStyle,
} from "../../types/jarvis";

export async function fetchVideoProviders(): Promise<VideoProviderInfo[]> {
  const res = await fetch("/api/video/ai/providers");
  const data = (await res.json()) as { providers?: VideoProviderInfo[] };
  if (!res.ok) throw new Error("Impossible de récupérer les fournisseurs vidéo.");
  return Array.isArray(data.providers) ? data.providers : [];
}

export async function generateStoryboard(params: {
  mode: VideoGenerationMode;
  prompt: string;
  story?: string;
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  style: VideoStyle;
  cameraMotion: VideoCameraMotion;
  characters: string;
  voiceover: boolean;
}): Promise<StoryboardScene[]> {
  const res = await fetch("/api/video/ai/storyboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { scenes?: StoryboardScene[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Échec du storyboard.");
  return Array.isArray(data.scenes) ? data.scenes : [];
}

export async function generateAiVideo(params: {
  mode: VideoGenerationMode;
  prompt: string;
  story?: string;
  imageBase64?: string;
  imageMimeType?: string;
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  style: VideoStyle;
  cameraMotion: VideoCameraMotion;
  transitions: boolean;
  ambiance: string;
  voiceover: boolean;
  characters: string;
  scenes?: StoryboardScene[];
  providerId?: string;
}): Promise<VideoGenerationResult> {
  const res = await fetch("/api/video/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  // Le serveur renvoie GenerationResult (id, provider, storyboard, videoUrl, notes).
  // On complète le contrat client de façon déterministe afin que l'historique n'affiche
  // ni titre ni date indéfinis, sans modifier le contrat serveur existant.
  const data = (await res.json()) as Partial<VideoGenerationResult> & { error?: string };
  if (!res.ok) throw new Error(data.error || "Échec de la génération vidéo.");
  const storyboard = Array.isArray(data.storyboard) ? data.storyboard : [];
  return {
    id: data.id || `ai-video-${Date.now()}`,
    mode: data.mode || params.mode,
    title: data.title || params.prompt.slice(0, 60) || "Vidéo IA",
    provider: data.provider || "",
    status: data.status || "done",
    ...(data.videoUrl ? { videoUrl: data.videoUrl } : {}),
    storyboard,
    createdAt: data.createdAt || Date.now(),
    ...(data.error ? { error: data.error } : {}),
    ...(data.notes ? { notes: data.notes } : {}),
  };
}

export async function listAiVideoHistory(): Promise<
  Array<{ id: string; title: string; provider: string; mode: string; videoUrl: string; createdAt: number; hasVideo: boolean }>
> {
  const res = await fetch("/api/video/ai/history");
  const data = (await res.json()) as { items?: any[] };
  if (!res.ok) return [];
  return Array.isArray(data.items) ? data.items : [];
}