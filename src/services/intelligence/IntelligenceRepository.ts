import type { IntelligenceHistoryEvent, IntelligenceProfile } from "../../types/jarvis";
import {
  idbClear,
  idbClearRequired,
  idbDelete,
  idbDeleteRequired,
  idbGetAll,
  idbGetAllRequired,
  idbPut,
  idbPutRequired,
} from "../storage/IndexedDbStore";

const PROFILE_KEY = "jarvis_intelligence_profile_v1";

export function getDefaultIntelligenceProfile(): IntelligenceProfile {
  return {
    id: "default",
    baseTone: "elegant",
    humorLevel: 0.3,
    sarcasmLevel: 0.25,
    proactivityLevel: 0.5,
    detailPreference: "balanced",
    askWhenMissingInfo: true,
    memoryEnabled: true,
    autoSaveSensitive: false,
    updatedAt: Date.now(),
  };
}

export function loadIntelligenceProfile(): IntelligenceProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return getDefaultIntelligenceProfile();
    const p = JSON.parse(raw) as Partial<IntelligenceProfile>;
    return {
      ...getDefaultIntelligenceProfile(),
      ...p,
      id: "default",
      autoSaveSensitive: false, // sécurité: jamais activé par défaut/automatiquement
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
    };
  } catch {
    return getDefaultIntelligenceProfile();
  }
}

export function saveIntelligenceProfile(profile: IntelligenceProfile): IntelligenceProfile {
  const next: IntelligenceProfile = {
    ...getDefaultIntelligenceProfile(),
    ...profile,
    id: "default",
    autoSaveSensitive: false,
    humorLevel: Math.max(0, Math.min(1, profile.humorLevel)),
    sarcasmLevel: Math.max(0, Math.min(1, profile.sarcasmLevel)),
    proactivityLevel: Math.max(0, Math.min(1, profile.proactivityLevel)),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  // Synchroniser l'état mémoire global si présent
  try {
    localStorage.setItem("jarvis_memory_enabled_v1", String(next.memoryEnabled));
  } catch {
    // ignore
  }
  return next;
}

export async function listIntelligenceHistory(): Promise<IntelligenceHistoryEvent[]> {
  const items = await idbGetAllRequired<IntelligenceHistoryEvent>("intelligenceHistory");
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addIntelligenceHistory(
  event: Omit<IntelligenceHistoryEvent, "id" | "createdAt">
): Promise<IntelligenceHistoryEvent> {
  const item: IntelligenceHistoryEvent = {
    ...event,
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ih-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  await idbPutRequired("intelligenceHistory", item);
  return item;
}

export async function removeIntelligenceHistory(id: string): Promise<void> {
  await idbDeleteRequired("intelligenceHistory", id);
}

export async function clearIntelligenceHistory(): Promise<void> {
  await idbClearRequired("intelligenceHistory");
}

export function exportIntelligenceState(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: "3.0-module6",
      profile: loadIntelligenceProfile(),
    },
    null,
    2
  );
}
