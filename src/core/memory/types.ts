/**
 * Types de la mémoire contextuelle locale — JARVIS 4.0 Phase 8.
 *
 * ADDITIF : cette couche vit dans `CoreState.contextMemory`. Elle ne lit, ne
 * modifie et ne supprime AUCUNE donnée de `MemoryRepository` (localStorage
 * `jarvis_persistent_memory_v1` / IndexedDB `memories`) ni de
 * `ConversationRepository` (`jarvis_conversations_v1`). Ces dépôts restent la
 * source de vérité de l'utilisateur ; la mémoire contextuelle est un index
 * local, déterministe, borné et réversible.
 *
 * Aucun service externe, aucun embedding distant, aucune dépendance ajoutée.
 * La « similarité sémantique » est une approximation locale explicitement
 * documentée comme telle (voir `text.ts`).
 */

export const CONTEXT_MEMORY_SCHEMA = "jarvis-context-memory-v1" as const;

/** Court terme = épisodes récents et volatils ; long terme = faits consolidés. */
export type ContextMemoryScope = "short" | "long";
export type ContextMemoryKind = "episode" | "fact" | "preference" | "rule" | "decision";
export type ContextMemorySource = "user" | "assistant" | "system" | "agent" | "mission" | "bridge";
export type ContextMemoryShareMode = "private" | "agents" | "all";

/** Aligné sur `AGENT_IDS` (Phase 4) ; liste locale pour éviter un cycle de valeurs. */
export const CONTEXT_AGENT_ROLES = [
  "main", "research", "coding", "planning", "analysis", "creative", "verification", "memory",
] as const;
export type ContextAgentRole = (typeof CONTEXT_AGENT_ROLES)[number];

export interface ContextMemoryShare {
  mode: ContextMemoryShareMode;
  /** Utilisé uniquement si `mode === "agents"` ; toujours borné et validé. */
  allow: ContextAgentRole[];
}

export interface ContextMemoryEntry {
  id: string;
  text: string;
  kind: ContextMemoryKind;
  scope: ContextMemoryScope;
  categories: string[];
  tags: string[];
  source: ContextMemorySource;
  /** Rôle agent à l'origine de l'entrée, le cas échéant. */
  agent?: ContextAgentRole;
  missionId?: string;
  conversationId?: string;
  importance: number;
  confidence: number;
  share: ContextMemoryShare;
  /** Empreinte de normalisation : sert au dédoublonnage exact rapide. */
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  /** Rempli par la consolidation : `short` → `long`. */
  promotedAt?: number;
  /** Conserve la trace d'un rapprochement sans jamais écraser l'original. */
  mergedInto?: string;
  notes?: string;
}

export interface ContextDuplicatePair {
  id: string;
  firstId: string;
  secondId: string;
  similarity: number;
  detectedAt: number;
  /** Toujours « suggested » : AUCUNE fusion ni suppression automatique. */
  status: "suggested" | "reviewed";
  reason: string;
}

export interface ContextMemoryStats {
  total: number;
  short: number;
  long: number;
  byKind: Record<ContextMemoryKind, number>;
  duplicates: number;
  recalls: number;
  lastRecallAt: number;
  lastConsolidationAt: number;
}

export interface ContextMemoryState {
  schema: typeof CONTEXT_MEMORY_SCHEMA;
  entries: ContextMemoryEntry[];
  duplicates: ContextDuplicatePair[];
  recalls: number;
  lastRecallAt: number;
  lastConsolidationAt: number;
}

export interface ContextMemoryStatusView {
  schema: typeof CONTEXT_MEMORY_SCHEMA;
  stats: ContextMemoryStats;
  lastRecallAt: number;
  lastConsolidationAt: number;
  /** Les souvenirs existants ne sont ni comptés ni modifiés ici. */
  preservesExistingMemory: true;
  preservesConversations: true;
  remoteEmbeddings: false;
}

export interface ContextRecallHit {
  entry: ContextMemoryEntry;
  score: number;
  reasons: string[];
}

export interface ContextRecallResult {
  query: string;
  hits: ContextRecallHit[];
  scanned: number;
  strategy: "lexical-contextual-local";
  remote: false;
}

export interface RememberInput {
  text: string;
  kind?: ContextMemoryKind;
  scope?: ContextMemoryScope;
  categories?: string[];
  tags?: string[];
  source?: ContextMemorySource;
  agent?: ContextAgentRole;
  missionId?: string;
  conversationId?: string;
  importance?: number;
  confidence?: number;
  share?: Partial<ContextMemoryShare>;
  notes?: string;
  /** Confirmation explicite pour fusionner un quasi-doublon. */
  mergeDuplicate?: boolean;
}

export interface ContextBridgeItem {
  id?: string;
  fact: string;
  category?: string;
  pinned?: boolean;
  kind?: "fact" | "hypothesis" | "uncertainty";
  confidence?: number;
  source?: "user" | "assistant" | "system" | "import";
  createdAt?: number;
  updatedAt?: number;
}

export const CONTEXT_LIMITS = {
  MAX_ENTRIES: 240,
  MAX_SHORT_ENTRIES: 80,
  MAX_TEXT_CHARS: 2000,
  MAX_CATEGORIES: 8,
  MAX_TAGS: 12,
  MAX_TAG_CHARS: 48,
  MAX_RECALL: 20,
  MAX_DUPLICATES: 40,
  MAX_BRIDGE_ITEMS: 200,
  SHORT_TERM_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  DUPLICATE_THRESHOLD: 0.72,
} as const;

