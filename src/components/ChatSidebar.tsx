import { useMemo, useRef, useState } from "react";
import {
  Brain,
  FileText,
  Film,
  FolderKanban,
  Globe,
  History,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Microscope,
  MonitorSmartphone,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Trash2,
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
}

interface NavEntry {
  id: string;
  label: string;
  icon: typeof MessageSquare;
  view?: AppView;
  action?: "new" | "history";
}

const NAV_ENTRIES: NavEntry[] = [
  { id: "new", label: "Nouvelle conversation", icon: Plus, action: "new" },
  { id: "history", label: "Historique", icon: History, action: "history" },
  { id: "home", label: "Accueil", icon: Home, view: "home" },
  { id: "projects", label: "Projets", icon: FolderKanban, view: "projects" },
  { id: "memory", label: "Mémoire", icon: Brain, view: "memory" },
  { id: "modes", label: "Modes", icon: SlidersHorizontal, view: "modes" },
  { id: "news", label: "Actualités", icon: Newspaper, view: "news" },
  { id: "search", label: "Recherche Web", icon: Globe, view: "search" },
  { id: "research", label: "Recherche approfondie", icon: Microscope, view: "research" },
  { id: "files", label: "Analyse de fichiers", icon: FileText, view: "files" },
  { id: "video", label: "Studio vidéo", icon: Film, view: "video" },
  { id: "social", label: "Social Hub", icon: Share2, view: "social" },
  { id: "control", label: "Centre de contrôle", icon: LayoutDashboard, view: "controlCenter" },
  { id: "mobile", label: "Accès mobile", icon: MonitorSmartphone, view: "mobileAccess" },
  { id: "settings", label: "Paramètres", icon: Settings, view: "settings" },
];

function formatSessionDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(ts));
  } catch {
    return "";
  }
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
}: ChatSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!q) return sorted.slice(0, 14);
    return sorted
      .filter((s) => {
        if (s.title.toLowerCase().includes(q)) return true;
        return s.messages.some((m) => m.text.toLowerCase().includes(q));
      })
      .slice(0, 20);
  }, [sessions, query]);

  const handleNav = (entry: NavEntry) => {
    if (entry.action === "new") {
      onNewSession();
      onSelectView("conversations");
      return;
    }
    if (entry.action === "history") {
      onOpenHistory();
      return;
    }
    if (entry.view) onSelectView(entry.view);
  };

  const panelClass = extremeDark
    ? "bg-black/95 border-white/[0.06]"
    : "bg-[#040916]/95 border-cyan-400/15";
  const itemClass = (active: boolean) =>
    `w-full min-h-[42px] flex items-center gap-3 rounded-xl px-3 text-left text-[13px] transition-colors cursor-pointer ${
      active
        ? extremeDark
          ? "bg-cyan-950/40 text-cyan-100 border border-cyan-500/30"
          : "bg-cyan-500/15 text-cyan-50 border border-cyan-400/30"
        : extremeDark
        ? "text-slate-300 hover:bg-white/[0.04] border border-transparent"
        : "text-slate-300 hover:bg-cyan-500/10 border border-transparent"
    }`;

  return (
    <aside
      className={`hidden lg:flex shrink-0 flex-col border-r transition-[width] duration-200 ${panelClass} ${
        collapsed ? "w-[68px]" : "w-[272px]"
      }`}
    >
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-3 border-b border-white/[0.06]">
        <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${extremeDark ? "bg-cyan-500/15" : "bg-cyan-500/20"} border border-cyan-400/20`}>
          <span className={`text-sm font-display font-semibold ${extremeDark ? "text-cyan-300" : "text-cyan-200"}`}>J</span>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-display truncate ${extremeDark ? "text-slate-100" : "text-cyan-50"}`}>JARVIS 3.0</p>
            <p className={`text-[10px] truncate ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Assistant personnel IA</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-9 h-9 grid place-items-center rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/[0.05] cursor-pointer shrink-0"
          aria-label={collapsed ? "Déployer la barre latérale" : "Replier la barre latérale"}
          title={collapsed ? "Déployer" : "Replier"}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Search conversations */}
      <div className="p-3 pb-2">
        {collapsed ? (
          <button
            type="button"
            onClick={() => { setCollapsed(false); setTimeout(() => searchRef.current?.focus(), 0); }}
            className="w-10 h-10 grid place-items-center rounded-xl border border-white/[0.08] text-slate-400 hover:text-cyan-300 cursor-pointer"
            aria-label="Rechercher une conversation"
          >
            <Search className="w-4 h-4" />
          </button>
        ) : (
          <div className="relative">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${extremeDark ? "text-slate-500" : "text-slate-400"}`} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une conversation…"
              aria-label="Rechercher dans les conversations"
              className={`w-full h-10 pl-9 pr-3 rounded-xl border text-xs outline-none ${
                extremeDark
                  ? "bg-black border-white/[0.08] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40"
                  : "bg-[#050A14] border-cyan-400/20 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/40"
              }`}
            />
          </div>
        )}
      </div>

      {/* Nav modules */}
      <nav className="px-3 space-y-1 jarvis-scroll overflow-y-auto shrink-0 max-h-[46%]" aria-label="Navigation principale">
        {NAV_ENTRIES.map((entry) => {
          const Icon = entry.icon;
          const active = entry.view ? entry.view === activeView : false;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleNav(entry)}
              className={`${itemClass(active)} ${collapsed ? "justify-center px-0" : ""}`}
              title={entry.label}
              aria-label={entry.label}
            >
              <Icon className="w-4 h-4 shrink-0 text-cyan-300/80" />
              {!collapsed && <span className="truncate">{entry.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Recent conversations */}
      <div className="flex-1 min-h-0 flex flex-col mt-3 border-t border-white/[0.06] pt-3">
        {!collapsed && (
          <p className={`px-3 pb-2 text-[10px] uppercase tracking-[0.16em] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Conversations récentes
          </p>
        )}
        <div className="flex-1 min-h-0 jarvis-scroll overflow-y-auto px-3 pb-3 space-y-1">
          {recent.length === 0 ? (
            !collapsed && (
              <p className={`text-[11px] px-1 py-2 ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                {query ? "Aucune conversation trouvée." : "Aucune conversation pour le moment."}
              </p>
            )
          ) : (
            recent.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <div key={s.id} className={`group flex items-center rounded-xl border ${active ? (extremeDark ? "bg-cyan-950/30 border-cyan-500/25" : "bg-cyan-500/10 border-cyan-400/25") : "border-transparent"}`}>
                  {editingId === s.id && !collapsed ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => { onRenameSession(s.id, editTitle); setEditingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { onRenameSession(s.id, editTitle); setEditingId(null); }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      aria-label="Renommer la conversation"
                      className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-cyan-500/40 bg-transparent text-xs text-slate-100 outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectSession(s.id)}
                      onDoubleClick={() => { setEditingId(s.id); setEditTitle(s.title); }}
                      className={`flex-1 min-w-0 min-h-[42px] px-3 text-left cursor-pointer ${collapsed ? "px-0 flex justify-center" : ""}`}
                      title={`${s.title} — double-cliquez pour renommer`}
                      aria-label={`Ouvrir la conversation ${s.title}`}
                    >
                      {collapsed ? (
                        <MessageSquare className="w-4 h-4 text-slate-400" />
                      ) : (
                        <>
                          <p className={`text-xs truncate ${extremeDark ? "text-slate-200" : "text-slate-100"}`}>{s.title}</p>
                          <p className={`text-[10px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                            {formatSessionDate(s.updatedAt)} · {s.messages.length} message(s)
                          </p>
                        </>
                      )}
                    </button>
                  )}
                  {!collapsed && s.id !== activeSessionId && (
                    <button
                      type="button"
                      onClick={() => { if (window.confirm("Supprimer cette conversation ?")) onDeleteSession(s.id); }}
                      className="w-9 h-9 grid place-items-center rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 cursor-pointer shrink-0"
                      aria-label="Supprimer la conversation"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 p-3 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={onOpenHistory}
          className={`${itemClass(false)} ${collapsed ? "justify-center px-0" : ""}`}
          title="Historique des sessions"
        >
          <History className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Historique & sessions</span>}
        </button>
        {collapsed && (
          <button type="button" onClick={() => setCollapsed(false)} className="w-full h-9 grid place-items-center text-slate-500 hover:text-slate-200 cursor-pointer" aria-label="Menu">
            <Menu className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
