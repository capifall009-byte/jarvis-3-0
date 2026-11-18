import type {
  ProsodySettings,
  VocalEmotion,
  VocalPersonality,
  VocalPreset,
  VocalStyle,
} from "../../types/jarvis";

// Prosodie de référence (neutre, sans effet émotionnel).
const NEUTRAL_PROSODY: ProsodySettings = {
  rate: "+0%",
  pitch: "+0Hz",
  volume: "+0%",
  expressiveness: 0.5,
};

// Presets émotion → prosodie Edge TTS SSML (valeurs relatives, sûres).
const EMOTION_PRESETS: Record<VocalEmotion, ProsodySettings> = {
  joyeux: { rate: "+10%", pitch: "+15Hz", volume: "+5%", expressiveness: 0.7 },
  triste: { rate: "-15%", pitch: "-10Hz", volume: "-5%", expressiveness: 0.4 },
  serieux: { rate: "-5%", pitch: "-5Hz", volume: "+0%", expressiveness: 0.5 },
  colerique: { rate: "+15%", pitch: "+20Hz", volume: "+10%", expressiveness: 0.8 },
  calme: { rate: "-10%", pitch: "-5Hz", volume: "-5%", expressiveness: 0.3 },
  enthousiaste: { rate: "+20%", pitch: "+25Hz", volume: "+10%", expressiveness: 0.9 },
  seducteur: { rate: "-5%", pitch: "-10Hz", volume: "+5%", expressiveness: 0.6 },
  sarcastique: { rate: "+5%", pitch: "+10Hz", volume: "+0%", expressiveness: 0.7 },
  mysterieux: { rate: "-15%", pitch: "-15Hz", volume: "-10%", expressiveness: 0.5 },
  rassurant: { rate: "-5%", pitch: "-5Hz", volume: "+0%", expressiveness: 0.5 },
  professionnel: { rate: "+0%", pitch: "+0Hz", volume: "+0%", expressiveness: 0.5 },
  drole: { rate: "+10%", pitch: "+15Hz", volume: "+5%", expressiveness: 0.7 },
};

// Instructions de style pour Gemini (texte ajouté au system instruction).
const PERSONALITY_GEMINI_INSTRUCTIONS: Record<VocalPersonality, string> = {
  classic:
    "Tu es l'assistant JARVIS classique : calme, posé, loyal, courtois et efficace.",
  ironman:
    "Tu es JARVIS, inspiré de l'IA de Tony Stark : intelligent, élégant, avec une pointe de sarcasme britannique pince-sans-rire.",
  accomplice:
    "Tu es un complice détendu et humoristique : tu parles avec naturel, légèreté et une touche d'humour.",
  gentleman:
    "Tu es un gentleman : posé, élégant, courtois et séduisant, avec une voix chaleureuse et respectueuse.",
  professor:
    "Tu es un professeur pédagogique et patient : tu expliques clairement, par étapes, avec bienveillance.",
  strategist:
    "Tu es un stratège : froid, précis, analytique et efficace, sans fioritures.",
  comedien:
    "Tu es un comédien expressif et drôle : tu utilises l'humour, le timing et l'expressivité vocale.",
};