export function emptyContextMemoryState(): ContextMemoryState {
  return {
    schema: CONTEXT_MEMORY_SCHEMA,
    entries: [],
    duplicates: [],
    recalls: 0,
    lastRecallAt: 0,
    lastConsolidationAt: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

const KINDS: readonly ContextMemoryKind[] = ["episode", "fact", "preference", "rule", "decision"];
const SCOPES: readonly ContextMemoryScope[] = ["short", "long"];
const SOURCES: readonly ContextMemorySource[] = ["user", "assistant", "system", "agent", "mission", "bridge"];
const SHARE_MODES: readonly ContextMemoryShareMode[] = ["private", "agents", "all"];

function normalizeShare(value: unknown): ContextMemoryShare {
  const raw = isRecord(value) ? value : {};
  const mode = SHARE_MODES.includes(raw.mode as ContextMemoryShareMode)
    ? (raw.mode as ContextMemoryShareMode)
    : "private";
  const allow = Array.isArray(raw.allow)
    ? raw.allow
        .filter((role): role is ContextAgentRole => CONTEXT_AGENT_ROLES.includes(role as ContextAgentRole))
        .slice(0, CONTEXT_AGENT_ROLES.length)
    : [];
  return { mode, allow };
}

/** Complète un état historique : aucune entrée existante n'est supprimée. */
export function normalizeContextMemoryState(value: unknown): ContextMemoryState {
  const base = emptyContextMemoryState();
  if (!isRecord(value) || value.schema !== CONTEXT_MEMORY_SCHEMA) return base;
  const entries = Array.isArray(value.entries)
    ? value.entries.slice(0, CONTEXT_LIMITS.MAX_ENTRIES).map((raw) => {
        if (!isRecord(raw)) return null;
        const text = cleanText(raw.text, CONTEXT_LIMITS.MAX_TEXT_CHARS);
        if (!text) return null;
        const kind = KINDS.includes(raw.kind as ContextMemoryKind) ? raw.kind as ContextMemoryKind : "fact";
        const scope = SCOPES.includes(raw.scope as ContextMemoryScope) ? raw.scope as ContextMemoryScope : "long";
        const source = SOURCES.includes(raw.source as ContextMemorySource) ? raw.source as ContextMemorySource : "user";
        const createdAt = bounded(raw.createdAt, 0, 0, Number.MAX_SAFE_INTEGER);
        return {
          id: cleanText(raw.id, 80) || `ctx_restored_${createdAt}`,
          text,
          kind,
          scope,
          categories: Array.isArray(raw.categories)
            ? raw.categories.slice(0, CONTEXT_LIMITS.MAX_CATEGORIES).map((c) => cleanText(c, CONTEXT_LIMITS.MAX_TAG_CHARS)).filter(Boolean)
            : [],
          tags: Array.isArray(raw.tags)
            ? raw.tags.slice(0, CONTEXT_LIMITS.MAX_TAGS).map((t) => cleanText(t, CONTEXT_LIMITS.MAX_TAG_CHARS)).filter(Boolean)
            : [],
          source,
          ...(CONTEXT_AGENT_ROLES.includes(raw.agent as ContextAgentRole) ? { agent: raw.agent as ContextAgentRole } : {}),
          ...(cleanText(raw.missionId, 80) ? { missionId: cleanText(raw.missionId, 80) } : {}),
          ...(cleanText(raw.conversationId, 80) ? { conversationId: cleanText(raw.conversationId, 80) } : {}),
          importance: bounded(raw.importance, 0.5, 0, 1),
          confidence: bounded(raw.confidence, 0.8, 0, 1),
          share: normalizeShare(raw.share),
          fingerprint: cleanText(raw.fingerprint, 120),
          createdAt,
          updatedAt: bounded(raw.updatedAt, createdAt, 0, Number.MAX_SAFE_INTEGER),
          lastAccessedAt: bounded(raw.lastAccessedAt, createdAt, 0, Number.MAX_SAFE_INTEGER),
          accessCount: bounded(raw.accessCount, 0, 0, 1_000_000),
          ...(raw.promotedAt !== undefined ? { promotedAt: bounded(raw.promotedAt, 0, 0, Number.MAX_SAFE_INTEGER) } : {}),
          ...(cleanText(raw.mergedInto, 80) ? { mergedInto: cleanText(raw.mergedInto, 80) } : {}),
          ...(cleanText(raw.notes, 300) ? { notes: cleanText(raw.notes, 300) } : {}),
        } satisfies ContextMemoryEntry;
      }).filter((entry): entry is ContextMemoryEntry => entry !== null)
    : [];
  const duplicates = Array.isArray(value.duplicates)
    ? value.duplicates.slice(0, CONTEXT_LIMITS.MAX_DUPLICATES).filter(isRecord).map((raw) => ({
        id: cleanText(raw.id, 80) || `dup_restored_${bounded(raw.detectedAt, 0, 0, Number.MAX_SAFE_INTEGER)}`,
        firstId: cleanText(raw.firstId, 80),
        secondId: cleanText(raw.secondId, 80),
        similarity: bounded(raw.similarity, 0, 0, 1),
        detectedAt: bounded(raw.detectedAt, 0, 0, Number.MAX_SAFE_INTEGER),
        status: raw.status === "reviewed" ? "reviewed" as const : "suggested" as const,
        reason: cleanText(raw.reason, 200),
      }))
    : [];
  return {
    schema: CONTEXT_MEMORY_SCHEMA,
    entries,
    duplicates,
    recalls: bounded(value.recalls, 0, 0, Number.MAX_SAFE_INTEGER),
    lastRecallAt: bounded(value.lastRecallAt, 0, 0, Number.MAX_SAFE_INTEGER),
    lastConsolidationAt: bounded(value.lastConsolidationAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}
