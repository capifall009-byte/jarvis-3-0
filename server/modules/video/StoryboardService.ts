import { ThinkingLevel, Type } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import {
  JARVIS_GEMINI_FALLBACK_MODEL,
  JARVIS_GEMINI_MODEL,
  classifyGeminiError,
  getGeminiClient,
  isGeminiConfigured,
} from "../../geminiClient.ts";

export interface StoryboardInput {
  mode: "text" | "image" | "story";
  prompt: string;
  story?: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: string;
  cameraMotion: string;
  characters: string;
  voiceover: boolean;
}

export interface StoryboardSceneOut {
  title: string;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  cameraMotion: string;
  durationSec: number;
  transition?: string;
}

function buildStoryboardPrompt(input: StoryboardInput): string {
  const sceneCount = Math.max(2, Math.min(8, Math.round(input.durationSec / 4)));
  return [
    "Tu es un réalisateur et scénariste visuel expert pour JARVIS.",
    `Mode de création : ${input.mode}.`,
    `Style visuel imposé : ${input.style}.`,
    `Format : ${input.aspectRatio}.`,
    `Durée totale visée : ${input.durationSec} secondes.`,
    `Mouvement de caméra préféré : ${input.cameraMotion}.`,
    input.characters ? `Personnages à conserver cohérents : ${input.characters}.` : "",
    input.voiceover
      ? "Inclure une narration/voix off par scène."
      : "Pas de voix off ; descriptions visuelles uniquement.",
    "",
    "SUJET / PROMPT :",
    input.prompt,
    input.story ? `\nHISTOIRE :\n${input.story}` : "",
    "",
    `Découpe en ${sceneCount} scènes cohérentes. Pour chaque scène fournis :`,
    "- title (3-6 mots)",
    "- narration (texte de voix off, court)",
    "- visualDescription (description cinématographique précise)",
    "- imagePrompt (prompt détaillé en anglais, sans texte incrusté)",
    "- cameraMotion (parmi static, zoom_in, zoom_out, pan_right, pan_left, orbit)",
    "- durationSec (nombre)",
    "- transition (fade/wipe/cut)",
    "",
    "Maintiens la cohérence visuelle des personnages et décors entre les scènes.",
    "Réponds UNIQUEMENT en JSON valide selon le schéma fourni.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildStoryboard(
  input: StoryboardInput
): Promise<StoryboardSceneOut[]> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY non configurée côté serveur.");
  }

  const ai = getGeminiClient();
  const prompt = buildStoryboardPrompt(input);

  const config = {
    systemInstruction:
      "Tu es un scénariste vidéo expert. Tu réponds uniquement en JSON valide.",
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          narration: { type: Type.STRING },
          visualDescription: { type: Type.STRING },
          imagePrompt: { type: Type.STRING },
          cameraMotion: { type: Type.STRING },
          durationSec: { type: Type.NUMBER },
          transition: { type: Type.STRING },
        },
        required: [
          "title",
          "narration",
          "visualDescription",
          "imagePrompt",
          "cameraMotion",
          "durationSec",
        ],
      },
    },
  };

  let response: GenerateContentResponse;
  try {
    response = await ai.models.generateContent({
      model: JARVIS_GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config,
    });
  } catch (primaryErr) {
    const classified = classifyGeminiError(primaryErr);
    if (classified.status === 503 || classified.status === 404) {
      response = await ai.models.generateContent({
        model: JARVIS_GEMINI_FALLBACK_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
    } else {
      throw classified;
    }
  }

  const raw = response.text?.trim() || "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Réponse storyboard non JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Storyboard invalide.");
  }

  return parsed.map((s: any, idx: number) => ({
    title: String(s.title || `Scène ${idx + 1}`),
    narration: String(s.narration || ""),
    visualDescription: String(s.visualDescription || ""),
    imagePrompt: String(s.imagePrompt || ""),
    cameraMotion: String(s.cameraMotion || "static"),
    durationSec: Number.isFinite(s.durationSec) ? Number(s.durationSec) : 4,
    transition: s.transition ? String(s.transition) : "fade",
  }));
}