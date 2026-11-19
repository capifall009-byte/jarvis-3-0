import { Router } from "express";
import type { Request, Response } from "express";
import { detectOllamaTargetModels } from "./ollamaRoute.ts";

export type AiProviderId = string; // inclut les 6 IA historiques + modèles Ollama locaux (ollama:*)

export type AiProviderStatus = "available" | "not_configured" | "unavailable";

export interface AiProviderInfo {
  id: AiProviderId;
  name: string;
  status: AiProviderStatus;
  capabilities: {
    chat: boolean;
    vision: boolean;
    imageGeneration: boolean;
    imageEditing: boolean;
  };
  note: string;
  model?: string | null;
  providerFamily?: "core" | "ollama";
  ollamaName?: string;
  responseMs?: number | null;
  lastError?: string | null;
}

function env(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export async function getAiProvidersInfo(): Promise<AiProviderInfo[]> {
  const geminiConfigured = env("GEMINI_API_KEY");
  const ollama = await detectOllamaTargetModels();
  const ollamaReachable = ollama.reachable;

  const core: AiProviderInfo[] = [
    {
      id: "gemini",
      name: "Gemini",
      status: geminiConfigured ? "available" : "not_configured",
      capabilities: { chat: true, vision: true, imageGeneration: false, imageEditing: false },
      note: geminiConfigured
        ? "Cerveau principal JARVIS (texte/vision selon modèle). Génération/édition d'images non exposée comme opérationnelle ici sans intégration dédiée gratuite."
        : "Clé GEMINI_API_KEY non configurée côté serveur.",
      model: geminiConfigured ? (process.env.GEMINI_MODEL || null) : null,
      providerFamily: "core",
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      status: "not_configured",
      capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false },
      note: env("OPENAI_API_KEY")
        ? "Clé détectée, mais adaptateur/chat réel non finalisé dans cette version sans validation d'accès gratuit compatible. Aucune API payante appelée."
        : "Non configuré (clé OPENAI_API_KEY absente). Adaptateur préparé, aucune API payante appelée.",
      providerFamily: "core",
    },
    {
      id: "claude",
      name: "Claude",
      status: "not_configured",
      capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false },
      note: env("ANTHROPIC_API_KEY")
        ? "Clé détectée, mais adaptateur non finalisé sans accès gratuit validé. Aucune API payante appelée."
        : "Non configuré (clé ANTHROPIC_API_KEY absente). Adaptateur préparé, aucune API payante appelée.",
      providerFamily: "core",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      status: "not_configured",
      capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false },
      note: env("DEEPSEEK_API_KEY")
        ? "Clé détectée, mais adaptateur non finalisé sans accès gratuit validé. Aucune API payante appelée."
        : "Non configuré (clé DEEPSEEK_API_KEY absente). Adaptateur préparé, aucune API payante appelée.",
      providerFamily: "core",
    },
    {
      id: "perplexity",
      name: "Perplexity",
      status: "not_configured",
      capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false },
      note: env("PERPLEXITY_API_KEY")
        ? "Clé détectée, mais adaptateur non finalisé sans accès gratuit validé. Aucune API payante appelée."
        : "Non configuré (clé PERPLEXITY_API_KEY absente). Adaptateur préparé, aucune API payante appelée.",
      providerFamily: "core",
    },
    {
      id: "llama",
      name: "Llama",
      status: ollamaReachable ? "available" : "unavailable",
      capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false },
      note: ollamaReachable
        ? `Runtime local Ollama détecté (${ollama.host}). Les modèles Llama compatibles peuvent être exposés via Ollama si installés ; sélectionnez les modèles Ollama détectés ci-dessous pour un usage réel.`
        : "Aucun runtime local Ollama détecté (http://127.0.0.1:11434).",
      providerFamily: "core",
    },
  ];

  const ollamaProviders: AiProviderInfo[] = ollama.models.map((m) => ({
    id: m.id,
    name: m.displayName,
    status: m.available ? "available" : (ollamaReachable ? "not_configured" : "unavailable"),
    capabilities: m.capabilities,
    note: m.note,
    model: m.ollamaName,
    providerFamily: "ollama",
    ollamaName: m.ollamaName,
  }));

  return [...core, ...ollamaProviders];
}

export function createAiProvidersRouter(): Router {
  const router = Router();

  router.get("/ai/providers", async (_req: Request, res: Response) => {
    try {
      const providers = await getAiProvidersInfo();
      res.json({ providers, budget: "0€", billing: "disabled", ollama: await detectOllamaTargetModels() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erreur fournisseurs IA." });
    }
  });

  router.post("/ai/chat", async (req: Request, res: Response) => {
    const provider = String((req.body as any)?.provider || "auto");
    // Flux principal Gemini conservé via /api/gemini.
    if (provider === "gemini" || provider === "auto") {
      res.status(501).json({
        error: "Utilisez le flux Gemini existant (/api/gemini) pour le chat principal. Pour un modèle Ollama local, utilisez /api/ai/ollama/chat.",
        use: "/api/gemini",
      });
      return;
    }
    if (provider.startsWith("ollama:") || (req.body as any)?.ollamaName) {
      res.status(400).json({
        error: "Utilisez l'endpoint dédié /api/ai/ollama/chat pour les modèles Ollama.",
        use: "/api/ai/ollama/chat",
      });
      return;
    }
    res.status(400).json({
      error: "Fournisseur non opérationnel ou non configuré. Aucune API payante n'est appelée.",
      provider,
    });
  });

  router.post("/ai/compare", async (req: Request, res: Response) => {
    const providers = await getAiProvidersInfo();
    const available = providers.filter((p) => p.status === "available" && p.capabilities.chat);
    res.json({
      status: "partial",
      availableProviders: available.map((p) => p.id),
      note:
        "Comparaison réelle limitée aux fournisseurs réellement configurés et opérationnels. Le flux Gemini principal reste prioritaire ; les modèles Ollama locaux disponibles peuvent être testés individuellement.",
    });
  });

  return router;
}
