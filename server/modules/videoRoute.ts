import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ThinkingLevel, Type } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import { Router } from "express";
import type { Request, Response } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import {
  JARVIS_GEMINI_FALLBACK_MODEL,
  JARVIS_GEMINI_MODEL,
  classifyGeminiError,
  getGeminiClient,
  isGeminiConfigured,
} from "../geminiClient.ts";

const execFileAsync = promisify(execFile);

type CameraMotionType = "zoom_in" | "zoom_out" | "pan_right" | "pan_left";
type VisualSourceType =
  | "user_image"
  | "pollinations_ai"
  | "wikimedia_commons"
  | "local_holo_render";

interface VideoCapability {
  ffmpegAvailable: boolean;
  ffmpegVersion: string | null;
  ttsVoice: string;
}

interface VideoScene {
  index: number;
  title?: string;
  durationSec: number;
  startTimeSec?: number;
  endTimeSec?: number;
  narration: string;
  visualCue: string;
  imagePrompt?: string;
  searchKeywords?: string;
  cameraMotion?: CameraMotionType;
  cameraInstruction?: string;
  visualSource?: VisualSourceType;
  previewUrl?: string;
}

interface VideoValidationInfo {
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  width: number;
  height: number;
  durationSec: number;
  audioDurationSec?: number;
  frameCount: number;
  nonBlackVerified: boolean;
  meanLuma: number;
}

interface CreateVideoBody {
  title?: string;
  topic?: string;
  durationSec?: number;
  prepareOnlyForWasm?: boolean;
  scenes?: VideoScene[];
  images?: Array<{ name: string; mimeType: string; base64Data: string }>;
}

const CAMERA_MOTIONS: CameraMotionType[] = [
  "zoom_in",
  "pan_right",
  "zoom_out",
  "pan_left",
];

const XFADE_TRANSITIONS = ["fade", "wipeleft", "slideright", "circleopen"];

const renderedVideos = new Map<
  string,
  {
    filePath?: string;
    audioPath: string;
    workDir: string;
    title: string;
    createdAt: number;
  }
>();

function pruneOldJobs() {
  if (renderedVideos.size <= 16) return;
  const entries = Array.from(renderedVideos.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt
  );
  while (entries.length > 16) {
    const oldest = entries.shift();
    if (!oldest) break;
    renderedVideos.delete(oldest[0]);
    void fs.rm(oldest[1].workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function detectFfmpeg(): Promise<VideoCapability> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], {
      timeout: 3000,
    });
    const firstLine = stdout.split("\n")[0]?.trim() || "ffmpeg";
    return {
      ffmpegAvailable: true,
      ffmpegVersion: firstLine,
      ttsVoice: "fr-FR-HenriNeural",
    };
  } catch {
    return {
      ffmpegAvailable: false,
      ffmpegVersion: null,
      ttsVoice: "fr-FR-HenriNeural",
    };
  }
}

function formatSrtTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe % 1) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

function buildSrtFromScenes(scenes: VideoScene[]): string {
  let cursor = 0;
  return scenes
    .map((scene, idx) => {
      const start = formatSrtTime(cursor);
      cursor += scene.durationSec;
      const end = formatSrtTime(cursor);
      return `${idx + 1}\n${start} --> ${end}\n${scene.narration}\n`;
    })
    .join("\n");
}

function buildFallbackScenes(
  topic: string,
  durationSec: number,
  targetCount: number
): VideoScene[] {
  const sentences = topic
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const count = Math.max(3, Math.min(5, targetCount));
  const perScene = Math.max(4, Math.round(durationSec / count));
  const scenes: VideoScene[] = [];

  for (let i = 0; i < count; i++) {
    const idx = i + 1;
    const baseSentence = sentences[i % Math.max(1, sentences.length)] || topic;
    let title = `Séquence ${idx}`;
    let narration = baseSentence;
    let visualCue = `Illustration cinématique de : ${baseSentence}`;
    let imagePrompt = `Cinematic widescreen illustration representing ${topic}, scene ${idx}, dramatic atmospheric lighting, rich colors, ultra detailed photography, no text, no watermark`;
    let searchKeywords = `${topic} illustration`;

    if (i === 0 && sentences.length <= 1) {
      title = "Ouverture & Contexte";
      visualCue = `Vue d'ensemble immersive introduisant le thème : ${topic}`;
      narration = `Explorons ensemble un sujet fascinant : ${topic}.`;
      imagePrompt = `Epic wide establishing shot introducing ${topic}, golden hour dramatic lighting, vivid natural colors, photorealistic, 16:9, no text`;
    } else if (i === count - 1 && sentences.length <= 1) {
      title = "Synthèse & Perspectives";
      visualCue = `Plan final symbolisant l'impact et l'avenir autour de : ${topic}`;
      narration = `En conclusion, ces éléments montrent toute l'importance de ${topic}.`;
      imagePrompt = `Inspiring futuristic horizon view related to ${topic}, luminous glowing atmosphere, rich detail, cinematic photography, no text`;
    } else if (sentences.length <= 1) {
      title = `Analyse — Point ${i}`;
      visualCue = `Gros plan détaillé illustrant les mécanismes clés de ${topic}`;
      narration = `Au cœur de ce phénomène, chaque détail révèle une organisation précise et captivante.`;
      imagePrompt = `Detailed macro close-up photography showing the inner details of ${topic}, crisp studio lighting, vibrant contrast, no text`;
    }

    scenes.push({
      index: idx,
      title,
      durationSec: perScene,
      visualCue,
      imagePrompt,
      searchKeywords,
      narration,
      cameraMotion: CAMERA_MOTIONS[i % CAMERA_MOTIONS.length],
    });
  }

  return scenes;
}

