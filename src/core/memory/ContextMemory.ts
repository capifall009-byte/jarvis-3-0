/**
 * Mémoire contextuelle locale — JARVIS 4.0 Phase 8.
 *
 * Moteur déterministe, borné et audité. Ajout de souvenirs court/long terme,
 * recherche contextuelle locale, détection de doublons, consolidation et
 * partage contrôlé avec les agents. Aucun appel réseau, aucun accès fichier,
 * aucun code fourni par l'appelant n'est exécuté. Les dépôts de mémoire et de
 * conversations existants ne sont jamais lus ni modifiés directement : un
 * pont explicite (`bridge`) peut en copier un sous-ensemble fourni par
 * l'utilisateur, sans effet sur la source.
 */

import type { AuditLog } from "../AuditLog.ts";
import { CONTEXT_AGENT_ROLES, CONTEXT_LIMITS } from "./types.ts";
import type {
  ContextAgentRole,
  ContextBridgeItem,
  ContextDuplicatePair,
  ContextMemoryEntry,
  ContextMemoryKind,
  ContextMemoryScope,
  ContextMemorySource,
  ContextMemoryState,
  ContextMemoryStats,
  ContextMemoryStatusView,
  ContextRecallHit,
  ContextRecallResult,
  RememberInput,
} from "./types.ts";
import { buildIdf, jaccard, textFingerprint, tfIdfScore, tokenize } from "./text.ts";

export class ContextMemoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ContextMemoryError";
    this.code = code;
  }
}

export interface ContextMemoryDeps {
  state: ContextMemoryState;
  audit: AuditLog;
  now: () => number;
  id: (prefix: string) => string;
  isStopped: () => boolean;
}

export interface RecallOptions {
  limit?: number;
  scope?: ContextMemoryScope;
  kinds?: readonly ContextMemoryKind[];
  /** Rôle demandeur : active le filtrage de partage (fail closed). */
  agent?: ContextAgentRole;
  minScore?: number;
  /** `false` pour une lecture pure (passerelle) : aucun compteur ni audit. */
  track?: boolean;
}

export interface SharedContextResult {
  agent: ContextAgentRole;
  query: string;
  hits: ContextRecallHit[];
  /** Entrées écartées par la politique de partage — compteur uniquement. */
  withheld: number;
  remote: false;
}

