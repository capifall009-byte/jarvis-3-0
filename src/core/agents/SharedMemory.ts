/**
 * Mémoire contextuelle partagée et contrôlée — JARVIS 4.0 Phase 4.
 *
 * Stockée dans l'état du Core (source de vérité unique). Chaque écriture est
 * datée, attribuée à un agent et tracée vers la tâche d'origine. Les valeurs
 * sensibles sont refusées ; la taille et le nombre d'entrées sont bornés.
 */

import type { AgentId, AgentRun, SharedMemoryEntry } from "./types.ts";

const KEY_RE = /^[a-z][a-z0-9_.-]{1,63}$/i;
const SENSITIVE_RE = /(api[_-]?key|secret|password|passwd|token|authorization|bearer|private[_-]?key|credential)/i;
const MAX_VALUE_CHARS = 2000;
const MAX_ENTRIES = 60;

export interface SharedMemoryDeps {
  now?: () => number;
  id?: (prefix: string) => string;
}

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_mem_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class SharedMemory {
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;

  constructor(deps: SharedMemoryDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
  }

  /**
   * Écrit (ou remplace) une entrée. Retourne false si la clé, la valeur ou le
   * contexte est refusé : l'agent doit alors poursuivre sans mémoriser.
   */
  write(
    run: AgentRun,
    key: string,
    value: string,
    author: AgentId,
    provenance: string,
    ts = this.now()
  ): boolean {
    if (!KEY_RE.test(key) || typeof value !== "string" || value.trim().length === 0) return false;
    if (value.length > MAX_VALUE_CHARS) return false;
    if (SENSITIVE_RE.test(`${key} ${value}`)) return false;

    const cleanValue = value.trim();
    const existing = run.memory.find((entry) => entry.runId === run.id && entry.key === key);
    if (existing) {
      existing.value = cleanValue;
      existing.author = author;
      existing.provenance = provenance;
      existing.ts = ts;
      return true;
    }
    if (run.memory.length >= MAX_ENTRIES) {
      // Bornage FIFO : l'entrée la plus ancienne est retirée, sans toucher aux
      // conversations, missions ou Skills persistés.
      run.memory.splice(0, 1);
    }
    run.memory.push({ id: this.id("shm"), runId: run.id, key, value: cleanValue, author, provenance, ts });
    return true;
  }

  read(run: AgentRun, key?: string): SharedMemoryEntry[] {
    const entries = run.memory.filter((entry) => entry.runId === run.id);
    if (!key) return entries.slice().sort((a, b) => b.ts - a.ts);
    return entries.filter((entry) => entry.key === key).slice().sort((a, b) => b.ts - a.ts);
  }

  /** Recherche contextuelle lexicale, bornée, sur les entrées de ce run. */
  search(run: AgentRun, query: string, limit = 3): SharedMemoryEntry[] {
    const tokens = query.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((t) => t.length >= 3);
    if (tokens.length === 0) return [];
    return this.read(run)
      .map((entry) => ({
        entry,
        score: tokens.reduce((sum, token) =>
          sum + (`${entry.key} ${entry.value}`.toLowerCase().includes(token) ? 1 : 0), 0),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.ts - a.entry.ts)
      .slice(0, Math.max(1, Math.min(limit, MAX_ENTRIES)))
      .map((item) => item.entry);
  }
}