const DEFAULT_ORCHESTRATOR_SYSTEM_PROMPT = [
  "Tu es un réalisateur et monteur vidéo expert pour l'assistant JARVIS.",
  "Ta mission est de découper un texte narratif (court ou long) en scènes logiques, visuelles et rythmées.",
  "Pour chaque scène, tu dois fournir :",
  "1) Un titre court et évocateur.",
  "2) Une description visuelle précise de la scène (sujet, décor, lumière, composition, atmosphère).",
  "3) Un prompt d'image détaillé en anglais au format 16:9 ('no text, no words, no watermark').",
  "4) Des mots-clés simples en anglais pour la recherche photo de secours.",
  "5) Une instruction de mouvement caméra ('cameraMotion' parmi zoom_in, zoom_out, pan_right, pan_left) et sa direction cinématique ('cameraInstruction').",
  "6) La narration exacte et fluide de cette scène, fidèle au texte source.",
  "7) Une durée réaliste ('durationSec') adaptée au débit oral (~2,3 mots par seconde) dont la somme correspond à la durée cible.",
].join("\n");

function defaultCameraInstruction(motion: CameraMotionType): string {
  switch (motion) {
    case "zoom_out":
      return "Zoom arrière progressif révélant l'ensemble de la scène.";
    case "pan_right":
      return "Panoramique fluide de gauche à droite.";
    case "pan_left":
      return "Panoramique fluide de droite à gauche.";
    case "zoom_in":
    default:
      return "Zoom avant lent centré sur le sujet principal.";
  }
}

async function orchestrateNarrativeWithGemini(params: {
  narrativeText: string;
  targetDurationSec?: number;
  sceneCount?: number;
  systemPrompt?: string;
}): Promise<{ scenes: VideoScene[]; totalDurationSec: number; model: string }> {
  const ai = getGeminiClient();
  const textLen = params.narrativeText.trim().length;
  const wordCount = params.narrativeText.trim().split(/\s+/).length;

  const estimatedDuration =
    params.targetDurationSec && params.targetDurationSec >= 8
      ? Math.min(180, Math.round(params.targetDurationSec))
      : Math.min(180, Math.max(12, Math.round(wordCount / 2.2)));

  const requestedCount =
    params.sceneCount && params.sceneCount >= 2
      ? Math.min(8, Math.round(params.sceneCount))
      : textLen > 600
      ? Math.min(8, Math.max(4, Math.round(estimatedDuration / 8)))
      : estimatedDuration <= 16
      ? 3
      : estimatedDuration <= 28
      ? 4
      : 5;

  const avgSec = Math.max(3, Math.round(estimatedDuration / requestedCount));
  const systemInstruction =
    params.systemPrompt?.trim() || DEFAULT_ORCHESTRATOR_SYSTEM_PROMPT;

  const userPrompt = [
    `Découpe le texte narratif suivant en exactement ${requestedCount} scènes logiques distinctes (durée totale cible ~${estimatedDuration} secondes, soit ~${avgSec}s par scène) :`,
    "",
    params.narrativeText.trim(),
  ].join("\n");

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: "Titre court de la scène (3 à 6 mots).",
        },
        visualDescription: {
          type: Type.STRING,
          description:
            "Description visuelle concrète de la scène (sujet, décor, éclairage, ambiance).",
        },
        imagePrompt: {
          type: Type.STRING,
          description:
            "Detailed English 16:9 visual prompt for image generation ending with 'no text, no words, no watermark'.",
        },
        searchKeywords: {
          type: Type.STRING,
          description:
            "2 or 3 clean English keywords for stock photo search fallback.",
        },
        cameraMotion: {
          type: Type.STRING,
          description:
            "Exact camera move token: zoom_in, zoom_out, pan_right, or pan_left.",
        },
        cameraInstruction: {
          type: Type.STRING,
          description:
            "Consigne précise de mouvement de caméra pour cette scène.",
        },
        narration: {
          type: Type.STRING,
          description:
            "Segment narratif exact et fluide destiné à la synthèse vocale de cette scène.",
        },
        durationSec: {
          type: Type.NUMBER,
          description: "Durée recommandée de cette scène en secondes (min 2.5).",
        },
      },
      required: [
        "title",
        "visualDescription",
        "imagePrompt",
        "searchKeywords",
        "cameraMotion",
        "cameraInstruction",
        "narration",
        "durationSec",
      ],
    },
  };

  let activeModel = JARVIS_GEMINI_MODEL;
  let response: GenerateContentResponse;

  try {
    response = await ai.models.generateContent({
      model: JARVIS_GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
  } catch (primaryErr) {
    const classified = classifyGeminiError(primaryErr);
    if (classified.status === 503 || classified.status === 404) {
      activeModel = JARVIS_GEMINI_FALLBACK_MODEL;
      response = await ai.models.generateContent({
        model: JARVIS_GEMINI_FALLBACK_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
    } else {
      throw classified;
    }
  }

  const raw = (response.text || "[]").trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Array<
    Record<string, unknown>
  >;

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      "Gemini n'a pas retourné de découpage de scènes exploitable."
    );
  }

  let cursor = 0;
  const scenes: VideoScene[] = parsed.slice(0, 8).map((item, i) => {
    const motionRaw = String(item.cameraMotion || "").trim();
    const cameraMotion: CameraMotionType = CAMERA_MOTIONS.includes(
      motionRaw as CameraMotionType
    )
      ? (motionRaw as CameraMotionType)
      : CAMERA_MOTIONS[i % CAMERA_MOTIONS.length];

    const durRaw = Number(item.durationSec);
    const dur =
      Number.isFinite(durRaw) && durRaw >= 2
        ? Number(Math.min(45, durRaw).toFixed(2))
        : avgSec;

    const startTimeSec = Number(cursor.toFixed(2));
    cursor += dur;
    const endTimeSec = Number(cursor.toFixed(2));

    const visualDesc =
      typeof item.visualDescription === "string" && item.visualDescription.trim()
        ? item.visualDescription.trim()
        : typeof item.visualCue === "string" && item.visualCue.trim()
        ? item.visualCue.trim()
        : `Scène ${i + 1}`;

    return {
      index: i + 1,
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : `Scène ${i + 1}`,
      durationSec: dur,
      startTimeSec,
      endTimeSec,
      visualCue: visualDesc,
      imagePrompt:
        typeof item.imagePrompt === "string" && item.imagePrompt.trim()
          ? item.imagePrompt.trim()
          : `Cinematic 16:9 visual of ${visualDesc}, vivid lighting, no text, no words, no watermark`,
      searchKeywords:
        typeof item.searchKeywords === "string" && item.searchKeywords.trim()
          ? item.searchKeywords.trim()
          : "cinematic documentary landscape",
      cameraMotion,
      cameraInstruction:
        typeof item.cameraInstruction === "string" &&
        item.cameraInstruction.trim()
          ? item.cameraInstruction.trim()
          : defaultCameraInstruction(cameraMotion),
      narration:
        typeof item.narration === "string" && item.narration.trim()
          ? item.narration.trim()
          : visualDesc,
    };
  });

  return {
    scenes,
    totalDurationSec: Number(cursor.toFixed(2)),
    model: activeModel,
  };
}

async function generateStoryboard(
  topic: string,
  durationSec: number,
  userImageCount: number
): Promise<VideoScene[]> {
  const targetCount =
    userImageCount >= 2
      ? Math.min(6, Math.max(2, userImageCount))
      : durationSec <= 16
      ? 3
      : durationSec <= 28
      ? 4
      : 5;

  if (!isGeminiConfigured()) {
    return buildFallbackScenes(topic, durationSec, targetCount);
  }

  try {
    const result = await orchestrateNarrativeWithGemini({
      narrativeText: topic,
      targetDurationSec: durationSec,
      sceneCount: targetCount,
    });
    if (result.scenes.length >= 2) {
      return result.scenes;
    }
  } catch {
    // Fall back to deterministic scene splitting when full project creation runs without Gemini
  }

  return buildFallbackScenes(topic, durationSec, targetCount);
}

async function measureImageMeanLuma(imagePath: string): Promise<{
  valid: boolean;
  mean: number;
  width: number;
  height: number;
}> {
  try {
    const { stdout } = await execFileAsync(
      "identify",
      ["-format", "%w %h %[fx:mean]", imagePath],
      { timeout: 6000 }
    );
    const parts = stdout.trim().split(/\s+/);
    const width = Number(parts[0]) || 0;
    const height = Number(parts[1]) || 0;
    const mean = Number(parts[2]);
    return {
      valid: width >= 320 && height >= 240 && Number.isFinite(mean),
      mean: Number.isFinite(mean) ? mean : 0,
      width,
      height,
    };
  } catch {
    return { valid: false, mean: 0, width: 0, height: 0 };
  }
}

async function normalizeToScenePng(
  inputPath: string,
  outputPngPath: string
): Promise<boolean> {
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1",
        "-frames:v",
        "1",
        outputPngPath,
      ],
      { timeout: 12000 }
    );
    const stats = await measureImageMeanLuma(outputPngPath);
    return stats.valid && stats.mean >= 0.015;
  } catch {
    try {
      await execFileAsync(
        "convert",
        [
          `${inputPath}[0]`,
          "-resize",
          "1280x720^",
          "-gravity",
          "center",
          "-extent",
          "1280x720",
          outputPngPath,
        ],
        { timeout: 12000 }
      );
      const stats = await measureImageMeanLuma(outputPngPath);
      return stats.valid && stats.mean >= 0.015;
    } catch {
      return false;
    }
  }
}