const KINDS: readonly ContextMemoryKind[] = ["episode", "fact", "preference", "rule", "decision"];
const SCOPES: readonly ContextMemoryScope[] = ["short", "long"];
const SOURCES: readonly ContextMemorySource[] = ["user", "assistant", "system", "agent", "mission", "bridge"];
const SHARE_MODES = ["private", "agents", "all"] as const;

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ContextMemory {
  private readonly state: ContextMemoryState;
  private readonly audit: AuditLog;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly isStopped: () => boolean;
  private tokenCache = new Map<string, string[]>();

  constructor(deps: ContextMemoryDeps) {
    this.state = deps.state;
    this.audit = deps.audit;
    this.now = deps.now;
    this.id = deps.id;
    this.isStopped = deps.isStopped;
  }

  // ---------- lecture ----------

  status(): ContextMemoryStatusView {
    const byKind: Record<ContextMemoryKind, number> = { episode: 0, fact: 0, preference: 0, rule: 0, decision: 0 };
    let short = 0;
    let long = 0;
    for (const entry of this.state.entries) {
      if (entry.scope === "short") short += 1; else long += 1;
      byKind[entry.kind] += 1;
    }
    const stats: ContextMemoryStats = {
      total: this.state.entries.length,
      short,
      long,
      byKind,
      duplicates: this.state.duplicates.filter((pair) => pair.status === "suggested").length,
      recalls: this.state.recalls,
      lastRecallAt: this.state.lastRecallAt,
      lastConsolidationAt: this.state.lastConsolidationAt,
    };
    return {
      schema: this.state.schema,
      stats,
      lastRecallAt: this.state.lastRecallAt,
      lastConsolidationAt: this.state.lastConsolidationAt,
      preservesExistingMemory: true,
      preservesConversations: true,
      remoteEmbeddings: false,
    };
  }

  list(limit = 20): ContextMemoryEntry[] {
    return this.state.entries
      .filter((entry) => !entry.mergedInto)
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, Math.min(limit, CONTEXT_LIMITS.MAX_ENTRIES)))
      .map(clone);
  }

  listDuplicates(): ContextDuplicatePair[] {
    return this.state.duplicates.slice(0, CONTEXT_LIMITS.MAX_DUPLICATES).map(clone);
  }

  private tokens(entry: ContextMemoryEntry): string[] {
    const cached = this.tokenCache.get(entry.id);
    if (cached) return cached;
    const tags = entry.tags.join(" ");
    const categories = entry.categories.join(" ");
    const tokens = tokenize(`${entry.text} ${tags} ${categories}`);
    this.tokenCache.set(entry.id, tokens);
    return tokens;
  }

  // ---------- écriture ----------

  remember(input: RememberInput): ContextMemoryEntry {
    this.assertNotStopped("L'enregistrement en mémoire contextuelle");
    if (!isRecord(input as unknown)) throw new ContextMemoryError("INVALID_INPUT", "Entrée mémoire invalide.");
    const text = cleanText(input.text, CONTEXT_LIMITS.MAX_TEXT_CHARS);
    if (!text) throw new ContextMemoryError("TEXT_REQUIRED", "Un contenu de souvenir est requis.");
    const fingerprint = textFingerprint(text);
    const now = this.now();
    const existing = this.state.entries.find((entry) => entry.fingerprint === fingerprint && !entry.mergedInto);

    if (existing) {
      existing.lastAccessedAt = now;
      existing.accessCount += 1;
      existing.updatedAt = now;
      this.audit.record({
        actor: "context-memory", action: "context_memory_dedup_hit", target: existing.id,
        outcome: "info", detail: "Souvenir identique déjà présent : aucun doublon créé.",
      });
      return clone(existing);
    }

    const normalized = normalizeTextForMatch(text);
    const near = this.findNearest(normalized, fingerprint);
    if (near && input.mergeDuplicate === true) {
      const merged = this.mergeInto(near.entry, input, text, now);
      this.audit.record({
        actor: "context-memory", action: "context_memory_merged", target: near.entry.id,
        outcome: "success", detail: `Fusion explicite (similarité ${near.similarity.toFixed(2)}) : confiance et importance consolidées, aucun doublon créé.`,
      });
      return clone(merged);
    }

    const entry = this.buildEntry(input, text, fingerprint, now);
    this.state.entries.unshift(entry);
    if (near) this.recordDuplicate(near.entry, entry, near.similarity, now);
    this.enforceBounds(now, "creation");
    this.audit.record({
      actor: "context-memory", action: "context_memory_remembered", target: entry.id,
      outcome: "success", detail: `Souvenir ${entry.scope}/${entry.kind} enregistré localement (${entry.text.length} caractères). Source=${entry.source}. Aucune transmission.`,
    });
    return clone(entry);
  }

  /** Copie additive d'un instantané fourni par l'utilisateur. La source n'est jamais touchée. */
  bridge(
    items: readonly ContextBridgeItem[],
    confirm = false,
    defaults: { kind?: ContextMemoryKind; scope?: ContextMemoryScope; tags?: string[] } = {}
  ): { accepted: number; skipped: number } {
    if (confirm !== true) {
      throw new ContextMemoryError("BRIDGE_CONFIRM_REQUIRED", "Copie explicite requise (confirm: true).");
    }
    this.assertNotStopped("La copie de souvenirs existants");
    if (!Array.isArray(items) || items.length > CONTEXT_LIMITS.MAX_BRIDGE_ITEMS) {
      throw new ContextMemoryError("BRIDGE_TOO_LARGE", "Instantané trop volumineux ou invalide.");
    }
    const now = this.now();
    let accepted = 0;
    let skipped = 0;
    for (const raw of items) {
      if (!isRecord(raw)) { skipped += 1; continue; }
      const fact = cleanText(raw.fact, CONTEXT_LIMITS.MAX_TEXT_CHARS);
      if (!fact) { skipped += 1; continue; }
      const fingerprint = textFingerprint(fact);
      if (this.state.entries.some((entry) => entry.fingerprint === fingerprint)) { skipped += 1; continue; }
      const kind: ContextMemoryKind = defaults.kind ?? "fact";
      const scope: ContextMemoryScope = defaults.scope ?? "long";
      const source: ContextMemorySource = SOURCES.includes(raw.source as ContextMemorySource)
        ? raw.source as ContextMemorySource
        : "bridge";
      this.state.entries.unshift({
        id: this.id("ctx_bridge"),
        text: fact,
        kind,
        scope,
        categories: [cleanText(raw.category, CONTEXT_LIMITS.MAX_TAG_CHARS) || "importe"].slice(0, 1),
        tags: [...new Set([...(defaults.tags ?? []), raw.pinned === true ? "epingle" : "local"])].slice(0, CONTEXT_LIMITS.MAX_TAGS),
        source,
        importance: raw.pinned === true ? 0.85 : 0.6,
        confidence: bounded(raw.confidence, 0.7, 0, 1),
        share: { mode: "private", allow: [] },
        fingerprint,
        createdAt: bounded(raw.createdAt, now, 0, now),
        updatedAt: bounded(raw.updatedAt, now, 0, now),
        lastAccessedAt: now,
        accessCount: 0,
        notes: "Copie locale additive d'un souvenir existant ; dépôt d'origine intact.",
      });
      accepted += 1;
    }
    if (accepted > 0) {
      this.enforceBounds(now, "bridge");
      this.audit.record({
        actor: "user", action: "context_memory_bridged", target: `${accepted}`,
        outcome: "success", detail: `${accepted} souvenir(s) copié(s) dans l'index contextuel local, ${skipped} ignoré(s) (doublon/invalide). Les dépôts existants ne sont pas modifiés.`,
      });
    }
    return { accepted, skipped };
  }

  /** Promotion court terme → long terme et bornage déterministe. */
  consolidate(): { promoted: number; pruned: number } {
    this.assertNotStopped("La consolidation de la mémoire contextuelle");
    const now = this.now();
    let promoted = 0;
    for (const entry of this.state.entries) {
      if (entry.scope !== "short") continue;
      const age = now - entry.createdAt;
      const mature = age >= CONTEXT_LIMITS.SHORT_TERM_TTL_MS || (entry.accessCount >= 3 && entry.importance >= 0.6);
      if (!mature) continue;
      entry.scope = "long";
      entry.promotedAt = now;
      entry.updatedAt = now;
      promoted += 1;
    }
    const pruned = this.enforceBounds(now, "consolidation");
    this.state.lastConsolidationAt = now;
    this.audit.record({
      actor: "context-memory", action: "context_memory_consolidated", target: `${promoted}`,
      outcome: "success", detail: `${promoted} souvenir(s) promu(s) en long terme, ${pruned} entrée(s) bornée(s) par priorité. Aucune donnée utilisateur supprimée.`,
    });
    return { promoted, pruned };
  }

  reviewDuplicate(id: string): ContextDuplicatePair {
    this.assertNotStopped("La revue de doublon");
    const pair = this.state.duplicates.find((entry) => entry.id === id);
    if (!pair) throw new ContextMemoryError("DUPLICATE_NOT_FOUND", "Doublon introuvable.");
    pair.status = "reviewed";
    this.audit.record({
      actor: "user", action: "context_memory_duplicate_reviewed", target: id,
      outcome: "success", detail: "Doublon marqué comme examiné ; aucune fusion automatique effectuée.",
    });
    return clone(pair);
  }

  // ---------- recherche et partage ----------

  recall(query: string, options: RecallOptions = {}): ContextRecallResult {
    const cleanQuery = cleanText(query, 500);
    const queryTokens = tokenize(cleanQuery);
    const active = this.state.entries.filter((entry) => !entry.mergedInto);
    const documents = active.map((entry) => this.tokens(entry));
    const idf = buildIdf(documents);
    const now = this.now();
    const limit = Math.max(1, Math.min(bounded(options.limit, 8, 1, CONTEXT_LIMITS.MAX_RECALL), CONTEXT_LIMITS.MAX_RECALL));
    const minScore = bounded(options.minScore, 0.02, 0, 1);

    const hits: ContextRecallHit[] = [];
    for (let i = 0; i < active.length; i += 1) {
      const entry = active[i];
      if (options.scope && entry.scope !== options.scope) continue;
      if (options.kinds && options.kinds.length > 0 && !options.kinds.includes(entry.kind)) continue;
      if (options.agent && !this.canShare(entry, options.agent)) continue;
      const tokens = documents[i];
      if (queryTokens.length === 0 || tokens.length === 0) continue;

      const overlap = jaccard(queryTokens, tokens);
      const tfidf = tfIdfScore(queryTokens, tokens, idf) / 8;
      const ageDays = Math.max(0, (now - entry.updatedAt) / 86_400_000);
      const freshness = 1 / (1 + ageDays / 30);
      const score = Math.max(0, Math.min(1,
        tfidf * 0.5 + overlap * 0.28 + freshness * 0.1 + entry.importance * 0.08 + entry.confidence * 0.04
      ));
      if (score < minScore) continue;
      const reasons: string[] = [];
      if (overlap > 0) reasons.push(`recouvrement ${overlap.toFixed(2)}`);
      if (tfidf > 0) reasons.push(`pertinence TF-IDF ${tfidf.toFixed(2)}`);
      if (entry.scope === "long") reasons.push("mémoire long terme");
      if (entry.promotedAt) reasons.push("consolidé");
      hits.push({ entry: clone(entry), score: Number(score.toFixed(4)), reasons });
    }

    hits.sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt);
    const selected = hits.slice(0, limit);
    if (options.track !== false) {
      for (const hit of selected) {
        const original = this.state.entries.find((entry) => entry.id === hit.entry.id);
        if (original) {
          original.lastAccessedAt = now;
          original.accessCount += 1;
          hit.entry.lastAccessedAt = now;
          hit.entry.accessCount = original.accessCount;
        }
      }
      this.state.recalls += 1;
      this.state.lastRecallAt = now;
      this.audit.record({
        actor: options.agent ? `agent:${options.agent}` : "user",
        action: "context_memory_recall", target: `${selected.length}`,
        outcome: "info", detail: `Recherche contextuelle locale : ${selected.length} souvenir(s) sur ${active.length} indexé(s). Stratégie lexicale-contextuelle, aucun service distant.`,
      });
    }
    return {
      query: cleanQuery,
      hits: selected,
      scanned: active.length,
      strategy: "lexical-contextual-local",
      remote: false,
    };
  }

  /**
   * Contexte destiné à un agent : filtre de partage fail closed et traçable.
   * Phase 9.5 : `track: false` garantit une lecture pure (aucun compteur, aucun
   * audit) lorsque STOP GLOBAL est actif ; le filtre reste appliqué dans tous les cas.
   */
  sharedContext(
    agent: ContextAgentRole,
    query: string,
    limit = 5,
    options: { track?: boolean } = {}
  ): SharedContextResult {
    if (!CONTEXT_AGENT_ROLES.includes(agent)) {
      throw new ContextMemoryError("INVALID_AGENT", "Rôle agent inconnu.");
    }
    const track = options.track !== false;
    const visible = this.state.entries.filter((entry) => !entry.mergedInto).length;
    const result = this.recall(query, { agent, limit, track });
    if (track) {
      this.audit.record({
        actor: `agent:${agent}`, action: "context_memory_shared", target: agent,
        outcome: "info", detail: `${result.hits.length} souvenir(s) transmis au rôle ${agent}, ${visible - result.hits.length} retenu(s) par la politique de partage. Aucune donnée sortante du poste.`,
      });
    }
    return { agent, query, hits: result.hits, withheld: Math.max(0, visible - result.hits.length), remote: false };
  }

  canShare(entry: ContextMemoryEntry, agent: ContextAgentRole): boolean {
    if (!entry || entry.mergedInto) return false;
    if (entry.share.mode === "private") return false;
    if (entry.share.mode === "all") return true;
    return entry.share.allow.includes(agent);
  }

  // ---------- interne ----------

  private assertNotStopped(action: string): void {
    if (this.isStopped()) {
      throw new ContextMemoryError("STOP_GLOBAL_ACTIVE", `STOP GLOBAL actif : ${action} refusée.`);
    }
  }

  private normalizeText(value: string): string {
    return normalizeTextForMatch(value);
  }

  private findNearest(normalized: string, fingerprint: string): { entry: ContextMemoryEntry; similarity: number } | null {
    const queryTokens = tokenize(normalized);
    if (queryTokens.length === 0) return null;
    let best: { entry: ContextMemoryEntry; similarity: number } | null = null;
    for (const entry of this.state.entries) {
      if (entry.mergedInto || entry.fingerprint === fingerprint) continue;
      const similarity = jaccard(queryTokens, this.tokens(entry));
      if (similarity >= CONTEXT_LIMITS.DUPLICATE_THRESHOLD && (!best || similarity > best.similarity)) {
        best = { entry, similarity };
      }
    }
    return best;
  }

  private recordDuplicate(first: ContextMemoryEntry, second: ContextMemoryEntry, similarity: number, now: number): void {
    if (this.state.duplicates.length >= CONTEXT_LIMITS.MAX_DUPLICATES) this.state.duplicates.splice(0, 1);
    this.state.duplicates.push({
      id: this.id("dup"),
      firstId: first.id,
      secondId: second.id,
      similarity: Number(similarity.toFixed(3)),
      detectedAt: now,
      status: "suggested",
      reason: "Similarité lexicale-contextuelle élevée ; fusion laissée à la décision explicite de l'utilisateur.",
    });
  }

  private mergeInto(target: ContextMemoryEntry, input: RememberInput, text: string, now: number): ContextMemoryEntry {
    const incomingTags = Array.isArray(input.tags)
      ? input.tags.slice(0, CONTEXT_LIMITS.MAX_TAGS).map((tag) => cleanText(tag, CONTEXT_LIMITS.MAX_TAG_CHARS)).filter(Boolean)
      : [];
    target.tags = [...new Set([...target.tags, ...incomingTags])].slice(0, CONTEXT_LIMITS.MAX_TAGS);
    target.confidence = Math.max(target.confidence, bounded(input.confidence, 0.8, 0, 1));
    target.importance = Math.max(target.importance, bounded(input.importance, 0.5, 0, 1));
    target.lastAccessedAt = now;
    target.accessCount += 1;
    target.updatedAt = now;
    if (text.length > target.text.length) target.text = text.slice(0, CONTEXT_LIMITS.MAX_TEXT_CHARS);
    this.tokenCache.delete(target.id);
    return target;
  }

  private buildEntry(input: RememberInput, text: string, fingerprint: string, now: number): ContextMemoryEntry {
    const kind = KINDS.includes(input.kind as ContextMemoryKind) ? input.kind as ContextMemoryKind : "fact";
    const scope = SCOPES.includes(input.scope as ContextMemoryScope) ? input.scope as ContextMemoryScope : "short";
    const source = SOURCES.includes(input.source as ContextMemorySource) ? input.source as ContextMemorySource : "user";
    const categories = Array.isArray(input.categories)
      ? input.categories.slice(0, CONTEXT_LIMITS.MAX_CATEGORIES).map((c) => cleanText(c, CONTEXT_LIMITS.MAX_TAG_CHARS)).filter(Boolean)
      : [];
    const tags = Array.isArray(input.tags)
      ? input.tags.slice(0, CONTEXT_LIMITS.MAX_TAGS).map((t) => cleanText(t, CONTEXT_LIMITS.MAX_TAG_CHARS)).filter(Boolean)
      : [];
    const rawShare = isRecord(input.share as unknown) ? input.share as Record<string, unknown> : {};
    const mode = SHARE_MODES.includes(rawShare.mode as (typeof SHARE_MODES)[number])
      ? rawShare.mode as (typeof SHARE_MODES)[number]
      : "private";
    const allow = Array.isArray(rawShare.allow)
      ? rawShare.allow.filter((role): role is ContextAgentRole => CONTEXT_AGENT_ROLES.includes(role as ContextAgentRole)).slice(0, 8)
      : [];
    return {
      id: this.id("ctx"),
      text,
      kind,
      scope,
      categories,
      tags,
      source,
      ...(CONTEXT_AGENT_ROLES.includes(input.agent as ContextAgentRole) ? { agent: input.agent as ContextAgentRole } : {}),
      ...(cleanText(input.missionId, 80) ? { missionId: cleanText(input.missionId, 80) } : {}),
      ...(cleanText(input.conversationId, 80) ? { conversationId: cleanText(input.conversationId, 80) } : {}),
      importance: bounded(input.importance, 0.5, 0, 1),
      confidence: bounded(input.confidence, 0.8, 0, 1),
      share: { mode, allow },
      fingerprint,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      ...(cleanText(input.notes, 300) ? { notes: cleanText(input.notes, 300) } : {}),
    };
  }

  /** Bornage de notre propre index uniquement ; jamais des dépôts utilisateur. */
  private enforceBounds(now: number, reason: string): number {
    void reason;
    let pruned = 0;
    if (this.state.entries.length > CONTEXT_LIMITS.MAX_ENTRIES) {
      const ranked = this.state.entries
        .slice()
        .sort((a, b) =>
          (b.scope === "long" ? 1 : 0) - (a.scope === "long" ? 1 : 0)
          || b.importance - a.importance
          || b.accessCount - a.accessCount
          || b.updatedAt - a.updatedAt
        );
      const keep = new Set(ranked.slice(0, CONTEXT_LIMITS.MAX_ENTRIES).map((entry) => entry.id));
      this.state.entries = this.state.entries.filter((entry) => {
        if (keep.has(entry.id)) return true;
        pruned += 1;
        this.tokenCache.delete(entry.id);
        return false;
      });
    }
    const shorts = this.state.entries.filter((entry) => entry.scope === "short");
    if (shorts.length > CONTEXT_LIMITS.MAX_SHORT_ENTRIES) {
      const excess = shorts
        .slice()
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(0, shorts.length - CONTEXT_LIMITS.MAX_SHORT_ENTRIES);
      const ids = new Set(excess.map((entry) => entry.id));
      this.state.entries = this.state.entries.filter((entry) => {
        if (!ids.has(entry.id)) return true;
        pruned += 1;
        this.tokenCache.delete(entry.id);
        return false;
      });
    }
    void now;
    return pruned;
  }
}

/** Normalisation partagée avec le moteur (exportée pour les tests). */
export function normalizeTextForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

