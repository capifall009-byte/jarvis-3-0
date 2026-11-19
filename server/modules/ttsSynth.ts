import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Synthèse vocale partagée.
 *
 * Le format demandé à Edge TTS est du MP3 mono 24 kHz à 48 kbit/s constant :
 * la durée se déduit donc directement de la taille du buffer, sans ffprobe.
 *
 * Edge TTS ferme parfois le flux avant `turn.end` ; on réessaie donc quelques
 * fois (nouvelle connexion à chaque essai) pour ne pas perdre un rendu entier.
 */

export const JARVIS_TTS_VOICE = "fr-FR-HenriNeural";

/** 48 kbit/s => 6000 octets par seconde. */
export const JARVIS_TTS_BYTES_PER_SECOND = 48_000 / 8;

/** Longueur maximale acceptée par la route TTS existante. */
export const JARVIS_TTS_MAX_CHARS = 900;

const DEFAULT_ATTEMPTS = 3;

export function sanitizeForSpeech(input: string): string {
  return input
    .replace(/\[\[TON:[^\]]+\]\]/gi, "")
    .replace(/\[\[MEMOIRE:[^\]]+\]\]/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeSsmlText(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SpeechProsodyInput {
  /** Ex. "+0Hz" — format Edge TTS (entier uniquement). */
  pitch?: string;
  /** Ex. "+0%" */
  rate?: string;
  /** Ex. "+0%" */
  volume?: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Synthétise un texte en MP3. Tronque à 900 caractères comme la route /api/tts.
 */
export async function synthesizeSpeechBuffer(
  text: string,
  prosody: SpeechProsodyInput = {},
  attempts: number = DEFAULT_ATTEMPTS
): Promise<Buffer> {
  const cleaned = sanitizeForSpeech(text);
  if (!cleaned) {
    throw new Error("Texte vide pour la synthèse vocale.");
  }

  const clipped = cleaned.slice(0, JARVIS_TTS_MAX_CHARS);
  const ssml = escapeSsmlText(clipped);
  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    const tts = new MsEdgeTTS({
      connectionTimeoutMs: 10_000,
      synthesisTimeoutMs: 30_000,
    });

    try {
      await tts.setMetadata(
        JARVIS_TTS_VOICE,
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
      );

      const { audioStream } = tts.toStream(ssml, {
        // Des valeurs `undefined` produisent un SSML invalide ("undefinedHz")
        // et le service ferme le flux avant turn.end.
        pitch: prosody.pitch ?? "+0Hz",
        rate: prosody.rate ?? "+0%",
        volume: prosody.volume ?? "+0%",
      });

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const audio = Buffer.concat(chunks);
      if (audio.length === 0) {
        throw new Error("Flux audio TTS vide.");
      }
      return audio;
    } catch (error) {
      lastError = error;
    } finally {
      try {
        tts.close();
      } catch {
        // Nettoyage best-effort.
      }
    }

    if (attempt < attempts) {
      await wait(400 * attempt);
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : "erreur inconnue du service TTS";
  throw new Error(
    `Synthèse vocale échouée après ${attempts} tentatives : ${detail}`
  );
}

/**
 * Durée approximative d'un MP3 CBR 48 kbit/s (précision ~20 ms).
 */
export function estimateSpeechDurationSeconds(byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 0;
  return byteLength / JARVIS_TTS_BYTES_PER_SECOND;
}