interface VisualAcquisitionContext {
  pollinationsBlocked: boolean;
  usedImageUrls: Set<string>;
  fallbackKeywords: string;
}

function sanitizeImCaption(text: string): string {
  return text
    .replace(/%/g, "%%")
    .replace(/^@/, " @")
    .trim();
}

async function tryPollinationsImage(
  imagePrompt: string,
  seed: number,
  rawPath: string,
  targetPngPath: string,
  ctx: VisualAcquisitionContext
): Promise<boolean> {
  if (ctx.pollinationsBlocked) return false;

  const cleanPrompt = `${imagePrompt}, 16:9 widescreen, vivid lighting, high contrast, no text, no watermark`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    cleanPrompt
  )}?width=1280&height=720&nologo=true&seed=${seed}`;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "JARVIS-Studio/2.0",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) {
      if (resp.status === 429 || resp.status === 402 || resp.status === 403) {
        ctx.pollinationsBlocked = true;
      }
      return false;
    }
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return false;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 6000) {
      return false;
    }
    await fs.writeFile(rawPath, buf);
    return await normalizeToScenePng(rawPath, targetPngPath);
  } catch {
    return false;
  }
}

async function searchAndDownloadWikimedia(
  searchTerms: string,
  rawPath: string,
  targetPngPath: string,
  ctx: VisualAcquisitionContext
): Promise<boolean> {
  const queryUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    `${searchTerms} filetype:bitmap`
  )}&gsrlimit=12&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1280&format=json`;

  const resp = await fetch(queryUrl, {
    headers: {
      "User-Agent": "JARVIS-Educational-Studio/2.0 (mailto:jarvis@localhost)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return false;
  const data = (await resp.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: Array<{
            url?: string;
            thumburl?: string;
            mime?: string;
            width?: number;
          }>;
        }
      >;
    };
  };

  const pages = Object.values(data.query?.pages || {});
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const imgUrl = info?.thumburl || info?.url;
    if (!imgUrl || ctx.usedImageUrls.has(imgUrl)) continue;
    if (
      info?.mime &&
      !info.mime.includes("jpeg") &&
      !info.mime.includes("png") &&
      !info.mime.includes("webp")
    ) {
      continue;
    }
    if (info?.width && info.width < 480) continue;

    try {
      const imgResp = await fetch(imgUrl, {
        headers: {
          "User-Agent":
            "JARVIS-Educational-Studio/2.0 (mailto:jarvis@localhost)",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!imgResp.ok) continue;
      const buf = Buffer.from(await imgResp.arrayBuffer());
      if (buf.length < 6000) continue;
      await fs.writeFile(rawPath, buf);
      const ok = await normalizeToScenePng(rawPath, targetPngPath);
      if (ok) {
        ctx.usedImageUrls.add(imgUrl);
        return true;
      }
    } catch {
      // Try next result
    }
  }
  return false;
}

async function tryWikimediaCommonsImage(
  keywords: string,
  rawPath: string,
  targetPngPath: string,
  ctx: VisualAcquisitionContext
): Promise<boolean> {
  const candidates = new Set<string>();
  const trimmed = keywords.trim();
  if (trimmed) {
    candidates.add(trimmed);
    const words = trimmed.split(/\s+/).filter((w) => w.length > 2);
    if (words.length >= 2) {
      candidates.add(words.slice(0, 2).join(" "));
    }
    if (words.length >= 1) {
      candidates.add(words[0]);
    }
  }
  if (ctx.fallbackKeywords.trim()) {
    candidates.add(ctx.fallbackKeywords.trim());
  }

  for (const candidate of candidates) {
    try {
      if (
        await searchAndDownloadWikimedia(candidate, rawPath, targetPngPath, ctx)
      ) {
        return true;
      }
    } catch {
      // Continue to broader candidate
    }
  }
  return false;
}

async function renderLocalHoloSceneImage(
  _workDir: string,
  scene: VideoScene,
  targetPngPath: string
): Promise<boolean> {
  // Deterministic luminous midnight/cyan holographic render via ImageMagick (never black)
  const palettePairs = [
    ["#0c4a6e", "#071a38"],
    ["#0e7490", "#081c3a"],
    ["#1d4ed8", "#071430"],
    ["#0f766e", "#061b34"],
  ];
  const [innerColor, outerColor] =
    palettePairs[(scene.index - 1) % palettePairs.length];

  const headerText = `J.A.R.V.I.S. // SEQUENCE ${String(scene.index).padStart(
    2,
    "0"
  )} // ${(scene.cameraMotion || "zoom_in").toUpperCase()}`;

  const safeTitle = sanitizeImCaption(
    (scene.title || `Scène ${scene.index}`).toUpperCase()
  );
  const safeCue = sanitizeImCaption(scene.visualCue);

  try {
    await execFileAsync(
      "convert",
      [
        "-size",
        "1280x720",
        `radial-gradient:${innerColor}-${outerColor}`,
        // Geometric HUD grid lines & orbital rings
        "-stroke",
        "rgba(56,189,248,0.16)",
        "-strokewidth",
        "1",
        "-draw",
        "line 0,180 1280,180 line 0,540 1280,540 line 320,0 320,720 line 960,0 960,720",
        "-fill",
        "none",
        "-stroke",
        "rgba(34,211,238,0.34)",
        "-strokewidth",
        "2",
        "-draw",
        "circle 640,360 640,120",
        "-stroke",
        "rgba(59,130,246,0.28)",
        "-strokewidth",
        "1.5",
        "-draw",
        "circle 640,360 640,75",
        // Center translucent dark glass card for crisp readability
        "-fill",
        "rgba(4,12,28,0.68)",
        "-stroke",
        "rgba(56,189,248,0.45)",
        "-strokewidth",
        "2",
        "-draw",
        "roundrectangle 110,190 1170,530 18,18",
        // Header badge text
        "-stroke",
        "none",
        "-fill",
        "#67e8f9",
        "-font",
        "JetBrains-Mono-Regular",
        "-pointsize",
        "20",
        "-gravity",
        "NorthWest",
        "-annotate",
        "+145+225",
        headerText,
        // Scene title via inline sanitized caption
        "(",
        "-background",
        "none",
        "-fill",
        "#ecfeff",
        "-font",
        "DejaVu-Sans-Bold",
        "-pointsize",
        "38",
        "-size",
        "980x",
        "-gravity",
        "West",
        `caption:${safeTitle}`,
        ")",
        "-geometry",
        "+145+275",
        "-composite",
        // Visual cue via inline sanitized caption
        "(",
        "-background",
        "none",
        "-fill",
        "#bae6fd",
        "-font",
        "DejaVu-Sans",
        "-pointsize",
        "26",
        "-size",
        "980x",
        "-gravity",
        "West",
        `caption:${safeCue}`,
        ")",
        "-geometry",
        "+145+355",
        "-composite",
        targetPngPath,
      ],
      { timeout: 12000 }
    );

    const stats = await measureImageMeanLuma(targetPngPath);
    return stats.valid && stats.mean >= 0.025;
  } catch (err) {
    console.error("ImageMagick holo render failed:", err);
    return false;
  }
}

async function acquireSceneVisual(
  workDir: string,
  jobId: string,
  scene: VideoScene,
  ctx: VisualAcquisitionContext,
  userImage?: { name: string; mimeType: string; base64Data: string }
): Promise<{ pngPath: string; source: VisualSourceType; previewUrl: string }> {
  const idxPad = String(scene.index).padStart(2, "0");
  const fileName = `scene_${idxPad}.png`;
  const targetPngPath = path.join(workDir, fileName);
  const rawPath = path.join(workDir, `raw_${idxPad}`);

  // 1. User-imported image if supplied for this scene
  if (userImage?.base64Data) {
    await fs.writeFile(rawPath, Buffer.from(userImage.base64Data, "base64"));
    if (await normalizeToScenePng(rawPath, targetPngPath)) {
      return {
        pngPath: targetPngPath,
        source: "user_image",
        previewUrl: `/api/video/asset/${jobId}/${fileName}`,
      };
    }
  }

  // 2. Free AI Image Generation (Pollinations.ai)
  const seed = Math.abs(
    crypto.createHash("md5").update(`${jobId}_${scene.index}`).digest().readInt32BE(0)
  );
  if (
    scene.imagePrompt &&
    (await tryPollinationsImage(
      scene.imagePrompt,
      seed,
      `${rawPath}_poll`,
      targetPngPath,
      ctx
    ))
  ) {
    return {
      pngPath: targetPngPath,
      source: "pollinations_ai",
      previewUrl: `/api/video/asset/${jobId}/${fileName}`,
    };
  }

  // 3. Free Stock Photography Fallback (Wikimedia Commons)
  if (
    await tryWikimediaCommonsImage(
      scene.searchKeywords || ctx.fallbackKeywords,
      `${rawPath}_wiki`,
      targetPngPath,
      ctx
    )
  ) {
    return {
      pngPath: targetPngPath,
      source: "wikimedia_commons",
      previewUrl: `/api/video/asset/${jobId}/${fileName}`,
    };
  }

  // 4. Local High-Contrast Holographic Render (ImageMagick — NEVER black)
  if (await renderLocalHoloSceneImage(workDir, scene, targetPngPath)) {
    return {
      pngPath: targetPngPath,
      source: "local_holo_render",
      previewUrl: `/api/video/asset/${jobId}/${fileName}`,
    };
  }

  throw new Error(
    `Échec de génération visuelle pour la scène ${scene.index} (« ${scene.title || scene.visualCue} »).`
  );
}

async function probeMediaDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { timeout: 6000 }
  );
  const val = Number(stdout.trim());
  return Number.isFinite(val) ? val : 0;
}

