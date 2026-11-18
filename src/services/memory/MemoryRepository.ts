import type { MemoryCategory, MemoryItem, MemoryKnowledgeKind } from "../../types/jarvis";
import { idbClear, idbDelete, idbGetAll, idbPut } from "../storage/IndexedDbStore";

const MEMORY_STORAGE_KEY = "jarvis_persistent_memory_v1";
const MEMORY_ENABLED_KEY = "jarvis_memory_enabled_v1";

export interface MemoryRepository {
  listMemories(): MemoryItem[];
  hydrateFromIndexedDb(): Promise<MemoryItem[]>;
  addMemory(
    fact: string,
    category?: MemoryCategory,
    modeId?: string,
    opts?: {
      kind?: MemoryKnowledgeKind;
      source?: MemoryItem["source"];
      sensitive?: boolean;
      confidence?: number;
      note?: string;
    }
  ): MemoryItem | null;
  updateMemory(
    id: string,
    fact: string,
    category?: MemoryCategory
  ): MemoryItem | null;
  togglePinMemory(id: string): MemoryItem | null;
  toggleDisableMemory(id: string): MemoryItem | null;
  removeMemory(id: string): void;
  clearMemories(): void;
  isMemoryEnabled(): boolean;
  setMemoryEnabled(enabled: boolean): void;
  exportMemories(): string;
  importMemories(json: string): { imported: number; error?: string };
  getContextMemories(modeId?: string): MemoryItem[];
  /** Détache les souvenirs d'un mode supprimé sans effacer leur contenu ni leur identifiant. */
  removeModeReferences(modeId: string): void;
}

const SENSITIVE_PATTERNS = [
  /\b(mot de passe|mdp|password|passcode|pin)\b/i,
  /\b(carte bancaire|cb|iban|bic|num[eé]ro de carte|crypto)\b/i,
  /\b(s[eé]cu|s[eé]curit[eé] sociale|num[eé]ro s[eé]cu)\b/i,
  /\b(diagnostic|maladie|traitement|ordonnance|sant[eé] mentale)\b/i,
  /\b(secret|confidentiel|confidential)\b/i,
];

