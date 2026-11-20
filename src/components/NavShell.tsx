import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  Brain,
  BrainCircuit,
  CalendarClock,
  Clapperboard,
  Command,
  Cpu,
  FileText,
  Film,
  FolderKanban,
  Globe,
  History,
  Home,
  Layers,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Microscope,
  MonitorSmartphone,
  Moon,
  MoreHorizontal,
  Newspaper,
  Plus,
  Settings,
  Share2,
  SlidersHorizontal,
  Target,
  Wrench,
  WifiOff,
  X,
} from "lucide-react";
import type { AppView, VoiceState } from "../types/jarvis";
import { HudTopBar, type HudStatusTone } from "./hud/HudTopBar";

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
  /** Sidebar unifiée (desktop). */
  sidebarSlot?: ReactNode;
  /** Sidebar unifiée (tiroir mobile compact). Peut être un nœud ou une fonction recevant onClose. */
  mobileSidebarSlot?: ReactNode | ((onClose: () => void) => ReactNode);
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
  { id: "dashboard", label: "Tableau de bord", mobileLabel: "Tableau de bord", icon: Command, view: "dashboard" },
  { id: "home", label: "Accueil JARVIS", mobileLabel: "Accueil", icon: Home, view: "home" },
  { id: "chat", label: "Chat principal", mobileLabel: "Chat", icon: MessageSquare, view: "conversations" },
  { id: "new", label: "Nouvelle conversation", mobileLabel: "Nouveau", icon: Plus, action: "new" },
  { id: "intelligence", label: "Cerveau central", mobileLabel: "Cerveau", icon: Cpu, view: "intelligence" },
  { id: "aiHub", label: "AI Hub", mobileLabel: "AI Hub", icon: LayoutDashboard, view: "aiHub" },
  { id: "imageStudio", label: "Studio Images", mobileLabel: "Images", icon: FileText, view: "imageStudio" },
  { id: "video", label: "Studio Vidéo", mobileLabel: "Vidéo", icon: Film, view: "video" },
  { id: "remotionStudio", label: "Studio Vidéo (Remotion)", mobileLabel: "Remotion", icon: Clapperboard, view: "remotionStudio" },
  { id: "projects", label: "Projets", mobileLabel: "Projets", icon: FolderKanban, view: "projects" },
  { id: "control", label: "Centre de contrôle", mobileLabel: "Contrôle", icon: LayoutDashboard, view: "controlCenter" },
  { id: "missions", label: "Missions (Core 4.0)", mobileLabel: "Missions", icon: Target, view: "missions" },
  { id: "skills", label: "Compétences (Skills)", mobileLabel: "Skills", icon: Layers, view: "skills" },
  { id: "agents", label: "Agents (Core 4.0)", mobileLabel: "Agents", icon: Bot, view: "agents" },
  { id: "scheduler", label: "Planificateur (Core 4.0)", mobileLabel: "Planif.", icon: CalendarClock, view: "scheduler" },
  { id: "tools", label: "Outils (Core 4.0)", mobileLabel: "Outils", icon: Wrench, view: "tools" },
  { id: "devices", label: "Appareils (Core 4.0)", mobileLabel: "Appareils", icon: MonitorSmartphone, view: "devices" },
  { id: "contextMemory", label: "Mémoire contextuelle (Core 4.0)", mobileLabel: "Contexte", icon: BrainCircuit, view: "contextMemory" },
  { id: "memory", label: "Mémoire", mobileLabel: "Mémoire", icon: Brain, view: "memory" },
  { id: "search", label: "Recherche Web", mobileLabel: "Web", icon: Globe, view: "search" },
  { id: "research", label: "Recherche approfondie", mobileLabel: "Approf.", icon: Microscope, view: "research" },
  { id: "news", label: "Actualités", mobileLabel: "Actus", icon: Newspaper, view: "news" },
  { id: "social", label: "Social Hub", mobileLabel: "Social", icon: Share2, view: "social" },
  { id: "history", label: "Historique", mobileLabel: "Historique", icon: History, action: "history" },
  { id: "files", label: "Analyse de fichiers", mobileLabel: "Fichiers", icon: FileText, view: "files" },
  { id: "aiVideo", label: "Studio Vidéo IA", mobileLabel: "Vidéo IA", icon: Film, view: "aiVideo" },
  { id: "reels", label: "Générateur vidéo / Reels", mobileLabel: "Reels", icon: Clapperboard, view: "reels" },
  { id: "modes", label: "Modes", mobileLabel: "Modes", icon: SlidersHorizontal, view: "modes" },
  { id: "mobile", label: "Accès mobile", mobileLabel: "Mobile", icon: MonitorSmartphone, view: "mobileAccess" },
  { id: "settings", label: "Paramètres", mobileLabel: "Réglages", icon: Settings, view: "settings" },
];

