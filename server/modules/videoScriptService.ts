import {
  JARVIS_GEMINI_FALLBACK_MODEL,
  JARVIS_GEMINI_MODEL,
  classifyGeminiError,
  getGeminiClient,
  isGeminiConfigured,
} from "../geminiClient.ts";
import { safeFetchValidatedUrl } from "./webSecurity.ts";
import { extractWebArticleContent } from "./web/WebArticleExtractor.ts";
import type { JarvisVideoSceneKind } from "../../remotion/video/types.ts";

/**
 * Génération du script d'une vidéo JARVIS.
 *
 * - `topic` : Gemini écrit un script original à partir d'un sujet.
 * - `text`  : un texte fourni est restructuré en scènes.
 * - `url`   : le contenu lisible de la page est extrait (SSRF protégé) puis restructuré.
 *
 * Sans clé Gemini (ou en cas d'échec), un script local déterministe est produit
 * et signalé honnêtement via `warning`.
 */

export type VideoSourceKind = "topic" | "text" | "url";

export type VideoTone = "pedagogique" | "energique" | "inspirant";

export interface VideoScriptSceneDraft {
  kind: JarvisVideoSceneKind;
  headline: string;
  subline: string;
  narration: string;
}

export interface VideoScriptDraft {
  title: string;
  kicker: string;
  accent: "cyan" | "violet" | "amber";
  scenes: VideoScriptSceneDraft[];
  source: "gemini" | "local";
  warning: string | null;
}

export interface VideoScriptRequest {
  sourceKind: VideoSourceKind;
  topic?: string;
  text?: string;
  url?: string;
  durationSec: number;
  tone: VideoTone;
}

const MAX_SOURCE_CHARS = 8000;
const MAX_TOPIC_CHARS = 500;
const MIN_SCENES = 4;
const MAX_SCENES = 12;

const TONE_PROMPTS: Record<VideoTone, string> = {
  pedagogique:
    "Ton pédagogique, clair et posé. Explique étape par étape, sans jargon inutile.",
  energique:
    "Ton énergique et direct, comme un créateur qui veut retenir l'attention dès la première seconde.",
  inspirant:
    "Ton inspirant et personnel, avec une pointe d'émotion et une conclusion motivante.",
};

const TONE_ACCENTS: Record<VideoTone, "cyan" | "violet" | "amber"> = {
  pedagogique: "cyan",
  energique: "amber",
  inspirant: "violet",
};

export interface ResolvedSource {
  kind: VideoSourceKind;
  label: string;
  text: string;
  title: string | null;
}

export async function resolveVideoSource(
  request: VideoScriptRequest
): Promise<ResolvedSource> {
  if (request.sourceKind === "url") {
    const rawUrl = (request.url ?? "").trim();
    if (!rawUrl) throw new Error("URL vide.");
    const fetched = await safeFetchValidatedUrl(rawUrl, {
      timeoutMs: 15000,
      maxBytes: 2_000_000,
      allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6",
      },
    });

    const html = fetched.buffer.toString("utf8");
    const article = extractWebArticleContent(html, fetched.url);
    const text = (article.text || "").trim().slice(0, MAX_SOURCE_CHARS);
    if (text.length < 80) {
      throw new Error(
        "Impossible d'extraire assez de texte lisible depuis cette page. Colle le contenu manuellement."
      );
    }
    return {
      kind: "url",
      label: fetched.url,
      text,
      title: article.title ?? null,
    };
  }

  if (request.sourceKind === "text") {
    const text = (request.text ?? "").trim();
    if (text.length < 40) {
      throw new Error("Le texte fourni est trop court (40 caractères minimum).");
    }
    return {
      kind: "text",
      label: "Texte fourni",
      text: text.slice(0, MAX_SOURCE_CHARS),
      title: null,
    };
  }

  const topic = (request.topic ?? "").trim();
  if (topic.length < 3) {
    throw new Error("Sujet trop court.");
  }
  return {
    kind: "topic",
    label: topic.slice(0, MAX_TOPIC_CHARS),
    text: topic.slice(0, MAX_TOPIC_CHARS),
    title: topic.slice(0, MAX_TOPIC_CHARS),
  };
}

function sceneCountForDuration(durationSec: number): number {
  const count = Math.round(durationSec / 9);
  return Math.min(MAX_SCENES, Math.max(6, count));
}

