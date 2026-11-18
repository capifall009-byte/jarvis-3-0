import type { CameraMotionType, VideoScene } from "../../types/jarvis";

export interface OrchestratedScene {
  index: number;
  title: string;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  searchKeywords: string;
  cameraMove: CameraMotionType;
  cameraInstruction: string;
  durationSec: number;
  startTimeSec: number;
  endTimeSec: number;
}

export interface OrchestrateNarrativeOptions {
  targetDurationSec?: number;
  sceneCount?: number;
  language?: "fr" | "en";
  visualStyle?: string;
  customSystemPrompt?: string;
}

export interface OrchestrateNarrativeResult {
  scenes: OrchestratedScene[];
  videoScenes: VideoScene[];
  totalDurationSec: number;
  model: string;
  systemPrompt: string;
  createdAt: number;
}

export const VIDEO_ORCHESTRATOR_SYSTEM_PROMPT = [
  "Tu es un réalisateur, scénariste visuel et monteur vidéo expert pour JARVIS.",
  "On te confie un texte narratif long ou structuré.",
  "Analyse sa progression logique (introduction, développement thématique, transitions, conclusion) et découpe-le en scènes visuelles distinctes et cohérentes.",
  "Pour chaque scène, produis obligatoirement :",
  "- title : titre bref identifiant l'idée clé de la scène (3 à 6 mots).",
  "- visualDescription : description visuelle précise et cinématographique (sujet principal, environnement, lumière, palette de couleurs, cadrage).",
  "- imagePrompt : prompt descriptif détaillé en anglais au format 16:9 sans aucun texte incrusté ('no text, no words, no watermark').",
  "- searchKeywords : 2 à 3 mots-clés simples en anglais pour illustrer la scène.",
  "- cameraMotion : un mouvement parmi 'zoom_in', 'zoom_out', 'pan_right', 'pan_left' (varie les mouvements d'une scène à l'autre).",
  "- cameraInstruction : consigne de mouvement caméra explicite et motivée par la narration.",
  "- narration : segment exact ou fidèlement adapté du texte narratif correspondant à la scène.",
  "- durationSec : durée logique en secondes calculée selon la longueur de la narration (~2,2 à 2,5 mots/s, minimum 2,5s).",
].join("\n");

export function buildVideoDirectorSystemPrompt(
  options?: OrchestrateNarrativeOptions
): string {
  if (options?.customSystemPrompt?.trim()) {
    return options.customSystemPrompt.trim();
  }

  const lines = [VIDEO_ORCHESTRATOR_SYSTEM_PROMPT];
  if (options?.visualStyle?.trim()) {
    lines.push(
      `Direction artistique imposée : ${options.visualStyle.trim()}.`
    );
  }
  if (options?.language === "en") {
    lines.push(
      "Rédige les titres, descriptions visuelles, consignes caméra et narrations en anglais naturel."
    );
  } else {
    lines.push(
      "Rédige les titres, descriptions visuelles, consignes caméra et narrations en français naturel (tout en gardant imagePrompt et searchKeywords en anglais)."
    );
  }
  return lines.join("\n");
}

function normalizeCameraMove(raw: string | undefined, idx: number): CameraMotionType {
  const valid: CameraMotionType[] = [
    "zoom_in",
    "pan_right",
    "zoom_out",
    "pan_left",
  ];
  if (raw && valid.includes(raw as CameraMotionType)) {
    return raw as CameraMotionType;
  }
  return valid[idx % valid.length];
}

function buildDefaultCameraInstruction(move: CameraMotionType): string {
  switch (move) {
    case "zoom_out":
      return "Zoom arrière progressif pour révéler l'ampleur du décor.";
    case "pan_right":
      return "Panoramique horizontal fluide vers la droite.";
    case "pan_left":
      return "Panoramique horizontal fluide vers la gauche.";
    case "zoom_in":
    default:
      return "Travelling avant lent centré sur le sujet principal.";
  }
}

export function toVideoScenes(scenes: OrchestratedScene[]): VideoScene[] {
  return scenes.map((scene) => ({
    index: scene.index,
    title: scene.title,
    durationSec: scene.durationSec,
    startTimeSec: scene.startTimeSec,
    endTimeSec: scene.endTimeSec,
    narration: scene.narration,
    visualCue: scene.visualDescription,
    imagePrompt: scene.imagePrompt,
    searchKeywords: scene.searchKeywords,
    cameraMotion: scene.cameraMove,
    cameraInstruction: scene.cameraInstruction,
  }));
}

/**
 * Breaks a long-form narrative text into distinct logical scenes using a Gemini
 * director system prompt (executed server-side via /api/video/orchestrate),
 * returning structured visual descriptions, camera move instructions, and timing durations.
 */
export async function orchestrateNarrativeToScenes(
  narrativeText: string,
  options: OrchestrateNarrativeOptions = {}
): Promise<OrchestrateNarrativeResult> {
  const cleanedText = narrativeText.trim();
  if (!cleanedText) {
    throw new Error(
      "Veuillez fournir un texte narratif à découper en scènes."
    );
  }

  const systemPrompt = buildVideoDirectorSystemPrompt(options);

  const response = await fetch("/api/video/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      narrativeText: cleanedText,
      targetDurationSec: options.targetDurationSec,
      sceneCount: options.sceneCount,
      systemPrompt,
    }),
  });

  const payload = (await response.json()) as {
    scenes?: VideoScene[];
    totalDurationSec?: number;
    model?: string;
    createdAt?: number;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error ||
        `Erreur d'orchestration vidéo Gemini (${response.status}).`
    );
  }

  const rawScenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  if (rawScenes.length === 0) {
    throw new Error(
      "Le découpage Gemini n'a retourné aucune scène exploitable."
    );
  }

  let cursor = 0;
  const scenes: OrchestratedScene[] = rawScenes.map((item, idx) => {
    const durationSec = Math.max(2, Number(item.durationSec) || 5);
    const startTimeSec =
      typeof item.startTimeSec === "number"
        ? Number(item.startTimeSec.toFixed(2))
        : Number(cursor.toFixed(2));
    const endTimeSec =
      typeof item.endTimeSec === "number"
        ? Number(item.endTimeSec.toFixed(2))
        : Number((startTimeSec + durationSec).toFixed(2));
    cursor = endTimeSec;

    const cameraMove = normalizeCameraMove(item.cameraMotion, idx);

    return {
      index: idx + 1,
      title: item.title?.trim() || `Scène ${idx + 1}`,
      narration: item.narration?.trim() || "",
      visualDescription: item.visualCue?.trim() || "",
      imagePrompt: item.imagePrompt?.trim() || "",
      searchKeywords: item.searchKeywords?.trim() || "cinematic scene",
      cameraMove,
      cameraInstruction:
        item.cameraInstruction?.trim() ||
        buildDefaultCameraInstruction(cameraMove),
      durationSec: Number(durationSec.toFixed(2)),
      startTimeSec,
      endTimeSec,
    };
  });

  return {
    scenes,
    videoScenes: toVideoScenes(scenes),
    totalDurationSec: Number(
      (payload.totalDurationSec || cursor).toFixed(2)
    ),
    model: payload.model || "gemini-3.1-flash-lite",
    systemPrompt,
    createdAt: payload.createdAt || Date.now(),
  };
}