// Navigation basse mobile : rubriques principales + accès menu secondaire
const MOBILE_QUICK: NavItem[] = NAV_ITEMS.filter((i) =>
  ["dashboard", "home", "chat", "aiHub", "projects", "control"].includes(i.id)
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
  mobileSidebarSlot,
}: NavShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Phase 9 : le menu mobile est un dialogue modal — Escape ferme, le focus
  // entre dans le menu à l'ouverture, revient au bouton à la fermeture et reste
  // piégé tant que le menu est ouvert.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const getFocusable = () =>
      Array.from(mobileMenuRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getFocusable();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const frame = requestAnimationFrame(() => { getFocusable()[0]?.focus(); });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [mobileMenuOpen]);

  // Le clavier virtuel réduit la hauteur visible (visualViewport) sans toujours
  // modifier 100dvh. On suit cette hauteur pour garder la zone de saisie visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setViewportHeight(vv.height);
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOpen(inset > 120);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

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

  const statusTone: HudStatusTone =
    voiceState === "error"
      ? "error"
      : voiceState === "offline" || !isOnline
      ? "warn"
      : voiceState === "listening" ||
        voiceState === "speaking" ||
        voiceState === "thinking" ||
        voiceState === "connecting"
      ? "busy"
      : "ok";

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
      className={`jarvis-app-shell hud-grid-bg relative w-full flex flex-col lg:flex-row overflow-hidden transition-colors ${
        extremeDark ? "bg-black text-slate-300" : "jarvis-holo-canvas text-slate-100"
      }`}
      style={{ height: viewportHeight ? `${viewportHeight}px` : "100dvh" }}
    >
      {/* Phase 9 : lien d'évitement clavier vers le contenu principal. */}
      <a href="#jarvis-main" className="jarvis-skip-link">Aller au contenu principal</a>

      {/* Desktop sidebar — le wrapper reste monté mais "hidden" sur mobile :
          la sidebar ne peut plus devenir un enfant flex plein écran. */}
      <aside
        className={`hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r ${
          extremeDark ? "bg-black border-white/[0.05]" : "jarvis-glass border-cyan-400/15"
        }`}
      >
        {sidebarSlot ?? (
          <>
          <div className={`px-5 py-5 border-b ${extremeDark ? "border-white/[0.05]" : "border-cyan-400/12"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`font-display text-xl font-semibold tracking-[0.26em] ${extremeDark ? "text-cyan-200/80" : "text-cyan-50"}`}>JARVIS</span>
              <span className={`text-[11px] font-mono-tabular ${extremeDark ? "text-slate-600" : "text-cyan-400/75"}`}>4.0</span>
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
          </>
        )}
      </aside>

      {/* Main + Mobile chrome */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {/* Mobile header (HUD compact) */}
        <header
          className={`lg:hidden shrink-0 pt-safe border-b hud-panel rounded-none ${
            extremeDark ? "border-white/[0.04] bg-black" : "border-cyan-400/15"
          }`}
        >
          <HudTopBar
            compact
            statusText={statusText}
            tone={statusTone}
            isOnline={isOnline}
            geminiModel={geminiModel}
            leading={
              <>
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Ouvrir le menu"
                  aria-expanded={mobileMenuOpen}
                  aria-controls="jarvis-mobile-menu"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#eaf6ff] cursor-pointer"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <span className="hud-title font-display text-sm font-semibold tracking-[0.2em] text-[#eaf6ff] sm:text-base">
                  JARVIS
                </span>
              </>
            }
            actions={
              <>
                <button type="button" onClick={onToggleExtremeDark} aria-pressed={extremeDark} aria-label={extremeDark ? "Désactiver le mode sombre extrême" : "Activer le mode sombre extrême"} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#8495a8] cursor-pointer">
                  <Moon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => { onNewSession(); onSelectView("conversations"); }} aria-label="Nouvelle conversation" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#eaf6ff] cursor-pointer">
                  <Plus className="h-4 w-4" />
                </button>
              </>
            }
          />
        </header>

        {/* HUD status bar (desktop) */}
        <div
          role="status"
          aria-live="polite"
          className={`hidden lg:flex shrink-0 border-b text-xs hud-panel rounded-none ${
            extremeDark ? "border-white/[0.04] bg-black" : "border-cyan-400/15"
          }`}
        >
          <HudTopBar
            statusText={statusText}
            tone={statusTone}
            isOnline={isOnline}
            geminiModel={geminiModel}
          />
        </div>

        {/* Active view */}
        <main id="jarvis-main" tabIndex={-1} className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>

        {/* Mobile bottom nav (rubriques principales + menu secondaire) */}
        {!keyboardOpen && (
          <nav
            aria-label="Navigation principale mobile"
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
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-[52px] flex-1 px-1 rounded-xl transition-colors cursor-pointer ${
                      selected ? (extremeDark ? "text-cyan-300 bg-cyan-950/30" : "text-cyan-300 bg-cyan-500/12") : (extremeDark ? "text-slate-400" : "text-slate-400")
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="text-[10px] font-medium truncate max-w-full leading-tight">{item.mobileLabel}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Ouvrir le menu secondaire"
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[52px] flex-1 px-1 rounded-xl transition-colors cursor-pointer ${extremeDark ? "text-slate-400" : "text-slate-400"}`}
              >
                <MoreHorizontal className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-medium truncate max-w-full leading-tight">Menu</span>
              </button>
            </div>
          </nav>
        )}

        {/* Mobile slide-over menu — toujours monté pour autoriser l'animation
            de sortie et garantir qu'aucun état ne laisse le tiroir bloquer le chat. */}
        <div
          className="jarvis-mobile-drawer lg:hidden fixed inset-0 z-50"
          data-open={mobileMenuOpen ? "true" : "false"}
          aria-hidden={!mobileMenuOpen}
        >
          <button
            type="button"
            className="jarvis-mobile-drawer__scrim absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Fermer le menu"
            onClick={() => setMobileMenuOpen(false)}
            tabIndex={mobileMenuOpen ? 0 : -1}
          />
          <div
            ref={mobileMenuRef}
            id="jarvis-mobile-menu"
            role="dialog"
            aria-modal={mobileMenuOpen ? true : undefined}
            aria-label="Menu de navigation principal"
            className={`jarvis-mobile-drawer__panel absolute inset-y-0 left-0 w-[min(88vw,340px)] max-w-[88vw] border-r flex flex-col overflow-hidden pt-safe pb-safe ${extremeDark ? "bg-black border-white/[0.08]" : "bg-[#040916] border-cyan-400/15"}`}
          >
            {mobileSidebarSlot ? (
              <div className="h-full min-h-0">
                {typeof mobileSidebarSlot === "function"
                  ? mobileSidebarSlot(() => setMobileMenuOpen(false))
                  : mobileSidebarSlot}
              </div>
            ) : sidebarSlot ? (
              <div className="h-full min-h-0">{sidebarSlot}</div>
            ) : (
              <>
                <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg grid place-items-center bg-cyan-500/15 border border-cyan-400/20"><span className="text-sm font-display font-semibold text-cyan-300">J</span></div>
                    <span className="font-display text-slate-100">JARVIS 4.0</span>
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
                        aria-current={selected ? "page" : undefined}
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
