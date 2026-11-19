export type AiProviderId = string;
export type AiProviderStatus = "available" | "not_configured" | "unavailable";

export interface AiProviderCapabilities {
  chat: boolean;
  vision: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
}

export interface AiProviderInfo {
  id: AiProviderId;
  name: string;
  status: AiProviderStatus;
  capabilities: AiProviderCapabilities;
  note: string;
  model?: string | null;
  providerFamily?: "core" | "ollama";
  ollamaName?: string;
  responseMs?: number | null;
  lastError?: string | null;
}

export interface OllamaDetectionResponse {
  reachable: boolean;
  host: string;
  models: any[];
  error?: string;
}

export interface ProvidersPayload {
  providers?: AiProviderInfo[];
  budget?: string;
  billing?: string;
  ollama?: OllamaDetectionResponse;
}

export async function fetchAiProviders(): Promise<AiProviderInfo[]> {
  const res = await fetch("/api/ai/providers");
  if (!res.ok) throw new Error("Impossible de charger les fournisseurs IA.");
  const data = (await res.json()) as ProvidersPayload;
  return Array.isArray(data.providers) ? data.providers : [];
}

export async function fetchOllamaModels(): Promise<OllamaDetectionResponse> {
  const res = await fetch("/api/ai/ollama/models");
  if (!res.ok) throw new Error("Impossible de charger les modèles Ollama.");
  return (await res.json()) as OllamaDetectionResponse;
}

export async function testOllamaModel(params: {
  model: string;
  prompt?: string;
  imageBase64?: string;
}): Promise<any> {
  const res = await fetch("/api/ai/ollama/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) {
    return { ok: false, error: `Erreur serveur (${res.status})` };
  }
  return data;
}

export async function chatWithOllama(params: {
  model: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  memories?: any[];
  mode?: any;
  vocalStyle?: any;
  intelligenceProfile?: any;
  projects?: any[];
  userTimeZone?: string;
  timeContext?: any;
}): Promise<{ reply: string; model: string; provider: string; responseMs?: number }> {
  const res = await fetch("/api/ai/ollama/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data && typeof data.error === "string" && data.error) ||
        `Erreur Ollama (${res.status})`
    );
  }
  return data as { reply: string; model: string; provider: string; responseMs?: number };
}

export async function analyzeImageWithOllama(params: {
  model: string;
  prompt?: string;
  imageBase64: string;
}): Promise<{ reply: string; model: string; responseMs?: number }> {
  const res = await fetch("/api/ai/ollama/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data && typeof data.error === "string" && data.error) ||
        `Erreur vision Ollama (${res.status})`
    );
  }
  return data as { reply: string; model: string; responseMs?: number };
}
