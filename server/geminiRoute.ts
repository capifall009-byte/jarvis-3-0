import { ThinkingLevel } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import { Router } from "express";
import type { Request, Response } from "express";
import {
  JARVIS_GEMINI_FALLBACK_MODEL,
  JARVIS_GEMINI_MODEL,
  classifyGeminiError,
  getGeminiClient,
  isGeminiConfigured,
} from "./geminiClient.ts";
import { buildJarvisSystemInstruction } from "./jarvisPrompt.ts";
import type { MemoryContextItem } from "./jarvisPrompt.ts";
import { analyzeUserSentiment, normalizeTone } from "../shared/sentiment.ts";
import type { JarvisTone } from "../shared/sentiment.ts";

interface GeminiRequestBody {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  memories?: MemoryContextItem[];
  stream?: boolean;
  mode?: { id?: string; name?: string; instructions?: string };
  vocalStyle?: {
    emotion?: string | null;
    personality?: string;
    intensity?: number;
    auto?: boolean;
    geminiInstruction?: string;
  };
  intelligenceProfile?: {
    baseTone?: "elegant" | "friendly" | "direct" | "formal";
    humorLevel?: number;
    sarcasmLevel?: number;
    proactivityLevel?: number;
    detailPreference?: "concise" | "balanced" | "detailed";
    askWhenMissingInfo?: boolean;
    memoryEnabled?: boolean;
  };
  projects?: Array<{
    id: string;
    name: string;
    objective?: string;
    status?: string;
    progress?: number;
    nextActions?: string[];
    blockers?: string[];
  }>;
}

/** Retire les balises de mémorisation du texte visible (le client les extrait déjà,
 *  mais un appelant direct de l'API ne doit jamais les voir). */
function stripMemoryTags(rawText: string): string {
  return rawText.replace(/\[\[MEMOIRE:[^\]]*\]\]/gi, "").trim();
}

function capText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function stripToneTag(
  rawText: string,
  fallbackTone: JarvisTone
): { cleanText: string; tone: JarvisTone } {
  let detectedTone: JarvisTone = fallbackTone;
  const cleanText = rawText
    .replace(/^\s*\[\[TON:\s*([^\]]+)\]\]\s*/i, (_m, rawTone: string) => {
      detectedTone = normalizeTone(rawTone);
      return "";
    })
    .trim();
  return { cleanText, tone: detectedTone };
}