// Instructions de ton émotionnel pour Gemini.
const EMOTION_GEMINI_INSTRUCTIONS: Record<VocalEmotion, string> = {
  joyeux: "Adopte un ton joyeux et lumineux.",
  triste: "Adopte un ton triste et mélancolique.",
  serieux: "Adopte un ton sérieux et solennel.",
  colerique: "Adopte un ton colérique et énergique.",
  calme: "Adopte un ton calme et apaisant.",
  enthousiaste: "Adopte un ton enthousiaste et énergique.",
  seducteur: "Adopte un ton séducteur et charmeur.",
  sarcastique: "Adopte un ton sarcastique et ironique.",
  mysterieux: "Adopte un ton mystérieux et énigmatique.",
  rassurant: "Adopte un ton rassurant et bienveillant.",
  professionnel: "Adopte un ton professionnel et neutre.",
  drole: "Adopte un ton drôle et léger.",
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Interpole la prosodie entre neutre et l'émotion selon l'intensité (0..1).
 * À intensité 0 → prosodie neutre. À intensité 1 → prosodie émotion pleine.
 */
function resolveProsody(
  emotion: VocalEmotion | null,
  intensity: number,
  expressiveness = 0.6
): ProsodySettings {
  const base = NEUTRAL_PROSODY;
  const target = emotion ? EMOTION_PRESETS[emotion] : NEUTRAL_PROSODY;
  const t = clamp(intensity, 0, 1);
  // L'expressivité module réellement l'amplitude de la prosodie émotionnelle.
  const amplitude = 0.7 + 0.6 * clamp(expressiveness, 0, 1);

  // Parsing simple des valeurs relatives Edge TTS (ex: "+10%", "-15Hz").
  const parseSigned = (v: string): number => {
    const sign = v.startsWith("-") ? -1 : v.startsWith("+") ? 1 : 0;
    const num = Number(v.replace(/[^0-9.]/g, ""));
    return sign * num;
  };

  const formatSigned = (num: number, unit: string): string => {
    // Edge TTS attend des valeurs entières : arrondir ici évite un rejet serveur silencieux.
    const rounded = Math.round(num);
    return (rounded >= 0 ? "+" : "") + rounded + unit;
  };

  const rateNum = lerp(parseSigned(base.rate), parseSigned(target.rate), t) * amplitude;
  const pitchNum = lerp(parseSigned(base.pitch), parseSigned(target.pitch), t) * amplitude;
  const volumeNum = lerp(parseSigned(base.volume), parseSigned(target.volume), t) * amplitude;
  const expressivenessNum = lerp(
    base.expressiveness,
    target.expressiveness,
    t
  );

  return {
    rate: formatSigned(rateNum, "%"),
    pitch: formatSigned(pitchNum, "Hz"),
    volume: formatSigned(volumeNum, "%"),
    expressiveness: clamp(expressivenessNum, 0, 1),
  };
}

export function getVocalPreset(style: VocalStyle): VocalPreset {
  const prosody = resolveProsody(style.emotion, style.intensity, style.expressiveness ?? 0.6);
  const personalityInstruction =
    PERSONALITY_GEMINI_INSTRUCTIONS[style.personality];
  const emotionInstruction =
    style.emotion && style.intensity > 0
      ? EMOTION_GEMINI_INSTRUCTIONS[style.emotion]
      : "";

  const geminiInstruction = [
    personalityInstruction,
    emotionInstruction,
    style.auto
      ? "Adapte automatiquement ton émotion et ton ton selon le contexte de la conversation."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    emotion: style.emotion,
    personality: style.personality,
    prosody,
    geminiInstruction,
  };
}

export function getAllEmotions(): Array<{ id: VocalEmotion; label: string }> {
  return [
    { id: "joyeux", label: "Joyeux" },
    { id: "triste", label: "Triste" },
    { id: "serieux", label: "Sérieux" },
    { id: "colerique", label: "Colérique" },
    { id: "calme", label: "Calme" },
    { id: "enthousiaste", label: "Enthousiaste" },
    { id: "seducteur", label: "Séducteur" },
    { id: "sarcastique", label: "Sarcastique" },
    { id: "mysterieux", label: "Mystérieux" },
    { id: "rassurant", label: "Rassurant" },
    { id: "professionnel", label: "Professionnel" },
    { id: "drole", label: "Drôle" },
  ];
}

export function getAllPersonalities(): Array<{
  id: VocalPersonality;
  label: string;
  description: string;
}> {
  return [
    {
      id: "classic",
      label: "Assistant classique",
      description: "Calme, posé, loyal et courtois.",
    },
    {
      id: "ironman",
      label: "JARVIS Iron Man",
      description: "Intelligent, élégant, légèrement sarcastique.",
    },
    {
      id: "accomplice",
      label: "Complice",
      description: "Détendu et humoristique.",
    },
    {
      id: "gentleman",
      label: "Gentleman",
      description: "Posé, élégant et séduisant.",
    },
    {
      id: "professor",
      label: "Professeur",
      description: "Pédagogique et patient.",
    },
    {
      id: "strategist",
      label: "Stratège",
      description: "Froid, précis et analytique.",
    },
    {
      id: "comedien",
      label: "Comédien",
      description: "Expressif et drôle.",
    },
  ];
}

export function getDefaultVocalStyle(): VocalStyle {
  return {
    emotion: null,
    personality: "classic",
    intensity: 0.5,
    auto: false,
  };
}

export function resolveToneFromEmotion(
  emotion: VocalEmotion | null
): "neutral" | "empathetic" | "sarcastic" | "warm" | "calm" {
  const mapping: Record<VocalEmotion, "neutral" | "empathetic" | "sarcastic" | "warm" | "calm"> = {
    joyeux: "warm",
    triste: "empathetic",
    serieux: "neutral",
    colerique: "neutral",
    calme: "calm",
    enthousiaste: "warm",
    seducteur: "warm",
    sarcastique: "sarcastic",
    mysterieux: "calm",
    rassurant: "empathetic",
    professionnel: "neutral",
    drole: "warm",
  };
  return emotion ? mapping[emotion] : "neutral";
}

export function validateVocalStyle(style: VocalStyle): boolean {
  if (!style) return false;
  if (style.intensity < 0 || style.intensity > 1) return false;
  if (
    typeof style.expressiveness === "number" &&
    (style.expressiveness < 0 || style.expressiveness > 1)
  ) return false;
  return true;
}

const VOCAL_STYLE_STORAGE_KEY = "jarvis_vocal_style_v1";

export function loadVocalStyle(): VocalStyle {
  try {
    const raw = localStorage.getItem(VOCAL_STYLE_STORAGE_KEY);
    if (!raw) return getDefaultVocalStyle();
    const parsed = JSON.parse(raw) as Partial<VocalStyle>;
    const style: VocalStyle = {
      emotion: (parsed.emotion ?? null) as VocalEmotion | null,
      personality: (parsed.personality ?? "classic") as VocalPersonality,
      intensity:
        typeof parsed.intensity === "number"
          ? Math.max(0, Math.min(1, parsed.intensity))
          : 0.5,
      auto: Boolean(parsed.auto),
      expressiveness:
        typeof parsed.expressiveness === "number"
          ? Math.max(0, Math.min(1, parsed.expressiveness))
          : 0.6,
    };
    return validateVocalStyle(style) ? style : getDefaultVocalStyle();
  } catch {
    return getDefaultVocalStyle();
  }
}

export function saveVocalStyle(style: VocalStyle): void {
  try {
    localStorage.setItem(VOCAL_STYLE_STORAGE_KEY, JSON.stringify(style));
  } catch {
    // ignore
  }
}

export function isVocalStyleActive(style: VocalStyle | null | undefined): boolean {
  if (!style) return false;
  return style.auto || style.emotion !== null || style.personality !== "classic";
}

export function mapToneToAutoEmotion(
  tone: "neutral" | "empathetic" | "sarcastic" | "warm" | "calm"
): VocalEmotion | null {
  const mapping: Record<string, VocalEmotion | null> = {
    neutral: "professionnel",
    empathetic: "rassurant",
    sarcastic: "sarcastique",
    warm: "enthousiaste",
    calm: "calme",
  };
  return mapping[tone] ?? null;
}

/**
 * Détection contextuelle des 12 émotions en mode automatique.
 * Approche lexicale déterministe (aucun appel Gemini supplémentaire) : elle est appliquée
 * AVANT le début du tour vocal, donc réellement audible dès la réponse en cours.
 * Le ton analysé sert de repli lorsque aucun mot-clé n'est reconnu.
 */
export function detectAutoEmotion(
  text: string,
  tone: "neutral" | "empathetic" | "sarcastic" | "warm" | "calm"
): VocalEmotion {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const patterns: Array<[VocalEmotion, RegExp]> = [
    ["joyeux", /\b(heureux|heureuse|joie|super|genial|content|ravi|bravo)\b/],
    ["triste", /\b(triste|desole|desolé|peine|chagrin|pleur|morose)\b/],
    ["colerique", /\b(colere|enerve|furieux|fache|agace|insupportable)\b/],
    ["calme", /\b(calme|tranquille|respire|posement|serein)\b/],
    ["enthousiaste", /\b(enthousiasme|hate|incroyable|formidable|allez|excited)\b/],
    ["seducteur", /\b(cher|chere|seduisant|charme|flirt|beau|belle)\b/],
    ["sarcastique", /\b(ironie|sarcastique|bien sur|evidemment|merci beaucoup)\b/],
    ["mysterieux", /\b(mystere|secret|etrange|inconnu|enigma|mysterieux)\b/],
    ["rassurant", /\b(rassure|inquiet|peur|stress|ne t inquiete|confiance)\b/],
    ["professionnel", /\b(rapport|analyse|projet|objectif|donnees|resultat|reunion)\b/],
    ["drole", /\b(haha|lol|drôle|drole|rigolo|blague|humour)\b/],
    ["serieux", /\b(important|urgent|grave|priorite|serieux|attention)\b/],
  ];

  for (const [emotion, pattern] of patterns) {
    if (pattern.test(normalized)) return emotion;
  }
  return mapToneToAutoEmotion(tone) ?? "professionnel";
}