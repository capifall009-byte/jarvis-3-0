import type {
  StoredFileItem,
  VideoCapabilities,
  VideoCreationResult,
  VideoScene,
} from "../../types/jarvis";

export async function fetchVideoCapabilities(): Promise<VideoCapabilities> {
  const res = await fetch("/api/video/capabilities");
  if (!res.ok) {
    return {
      ffmpegAvailable: false,
      ffmpegVersion: null,
      ttsVoice: "fr-FR-HenriNeural",
    };
  }
  return (await res.json()) as VideoCapabilities;
}

export async function analyzeVideoFile(
  file: StoredFileItem,
  question?: string
): Promise<string> {
  const res = await fetch("/api/video/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.mimeType,
      base64Data: file.base64Data,
      question,
    }),
  });
  const data = (await res.json()) as { analysis?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Erreur d'analyse vidéo (${res.status}).`);
  }
  return data.analysis || "Analyse terminée.";
}

export async function createLocalVideoProject(params: {
  title: string;
  topic: string;
  durationSec: number;
  prepareOnlyForWasm?: boolean;
  scenes?: VideoScene[];
  images: StoredFileItem[];
}): Promise<VideoCreationResult> {
  const res = await fetch("/api/video/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      topic: params.topic,
      durationSec: params.durationSec,
      prepareOnlyForWasm: Boolean(params.prepareOnlyForWasm),
      scenes: params.scenes,
      images: params.images
        .filter((img) => img.kind === "image" && img.base64Data)
        .map((img) => ({
          name: img.name,
          mimeType: img.mimeType,
          base64Data: img.base64Data,
        })),
    }),
  });
  const data = (await res.json()) as VideoCreationResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Erreur de préparation vidéo (${res.status}).`);
  }
  return data;
}
