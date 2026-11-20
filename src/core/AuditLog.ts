/**
 * Journal d'audit du noyau JARVIS 4.0.
 *
 * Pur TypeScript : aucune API DOM/Node. Le journal est stocké dans `CoreState`
 * (la source de vérité unique), jamais dans un second stockage indépendant.
 */

import type { AuditEvent, CoreState } from "./types.ts";

const MAX_EVENTS = 500;

export interface AuditInput {
  actor: string;
  action: string;
  target?: string;
  outcome?: AuditEvent["outcome"];
  detail?: string;
  severity?: AuditEvent["severity"];
}

export interface AuditFilter {
  actor?: string;
  action?: string;
  outcome?: AuditEvent["outcome"];
  target?: string;
  limit?: number;
}

export interface AuditLogDeps {
  state: CoreState;
  now?: () => number;
  id?: (prefix: string) => string;
}

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AuditLog {
  private readonly state: CoreState;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;

  constructor(deps: AuditLogDeps) {
    this.state = deps.state;
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
    if (!Array.isArray(this.state.audit)) this.state.audit = [];
  }

  /** Ajoute un événement. Le journal est borné pour éviter une croissance sans limite. */
  record(input: AuditInput): AuditEvent {
    const event: AuditEvent = {
      id: this.id("evt"),
      ts: this.now(),
      actor: input.actor || "unknown",
      action: input.action || "unknown",
      outcome: input.outcome ?? "info",
      severity: input.severity ?? "info",
      ...(input.target ? { target: input.target } : {}),
      ...(input.detail ? { detail: input.detail } : {}),
    };
    this.state.audit.push(event);
    if (this.state.audit.length > MAX_EVENTS) {
      this.state.audit.splice(0, this.state.audit.length - MAX_EVENTS);
    }
    return event;
  }

  /** Retourne les événements les plus récents en premier. */
  list(filter: AuditFilter = {}): AuditEvent[] {
    const limit = Math.max(0, Math.min(filter.limit ?? 100, MAX_EVENTS));
    return this.state.audit
      .filter((e) => (filter.actor ? e.actor === filter.actor : true))
      .filter((e) => (filter.action ? e.action === filter.action : true))
      .filter((e) => (filter.outcome ? e.outcome === filter.outcome : true))
      .filter((e) => (filter.target ? e.target === filter.target : true))
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }

  /**
   * Phase 9.5 : événements dans leur ordre d'insertion réel (le plus ancien
   * d'abord). `list()` trie par timestamp ; des événements créés dans la même
   * milliseconde ne peuvent pas servir de curseur fiable.
   */
  listChronological(limit = 500): AuditEvent[] {
    const bounded = Math.max(0, Math.min(limit, MAX_EVENTS));
    return this.state.audit.slice(-bounded);
  }

  count(): number {
    return this.state.audit.length;
  }
}
