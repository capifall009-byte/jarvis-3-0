import { useMemo, useState } from "react";
import {
  Bot,
  Brain,
  BrainCircuit,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  FileText,
  Film,
  FolderKanban,
  Globe,
  History,
  Home,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  MessageSquarePlus,
  Microscope,
  MonitorSmartphone,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Video,
  Wrench,
  Clapperboard,
  X,
} from "lucide-react";
import type { AppView, ConversationSession } from "../types/jarvis";

interface ChatSidebarProps {
  extremeDark: boolean;
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  sessions: ConversationSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onOpenHistory: () => void;
  compact?: boolean; // mobile drawer mode
  onClose?: () => void;
}

type NavItem = { label: string; view: AppView; icon: any };

const PRIMARY_TOOLS: NavItem[] = [
  { label: "Tableau de bord", view: "dashboard", icon: LayoutDashboard },
  { label: "Cerveau central", view: "intelligence", icon: Brain },
  { label: "Missions (Core 4.0)", view: "missions", icon: Target },
  { label: "Compétences (Skills)", view: "skills", icon: Layers },
  { label: "Agents (Core 4.0)", view: "agents", icon: Bot },
  { label: "Planificateur (Core 4.0)", view: "scheduler", icon: CalendarClock },
  { label: "Outils (Core 4.0)", view: "tools", icon: Wrench },
  { label: "Appareils (Core 4.0)", view: "devices", icon: MonitorSmartphone },
  { label: "Mémoire contextuelle (Core 4.0)", view: "contextMemory", icon: BrainCircuit },
  { label: "AI Hub", view: "aiHub", icon: Sparkles },
  { label: "Studio Images", view: "imageStudio", icon: ImageIcon },
  { label: "Centre de contrôle", view: "controlCenter", icon: LayoutDashboard },
  { label: "Projets", view: "projects", icon: FolderKanban },
  { label: "Recherche Web", view: "search", icon: Globe },
  { label: "Mémoire", view: "memory", icon: Brain },
  { label: "Paramètres", view: "settings", icon: Settings },
];