async function synthesizeSceneAudio(
  narration: string,
  mp3Path: string
): Promise<number> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const tts = new MsEdgeTTS({
      connectionTimeoutMs: 8000,
      synthesisTimeoutMs: 25000,
    });
    try {
      await tts.setMetadata(
        "fr-FR-HenriNeural",
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
      );
      const { audioStream } = tts.toStream(narration, {
        pitch: "-20Hz",
        rate: "-8%",
      });
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const audioBuf = Buffer.concat(chunks);
      if (audioBuf.length < 400) {
        throw new Error("Flux audio vide retourné par Edge TTS.");
      }
      await fs.writeFile(mp3Path, audioBuf);
      const dur = await probeMediaDuration(mp3Path);
      if (dur >= 0.4) {
        return dur;
      }
      throw new Error("Durée audio générée invalide.");
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      tts.close();
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Échec de synthèse vocale Edge TTS.");
}

function buildZoompanFilter(
  motion: CameraMotionType,
  durationSec: number
): string {
  const fps = 25;
  const frames = Math.max(50, Math.round(durationSec * fps));

  let zpExpr = "";
  switch (motion) {
    case "zoom_out":
      zpExpr = `zoompan=z='1.16-0.16*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`;
      break;
    case "pan_right":
      zpExpr = `zoompan=z='1.14':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`;
      break;
    case "pan_left":
      zpExpr = `zoompan=z='1.14':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`;
      break;
    case "zoom_in":
    default:
      zpExpr = `zoompan=z='1.0+0.16*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=${fps}`;
      break;
  }

  return [
    "scale=2560:1440:force_original_aspect_ratio=increase",
    "crop=2560:1440",
    "setsar=1",
    zpExpr,
    "format=yuv420p",
  ].join(",");
}

