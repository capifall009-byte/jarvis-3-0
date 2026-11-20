import { useEffect, useState, type ReactNode } from "react";
import { WifiOff } from "lucide-react";

/** Teinte du point d'état, dérivée de l'état réel transmis par l'application. */
export type HudStatusTone = "ok" | "busy" | "warn" | "error";

export interface HudTopBarProps {
  statusText: string;
  tone: HudStatusTone;
  isOnline: boolean;
  geminiModel: string | null;
  version?: string;
  /** Commandes à droite (menu, nouvelle session, thème…). */
  actions?: ReactNode;
  /** Commandes à gauche (bouton menu mobile par exemple). */
  leading?: ReactNode;
  /** Barre compacte pour en-tête mobile. */
  compact?: boolean;
}

const TONE_LABEL: Record<HudStatusTone, string> = {
  ok: "Nominal",
  busy: "Actif",
  warn: "Attention",
  error: "Erreur",
};

function useLocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

/**
 * Barre supérieure HUD. Toutes les valeurs proviennent de props réelles :
 * état vocal du shell, connectivité navigateur, modèle Gemini chargé et
 * horloge locale. Aucune statistique n'est inventée.
 */
export function HudTopBar({
  statusText,
  tone,
  isOnline,
  geminiModel,
  version = "4.0",
  actions,
  leading,
  compact = false,
}: HudTopBarProps) {
  const time = useLocalClock();

  return (
    <div
      className={`hud-enter flex min-w-0 items-center justify-between gap-3 ${
        compact ? "h-12 px-2.5" : "h-10 px-3.5 sm:px-6"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {leading}
        {!compact ? (
          <div className="flex shrink-0 items-baseline gap-1.5" aria-label={`JARVIS ${version}`}>
            <span className="hud-title font-display text-sm font-semibold tracking-[0.26em] text-[#eaf6ff]">
              JARVIS
            </span>
            <span className="font-mono-tabular text-[10px] text-[#38bdf8]">{version}</span>
          </div>
        ) : null}
        <span
          className={`hud-status-dot ${tone === "busy" ? "hud-status-dot--pulse" : ""}`}
          data-tone={tone}
          aria-hidden="true"
          style={
            tone === "error"
              ? { background: "#f87171", boxShadow: "0 0 0 3px rgba(248,113,113,.14)" }
              : tone === "warn" || !isOnline
              ? { background: "#fbbf24", boxShadow: "0 0 0 3px rgba(251,191,36,.14)" }
              : tone === "busy"
              ? { background: "#087bff", boxShadow: "0 0 0 3px rgba(8,123,255,.16)" }
              : undefined
          }
        />
        <span className="font-mono-tabular truncate text-[11px] font-medium tracking-[0.12em] text-[#bfe9ff]">
          {statusText}
        </span>
        {!compact ? (
          <span className="hud-chip hidden sm:inline-flex" title={`État : ${statusText}`}>
            {TONE_LABEL[tone]}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 font-mono-tabular text-[11px]">
        {!isOnline ? (
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Hors ligne</span>
          </span>
        ) : (
          <span className="hidden truncate text-[#38bdf8] sm:inline">
            {geminiModel ? `IA · ${geminiModel}` : "IA · connexion en cours"}
          </span>
        )}
        <time className="hidden text-[#8495a8] sm:inline" dateTime={new Date().toISOString()}>
          {time}
        </time>
        {actions}
      </div>
    </div>
  );
}

export default HudTopBar;
