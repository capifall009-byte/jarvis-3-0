/**
 * Tableau de bord unifié — JARVIS 4.0 Phase 9.
 *
 * Toutes les valeurs affichées proviennent de `GET /api/core/status` via
 * `coreClient`. Aucune statistique fictive, aucune fonctionnalité simulée :
 * si le Core est injoignable, l'erreur est affichée et les modules restent
 * navigables (leur propre vue gère son chargement).
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FolderKanban,
  Layers,
  MessageSquare,
  MonitorSmartphone,
  RefreshCw,
  Settings,
  ShieldCheck,
  Square,
  Target,
  Wrench,
} from "lucide-react";
import type { AppView } from "../../types/jarvis.ts";
import type { CoreStatus } from "../../core/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";

interface CommandHubViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  onSelectView: (view: AppView) => void;
  onStop: () => Promise<unknown> | void;
  onResume: () => Promise<unknown> | void;
}

interface ModuleLink {
  view: AppView;
  label: string;
  detail: string;
  icon: typeof Bot;
  metric?: (status: CoreStatus) => string | null;
}

const MODULES: readonly ModuleLink[] = [
  { view: "conversations", label: "Chat Gemini", detail: "Conversations et voix fr-FR", icon: MessageSquare },
  { view: "missions", label: "Missions", detail: "Planification et exécution", icon: Target, metric: (s) => `${s.missions.total} au total` },
  { view: "agents", label: "Agents", detail: "Huit rôles orchestrés", icon: Bot, metric: (s) => s.agents ? `${s.agents.roles} rôles · ${s.agents.active} actifs` : null },
  { view: "skills", label: "Skills", detail: "Workflows déclaratifs", icon: Layers, metric: (s) => s.skills ? `${s.skills.active} actives` : null },
  { view: "tools", label: "Outils", detail: "Registre déclaratif", icon: Wrench, metric: (s) => s.tools ? `${s.tools.enabled}/${s.tools.total} actifs` : null },
  { view: "contextMemory", label: "Mémoire contextuelle", detail: "Court et long terme local", icon: BrainCircuit, metric: (s) => s.contextMemory ? `${s.contextMemory.stats.total} souvenirs` : null },
  { view: "scheduler", label: "Automatisations", detail: "Planificateur et monitoring", icon: CalendarClock, metric: (s) => s.scheduler ? `${s.scheduler.enabled}/${s.scheduler.tasks} actives` : null },
  { view: "devices", label: "Appareils", detail: "Portabilité locale", icon: MonitorSmartphone, metric: (s) => s.devices ? s.devices.readiness : null },
  { view: "projects", label: "Projets", detail: "Liens conversations et mémoire", icon: FolderKanban },
  { view: "settings", label: "Paramètres", detail: "Préférences et sécurité", icon: Settings },
];

export function CommandHubView({ isOnline, extremeDark, onSelectView, onStop, onResume }: CommandHubViewProps) {
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isOnline) {
      setLoading(false);
      setError("Hors ligne : le tableau de bord du Core est indisponible.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setStatus(await coreClient.getStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de joindre le Core.");
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => { void load(); }, [load]);

  const toggleStop = async () => {
    setBusy(true);
    setError(null);
    try {
      if (status?.stopActive) {
        await onResume();
      } else {
        await onStop();
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action STOP impossible.");
    } finally {
      setBusy(false);
    }
  };

  const panel = `hud-panel ${extremeDark ? "border-white/[0.07] bg-black/60" : "border-cyan-400/15 bg-[#06101f]/70"}`;

  const stats = status ? [
    { label: "Phase Core", value: String(status.phase) },
    { label: "Missions", value: String(status.missions.total) },
    { label: "Agents", value: status.agents ? String(status.agents.roles) : "—" },
    { label: "Skills", value: status.skills ? String(status.skills.active) : "—" },
    { label: "Outils", value: status.tools ? String(status.tools.enabled) : "—" },
    { label: "Planifications", value: status.scheduler ? String(status.scheduler.enabled) : "—" },
    { label: "Mémoire", value: status.contextMemory ? String(status.contextMemory.stats.total) : "—" },
    { label: "Audit", value: String(status.auditCount) },
  ] : [];

  return (
    <div id="command-hub-view" className="hud-enter flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="jarvis-stat-label">Central Intelligence Core</p>
          <h1 className="hud-title mt-1 text-xl sm:text-2xl font-display tracking-wider text-cyan-100">Tableau de bord unifié</h1>
          <p className="mt-1 text-xs text-slate-400">
            {status
              ? `${status.identity.name} ${status.identity.version} · stockage ${status.storage.kind} · ${status.storage.persistent ? "persistant" : "volatile"}`
              : "Connexion au Core en cours…"}
          </p>
          {status ? (
            <span
              className="hud-chip mt-2"
              style={
                status.stopActive
                  ? { color: "#fb923c", borderColor: "rgba(251,146,60,.42)", background: "rgba(251,146,60,.08)" }
                  : undefined
              }
            >
              {status.stopActive ? "STOP GLOBAL ACTIF" : "CORE OPÉRATIONNEL"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || busy}
            className={`jarvis-touch-target inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-slate-200 ${panel} disabled:opacity-50`}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Actualiser
          </button>
          {status && (
            <button type="button" onClick={() => void toggleStop()} disabled={busy}
              className={`jarvis-touch-target inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${
                status.stopActive
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                  : "border-red-500/40 bg-red-500/10 text-red-200"
              }`}>
              {status.stopActive ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Square className="w-3.5 h-3.5" aria-hidden="true" />}
              {status.stopActive ? "Reprendre" : "STOP GLOBAL"}
            </button>
          )}
        </div>
      </header>

      {loading && (
        <div role="status" aria-live="polite" className={`rounded-2xl border p-6 text-center text-xs text-slate-300 ${panel}`}>
          Lecture de l’état réel du Core…
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load()} className="rounded border border-red-400/30 px-2 py-1 text-[11px]">Réessayer</button>
        </div>
      )}

      {status?.stopActive && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-[11px] text-orange-100">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          STOP GLOBAL actif : Skills, agents, outils, planifications, portabilité et mémoire contextuelle sont bloqués.
        </div>
      )}

      {status && (
        <>
          <section aria-labelledby="hub-stats-title">
            <h2 id="hub-stats-title" className="jarvis-stat-label mb-2">État du Core (valeurs réelles)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
              {stats.map((stat) => (
                <div key={stat.label} className={`rounded-xl border p-3 ${panel}`}>
                  <p className="jarvis-stat-label">{stat.label}</p>
                  <p className="jarvis-stat-value mt-2">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="hub-modules-title">
            <h2 id="hub-modules-title" className="jarvis-stat-label mb-2">Modules</h2>
            <nav aria-label="Navigation vers les modules" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {MODULES.map((module) => {
                const Icon = module.icon;
                const metric = module.metric?.(status);
                return (
                  <button key={module.view} type="button" onClick={() => onSelectView(module.view)}
                    className={`jarvis-touch-target group flex items-center gap-3 rounded-2xl border p-4 text-left ${panel} jarvis-stark-hover`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-500/10">
                      <Icon className="w-5 h-5 text-cyan-200" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-100">{module.label}</span>
                      <span className="block truncate text-[11px] text-slate-400">{metric ?? module.detail}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                );
              })}
            </nav>
          </section>

          <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-[11px] ${panel} text-slate-400`}>
            <ShieldCheck className="w-4 h-4 text-cyan-200" aria-hidden="true" />
            <span>{status.capabilities.contextMemory ? "Mémoire contextuelle active" : "Mémoire contextuelle inactive"} ·</span>
            <span>{status.capabilities.multiDeviceSync ? "Synchronisation active" : "Aucune synchronisation distante"} ·</span>
            <span>{status.approvals} approbation(s) en attente</span>
          </div>
        </>
      )}
    </div>
  );
}

export default CommandHubView;