function buildGeminiPrompt(
  source: ResolvedSource,
  request: VideoScriptRequest,
  sceneCount: number
): string {
  const sourceBlock =
    source.kind === "topic"
      ? `SUJET À TRAITER :\n${source.text}`
      : `SOURCE À RESTITUER (ne pas inventer de faits absents) :\n${source.text}`;

  return [
    "Tu es le scénariste vidéo de JARVIS, l'assistant personnel d'Abdourahmane Fall (pseudonyme Capzo).",
    `Objectif : une vidéo en français de ${request.durationSec} secondes environ, découpée en ${sceneCount} scènes.`,
    TONE_PROMPTS[request.tone],
    "",
    sourceBlock,
    "",
    "Règles de narration :",
    "- Chaque scène a une narration orale de 18 à 30 mots, fluide, sans markdown, sans emoji, sans balises.",
    "- La première scène est de type \"hook\" : une accroche forte en une phrase.",
    "- Les scènes intermédiaires sont de type \"point\" ou \"quote\".",
    "- La dernière scène est de type \"cta\" et mentionne JARVIS, créé par Abdourahmane Fall (Capzo).",
    "- `headline` : 2 à 7 mots maximum, percutant, sans point final.",
    "- `subline` : une phrase courte (12 mots maximum) ou une précision chiffrée ; peut être vide.",
    "- Ne jamais inventer de chiffre, de citation ou de source absente du texte fourni.",
    "",
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :",
    '{"title":"Titre de la vidéo","kicker":"3 À 5 MOTS MAJUSCULES","scenes":[{"kind":"hook|point|quote|cta","headline":"...","subline":"...","narration":"..."}]}',
  ].join("\n");
}

function parseJsonObject(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Réponse Gemini sans objet JSON.");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function asString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeKind(value: unknown, index: number, lastIndex: number): JarvisVideoSceneKind {
  if (index === 0) return "hook";
  if (index === lastIndex) return "cta";
  return value === "quote" ? "quote" : "point";
}

function normalizeDraft(
  parsed: unknown,
  fallbackTitle: string
): { title: string; kicker: string; scenes: VideoScriptSceneDraft[] } {
  const root = parsed as {
    title?: unknown;
    kicker?: unknown;
    scenes?: unknown;
  };
  const rawScenes = Array.isArray(root.scenes) ? root.scenes : [];
  const drafts: VideoScriptSceneDraft[] = [];

  rawScenes.forEach((entry, index) => {
    const item = entry as {
      kind?: unknown;
      headline?: unknown;
      subline?: unknown;
      narration?: unknown;
    };
    const narration = asString(item.narration, 700);
    if (!narration) return;
    const headline =
      asString(item.headline, 90) || narration.split(" ").slice(0, 6).join(" ");
    drafts.push({
      kind: normalizeKind(item.kind, index, rawScenes.length - 1),
      headline,
      subline: asString(item.subline, 160),
      narration,
    });
  });

  if (drafts.length > MAX_SCENES) {
    // On garde l'accroche, les meilleures scènes du milieu et la conclusion.
    const hook = drafts[0];
    const cta = drafts[drafts.length - 1];
    const middle = drafts.slice(1, -1).slice(0, MAX_SCENES - 2);
    drafts.splice(0, drafts.length, hook, ...middle, cta);
  }

  if (drafts.length > 0) {
    drafts[0].kind = "hook";
    drafts[drafts.length - 1].kind = "cta";
  }

  return {
    title: asString(root.title, 120) || fallbackTitle,
    kicker: (asString(root.kicker, 40) || "JARVIS 3.0").toUpperCase(),
    scenes: drafts,
  };
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25);
}

