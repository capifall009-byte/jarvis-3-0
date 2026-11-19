import { useState, type ReactNode } from "react";
import {
  Brain,
  Clapperboard,
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
  Moon,
  Newspaper,
  Plus,
  Settings,
  Share2,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import type { AppView, VoiceState } from "../types/jarvis";

interface NavShellProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  voiceState: VoiceState;
  statusText: string;
  isOnline: boolean;
  geminiModel: string | null;
  extremeDark: boolean;
  onToggleExtremeDark: () => void;
  onNewSession: () => void;
  onOpenHistory: () => void;
  children: ReactNode;
  /** Sidebar conversationnelle optionnelle (desktop). */
  sidebarSlot?: ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  mobileLabel: string;
  icon: typeof MessageSquare;
  view?: AppView;
  action?: "new" | "history";
}

const NAV_ITEMS: NavItem[] = [
  { id: "new", label: "Nouvelle conversation", mobileLabel: "Nouveau", icon: Plus, action: "new" },
  { id: "history", label: "Historique", mobileLabel: "Historique", icon: History, action: "history" },
  { id: "home", label: "Accueil", mobileLabel: "Accueil", icon: Home, view: "home" },
  { id: "projects", label: "Projets", mobileLabel: "Projets", icon: FolderKanban, view: "projects" },
  { id: "memory", label: "Mémoire", mobileLabel: "Mémoire", icon: Brain, view: "memory" },
  { id: "modes", label: "Modes", mobileLabel: "Modes", icon: SlidersHorizontal, view: "modes" },
  { id: "news", label: "Actualités", mobileLabel: "Actus", icon: Newspaper, view: "news" },
  { id: "search", label: "Recherche Web", mobileLabel: "Web", icon: Globe, view: "search" },
  { id: "research", label: "Recherche approfondie", mobileLabel: "Approf.", icon: Microscope, view: "research" },
  { id: "files", label: "Analyse de fichiers", mobileLabel: "Fichiers", icon: FileText, view: "files" },
  { id: "video", label: "Studio vidéo", mobileLabel: "Vidéo", icon: Film, view: "video" },
  { id: "reels", label: "Générateur vidéo", mobileLabel: "Gén. vidéo", icon: Clapperboard, view: "reels" },
  { id: "social", label: "Social Hub", mobileLabel: "Social", icon: Share2, view: "social" },
  { id: "control", label: "Centre de contrôle", mobileLabel: "Contrôle", icon: LayoutDashboard, view: "controlCenter" },
  { id: "mobile", label: "Accès mobile", mobileLabel: "Mobile", icon: MonitorSmartphone, view: "mobileAccess" },
  { id: "settings", label: "Paramètres", mobileLabel: "Réglages", icon: Settings, view: "settings" },
];

// Navigation basse mobile discrète (accès rapide)
const MOBILE_QUICK: NavItem[] = NAV_ITEMS.filter((i) =>
  ["home", "new", "projects", "control", "settings"].includes(i.id)
);

