/**
 * Vue additive « Planificateur » — Phase 5 du Central Intelligence Core.
 * Pilotage réel du tick, des tâches planifiées, de l'historique et des alertes
 * du monitor. Aucune notification externe ni service distant : tout reste local.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  MonitorAlert,
  MonitorRule,
  ScheduleHistoryEntry,
  ScheduledTask,
  SchedulerEvent,
  SchedulerTickResult,
} from "../../core/scheduler/types.ts";
import type { CoreStatus, Mission } from "../../core/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";

interface SchedulerViewProps {
  isOnline: boolean;
  extremeDark: boolean;
}

const OUTCOME_STYLE: Record<string, string> = {
  success: "text-emerald-300",
  failure: "text-red-300",
  skipped: "text-amber-300",
  blocked: "text-orange-300",
};

export function SchedulerView({ isOnline, extremeDark }: SchedulerViewProps) {
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [events, setEvents] = useState<SchedulerEvent[]>([]);
  const [history, setHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [rules, setRules] = useState<MonitorRule[]>([]);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<SchedulerTickResult | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<"once" | "interval" | "daily" | "weekly">("daily");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [actionType, setActionType] = useState<"reminder" | "mission" | "agent_dispatch">("reminder");
  const [missionId, setMissionId] = useState("");
  const [text, setText] = useState("Rappel JARVIS");
  const [maxRuns, setMaxRuns] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextTasks, nextMissions, nextEvents, nextHistory, nextRules, nextAlerts] =
        await Promise.all([
          coreClient.getStatus(),
          coreClient.getScheduledTasks(),
          coreClient.listMissions(),
          coreClient.getSchedulerEvents(50),
          coreClient.getSchedulerHistory(50),
          coreClient.getSchedulerRules(),
          coreClient.getSchedulerAlerts(50),
        ]);
      setStatus(nextStatus);
      setTasks(nextTasks);
      setMissions(nextMissions);
      setEvents(nextEvents);
      setHistory(nextHistory);
      setRules(nextRules);
      setAlerts(nextAlerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le Core.");
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
  }, [isOnline, load]);

  const create = async () => {
    if (busy || !name.trim() || !text.trim()) return;
    if (actionType !== "reminder" && !missionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: Record<string, unknown> = {
        name: name.trim(),
        description: `Planification ${kind} (${timezone})`,
        kind,
        timezone,
        action: { type: actionType, text: text.trim(), ...(missionId ? { missionId } : {}) },
        ...(maxRuns ? { maxRuns: Number(maxRuns) } : {}),
      };
      if (kind === "once") input.at = Date.now() + 60_000;
      if (kind === "interval") input.everyMs = Math.max(1, everyMinutes) * 60_000;
      if (kind === "daily" || kind === "weekly") {
        input.hour = hour;
        input.minute = minute;
      }
      if (kind === "weekly") input.weekday = weekday;
      const task = await coreClient.createScheduledTask(input);
      setNotice(`Tâche « ${task.name} » créée (désactivée par défaut).`);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  };

  const tick = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await coreClient.schedulerTick("ui");
      setLastTick(result);
      setNotice(`Tick : ${result.executed} exécutée(s), ${result.failed} échec(s), ${result.blocked} bloquée(s), ${result.alerts} alerte(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tick impossible.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task: ScheduledTask) => {
    setBusy(true);
    setError(null);
    try {
      await coreClient.updateScheduledTask(task.id, { enabled: !task.enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setBusy(false);
    }
  };

  const trigger = async (task: ScheduledTask) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry = await coreClient.triggerScheduledTask(task.id);
      setNotice(`Déclenchement manuel : ${entry.outcome} — ${entry.detail.slice(0, 120)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Déclenchement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (task: ScheduledTask) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await coreClient.removeScheduledTask(task.id);
      setNotice(`Tâche « ${task.name} » retirée.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const result = await coreClient.stopAll("STOP GLOBAL (vue Planificateur)");
      setNotice(`STOP GLOBAL : ${result.cancelledMissions} mission(s) annulée(s) ; planifications dormantes.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "STOP GLOBAL a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const panel = extremeDark ? "bg-black/60 border-white/[0.07]" : "jarvis-glass border-cyan-400/15";
  const selectClass = `min-h-[38px] rounded-lg border bg-transparent px-2 text-xs ${panel}`;

  if (!isOnline) {
    return (
      <div className="flex-1 grid place-items-center p-6">
        <div className={`max-w-md rounded-2xl border p-6 text-center ${panel}`}>
          <AlertTriangle className="w-7 h-7 mx-auto mb-3 text-amber-300" />
          <p className="text-sm text-slate-200">Le planificateur nécessite le serveur local.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-display tracking-wider text-cyan-100">Planificateur & surveillance</h1>
          <p className="mt-1 text-xs text-slate-400">
            {status?.scheduler?.tasks ?? 0} tâche(s) · {status?.scheduler?.enabled ?? 0} activée(s) · tick serveur réel · fuseaux IANA · déduplication persistée · STOP GLOBAL prioritaire
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${panel}`}>
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <button type="button" onClick={() => void tick()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs text-cyan-100 disabled:opacity-50">
            <Play className="w-3.5 h-3.5" /> Tick manuel
          </button>
          <button type="button" onClick={() => void stop()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 disabled:opacity-50">
            <Square className="w-3.5 h-3.5" /> STOP GLOBAL
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{notice}</div>}
      {lastTick && (
        <div className="rounded-xl border border-white/[0.06] px-4 py-2 font-mono text-[10px] text-slate-400">
          dernier tick {new Date(lastTick.ts).toLocaleTimeString("fr-FR")} · dues {lastTick.due} · exécutées {lastTick.executed} · échecs {lastTick.failed} · ignorées {lastTick.skipped} · bloquées {lastTick.blocked} · alertes {lastTick.alerts}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Tâches", value: status?.scheduler?.tasks ?? 0, icon: CalendarClock },
          { label: "Activées", value: status?.scheduler?.enabled ?? 0, icon: CheckCircle2 },
          { label: "Exécutions", value: status?.scheduler?.history ?? 0, icon: History },
          { label: "Alertes", value: status?.scheduler?.alerts ?? 0, icon: Bell },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${panel}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </div>
            <p className="mt-2 text-xl font-display text-cyan-100">{item.value}</p>
          </div>
        ))}
      </div>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="text-sm font-semibold text-slate-100">Nouvelle planification</h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la tâche" className={selectClass} />
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={selectClass}>
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="interval">Intervalle</option>
            <option value="once">Une seule fois (+1 min)</option>
          </select>
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Paris" className={selectClass} />
          <select value={actionType} onChange={(e) => setActionType(e.target.value as typeof actionType)} className={selectClass}>
            <option value="reminder">Rappel local</option>
            <option value="mission">Démarrer une mission</option>
            <option value="agent_dispatch">Dispatcher les agents</option>
          </select>

          {(kind === "daily" || kind === "weekly") && (
            <>
              <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} className={selectClass} aria-label="Heure" />
              <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} className={selectClass} aria-label="Minute" />
            </>
          )}
          {kind === "weekly" && (
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={selectClass} aria-label="Jour de la semaine">
              {["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"].map((day, index) => (
                <option key={day} value={index}>{day}</option>
              ))}
            </select>
          )}
          {kind === "interval" && (
            <input type="number" min={1} value={everyMinutes} onChange={(e) => setEveryMinutes(Number(e.target.value))} className={selectClass} aria-label="Intervalle en minutes" />
          )}
          {actionType !== "reminder" && (
            <select value={missionId} onChange={(e) => setMissionId(e.target.value)} className={selectClass} aria-label="Mission">
              <option value="">Choisir une mission…</option>
              {missions.filter((m) => !["completed", "cancelled"].includes(m.status)).map((m) => (
                <option key={m.id} value={m.id}>{m.goal.slice(0, 60)}</option>
              ))}
            </select>
          )}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message / description" className={selectClass} />
          <input value={maxRuns} onChange={(e) => setMaxRuns(e.target.value)} placeholder="Max exécutions (optionnel)" className={selectClass} />
          <button type="button" onClick={() => void create()} disabled={busy || !name.trim() || !text.trim()} className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-xs text-cyan-100 disabled:opacity-50">
            Créer (désactivée)
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Tâches planifiées</h2>
          <div className="mt-3 space-y-2">
            {tasks.length === 0 && <p className="text-xs text-slate-500">Aucune tâche. Créez-en une ci-dessus.</p>}
            {tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-white/[0.06] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">{task.name}</span>
                  <span className={`text-[10px] font-mono ${task.enabled ? "text-emerald-300" : "text-slate-500"}`}>
                    {task.enabled ? "ACTIVÉE" : "DÉSACTIVÉE"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-500">
                  {task.kind} · {task.timezone} · {task.hour !== undefined ? `${String(task.hour).padStart(2, "0")}:${String(task.minute ?? 0).padStart(2, "0")}` : task.everyMs ? `${Math.round(task.everyMs / 60_000)} min` : task.at ? new Date(task.at).toLocaleString("fr-FR") : ""} · {task.action.type} · {task.runs} exécution(s)
                </p>
                {task.nextRunAt && <p className="mt-1 text-[10px] text-cyan-300/70">Prochaine : {new Date(task.nextRunAt).toLocaleString("fr-FR")}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void toggle(task)} disabled={busy} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">{task.enabled ? "Désactiver" : "Activer"}</button>
                  <button type="button" onClick={() => void trigger(task)} disabled={busy || status?.stopActive} className="rounded border border-cyan-400/30 px-2 py-1 text-[10px] text-cyan-200">Déclencher</button>
                  <button type="button" onClick={() => void remove(task)} disabled={busy} className="inline-flex items-center gap-1 rounded border border-red-400/30 px-2 py-1 text-[10px] text-red-200"><Trash2 className="w-3 h-3" /> Retirer</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Historique & surveillance</h2>
          <div className="mt-3 space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-xs text-slate-300"><History className="w-3.5 h-3.5" /> Historique ({history.length})</h3>
              <div className="mt-1 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] p-2">
                {history.length === 0 && <p className="text-[10px] text-slate-500">Aucune exécution.</p>}
                {history.map((entry) => (
                  <p key={entry.id} className="text-[10px] text-slate-400">
                    <span className={OUTCOME_STYLE[entry.outcome]}>{entry.outcome.toUpperCase()}</span> · {new Date(entry.finishedAt).toLocaleTimeString("fr-FR")} · {entry.detail.slice(0, 110)}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-xs text-slate-300"><Bell className="w-3.5 h-3.5" /> Alertes du monitor ({alerts.length})</h3>
              <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] p-2">
                {alerts.length === 0 && <p className="text-[10px] text-slate-500">Aucune alerte.</p>}
                {alerts.map((alert) => (
                  <p key={alert.id} className="flex items-start gap-1 text-[10px] text-amber-200/80"><ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" /> {alert.message}</p>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-500">{rules.filter((r) => r.enabled).length}/{rules.length} règles actives · {status?.scheduler?.tickCount ?? 0} ticks</p>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-xs text-slate-300"><Clock3 className="w-3.5 h-3.5" /> Événements ({events.length})</h3>
              <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-white/[0.06] p-2">
                {events.length === 0 && <p className="text-[10px] text-slate-500">Aucun événement.</p>}
                {events.map((event) => (
                  <p key={event.id} className="text-[10px] text-slate-400"><span className="font-mono text-cyan-300/70">{event.kind}</span> · {event.message.slice(0, 120)}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {status?.stopActive && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[11px] text-orange-100">
          <XCircle className="w-4 h-4 shrink-0" /> STOP GLOBAL actif : les planifications sont bloquées ; le tick ne les exécute pas.
        </div>
      )}
    </div>
  );
}
