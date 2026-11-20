/**
 * Registre des agents logiques — JARVIS 4.0 Phase 4.
 *
 * Chaque agent a un rôle et des responsabilités distinctes. Le routage est
 * déterministe (mots-clés) et vérifiable : aucun modèle IA n'est invoqué ici,
 * aucune autonomie n'est donnée en dehors du Core.
 */

import type { AgentDefinition, AgentId } from "./types.ts";

export const AGENTS: Readonly<Record<AgentId, AgentDefinition>> = Object.freeze({
  main: {
    id: "main",
    name: "Main Agent",
    role: "Coordination générale et répartition des missions",
    responsibilities: [
      "reçoit la mission du Core",
      "répartit les tâches entre les agents",
      "arbitre les dépendances et les validations",
      "présente le résultat vérifié au Core",
    ],
    canDelegate: true,
    keywords: ["coordination", "répartir", "distribuer", "orchestrer", "piloter", "arbitrer"],
    maxRetries: 1,
  },
  research: {
    id: "research",
    name: "Research Agent",
    role: "Recherche et collecte d'informations autorisées",
    responsibilities: [
      "collecte le contexte disponible localement",
      "synthétise les éléments pertinents",
      "signale les informations manquantes",
    ],
    canDelegate: false,
    keywords: ["recherche", "rechercher", "collecte", "information", "synthèse", "source", "veille", "documentation"],
    maxRetries: 2,
  },
  coding: {
    id: "coding",
    name: "Coding Agent",
    role: "Analyse et développement logiciel",
    responsibilities: [
      "analyse le besoin technique",
      "décrit l'implémentation de façon structurée",
      "identifie les risques et points de vérification",
    ],
    canDelegate: false,
    keywords: ["code", "développe", "implémente", "logiciel", "bug", "api", "build", "typescript", " fonction"],
    maxRetries: 2,
  },
  planning: {
    id: "planning",
    name: "Planning Agent",
    role: "Planification et décomposition des missions",
    responsibilities: [
      "décompose un objectif en étapes ordonnées",
      "explicite les dépendances",
      "estime la charge et les points de contrôle",
    ],
    canDelegate: false,
    keywords: ["plan", "planification", "décompose", "étapes", "roadmap", "organise", "séquence"],
    maxRetries: 1,
  },
  analysis: {
    id: "analysis",
    name: "Analysis Agent",
    role: "Analyse et raisonnement",
    responsibilities: [
      "évalue les données et hypothèses",
      "compare les options",
      "produit une conclusion argumentée",
    ],
    canDelegate: false,
    keywords: ["analyse", "analyser", "raisonnement", "évalue", "compare", "métrique", "performance", "diagnostic"],
    maxRetries: 2,
  },
  creative: {
    id: "creative",
    name: "Creative Agent",
    role: "Création et génération d'idées",
    responsibilities: [
      "propose des angles et variantes",
      "structure un contenu original",
      "reste compatible avec les faits établis",
    ],
    canDelegate: false,
    keywords: ["créatif", "création", "idée", "design", "scénario", "contenu", "titre", "imagine"],
    maxRetries: 1,
  },
  verification: {
    id: "verification",
    name: "Verification Agent",
    role: "Vérification des résultats et détection d'erreurs",
    responsibilities: [
      "contrôle la complétude des livrables",
      "détecte les incohérences et échecs",
      "refuse la livraison si une preuve manque",
    ],
    canDelegate: false,
    keywords: ["vérifie", "vérification", "test", "valide", "contrôle", "audit", "qualité", "erreur"],
    maxRetries: 1,
  },
  memory: {
    id: "memory",
    name: "Memory Agent",
    role: "Gestion de la mémoire contextuelle partagée",
    responsibilities: [
      "enregistre des faits utiles avec provenance",
      "restitue le contexte pertinent aux autres agents",
      "ne conserve aucune donnée sensible",
    ],
    canDelegate: false,
    keywords: ["mémoire", "mémorise", "contexte", "historique", "retiens", "synthétise"],
    maxRetries: 1,
  },
});

export class AgentRegistry {
  list(): AgentDefinition[] {
    return Object.values(AGENTS).map((agent) => ({ ...agent }));
  }

  get(id: AgentId): AgentDefinition {
    const agent = AGENTS[id];
    if (!agent) throw new Error(`Agent inconnu : ${id}`);
    return agent;
  }

  /** Routage déterministe : le premier agent dont un mot-clé apparaît est retenu. */
  assign(name: string, description = "", explicit?: AgentId | string): AgentId {
    const requested = normalizeAgentId(explicit);
    if (requested) return requested;
    const haystack = `${name} ${description}`.toLowerCase();
    for (const agent of Object.values(AGENTS)) {
      if (agent.id === "main") continue;
      if (agent.keywords.some((keyword) => haystack.includes(keyword))) return agent.id;
    }
    return "analysis";
  }
}

/** Compatibilité avec les rôles Phase 2 (« chief », « developer », « researcher »). */
export function normalizeAgentId(value?: AgentId | string): AgentId | null {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  const aliases: Record<string, AgentId> = {
    chief: "main", main: "main", coordinator: "main",
    developer: "coding", coding: "coding", code: "coding",
    researcher: "research", research: "research",
    planner: "planning", planning: "planning",
    analyst: "analysis", analysis: "analysis",
    creative: "creative", creator: "creative",
    verifier: "verification", verification: "verification",
    memory: "memory",
  };
  return aliases[raw] ?? null;
}
