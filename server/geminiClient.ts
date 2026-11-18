import { GoogleGenAI } from "@google/genai";

export const JARVIS_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const JARVIS_GEMINI_FALLBACK_MODEL = "gemini-4-hydrogen";

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | null = null;

export function getGeminiApiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKey() !== null;
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new GeminiServiceError(
      503,
      "API_KEY_MISSING",
      "Clé API Gemini (GEMINI_API_KEY) manquante côté serveur. Veuillez la configurer dans Settings > Secrets."
    );
  }

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    cachedKey = apiKey;
  }

  return cachedClient;
}

export class GeminiServiceError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GeminiServiceError";
    this.status = status;
    this.code = code;
  }
}

export function classifyGeminiError(err: unknown): GeminiServiceError {
  if (err instanceof GeminiServiceError) {
    return err;
  }

  const rawMsg = err instanceof Error ? err.message : String(err ?? "");
  if (rawMsg) {
    console.warn("Gemini upstream error:", rawMsg);
  }
  const upper = rawMsg.toUpperCase();

  if (
    upper.includes("RESOURCE_EXHAUSTED") ||
    upper.includes("QUOTA") ||
    upper.includes("429") ||
    upper.includes("RATE_LIMIT")
  ) {
    return new GeminiServiceError(
      429,
      "QUOTA_EXCEEDED",
      "Quota de l'API Gemini temporairement dépassé (429). Patientez quelques instants ou vérifiez votre quota dans Settings > Secrets."
    );
  }

  if (
    upper.includes("API_KEY_INVALID") ||
    upper.includes("PERMISSION_DENIED") ||
    upper.includes("API KEY NOT VALID") ||
    upper.includes("403") ||
    upper.includes("401")
  ) {
    return new GeminiServiceError(
      401,
      "INVALID_API_KEY",
      "Clé API Gemini (GEMINI_API_KEY) invalide ou non autorisée. Vérifiez votre clé dans Settings > Secrets."
    );
  }

  if (upper.includes("NOT_FOUND") || upper.includes("404")) {
    return new GeminiServiceError(
      404,
      "MODEL_NOT_FOUND",
      `Le modèle Gemini demandé (${JARVIS_GEMINI_MODEL}) est introuvable ou indisponible.`
    );
  }

  if (
    upper.includes("UNAVAILABLE") ||
    upper.includes("503") ||
    upper.includes("DEADLINE_EXCEEDED") ||
    upper.includes("TIMEOUT")
  ) {
    return new GeminiServiceError(
      503,
      "SERVICE_UNAVAILABLE",
      "Le service Google Gemini est momentanément surchargé. Veuillez réessayer dans quelques secondes."
    );
  }

  return new GeminiServiceError(
    500,
    "GEMINI_ERROR",
    rawMsg || "Une erreur est survenue lors de la communication avec Google Gemini."
  );
}
