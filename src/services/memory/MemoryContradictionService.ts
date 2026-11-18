import type { MemoryItem } from "../../types/jarvis";

/**
 * Détection de contradictions POTENTIELLES entre souvenirs.
 *
 * Ce service est volontairement conservateur et purement indicatif :
 * - il ne modifie aucune mémoire ;
 * - il ne supprime rien automatiquement ;
 * - il ne prétend pas établir un fait, seulement signaler un désaccord à confirmer par l'utilisateur.
 */

export interface MemoryContradiction {
  id: string;
  first: MemoryItem;
  second: MemoryItem;
  reason: string;
  confidence: "faible" | "moyenne";
}

const STOP_WORDS = new Set([
  "que", "qui", "quoi", "dont", "où", "avec", "sans", "pour", "dans", "sur", "son", "sa",
  "ses", "leur", "leurs", "des", "une", "un", "les", "du", "de", "et", "est", "sont",
  "était", "ete", "etez", "cette", "ce", "ces", "mon", "ma", "mes", "ton", "ta", "tes",
  "plus", "moins", "très", "bien", "aussi", "mais", "donc", "alors", "comme", "par",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
}

const NEGATIVE_MARKERS = [
  "pas", "jamais", "aucun", "aucune", "deteste", "evite", "non", "sans", "ni", "ne",
];

function hasNegativeMarker(text: string): boolean {
  const norm = normalize(text);
  return NEGATIVE_MARKERS.some((marker) => new RegExp(`\\b${marker}\\b`).test(norm));
}

function hasPositivePreference(text: string): boolean {
  const norm = normalize(text);
  return /\b(aime|adore|apprecie|prefere|favori|preferer)\b/.test(norm);
}

function numericValues(text: string): string[] {
  return normalize(text).match(/\d+(?:[.,]\d+)?/g) || [];
}

/** Compare deux souvenirs et renvoie un motif de contradiction si le soupçon est raisonnable. */
function comparePair(a: MemoryItem, b: MemoryItem): string | null {
  if (a.disabled || b.disabled) return null;
  if (a.id === b.id) return null;

  const ta = tokens(a.fact);
  const tb = tokens(b.fact);
  if (ta.length < 2 || tb.length < 2) return null;

  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t));
  if (shared.length < 2) return null;

  const negA = hasNegativeMarker(a.fact);
  const negB = hasNegativeMarker(b.fact);
  const posA = hasPositivePreference(a.fact);
  const posB = hasPositivePreference(b.fact);

  if ((negA && posB) || (negB && posA)) {
    return "Préférence probablement opposée sur le même sujet.";
  }

  const numsA = numericValues(a.fact);
  const numsB = numericValues(b.fact);
  if (numsA.length > 0 && numsB.length > 0) {
    const common = numsA.filter((n) => numsB.includes(n));
    if (common.length === 0) {
      return "Valeurs numériques différentes pour un même sujet.";
    }
  }

  return null;
}

/**
 * Renvoie les paires suspectes. Limité à 200 entrées pour éviter une comparaison O(n²) coûteuse.
 * Le résultat est trié du plus récent au plus ancien et plafonné à 12 paires.
 */
export function detectMemoryContradictions(memories: MemoryItem[]): MemoryContradiction[] {
  const candidates = [...memories]
    .filter((m) => !m.disabled)
    .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
    .slice(0, 200);

  const results: MemoryContradiction[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const reason = comparePair(candidates[i], candidates[j]);
      if (!reason) continue;
      results.push({
        id: `${candidates[i].id}::${candidates[j].id}`,
        first: candidates[i],
        second: candidates[j],
        reason,
        confidence: "faible",
      });
      if (results.length >= 12) return results;
    }
  }
  return results;
}
