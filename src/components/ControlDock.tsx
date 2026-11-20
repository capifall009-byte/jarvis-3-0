import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Plus,
  SendHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { ChatAttachment, VoiceState } from "../types/jarvis";

interface ControlDockProps {
  voiceState: VoiceState;
  isMuted: boolean;
  isSending: boolean;
  isOffline?: boolean;
  extremeDark?: boolean;
  onToggleMic: () => void;
  onStopAll: () => void;
  onToggleMute: () => void;
  onSendText: (text: string, attachments?: ChatAttachment[]) => void;
  onDraftChange?: (text: string) => void;
  initialDraft?: string;
}

const MAX_FILES = 8;
const MAX_FILE_SIZE = 12 * 1024 * 1024; // 12 Mo par fichier
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 Mo total (base64/message)

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferKind(file: File): ChatAttachment["kind"] {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("text/") || /\.(txt|md|csv|json|xml|html?|js|ts|tsx|jsx|py|java|c|cpp|h|css|ya?ml|log)$/i.test(name)) return "text";
  if (/(word|officedocument\.wordprocessing|msword)/i.test(type) || /\.(doc|docx|rtf|odt)$/i.test(name)) return "document";
  return "file";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture du texte impossible."));
    reader.readAsText(file);
  });
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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !isReading;

  const totalSize = useMemo(() => attachments.reduce((s, a) => s + (a.size || 0), 0), [attachments]);

  const autoResize = () => {
    const el = textAreaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => { autoResize(); }, [draft]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if ((!trimmed && attachments.length === 0) || isReading) return;
    if (isOffline) {
      // Hors ligne : pas d'analyse IA réelle des pièces jointes côté serveur distant/local Gemini.
      // On envoie le message avec mention honnête si pièces jointes présentes.
      const note = attachments.length
        ? `\n\n[${attachments.length} pièce(s) jointe(s) non analysée(s) : mode hors ligne, analyse IA indisponible.]`
        : "";
      onSendText((trimmed || "Pièces jointes envoyées.") + note, attachments.length ? attachments : undefined);
    } else {
      onSendText(trimmed, attachments.length ? attachments : undefined);
    }
    setDraft("");
    setAttachments([]);
    setAttachError(null);
    onDraftChange?.("");
    if (textAreaRef.current) textAreaRef.current.style.height = "auto";
  };

  const onFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachError(null);
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > MAX_FILES) {
      setAttachError(`Maximum ${MAX_FILES} pièces jointes par message.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const next: ChatAttachment[] = [];
    let runningTotal = totalSize;
    setIsReading(true);
    try {
      for (const file of incoming) {
        const name = file.name || "fichier";
        const mimeType = file.type || "application/octet-stream";
        const size = file.size || 0;
        if (size > MAX_FILE_SIZE) {
          setAttachError(`"${name}" dépasse la limite de ${formatBytes(MAX_FILE_SIZE)}.`);
          continue;
        }
        if (runningTotal + size > MAX_TOTAL_SIZE) {
          setAttachError(`Taille totale des pièces jointes trop élevée (limite ${formatBytes(MAX_TOTAL_SIZE)}).`);
          continue;
        }
        const kind = inferKind(file);
        const att: ChatAttachment = { id: createId(), name, mimeType, size, kind };
        try {
          if (kind === "image" || kind === "pdf" || kind === "document" || kind === "file") {
            att.dataUrl = await readAsDataURL(file);
            if (kind === "image") att.previewUrl = att.dataUrl;
          }
          if (kind === "text") {
            att.textContent = await readAsText(file);
            // aussi une petite dataUrl non nécessaire ; garder textContent pour analyse fiable
          }
          // pour document non texte, on garde dataUrl (PDF ok). DOCX/DOC: dataUrl présent mais analyse limitée (signalée côté serveur).
          if (!att.dataUrl && !att.textContent) {
            att.error = "Contenu non lisible.";
          }
        } catch (err) {
          att.error = err instanceof Error ? err.message : "Lecture impossible.";
        }
        next.push(att);
        runningTotal += size;
      }
      if (next.length > 0) setAttachments((prev) => [...prev, ...next].slice(0, MAX_FILES));
    } finally {
      setIsReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const shell = extremeDark
    ? "border-white/[0.08] bg-[#05080f]/95"
    : "border-cyan-400/20 bg-[#050A14]/80 backdrop-blur-md";
  const iconBtn = `inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none touch-manipulation`;
  const accept = "image/*,application/pdf,.pdf,.txt,.md,.csv,.json,.xml,.html,.htm,.js,.ts,.tsx,.jsx,.py,.css,.yaml,.yml,.log,.doc,.docx,.rtf,.odt,text/*";

  const handleComposerFocus = () => {
    // Aide iOS/Android à garder le champ visible quand le clavier s'ouvre
    window.setTimeout(() => {
      textAreaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 120);
  };

  return (
    <div className="w-full px-2 sm:px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0 border-t border-transparent">
      <div className={`max-w-3xl mx-auto rounded-2xl border ${shell} px-2 py-2 sm:px-3 sm:py-2.5 shadow-lg shadow-cyan-950/10`}>
        {(attachments.length > 0 || attachError || isReading) && (
          <div className="px-1 pb-2 space-y-2">
            {attachError && (
              <div role="alert" aria-live="assertive" className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/25 rounded-lg px-2.5 py-1.5">{attachError}</div>
            )}
            {isReading && (
              <div role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs text-cyan-300"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture des pièces jointes…</div>
            )}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div key={att.id} className={`relative group flex items-center gap-2 rounded-xl border p-1.5 pr-7 max-w-full ${extremeDark ? "border-cyan-500/20 bg-cyan-950/15" : "border-cyan-400/20 bg-cyan-500/10"}`}>
                    {att.kind === "image" && (att.previewUrl || att.dataUrl) ? (
                      <img src={att.previewUrl || att.dataUrl} alt={att.name} className="w-12 h-12 object-cover rounded-lg border border-white/10 bg-black/30" />
                    ) : (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${extremeDark ? "bg-white/[0.04]" : "bg-cyan-500/10"}`}>
                        {att.kind === "image" ? <ImageIcon className="w-4 h-4 text-cyan-300" /> : <FileText className="w-4 h-4 text-cyan-300" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-slate-100 truncate max-w-[140px] sm:max-w-[200px]" title={att.name}>{att.name}</p>
                      <p className="text-[10px] text-slate-400">{att.kind.toUpperCase()} · {formatBytes(att.size)}</p>
                      {att.error && <p className="text-[10px] text-amber-300 truncate max-w-[160px]">{att.error}</p>}
                    </div>
                    <button type="button" onClick={() => removeAttachment(att.id)} className="absolute top-1 right-1 inline-flex items-center justify-center w-5 h-5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/10 cursor-pointer" aria-label={`Retirer ${att.name}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={(e) => onFilesPicked(e.target.files)}
            aria-label="Joindre des fichiers"
          />

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Ajouter des pièces jointes"
              title="Ajouter photos, images, PDF, documents ou texte"
              disabled={isReading || isSending}
              className={`${iconBtn} ${extremeDark ? "border-cyan-500/25 bg-cyan-950/25 text-cyan-200 hover:bg-cyan-900/35" : "border-cyan-400/25 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"}`}
            >
              {isReading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Plus className="w-5 h-5" />}
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
                  ? "bg-cyan-950/20 hover:bg-cyan-900/30 text-cyan-200 border-cyan-500/20"
                  : "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 border-cyan-400/20"
              }`}
            >
              {isListening ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <textarea
              ref={textAreaRef}
              value={draft}
              onChange={(e) => {
                const val = e.target.value;
                setDraft(val);
                onDraftChange?.(val);
              }}
              onFocus={handleComposerFocus}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }}
              rows={1}
              enterKeyHint="send"
              placeholder={isOffline ? "Mode hors ligne : commandes locales (analyse IA indisponible)…" : "Écrire un message à JARVIS…"}
              aria-label="Message pour JARVIS"
              className={`w-full min-h-[44px] max-h-40 resize-none px-3.5 sm:px-4 py-2.5 rounded-xl border focus:outline-none text-[16px] sm:text-[15px] leading-relaxed transition-colors ${
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
              disabled={!canSend}
              aria-label="Envoyer le message"
              title="Envoyer"
              className={`${iconBtn} ${
                extremeDark
                  ? "bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/30 text-cyan-200 disabled:bg-cyan-950/10"
                  : "bg-cyan-400/20 hover:bg-cyan-400/30 border-cyan-400/30 text-cyan-100 disabled:bg-cyan-500/5"
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
