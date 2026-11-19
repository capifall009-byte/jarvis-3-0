export type VoiceCommandAction = "stop_speech" | "new_session";

export interface SpeechInputCallbacks {
  onStart?: () => void;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onVoiceCommand?: (command: VoiceCommandAction, rawText: string) => void;
  onError: (title: string, detail: string) => void;
  onEnd: () => void;
}

export function detectVoiceCommand(rawText: string): VoiceCommandAction | null {
  const normalized = rawText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized === "jarvis tais toi" ||
    normalized === "tais toi jarvis" ||
    normalized.startsWith("jarvis tais toi ")
  ) {
    return "stop_speech";
  }

  if (
    normalized === "jarvis nouvelle session" ||
    normalized === "nouvelle session jarvis" ||
    normalized === "jarvis nouvelle conversation"
  ) {
    return "new_session";
  }

  return null;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export class SpeechInput {
  private recognition: SpeechRecognitionLike | null = null;
  private isListening = false;
  private latestTranscript = "";
  private finalized = false;

  public static isSupported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public start(callbacks: SpeechInputCallbacks): boolean {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onError(
        "Reconnaissance vocale non disponible",
        "Votre navigateur ne supporte pas la dictée vocale Web Speech. Utilisez Safari sur iOS, Chrome ou saisissez votre message par écrit."
      );
      return false;
    }

    this.stop();

    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    this.recognition = rec;
    this.latestTranscript = "";
    this.finalized = false;

    const emitFinal = (rawText: string) => {
      const cleaned = rawText.trim();
      if (!cleaned) return;
      const command = detectVoiceCommand(cleaned);
      if (command && callbacks.onVoiceCommand) {
        callbacks.onVoiceCommand(command, cleaned);
        return;
      }
      callbacks.onFinal(cleaned);
    };

    rec.onstart = () => {
      this.isListening = true;
      callbacks.onStart?.();
    };

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let interimText = "";
      let finalText = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += piece;
        } else {
          interimText += piece;
        }
      }

      const combined = (finalText || interimText).trim();
      this.latestTranscript = combined;

      if (finalText.trim().length > 0) {
        this.finalized = true;
        emitFinal(finalText);
      } else if (interimText.trim().length > 0) {
        callbacks.onInterim(interimText.trim());
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
      this.isListening = false;
      const code = event.error;

      if (code === "aborted") {
        return;
      }
      if (code === "no-speech") {
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        callbacks.onError(
          "Autorisation microphone requise",
          "Sur Android (Chrome) : appuyez sur l'icône de cadenas dans la barre d'adresse > Autorisations > Microphone > Autoriser, puis rechargez la page. Sur iPhone (Safari) : touchez « aA » > Réglages du site web > Microphone > Autoriser."
        );
        return;
      }
      if (code === "audio-capture") {
        callbacks.onError(
          "Microphone indisponible",
          "Impossible d'accéder au microphone. Vérifiez qu'aucune autre application ne l'utilise."
        );
        return;
      }
      if (code === "network") {
        callbacks.onError(
          "Erreur réseau de dictée vocale",
          "La reconnaissance vocale nécessite une connexion Internet sur de nombreux appareils Android. Vérifiez votre réseau, puis réessayez ou écrivez votre message."
        );
        return;
      }

      callbacks.onError(
        "Erreur de reconnaissance vocale",
        event.message || `Code d'erreur : ${code}`
      );
    };

    rec.onend = () => {
      this.isListening = false;
      // Safari iOS sometimes ends recognition without setting isFinal=true
      if (!this.finalized && this.latestTranscript.trim().length > 0) {
        this.finalized = true;
        emitFinal(this.latestTranscript);
      }
      this.recognition = null;
      callbacks.onEnd();
    };

    try {
      rec.start();
      return true;
    } catch (err) {
      this.isListening = false;
      this.recognition = null;
      callbacks.onError(
        "Impossible de démarrer le microphone",
        err instanceof Error
          ? err.message
          : "Erreur lors de l'activation de la reconnaissance vocale."
      );
      return false;
    }
  }

  public stop(): void {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
  }
}
