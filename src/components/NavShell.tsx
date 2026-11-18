import type { ReactNode } from "react";
import {
  Brain,
  Clapperboard,
  Film,
  FolderOpen,
  Globe,
  History,
  Home,
  MessageSquare,
  Moon,
  Newspaper,
  Plus,
  Settings,
  Share2,
  Sparkles,
  WifiOff,
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
  /** Sidebar conversationnelle optionnelle (Module UI). L'ancienne sidebar reste le repli. */
  sidebarSlot?: ReactNode;
}

interface NavItem {
  id: AppView;
  label: string;
  mobileLabel: string;
  icon: typeof MessageSquare;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    label: "Accueil",
    mobileLabel: "Accueil",
    icon: Home,
  },
  {
    id: "conversations",
    label: "Conversations",
    mobileLabel: "Chat",
    icon: MessageSquare,
  },
  {
    id: "memory",
    label: "Mémoire",
    mobileLabel: "Mémoire",
    icon: Brain,
  },
  {
    id: "intelligence",
    label: "Intelligence",
    mobileLabel: "Intel",
    icon: Sparkles,
  },
  {
    id: "search",
    label: "Recherche Web",
    mobileLabel: "Web",
    icon: Globe,
  },
  {
    id: "files",
    label: "Fichiers & Photos",
    mobileLabel: "Fichiers",
    icon: FolderOpen,
  },
  {
    id: "video",
    label: "Studio Vidéo",
    mobileLabel: "Vidéo",
    icon: Film,
  },
  {
    id: "aiVideo",
    label: "Studio Vidéo IA",
    mobileLabel: "Vidéo IA",
    icon: Clapperboard,
  },
  {
    id: "settings",
    label: "Paramètres",
    mobileLabel: "Réglages",
    icon: Settings,
  },
  {
    id: "news",
    label: "Actualités",
    mobileLabel: "News",
    icon: Newspaper,
  },
  {
    id: "social",
    label: "Social Hub",
    mobileLabel: "Social",
    icon: Share2,
  },
];

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

  return (
    <div
      data-jarvis-ui="stark"
      className={`jarvis-app-shell h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden transition-colors ${
        extremeDark ? "bg-black text-slate-300" : "jarvis-holo-canvas text-slate-100"
      }`}
    >
      {/* Desktop sidebar : nouvelle sidebar conversationnelle, ancienne conservée en repli */}
      {sidebarSlot ?? (
      <aside
        className={`hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r ${
          extremeDark
            ? "bg-black border-white/[0.05]"
            : "jarvis-glass border-cyan-400/15"
        }`}
      >
        <div
          className={`px-5 py-5 border-b ${
            extremeDark ? "border-white/[0.05]" : "border-cyan-400/12"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`font-display text-xl font-semibold tracking-[0.26em] whitespace-nowrap ${
                extremeDark ? "text-cyan-200/80" : "text-cyan-50"
              }`}
            >
              JARVIS
            </span>
            <span
              className={`text-[11px] font-mono-tabular ${
                extremeDark ? "text-slate-600" : "text-cyan-400/75"
              }`}
            >
              3.0
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-2 text-xs">
            {!isOnline && <WifiOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
            <span className={`font-mono-tabular tracking-wider ${statusColorClass}`}>
              {statusText}
            </span>
          </div>
          {geminiModel && isOnline && (
            <p
              className={`mt-1 text-[11px] truncate ${
                extremeDark ? "text-slate-700" : "text-slate-500"
              }`}
            >
              {geminiModel}
            </p>
          )}
        </div>

        <nav
          aria-label="Navigation principale JARVIS"
          className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isSelected = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                aria-current={isSelected ? "page" : undefined}
                className={`w-full flex items-center gap-3 min-h-[44px] px-3.5 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? extremeDark
                      ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                      : "bg-cyan-500/15 border-cyan-400/35 text-cyan-100"
                    : extremeDark
                    ? "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                    : "border-transparent text-slate-300 hover:text-cyan-100 hover:bg-white/[0.05]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isSelected
                      ? extremeDark
                        ? "text-cyan-400"
                        : "text-cyan-300"
                      : "text-slate-400"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div
          className={`p-3 border-t space-y-2 ${
            extremeDark ? "border-white/[0.05]" : "border-cyan-400/12"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNewSession();
              onSelectView("conversations");
            }}
            className={`w-full flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              extremeDark
                ? "bg-cyan-950/25 hover:bg-cyan-950/40 border-cyan-500/25 text-cyan-200/85"
                : "bg-cyan-400/15 hover:bg-cyan-400/25 border-cyan-400/30 text-cyan-100"
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Nouvelle session</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenHistory}
              className={`flex items-center justify-center gap-1.5 min-h-[44px] px-2.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                extremeDark
                  ? "border-white/[0.05] text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                  : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:text-cyan-100 hover:bg-white/[0.07]"
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span>Sessions</span>
            </button>
            <button
              type="button"
              onClick={onToggleExtremeDark}
              aria-pressed={extremeDark}
              className={`flex items-center justify-center gap-1.5 min-h-[44px] px-2.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                extremeDark
                  ? "bg-cyan-950/30 border-cyan-500/30 text-cyan-300"
                  : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:text-cyan-100 hover:bg-white/[0.07]"
              }`}
            >
              <Moon className="w-3.5 h-3.5 shrink-0" />
              <span>{extremeDark ? "OLED" : "Sombre"}</span>
            </button>
          </div>
        </div>
      </aside>
      )}

      {/* Main Content Area + Mobile Chrome */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Mobile Header (iPhone 11 / Small Screens) */}
        <header
          className={`lg:hidden shrink-0 pt-safe border-b transition-colors ${
            extremeDark
              ? "border-white/[0.04] bg-black"
              : "jarvis-glass border-cyan-400/15"
          }`}
        >
          <div className="h-13 px-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`font-display text-base font-semibold tracking-[0.24em] whitespace-nowrap ${
                  extremeDark ? "text-cyan-200/80" : "text-cyan-50"
                }`}
              >
                JARVIS
              </span>
              <span
                className={`text-[10px] font-mono-tabular ${
                  extremeDark ? "text-slate-600" : "text-cyan-400/70"
                }`}
              >
                3.0
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onToggleExtremeDark}
                aria-pressed={extremeDark}
                aria-label={
                  extremeDark
                    ? "Désactiver le mode sombre extrême"
                    : "Activer le mode sombre extrême"
                }
                className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors cursor-pointer ${
                  extremeDark
                    ? "text-cyan-300/80 bg-cyan-950/25 border border-cyan-500/20"
                    : "text-slate-300 hover:text-cyan-200 hover:bg-white/[0.05]"
                }`}
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onNewSession();
                  onSelectView("conversations");
                }}
                aria-label="Nouvelle conversation"
                className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors cursor-pointer ${
                  extremeDark
                    ? "text-slate-400 hover:text-slate-200"
                    : "text-slate-300 hover:text-cyan-200 hover:bg-white/[0.05]"
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onOpenHistory}
                aria-label="Ouvrir les sessions"
                className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors cursor-pointer ${
                  extremeDark
                    ? "text-slate-400 hover:text-slate-200"
                    : "text-slate-300 hover:text-cyan-200 hover:bg-white/[0.05]"
                }`}
              >
                <History className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Dedicated HUD Status Bar (iPhone 11 & Windows) */}
        <div
          role="status"
          aria-live="polite"
          className={`shrink-0 border-b px-3.5 sm:px-6 h-10 flex items-center justify-between gap-3 text-xs ${
            extremeDark
              ? "bg-black border-white/[0.04]"
              : "jarvis-glass border-cyan-400/15"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                voiceState === "error"
                  ? "bg-red-400"
                  : voiceState === "offline" || !isOnline
                  ? "bg-amber-400"
                  : voiceState === "speaking"
                  ? "bg-cyan-300"
                  : voiceState === "listening"
                  ? "bg-cyan-400"
                  : voiceState === "thinking" || voiceState === "connecting"
                  ? "bg-blue-400"
                  : "bg-cyan-500/45"
              }`}
              aria-hidden="true"
            />
            <span
              className={`font-mono-tabular font-medium tracking-[0.16em] whitespace-nowrap ${statusColorClass}`}
            >
              {statusText}
            </span>
            <span aria-hidden="true" className="text-slate-600 hidden sm:inline">
              ·
            </span>
            <span
              className={`hidden sm:inline truncate ${
                extremeDark ? "text-slate-500" : "text-slate-300"
              }`}
            >
              {NAV_ITEMS.find((n) => n.id === activeView)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 font-mono-tabular text-[11px]">
            {!isOnline ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300 whitespace-nowrap">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span>Hors ligne</span>
              </span>
            ) : (
              <span
                className={`whitespace-nowrap ${
                  extremeDark ? "text-slate-500" : "text-cyan-300/80"
                }`}
              >
                {geminiModel ? `En ligne · ${geminiModel}` : "En ligne"}
              </span>
            )}
          </div>
        </div>

        {/* Active View Workspace */}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>

        {/* Mobile Bottom Thumb Navigation */}
        <nav
          aria-label="Espaces JARVIS"
          className={`lg:hidden shrink-0 border-t pb-safe ${
            extremeDark
              ? "bg-black border-white/[0.05]"
              : "jarvis-glass border-cyan-400/15"
          }`}
        >
          <div className="flex overflow-x-auto px-1 pt-1 gap-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isSelected = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  aria-current={isSelected ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[56px] flex-1 px-1 rounded-xl transition-colors cursor-pointer ${
                    isSelected
                      ? extremeDark
                        ? "text-cyan-300 bg-cyan-950/30"
                        : "text-cyan-300 bg-cyan-500/12"
                      : extremeDark
                      ? "text-slate-500 hover:text-slate-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] font-medium whitespace-nowrap truncate max-w-full">
                    {item.mobileLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
