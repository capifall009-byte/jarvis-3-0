import { useEffect, useRef, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { TONE_PROSODY_PROFILES } from "../../shared/sentiment.ts";
import type { SentimentAnalysis } from "../../shared/sentiment.ts";
import type { TranscriptMessage } from "../types/jarvis";

interface TranscriptStreamProps {
  messages: TranscriptMessage[];
  interimTranscript: string;
  interimSentiment?: SentimentAnalysis | null;
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

export function TranscriptStream({
  messages,
  interimTranscript,
  interimSentiment = null,
  isThinking,
  extremeDark = false,
  onQuickPrompt,
  onRegenerate,
}: TranscriptStreamProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyMessage = (id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    }).catch(() => setCopiedId(null));
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, interimTranscript, isThinking]);

  if (messages.length === 0 && !interimTranscript && !isThinking) {
    return (
      <div className="flex flex-col justify-center h-full px-4 py-8 sm:px-6">
        <div className="max-w-2xl mx-auto w-full space-y-5">
          <div className="space-y-2 text-center">
            <h2 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
              Comment puis-je vous aider ?
            </h2>
            <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
              Écrivez un message ou utilisez le micro. JARVIS vous répond dans une conversation claire et continue.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onQuickPrompt(prompt)}
                className={`text-left text-sm px-3.5 py-3 min-h-[52px] rounded-xl border transition-colors cursor-pointer ${
                  extremeDark
                    ? "text-slate-300 hover:text-cyan-100 bg-white/[0.02] hover:bg-white/[0.04] border-white/[0.06] hover:border-cyan-500/20"
                    : "text-slate-200 hover:text-cyan-50 bg-white/[0.02] hover:bg-cyan-500/[0.06] border-cyan-400/15 hover:border-cyan-400/30"
                }`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-4 py-5 sm:px-6 space-y-6">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const showUserSentiment = isUser && msg.sentiment && msg.sentiment.category !== "neutral";
          const showAssistantTone = !isUser && msg.tone && msg.tone !== "neutral";

          return (
            <article key={msg.id} className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
              <div className={`flex items-center flex-wrap gap-2 text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                <span className={isUser ? (extremeDark ? "font-medium text-slate-300" : "font-medium text-slate-200") : (extremeDark ? "font-medium text-cyan-300/80" : "font-medium text-cyan-300")}>
                  {isUser ? "Vous" : "JARVIS"}
                </span>
                <span aria-hidden="true">·</span>
                <time className="font-mono-tabular">{formatTime(msg.timestamp)}</time>
                <span aria-hidden="true">·</span>
                <span>{msg.source === "voice" ? "Vocal" : "Texte"}</span>
                {showUserSentiment && msg.sentiment && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{msg.sentiment.label}</span>
                  </>
                )}
                {showAssistantTone && msg.tone && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className={extremeDark ? "text-cyan-400/70" : "text-cyan-300/85"}>
                      Ton {TONE_PROSODY_PROFILES[msg.tone].label.toLowerCase()}
                    </span>
                  </>
                )}
                {!isUser && !msg.isPartial && (
                  <span className="inline-flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      onClick={() => copyMessage(msg.id, msg.text)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-white/[0.05] cursor-pointer"
                      title="Copier la réponse"
                      aria-label="Copier la réponse"
                    >
                      {copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {onRegenerate && (
                      <button
                        type="button"
                        onClick={() => onRegenerate(msg.id)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-white/[0.05] cursor-pointer"
                        title="Régénérer la réponse"
                        aria-label="Régénérer la réponse"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                )}
              </div>

              <div
                className={`w-full sm:w-auto max-w-full sm:max-w-[88%] rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-[15px] leading-relaxed border ${
                  isUser
                    ? extremeDark
                      ? "bg-cyan-950/20 text-slate-100 border-cyan-500/20"
                      : "bg-cyan-500/10 text-slate-100 border-cyan-400/25"
                    : extremeDark
                    ? "bg-[#060b14] text-slate-200 border-white/[0.06]"
                    : "bg-[#07101d]/80 text-slate-100 border-cyan-400/15"
                } ${msg.isPartial ? "opacity-90" : ""}`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>

                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className={`mt-3 pt-2.5 border-t flex flex-col gap-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Sources</p>
                    <ul className="space-y-1">
                      {msg.sources.map((s, i) => (
                        <li key={`${msg.id}-src-${i}`} className="text-xs">
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2 break-all">
                            {s.title || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {interimTranscript && (
          <article className="flex flex-col gap-1.5 items-end opacity-80">
            <div className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Vous · en cours…</div>
            <div className={`max-w-full sm:max-w-[88%] rounded-2xl px-4 py-3 border text-[15px] italic ${extremeDark ? "bg-white/[0.02] border-white/[0.06] text-slate-300" : "bg-white/[0.03] border-cyan-400/15 text-slate-200"}`}>
              <p className="whitespace-pre-wrap break-words">{interimTranscript}</p>
              {interimSentiment && interimSentiment.category !== "neutral" && (
                <p className="mt-1 text-[11px] not-italic text-slate-400">{interimSentiment.label}</p>
              )}
            </div>
          </article>
        )}

        {isThinking && (
          <article className="flex flex-col gap-1.5 items-start">
            <div className={`text-[11px] ${extremeDark ? "text-cyan-300/70" : "text-cyan-300/85"}`}>JARVIS · réflexion…</div>
            <div className={`rounded-2xl px-4 py-3 border ${extremeDark ? "bg-[#060b14] border-white/[0.06]" : "bg-[#07101d]/80 border-cyan-400/15"}`}>
              <div className="flex items-center gap-1.5" aria-label="JARVIS réfléchit">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 animate-pulse [animation-delay:120ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 animate-pulse [animation-delay:240ms]" />
              </div>
            </div>
          </article>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
}