async function validateRenderedMp4(
  mp4Path: string,
  workDir: string
): Promise<VideoValidationInfo> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height,nb_frames,duration",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      mp4Path,
    ],
    { timeout: 8000 }
  );

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      nb_frames?: string;
      duration?: string;
    }>;
    format?: { duration?: string };
  };

  const streams = parsed.streams || [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");

  const hasVideoStream = Boolean(
    videoStream && (videoStream.width || 0) > 0 && (videoStream.height || 0) > 0
  );
  const hasAudioStream = Boolean(audioStream);
  const width = videoStream?.width || 0;
  const height = videoStream?.height || 0;
  const frameCount = Number(videoStream?.nb_frames) || 0;
  const durationSec = Number(
    parsed.format?.duration || videoStream?.duration || audioStream?.duration || 0
  );

  if (!hasVideoStream || frameCount <= 0) {
    throw new Error(
      "Validation MP4 échouée : aucune piste vidéo valide ou aucune image détectée."
    );
  }
  if (!hasAudioStream || durationSec <= 0.5) {
    throw new Error(
      "Validation MP4 échouée : piste audio absente ou durée invalide."
    );
  }

  // Extract 3 sample frames (15%, 50%, 85%) and confirm non-black visual content
  const sampleRatios = [0.15, 0.5, 0.85];
  const sampleMeans: number[] = [];

  for (let i = 0; i < sampleRatios.length; i++) {
    const ts = Math.max(0.2, durationSec * sampleRatios[i]);
    const framePath = path.join(workDir, `verify_frame_${i}.png`);
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-ss",
        ts.toFixed(2),
        "-i",
        mp4Path,
        "-frames:v",
        "1",
        framePath,
      ],
      { timeout: 8000 }
    );
    const stats = await measureImageMeanLuma(framePath);
    if (!stats.valid) {
      throw new Error(
        `Validation MP4 échouée : impossible de lire l'image extraite à ${ts.toFixed(1)}s.`
      );
    }
    sampleMeans.push(stats.mean);
  }

  const avgLuma =
    sampleMeans.reduce((acc, m) => acc + m, 0) / sampleMeans.length;
  const minLuma = Math.min(...sampleMeans);
  const nonBlackVerified = minLuma >= 0.015;

  if (!nonBlackVerified) {
    throw new Error(
      `Validation visuelle échouée : écran noir détecté dans la vidéo exportée (luminosité minimale ${minLuma.toFixed(
        4
      )}).`
    );
  }

  const audioDurationSec = Number(audioStream?.duration || durationSec || 0);

  return {
    hasVideoStream,
    hasAudioStream,
    width,
    height,
    durationSec: Number(durationSec.toFixed(2)),
    audioDurationSec: Number(audioDurationSec.toFixed(2)),
    frameCount,
    nonBlackVerified,
    meanLuma: Number(avgLuma.toFixed(4)),
  };
}

