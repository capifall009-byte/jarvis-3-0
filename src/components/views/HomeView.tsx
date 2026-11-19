import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  Clapperboard,
  FileText,
  Globe,
  MessageSquare,
  Microscope,
  Newspaper,
  Share2,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { AppView, ConversationSession, ProjectItem, VoiceState } from "../../types/jarvis";
import { JarvisOrb } from "../JarvisOrb";

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
  /** Orbe vocal : uniquement si fourni par App, avec les niveaux audio réels. */
  voiceState?: VoiceState;
  getInputLevel?: () => number;
  getOutputLevel?: () => number;
  onOrbClick?: () => void;
}

interface ServiceState {
  gemini: boolean | null;
  model: string | null;
}

const QUICK_ACCESS: Array<{ id: AppView; label: string; desc: string; icon: typeof Brain }> = [
  { id: "search", label: "Recherche Web", desc: "Sources, pages et comparaisons", icon: Globe },
  { id: "news", label: "Actualités", desc: "Sport, monde et histoire locale", icon: Newspaper },
  { id: "files", label: "Fichiers", desc: "Documents, images et analyses", icon: FileText },
  { id: "aiVideo", label: "Studio vidéo IA", desc: "Scénarios et clips générés", icon: Clapperboard },
  { id: "social", label: "Social Hub", desc: "Comptes et idées de contenu", icon: Share2 },
  { id: "memory", label: "Mémoire", desc: "Souvenirs et préférences", icon: Brain },
];

const SUGGESTIONS = [
  "Salut JARVIS, fais-moi un point rapide sur l'état du système.",
  "Explique-moi la physique quantique en trois phrases simples.",
  "Recherche et compare plusieurs sources sur un sujet précis.",
  "Retiens que je préfère des réponses brèves et précises.",
];

