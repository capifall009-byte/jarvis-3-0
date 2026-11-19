import { fetchAiProviders, type AiProviderId, type AiProviderInfo } from "./AiProvidersClient";

export type AiSelectionMode = "auto" | "manual";

export interface AiSelectionRequest {
  mode: AiSelectionMode;
  preferredProvider?: AiProviderId;
  capability?: "chat" | "vision" | "imageGeneration" | "imageEditing";
}

export interface AiSelectionResult {
  selected: AiProviderId | null;
  resolvedProvider: AiProviderInfo | null;
  reason: string;
  providers: AiProviderInfo[];
  fallbackUsed: boolean;
}

const SELECTION_STORAGE_KEY = "jarvis_ai_selection_v1";

export interface StoredAiSelection {
  mode: AiSelectionMode;
  preferredProvider: AiProviderId;
}

export function getStoredAiSelection(): StoredAiSelection {
  try {
    if (typeof localStorage === "undefined") return { mode: "auto", preferredProvider: "gemini" };
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return { mode: "auto", preferredProvider: "gemini" };
    const parsed = JSON.parse(raw) as Partial<StoredAiSelection>;
    const mode = parsed.mode === "manual" ? "manual" : "auto";
    const preferredProvider = typeof parsed.preferredProvider === "string" && parsed.preferredProvider ? parsed.preferredProvider : "gemini";
    return { mode, preferredProvider };
  } catch {
    return { mode: "auto", preferredProvider: "gemini" };
  }
}

export function setStoredAiSelection(sel: StoredAiSelection): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(sel));
  } catch {
    // ignore
  }
}

export async function loadAiProviderRegistry(): Promise<AiProviderInfo[]> {
  try {
    return await fetchAiProviders();
  } catch {
    // Fallback local minimal : ne pas inventer de disponibilité, marquer Gemini comme inconnu côté client.
    return [
      {
        id: "gemini",
        name: "Gemini",
        status: "unavailable",
        capabilities: { chat: true, vision: true, imageGeneration: false, imageEditing: false },
        note: "État indisponible (impossible de joindre le serveur).",
        model: null,
        providerFamily: "core",
      },
      { id: "chatgpt", name: "ChatGPT", status: "not_configured", capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false }, note: "État inconnu hors connexion serveur.", providerFamily: "core" },
      { id: "claude", name: "Claude", status: "not_configured", capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false }, note: "État inconnu hors connexion serveur.", providerFamily: "core" },
      { id: "deepseek", name: "DeepSeek", status: "not_configured", capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false }, note: "État inconnu hors connexion serveur.", providerFamily: "core" },
      { id: "perplexity", name: "Perplexity", status: "not_configured", capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false }, note: "État inconnu hors connexion serveur.", providerFamily: "core" },
      { id: "llama", name: "Llama", status: "unavailable", capabilities: { chat: false, vision: false, imageGeneration: false, imageEditing: false }, note: "État inconnu hors connexion serveur.", providerFamily: "core" },
    ];
  }
}

function isUsable(p: AiProviderInfo, cap: AiSelectionRequest["capability"] = "chat"): boolean {
  return p.status === "available" && Boolean(p.capabilities[cap || "chat"]);
}

function pickBestOllamaChatFallback(providers: AiProviderInfo[]): AiProviderInfo | null {
  // Préférence: Qwen 3B > 1.5B > 0.5B > tout autre chat Ollama disponible
  const pref = ["ollama:qwen2.5:3b", "ollama:qwen2.5:1.5b", "ollama:qwen2.5:0.5b"];
  for (const id of pref) {
    const p = providers.find((x) => x.id === id && isUsable(x, "chat"));
    if (p) return p;
  }
  return providers.find((p) => p.providerFamily === "ollama" && isUsable(p, "chat")) || null;
}

export function selectAiProvider(
  providers: AiProviderInfo[],
  req: AiSelectionRequest
): AiSelectionResult {
  const cap = req.capability ?? "chat";

  if (req.mode === "manual" && req.preferredProvider) {
    const chosen = providers.find((p) => p.id === req.preferredProvider) || null;
    if (chosen && isUsable(chosen, cap)) {
      return { selected: chosen.id, resolvedProvider: chosen, reason: "Fournisseur sélectionné manuellement (disponible).", providers, fallbackUsed: false };
    }
    // Fallback: Gemini si disponible, sinon meilleur Qwen/Ollama chat disponible, sinon aucun.
    const gemini = providers.find((p) => p.id === "gemini" && isUsable(p, cap)) || null;
    if (gemini) {
      return {
        selected: gemini.id,
        resolvedProvider: gemini,
        reason: "Fournisseur manuel indisponible/non opérationnel : repli vers Gemini (cerveau principal).",
        providers,
        fallbackUsed: true,
      };
    }
    const ollamaAlt = cap === "chat" ? pickBestOllamaChatFallback(providers) : providers.find((p) => p.id !== "gemini" && isUsable(p, cap)) || null;
    if (ollamaAlt) {
      return {
        selected: ollamaAlt.id,
        resolvedProvider: ollamaAlt,
        reason: "Fournisseur manuel indisponible : repli vers un modèle local Ollama disponible.",
        providers,
        fallbackUsed: true,
      };
    }
    return {
      selected: null,
      resolvedProvider: null,
      reason: "Fournisseur manuel indisponible et aucun repli opérationnel disponible.",
      providers,
      fallbackUsed: false,
    };
  }

  // Auto : priorité Gemini (cerveau principal), puis alternative Ollama locale (Qwen) si Gemini indisponible.
  const gemini = providers.find((p) => p.id === "gemini" && isUsable(p, cap)) || null;
  if (gemini) {
    return { selected: gemini.id, resolvedProvider: gemini, reason: "Sélection automatique : Gemini (cerveau principal) disponible.", providers, fallbackUsed: false };
  }
  const ollamaAlt = cap === "chat" ? pickBestOllamaChatFallback(providers) : providers.find((p) => p.id !== "gemini" && isUsable(p, cap)) || null;
  if (ollamaAlt) {
    return {
      selected: ollamaAlt.id,
      resolvedProvider: ollamaAlt,
      reason: "Sélection automatique : Gemini indisponible, repli vers un modèle Qwen/Ollama local disponible.",
      providers,
      fallbackUsed: true,
    };
  }
  const alt = providers.find((p) => p.id !== "gemini" && isUsable(p, cap)) || null;
  if (alt) {
    return { selected: alt.id, resolvedProvider: alt, reason: "Sélection automatique : repli vers un fournisseur disponible.", providers, fallbackUsed: true };
  }
  return { selected: null, resolvedProvider: null, reason: "Aucun fournisseur opérationnel pour la capacité demandée.", providers, fallbackUsed: false };
}

export async function resolveAiProvider(req: AiSelectionRequest): Promise<AiSelectionResult> {
  const providers = await loadAiProviderRegistry();
  return selectAiProvider(providers, req);
}
