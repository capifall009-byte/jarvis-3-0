import { TONE_PROSODY_PROFILES } from "../../../shared/sentiment.ts";
import type { JarvisTone } from "../../../shared/sentiment.ts";
import type {
  VocalEmotion,
  VocalPersonality,
  VocalStyle,
} from "../../types/jarvis";
import {
  getVocalPreset,
  mapToneToAutoEmotion,
  resolveToneFromEmotion,
  validateVocalStyle,
} from "./VocalStyleService";

function getAudioContextConstructor(): typeof AudioContext | null {
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return win.AudioContext || win.webkitAudioContext || null;
}

function decodeAudioDataCompat(
  ctx: AudioContext,
  arrayBuffer: ArrayBuffer
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = ctx.decodeAudioData(
        arrayBuffer,
        (decoded) => resolve(decoded),
        (err) => reject(err ?? new Error("Échec du décodage audio."))
      );
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve).catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

function selectDeepFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  const frVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith("fr")
  );
  if (frVoices.length === 0) return null;

  const malePreferredNames = [
    "thomas",
    "nicolas",
    "henri",
    "daniel",
    "paul",
    "remy",
    "antoine",
    "jacques",
  ];
  for (const name of malePreferredNames) {
    const match = frVoices.find((v) => v.name.toLowerCase().includes(name));
    if (match) return match;
  }
  return frVoices[0];
}

export interface SpeechQueueCallbacks {
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * iOS Safari-safe progressive TTS audio engine.
 * Guarantees single-voice serialization (zero overlapping audio),
 * instant STOP interruption, and real-time frequency analysis for the orb.
 */
export class AudioEngine {
  private outputCtx: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private outputFreqBuffer: Uint8Array<ArrayBuffer> | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  private generationId = 0;
  private isMuted = false;
  private isSpeaking = false;
  private callbacks: SpeechQueueCallbacks = {};

  private pendingFetchControllers = new Set<AbortController>();
  private sentenceQueue: Array<{ text: string; tone: JarvisTone; prosody?: { rate?: string; pitch?: string; volume?: string } }> = [];
  private currentTone: JarvisTone = "neutral";
  private currentProsody: { rate?: string; pitch?: string; volume?: string } | null = null;
  private vocalStyle: VocalStyle | null = null;
  private isProcessingQueue = false;
  private streamFinished = true;
  private syntheticEnergy = 0;

  public setCallbacks(callbacks: SpeechQueueCallbacks): void {
    this.callbacks = callbacks;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopPlayback();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setSyntheticListeningEnergy(energy: number): void {
    this.syntheticEnergy = Math.max(0, Math.min(1, energy));
  }

  /**
   * Must be called synchronously inside a user tap/click handler on Safari iOS.
   */
  public prepareOnUserGesture(): void {
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return;

    if (!this.outputCtx || this.outputCtx.state === "closed") {
      this.outputCtx = new AudioCtx();
    }

    if (!this.outputAnalyser && this.outputCtx) {
      this.outputAnalyser = this.outputCtx.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.72;
      this.outputAnalyser.connect(this.outputCtx.destination);
      this.outputFreqBuffer = new Uint8Array(
        new ArrayBuffer(this.outputAnalyser.frequencyBinCount)
      );
    }

    if (this.outputCtx.state === "suspended") {
      void this.outputCtx.resume();
    }

    // Unlock iOS Safari hardware audio output with a 1-sample silent buffer
    try {
      const silent = this.outputCtx.createBuffer(
        1,
        1,
        this.outputCtx.sampleRate
      );
      const src = this.outputCtx.createBufferSource();
      src.buffer = silent;
      src.connect(this.outputCtx.destination);
      src.start(0);
    } catch {
      // Ignore
    }
  }

  /**
   * Starts a fresh progressive speech session, canceling any previous audio.
   */
  public beginSpeechTurn(
    initialTone: JarvisTone = "neutral",
    prosody?: { rate?: string; pitch?: string; volume?: string } | null,
    vocalStyle?: VocalStyle | null
  ): number {
    this.stopPlayback();
    this.generationId += 1;

    let resolvedTone = initialTone;
    let resolvedProsody = prosody ?? null;

    if (vocalStyle && validateVocalStyle(vocalStyle)) {
      this.vocalStyle = vocalStyle;
      const preset = getVocalPreset(vocalStyle);
      resolvedTone = resolveToneFromEmotion(vocalStyle.emotion);
      resolvedProsody = preset.prosody;
    }

    this.currentTone = resolvedTone;
    this.currentProsody = resolvedProsody;
    this.sentenceQueue = [];
    this.isProcessingQueue = false;
    this.streamFinished = false;
    this.nextStartTime = 0;
    this.activeSources.clear();
    return this.generationId;
  }

  public setTurnTone(tone: JarvisTone, genId: number): void {
    if (genId !== this.generationId) return;
    this.currentTone = tone;
    // En mode auto, adapter la prosodie selon le ton détecté par Gemini.
    if (this.vocalStyle?.auto) {
      const emotion = mapToneToAutoEmotion(tone);
      const preset = getVocalPreset({
        ...this.vocalStyle,
        emotion,
      });
      this.currentProsody = preset.prosody;
    }
  }

  public setTurnProsody(
    prosody: { rate?: string; pitch?: string; volume?: string } | null,
    genId?: number
  ): void {
    if (genId !== undefined && genId !== this.generationId) return;
    this.currentProsody = prosody;
  }

  public setVocalStyle(style: VocalStyle): void {
    if (!validateVocalStyle(style)) return;
    this.vocalStyle = style;
    const preset = getVocalPreset(style);
    this.currentTone = resolveToneFromEmotion(style.emotion);
    this.currentProsody = preset.prosody;
  }

  public getVocalStyle(): VocalStyle | null {
    return this.vocalStyle;
  }

  public enqueueSentence(sentence: string, genId: number): void {
    if (this.isMuted || genId !== this.generationId) return;
    const cleaned = sentence.trim();
    if (!cleaned) return;

    this.sentenceQueue.push({
      text: cleaned,
      tone: this.currentTone,
      prosody: this.currentProsody ?? undefined,
    });
    if (!this.isProcessingQueue) {
      void this.drainQueue(genId);
    }
  }

  public markStreamComplete(genId: number): void {
    if (genId !== this.generationId) return;
    this.streamFinished = true;
    this.checkPlaybackFinished(genId);
  }

  private async drainQueue(genId: number): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (
        this.sentenceQueue.length > 0 &&
        genId === this.generationId &&
        !this.isMuted
      ) {
        const item = this.sentenceQueue.shift();
        if (!item) continue;

        try {
          await this.fetchAndScheduleSentence(item.text, item.tone, item.prosody, genId);
        } catch (err) {
          if (genId !== this.generationId || this.isMuted) break;
          // Fallback to Web Speech Synthesis if server TTS fails transiently
          const fallbackOk = await this.speakWithBrowserFallback(
            item.text,
            item.tone,
            genId
          );
          if (!fallbackOk) {
            this.callbacks.onError?.(
              err instanceof Error
                ? err.message
                : "Erreur lors de la synthèse vocale."
            );
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
      this.checkPlaybackFinished(genId);
    }
  }

  private async fetchAndScheduleSentence(
    text: string,
    tone: JarvisTone,
    prosody: { rate?: string; pitch?: string; volume?: string } | undefined,
    genId: number
  ): Promise<void> {
    const controller = new AbortController();
    this.pendingFetchControllers.add(controller);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone, prosody }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`TTS serveur indisponible (${res.status})`);
      }

