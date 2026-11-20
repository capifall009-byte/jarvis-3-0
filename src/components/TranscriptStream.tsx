import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileText, Image as ImageIcon, Loader2, RotateCcw } from "lucide-react";
import type { ChatAttachment, TranscriptMessage } from "../types/jarvis";

interface TranscriptStreamProps {
  messages: TranscriptMessage[];
  interimTranscript: string;
  interimSentiment?: unknown;
  isThinking: boolean;
  extremeDark?: boolean;
  onQuickPrompt: (prompt: string) => void;
  onRegenerate?: (assistantMessageId: string) => void;
}

const QUICK_PROMPTS = [
  "Fais-moi un point rapide sur l'état du système.",
  "Explique-moi un sujet complexe simplement.",
  "Aide-moi à organiser mes priorités du jour.",
];

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function downloadUrl(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Téléchargement impossible");
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = filename || "image.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 2000);
  } catch {
    // fallback: open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function AttachmentCard({
  att,
  extremeDark,
  alignRight,
}: {
  att: ChatAttachment;
  extremeDark: boolean;
  alignRight?: boolean;
}) {
  const isImage = att.kind === "image" || (att.mimeType || "").startsWith("image/");
  const src = att.previewUrl || att.dataUrl || att.generatedImageUrl;
  const cardBase = extremeDark ? "border-white/[0.08] bg-white/[0.03]" : "border-cyan-400/20 bg-cyan-500/[0.06]";
  if (isImage && src) {
    return (
      <div className={`overflow-hidden rounded-xl border ${cardBase} max-w-[280px] sm:max-w-[360px]`}>
        <img src={src} alt={att.name || "Image jointe"} className="w-full h-auto max-h-72 object-cover bg-black/20" loading="lazy" />
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-200 truncate">{att.name || "image"}</p>
            <p className="text-[10px] text-slate-400">{formatBytes(att.size) || "Image"}</p>
          </div>
          <button
            type="button"
            onClick={() => downloadUrl(src, att.name || "image.png")}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
            aria-label={`Télécharger ${att.name || "l'image"}`}
            title="Télécharger"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${cardBase} max-w-[320px]`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${extremeDark ? "bg-white/[0.05]" : "bg-cyan-500/10"}`}>
        {isImage ? <ImageIcon className="w-4 h-4 text-cyan-300" /> : <FileText className="w-4 h-4 text-cyan-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-100 truncate" title={att.name}>{att.name || "Fichier"}</p>
        <p className="text-[10px] text-slate-400">{(att.mimeType || att.kind || "fichier").toUpperCase()} {formatBytes(att.size) ? `· ${formatBytes(att.size)}` : ""}</p>
        {att.error && <p className="text-[10px] text-amber-300">{att.error}</p>}
      </div>
    </div>
  );
}

function GeneratedImageCard({ url, prompt, alt, extremeDark }: { url: string; prompt?: string; alt?: string; extremeDark: boolean }) {
  const [failed, setFailed] = useState(false);
  const cardBase = extremeDark ? "border-cyan-500/20 bg-cyan-950/10" : "border-cyan-400/25 bg-cyan-500/[0.06]";
  return (
    <div className={`overflow-hidden rounded-xl border ${cardBase} max-w-[320px] sm:max-w-[420px]`}>
      {!failed ? (
        <img src={url} alt={alt || prompt || "Image générée"} className="w-full h-auto bg-black/20" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="p-4 text-xs text-amber-300">L'image n'a pas pu être chargée (service indisponible ou erreur). Aucune génération réussie ne peut être confirmée.</div>
      )}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <p className="text-[11px] text-slate-300 truncate" title={prompt || "Image générée"}>{prompt ? `Générée : ${prompt}` : "Image générée"}</p>
        {!failed && (
          <button
            type="button"
            onClick={() => downloadUrl(url, "jarvis-image.png")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-cyan-200 hover:bg-cyan-500/10 cursor-pointer shrink-0"
            title="Télécharger l'image"
          >
            <Download className="w-3.5 h-3.5" /> Télécharger
          </button>
        )}
      </div>
    </div>
  );
}

export function TranscriptStream({
  messages,
  interimTranscript,
  isThinking,
  extremeDark = false,
  onQuickPrompt,
  onRegenerate,
}: TranscriptStreamProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, interimTranscript, isThinking]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  const isEmpty = messages.length === 0 && !interimTranscript && !isThinking;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden jarvis-scroll overscroll-contain px-3 sm:px-6 py-3 sm:py-4">
      <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
        {isEmpty && (
          <div className="py-10 sm:py-16 text-center space-y-5">
            <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center border ${extremeDark ? "border-cyan-500/20 bg-cyan-950/20" : "border-cyan-400/25 bg-cyan-500/10"}`}>
              <ImageIcon className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <h2 className={`text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-100" : "text-cyan-50"}`}>Discuter avec JARVIS</h2>
              <p className={`mt-1 text-sm ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>Posez une question, envoyez une image ou un fichier avec le bouton +, ou demandez une génération d'image.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onQuickPrompt(p)}
                  className={`px-3.5 py-2 rounded-xl border text-xs sm:text-sm cursor-pointer transition-colors ${extremeDark ? "border-white/[0.08] text-slate-300 hover:bg-white/[0.03] hover:text-cyan-200" : "border-cyan-400/20 text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-100"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const attachments = msg.attachments || [];
          const generated = msg.generatedImages || [];
          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[92%] sm:max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                {!isUser && (
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-medium text-cyan-300/90">JARVIS</span>
                    {msg.providerLabel && <span className="text-[10px] text-slate-500">· {msg.providerLabel}</span>}
                    {msg.isPartial && <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300/70"><Loader2 className="w-3 h-3 animate-spin" />en cours</span>}
                  </div>
                )}

                {(attachments.length > 0 || generated.length > 0) && (
                  <div className={`mb-1.5 flex flex-wrap gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                    {attachments.map((att) => (
                      <AttachmentCard key={att.id} att={att} extremeDark={extremeDark} alignRight={isUser} />
                    ))}
                    {generated.map((img) => (
                      <GeneratedImageCard key={img.id} url={img.url} prompt={img.prompt} alt={img.alt} extremeDark={extremeDark} />
                    ))}
                  </div>
                )}

                {msg.text && msg.text.trim().length > 0 && (
                  <div
                    className={`rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-[15px] sm:text-base leading-relaxed whitespace-pre-wrap break-words ${
                      isUser
                        ? extremeDark
                          ? "bg-cyan-600/25 text-slate-50 border border-cyan-500/25 rounded-br-md"
                          : "bg-cyan-500/20 text-slate-50 border border-cyan-400/30 rounded-br-md"
                        : extremeDark
                        ? "bg-white/[0.03] text-slate-100 border border-white/[0.06] rounded-bl-md"
                        : "bg-[#0a1220]/80 text-slate-100 border border-cyan-400/15 rounded-bl-md"
                    }`}
                  >
                    {msg.text}
                  </div>
                )}

                <div className={`mt-1 flex items-center gap-1 px-1 ${isUser ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] text-slate-500 px-1">{formatTime(msg.timestamp)}</span>
                  {msg.text && (
                    <button type="button" onClick={() => copy(msg.id, msg.text)} className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-500 hover:text-cyan-300 hover:bg-white/[0.04] cursor-pointer" title="Copier" aria-label="Copier le message">
                      {copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
                  {!isUser && !msg.isPartial && onRegenerate && (
                    <button type="button" onClick={() => onRegenerate(msg.id)} className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-500 hover:text-cyan-300 hover:bg-white/[0.04] cursor-pointer" title="Régénérer" aria-label="Régénérer la réponse">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {interimTranscript && (
          <div className="flex justify-end">
            <div className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed border rounded-br-md ${extremeDark ? "bg-cyan-600/10 text-cyan-100/80 border-cyan-500/20 border-dashed" : "bg-cyan-500/10 text-cyan-50/90 border-cyan-400/20 border-dashed"}`}>
              {interimTranscript}
            </div>
          </div>
        )}

        {isThinking && (
          <div className="flex justify-start">
            <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 border rounded-bl-md ${extremeDark ? "bg-white/[0.03] border-white/[0.06]" : "bg-[#0a1220]/80 border-cyan-400/15"}`}>
              <span className="inline-flex gap-1.5 items-center">
                <span className="w-2 h-2 rounded-full bg-cyan-400/80 animate-bounce [animation-delay:-0.2s]" />
                <span className="w-2 h-2 rounded-full bg-cyan-400/80 animate-bounce [animation-delay:-0.1s]" />
                <span className="w-2 h-2 rounded-full bg-cyan-400/80 animate-bounce" />
              </span>
              <span className="text-sm text-slate-300">JARVIS réfléchit…</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
