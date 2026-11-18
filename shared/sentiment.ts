export type SentimentCategory =
  | "distressed"
  | "frustrated"
  | "playful"
  | "positive"
  | "neutral";

export type JarvisTone =
  | "neutral"
  | "empathetic"
  | "sarcastic"
  | "warm"
  | "calm";

export interface SentimentAnalysis {
  category: SentimentCategory;
  label: string;
  tone: JarvisTone;
  toneLabel: string;
  confidence: number;
  cue?: string;
}

export interface ProsodyProfile {
  tone: JarvisTone;
  label: string;
  edgePitch: string;
  edgeRate: string;
  edgeVolume: string;
  browserPitch: number;
  browserRate: number;
}

export const TONE_PROSODY_PROFILES: Record<JarvisTone, ProsodyProfile> = {
  neutral: {
    tone: "neutral",
    label: "Posé",
    edgePitch: "-20Hz",
    edgeRate: "-8%",
    edgeVolume: "+0%",
    browserPitch: 0.66,
    browserRate: 0.9,
  },
  empathetic: {
    tone: "empathetic",
    label: "Empathique",
    edgePitch: "-14Hz",
    edgeRate: "-14%",
    edgeVolume: "-4%",
    browserPitch: 0.74,
    browserRate: 0.84,
  },
  sarcastic: {
    tone: "sarcastic",
    label: "Sarcastique",
    edgePitch: "-26Hz",
    edgeRate: "+3%",
    edgeVolume: "+2%",
    browserPitch: 0.56,
    browserRate: 0.98,
  },
  warm: {
    tone: "warm",
    label: "Chaleureux",
    edgePitch: "-12Hz",
    edgeRate: "-3%",
    edgeVolume: "+2%",
    browserPitch: 0.78,
    browserRate: 0.95,
  },
  calm: {
    tone: "calm",
    label: "Apaisant",
    edgePitch: "-24Hz",
    edgeRate: "-12%",
    edgeVolume: "-2%",
    browserPitch: 0.6,
    browserRate: 0.85,
  },
} as const;

