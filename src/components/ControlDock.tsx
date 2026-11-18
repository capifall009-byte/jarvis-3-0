import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Mic,
  MicOff,
  SendHorizontal,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { VoiceState } from "../types/jarvis";

interface ControlDockProps {
  voiceState: VoiceState;
  isMuted: boolean;
  isSending: boolean;
  isOffline?: boolean;
  extremeDark?: boolean;
  onToggleMic: () => void;
  onStopAll: () => void;
  onToggleMute: () => void;
  onSendText: (text: string) => void;
  onDraftChange?: (text: string) => void;
  /** Pré-remplissage optionnel (suggestions de l'accueil). */
  initialDraft?: string;
}

export function ControlDock({
  voiceState,
  isMuted,
  isSending,
  isOffline = false,
  extremeDark = false,
  onToggleMic,
  onStopAll,
  onToggleMute,
  onSendText,
  onDraftChange,
  initialDraft,
}: ControlDockProps) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!initialDraft) return;
    setDraft(initialDraft);
    onDraftChange?.(initialDraft);
  }, [initialDraft]);

  const isListening = voiceState === "listening";
  const isBusy =
    voiceState === "listening" ||
    voiceState === "thinking" ||
    voiceState === "speaking" ||
    isSending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setDraft("");
    onDraftChange?.("");
  };

  return (
    <div className="w-full px-3 pb-2.5 sm:px-6 shrink-0">
      <div
        className={`jarvis-stark-composer max-w-3xl mx-auto rounded-2xl border px-3.5 py-2.5 sm:px-4 transition-colors flex flex-col gap-2.5 ${
          extremeDark
            ? "border-white/[0.06] bg-black"
            : "jarvis-glass border-cyan-400/20"
        }`}
      >
        {/* Voice & Playback Control Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMic}
              aria-label={
                isListening
                  ? "Arrêter l'écoute du microphone"
                  : "Parler à JARVIS au microphone"
              }
              className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-medium text-sm transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                extremeDark
                  ? isListening
                    ? "bg-cyan-950/45 text-cyan-300 border border-cyan-500/40 shadow-none"
                    : "bg-cyan-950/35 hover:bg-cyan-900/45 text-cyan-200 border border-cyan-500/30 shadow-none"
                  : isListening
                  ? "bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                  : "bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.28)]"
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>Écoute…</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Parler</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onStopAll}
              disabled={!isBusy}
              aria-label="Arrêter immédiatement la voix et la génération"
              className={`inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl disabled:opacity-35 disabled:pointer-events-none border text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                extremeDark
                  ? "bg-red-950/25 hover:bg-red-950/40 border-red-500/20 text-red-300/80"
                  : "bg-red-500/15 hover:bg-red-500/25 border-red-400/35 text-red-200"
              }`}
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={
              isMuted
                ? "Réactiver la voix de JARVIS"
                : "Couper le son de JARVIS (mode muet)"
            }
            aria-pressed={isMuted}
            className={`inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              extremeDark
                ? isMuted
                  ? "bg-amber-950/25 border-amber-500/25 text-amber-300/85 hover:bg-amber-950/40"
                  : "bg-transparent border-white/[0.05] text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
                : isMuted
                ? "bg-amber-500/15 border-amber-400/35 text-amber-200 hover:bg-amber-500/25"
                : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-cyan-200 hover:bg-white/[0.07]"
            }`}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-4 h-4" />
                <span>Muet</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                <span className="hidden xs:inline sm:inline">Voix active</span>
              </>
            )}
          </button>
        </div>

        {/* Text Input Row */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              const val = e.target.value;
              setDraft(val);
              onDraftChange?.(val);
            }}
            placeholder={
              isOffline
                ? "Commande hors ligne (souvenirs, fichiers, heure)…"
                : "Écrire un message à JARVIS…"
            }
            aria-label="Message texte pour JARVIS"
            className={`w-full h-11 px-4 rounded-xl border focus:outline-none text-[15px] transition-colors ${
              extremeDark
                ? "bg-black border-white/[0.06] focus:border-cyan-500/40 text-slate-200 placeholder:text-slate-600"
                : "bg-[#050A14]/85 border-cyan-400/15 focus:border-cyan-400/50 text-slate-100 placeholder:text-slate-500"
            }`}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Envoyer le message"
            className={`inline-flex items-center justify-center w-11 h-11 rounded-xl disabled:opacity-40 disabled:pointer-events-none border transition-colors shrink-0 cursor-pointer ${
              extremeDark
                ? "bg-transparent hover:bg-cyan-950/30 border-white/[0.06] text-cyan-400/75"
                : "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-400/20 text-cyan-300"
            }`}
          >
            <SendHorizontal className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
