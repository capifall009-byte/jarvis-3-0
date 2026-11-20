/**
 * Analyse textuelle LOCALE — JARVIS 4.0 Phase 8.
 *
 * Aucun réseau, aucun embedding neuronal, aucune dépendance. Ce module fournit
 * une recherche « contextuelle locale » déterministe : normalisation Unicode,
 * tokens utiles, radicalisation française légère, petit dictionnaire de
 * synonymes local, similarité de Jaccard et TF-IDF calculé sur l'index lui-même.
 *
 * HONNÊTETÉ : c'est une approximation lexicale enrichie, PAS un embedding
 * sémantique appris. Elle capte les reformulations courantes en français sans
 * transmettre la moindre donnée. `@huggingface/inference` est un service
 * externe payant et n'est volontairement pas utilisé ici.
 */

/** Mots-outils français : ignorés pour éviter qu'ils dominent le score. */
const STOP_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "est", "sont", "etre", "etait", "etaient",
  "que", "qui", "quoi", "dont", "ou", "avec", "sans", "dans", "sur", "pour", "par", "au", "aux", "ce", "cet",
  "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "notre", "nos", "votre", "vos",
  "leur", "leurs", "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "me", "te", "se", "lui", "leur",
  "y", "en", "ne", "pas", "plus", "moins", "très", "tres", "bien", "aussi", "comme", "mais", "car", "donc",
  "si", "quand", "alors", "peut", "peut-etre", "peutetre", "faut", "doit", "avoir", "a", "ai", "as", "avons",
  "avez", "ont", "etais", "etes", "fut", "furent", "sera", "seront", "serait", "seraient", "cest", "c est",
  "tout", "tous", "toute", "toutes", "rien", "personne", "aucun", "aucune", "chaque", "quel", "quelle", "quels",
]);

/** Petit dictionnaire local de reformulations fréquentes (jamais transmis). */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["voiture", "auto", "automobile", "vehicule"],
  ["reunion", "meeting", "rendezvous"],
  ["projet", "mission", "initiative"],
  ["tache", "devoir", "action"],
  ["fichier", "document", "dossier"],
  ["message", "email", "courriel", "communication"],
  ["prix", "cout", "tarif", "budget"],
  ["rechercher", "chercher", "trouver", "lookup"],
  ["afficher", "montrer", "voir", "lister"],
  ["supprimer", "effacer", "retirer"],
  ["memoire", "souvenir", "recall"],
  ["rapide", "vite", "celerite"],
  ["securite", "surete", "protection"],
  ["erreur", "bug", "probleme"],
];

const SYNONYM_MAP = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      const set = map.get(word) ?? new Set<string>();
      for (const other of group) if (other !== word) set.add(other);
      map.set(word, set);
    }
  }
  return map;
})();

/** Normalisation Unicode stable, identique navigateur / serveur / tests. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Radicalisation française légère : rapproche « réunions » de « réunion ». */
export function radical(token: string): string {
  let result = normalizeText(token);
  const suffixes = [
    "ements", "ement", "ations", "ation", "ites", "ite", "euses", "euse", "eurs", "eur",
    "ees", "ee", "aux", "eaux", "ents", "ent", "er", "es", "s", "e",
  ];
  for (const suffix of suffixes) {
    if (result.length > suffix.length + 2 && result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }
  return result.length >= 3 ? result : token;
}

/** Tokens utiles (longueur >= 3, hors mots-outils), radicalisés. */
export function tokenize(value: string): string[] {
  const words = normalizeText(value).split(" ").filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  const result = new Set<string>();
  for (const word of words) {
    result.add(radical(word));
    const synonyms = SYNONYM_MAP.get(word);
    if (synonyms) for (const synonym of synonyms) result.add(radical(synonym));
  }
  return [...result];
}

/** Empreinte courte et non cryptographique (dédoublonnage exact uniquement). */
export function textFingerprint(value: string): string {
  const text = normalizeText(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `ctx-${hash.toString(16).padStart(8, "0")}-${text.length.toString(36)}`;
}

/** Similarité de Jaccard sur deux ensembles de tokens. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let intersection = 0;
  for (const token of a) if (setB.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/** IDF local calculé sur l'index courant : aucun corpus externe. */
export function buildIdf(documents: readonly (readonly string[])[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const tokens of documents) {
    for (const token of new Set(tokens)) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  const total = Math.max(1, documents.length);
  const idf = new Map<string, number>();
  for (const [token, count] of frequency) idf.set(token, 1 + Math.log(total / (1 + count)));
  return idf;
}

/** Score TF-IDF local d'une requête contre un document tokenisé. */
export function tfIdfScore(queryTokens: readonly string[], docTokens: readonly string[], idf: Map<string, number>): number {
  if (queryTokens.length === 0 || docTokens.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const token of docTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let score = 0;
  for (const token of queryTokens) {
    const tf = counts.get(token) ?? 0;
    if (tf === 0) continue;
    score += (1 + Math.log(tf)) * (idf.get(token) ?? 1);
  }
  return score;
}
