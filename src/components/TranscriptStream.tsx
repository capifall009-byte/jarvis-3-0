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
  /** Régénère une réponse JARVIS (additif ; le flux existant reste inchangé). */
  onRegenerate?: (assistantMessageId: string) => void;
}

const QUICK_PROMPTS = [
  "Salut JARVIS, fais-moi un point rapide sur l'état du système.",
  "Explique-moi la physique quantique en trois phrases simples.",
  "Retiens que je préfère des réponses brèves et précises.",
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
      <div className="flex flex-col justify-center h-full px-4 py-6 sm:px-6">
        <div className="max-w-md mx-auto w-full space-y-5">
          <div className="space-y-1.5 text-center lg:text-left">
            <h2
              className={`font-display text-lg font-medium ${
                extremeDark ? "text-slate-300" : "text-slate-100"
              }`}
            >
              Salut, moi c&apos;est JARVIS. Comment je pourrais vous aider ?
            </h2>
            <p
              className={`text-sm leading-relaxed ${
                extremeDark ? "text-slate-500" : "text-slate-400"
              }`}
            >
              Touchez « Parler » pour dicter votre demande en français, ou
              saisissez votre message ci-dessous.
            </p>
          </div>

          <div
            className={`space-y-2 pt-2 border-t ${
              extremeDark ? "border-white/[0.03]" : "border-white/[0.07]"
            }`}
          >
            <p
              className={`text-xs ${
                extremeDark ? "text-slate-600" : "text-slate-500"
              }`}
            >
              Suggestions
            </p>
            <div className="flex flex-col gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onQuickPrompt(prompt)}
                  className={`text-left text-sm px-3.5 py-2.5 min-h-[44px] rounded-xl border transition-colors cursor-pointer ${
                    extremeDark
                      ? "text-slate-400 hover:text-cyan-200/80 bg-black hover:bg-white/[0.02] border-white/[0.05] hover:border-cyan-500/20"
                      : "text-slate-300 hover:text-cyan-200 bg-white/[0.025] hover:bg-cyan-500/[0.07] border-white/[0.06] hover:border-cyan-400/25"
                  }`}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        const showUserSentiment =
          isUser && msg.sentiment && msg.sentiment.category !== "neutral";
        const showAssistantTone =
          !isUser && msg.tone && msg.tone !== "neutral";

        return (
          <article
            key={msg.id}
            className={`flex flex-col gap-1.5 ${
              isUser ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`flex items-center flex-wrap gap-2 text-xs ${
                extremeDark ? "text-slate-600" : "text-slate-500"
              }`}
            >
              <span
                className={
                  extremeDark
                    ? isUser
                      ? "font-medium text-slate-400"
                      : "font-medium text-cyan-500/75"
                    : isUser
                    ? "font-medium text-slate-300"
                    : "font-medium text-cyan-400"
                }
              >
                {isUser ? "Vous" : "JARVIS"}
              </span>
              <span aria-hidden="true">·</span>
              <time className="font-mono-tabular">{formatTime(msg.timestamp)}</time>
              <span aria-hidden="true">·</span>
              <span>{msg.source === "voice" ? "Vocal" : "Texte"}</span>
              {showUserSentiment && msg.sentiment && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      extremeDark ? "text-slate-500" : "text-slate-400"
                    }
                  >
                    {msg.sentiment.label}
                  </span>
                </>
              )}
              {showAssistantTone && msg.tone && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      extremeDark ? "text-cyan-500/70" : "text-cyan-300/85"
                    }
                  >
                    Ton{" "}
                    {TONE_PROSODY_PROFILES[msg.tone].label.toLowerCase()}
                  </span>
                </>
              )}
              {!isUser && !msg.isPartial && (
                <>
                  <button
                    type="button"
                    onClick={() => copyMessage(msg.id, msg.text)}
                    className="inline-flex items-center gap-1 min-h-[28px] px-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-white/[0.05] cursor-pointer"
                    title="Copier la réponse"
                    aria-label="Copier la réponse"
                  >
                    {copiedId === msg.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                  {onRegenerate && (
                    <button
                      type="button"
                      onClick={() => onRegenerate(msg.id)}
                      className="inline-flex items-center gap-1 min-h-[28px] px-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-white/[0.05] cursor-pointer"
                      title="Régénérer la réponse"
                      aria-label="Régénérer la réponse"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>

            <div
              className={`max-w-[92%] sm:max-w-[84%] rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-[15px] leading-relaxed border ${
                isUser ? "jarvis-stark-bubble-user" : "jarvis-stark-bubble-ai"
              } ${
                extremeDark
                  ? isUser
                    ? "bg-white/[0.025] text-slate-300 border-white/[0.05]"
                    : "bg-cyan-950/[0.12] text-slate-300 border-cyan-500/[0.12]"
                  : isUser
                  ? "bg-slate-800/65 backdrop-blur-md text-slate-100 border-white/[0.08]"
                  : "jarvis-glass text-slate-100 border-cyan-400/20"
              } ${msg.isPartial ? "opacity-90" : ""}`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.text}</p>

              {!isUser && msg.sources && msg.sources.length > 0 && (
                <div
                  className={`mt-2.5 pt-2 border-t flex flex-col gap-1.5 ${
                    extremeDark ? "border-white/[0.05]" : "border-cyan-400/15"
                  }`}
                >
                  <p
                    className={`text-[11px] font-medium ${
                      extremeDark ? "text-slate-500" : "text-cyan-300/80"
                    }`}
                  >
                    Sources citées
                  </p>
                  <div className="flex flex-col gap-1">
                    {msg.sources.map((src, idx) => (
                      <a
                        key={`${msg.id}-src-${idx}`}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs underline-offset-2 hover:underline truncate ${
                          extremeDark
                            ? "text-cyan-400/75 hover:text-cyan-300"
                            : "text-cyan-300 hover:text-cyan-200"
                        }`}
                      >
                        [{idx + 1}] {src.title || src.domain}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}

      {interimTranscript && (
        <article className="flex flex-col items-end gap-1.5">
          <div
            className={`flex items-center gap-2 text-xs ${
              extremeDark ? "text-slate-600" : "text-slate-500"
            }`}
          >
            <span
              className={`font-medium ${
                extremeDark ? "text-cyan-400/75" : "text-cyan-300"
              }`}
            >
              Vous
            </span>
            <span aria-hidden="true">·</span>
            <span>Dictée en cours</span>
            {interimSentiment && interimSentiment.category !== "neutral" && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    extremeDark ? "text-cyan-400/65" : "text-cyan-300/80"
                  }
                >
                  {interimSentiment.label}
                </span>
              </>
            )}
          </div>
          <div
            className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed border ${
              extremeDark
                ? "bg-white/[0.02] text-slate-300 border-cyan-500/20"
                : "bg-slate-800/50 text-slate-200 border-cyan-400/25"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{interimTranscript}</p>
          </div>
        </article>
      )}

      {isThinking && (
        <div className="flex flex-col items-start gap-1.5">
          <div
            className={`flex items-center gap-2 text-xs ${
              extremeDark ? "text-slate-600" : "text-slate-500"
            }`}
          >
            <span
              className={`font-medium ${
                extremeDark ? "text-cyan-500/75" : "text-cyan-400"
              }`}
            >
              JARVIS
            </span>
            <span aria-hidden="true">·</span>
            <span>Analyse en cours</span>
          </div>
          <div
            className={`rounded-2xl px-4 py-3 border ${
              extremeDark
                ? "bg-cyan-950/[0.1] border-cyan-500/[0.1]"
                : "bg-cyan-950/20 border-cyan-500/15"
            }`}
          >
            <div
              className="flex items-center gap-1.5"
              aria-label="JARVIS analyse votre demande"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.2s] ${
                  extremeDark ? "bg-cyan-500/65" : "bg-cyan-400"
                }`}
              />
              <span
                className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.1s] ${
                  extremeDark ? "bg-cyan-500/65" : "bg-cyan-400"
                }`}
              />
              <span
                className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                  extremeDark ? "bg-cyan-500/65" : "bg-cyan-400"
                }`}
              />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