      const arrayBuffer = await res.arrayBuffer();
      if (genId !== this.generationId || this.isMuted) return;

      if (!this.outputCtx || !this.outputAnalyser) {
        this.prepareOnUserGesture();
      }
      if (!this.outputCtx || !this.outputAnalyser) {
        throw new Error("Contexte audio indisponible.");
      }

      if (this.outputCtx.state === "suspended") {
        await this.outputCtx.resume();
      }

      const audioBuffer = await decodeAudioDataCompat(
        this.outputCtx,
        arrayBuffer
      );
      if (genId !== this.generationId || this.isMuted) return;

      const source = this.outputCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAnalyser);

      const now = this.outputCtx.currentTime;
      if (this.nextStartTime < now) {
        this.nextStartTime = now + 0.02;
      }

      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.callbacks.onSpeakingStart?.();
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.activeSources.add(source);

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0) {
          this.nextStartTime = 0;
        }
        this.checkPlaybackFinished(genId);
      };
    } finally {
      this.pendingFetchControllers.delete(controller);
    }
  }

  private speakWithBrowserFallback(
    text: string,
    tone: JarvisTone,
    genId: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        genId !== this.generationId ||
        this.isMuted
      ) {
        resolve(false);
        return;
      }

      const prosody = TONE_PROSODY_PROFILES[tone];
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      utterance.pitch = prosody.browserPitch;
      utterance.rate = prosody.browserRate;
      utterance.volume = 1;

      const voice = selectDeepFrenchVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        if (genId !== this.generationId || this.isMuted) {
          window.speechSynthesis.cancel();
          resolve(false);
          return;
        }
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.callbacks.onSpeakingStart?.();
        }
      };

      utterance.onend = () => {
        resolve(true);
      };

      utterance.onerror = () => {
        resolve(false);
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  private checkPlaybackFinished(genId: number): void {
    if (genId !== this.generationId) return;
    const synthBusy =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      window.speechSynthesis.speaking;

    if (
      this.streamFinished &&
      !this.isProcessingQueue &&
      this.sentenceQueue.length === 0 &&
      this.pendingFetchControllers.size === 0 &&
      this.activeSources.size === 0 &&
      !synthBusy
    ) {
      if (this.isSpeaking) {
        this.isSpeaking = false;
        this.callbacks.onSpeakingEnd?.();
      }
    }
  }

  public stopPlayback(): void {
    this.generationId += 1;
    this.sentenceQueue = [];
    this.streamFinished = true;
    this.isProcessingQueue = false;

    for (const controller of this.pendingFetchControllers) {
      try {
        controller.abort();
      } catch {
        // Ignore
      }
    }
    this.pendingFetchControllers.clear();

    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Ignore
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }

    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.callbacks.onSpeakingEnd?.();
    }
  }

  public getInputLevel(): number {
    return this.syntheticEnergy;
  }

  public getOutputLevel(): number {
    if (!this.isSpeaking) return 0;
    if (
      !this.outputAnalyser ||
      !this.outputFreqBuffer ||
      this.activeSources.size === 0
    ) {
      // Fallback subtle wave if browser SpeechSynthesis fallback is active
      return 0.32;
    }
    this.outputAnalyser.getByteFrequencyData(this.outputFreqBuffer);
    let sum = 0;
    const len = this.outputFreqBuffer.length;
    for (let i = 0; i < len; i++) {
      sum += this.outputFreqBuffer[i];
    }
    return Math.min(1, sum / (len * 95));
  }

  public async resumeIfInterrupted(): Promise<void> {
    if (this.outputCtx && this.outputCtx.state === "suspended") {
      try {
        await this.outputCtx.resume();
      } catch {
        // Ignore
      }
    }
  }

  public dispose(): void {
    this.stopPlayback();
    if (this.outputCtx && this.outputCtx.state !== "closed") {
      void this.outputCtx.close();
    }
    this.outputCtx = null;
    this.outputAnalyser = null;
  }
}