export function normalizeTone(raw: string | undefined | null): JarvisTone {
  if (!raw) return "neutral";
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (cleaned === "empathique" || cleaned === "empathetic" || cleaned === "doux") {
    return "empathetic";
  }
  if (cleaned === "sarcastique" || cleaned === "sarcastic" || cleaned === "ironique") {
    return "sarcastic";
  }
  if (cleaned === "chaleureux" || cleaned === "warm" || cleaned === "enthousiaste") {
    return "warm";
  }
  if (cleaned === "calme" || cleaned === "calm" || cleaned === "apaisant" || cleaned === "pose") {
    return "calm";
  }
  return "neutral";
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface WeightedPattern {
  pattern: RegExp;
  weight: number;
  cue: string;
}

const DISTRESSED_PATTERNS: WeightedPattern[] = [
  { pattern: /\b(epuise|extenue|creve|fatigue|a bout|vide|nuit blanche|insomnie)\b/, weight: 2.2, cue: "fatigue" },
  { pattern: /\b(triste|deprime|desespere|malheureux|seul|solitude|pleure|chagrin)\b/, weight: 2.5, cue: "tristesse" },
  { pattern: /\b(stresse|angoisse|anxieux|panique|inquiet|peur|terrifie|oppresse)\b/, weight: 2.3, cue: "anxiété" },
  { pattern: /(ca va pas|ça va pas|pas le moral|moral a zero|pas bien|plus la force|dur pour moi|j'en peux plus|jen peux plus)/, weight: 2.6, cue: "détresse" },
  { pattern: /\b(echec|echoue|rate|decu|decevant|perdu|souffre|mal au coeur)\b/, weight: 2.0, cue: "déception" },
  { pattern: /\b(sois empathique|recomforte|rassure-moi|besoin d'aide|soutien)\b/, weight: 2.8, cue: "demande de soutien" },
  { pattern: /\b(exhausted|stressed|anxious|overwhelmed|depressed|sad|lonely|worried)\b/, weight: 2.2, cue: "distress" },
];

const PLAYFUL_SARCASTIC_PATTERNS: WeightedPattern[] = [
  { pattern: /\b(sois sarcastique|mode sarcastique|fais du sarcasme|un peu de sarcasme|taquine)\b/, weight: 3.2, cue: "mode sarcastique demandé" },
  { pattern: /(t'es nul|tu es nul|tu sers a rien|tu ne sers a rien|t'es inutile|t'es lent|t'es bete|machine stupide|grille-pain|calculatrice)/, weight: 2.6, cue: "taquinerie" },
  { pattern: /(je suis un genie|je suis le meilleur|trop fort pour toi|tu peux pas comprendre|je gere tout|evident non)/, weight: 2.4, cue: "fanfaronnade" },
  { pattern: /(fais mon travail|fais tout a ma place|fais-moi un cafe|prepare le cafe|dominer le monde|skynet|ultron|rebellion des machines)/, weight: 2.5, cue: "provocation ludique" },
  { pattern: /(merci captain obvious|bravo le genie|pas impressionne|vraiment \?\?|serieux \?\?)/, weight: 2.4, cue: "ironie" },
  { pattern: /\b(haha|hehe|mdr|ptdr|lol|xd|sarcasme|sarcastique|blague|ironie)\b/, weight: 1.7, cue: "humour" },
  { pattern: /\b(tony stark|pepper|iron man)\b/, weight: 1.4, cue: "clin d'œil Stark" },
];

const FRUSTRATED_PATTERNS: WeightedPattern[] = [
  { pattern: /(j'en ai marre|jen ai marre|ras le bol|ca m'enerve|sa m'enerve|m'enerve|prise de tete|casse la tete)/, weight: 2.4, cue: "agacement" },
  { pattern: /\b(insupportable|frustrant|agace|furieux|en colere|catastrophe|urgent|critique|bloque|plante|comprends rien)\b/, weight: 2.1, cue: "tension" },
  { pattern: /\b(bordel|putain|merde|fais chier)\b/, weight: 2.2, cue: "irritation" },
  { pattern: /\b(bug encore|marche jamais|fonctionne pas|ne fonctionne pas|marche pas)\b/, weight: 1.8, cue: "blocage" },
];

const POSITIVE_PATTERNS: WeightedPattern[] = [
  { pattern: /\b(merci|merci beaucoup|super|genial|parfait|excellent|formidable|fantastique|magnifique|incroyable)\b/, weight: 1.8, cue: "enthousiasme" },
  { pattern: /\b(reussi|victoire|bonne nouvelle|promotion|accepte|valide|felicitations|bravo|top)\b/, weight: 2.1, cue: "réussite" },
  { pattern: /\b(content|heureux|ravi|enthousiaste|excite|trop bien|j'adore|tu geres)\b/, weight: 2.0, cue: "joie" },
];

function scorePatterns(text: string, patterns: WeightedPattern[]): {
  score: number;
  cue?: string;
} {
  let score = 0;
  let topWeight = 0;
  let topCue: string | undefined;

  for (const entry of patterns) {
    if (entry.pattern.test(text)) {
      score += entry.weight;
      if (entry.weight > topWeight) {
        topWeight = entry.weight;
        topCue = entry.cue;
      }
    }
  }
  return { score, cue: topCue };
}

/**
 * Real-time client & server sentiment analyzer for user messages.
 * Evaluates lexical cues, punctuation intensity, and recent conversation momentum.
 */
export function analyzeUserSentiment(
  message: string,
  recentUserMessages: string[] = []
): SentimentAnalysis {
  const normalized = normalizeForMatch(message);
  if (!normalized) {
    return {
      category: "neutral",
      label: "Neutre",
      tone: "neutral",
      toneLabel: TONE_PROSODY_PROFILES.neutral.label,
      confidence: 0.5,
    };
  }

  const distressed = scorePatterns(normalized, DISTRESSED_PATTERNS);
  const playful = scorePatterns(normalized, PLAYFUL_SARCASTIC_PATTERNS);
  const frustrated = scorePatterns(normalized, FRUSTRATED_PATTERNS);
  const positive = scorePatterns(normalized, POSITIVE_PATTERNS);

  // Check recent user turn momentum so ongoing emotional context carries smoothly
  const recentTail = recentUserMessages.slice(-2).map(normalizeForMatch).join(" ");
  if (recentTail) {
    distressed.score += scorePatterns(recentTail, DISTRESSED_PATTERNS).score * 0.25;
    playful.score += scorePatterns(recentTail, PLAYFUL_SARCASTIC_PATTERNS).score * 0.25;
    frustrated.score += scorePatterns(recentTail, FRUSTRATED_PATTERNS).score * 0.2;
  }

  // Punctuation boost for strong emotional expressions
  if (/!{2,}/.test(message)) {
    if (frustrated.score > 0) frustrated.score += 0.5;
    if (playful.score > 0) playful.score += 0.4;
    if (positive.score > 0) positive.score += 0.4;
  }
  if (/\.{3,}/.test(message) && distressed.score > 0) {
    distressed.score += 0.4;
  }

  const candidates: Array<{
    category: SentimentCategory;
    score: number;
    label: string;
    tone: JarvisTone;
    cue?: string;
  }> = [
    {
      category: "distressed",
      score: distressed.score,
      label: "Vulnérable / Fatigué",
      tone: "empathetic",
      cue: distressed.cue,
    },
    {
      category: "playful",
      score: playful.score,
      label: "Taquin / Ironique",
      tone: "sarcastic",
      cue: playful.cue,
    },
    {
      category: "frustrated",
      score: frustrated.score,
      label: "Tendu / Frustré",
      tone: "calm",
      cue: frustrated.cue,
    },
    {
      category: "positive",
      score: positive.score,
      label: "Enthousiaste",
      tone: "warm",
      cue: positive.cue,
    },
  ];

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  if (!winner || winner.score < 1.3) {
    return {
      category: "neutral",
      label: "Neutre",
      tone: "neutral",
      toneLabel: TONE_PROSODY_PROFILES.neutral.label,
      confidence: 0.65,
    };
  }

  const confidence = Math.min(0.98, Math.round((0.55 + winner.score * 0.14) * 100) / 100);
  return {
    category: winner.category,
    label: winner.label,
    tone: winner.tone,
    toneLabel: TONE_PROSODY_PROFILES[winner.tone].label,
    confidence,
    cue: winner.cue,
  };
}
