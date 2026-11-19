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
import { buildTimeContextForMessage } from "./services/time/worldTime.ts";

interface GeminiAttachmentInput {
  name?: string;
  mimeType?: string;
  /** data URL (data:...;base64,...) ou base64 brut */
  dataUrl?: string;
  dataBase64?: string;
  textContent?: string;
  kind?: string;
  size?: number;
}

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
  userTimeZone?: string;
  attachments?: GeminiAttachmentInput[];
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

function extractBase64(input: GeminiAttachmentInput): { data: string; mimeType: string } | null {
  const mimeType = String(input.mimeType || "application/octet-stream").split(";")[0].trim() || "application/octet-stream";
  const raw = String(input.dataBase64 || input.dataUrl || "").trim();
  if (!raw) return null;
  const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) return { data: m[2], mimeType: (m[1] || mimeType).split(";")[0].trim() };
  // assume raw base64
  return { data: raw.replace(/\s+/g, ""), mimeType };
}

function buildUserParts(message: string, attachments: GeminiAttachmentInput[] | undefined): any[] {
  const parts: any[] = [];
  const atts = Array.isArray(attachments) ? attachments.slice(0, 8) : [];
  const notes: string[] = [];
  for (const att of atts) {
    const name = String(att?.name || "fichier").slice(0, 180);
    const mimeType = String(att?.mimeType || "").toLowerCase();
    const kind = String(att?.kind || "");
    const textContent = typeof att?.textContent === "string" ? att.textContent : "";
    const isImage = mimeType.startsWith("image/") || kind === "image";
    const isPdf = mimeType === "application/pdf" || kind === "pdf";
    const isTextLike = mimeType.startsWith("text/") || kind === "text" || kind === "document";
    const b64 = extractBase64(att);

    if ((isImage || isPdf) && b64 && b64.data) {
      // Limite taille base64 (~24 Mo en données décodées ~ 32 Mo b64) pour rester raisonnable
      if (b64.data.length <= 24 * 1024 * 1024) {
        parts.push({ inlineData: { mimeType: b64.mimeType || mimeType || "application/octet-stream", data: b64.data } });
        notes.push(`Pièce jointe (${isImage ? "image" : "PDF"}): ${name}`);
        continue;
      } else {
        notes.push(`Pièce jointe ignorée (trop volumineuse > 24 Mo): ${name}`);
        continue;
      }
    }
    if (textContent && textContent.trim()) {
      notes.push(`Pièce jointe (texte/document: ${name}, ${mimeType || "type inconnu"}):\n${capText(textContent, 30000)}`);
      continue;
    }
    if (b64 && b64.data && isTextLike) {
      // tenter décodage simple côté serveur si texte-like fourni en base64
      try {
        const decoded = Buffer.from(b64.data, "base64").toString("utf8");
        if (decoded && decoded.trim()) {
          notes.push(`Pièce jointe (texte/document: ${name}):\n${capText(decoded, 30000)}`);
          continue;
        }
      } catch {
        // ignore
      }
    }
    if (b64 && b64.data) {
      // autre binaire non textuel (ex: docx sans extraction) — on ne peut pas l'analyser sans extraction réelle
      notes.push(`Pièce jointe reçue mais non analysable sans extraction de texte côté client/serveur: ${name} (${mimeType || "type inconnu"}). Demande à l'utilisateur de fournir le texte ou un format pris en charge (image, PDF, texte).`);
    } else {
      notes.push(`Pièce jointe mentionnée mais sans contenu exploitable: ${name}.`);
    }
  }

  let finalText = message || "";
  if (notes.length > 0) {
    const prefix = "[Pièces jointes fournies avec le message]\n" + notes.join("\n\n");
    finalText = finalText ? `${finalText}\n\n${prefix}` : `${prefix}\n\nAnalyse les pièces jointes fournies et réponds à la demande.`;
  }
  parts.push({ text: finalText || "Analyse les pièces jointes fournies." });
  return parts;
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
      const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
      if (!message && !hasAttachments) {
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
          parts: buildUserParts(message, body.attachments),
        },
      ];

      const ai = getGeminiClient();
      const userTimeZone =
        typeof body.userTimeZone === "string" && body.userTimeZone.trim().length <= 120
          ? body.userTimeZone.trim()
          : undefined;
      const timeContext = buildTimeContextForMessage(message, userTimeZone);
      const systemInstruction = buildJarvisSystemInstruction(
        memories,
        sentiment,
        body.mode,
        body.vocalStyle,
        body.intelligenceProfile,
        Array.isArray(body.projects) ? body.projects : [],
        timeContext
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
      const siriTimeZone =
        typeof (req.body as { userTimeZone?: string })?.userTimeZone === "string"
          ? String((req.body as { userTimeZone?: string }).userTimeZone).trim()
          : typeof req.query.tz === "string"
          ? req.query.tz.trim()
          : undefined;
      const timeContext = buildTimeContextForMessage(prompt, siriTimeZone);
      const systemInstruction = buildJarvisSystemInstruction(
        [],
        sentiment,
        undefined,
        undefined,
        undefined,
        [],
        timeContext
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
