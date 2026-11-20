import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  Clock3,
  FileText,
  Film,
  Globe,
  LayoutDashboard,
  MessageSquare,
  Microscope,
  Newspaper,
  Quote,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  FolderKanban,
} from "lucide-react";
import type { AppView, ConversationSession, ProjectItem, VoiceState } from "../../types/jarvis";
import { JarvisOrb } from "../JarvisOrb";
import { HudCore, type HudCoreState } from "../hud/HudCore";
import { getDailyQuote } from "../../services/quotes/dailyQuote";

interface HomeViewProps {
  extremeDark: boolean;
  isOnline: boolean;
  geminiModel: string | null;
  sessions: ConversationSession[];
  projects: ProjectItem[];
  onSelectView: (view: AppView) => void;
  onNewSession: () => void;
  onSuggestion: (text: string) => void;
  onSpeakText: (text: string) => void;
  voiceState?: VoiceState;
  getInputLevel?: () => number;
  getOutputLevel?: () => number;
  onOrbClick?: () => void;
  showDailyQuote?: boolean;
}

const STARTUP_GREETING_TEXT = "Salut, je suis JARVIS. Comment pourrais-je vous aider ?";

/** Traduction de l'état vocal réel vers l'état du noyau HUD — aucune invention. */
const CORE_STATE: Record<VoiceState, HudCoreState> = {
  idle: "idle",
  connecting: "thinking",
  listening: "listening",
  speaking: "speaking",
  thinking: "thinking",
  offline: "offline",
  error: "error",
};

const CORE_STATE_LABEL: Record<HudCoreState, string> = {
  idle: "VEILLE",
  listening: "ÉCOUTE",
  thinking: "TRAITEMENT",
  speaking: "RÉPONSE",
  error: "ERREUR",
  offline: "HORS LIGNE",
  stopped: "STOP GLOBAL",
};

const SHORTCUTS: Array<{ id: AppView; label: string; desc: string; icon: typeof Brain }> = [
  { id: "conversations", label: "Conversations", desc: "Discuter avec JARVIS", icon: MessageSquare },
  { id: "projects", label: "Projets", desc: "Objectifs et tâches", icon: FolderKanban },
  { id: "memory", label: "Mémoire", desc: "Souvenirs et préférences", icon: Brain },
  { id: "search", label: "Recherche Web", desc: "Sources et analyses", icon: Globe },
  { id: "research", label: "Recherche approfondie", desc: "Enquêtes multi-sources", icon: Microscope },
  { id: "news", label: "Actualités", desc: "Infos et veille", icon: Newspaper },
  { id: "files", label: "Analyse de fichiers", desc: "Documents et images", icon: FileText },
  { id: "video", label: "Studio vidéo", desc: "Montage et exports", icon: Film },
  { id: "social", label: "Social Hub", desc: "Comptes et contenus", icon: Share2 },
  { id: "controlCenter", label: "Centre de contrôle", desc: "Services et organisation", icon: LayoutDashboard },
  { id: "modes", label: "Modes", desc: "Comportements de JARVIS", icon: SlidersHorizontal },
  { id: "settings", label: "Paramètres", desc: "Préférences et système", icon: Settings },
];

