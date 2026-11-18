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
} from "../geminiClient.ts";

interface AnalyzeFileBody {
  name?: string;
  mimeType?: string;
  base64Data?: string;
  textContent?: string;
  question?: string;
}

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "text/",
  "video/",
  "audio/",
];

const ALLOWED_EXACT_MIMES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/csv",
]);

function isSupportedMime(mimeType: string): boolean {
  const lower = mimeType.toLowerCase().split(";")[0].trim();
  if (ALLOWED_EXACT_MIMES.has(lower)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function createFilesRouter(): Router {
  const router = Router();

  router.post("/files/analyze", async (req: Request, res: Response) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error: "La clé API GEMINI_API_KEY n'est pas configurée côté serveur.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const body = (req.body ?? {}) as AnalyzeFileBody;
      const name = typeof body.name === "string" ? body.name.trim() : "document";
      const mimeType =
        typeof body.mimeType === "string" ? body.mimeType.split(";")[0].trim() : "";
      const base64Data =
        typeof body.base64Data === "string" ? body.base64Data.trim() : "";
      const textContent =
        typeof body.textContent === "string" ? body.textContent : "";
      const question =
        typeof body.question === "string" && body.question.trim()
          ? body.question.trim()
          : "Analyse ce document ou média en français : résume les points essentiels, les détails importants et ce qu'il faut retenir.";

      if (!mimeType || !isSupportedMime(mimeType)) {
        res.status(400).json({
          error: `Type de fichier non pris en charge (${mimeType || "inconnu"}). Formats acceptés : images, PDF, textes, CSV/JSON et vidéos courtes.`,
        });
        return;
      }

      if (!base64Data && !textContent) {
        res.status(400).json({
          error: "Aucun contenu de fichier fourni pour l'analyse.",
        });
        return;
      }

      if (base64Data.length > 24 * 1024 * 1024) {
        res.status(413).json({
          error:
            "Le fichier dépasse la limite de 24 Mo pour une analyse directe. Compressez-le ou découpez-le.",
        });
        return;
      }

      const ai = getGeminiClient();
      const systemInstruction = [
        "Tu es JARVIS, assistant personnel intelligent.",
        "Analyse le fichier fourni avec précision, en français naturel, clair et structuré, sans markdown superflu (** ou ###) afin que la réponse puisse aussi être lue à voix haute.",
      ].join("\n");

      const parts = textContent
        ? [
            {
              text: `Fichier : ${name} (${mimeType})\nDemande : ${question}\n\nContenu :\n${textContent.slice(0, 60000)}`,
            },
          ]
        : [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: `Nom du fichier : ${name}\nDemande : ${question}`,
            },
          ];

      let activeModel = JARVIS_GEMINI_MODEL;
      let response: GenerateContentResponse;

      try {
        response = await ai.models.generateContent({
          model: JARVIS_GEMINI_MODEL,
          contents: [{ role: "user", parts }],
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
            contents: [{ role: "user", parts }],
            config: {
              systemInstruction,
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
          .trim() || "Je n'ai pas pu extraire d'analyse de ce fichier.";

      res.json({
        name,
        mimeType,
        analysis,
        model: activeModel,
        timestamp: Date.now(),
      });
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