const MORE_MODULES: NavItem[] = [
  { label: "Accueil", view: "home", icon: Home },
  { label: "Analyse de fichiers", view: "files", icon: FileText },
  { label: "Recherche approfondie", view: "research", icon: Microscope },
  { label: "Studio vidéo", view: "video", icon: Film },
  { label: "Studio Remotion", view: "remotionStudio", icon: Clapperboard },
  { label: "Reels", view: "reels", icon: Video },
  { label: "Actualités", view: "news", icon: Newspaper },
  { label: "Social Hub", view: "social", icon: Share2 },
  { label: "Modes", view: "modes", icon: SlidersHorizontal },
  { label: "Accès mobile", view: "mobileAccess", icon: MonitorSmartphone },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} j`;
}

export function ChatSidebar({
  extremeDark,
  activeView,
  onSelectView,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onOpenHistory,
  compact = false,
  onClose,
}: ChatSidebarProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showMore, setShowMore] = useState(compact);

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!q) return sorted;
    return sorted.filter((s) => {
      const inTitle = (s.title || "").toLowerCase().includes(q);
      const inMsgs = (s.messages || []).some((m) => (m.text || "").toLowerCase().includes(q));
      return inTitle || inMsgs;
    });
  }, [sessions, query]);

  const bg = extremeDark ? "bg-black" : "bg-[#030914]";
  const border = extremeDark ? "border-white/[0.06]" : "border-cyan-400/15";
  const muted = extremeDark ? "text-slate-400" : "text-slate-400";
  const itemBase = `w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm transition-colors cursor-pointer`;

  const navBtn = (item: NavItem) => {
    const active = activeView === item.view;
    const Icon = item.icon;
    return (
      <button
        key={item.view}
        type="button"
        onClick={() => {
          onSelectView(item.view);
          if (compact) onClose?.();
        }}
        className={`${itemBase} ${active ? (extremeDark ? "bg-cyan-500/10 text-cyan-100 border border-cyan-500/20" : "bg-cyan-500/10 text-cyan-50 border border-cyan-400/20") : (extremeDark ? "text-slate-300 hover:bg-white/[0.03] border border-transparent" : "text-slate-300 hover:bg-white/[0.04] border border-transparent")}`}
        aria-current={active ? "page" : undefined}
      >
        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-cyan-300" : "text-slate-400"}`} />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const startRename = (s: ConversationSession) => {
    setEditingId(s.id);
    setEditValue(s.title || "Nouvelle conversation");
  };
  const commitRename = () => {
    if (editingId && editValue.trim()) onRenameSession(editingId, editValue.trim());
    setEditingId(null);
    setEditValue("");
  };

  return (
    <div className={`h-full flex flex-col ${bg} ${compact ? "" : `border-r ${border}`}`}>
      {/* Header */}
      <div className={`px-3 py-3 border-b ${border} flex items-center gap-2`}>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold tracking-wide ${extremeDark ? "text-cyan-200" : "text-cyan-100"}`}>JARVIS</p>
          <p className={`text-[10px] ${muted}`}>Assistant personnel</p>
        </div>
        {compact && onClose && (
          <button type="button" onClick={onClose} className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] cursor-pointer" aria-label="Fermer le menu">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll px-2.5 py-3 space-y-4">
        {/* Nouvelle conversation */}
        <button
          type="button"
          onClick={() => {
            onNewSession();
            onSelectView("conversations");
            if (compact) onClose?.();
          }}
          className={`w-full flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border text-sm font-medium cursor-pointer transition-colors ${extremeDark ? "bg-cyan-950/30 border-cyan-500/30 text-cyan-100 hover:bg-cyan-950/45" : "bg-cyan-500/12 border-cyan-400/30 text-cyan-50 hover:bg-cyan-500/20"}`}
        >
          <MessageSquarePlus className="w-4 h-4" />
          Nouvelle conversation
        </button>

        {/* Conversations / Historique */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className={`text-[11px] uppercase tracking-[0.14em] ${muted}`}>Conversations</p>
            <button type="button" onClick={onOpenHistory} className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 cursor-pointer" title="Historique">
              <History className="w-3.5 h-3.5" /> Historique
            </button>
          </div>
          <div className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border ${extremeDark ? "border-white/[0.06] bg-white/[0.02]" : "border-cyan-400/15 bg-white/[0.02]"}`}>
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher..."
              className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
              aria-label="Rechercher dans les conversations"
            />
          </div>
          <div className="space-y-1 max-h-[38vh] overflow-y-auto jarvis-scroll pr-0.5">
            {filteredSessions.length === 0 ? (
              <p className={`px-2 py-2 text-xs ${muted}`}>Aucune conversation.</p>
            ) : (
              filteredSessions.map((s) => {
                const active = s.id === activeSessionId && activeView === "conversations";
                const isEditing = editingId === s.id;
                return (
                  <div
                    key={s.id}
                    className={`group rounded-xl border px-2.5 py-2 ${active ? (extremeDark ? "border-cyan-500/25 bg-cyan-500/10" : "border-cyan-400/25 bg-cyan-500/10") : "border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]"}`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditingId(null); setEditValue(""); } }}
                          className="flex-1 min-w-0 bg-black/30 border border-cyan-500/30 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none"
                          autoFocus
                        />
                        <button type="button" onClick={commitRename} className="text-[11px] text-cyan-300 cursor-pointer">OK</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSession(s.id);
                          if (compact) onClose?.();
                        }}
                        className="w-full text-left cursor-pointer"
                      >
                        <p className={`text-xs truncate ${active ? "text-cyan-50" : "text-slate-200"}`}>{s.title || "Nouvelle conversation"}</p>
                        <p className={`text-[10px] mt-0.5 ${muted}`}>{timeAgo(s.updatedAt || s.createdAt || Date.now())}</p>
                      </button>
                    )}
                    {!isEditing && (
                      <div className={`mt-1 flex items-center gap-1 ${compact ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                        <button type="button" onClick={() => startRename(s)} className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-500 hover:text-cyan-300 hover:bg-white/[0.05] cursor-pointer" title="Renommer" aria-label="Renommer la conversation"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => onDeleteSession(s.id)} className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg text-slate-500 hover:text-red-300 hover:bg-white/[0.05] cursor-pointer" title="Supprimer" aria-label="Supprimer la conversation"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Outils principaux demandés */}
        <section className="space-y-1.5">
          <p className={`px-1 text-[11px] uppercase tracking-[0.14em] ${muted}`}>Outils</p>
          <div className="space-y-1">
            {PRIMARY_TOOLS.map(navBtn)}
            <button
              type="button"
              onClick={onOpenHistory}
              className={`${itemBase} ${extremeDark ? "text-slate-300 hover:bg-white/[0.03] border border-transparent" : "text-slate-300 hover:bg-white/[0.04] border border-transparent"}`}
            >
              <History className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate">Historique</span>
            </button>
          </div>
        </section>

        {/* Autres modules (accès préservé) */}
        <section className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={`w-full flex items-center justify-between px-1 text-[11px] uppercase tracking-[0.14em] ${muted} cursor-pointer`}
          >
            <span>Autres modules</span>
            {showMore ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {showMore && <div className="space-y-1">{MORE_MODULES.map(navBtn)}</div>}
        </section>
      </div>
    </div>
  );
}