export function detectSensitiveMemory(text: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

export function normalizeMemoryCategory(cat?: MemoryCategory): MemoryCategory {
  switch (cat) {
    case "identite":
    case "preference":
      return "profil_preferences";
    case "projet":
      return "projets";
    case "consigne":
      return "habitudes_travail";
    case "profil_preferences":
    case "projets":
    case "objectifs":
    case "decisions":
    case "habitudes_travail":
    case "informations_importantes":
      return cat;
    case "autre":
    default:
      return "informations_importantes";
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeItem(m: any): MemoryItem | null {
  if (!m || typeof m !== "object") return null;
  if (typeof m.id !== "string" || typeof m.fact !== "string") return null;
  const createdAt = typeof m.createdAt === "number" ? m.createdAt : Date.now();
  const updatedAt = typeof m.updatedAt === "number" ? m.updatedAt : createdAt;
  const item: MemoryItem = {
    id: m.id,
    fact: String(m.fact),
    category: (m.category as MemoryCategory) || "autre",
    pinned: Boolean(m.pinned),
    createdAt,
    updatedAt,
    modeId: typeof m.modeId === "string" ? m.modeId : undefined,
    kind: (m.kind as MemoryKnowledgeKind) || "fact",
    confidence:
      typeof m.confidence === "number"
        ? Math.max(0, Math.min(1, m.confidence))
        : undefined,
    source: m.source,
    // Un import ne peut pas désactiver le marquage sensible : la détection fait foi.
    sensitive: Boolean(m.sensitive) || detectSensitiveMemory(String(m.fact)),
    disabled: Boolean(m.disabled),
    lastAccessedAt: typeof m.lastAccessedAt === "number" ? m.lastAccessedAt : undefined,
    note: typeof m.note === "string" ? m.note : undefined,
  };
  return item;
}

function sortMemories(items: MemoryItem[]): MemoryItem[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
  });
}

class LocalMemoryRepository implements MemoryRepository {
  private writeLocalStorage(items: MemoryItem[]): void {
    try {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore quota errors
    }
  }

  public isMemoryEnabled(): boolean {
    try {
      const raw = localStorage.getItem(MEMORY_ENABLED_KEY);
      if (raw === null) return true;
      return raw === "true";
    } catch {
      return true;
    }
  }

  public setMemoryEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(MEMORY_ENABLED_KEY, String(enabled));
    } catch {
      // ignore
    }
  }

  public listMemories(): MemoryItem[] {
    try {
      const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const valid = parsed
        .map(normalizeItem)
        .filter((m): m is MemoryItem => m !== null);
      return sortMemories(valid);
    } catch {
      return [];
    }
  }

  public async hydrateFromIndexedDb(): Promise<MemoryItem[]> {
    const localItems = this.listMemories();
    const idbItems = (await idbGetAll<MemoryItem>("memories"))
      .map(normalizeItem)
      .filter((m): m is MemoryItem => m !== null);

    if (idbItems.length === 0 && localItems.length > 0) {
      for (const item of localItems) {
        await idbPut("memories", item);
      }
      return localItems;
    }

    if (idbItems.length > 0) {
      const mergedMap = new Map<string, MemoryItem>();
      for (const item of localItems) mergedMap.set(item.id, item);
      for (const item of idbItems) mergedMap.set(item.id, item);
      const merged = sortMemories(Array.from(mergedMap.values()));
      this.writeLocalStorage(merged);
      return merged;
    }

    return localItems;
  }

  public addMemory(
    fact: string,
    category: MemoryCategory = "autre",
    modeId?: string,
    opts?: {
      kind?: MemoryKnowledgeKind;
      source?: MemoryItem["source"];
      sensitive?: boolean;
      confidence?: number;
      note?: string;
    }
  ): MemoryItem | null {
    if (!this.isMemoryEnabled()) return null;
    const trimmed = fact.trim();
    if (!trimmed) return null;

    const current = this.listMemories();
    const duplicate = current.some(
      (item) => item.fact.toLowerCase() === trimmed.toLowerCase() && item.modeId === modeId
    );
    if (duplicate) return null;

    const now = Date.now();
    const sensitive = opts?.sensitive ?? detectSensitiveMemory(trimmed);
    const item: MemoryItem = {
      id: generateId(),
      fact: trimmed,
      category,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      modeId,
      kind: opts?.kind ?? "fact",
      source: opts?.source ?? "user",
      sensitive,
      disabled: false,
      confidence: opts?.confidence,
      note: opts?.note,
    };
    const next = sortMemories([item, ...current]).slice(0, 200);
    this.writeLocalStorage(next);
    void idbPut("memories", item);
    return item;
  }

  public updateMemory(
    id: string,
    fact: string,
    category?: MemoryCategory
  ): MemoryItem | null {
    const trimmed = fact.trim();
    if (!trimmed) return null;

    const current = this.listMemories();
    let updatedItem: MemoryItem | null = null;
    const next = current.map((item) => {
      if (item.id !== id) return item;
      updatedItem = {
        ...item,
        fact: trimmed,
        category: category ?? item.category ?? "autre",
        updatedAt: Date.now(),
        sensitive: item.sensitive || detectSensitiveMemory(trimmed),
      };
      return updatedItem;
    });

    if (!updatedItem) return null;
    const sorted = sortMemories(next);
    this.writeLocalStorage(sorted);
    void idbPut("memories", updatedItem);
    return updatedItem;
  }

  public togglePinMemory(id: string): MemoryItem | null {
    const current = this.listMemories();
    let updatedItem: MemoryItem | null = null;
    const next = current.map((item) => {
      if (item.id !== id) return item;
      updatedItem = {
        ...item,
        pinned: !item.pinned,
        updatedAt: Date.now(),
      };
      return updatedItem;
    });

    if (!updatedItem) return null;
    const sorted = sortMemories(next);
    this.writeLocalStorage(sorted);
    void idbPut("memories", updatedItem);
    return updatedItem;
  }

  public toggleDisableMemory(id: string): MemoryItem | null {
    const current = this.listMemories();
    let updatedItem: MemoryItem | null = null;
    const next = current.map((item) => {
      if (item.id !== id) return item;
      updatedItem = {
        ...item,
        disabled: !item.disabled,
        updatedAt: Date.now(),
      };
      return updatedItem;
    });
    if (!updatedItem) return null;
    const sorted = sortMemories(next);
    this.writeLocalStorage(sorted);
    void idbPut("memories", updatedItem);
    return updatedItem;
  }

  public removeMemory(id: string): void {
    const next = this.listMemories().filter((m) => m.id !== id);
    this.writeLocalStorage(next);
    void idbDelete("memories", id);
  }

  public clearMemories(): void {
    try {
      localStorage.removeItem(MEMORY_STORAGE_KEY);
    } catch {
      // Ignore
    }
    void idbClear("memories");
  }

  public exportMemories(): string {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: "3.0-module6",
      memories: this.listMemories(),
    };
    return JSON.stringify(payload, null, 2);
  }

  public importMemories(json: string): { imported: number; error?: string } {
    try {
      const parsed = JSON.parse(json) as any;
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.memories) ? parsed.memories : null;
      if (!items) return { imported: 0, error: "Format invalide: tableau de mémoires introuvable." };
      const current = this.listMemories();
      const byId = new Map(current.map((m) => [m.id, m]));
      let imported = 0;
      // Garde-fou : ne jamais dépasser la limite de 200 souvenirs ni importer de faits vides.
      const MAX_IMPORT = 200;
      for (const raw of items.slice(0, MAX_IMPORT)) {
        const norm = normalizeItem(raw);
        if (!norm || !norm.fact.trim()) continue;
        const id = byId.has(norm.id) ? generateId() : norm.id;
        const item = { ...norm, id, updatedAt: Date.now(), source: "import" as const };
        byId.set(id, item);
        void idbPut("memories", item);
        imported += 1;
      }
      const merged = sortMemories(Array.from(byId.values()));
      this.writeLocalStorage(merged);
      return { imported };
    } catch (e) {
      return { imported: 0, error: e instanceof Error ? e.message : "Échec import." };
    }
  }

  public getContextMemories(modeId?: string): MemoryItem[] {
    if (!this.isMemoryEnabled()) return [];
    return this.listMemories().filter((m) => {
      if (m.disabled) return false;
      return modeId ? !m.modeId || m.modeId === modeId : true;
    });
  }

  public removeModeReferences(modeId: string): void {
    if (!modeId) return;
    const updated = this.listMemories().map((m) =>
      m.modeId === modeId ? { ...m, modeId: undefined, updatedAt: Date.now() } : m
    );
    const changed = updated.filter((m) => !m.modeId);
    if (changed.length === 0) return;
    this.writeLocalStorage(updated);
    for (const item of changed) void idbPut("memories", item);
  }
}

export const memoryRepository: MemoryRepository = new LocalMemoryRepository();