export function createGeminiRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    const configured = isGeminiConfigured();
    res.json({
      ok: configured,
      geminiConfigured: configured,
      model: JARVIS_GEMINI_MODEL,
      error: configured
        ? null
        : "GEMINI_API_KEY non configurée côté serveur. Vérifiez Settings > Secrets.",
    });
  });

  router.post("/gemini", async (req: Request, res: Response) => {
    let clientAborted = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        clientAborted = true;
      }
    });

    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error:
            "La clé API GEMINI_API_KEY n'est pas configurée côté serveur. Vérifiez Settings > Secrets.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const body = (req.body ?? {}) as GeminiRequestBody;
      // Bornage des données client : évite les prompts surdimensionnés et limite la surface d'injection.
      const message = capText(body.message, 8000);
      if (!message) {
        res.status(400).json({ error: "Le message ne peut pas être vide." });
        return;
      }

      const memories = Array.isArray(body.memories)
        ? body.memories.slice(0, 50).map((m) => ({ ...m, fact: capText(m?.fact, 600) }))
        : [];
      const history = Array.isArray(body.history)
        ? body.history.slice(-14).map((h) => ({ ...h, text: capText(h?.text, 4000) }))
        : [];
      const shouldStream = body.stream !== false;
      const recentUserMessages = history
        .filter((item) => item.role === "user" && item.text)
        .map((item) => item.text);
      const sentiment = analyzeUserSentiment(message, recentUserMessages);

      const contents = [
        ...history
          .filter((item) => item.text && item.text.trim().length > 0)
          .map((item) => ({
            role: item.role === "assistant" ? "model" : "user",
            parts: [{ text: item.text.trim() }],
          })),
        {
          role: "user",
          parts: [{ text: message }],
        },
      ];

      const ai = getGeminiClient();
      const systemInstruction = buildJarvisSystemInstruction(
        memories,
        sentiment,
        body.mode,
        body.vocalStyle,
        body.intelligenceProfile,
        Array.isArray(body.projects) ? body.projects : []
      );

      if (!shouldStream) {
        let activeModel = JARVIS_GEMINI_MODEL;
        let response: GenerateContentResponse;

        try {
          response = await ai.models.generateContent({
            model: JARVIS_GEMINI_MODEL,
            contents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            },
          });
        } catch (primaryErr) {
          const classified = classifyGeminiError(primaryErr);
          if (classified.status === 503 || classified.status === 404) {
            activeModel = JARVIS_GEMINI_FALLBACK_MODEL;
            response = await ai.models.generateContent({
              model: JARVIS_GEMINI_FALLBACK_MODEL,
              contents,
              config: {
                systemInstruction,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            });
          } else {
            throw classified;
          }
        }

        const rawReply =
          response.text?.trim() ||
          "Mes excuses, je n'ai pas pu formuler de réponse pour le moment.";
        const { cleanText, tone } = stripToneTag(stripMemoryTags(rawReply), sentiment.tone);

        res.json({ reply: cleanText, model: activeModel, sentiment, tone });
        return;
      }

      let activeModel = JARVIS_GEMINI_MODEL;
      let streamResponse: AsyncIterable<GenerateContentResponse>;

      try {
        streamResponse = await ai.models.generateContentStream({
          model: JARVIS_GEMINI_MODEL,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });
      } catch (primaryErr) {
        const classified = classifyGeminiError(primaryErr);
        if (classified.status === 503 || classified.status === 404) {
          activeModel = JARVIS_GEMINI_FALLBACK_MODEL;
          streamResponse = await ai.models.generateContentStream({
            model: JARVIS_GEMINI_FALLBACK_MODEL,
            contents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
        } else {
          throw classified;
        }
      }

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      res.write(
        `data: ${JSON.stringify({ type: "meta", model: activeModel, sentiment })}\n\n`
      );

      // Les balises [[MEMOIRE: ...]] sont volontairement laissées dans le flux : le client
      // les extrait via extractMemoryTags() pour l'enregistrement automatique autorisé,
      // puis les retire de l'affichage. Les nettoyer ici casserait la mémoire évolutive.
      for await (const chunk of streamResponse) {
        if (clientAborted) break;
        const delta = chunk.text;
        if (typeof delta === "string" && delta.length > 0) {
          res.write(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`);
        }
      }

      if (!clientAborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      }
    } catch (err: unknown) {
      if (clientAborted) {
        if (!res.writableEnded) res.end();
        return;
      }

      const classified = classifyGeminiError(err);
      if (!res.headersSent) {
        res.status(classified.status).json({
          error: classified.message,
          code: classified.code,
        });
      } else if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            error: classified.message,
            code: classified.code,
          })}\n\n`
        );
        res.end();
      }
    }
  });

  // Dedicated endpoint for Apple Shortcuts ("Obtenir le contenu de l'URL")
  const handleSiriRequest = async (req: Request, res: Response) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error:
            "La clé API GEMINI_API_KEY n'est pas configurée côté serveur.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const body = (req.body ?? {}) as {
        query?: string;
        message?: string;
        text?: string;
      };
      const queryParam =
        typeof req.query.q === "string"
          ? req.query.q
          : typeof req.query.query === "string"
          ? req.query.query
          : "";
      const prompt = (
        body.query ||
        body.message ||
        body.text ||
        queryParam ||
        ""
      ).trim();

      if (!prompt) {
        res.status(400).json({
          error: "Paramètre 'query' (ou 'q') requis pour l'appel Siri.",
        });
        return;
      }

      const ai = getGeminiClient();
      const sentiment = analyzeUserSentiment(prompt);
      const systemInstruction = buildJarvisSystemInstruction(
        [],
        sentiment,
        undefined,
        undefined,
        undefined,
        []
      );

      let activeModel = JARVIS_GEMINI_MODEL;
      let response: GenerateContentResponse;

      try {
        response = await ai.models.generateContent({
          model: JARVIS_GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });
      } catch (primaryErr) {
        const classified = classifyGeminiError(primaryErr);
        if (classified.status === 503 || classified.status === 404) {
          activeModel = JARVIS_GEMINI_FALLBACK_MODEL;
          response = await ai.models.generateContent({
            model: JARVIS_GEMINI_FALLBACK_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
        } else {
          throw classified;
        }
      }

      const rawReply =
        response.text?.trim() ||
        "Mes excuses, je n'ai pas pu formuler de réponse pour le moment.";
      const { cleanText: withoutTone, tone } = stripToneTag(
        rawReply,
        sentiment.tone
      );
      const cleanReply = withoutTone
        .replace(/\[\[MEMOIRE:[^\]]+\]\]/gi, "")
        .trim();

      res.json({
        reply: cleanReply,
        spokenText: cleanReply,
        model: activeModel,
        sentiment,
        tone,
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  };

  router.post("/siri", handleSiriRequest);
  router.get("/siri", handleSiriRequest);

  return router;
}
