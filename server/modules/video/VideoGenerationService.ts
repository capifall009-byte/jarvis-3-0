import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getVideoProvider, listVideoProviders } from "./providers/ProviderRegistry.ts";
import { buildStoryboard } from "./StoryboardService.ts";
import {
  createWorkDir,
  setAiVideoJob,
  type AiVideoJob,
} from "./VideoHistoryRepository.ts";
// local mirror of the client request shape (kept loose to avoid cross-boundary imports)
export interface VideoGenerationRequest {
  mode: "text" | "image" | "story";
  prompt: string;
  story?: string;
  imageBase64?: string;
  imageMimeType?: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: string;
  cameraMotion: string;
  transitions: boolean;
  ambiance: string;
  voiceover: boolean;
  characters: string;
  scenes?: Array<Record<string, unknown>>;
}

export interface GenerationResult {
  id: string;
  provider: string;
  storyboard: Array<Record<string, unknown>>;
  videoUrl: string | null;
  notes: string;
}

export async function runVideoGeneration(
  req: VideoGenerationRequest,
  providerId?: string
): Promise<GenerationResult> {
  // 1. Storyboard (Gemini) — réel
  let storyboard: Array<Record<string, unknown>> = [];
  if (Array.isArray(req.scenes) && req.scenes.length > 0) {
    storyboard = req.scenes as unknown as Array<Record<string, unknown>>;
  } else {
    const built = await buildStoryboard({
      mode: req.mode,
      prompt: req.prompt,
      story: req.story,
      durationSec: req.durationSec,
      aspectRatio: req.aspectRatio,
      style: req.style,
      cameraMotion: req.cameraMotion,
      characters: req.characters,
      voiceover: req.voiceover,
    });
    storyboard = built.map((s, i) => ({
      id: `scene-${i + 1}`,
      index: i,
      title: s.title,
      narration: s.narration,
      visualDescription: s.visualDescription,
      imagePrompt: s.imagePrompt,
      cameraMotion: s.cameraMotion,
      durationSec: s.durationSec,
      transition: s.transition,
    }));
  }

  // 2. Provider
  const provider = providerId
    ? getVideoProvider(providerId)
    : listVideoProviders().find((p) => p.isConfigured()) ?? getVideoProvider("huggingface");

  if (!provider) {
    throw new Error("Aucun fournisseur vidéo disponible.");
  }
  if (!provider.isConfigured()) {
    throw new Error(
      `Le fournisseur "${provider.name}" n'est pas configuré. Variables requises : ${provider.requires.join(", ")}.`
    );
  }

  const scenePrompts = storyboard
    .map((s) => String(s.imagePrompt || s.visualDescription || s.title || ""))
    .filter(Boolean)
    .join(". ");
  const fullPrompt = `${req.prompt}. ${scenePrompts}`.trim();

  const output = await provider.generate({
    prompt: fullPrompt,
    imageBase64: req.imageBase64,
    imageMimeType: req.imageMimeType,
    durationSec: req.durationSec,
    aspectRatio: req.aspectRatio,
    style: req.style,
  });

  // 3. Sauvegarde fichier temporaire + enregistrement historique
  const id = crypto.randomUUID();
  const workDir = createWorkDir(id);
  await fs.mkdir(workDir, { recursive: true });
  const fileName = `output.${output.extension}`;
  const filePath = path.join(workDir, fileName);
  await fs.writeFile(filePath, output.buffer);

  const job: AiVideoJob = {
    id,
    title: req.prompt.slice(0, 60) || "Vidéo IA",
    provider: provider.id,
    mode: req.mode,
    filePath,
    mimeType: output.mimeType,
    storyboard,
    createdAt: Date.now(),
    workDir,
  };
  setAiVideoJob(job);

  const notes =
    provider.id === "huggingface"
      ? "Clip généré par le fournisseur Hugging Face. Durée/qualité dépendent du modèle et du quota."
      : "";

  return {
    id,
    provider: provider.id,
    storyboard,
    videoUrl: `/api/video/ai/output/${id}`,
    notes,
  };
}