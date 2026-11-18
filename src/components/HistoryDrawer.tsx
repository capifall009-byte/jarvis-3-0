import { useState } from "react";
import type { FormEvent } from "react";
import {
  X,
  Plus,
  Trash2,
  MessageSquare,
  Brain,
  Smartphone,
  Copy,
  Check,
  Moon,
} from "lucide-react";
import type { ConversationSession, MemoryItem } from "../types/jarvis";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ConversationSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  memories: MemoryItem[];
  onAddMemory: (fact: string) => void;
  onRemoveMemory: (id: string) => void;
  extremeDark: boolean;
  onToggleExtremeDark: () => void;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function HistoryDrawer({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  memories,
  onAddMemory,
  onRemoveMemory,
  extremeDark,
  onToggleExtremeDark,
}: HistoryDrawerProps) {
  const [tab, setTab] = useState<"history" | "memory" | "siri">("history");
  const [newFact, setNewFact] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://votre-app";
  const listenUrl = `${origin}/?action=listen&new=1`;
  const queryUrlTemplate = `${origin}/?q=Bonjour%20Jarvis&new=1`;
  const siriApiUrl = `${origin}/api/siri`;

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard fallback not needed; user can still select text
    }
  };

  const handleAddMemory = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newFact.trim();
    if (!trimmed) return;
    onAddMemory(trimmed);
    setNewFact("");
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end ${
        extremeDark ? "bg-black/85" : "bg-black/70 backdrop-blur-sm"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Historique, mémoire et raccourcis Siri"
    >
      <div className="flex-1" onClick={onClose} />

      <aside
        className={`w-full max-w-md h-full border-l flex flex-col pt-safe pb-safe ${
          extremeDark
            ? "bg-black border-white/[0.05]"
            : "jarvis-glass bg-[#060C18]/92 border-cyan-400/15"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            extremeDark ? "border-white/[0.04]" : "border-white/[0.07]"
          }`}
        >
          <h2
            className={`font-display text-lg font-medium ${
              extremeDark ? "text-slate-300" : "text-slate-100"
            }`}
          >
            Archives &amp; Raccourcis
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Extreme Dark Mode Battery Saver Toggle */}
        <div
          className={`px-5 py-3 border-b flex items-center justify-between gap-3 ${
            extremeDark ? "border-white/[0.04]" : "border-white/[0.07]"
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-sm font-medium ${
                extremeDark ? "text-slate-300" : "text-slate-200"
              }`}
            >
              Mode sombre extrême
            </p>
            <p
              className={`text-xs ${
                extremeDark ? "text-slate-600" : "text-slate-500"
              }`}
            >
              Luminosité réduite pour économiser la batterie
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleExtremeDark}
            aria-pressed={extremeDark}
            aria-label={
              extremeDark
                ? "Désactiver le mode sombre extrême"
                : "Activer le mode sombre extrême"
            }
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              extremeDark
                ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-300"
                : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-cyan-200 hover:bg-white/[0.07]"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>{extremeDark ? "Activé" : "Désactivé"}</span>
          </button>
        </div>

        {/* Segmented tabs */}
        <div className="px-5 pt-4 pb-2">
          <div
            className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${
              extremeDark
                ? "bg-black border-white/[0.04]"
                : "bg-[#05070B] border-white/[0.06]"
            }`}
          >
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                tab === "history"
                  ? extremeDark
                    ? "bg-cyan-950/35 text-cyan-200/90 border border-cyan-500/20"
                    : "bg-cyan-500/15 text-cyan-200 border border-cyan-400/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Sessions</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("memory")}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                tab === "memory"
                  ? extremeDark
                    ? "bg-cyan-950/35 text-cyan-200/90 border border-cyan-500/20"
                    : "bg-cyan-500/15 text-cyan-200 border border-cyan-400/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Brain className="w-4 h-4 shrink-0" />
              <span>Mémoire</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("siri")}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                tab === "siri"
                  ? extremeDark
                    ? "bg-cyan-950/35 text-cyan-200/90 border border-cyan-500/20"
                    : "bg-cyan-500/15 text-cyan-200 border border-cyan-400/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>Siri iOS</span>
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === "history" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  onNewSession();
                  onClose();
                }}
                className={`w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                  extremeDark
                    ? "bg-cyan-950/25 hover:bg-cyan-950/40 border-cyan-500/20 text-cyan-200/85"
                    : "bg-cyan-400/15 hover:bg-cyan-400/25 border-cyan-400/30 text-cyan-200"
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Nouvelle conversation</span>
              </button>
            </div>

            <div
              className={`jarvis-scroll flex-1 overflow-y-auto px-5 pb-6 divide-y ${
                extremeDark ? "divide-white/[0.04]" : "divide-white/[0.06]"
              }`}
            >
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    className="py-3 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSession(session.id);
                        onClose();
                      }}
                      className="flex-1 text-left min-h-[44px] py-1 pr-2 cursor-pointer group"
                    >
                      <p
                        className={`text-sm font-medium truncate ${
                          isActive
                            ? extremeDark
                              ? "text-cyan-400/85"
                              : "text-cyan-300"
                            : extremeDark
                            ? "text-slate-300 group-hover:text-cyan-200/80"
                            : "text-slate-200 group-hover:text-cyan-200"
                        }`}
                      >
                        {session.title}
                      </p>
                      <p
                        className={`text-xs mt-0.5 flex items-center gap-1.5 ${
                          extremeDark ? "text-slate-600" : "text-slate-500"
                        }`}
                      >
                        <span className="font-mono-tabular">
                          {formatDate(session.updatedAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          {session.messages.length} msg
                        </span>
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSession(session.id)}
                      aria-label={`Supprimer ${session.title}`}
                      className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "memory" && (
          <div className="flex-1 flex flex-col min-h-0 px-5 py-3">
            <p
              className={`text-xs leading-relaxed mb-3 ${
                extremeDark ? "text-slate-500" : "text-slate-400"
              }`}
            >
              Ces repères sont injectés à chaque session pour personnaliser les
              réponses de JARVIS. Vous pouvez aussi lui demander à l&apos;oral
              de retenir une information.
            </p>

            <form onSubmit={handleAddMemory} className="flex gap-2 mb-4">
              <input
                type="text"
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                placeholder="Ex. Je m'appelle Lucas"
                aria-label="Ajouter un souvenir pour JARVIS"
                className={`flex-1 h-11 px-3.5 rounded-xl border focus:outline-none text-sm ${
                  extremeDark
                    ? "bg-black border-white/[0.06] focus:border-cyan-500/40 text-slate-200 placeholder:text-slate-600"
                    : "bg-[#05070B] border-white/[0.09] focus:border-cyan-400/50 text-slate-100 placeholder:text-slate-500"
                }`}
              />
              <button
                type="submit"
                disabled={!newFact.trim()}
                aria-label="Enregistrer"
                className={`inline-flex items-center justify-center w-11 h-11 rounded-xl disabled:opacity-40 border shrink-0 cursor-pointer ${
                  extremeDark
                    ? "bg-cyan-950/30 hover:bg-cyan-950/50 border-cyan-500/20 text-cyan-300/85"
                    : "bg-cyan-400/15 hover:bg-cyan-400/25 border-cyan-400/30 text-cyan-200"
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            <div
              className={`jarvis-scroll flex-1 overflow-y-auto divide-y ${
                extremeDark ? "divide-white/[0.04]" : "divide-white/[0.06]"
              }`}
            >
              {memories.length === 0 ? (
                <p
                  className={`text-sm py-8 text-center ${
                    extremeDark ? "text-slate-600" : "text-slate-500"
                  }`}
                >
                  Aucun repère enregistré pour le moment.
                </p>
              ) : (
                memories.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 flex items-center justify-between gap-2"
                  >
                    <p
                      className={`text-sm leading-snug ${
                        extremeDark ? "text-slate-300" : "text-slate-200"
                      }`}
                    >
                      {item.fact}
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemoveMemory(item.id)}
                      aria-label="Supprimer ce repère"
                      className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "siri" && (
          <div className="jarvis-scroll flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div className="space-y-1.5">
              <h3
                className={`text-sm font-medium ${
                  extremeDark ? "text-slate-300" : "text-slate-100"
                }`}
              >
                Déclencher JARVIS avec Siri
              </h3>
              <p
                className={`text-xs leading-relaxed ${
                  extremeDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Sur iPhone, utilisez l&apos;app Apple Raccourcis avec ces URL
                de navigation ou l&apos;appel API mains libres.
              </p>
            </div>

            <div
              className={`space-y-2.5 pt-3 border-t ${
                extremeDark ? "border-white/[0.04]" : "border-white/[0.07]"
              }`}
            >
              <p
                className={`text-xs font-medium ${
                  extremeDark ? "text-cyan-400/80" : "text-cyan-300"
                }`}
              >
                1. Ouvrir JARVIS prêt à écouter (Ouvrir l&apos;URL)
              </p>
              <div className="flex items-center gap-2">
                <code
                  className={`flex-1 text-xs font-mono-tabular border rounded-lg px-3 py-2.5 truncate ${
                    extremeDark
                      ? "text-slate-400 bg-black border-white/[0.05]"
                      : "text-slate-300 bg-[#05070B] border-white/[0.08]"
                  }`}
                >
                  {listenUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy("listen", listenUrl)}
                  aria-label="Copier l'URL d'écoute"
                  className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border shrink-0 cursor-pointer ${
                    extremeDark
                      ? "bg-transparent hover:bg-cyan-950/30 border-white/[0.05] text-cyan-400/75"
                      : "bg-white/[0.05] hover:bg-cyan-500/20 border-white/[0.08] text-cyan-300"
                  }`}
                >
                  {copiedId === "listen" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div
              className={`space-y-2.5 pt-3 border-t ${
                extremeDark ? "border-white/[0.04]" : "border-white/[0.07]"
              }`}
            >
              <p
                className={`text-xs font-medium ${
                  extremeDark ? "text-cyan-400/80" : "text-cyan-300"
                }`}
              >
                2. Envoyer une requête dictée dans Safari (?q=...)
              </p>
              <div className="flex items-center gap-2">
                <code
                  className={`flex-1 text-xs font-mono-tabular border rounded-lg px-3 py-2.5 truncate ${
                    extremeDark
                      ? "text-slate-400 bg-black border-white/[0.05]"
                      : "text-slate-300 bg-[#05070B] border-white/[0.08]"
                  }`}
                >
                  {queryUrlTemplate}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy("query", queryUrlTemplate)}
                  aria-label="Copier l'URL de requête"
                  className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border shrink-0 cursor-pointer ${
                    extremeDark
                      ? "bg-transparent hover:bg-cyan-950/30 border-white/[0.05] text-cyan-400/75"
                      : "bg-white/[0.05] hover:bg-cyan-500/20 border-white/[0.08] text-cyan-300"
                  }`}
                >
                  {copiedId === "query" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  extremeDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Dans Raccourcis : Dicter du texte → Encoder l&apos;URL → Ouvrir
                l&apos;URL avec <code className="text-slate-300">?q=</code>.
              </p>
            </div>

            <div
              className={`space-y-2.5 pt-3 border-t ${
                extremeDark ? "border-white/[0.04]" : "border-white/[0.07]"
              }`}
            >
              <p
                className={`text-xs font-medium ${
                  extremeDark ? "text-cyan-400/80" : "text-cyan-300"
                }`}
              >
                3. Mode 100 % mains libres (Obtenir le contenu de l&apos;URL)
              </p>
              <div className="flex items-center gap-2">
                <code
                  className={`flex-1 text-xs font-mono-tabular border rounded-lg px-3 py-2.5 truncate ${
                    extremeDark
                      ? "text-slate-400 bg-black border-white/[0.05]"
                      : "text-slate-300 bg-[#05070B] border-white/[0.08]"
                  }`}
                >
                  {siriApiUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy("api", siriApiUrl)}
                  aria-label="Copier l'URL de l'API Siri"
                  className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border shrink-0 cursor-pointer ${
                    extremeDark
                      ? "bg-transparent hover:bg-cyan-950/30 border-white/[0.05] text-cyan-400/75"
                      : "bg-white/[0.05] hover:bg-cyan-500/20 border-white/[0.08] text-cyan-300"
                  }`}
                >
                  {copiedId === "api" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  extremeDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                POST JSON <code className="text-slate-300">{"{\"query\": \"...\"}"}</code>{" "}
                → lire la clé <code className="text-slate-300">spokenText</code>{" "}
                avec l&apos;action « Énoncer le texte ».
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
