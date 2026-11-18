import { Router } from "express";
import type { Request, Response } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { TONE_PROSODY_PROFILES, normalizeTone } from "../shared/sentiment.ts";

interface TtsRequestBody {
  text?: string;
  tone?: string;
  prosody?: { rate?: string; pitch?: string; volume?: string };
}

const FRENCH_MALE_VOICE = "fr-FR-HenriNeural";

function sanitizeForSpeech(input: string): string {
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

function escapeSsmlText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createTtsRouter(): Router {
  const router = Router();

  router.post("/tts", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as TtsRequestBody;
    const rawText = typeof body.text === "string" ? body.text : "";
    const text = sanitizeForSpeech(rawText);
    const tone = normalizeTone(body.tone);
    const toneProfile = TONE_PROSODY_PROFILES[tone];

    // Accepte les valeurs décimales produites par l'interpolation d'émotion, mais normalise
    // en entiers (format attendu par Edge TTS) plutôt que de rejeter silencieusement la prosodie.
    const normalizeProsody = (v: string | undefined, unit: "%" | "Hz"): string | null => {
      if (!v) return null;
      const pattern = unit === "Hz" ? /^([+-]?)(\d+(?:\.\d+)?)Hz$/ : /^([+-]?)(\d+(?:\.\d+)?)%$/;
      const m = pattern.exec(v);
      if (!m) return null;
      const value = Math.round(Number(m[2])) * (m[1] === "-" ? -1 : 1);
      if (!Number.isFinite(value)) return null;
      return `${value >= 0 ? "+" : ""}${value}${unit}`;
    };

    const prosody = {
      edgePitch: normalizeProsody(body.prosody?.pitch, "Hz") ?? toneProfile.edgePitch,
      edgeRate: normalizeProsody(body.prosody?.rate, "%") ?? toneProfile.edgeRate,
      edgeVolume: normalizeProsody(body.prosody?.volume, "%") ?? toneProfile.edgeVolume,
    };

    if (!text) {
      res.status(400).json({ error: "Texte vide pour la synthèse vocale." });
      return;
    }

    // Cap single TTS chunk length for fast synthesis and reliable streaming
    const clippedText = text.length > 900 ? text.slice(0, 900) : text;
    const ssmlSafeText = escapeSsmlText(clippedText);

    const tts = new MsEdgeTTS({
      connectionTimeoutMs: 8000,
      synthesisTimeoutMs: 20000,
    });

    try {
      await tts.setMetadata(
        FRENCH_MALE_VOICE,
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
      );

      const { audioStream } = tts.toStream(ssmlSafeText, {
        pitch: prosody.edgePitch,
        rate: prosody.edgeRate,
        volume: prosody.edgeVolume,
      });

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const audioBuffer = Buffer.concat(chunks);
      if (audioBuffer.length === 0) {
        res.status(502).json({ error: "Flux audio TTS vide." });
        return;
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", String(audioBuffer.length));
      res.setHeader("Cache-Control", "no-store");
      res.send(audioBuffer);
    } catch (err: unknown) {
      console.error("TTS synthesis error:", err);
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : "Échec de la synthèse vocale serveur.",
      });
    } finally {
      try {
        tts.close();
      } catch {
        // Ignore close cleanup error
      }
    }
  });

  return router;
}
