/**
 * Passerelle mémoire branchée sur la mémoire contextuelle locale — Phase 8.
 *
 * Corrige le `NoopMemoryGateway` de production : `/api/core/memory/search` et
 * l'outil `memory_search` disposent enfin d'une source locale réelle. La
 * passerelle reste STRICTEMENT EN LECTURE SEULE (aucun compteur, aucun audit,
 * aucune mutation) et ne touche pas aux dépôts de mémoire/conversations de
 * l'utilisateur.
 */

import type { MemoryGateway, MemoryGatewayInfo, MemorySnippet } from "../MemoryGateway.ts";
import type { ContextMemory } from "./ContextMemory.ts";

export class ContextMemoryGateway implements MemoryGateway {
  readonly info: MemoryGatewayInfo = {
    kind: "context-memory-local",
    readOnly: true,
    detail: "Mémoire contextuelle locale (court/long terme, recherche lexicale-contextuelle). Aucune donnée transmise, aucun dépôt existant modifié.",
  };

  private readonly memory: ContextMemory;

  constructor(memory: ContextMemory) {
    this.memory = memory;
  }

  async search(query: string, limit = 8): Promise<MemorySnippet[]> {
    const result = this.memory.recall(query, { limit, track: false });
    return result.hits.map((hit) => ({
      id: hit.entry.id,
      text: hit.entry.text,
      category: hit.entry.categories[0],
      source: hit.entry.source,
      createdAt: hit.entry.createdAt,
    }));
  }
}