export function NavShell({
  activeView,
  onSelectView,
  voiceState,
  statusText,
  isOnline,
  geminiModel,
  extremeDark,
  onToggleExtremeDark,
  onNewSession,
  onOpenHistory,
  children,
  sidebarSlot,
}: NavShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActiveVoice =
    voiceState === "listening" ||
    voiceState === "speaking" ||
    voiceState === "thinking";

  const statusColorClass =
    voiceState === "error"
      ? extremeDark
        ? "text-red-400/80"
        : "text-red-300"
      : voiceState === "offline" || !isOnline
      ? extremeDark
        ? "text-amber-300/75"
        : "text-amber-300"
      : isActiveVoice
      ? extremeDark
        ? "text-cyan-400/85"
        : "text-cyan-300"
      : extremeDark
      ? "text-slate-400"
      : "text-cyan-200/85";

  const runItem = (item: NavItem) => {
    if (item.action === "new") {
      onNewSession();
      onSelectView("conversations");
    } else if (item.action === "history") {
      onOpenHistory();
    } else if (item.view) {
      onSelectView(item.view as AppView);
    }
    setMobileMenuOpen(false);
  };

  const isItemActive = (item: NavItem) => (item.view ? item.view === activeView : false);

  return (
    <div
      data-jarvis-ui="stark"
      className={`jarvis-app-shell h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden transition-colors ${
        extremeDark ? "bg-black text-slate-300" : "jarvis-holo-canvas text-slate-100"
      }`}
    >
      {/* Desktop sidebar */}
      {sidebarSlot ?? (
        <aside
          className={`hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r ${
            extremeDark ? "bg-black border-white/[0.05]" : "jarvis-glass border-cyan-400/15"
          }`}
        >
          <div className={`px-5 py-5 border-b ${extremeDark ? "border-white/[0.05]" : "border-cyan-400/12"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`font-display text-xl font-semibold tracking-[0.26em] ${extremeDark ? "text-cyan-200/80" : "text-cyan-50"}`}>JARVIS</span>
              <span className={`text-[11px] font-mono-tabular ${extremeDark ? "text-slate-600" : "text-cyan-400/75"}`}>3.0</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-xs">
              {!isOnline && <WifiOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
              <span className={`font-mono-tabular tracking-wider ${statusColorClass}`}>{statusText}</span>
            </div>
            {geminiModel && isOnline && (
              <p className={`mt-1 text-[11px] truncate ${extremeDark ? "text-slate-700" : "text-slate-500"}`}>{geminiModel}</p>
            )}
          </div>

          <nav aria-label="Navigation principale JARVIS" className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 jarvis-scroll">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const selected = isItemActive(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => runItem(item)}
                  aria-current={selected ? "page" : undefined}
                  className={`w-full flex items-center gap-3 min-h-[42px] px-3.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                    selected
                      ? extremeDark
                        ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                        : "bg-cyan-500/15 border-cyan-400/35 text-cyan-100"
                      : extremeDark
                      ? "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                      : "border-transparent text-slate-300 hover:text-cyan-100 hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${selected ? (extremeDark ? "text-cyan-400" : "text-cyan-300") : "text-slate-400"}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className={`p-3 border-t space-y-2 ${extremeDark ? "border-white/[0.05]" : "border-cyan-400/12"}`}>
            <button
              type="button"
              onClick={onToggleExtremeDark}
              aria-pressed={extremeDark}
              className={`w-full flex items-center justify-center gap-1.5 min-h-[42px] px-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                extremeDark
                  ? "bg-cyan-950/30 border-cyan-500/30 text-cyan-300"
                  : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:text-cyan-100 hover:bg-white/[0.07]"
              }`}
            >
              <Moon className="w-3.5 h-3.5 shrink-0" />
              <span>{extremeDark ? "Mode OLED" : "Mode sombre"}</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main + Mobile chrome */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {/* Mobile header */}
        <header
          className={`lg:hidden shrink-0 pt-safe border-b ${
            extremeDark ? "border-white/[0.04] bg-black" : "jarvis-glass border-cyan-400/15"
          }`}
        >
          <div className="h-13 px-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl cursor-pointer ${extremeDark ? "text-slate-300" : "text-slate-200"}`}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`font-display text-base font-semibold tracking-[0.24em] ${extremeDark ? "text-cyan-200/80" : "text-cyan-50"}`}>JARVIS</span>
              <span className={`text-[10px] font-mono-tabular ${extremeDark ? "text-slate-600" : "text-cyan-400/70"}`}>3.0</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" onClick={onToggleExtremeDark} aria-pressed={extremeDark} aria-label={extremeDark ? "Désactiver le mode sombre extrême" : "Activer le mode sombre extrême"} className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl cursor-pointer ${extremeDark ? "text-cyan-300/80 bg-cyan-950/25 border border-cyan-500/20" : "text-slate-300 hover:text-cyan-200"}`}>
                <Moon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => { onNewSession(); onSelectView("conversations"); }} aria-label="Nouvelle conversation" className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl cursor-pointer ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* HUD status bar */}
        <div
          role="status"
          aria-live="polite"
          className={`shrink-0 border-b px-3.5 sm:px-6 h-10 flex items-center justify-between gap-3 text-xs ${
            extremeDark ? "bg-black border-white/[0.04]" : "jarvis-glass border-cyan-400/15"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                voiceState === "error" ? "bg-red-400" : voiceState === "offline" || !isOnline ? "bg-amber-400" : voiceState === "speaking" ? "bg-cyan-300" : voiceState === "listening" ? "bg-cyan-400" : voiceState === "thinking" || voiceState === "connecting" ? "bg-blue-400" : "bg-cyan-500/45"
              }`}
              aria-hidden="true"
            />
            <span className={`font-mono-tabular font-medium tracking-[0.16em] whitespace-nowrap ${statusColorClass}`}>{statusText}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono-tabular text-[11px]">
            {!isOnline ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300"><WifiOff className="w-3.5 h-3.5" /><span>Hors ligne</span></span>
            ) : (
              <span className={extremeDark ? "text-slate-500" : "text-cyan-300/80"}>{geminiModel ? `En ligne · ${geminiModel}` : "En ligne"}</span>
            )}
          </div>
        </div>

        {/* Active view */}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>

        {/* Mobile bottom nav (discrète) */}
        <nav
          aria-label="Accès rapide"
          className={`lg:hidden shrink-0 border-t pb-safe ${extremeDark ? "bg-black border-white/[0.05]" : "jarvis-glass border-cyan-400/15"}`}
        >
          <div className="flex px-1 pt-1 gap-0.5">
            {MOBILE_QUICK.map((item) => {
              const Icon = item.icon;
              const selected = isItemActive(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => runItem(item)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] flex-1 px-1 rounded-xl transition-colors cursor-pointer ${
                    selected ? (extremeDark ? "text-cyan-300 bg-cyan-950/30" : "text-cyan-300 bg-cyan-500/12") : (extremeDark ? "text-slate-500" : "text-slate-400")
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] font-medium truncate max-w-full">{item.mobileLabel}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Mobile slide-over menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Fermer le menu" onClick={() => setMobileMenuOpen(false)} />
            <div className={`absolute inset-y-0 left-0 w-[min(86vw,320px)] border-r flex flex-col ${extremeDark ? "bg-black border-white/[0.08]" : "bg-[#040916] border-cyan-400/15"}`}>
              <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg grid place-items-center bg-cyan-500/15 border border-cyan-400/20"><span className="text-sm font-display font-semibold text-cyan-300">J</span></div>
                  <span className="font-display text-slate-100">JARVIS 3.0</span>
                </div>
                <button type="button" onClick={() => setMobileMenuOpen(false)} className="w-10 h-10 grid place-items-center rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer" aria-label="Fermer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1 jarvis-scroll" aria-label="Menu principal">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const selected = isItemActive(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => runItem(item)}
                      className={`w-full flex items-center gap-3 min-h-[44px] px-3.5 rounded-xl border text-sm text-left cursor-pointer ${
                        selected
                          ? "bg-cyan-500/15 border-cyan-400/30 text-cyan-100"
                          : "border-transparent text-slate-300 hover:bg-white/[0.04]"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-cyan-300/80" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