function chunkWords(sentences: string[], targetWords: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let count = 0;
  for (const sentence of sentences) {
    const words = sentence.split(" ").length;
    if (count > 0 && count + words > targetWords) {
      chunks.push(current.join(" "));
      current = [];
      count = 0;
    }
    current.push(sentence);
    count += words;
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

function shorten(value: string, maxWords: number, maxChars: number): string {
  const words = value.split(/\s+/).slice(0, maxWords).join(" ");
  return words.length > maxChars ? `${words.slice(0, maxChars - 1).trim()}…` : words;
}

/**
 * Script de secours, sans IA : restructuration honnête du texte disponible.
 * Il ne prétend pas remplacer Gemini (aucune reformulation créative).
 */
export function buildLocalScript(
  source: ResolvedSource,
  request: VideoScriptRequest,
  warning: string
): VideoScriptDraft {
  const title =
    shorten(source.title || (source.kind === "topic" ? source.label : "Vidéo JARVIS"), 10, 90) ||
    "Vidéo JARVIS";

  const sceneCount = sceneCountForDuration(request.durationSec);
  const sentences = splitSentences(source.text);

  const drafts: VideoScriptSceneDraft[] = [];

  if (source.kind === "topic" || sentences.length < 2) {
    drafts.push({
      kind: "hook",
      headline: title,
      subline: "Présenté par JARVIS",
      narration: `${title}. Voici l'essentiel à retenir, expliqué simplement.`,
    });
    drafts.push({
      kind: "point",
      headline: "Le contexte",
      subline: "Ce qu'il faut savoir",
      narration: `${source.text.slice(0, 240)}`,
    });
    drafts.push({
      kind: "point",
      headline: "À retenir",
      subline: "Le point clé",
      narration: "Retiens surtout l'idée principale et applique-la dès aujourd'hui.",
    });
  } else {
    const wordsPerScene = Math.max(
      18,
      Math.round(
        sentences.join(" ").split(" ").length / Math.max(2, sceneCount - 1)
      )
    );
    const chunks = chunkWords(sentences, wordsPerScene).slice(0, sceneCount - 1);
    chunks.forEach((chunk, index) => {
      drafts.push({
        kind: index === 0 ? "hook" : "point",
        headline:
          index === 0
            ? shorten(title, 7, 60)
            : shorten(chunk.split(" ").slice(0, 6).join(" "), 6, 52),
        subline: "",
        narration: chunk,
      });
    });
  }

  drafts.push({
    kind: "cta",
    headline: "JARVIS 3.0",
    subline: "Abdourahmane Fall · Capzo",
    narration:
      "Voilà pour l'essentiel. JARVIS, votre assistant personnel, est créé par Abdourahmane Fall, alias Capzo.",
  });

  return {
    title,
    kicker: "JARVIS 3.0",
    accent: TONE_ACCENTS[request.tone],
    scenes: drafts.slice(0, MAX_SCENES),
    source: "local",
    warning,
  };
}

async function callGemini(
  source: ResolvedSource,
  request: VideoScriptRequest,
  sceneCount: number
): Promise<{ title: string; kicker: string; scenes: VideoScriptSceneDraft[] }> {
  const client = getGeminiClient();
  const prompt = buildGeminiPrompt(source, request, sceneCount);
  const config = {
    responseMimeType: "application/json",
    temperature: 0.85,
    maxOutputTokens: 4096,
  } as const;

  const contents = [{ role: "user" as const, parts: [{ text: prompt }] }];

  let text: string;
  try {
    const response = await client.models.generateContent({
      model: JARVIS_GEMINI_MODEL,
      contents,
      config,
    });
    text = response.text ?? "";
  } catch (primaryError) {
    try {
      const response = await client.models.generateContent({
        model: JARVIS_GEMINI_FALLBACK_MODEL,
        contents,
        config,
      });
      text = response.text ?? "";
    } catch {
      throw classifyGeminiError(primaryError);
    }
  }

  if (!text.trim()) {
    throw new Error("Gemini a renvoyé une réponse vide.");
  }

  const normalized = normalizeDraft(parseJsonObject(text), source.title || "Vidéo JARVIS");
  if (normalized.scenes.length < 2) {
    throw new Error("Script Gemini incomplet (moins de 2 scènes).");
  }
  return normalized;
}

export async function generateVideoScript(
  request: VideoScriptRequest
): Promise<VideoScriptDraft> {
  const source = await resolveVideoSource(request);
  const sceneCount = sceneCountForDuration(request.durationSec);

  if (!isGeminiConfigured()) {
    return buildLocalScript(
      source,
      request,
      "Clé Gemini absente : script local sans reformulation créative."
    );
  }

  try {
    const result = await callGemini(source, request, sceneCount);
    const words = result.scenes
      .map((scene) => scene.narration.split(/\s+/).length)
      .reduce((sum, value) => sum + value, 0);
    const estimatedSeconds = words / 2.6;
    const warning =
      estimatedSeconds < request.durationSec * 0.6
        ? `Script plus court que la cible (${Math.round(estimatedSeconds)} s estimées pour ${request.durationSec} s demandées).`
        : null;

    return {
      ...result,
      accent: TONE_ACCENTS[request.tone],
      source: "gemini",
      warning,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Génération du script impossible.";
    return buildLocalScript(
      source,
      request,
      `Script local utilisé (Gemini indisponible : ${message})`
    );
  }
}