export function HomeView({
  extremeDark,
  isOnline,
  geminiModel,
  sessions,
  projects,
  onSelectView,
  onNewSession,
  onSuggestion,
  onSpeakText,
  voiceState = "idle",
  getInputLevel,
  getOutputLevel,
  onOrbClick,
  showDailyQuote = true,
}: HomeViewProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now),
    [now]
  );
  const timeLabel = useMemo(
    () => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(now),
    [now]
  );
  const dailyQuote = useMemo(() => getDailyQuote(), []);
  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 3),
    [sessions]
  );
  const recentProjects = useMemo(
    () => [...projects].filter((p) => p.status !== "archived").slice(0, 3),
    [projects]
  );

  const coreState = CORE_STATE[voiceState];
  const card = `hud-panel rounded-2xl border ${extremeDark ? "bg-black/60 border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;
  const muted = extremeDark ? "text-slate-400" : "text-slate-300";
  const title = extremeDark ? "text-slate-100" : "text-cyan-50";

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Hero */}
        <section className={`${card} p-5 sm:p-7 relative overflow-hidden`}>
          <div className="absolute inset-0 pointer-events-none opacity-60" aria-hidden="true">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-16 w-[20rem] h-[20rem] rounded-full bg-blue-600/10 blur-3xl" />
          </div>
          <div className="relative flex flex-col items-center text-center gap-4">
            {onOrbClick && getInputLevel && getOutputLevel && (
              <div className="pt-2 pb-6">
                <HudCore state={coreState} label={CORE_STATE_LABEL[coreState]}>
                  <JarvisOrb
                    voiceState={voiceState}
                    getInputLevel={getInputLevel}
                    getOutputLevel={getOutputLevel}
                    onOrbClick={onOrbClick}
                    extremeDark={extremeDark}
                  />
                </HudCore>
              </div>
            )}

            <div className="space-y-2 max-w-2xl">
              <p className={`text-[11px] uppercase tracking-[0.22em] ${extremeDark ? "text-cyan-300/80" : "text-cyan-300"}`}>JARVIS 4.0</p>
              <h1 className={`font-display text-2xl sm:text-4xl font-medium leading-tight ${title}`}>
                {STARTUP_GREETING_TEXT}
              </h1>
              <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm ${muted}`}>
                <span className="capitalize">{dateLabel}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="inline-flex items-center gap-1.5 font-mono-tabular"><Clock3 className="w-3.5 h-3.5" />{timeLabel}</span>
              </div>
            </div>

            {showDailyQuote && dailyQuote && (
              <div className={`max-w-2xl w-full rounded-xl border px-4 py-3 text-left ${extremeDark ? "border-white/[0.06] bg-white/[0.02]" : "border-cyan-400/15 bg-cyan-500/[0.04]"}`}>
                <div className="flex items-start gap-2.5">
                  <Quote className={`w-4 h-4 mt-0.5 shrink-0 ${extremeDark ? "text-cyan-300" : "text-cyan-200"}`} aria-hidden="true" />
                  <div className="space-y-1 min-w-0">
                    <p className={`text-sm italic leading-relaxed ${extremeDark ? "text-slate-300" : "text-slate-200"}`}>« {dailyQuote.text} »</p>
                    {dailyQuote.author ? <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>— {dailyQuote.author}</p> : null}
                  </div>
                </div>
                <p className={`mt-1.5 text-[10px] uppercase tracking-[0.14em] ${extremeDark ? "text-slate-500" : "text-slate-500"}`}>Citation du jour</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={onNewSession}
                className={`inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl border text-sm font-medium cursor-pointer ${extremeDark ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-100 hover:bg-cyan-950/55" : "bg-cyan-500/18 border-cyan-400/35 text-cyan-50 hover:bg-cyan-500/25"}`}
              >
                <MessageSquare className="w-4 h-4" /> Nouvelle conversation
              </button>
              <button
                type="button"
                onClick={() => onSelectView("conversations")}
                className={`inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl border text-sm font-medium cursor-pointer ${extremeDark ? "border-white/[0.08] text-slate-200 hover:bg-white/[0.03]" : "border-cyan-400/20 text-slate-100 hover:bg-white/[0.04]"}`}
              >
                Ouvrir le chat
              </button>
              <button
                type="button"
                onClick={() => onSpeakText(STARTUP_GREETING_TEXT)}
                className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border text-sm font-medium cursor-pointer ${extremeDark ? "border-white/[0.08] text-slate-300 hover:bg-white/[0.03]" : "border-cyan-400/20 text-slate-200 hover:bg-white/[0.04]"}`}
                aria-label="Écouter le message d'accueil"
              >
                <Volume2 className="w-4 h-4" /> Écouter
              </button>
            </div>
          </div>
        </section>

        {/* État système */}
        <section className={`${card} p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs`}>
          <span className={muted}><span className={`${isOnline ? "text-emerald-300" : "text-amber-300"} mr-1.5`}>●</span>Réseau {isOnline ? "en ligne" : "hors ligne"}</span>
          <span className={muted}><span className="text-cyan-300 mr-1.5">●</span>Gemini {geminiModel ? `(${geminiModel})` : isOnline ? "principal" : "indisponible hors ligne"}</span>
          <span className={muted}>Voix : fr-FR-HenriNeural</span>
          <button type="button" onClick={() => onSelectView("controlCenter")} className="ml-auto inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 cursor-pointer">
            <Sparkles className="w-3.5 h-3.5" /> Centre de contrôle
          </button>
        </section>

        {/* Raccourcis */}
        <section className="space-y-3">
          <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Raccourcis</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {SHORTCUTS.map((q) => (
              <button
                key={`${q.id}-${q.label}`}
                type="button"
                onClick={() => onSelectView(q.id)}
                className={`${card} p-3.5 text-left cursor-pointer transition-colors hover:border-cyan-400/30 ${extremeDark ? "hover:bg-white/[0.02]" : "hover:bg-white/[0.03]"}`}
              >
                <q.icon className={`w-4 h-4 ${extremeDark ? "text-cyan-300" : "text-cyan-200"}`} />
                <p className={`mt-2 text-xs font-medium ${extremeDark ? "text-slate-100" : "text-slate-100"}`}>{q.label}</p>
                <p className={`mt-0.5 text-[10px] leading-snug ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>{q.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Récents */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`${card} p-4`}>
            <h2 className={`text-sm font-medium mb-2 ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Conversations récentes</h2>
            {recentSessions.length === 0 ? (
              <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucune conversation.</p>
            ) : (
              <ul className="space-y-1.5">
                {recentSessions.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => onSelectView("conversations")} className={`w-full flex items-center gap-2 min-h-[40px] text-left text-xs cursor-pointer ${extremeDark ? "text-slate-300 hover:text-cyan-200" : "text-slate-200 hover:text-cyan-100"}`}>
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-cyan-300/80" />
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`${card} p-4`}>
            <h2 className={`text-sm font-medium mb-2 ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Projets récents</h2>
            {recentProjects.length === 0 ? (
              <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucun projet.</p>
            ) : (
              <ul className="space-y-2.5">
                {recentProjects.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onSelectView("projects")} className="w-full text-left cursor-pointer">
                      <p className={`text-xs truncate ${extremeDark ? "text-slate-300" : "text-slate-200"}`}>{p.name}</p>
                      <div className={`mt-1 h-1 rounded-full ${extremeDark ? "bg-white/[0.06]" : "bg-cyan-400/10"}`}>
                        <div className="h-1 rounded-full bg-cyan-400" style={{ width: `${Math.max(0, Math.min(100, p.progress || 0))}%` }} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <p className={`text-[11px] flex items-center gap-1.5 justify-center sm:justify-start ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
          JARVIS 4.0 · Créé par Abdourahmane Fall, alias Capzo (Capzo IA). <ArrowRight className="w-3 h-3" />
        </p>
      </div>
    </div>
  );
}
