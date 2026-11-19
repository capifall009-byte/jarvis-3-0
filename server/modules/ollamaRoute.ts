import { Router } from "express";
import type { Request, Response } from "express";
import { buildJarvisSystemInstruction } from "../jarvisPrompt.ts";
import type { MemoryContextItem } from "../jarvisPrompt.ts";
import { analyzeUserSentiment } from "../../shared/sentiment.ts";

const OLLAMA_HOST = () => (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");

export interface OllamaModelInfo {
  name: string;
  model: string;
  size?: number;
  modified_at?: string;
  details?: any;
  capabilities?: string[];
}

export interface OllamaDetectedModel {
  id: string; // e.g. ollama:qwen2.5:0.5b
  ollamaName: string; // exact name for API
  displayName: string;
  family: "qwen" | "moondream" | "other";
  kind: "chat" | "vision";
  available: boolean;
  capabilities: {
    chat: boolean;
    vision: boolean;
    imageGeneration: boolean;
    imageEditing: boolean;
  };
  note: string;
  size?: number;
  parameterSize?: string;
}

const TARGET_CHAT_MODELS = new Set(["qwen2.5:0.5b", "qwen2.5:1.5b", "qwen2.5:3b"]);
const TARGET_VISION_MODELS = new Set(["moondream:latest", "moondream"]);

function normalizeOllamaId(name: string): string {
  return `ollama:${name}`;
}

function displayNameFor(name: string): string {
  if (name === "qwen2.5:0.5b") return "Qwen 2.5 0.5B (Ollama local)";
  if (name === "qwen2.5:1.5b") return "Qwen 2.5 1.5B (Ollama local)";
  if (name === "qwen2.5:3b") return "Qwen 2.5 3B (Ollama local)";
  if (name.startsWith("moondream")) return "Moondream (Ollama local)";
  return `${name} (Ollama local)`;
}

export async function fetchOllamaTags(timeoutMs = 2000): Promise<{ ok: boolean; models: OllamaModelInfo[]; error?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_HOST()}/api/tags`, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, models: [], error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { models?: OllamaModelInfo[] };
    return { ok: true, models: Array.isArray(data.models) ? data.models : [] };
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export async function detectOllamaTargetModels(): Promise<{ reachable: boolean; host: string; models: OllamaDetectedModel[]; error?: string }> {
  const host = OLLAMA_HOST();
  const tags = await fetchOllamaTags(2500);
  const installed = new Map(tags.models.map((m) => [m.name, m] as const));

  const mkChat = (name: string): OllamaDetectedModel => {
    const found = installed.get(name);
    const available = tags.ok && Boolean(found);
    const caps = found?.capabilities || [];
    return {
      id: normalizeOllamaId(name),
      ollamaName: name,
      displayName: displayNameFor(name),
      family: "qwen",
      kind: "chat",
      available,
      capabilities: { chat: available, vision: false, imageGeneration: false, imageEditing: false },
      note: available
        ? `Modèle conversationnel local Ollama détecté (${name}, ${found?.details?.parameter_size || "taille inconnue"}). Peut servir d’alternative lorsque Gemini est indisponible.`
        : tags.ok
          ? `Modèle non installé dans Ollama (${name}).`
          : `Ollama injoignable (${host}).`,
      size: found?.size,
      parameterSize: found?.details?.parameter_size,
    };
  };

  const mkVision = (name: string): OllamaDetectedModel => {
    const found = installed.get(name) || installed.get("moondream:latest") || installed.get("moondream");
    const effectiveName = found?.name || name;
    const caps = found?.capabilities || [];
    const hasVision = caps.includes("vision") || (found?.details?.families || []).includes("clip");
    const available = tags.ok && Boolean(found) && hasVision;
    let note = "";
    if (!tags.ok) note = `Ollama injoignable (${host}).`;
    else if (!found) note = `Modèle non installé dans Ollama (${name}).`;
    else if (!hasVision) note = `Modèle détecté (${effectiveName}) mais capacités vision non confirmées par Ollama.`;
    else note = `Modèle d’analyse d’images local Ollama détecté (${effectiveName}). Utilisable pour analyse/description d’images via endpoint Ollama compatible.`;
    return {
      id: normalizeOllamaId(effectiveName),
      ollamaName: effectiveName,
      displayName: displayNameFor(effectiveName),
      family: "moondream",
      kind: "vision",
      available,
      capabilities: { chat: false, vision: available, imageGeneration: false, imageEditing: false },
      note,
      size: found?.size,
      parameterSize: found?.details?.parameter_size,
    };
  };

  const models: OllamaDetectedModel[] = [
    mkChat("qwen2.5:0.5b"),
    mkChat("qwen2.5:1.5b"),
    mkChat("qwen2.5:3b"),
    mkVision("moondream:latest"),
  ];

  return { reachable: tags.ok, host, models, error: tags.error };
}

function capText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function buildOllamaMessages(body: any): Array<{ role: "system" | "user" | "assistant"; content: string; images?: string[] }> {
  const message = capText(body?.message, 8000);
  const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
  const memories = Array.isArray(body?.memories) ? body.memories.slice(0, 40) : [];
  const mode = body?.mode;
  const intelligenceProfile = body?.intelligenceProfile;
  const projects = Array.isArray(body?.projects) ? body.projects : [];
  const recentUserMessages = history.filter((h: any) => h?.role === "user" && h?.text).map((h: any) => String(h.text));
  const sentiment = analyzeUserSentiment(message, recentUserMessages);

  // Réutilisation du prompt système JARVIS (mémoire centrale, règles, identité) pour cohérence.
  // Limité en taille pour rester utilisable avec les petits modèles locaux (Qwen 0.5B/1.5B/3B).
  let systemInstruction = buildJarvisSystemInstruction(
    memories as MemoryContextItem[],
    sentiment,
    mode,
    body?.vocalStyle,
    intelligenceProfile,
    projects,
    body?.timeContext
  );
  if (systemInstruction.length > 14000) {
    systemInstruction = systemInstruction.slice(0, 13980) + "\n[… contexte abrégé pour modèle local …]";
  }

  const msgs: Array<{ role: "system" | "user" | "assistant"; content: string; images?: string[] }> = [
    { role: "system", content: systemInstruction },
  ];
  for (const h of history) {
    if (!h?.text || !String(h.text).trim()) continue;
    msgs.push({
      role: h.role === "assistant" ? "assistant" : "user",
      content: capText(h.text, 3000),
    });
  }
  msgs.push({ role: "user", content: message });
  return msgs;
}

async function ollamaChatNonStream(model: string, messages: any[], options?: any) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${OLLAMA_HOST()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false, options }),
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false as const, ms, status: res.status, error: text || `HTTP ${res.status}` };
    }
    const data = await res.json() as any;
    const content = data?.message?.content ?? data?.response ?? "";
    return { ok: true as const, ms, status: 200, content: String(content || ""), raw: data };
  } catch (e) {
    const ms = Date.now() - started;
    return { ok: false as const, ms, status: 0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeout);
  }
}

export function createOllamaRouter(): Router {
  const router = Router();

  router.get("/ai/ollama/models", async (_req: Request, res: Response) => {
    const detected = await detectOllamaTargetModels();
    res.json(detected);
  });

  // Chat conversationnel (non-streaming JSON pour compatibilité simple et tests réels)
  router.post("/ai/ollama/chat", async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const model = String(body.model || "").trim();
    if (!model) {
      res.status(400).json({ error: "Paramètre 'model' requis." });
      return;
    }
    const detected = await detectOllamaTargetModels();
    const target = detected.models.find((m) => m.ollamaName === model || m.id === model);
    if (target && target.kind !== "chat") {
      res.status(400).json({ error: `Le modèle ${model} n'est pas configuré comme modèle conversationnel.`, model });
      return;
    }
    if (target && !target.available && detected.reachable) {
      res.status(503).json({ error: `Modèle Ollama indisponible: ${model}.`, note: target.note, model });
      return;
    }
    const effectiveModel = target?.ollamaName || model;
    const messages = buildOllamaMessages(body);
    // Cap output reasonably for small local models
    const result = await ollamaChatNonStream(effectiveModel, messages, { temperature: 0.4 });
    if (!result.ok) {
      res.status(result.status >= 400 ? result.status : 502).json({ error: result.error || "Erreur Ollama", model: effectiveModel, responseMs: result.ms, detectionError: detected.error || null });
      return;
    }
    res.json({
      reply: (result.content || "").trim() || "(Réponse vide du modèle)",
      model: effectiveModel,
      provider: "ollama",
      responseMs: result.ms,
    });
  });

  // Analyse d'image (Moondream ou autre modèle vision Ollama détecté)
  router.post("/ai/ollama/vision", async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const model = String(body.model || "moondream:latest").trim();
    const prompt = capText(body.prompt || body.message || "Décris cette image en détail.", 4000);
    const imageData = String(body.image || body.imageBase64 || "").trim();
    if (!imageData) {
      res.status(400).json({ error: "Image requise (base64 dans 'image' ou 'imageBase64')." });
      return;
    }
    const detected = await detectOllamaTargetModels();
    const target = detected.models.find((m) => m.ollamaName === model || m.id === model || (model.startsWith("moondream") && m.family === "moondream"));
    const effectiveModel = target?.ollamaName || model;
    if (target && !target.available && detected.reachable) {
      res.status(503).json({ error: `Modèle vision Ollama indisponible: ${effectiveModel}.`, note: target.note, model: effectiveModel });
      return;
    }
    // Strip data URL prefix if present
    const base64 = imageData.replace(/^data:[^;]+;base64,/, "");
    const messages = [
      { role: "user", content: prompt, images: [base64] },
    ];
    const result = await ollamaChatNonStream(effectiveModel, messages as any, { temperature: 0.2 });
    if (!result.ok) {
      res.status(result.status >= 400 ? result.status : 502).json({ error: result.error || "Erreur Ollama vision", model: effectiveModel, responseMs: result.ms, detectionError: detected.error || null });
      return;
    }
    res.json({
      reply: (result.content || "").trim() || "(Réponse vide du modèle)",
      model: effectiveModel,
      provider: "ollama",
      responseMs: result.ms,
      capability: "vision",
    });
  });

  // Test réel (génération texte ou vision) avec mesure temps/erreurs
  router.post("/ai/ollama/test", async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const model = String(body.model || "").trim();
    if (!model) {
      res.status(400).json({ error: "Paramètre 'model' requis." });
      return;
    }
    const detected = await detectOllamaTargetModels();
    const target = detected.models.find((m) => m.ollamaName === model || m.id === model);
    if (!target) {
      res.status(404).json({ error: "Modèle cible non reconnu.", model });
      return;
    }
    if (!target.available && detected.reachable) {
      res.json({ ok: false, model: target.ollamaName, displayName: target.displayName, status: "unavailable", error: target.note });
      return;
    }
    const effectiveModel = target.ollamaName || model;
    if (target.kind === "vision") {
      // Vision test requires an image; if not provided, report capability/status honestly.
      const imageData = String(body.image || body.imageBase64 || "").trim();
      if (!imageData) {
        res.json({ ok: false, model: effectiveModel, displayName: target.displayName, status: "needs_image", note: "Test vision réel: fournissez une image (base64) pour tester l'analyse.", capability: "vision" });
        return;
      }
      const prompt = capText(body.prompt || "Décris brièvement cette image.", 1000);
      const base64 = imageData.replace(/^data:[^;]+;base64,/, "");
      const result = await ollamaChatNonStream(effectiveModel, [{ role: "user", content: prompt, images: [base64] }] as any, { temperature: 0.2 });
      res.json({ ok: result.ok, model: effectiveModel, displayName: target.displayName, capability: "vision", responseMs: result.ms, reply: result.ok ? (result.content || "").slice(0, 500) : undefined, error: result.ok ? undefined : (result.error + (detected.error && !detected.reachable ? ` (détection: ${detected.error})` : "")) });
      return;
    }
    // Chat test
    const prompt = capText(body.prompt || "Réponds uniquement par: OK", 500);
    const result = await ollamaChatNonStream(effectiveModel, [{ role: "user", content: prompt }], { temperature: 0.1 });
    res.json({ ok: result.ok, model: effectiveModel, displayName: target.displayName, capability: "chat", responseMs: result.ms, reply: result.ok ? (result.content || "").slice(0, 500) : undefined, error: result.ok ? undefined : (result.error + (detected.error && !detected.reachable ? ` (détection: ${detected.error})` : "")) });
  });

  return router;
}