export function createVideoRouter(): Router {
  const router = Router();
  const ffmpegCoreDir = path.resolve(
    process.cwd(),
    "node_modules/@ffmpeg/core/dist/esm"
  );

  router.get("/ffmpeg-core/ffmpeg-core.js", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(path.join(ffmpegCoreDir, "ffmpeg-core.js"));
  });

  router.get(
    "/ffmpeg-core/ffmpeg-core.wasm",
    (_req: Request, res: Response) => {
      res.setHeader("Content-Type", "application/wasm");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(path.join(ffmpegCoreDir, "ffmpeg-core.wasm"));
    }
  );

  router.get("/video/capabilities", async (_req: Request, res: Response) => {
    const cap = await detectFfmpeg();
    res.json(cap);
  });

  router.get("/video/output/:id", async (req: Request, res: Response) => {
    const job = renderedVideos.get(String(req.params.id));
    if (!job || !job.filePath) {
      res.status(404).json({ error: "Vidéo introuvable ou expirée." });
      return;
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${job.title.replace(/[^a-z0-9_-]/gi, "_")}.mp4"`
    );
    res.sendFile(job.filePath);
  });

  router.get("/video/audio/:id", async (req: Request, res: Response) => {
    const job = renderedVideos.get(String(req.params.id));
    if (!job || !job.audioPath) {
      res.status(404).json({ error: "Piste audio introuvable ou expirée." });
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.sendFile(job.audioPath);
  });

  router.get("/video/asset/:id/:file", async (req: Request, res: Response) => {
    const job = renderedVideos.get(String(req.params.id));
    const fileName = String(req.params.file || "");
    if (!job || !/^scene_\d{2}\.png$/.test(fileName)) {
      res.status(404).json({ error: "Visuel de scène introuvable." });
      return;
    }
    const targetPath = path.join(job.workDir, fileName);
    res.setHeader("Content-Type", "image/png");
    res.sendFile(targetPath);
  });

  router.post("/video/analyze", async (req: Request, res: Response) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error: "La clé API GEMINI_API_KEY n'est pas configurée côté serveur.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const body = (req.body ?? {}) as {
        name?: string;
        mimeType?: string;
        base64Data?: string;
        question?: string;
      };

      const mimeType =
        typeof body.mimeType === "string"
          ? body.mimeType.split(";")[0].trim()
          : "";
      const base64Data =
        typeof body.base64Data === "string" ? body.base64Data.trim() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "video";
      const question =
        typeof body.question === "string" && body.question.trim()
          ? body.question.trim()
          : "Décris les scènes clés, l'ambiance visuelle et les informations audio/visuelles importantes de cette vidéo en français.";

      if (!mimeType.startsWith("video/") || !base64Data) {
        res.status(400).json({
          error: "Veuillez importer un fichier vidéo valide (MP4, WebM, MOV).",
        });
        return;
      }

      const ai = getGeminiClient();
      const parts = [
        { inlineData: { mimeType, data: base64Data } },
        { text: `Vidéo : ${name}\nDemande : ${question}` },
      ];

      let activeModel = JARVIS_GEMINI_MODEL;
      let response: GenerateContentResponse;

      try {
        response = await ai.models.generateContent({
          model: JARVIS_GEMINI_MODEL,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction:
              "Tu es JARVIS. Analyse la vidéo en français clair et structuré sans markdown.",
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });
      } catch (primaryErr) {
        const classified = classifyGeminiError(primaryErr);
        if (classified.status === 503 || classified.status === 404) {
          activeModel = JARVIS_GEMINI_FALLBACK_MODEL;
          response = await ai.models.generateContent({
            model: JARVIS_GEMINI_FALLBACK_MODEL,
            contents: [{ role: "user", parts }],
            config: {
              systemInstruction:
                "Tu es JARVIS. Analyse la vidéo en français clair et structuré sans markdown.",
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
        } else {
          throw classified;
        }
      }

      const analysis =
        response.text
          ?.replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/#{1,6}\s+/g, "")
          .trim() || "Impossible d'analyser cette séquence vidéo.";

      res.json({ name, analysis, model: activeModel, timestamp: Date.now() });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  router.post("/video/orchestrate", async (req: Request, res: Response) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error: "La clé API GEMINI_API_KEY n'est pas configurée côté serveur.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const body = (req.body ?? {}) as {
        narrativeText?: string;
        targetDurationSec?: number;
        sceneCount?: number;
        systemPrompt?: string;
      };

      const narrativeText =
        typeof body.narrativeText === "string" ? body.narrativeText.trim() : "";

      if (!narrativeText) {
        res.status(400).json({
          error:
            "Le texte narratif à découper en scènes ne peut pas être vide.",
        });
        return;
      }

      const result = await orchestrateNarrativeWithGemini({
        narrativeText,
        targetDurationSec:
          typeof body.targetDurationSec === "number"
            ? body.targetDurationSec
            : undefined,
        sceneCount:
          typeof body.sceneCount === "number" ? body.sceneCount : undefined,
        systemPrompt:
          typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
      });

      res.json({
        scenes: result.scenes,
        totalDurationSec: result.totalDurationSec,
        model: result.model,
        createdAt: Date.now(),
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  router.post("/video/create", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as CreateVideoBody;
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : "Projet Vidéo JARVIS";
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      const durationSec = Math.min(
        180,
        Math.max(10, Number(body.durationSec) || 20)
      );
      const images = Array.isArray(body.images) ? body.images.slice(0, 12) : [];

      if (!topic && (!Array.isArray(body.scenes) || body.scenes.length === 0)) {
        res.status(400).json({
          error:
            "Décrivez le sujet ou le script souhaité pour préparer la vidéo.",
        });
        return;
      }

      const prepareOnlyForWasm = Boolean(body.prepareOnlyForWasm);
      const cap = await detectFfmpeg();
      const providedScenes =
        Array.isArray(body.scenes) && body.scenes.length > 0
          ? body.scenes.slice(0, 8).map((s, idx) => ({
              index: idx + 1,
              title: s.title || `Scène ${idx + 1}`,
              durationSec: Math.max(2, Number(s.durationSec) || 5),
              startTimeSec: s.startTimeSec,
              endTimeSec: s.endTimeSec,
              narration: String(s.narration || topic).trim(),
              visualCue: String(s.visualCue || topic).trim(),
              imagePrompt:
                s.imagePrompt ||
                `Cinematic 16:9 visualization of ${s.visualCue || topic}, vivid lighting, no text, no watermark`,
              searchKeywords: s.searchKeywords || topic,
              cameraMotion:
                s.cameraMotion && CAMERA_MOTIONS.includes(s.cameraMotion)
                  ? s.cameraMotion
                  : CAMERA_MOTIONS[idx % CAMERA_MOTIONS.length],
              cameraInstruction: s.cameraInstruction,
            }))
          : null;

      const scenes =
        providedScenes ||
        (await generateStoryboard(topic, durationSec, images.length));

      const ffmpegCommand =
        'ffmpeg -y -i "clip_01.mp4" -i "clip_02.mp4" -i "narration.mp3" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.4:offset=4.5,tpad=stop_mode=clone:stop_duration=2,trim=duration=9.0,setpts=PTS-STARTPTS,format=yuv420p[vout]" -map "[vout]" -map 2:a -c:v libx264 -c:a aac -t 9.0 "jarvis_output.mp4"';

      const jobId = crypto.randomUUID();
      const workDir = path.join(os.tmpdir(), "jarvis-video", jobId);
      await fs.mkdir(workDir, { recursive: true });

      try {
        // Step 1: Acquire distinct, verified non-black visual per scene
        const sceneVisuals: Array<{
          pngPath: string;
          source: VisualSourceType;
          previewUrl: string;
        }> = new Array(scenes.length);

        const visualCtx: VisualAcquisitionContext = {
          pollinationsBlocked: false,
          usedImageUrls: new Set<string>(),
          fallbackKeywords:
            scenes[0]?.searchKeywords ||
            topic
              .replace(/[^\w\sÀ-ÿ]/g, " ")
              .split(/\s+/)
              .filter((w) => w.length > 3)
              .slice(0, 3)
              .join(" "),
        };

        for (let idx = 0; idx < scenes.length; idx++) {
          const visual = await acquireSceneVisual(
            workDir,
            jobId,
            scenes[idx],
            visualCtx,
            images[idx]
          );
          sceneVisuals[idx] = visual;
          // Les scènes fournies par le client et celles du storyboard ont des formes légèrement
          // différentes : les métadonnées visuelles sont additives et optionnelles.
          const sceneWithVisual = scenes[idx] as {
            visualSource?: VisualSourceType;
            previewUrl?: string;
          };
          sceneWithVisual.visualSource = visual.source;
          sceneWithVisual.previewUrl = visual.previewUrl;
        }

        // Step 2: Synthesize per-scene narration MP3s with fr-FR-HenriNeural for exact sync
        const sceneAudioPaths: string[] = [];
        const sceneAudioDurations: number[] = [];

        for (let i = 0; i < scenes.length; i++) {
          const idxPad = String(scenes[i].index).padStart(2, "0");
          const mp3Path = path.join(workDir, `scene_${idxPad}.mp3`);
          const audioDur = await synthesizeSceneAudio(
            scenes[i].narration,
            mp3Path
          );
          sceneAudioPaths.push(mp3Path);
          sceneAudioDurations.push(audioDur);
          scenes[i].durationSec = Number(audioDur.toFixed(2));
        }

        // Concatenate scene MP3s cleanly into narration_full.mp3
        const fullAudioPath = path.join(workDir, "narration_full.mp3");
        if (cap.ffmpegAvailable) {
          const audioConcatList = path.join(workDir, "audio_concat.txt");
          await fs.writeFile(
            audioConcatList,
            sceneAudioPaths
              .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
              .join("\n"),
            "utf-8"
          );
          await execFileAsync(
            "ffmpeg",
            [
              "-y",
              "-f",
              "concat",
              "-safe",
              "0",
              "-i",
              audioConcatList,
              "-c",
              "copy",
              fullAudioPath,
            ],
            { timeout: 15000 }
          );
        } else {
          const fullNarration = scenes.map((s) => s.narration).join(" ");
          await synthesizeSceneAudio(fullNarration, fullAudioPath);
        }

        const totalAudioDurationSec = await probeMediaDuration(fullAudioPath).catch(
          () => sceneAudioDurations.reduce((a, b) => a + b, 0)
        );
        const targetAudioSec = Number(
          Math.max(1.5, totalAudioDurationSec).toFixed(3)
        );

        // Return assets + narration MP3 immediately when assembling client-side with ffmpeg.wasm
        if (prepareOnlyForWasm || !cap.ffmpegAvailable) {
          renderedVideos.set(jobId, {
            audioPath: fullAudioPath,
            workDir,
            title,
            createdAt: Date.now(),
          });
          pruneOldJobs();

          const srtContent = buildSrtFromScenes(scenes);
          const fullNarration = scenes.map((s) => s.narration).join(" ");
          res.json({
            id: jobId,
            title,
            status: "assets_ready",
            ffmpegAvailable: cap.ffmpegAvailable,
            audioUrl: `/api/video/audio/${jobId}`,
            audioDurationSec: Number(targetAudioSec.toFixed(2)),
            scenes,
            narration: fullNarration,
            srt: srtContent,
            ffmpegCommand,
            createdAt: Date.now(),
          });
          return;
        }

        // Step 3: Animate each scene visual with camera motion (zoompan)
        const TRANSITION_SEC = 0.5;
        const clipPaths: string[] = [];
        const clipDurations: number[] = [];

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const isLast = i === scenes.length - 1;
          const baseAudioSec = sceneAudioDurations[i];
          const targetClipDur = Math.max(
            2.0,
            isLast ? baseAudioSec + 0.15 : baseAudioSec + TRANSITION_SEC
          );

          const clipPath = path.join(
            workDir,
            `clip_${String(scene.index).padStart(2, "0")}.mp4`
          );
          const motion: CameraMotionType =
            scene.cameraMotion || CAMERA_MOTIONS[i % CAMERA_MOTIONS.length];
          const vf = buildZoompanFilter(motion, targetClipDur);

          await execFileAsync(
            "ffmpeg",
            [
              "-y",
              "-i",
              sceneVisuals[i].pngPath,
              "-vf",
              vf,
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "20",
              "-pix_fmt",
              "yuv420p",
              "-an",
              clipPath,
            ],
            { timeout: 45000 }
          );

          const actualDur = await probeMediaDuration(clipPath);
          clipPaths.push(clipPath);
          clipDurations.push(actualDur > 0.5 ? actualDur : targetClipDur);
        }

        // Step 4: Assemble animated clips with xfade transitions & exact audio duration sync
        const outPath = path.join(workDir, "output.mp4");

        if (clipPaths.length === 1) {
          await execFileAsync(
            "ffmpeg",
            [
              "-y",
              "-i",
              clipPaths[0],
              "-i",
              fullAudioPath,
              "-filter_complex",
              `[0:v]tpad=stop_mode=clone:stop_duration=3,trim=duration=${targetAudioSec.toFixed(
                3
              )},setpts=PTS-STARTPTS,format=yuv420p[vout]`,
              "-map",
              "[vout]",
              "-map",
              "1:a",
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "20",
              "-pix_fmt",
              "yuv420p",
              "-c:a",
              "aac",
              "-b:a",
              "128k",
              "-t",
              targetAudioSec.toFixed(3),
              "-movflags",
              "+faststart",
              outPath,
            ],
            { timeout: 30000 }
          );
        } else {
          const ffmpegArgs: string[] = ["-y"];
          for (const cp of clipPaths) {
            ffmpegArgs.push("-i", cp);
          }
          ffmpegArgs.push("-i", fullAudioPath);

          const filterSteps: string[] = [];
          let currentLabel = "0:v";
          let cumulativeDur = clipDurations[0];

          for (let i = 1; i < clipPaths.length; i++) {
            const transition =
              XFADE_TRANSITIONS[(i - 1) % XFADE_TRANSITIONS.length];
            const offset = Math.max(0.2, cumulativeDur - TRANSITION_SEC);
            const nextLabel =
              i === clipPaths.length - 1 ? "vx" : `v${i}`;
            filterSteps.push(
              `[${currentLabel}][${i}:v]xfade=transition=${transition}:duration=${TRANSITION_SEC}:offset=${offset.toFixed(
                3
              )}[${nextLabel}]`
            );
            currentLabel = nextLabel;
            cumulativeDur += clipDurations[i] - TRANSITION_SEC;
          }

          filterSteps.push(
            `[${currentLabel}]tpad=stop_mode=clone:stop_duration=3,trim=duration=${targetAudioSec.toFixed(
              3
            )},setpts=PTS-STARTPTS,format=yuv420p[vout]`
          );
          const audioInputIdx = clipPaths.length;

          ffmpegArgs.push(
            "-filter_complex",
            filterSteps.join(";"),
            "-map",
            "[vout]",
            "-map",
            `${audioInputIdx}:a`,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-t",
            targetAudioSec.toFixed(3),
            "-movflags",
            "+faststart",
            outPath
          );

          await execFileAsync("ffmpeg", ffmpegArgs, { timeout: 60000 });
        }

        // Step 5: Mandatory validation of video stream, audio stream, and non-black pixels
        const validation = await validateRenderedMp4(outPath, workDir);
        validation.audioDurationSec = Number(targetAudioSec.toFixed(2));

        renderedVideos.set(jobId, {
          filePath: outPath,
          audioPath: fullAudioPath,
          workDir,
          title,
          createdAt: Date.now(),
        });
        pruneOldJobs();

        const srtContent = buildSrtFromScenes(scenes);
        const fullNarration = scenes.map((s) => s.narration).join(" ");

        res.json({
          id: jobId,
          title,
          status: "rendered",
          ffmpegAvailable: true,
          renderEngine: "server_ffmpeg",
          videoUrl: `/api/video/output/${jobId}`,
          audioUrl: `/api/video/audio/${jobId}`,
          audioDurationSec: Number(targetAudioSec.toFixed(2)),
          scenes,
          narration: fullNarration,
          srt: srtContent,
          ffmpegCommand,
          validation,
          createdAt: Date.now(),
        });
      } catch (renderErr) {
        console.error("Video generation/validation failed:", renderErr);
        void fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
        const msg =
          renderErr instanceof Error
            ? renderErr.message
            : "Échec du rendu ou de la validation visuelle de la vidéo.";
        res.status(500).json({
          error: `La génération visuelle de la vidéo a échoué : ${msg}`,
          code: "VIDEO_RENDER_FAILED",
        });
      }
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  return router;
}
