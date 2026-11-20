/**
 * Moteur cognitif du noyau JARVIS 4.0.
 *
 * Classificateur déterministe, sans fournisseur IA : il décide si une demande
 * est une question simple (pipeline Gemini existant) ou une mission complexe
 * (noyau central). Aucun appel réseau, aucune clé, aucune dépendance externe.
 */

import type { Classification, CoreRequest } from "./types.ts";

const COMPLEX_VERBS = [
  "crée", "creer", "créer", "construis", "construire", "développe", "developper",
  "analyse", "analyser", "améliore", "ameliorer", "planifie", "planifier",
  "organise", "organiser", "automatise", "automatiser", "génère", "generer",
  "prépare", "preparer", "réalise", "realiser", "mets en place", "met en place",
  "optimise", "optimiser", "audite", "auditer", "refond", "refonds",
];

const COMPLEX_NOUNS = [
  "site web", "application", "projet", "rapport", "présentation", "powerpoint",
  "mission", "campagne", "workflow", "automatisation", "audit", "refonte",
  "architecture", "système", "base de données", "site", "dashboard", "outil",
];

const SENSITIVE_MARKERS: Array<[string, string]> = [
  ["déploie", "deploy"], ["deploy", "deploy"], ["déploiement", "deploy"],
  ["publie", "publish"], ["publication", "publish"],
  ["supprime", "delete"], ["efface", "delete"], ["suppression", "delete"],
  ["paie", "payment"], ["paiement", "payment"], ["achat", "payment"],
  ["envoie un message", "external_message"], ["envoie", "external_message"],
  ["secret", "modify_secrets"], ["clé api", "modify_secrets"],
  ["permission", "modify_permissions"], ["données privées", "private_data"],
];

const STEP_MARKERS = [" puis ", " ensuite ", " après ", "et aussi", "puis "];
const SCHEDULE_MARKER = /chaque jour|tous les jours|quotidien|chaque matin|toutes les semaines|rappelle-moi|planifie/;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export interface CognitiveEngineOptions {
  /** Score minimal à partir duquel une demande est traitée comme mission complexe. */
  threshold?: number;
}

export class CognitiveEngine {
  private readonly threshold: number;

  constructor(options: CognitiveEngineOptions = {}) {
    this.threshold = options.threshold ?? 4;
  }

  classify(request: CoreRequest): Classification {
    const raw = typeof request?.text === "string" ? request.text : "";
    const norm = normalize(raw);
    const signals: string[] = [];
    let score = 0;

    const verbs = COMPLEX_VERBS.filter((verb) => norm.includes(normalize(verb)));
    if (verbs.length > 0) {
      score += Math.min(6, verbs.length * 3);
      signals.push(`verbes_multi_etapes:${verbs.join(",")}`);
    }

    const nouns = COMPLEX_NOUNS.filter((noun) => norm.includes(normalize(noun)));
    if (nouns.length > 0) {
      score += Math.min(4, nouns.length * 2);
      signals.push(`objets_complexes:${nouns.join(",")}`);
    }

    if (STEP_MARKERS.some((marker) => norm.includes(marker))) {
      score += 2;
      signals.push("enchainement_etapes");
    } else if (norm.includes(" et ")) {
      score += 1;
      signals.push("conjonction");
    }

    const wordCount = raw.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 14) {
      score += 1;
      signals.push("enonce_long");
    }

    if (SCHEDULE_MARKER.test(norm)) {
      score += 2;
      signals.push("intention_planifiee");
    }

    const sensitive: string[] = [];
    for (const [marker, action] of SENSITIVE_MARKERS) {
      if (norm.includes(normalize(marker)) && !sensitive.includes(action)) sensitive.push(action);
    }
    if (sensitive.length > 0) signals.push(`actions_sensibles:${sensitive.join(",")}`);

    const complex = score >= this.threshold;
    const confidence = Math.max(0, Math.min(1, score / 8));

    return {
      complex,
      confidence,
      reason: complex
        ? `Score ${score} >= ${this.threshold} (${signals.join("; ") || "aucun signal"}).`
        : `Score ${score} < ${this.threshold} : réponse directe adaptée.`,
      signals,
      goal: raw.trim() || "(objectif vide)",
      suggestedTasks: this.buildTasks(complex, sensitive),
    };
  }

  private buildTasks(complex: boolean, sensitive: string[]): string[] {
    if (!complex) return [];
    const tasks = [
      "Analyser l'objectif et recueillir le contexte pertinent",
      "Décomposer l'objectif en tâches dépendantes et estimer les ressources",
      "Exécuter et vérifier chaque tâche de la mission",
      "Vérifier les résultats et synthétiser le compte rendu",
    ];
    if (sensitive.length > 0) {
      tasks.splice(2, 0, `Obtenir une autorisation explicite pour : ${sensitive.join(", ")}`);
    }
    return tasks;
  }
}
