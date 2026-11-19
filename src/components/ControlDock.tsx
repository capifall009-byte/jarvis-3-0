import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Mic,
  MicOff,
  Paperclip,
  SendHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
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
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialDraft) return;
    setDraft(initialDraft);
    onDraftChange?.(initialDraft);
  }, [initialDraft, onDraftChange]);

  const isListening = voiceState === "listening";
  const isBusy =
    voiceState === "listening" ||
    voiceState === "thinking" ||
    voiceState === "speaking" ||
    isSending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed && attachments.length === 0) return;

    let message = trimmed;
    if (attachments.length > 0) {
      const note = `[Pièces jointes sélectionnées : ${attachments.join(", ")}. Pour une analyse détaillée du contenu, utilisez l'espace « Analyse de fichiers ».]`;
      message = message ? `${message}\n\n${note}` : note;
    }

    onSendText(message);
    setDraft("");
    setAttachments([]);
    onDraftChange?.("");
  };

  const onFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const names = Array.from(files).map((f) => f.name).filter(Boolean);
    setAttachments((prev) => [...prev, ...names].slice(0, 8));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (name: string) => {
    setAttachments((prev) => prev.filter((n) => n !== name));
  };

  const shell = extremeDark
    ? "border-white/[0.08] bg-[#05080f]/95"
    : "jarvis-glass border-cyan-400/20 bg-[#050A14]/80";
  const iconBtn = `inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl border transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none`;

  return (
    <div className="w-full px-3 pb-3 sm:px-6 shrink-0">
      <div className={`max-w-3xl mx-auto rounded-2xl border ${shell} backdrop-blur-md px-2.5 py-2 sm:px-3 sm:py-2.5`}>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-2">
            {attachments.map((name) => (
              <span key={name} className={`inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-lg border text-xs ${extremeDark ? "border-cyan-500/25 bg-cyan-950/20 text-cyan-100" : "border-cyan-400/25 bg-cyan-500/10 text-cyan-50"}`}>
                <span className="truncate max-w-[180px] sm:max-w-[240px]">{name}</span>
                <button type="button" onClick={() => removeAttachment(name)} className="text-slate-400 hover:text-slate-100 cursor-pointer" aria-label={`Retirer ${name}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onFilesPicked(e.target.files)}
            aria-label="Joindre des fichiers"
          />

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Joindre des pièces"
              title="Pièces jointes"
              className={`${iconBtn} ${extremeDark ? "border-white/[0.06] text-slate-300 hover:text-cyan-300 hover:bg-white/[0.03]" : "border-cyan-400/20 text-slate-300 hover:text-cyan-200 hover:bg-white/[0.04]"}`}
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              onClick={onToggleMic}
              aria-label={isListening ? "Arrêter l'écoute du microphone" : "Parler à JARVIS"}
              title={isListening ? "Arrêter l'écoute" : "Micro"}
              className={`${iconBtn} ${
                isListening
                  ? extremeDark
                    ? "bg-cyan-950/45 text-cyan-300 border-cyan-500/40"
                    : "bg-cyan-500/20 text-cyan-200 border-cyan-400/50"
                  : extremeDark
                  ? "bg-cyan-950/25 hover:bg-cyan-900/35 text-cyan-200 border-cyan-500/25"
                  : "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 border-cyan-400/25"
              }`}
            >
              {isListening ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <textarea
              value={draft}
              onChange={(e) => {
                const val = e.target.value;
                setDraft(val);
                onDraftChange?.(val);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }}
              rows={1}
              placeholder={isOffline ? "Commande hors ligne (souvenirs, fichiers, heure)…" : "Écrire un message à JARVIS…"}
              aria-label="Message pour JARVIS"
              className={`w-full min-h-[44px] max-h-36 resize-none px-4 py-2.5 rounded-xl border focus:outline-none text-[15px] leading-relaxed transition-colors ${
                extremeDark
                  ? "bg-black/60 border-white/[0.06] focus:border-cyan-500/40 text-slate-100 placeholder:text-slate-600"
                  : "bg-[#050A14]/70 border-cyan-400/15 focus:border-cyan-400/45 text-slate-100 placeholder:text-slate-500"
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onStopAll}
              disabled={!isBusy}
              aria-label="Arrêter la voix et la génération"
              title="Arrêt"
              className={`${iconBtn} ${
                extremeDark
                  ? "bg-red-950/20 hover:bg-red-950/35 border-red-500/20 text-red-300/85"
                  : "bg-red-500/10 hover:bg-red-500/20 border-red-400/30 text-red-200"
              }`}
            >
              <Square className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted ? "Réactiver la voix de JARVIS" : "Couper la voix de JARVIS"}
              aria-pressed={isMuted}
              title={isMuted ? "Activer le son" : "Couper le son"}
              className={`${iconBtn} ${
                isMuted
                  ? "bg-amber-950/20 border-amber-500/25 text-amber-300/90"
                  : extremeDark
                  ? "border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                  : "border-cyan-400/15 text-slate-300 hover:text-cyan-100 hover:bg-white/[0.04]"
              }`}
            >
              {isMuted ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
            </button>

            <button
              type="submit"
              disabled={!draft.trim() && attachments.length === 0}
              aria-label="Envoyer le message"
              title="Envoyer"
              className={`${iconBtn} ${
                extremeDark
                  ? "bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/30 text-cyan-200"
                  : "bg-cyan-400/20 hover:bg-cyan-400/30 border-cyan-400/30 text-cyan-100"
              }`}
            >
              <SendHorizontal className="w-4.5 h-4.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
