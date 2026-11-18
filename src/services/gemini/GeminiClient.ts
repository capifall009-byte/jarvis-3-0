import { normalizeTone } from "../../../shared/sentiment.ts";
import type { JarvisTone, SentimentAnalysis } from "../../../shared/sentiment.ts";
import type {
  IntelligenceProfile,
  MemoryItem,
  TranscriptMessage,
  VocalEmotion,
  VocalPersonality,
} from "../../types/jarvis";

export interface GeminiStreamOptions {
  message: string;
  history: TranscriptMessage[];
  memories: MemoryItem[];
  mode?: { id: string; name: string; instructions?: string };
  vocalStyle?: { emotion: VocalEmotion | null; personality: VocalPersonality; intensity: number; auto: boolean; geminiInstruction?: string };
  intelligenceProfile?: Partial<IntelligenceProfile>;
  // Contrat aligné sur GeminiRequestBody côté serveur (blockers = chaînes, pas d'objets).
  projects?: Array<{
    id: string;
    name: string;
    objective?: string;
    status?: string;
    progress?: number;
    nextActions?: string[];
    blockers?: string[];
  }>;
  signal?: AbortSignal;
  onMeta?: (model: string, sentiment?: SentimentAnalysis) => void;
  onTone?: (tone: JarvisTone) => void;
  onDelta: (cleanAccumulatedText: string, newDeltaChunk: string) => void;
}

export interface GeminiStreamResult {
  reply: string;
  model: string | null;
  extractedMemories: string[];
  sentiment?: SentimentAnalysis;
  tone: JarvisTone;
}

export function extractMemoryTags(rawText: string): {
  cleanText: string;
  memories: string[];
} {
  const memories: string[] = [];
  const cleanText = rawText
    .replace(/\[\[MEMOIRE:\s*([^\]]+)\]\]/gi, (_match, fact: string) => {
      const trimmed = fact.trim();
      if (trimmed) memories.push(trimmed);
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanText, memories };
}

function parseTonePrefix(rawText: string): {
  resolvedTone?: JarvisTone;
  strippedText: string;
  waitingForTagClose: boolean;
} {
  const trimmedLeading = rawText.trimStart();
  if (!trimmedLeading.startsWith("[")) {
    return { strippedText: rawText, waitingForTagClose: false };
  }

  const fullTagMatch = trimmedLeading.match(
    /^\[\[TON:\s*([^\]]+)\]\]\s*([\s\S]*)$/i
  );
  if (fullTagMatch) {
    return {
      resolvedTone: normalizeTone(fullTagMatch[1]),
      strippedText: fullTagMatch[2],
      waitingForTagClose: false,
    };
  }

  // Only buffer briefly while [[TON:...]] prefix is still arriving
  if (
    trimmedLeading.length <= 28 &&
    (/^\[?$/.test(trimmedLeading) ||
      /^\[\[T?O?N?:?[^\]]*$/i.test(trimmedLeading))
  ) {
    return { strippedText: "", waitingForTagClose: true };
  }

  return { strippedText: rawText, waitingForTagClose: false };
}

export async function streamGeminiResponse({
  message,
  history,
  memories,
  mode,
  vocalStyle,
  intelligenceProfile,
  projects,
  signal,
  onMeta,
  onTone,
  onDelta,
}: GeminiStreamOptions): Promise<GeminiStreamResult> {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      stream: true,
      history: history
        .filter((m) => !m.isPartial && m.text.trim().length > 0)
        .slice(-14)
        .map((m) => ({ role: m.role, text: m.text })),
      memories: memories.map((m) => ({
        id: m.id,
        fact: m.fact,
        modeId: m.modeId,
        kind: m.kind,
        category: m.category,
        sensitive: m.sensitive,
        disabled: m.disabled,
      })),
      mode,
      vocalStyle,
      intelligenceProfile,
      projects: (projects || []).map((p) => ({
        id: p.id,
        name: p.name,
        objective: p.objective,
        status: p.status,
        progress: p.progress,
        nextActions: p.nextActions || [],
        blockers: (p.blockers || []).map((b: any) => (typeof b === "string" ? b : b?.description)).filter(Boolean),
      })),
    }),
    signal,
  });

  if (!response.ok) {
    let errMessage = `Erreur serveur Gemini (${response.status})`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson.error) errMessage = errJson.error;
    } catch {
      // Keep status fallback
    }
    throw new Error(errMessage);
  }

  if (!response.body) {
    throw new Error("Flux de réponse Gemini indisponible.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let sseBuffer = "";
  let rawAccumulated = "";
  let resolvedModel: string | null = null;
  let resolvedSentiment: SentimentAnalysis | undefined;
  let resolvedTone: JarvisTone = "neutral";
  let toneResolved = false;
  let lastCleanLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;

      let event: {
        type?: string;
        text?: string;
        model?: string;
        sentiment?: SentimentAnalysis;
        error?: string;
      };
      try {
        event = JSON.parse(payload) as typeof event;
      } catch {
        continue;
      }

      if (event.type === "meta") {
        if (event.model) resolvedModel = event.model;
        if (event.sentiment) {
          resolvedSentiment = event.sentiment;
          resolvedTone = event.sentiment.tone;
        }
        onMeta?.(event.model ?? "", event.sentiment);
      } else if (event.type === "delta" && typeof event.text === "string") {
        rawAccumulated += event.text;

        let afterTone = rawAccumulated;
        if (!toneResolved) {
          const parsed = parseTonePrefix(rawAccumulated);
          if (parsed.waitingForTagClose) {
            continue;
          }
          toneResolved = true;
          if (parsed.resolvedTone) {
            resolvedTone = parsed.resolvedTone;
            onTone?.(resolvedTone);
          }
          afterTone = parsed.strippedText;
        } else {
          afterTone = rawAccumulated.replace(
            /^\s*\[\[TON:\s*[^\]]+\]\]\s*/i,
            ""
          );
        }

        const visiblePart = afterTone.replace(/\[\[MEMOIRE:[\s\S]*$/i, "");
        const newChunk = visiblePart.slice(lastCleanLength);
        lastCleanLength = visiblePart.length;
        if (newChunk.length > 0) {
          onDelta(visiblePart.trimEnd(), newChunk);
        }
      } else if (event.type === "error") {
        throw new Error(event.error || "Erreur pendant la réponse Gemini.");
      }
    }
  }

  const withoutTone = rawAccumulated.replace(
    /^\s*\[\[TON:\s*([^\]]+)\]\]\s*/i,
    (_m, rawTone: string) => {
      resolvedTone = normalizeTone(rawTone);
      return "";
    }
  );
  const { cleanText, memories: extractedMemories } =
    extractMemoryTags(withoutTone);

  return {
    reply:
      cleanText ||
      "Mes excuses, je n'ai pas pu formuler de réponse pour le moment.",
    model: resolvedModel,
    extractedMemories,
    sentiment: resolvedSentiment,
    tone: resolvedTone,
  };
}
