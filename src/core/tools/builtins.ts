/**
 * Outils intégrés du Tool Registry — JARVIS 4.0 Phase 6.
 *
 * Définitions PUREMENT DECLARATIVES : champs typés, limites, permission
 * explicite. Aucun code, aucun accès fichier/réseau/processus. Les
 * gestionnaires correspondants sont injectés par JarvisCore, jamais par un
 * agent, une Skill ou une requête HTTP.
 */

import type { NewToolDefinition } from "./types.ts";

/** Champs standards transmis par l'Agent Orchestrator à tout outil. */
export const AGENT_FIELDS = [
  { name: "objectif", type: "string", required: true, maxLength: 500 },
  { name: "contexte", type: "string", maxLength: 1000 },
] as const;

export const BUILTIN_TOOLS: readonly NewToolDefinition[] = [
  {
    name: "core_status",
    description: "Lit un résumé borné de l'état du Core (missions, agents, capacités). Aucune donnée sensible.",
    kind: "core_query",
    fields: AGENT_FIELDS,
    maxOutputChars: 1200,
  },
  {
    name: "agents_overview",
    description: "Lit les compteurs des rôles et des exécutions multi-agents du Core.",
    kind: "agent_query",
    fields: AGENT_FIELDS,
    maxOutputChars: 1000,
  },
  {
    name: "scheduler_overview",
    description: "Lit les compteurs des planifications, événements et alertes du monitor.",
    kind: "scheduler_query",
    fields: AGENT_FIELDS,
    maxOutputChars: 1000,
  },
  {
    name: "memory_search",
    description: "Recherche en lecture seule dans la mémoire locale existante (permission explicite requise).",
    kind: "memory_query",
    fields: AGENT_FIELDS,
    permission: "private_data",
    maxOutputChars: 1600,
  },
  {
    name: "context_template",
    description: "Met en forme objectif et contexte avec un template déclaratif (aucune évaluation de code).",
    kind: "template",
    fields: AGENT_FIELDS,
    template: "OBJECTIF : {{input.objectif}}\nCONTEXTE : {{input.contexte}}",
    maxOutputChars: 1600,
  },
] as const;

/**
 * Remplacement littéral de `{{input.champ}}`. Aucune évaluation, aucun
 * eval/Function, aucune interprétation d'expression : les valeurs sont déjà
 * validées et bornées par le ToolRegistry.
 */
export function renderToolTemplate(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{\{\s*input\.([a-z][a-z0-9_]{1,39})\s*\}\}/gi, (_match, key: string) => {
    const value = input[key];
    return value === undefined || value === null ? "" : String(value).slice(0, 1000);
  });
}