function greeting(): string {
  return "Salut, moi c'est JARVIS. Comment je pourrais vous aider ?";
}

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
}: HomeViewProps) {
  const [services, setServices] = useState<ServiceState>({ gemini: null, model: geminiModel });
  const [showCapabilities, setShowCapabilities] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/health")
      .then((r) => r.json())
      .then((d: { ok?: boolean; model?: string }) => {
        if (!mounted) return;
        setServices({ gemini: Boolean(d.ok), model: d.model || geminiModel || null });
      })
      .catch(() => {
        if (mounted) setServices({ gemini: false, model: geminiModel });
      });
    return () => { mounted = false; };
  }, [geminiModel]);

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    []
  );
  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4),
    [sessions]
  );
  const recentProjects = useMemo(
    () => [...projects].filter((p) => p.status !== "archived").slice(0, 3),
    [projects]
  );

  const card = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;
  const accent = extremeDark ? "text-cyan-300" : "text-cyan-200";

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Hero */}
        <section className="space-y-3">
          {onOrbClick && getInputLevel && getOutputLevel && (
            <div className="flex justify-center pb-1">
              <div className="jarvis-voice-ring rounded-full p-1">
                <JarvisOrb
                  voiceState={voiceState}
                  getInputLevel={getInputLevel}
                  getOutputLevel={getOutputLevel}
                  onOrbClick={onOrbClick}
                  extremeDark={extremeDark}
                />
              </div>
            </div>
          )}
          <p className={`text-xs uppercase tracking-[0.2em] ${accent}`}>JARVIS 3.0</p>
          <h1 className={`jarvis-stark-title font-display text-2xl sm:text-4xl font-medium ${extremeDark ? "text-slate-100" : "text-cyan-50"}`}>
            {greeting()}
          </h1>
          <p className={`text-sm capitalize ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>{dateLabel}</p>
          <p className={`max-w-2xl text-sm leading-relaxed ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
            Assistant personnel intelligent, vocal et évolutif. Gemini comme cerveau, mémoire durable sous votre contrôle,
            recherche web approfondie, analyse de documents et création multimédia — réunis dans une seule interface.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onNewSession}
              className={`inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl border text-sm font-medium cursor-pointer ${extremeDark ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200" : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"}`}
            >
              <MessageSquare className="w-4 h-4" /> Nouvelle conversation
            </button>
            <button
              type="button"
              onClick={() => setShowCapabilities((v) => !v)}
              className={`inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl border text-sm font-medium cursor-pointer ${extremeDark ? "border-white/[0.08] text-slate-300" : "border-cyan-400/20 text-slate-200"}`}
            >
              <Sparkles className="w-4 h-4" /> Découvrir les capacités de JARVIS
            </button>
            <button
              type="button"
              onClick={() => onSpeakText("Salut, moi c'est JARVIS. Comment je pourrais vous aider ?")}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border text-sm font-medium cursor-pointer ${extremeDark ? "border-white/[0.08] text-slate-300" : "border-cyan-400/20 text-slate-200"}`}
              aria-label="Écouter le message d'accueil"
            >
              <Volume2 className="w-4 h-4" /> Écouter
            </button>
          </div>
          {showCapabilities && (
            <div className={`${card} text-xs leading-relaxed space-y-1.5`}>
              <p><span className="font-medium">Intelligence :</span> conversations en streaming, mémoire autorisée, modes et personnalités vocales.</p>
              <p><span className="font-medium">Connaissances :</span> recherche Web, analyse de pages, comparaison de sources, enquêtes multi-étapes et actualités.</p>
              <p><span className="font-medium">Création :</span> analyse de fichiers, Studio Vidéo et Studio Vidéo IA, Social Hub.</p>
              <p><span className="font-medium">Organisation :</span> projets, objectifs, tâches, historique et exports locaux.</p>
            </div>
          )}
        </section>

        {/* Services */}
        <section className={`jarvis-stark-panel rounded-2xl p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs`}>
          <span className={extremeDark ? "text-slate-400" : "text-slate-300"}>
            <span className={`jarvis-status-pulse ${services.gemini ? "text-emerald-300" : "text-amber-300"} mr-1.5`}>●</span>
            Gemini {services.gemini === null ? "vérification…" : services.gemini ? "connecté" : "non configuré"}
          </span>
          <span className={extremeDark ? "text-slate-400" : "text-slate-300"}>
            <span className={`jarvis-status-pulse ${isOnline ? "text-emerald-300" : "text-amber-300"} mr-1.5`}>●</span>
            Réseau {isOnline ? "en ligne" : "hors ligne"}
          </span>
          {services.model && <span className={extremeDark ? "text-slate-500" : "text-slate-400"}>Modèle : {services.model}</span>}
          <span className={extremeDark ? "text-slate-500" : "text-slate-400"}>Voix : fr-FR-HenriNeural</span>
        </section>

        {/* Suggestions */}
        <section className="space-y-3">
          <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Suggestions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className={`text-left min-h-[52px] px-4 py-3 rounded-xl border text-xs leading-relaxed cursor-pointer transition-colors ${extremeDark ? "border-white/[0.06] text-slate-300 hover:border-cyan-500/30" : "border-cyan-400/15 text-slate-200 hover:border-cyan-400/35"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Quick access */}
        <section className="space-y-3">
          <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Accès rapide</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QUICK_ACCESS.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onSelectView(q.id)}
                className={`jarvis-stark-hover rounded-xl border p-3 text-left cursor-pointer ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}
              >
                <q.icon className={`w-4 h-4 ${accent}`} />
                <p className={`mt-1.5 text-xs font-medium ${extremeDark ? "text-slate-200" : "text-slate-100"}`}>{q.label}</p>
                <p className={`text-[10px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>{q.desc}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSelectView("search")}
              className={`rounded-xl border p-3 text-left cursor-pointer transition-colors ${extremeDark ? "border-white/[0.06] hover:border-cyan-500/30" : "border-cyan-400/15 hover:border-cyan-400/35"}`}
            >
              <Microscope className={`w-4 h-4 ${accent}`} />
              <p className={`mt-1.5 text-xs font-medium ${extremeDark ? "text-slate-200" : "text-slate-100"}`}>Recherche approfondie</p>
              <p className={`text-[10px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Plan, sources et rapport</p>
            </button>
          </div>
        </section>

        {/* Recent */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={card}>
            <h2 className={`text-sm font-medium mb-2 ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Conversations récentes</h2>
            {recentSessions.length === 0 ? (
              <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucune conversation.</p>
            ) : (
              <ul className="space-y-1.5">
                {recentSessions.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => onSelectView("conversations")} className={`w-full flex items-center gap-2 min-h-[40px] text-left text-xs cursor-pointer ${extremeDark ? "text-slate-300" : "text-slate-200"}`}>
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${accent}`} />
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={card}>
            <h2 className={`text-sm font-medium mb-2 ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Projets récents</h2>
            {recentProjects.length === 0 ? (
              <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucun projet.</p>
            ) : (
              <ul className="space-y-2">
                {recentProjects.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onSelectView("intelligence")} className="w-full text-left cursor-pointer">
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

        <p className={`text-[11px] flex items-center gap-1.5 ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
          JARVIS 3.0 · Créé par Abdourahmane Fall, alias Capzo (Capzo IA). <ArrowRight className="w-3 h-3" />
        </p>
      </div>
    </div>
  );
}
