/**
 * Scheduler et Event Monitor — JARVIS 4.0 Phase 5.
 *
 * Pur TypeScript, déterministe et borné. Le moteur ne possède aucun timer :
 * c'est le serveur qui appelle explicitement `tick()`. Chaque créneau est
 * dédupliqué par une clé persistée, chaque exécution est journalisée dans
 * l'historique, et STOP GLOBAL bloque tout déclenchement. Les fuseaux horaires
 * sont validés et calculés avec Intl (aucune bibliothèque, aucun service).
 */

import type {
  MonitorAlert,
  MonitorRule,
  NewScheduledTask,
  ScheduleHistoryEntry,
  ScheduledActionHandler,
  ScheduledTask,
  SchedulerDeps,
  SchedulerEvent,
  SchedulerEventKind,
  SchedulerState,
  SchedulerTickResult,
} from "./types.ts";
import { DEFAULT_RULES } from "./types.ts";

const MAX_TASKS = 50;
const MAX_EVENTS = 200;
const MAX_HISTORY = 200;
const MAX_ALERTS = 100;
const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

function zonedParts(ts: number, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(ts))) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    weekday: WEEKDAYS[values.weekday] ?? 0,
  };
}

/** Convertit une heure locale (fuseau IANA) en epoch UTC, avec ajustement DST. */
function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, timezone: string
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = zonedParts(guess, timezone);
  let result = guess - (Date.UTC(first.year, first.month - 1, first.day, first.hour, first.minute) - guess);
  const second = zonedParts(result, timezone);
  result -= Date.UTC(second.year, second.month - 1, second.day, second.hour, second.minute) - guess;
  return result;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function assertTimezone(timezone: string): void {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,3}$/.test(timezone)) {
    throw new Error(`Fuseau horaire invalide : ${timezone}`);
  }
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
  } catch {
    throw new Error(`Fuseau horaire inconnu : ${timezone}`);
  }
}

export class SchedulerEngine {
  private readonly state: SchedulerState;
  private readonly audit: SchedulerDeps["audit"];
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly isStopped: () => boolean;
  private readonly actionHandler: ScheduledActionHandler;

  constructor(deps: SchedulerDeps) {
    this.state = deps.state;
    this.audit = deps.audit;
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
    this.isStopped = deps.isStopped ?? (() => false);
    this.actionHandler = deps.actionHandler ?? ((task) => ({ ok: true, detail: `Rappel : ${task.action.text}` }));
    if (!Array.isArray(this.state.tasks)) this.state.tasks = [];
    if (!Array.isArray(this.state.events)) this.state.events = [];
    if (!Array.isArray(this.state.history)) this.state.history = [];
    if (!Array.isArray(this.state.rules) || this.state.rules.length === 0) {
      this.state.rules = DEFAULT_RULES.map((rule) => ({ ...rule, fires: 0 }));
    }
    if (!Array.isArray(this.state.alerts)) this.state.alerts = [];
  }

  listTasks(): ScheduledTask[] {
    return this.state.tasks.slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  getTask(id: string): ScheduledTask | undefined {
    return this.state.tasks.find((task) => task.id === id);
  }

  listEvents(limit = 80): SchedulerEvent[] {
    return this.state.events.slice(-Math.max(1, Math.min(limit, MAX_EVENTS))).reverse();
  }

  listHistory(limit = 80): ScheduleHistoryEntry[] {
    return this.state.history.slice(-Math.max(1, Math.min(limit, MAX_HISTORY))).reverse();
  }

  listRules(): MonitorRule[] {
    return this.state.rules.slice();
  }

  listAlerts(limit = 80): MonitorAlert[] {
    return this.state.alerts.slice(-Math.max(1, Math.min(limit, MAX_ALERTS))).reverse();
  }

  /** Crée une tâche validée, désactivée par défaut : rien ne part sans accord. */
  createTask(input: NewScheduledTask): ScheduledTask {
    if (this.state.tasks.length >= MAX_TASKS) throw new Error(`Limite de ${MAX_TASKS} tâches atteinte.`);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name.length < 3 || name.length > 120) throw new Error("Le nom doit contenir 3 à 120 caractères.");
    const timezone = typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : "Europe/Paris";
    assertTimezone(timezone);
    if (!["once", "interval", "daily", "weekly"].includes(input.kind)) throw new Error("Type de planification inconnu.");

    const task: ScheduledTask = {
      id: this.id("task"),
      name,
      ...(typeof input.description === "string" && input.description.trim()
        ? { description: input.description.trim().slice(0, 500) }
        : {}),
      enabled: input.enabled === true,
      kind: input.kind,
      timezone,
      ...(this.validateSchedule(input, timezone)),
      action: this.validateAction(input.action),
      runs: 0,
      ...(input.maxRuns !== undefined ? { maxRuns: this.validateMaxRuns(input.maxRuns) } : {}),
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    task.nextRunAt = this.computeNext(task, task.createdAt) ?? undefined;
    this.state.tasks.push(task);
    this.audit.record({
      actor: "user", action: "scheduler_task_created", target: task.id,
      outcome: "success", detail: `${task.kind} · ${task.timezone} · ${task.enabled ? "activée" : "désactivée"}.`,
    });
    return task;
  }

  /** Modification additive : enable/disable et champs de planification. */
  updateTask(id: string, patch: Partial<Omit<NewScheduledTask, "action">> & {
    action?: Partial<ScheduledTask["action"]>;
  }): ScheduledTask {
    const task = this.requireTask(id);
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (name.length < 3 || name.length > 120) throw new Error("Nom invalide.");
      task.name = name;
    }
    if (patch.description !== undefined) task.description = String(patch.description).trim().slice(0, 500);
    if (patch.enabled !== undefined) task.enabled = patch.enabled === true;
    if (patch.timezone !== undefined) {
      assertTimezone(String(patch.timezone));
      task.timezone = String(patch.timezone);
    }
    if (patch.kind !== undefined || patch.at !== undefined || patch.everyMs !== undefined ||
        patch.hour !== undefined || patch.minute !== undefined || patch.weekday !== undefined) {
      const schedule = this.validateSchedule({ ...task, ...patch } as NewScheduledTask, task.timezone);
      task.kind = (patch.kind ?? task.kind) as ScheduledTask["kind"];
      task.at = schedule.at;
      task.everyMs = schedule.everyMs;
      task.hour = schedule.hour;
      task.minute = schedule.minute;
      task.weekday = schedule.weekday;
      // Un changement de planning invalide l'ancien créneau.
      delete task.lastSlot;
    }
    if (patch.maxRuns !== undefined) task.maxRuns = this.validateMaxRuns(patch.maxRuns);
    if (patch.action) {
      const merged = { ...task.action, ...patch.action };
      task.action = this.validateAction(merged);
    }
    task.updatedAt = this.now();
    task.nextRunAt = this.computeNext(task, this.now()) ?? undefined;
    this.audit.record({
      actor: "user", action: "scheduler_task_updated", target: task.id,
      outcome: "info", detail: task.enabled ? "Tâche activée." : "Tâche désactivée.",
    });
    return task;
  }

  removeTask(id: string): { removed: boolean; id: string } {
    const index = this.state.tasks.findIndex((task) => task.id === id);
    if (index < 0) return { removed: false, id };
    this.state.tasks.splice(index, 1);
    this.audit.record({ actor: "user", action: "scheduler_task_removed", target: id, outcome: "info", severity: "warn" });
    return { removed: true, id };
  }

  /**
   * Tick serveur honnête : évalue l'heure courante, exécute au plus une fois
   * par créneau et par tâche. Aucun rattrapage en rafale après redémarrage.
   */
  async tick(source = "core", ts = this.now()): Promise<SchedulerTickResult> {
    const result: SchedulerTickResult = {
      due: 0, executed: 0, failed: 0, skipped: 0, blocked: 0, alerts: 0, changed: false, ts,
    };

    for (const task of this.state.tasks.slice().sort((a, b) => a.createdAt - b.createdAt)) {
      if (!task.enabled) continue;
      const slot = this.slotFor(task, ts);
      if (!slot) continue;

      if (this.isStopped()) {
        result.blocked += 1;
        this.event(`stop|${task.id}|${dateKey(...this.dateTuple(ts))}`, "stop_blocked",
          `STOP GLOBAL : « ${task.name} » non exécutée.`, ts, task.id);
        continue;
      }

      if (task.lastSlot === slot || this.state.history.some((h) => h.taskId === task.id && h.slot === slot)) {
        continue; // déduplication persistée : un seul déclenchement par créneau
      }
      if (task.maxRuns !== undefined && task.runs >= task.maxRuns) {
        result.skipped += 1;
        this.event(`limit|${task.id}|${slot}`, "task_skipped", `Limite de ${task.maxRuns} exécution(s) atteinte.`, ts, task.id);
        continue;
      }

      result.due += 1;
      task.lastSlot = slot;
      task.lastRunAt = ts;
      task.runs += 1;
      task.nextRunAt = this.computeNext(task, ts) ?? undefined;
      task.updatedAt = ts;
      result.changed = true;
      this.event(slot, "task_due", `Créneau dû pour « ${task.name} ».`, ts, task.id);

      const startedAt = this.now();
      try {
        const outcome = await this.actionHandler(task, { slot, ts, source });
        const finishedAt = this.now();
        if (outcome.ok) {
          result.executed += 1;
          this.history(task.id, slot, startedAt, finishedAt, "success", outcome.detail);
          this.event(`done|${slot}`, "task_executed", `« ${task.name} » : ${outcome.detail}`.slice(0, 400), finishedAt, task.id);
        } else {
          result.failed += 1;
          this.history(task.id, slot, startedAt, finishedAt, "failure", outcome.detail);
          this.event(`failed|${slot}`, "task_failed", `« ${task.name} » : ${outcome.detail}`.slice(0, 400), finishedAt, task.id);
        }
      } catch (err) {
        result.failed += 1;
        const detail = (err as Error)?.message ?? "Erreur inconnue";
        this.history(task.id, slot, startedAt, this.now(), "failure", detail);
        this.event(`failed|${slot}`, "task_failed", `« ${task.name} » : ${detail}`.slice(0, 400), this.now(), task.id);
      }
    }

    const alerts = this.runMonitor(ts);
    result.alerts = alerts;
    if (alerts > 0) result.changed = true;

    const firstTick = this.state.lastTickAt === 0;
    this.state.lastTickAt = ts;
    this.state.tickCount += 1;
    if (firstTick) {
      this.event(`restart|${ts}`, "server_restart", "Scheduler démarré : aucun rattrapage en rafale.", ts);
      result.changed = true;
    }
    return result;
  }

  /** Déclenchement manuel explicite : créneau unique, jamais confondu avec un tick. */
  async triggerTask(id: string, source = "user"): Promise<ScheduleHistoryEntry> {
    const task = this.requireTask(id);
    if (this.isStopped()) throw new Error("STOP GLOBAL actif : déclenchement impossible.");
    if (task.maxRuns !== undefined && task.runs >= task.maxRuns) {
      throw new Error(`Limite de ${task.maxRuns} exécution(s) atteinte.`);
    }
    const ts = this.now();
    const slot = `manual|${source}|${id}|${ts}`;
    const startedAt = ts;
    const outcome = await this.actionHandler(task, { slot, ts, source });
    const finishedAt = this.now();
    task.runs += 1;
    task.lastRunAt = finishedAt;
    task.updatedAt = finishedAt;
    const entry = this.history(task.id, slot, startedAt, finishedAt, outcome.ok ? "success" : "failure", outcome.detail);
    this.event(slot, outcome.ok ? "task_executed" : "task_failed",
      `Déclenchement manuel « ${task.name} » : ${outcome.detail}`.slice(0, 400), finishedAt, task.id);
    this.audit.record({
      actor: "user", action: "scheduler_task_triggered", target: task.id,
      outcome: outcome.ok ? "success" : "failure", detail: source,
    });
    return entry;
  }

  /** STOP GLOBAL : les tâches restent configurées mais aucun tick ne les exécute. */
  stopAll(reason: string): void {
    this.event(`stop|${reason}|${dateKey(...this.dateTuple(this.now()))}`, "stop_blocked",
      `${reason} : planifications dormantes jusqu'à reprise explicite.`, this.now());
    this.audit.record({
      actor: "system", action: "scheduler_stopped", outcome: "info", severity: "warn",
      detail: `${reason} — ${this.state.tasks.filter((t) => t.enabled).length} tâche(s) activée(s) bloquée(s).`,
    });
  }

  /**
   * Phase 9.5 : curseur d'audit fiable. `audit.list()` renvoie les événements du
   * plus récent au plus ancien ; on les remet dans l'ordre chronologique et on
   * retient l'identifiant du dernier événement traité. Un simple index ne pouvait
   * ni suivre les ajouts ni survivre à la troncature du journal borné.
   */
  private runMonitor(ts: number): number {
    const all = this.audit.listChronological
      ? this.audit.listChronological(500)
      : this.audit.list({ limit: 500 }).slice().reverse();
    let start = 0;
    const lastId = this.state.lastAuditEventId;
    if (lastId) {
      const index = all.findIndex((event) => event.id === lastId);
      start = index >= 0 ? index + 1 : 0;
    } else if (this.state.lastAuditIndex > 0) {
      // Migration depuis l'ancien curseur numérique (compatibilité des états).
      start = Math.min(this.state.lastAuditIndex, all.length);
    }
    const pending = all.slice(start);
    let fired = 0;

    for (const rule of this.state.rules) {
      if (!rule.enabled) continue;
      for (const event of pending) {
        if (event.action !== rule.matchAction) continue;
        if (rule.matchOutcome && event.outcome !== rule.matchOutcome) continue;
        const key = `${rule.id}|${event.id}`;
        if (this.state.alerts.some((alert) => alert.key === key)) continue;
        if (rule.lastFiredAt !== undefined && ts - rule.lastFiredAt < rule.cooldownMs) continue;

        const alert: MonitorAlert = {
          id: this.id("alert"), ruleId: rule.id, eventId: event.id, key,
          message: `${rule.name} : ${rule.text}`.slice(0, 400), ts,
        };
        if (this.state.alerts.length >= MAX_ALERTS) this.state.alerts.splice(0, 1);
        this.state.alerts.push(alert);
        rule.lastFiredAt = ts;
        rule.fires += 1;
        fired += 1;
        this.event(`alert|${key}`, "monitor_alert", alert.message, ts);
      }
    }
    if (pending.length > 0 && all.length > 0) {
      this.state.lastAuditEventId = all[all.length - 1].id;
    }
    this.state.lastAuditIndex = all.length;
    return fired;
  }

  // ---------- validation et calcul des créneaux ----------

  private validateSchedule(input: NewScheduledTask, timezone: string): Partial<ScheduledTask> {
    if (input.kind === "once") {
      const at = Number(input.at);
      if (!Number.isFinite(at) || at <= 0) throw new Error("La date `at` doit être un timestamp valide.");
      return { at };
    }
    if (input.kind === "interval") {
      const everyMs = Number(input.everyMs);
      if (!Number.isInteger(everyMs) || everyMs < MIN_INTERVAL_MS || everyMs > MAX_INTERVAL_MS) {
        throw new Error(`L'intervalle doit être compris entre 1 minute et 30 jours.`);
      }
      return { everyMs };
    }
    const hour = Number(input.hour);
    const minute = Number(input.minute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("L'heure doit être comprise entre 0 et 23.");
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("La minute doit être comprise entre 0 et 59.");
    if (input.kind === "weekly") {
      const weekday = Number(input.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("Le jour doit être compris entre 0 (dimanche) et 6 (samedi).");
      return { hour, minute, weekday };
    }
    // `daily` n'a pas besoin de timezone supplémentaire ici, mais on la valide.
    void timezone;
    return { hour, minute };
  }

  private validateAction(action: ScheduledTask["action"]): ScheduledTask["action"] {
    if (!action || !["reminder", "mission", "agent_dispatch"].includes(action.type)) {
      throw new Error("Type d'action inconnu.");
    }
    const text = typeof action.text === "string" ? action.text.trim().slice(0, 500) : "";
    if (!text) throw new Error("Le texte de l'action est requis.");
    if (action.type !== "reminder") {
      if (typeof action.missionId !== "string" || !action.missionId.trim()) {
        throw new Error("Une mission est requise pour cette action.");
      }
    }
    const maxConcurrency = action.maxConcurrency === undefined
      ? undefined
      : Math.max(1, Math.min(4, Math.floor(Number(action.maxConcurrency) || 1)));
    return {
      type: action.type,
      text,
      ...(action.missionId ? { missionId: action.missionId } : {}),
      ...(maxConcurrency ? { maxConcurrency } : {}),
    };
  }

  private validateMaxRuns(value: number): number {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10_000) {
      throw new Error("maxRuns doit être compris entre 1 et 10000.");
    }
    return parsed;
  }

  private dateTuple(ts: number): [number, number, number] {
    const p = zonedParts(ts, "UTC");
    return [p.year, p.month, p.day];
  }

  private slotFor(task: ScheduledTask, ts: number): string | null {
    if (task.kind === "once") {
      return typeof task.at === "number" && ts >= task.at ? `once|${task.id}|${task.at}` : null;
    }
    if (task.kind === "interval") {
      if (!task.everyMs || ts < task.createdAt) return null;
      const index = Math.floor((ts - task.createdAt) / task.everyMs);
      if (index < 0) return null;
      return `interval|${task.id}|${index}`;
    }
    const local = zonedParts(ts, task.timezone);
    const hour = task.hour ?? 0;
    const minute = task.minute ?? 0;
    if (task.kind === "daily") {
      const target = zonedTimeToUtc(local.year, local.month, local.day, hour, minute, task.timezone);
      if (ts < target) return null;
      return `daily|${task.timezone}|${dateKey(local.year, local.month, local.day)}|${pad(hour)}:${pad(minute)}`;
    }
    // weekly : on vise le jour de la semaine locale en cours (lundi = début).
    const mondayUtc = Date.UTC(local.year, local.month - 1, local.day) - ((local.weekday + 6) % 7) * 86_400_000;
    const targetDate = new Date(mondayUtc + (((task.weekday ?? 0) + 6) % 7) * 86_400_000);
    const y = targetDate.getUTCFullYear();
    const m = targetDate.getUTCMonth() + 1;
    const d = targetDate.getUTCDate();
    const target = zonedTimeToUtc(y, m, d, hour, minute, task.timezone);
    if (ts < target) return null;
    return `weekly|${task.timezone}|${dateKey(y, m, d)}|${pad(hour)}:${pad(minute)}`;
  }

  /** Prochaine occurrence estimée (> from), ou null si la tâche est épuisée. */
  computeNext(task: ScheduledTask, from: number): number | null {
    if (task.maxRuns !== undefined && task.runs >= task.maxRuns) return null;
    if (task.kind === "once") return typeof task.at === "number" && task.at > from ? task.at : null;
    if (task.kind === "interval") {
      if (!task.everyMs) return null;
      const next = task.createdAt + (Math.floor(Math.max(0, from - task.createdAt) / task.everyMs) + 1) * task.everyMs;
      return next;
    }
    const local = zonedParts(from, task.timezone);
    const hour = task.hour ?? 0;
    const minute = task.minute ?? 0;
    if (task.kind === "daily") {
      const today = zonedTimeToUtc(local.year, local.month, local.day, hour, minute, task.timezone);
      if (today > from) return today;
      const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
      return zonedTimeToUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), hour, minute, task.timezone);
    }
    const mondayUtc = Date.UTC(local.year, local.month - 1, local.day) - ((local.weekday + 6) % 7) * 86_400_000;
    const targetDate = new Date(mondayUtc + (((task.weekday ?? 0) + 6) % 7) * 86_400_000);
    const thisWeek = zonedTimeToUtc(
      targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, targetDate.getUTCDate(), hour, minute, task.timezone
    );
    if (thisWeek > from) return thisWeek;
    return thisWeek + 7 * 86_400_000; // approximation honnête : DAYlight saving peut décaler ±1 h
  }

  private event(key: string, kind: SchedulerEventKind, message: string, ts: number, taskId?: string): void {
    if (this.state.events.some((event) => event.key === key)) return;
    const event: SchedulerEvent = { id: this.id("evt"), key, kind, message: message.slice(0, 500), ts, ...(taskId ? { taskId } : {}) };
    if (this.state.events.length >= MAX_EVENTS) this.state.events.splice(0, 1);
    this.state.events.push(event);
  }

  private history(
    taskId: string, slot: string, startedAt: number, finishedAt: number,
    outcome: ScheduleHistoryEntry["outcome"], detail: string
  ): ScheduleHistoryEntry {
    const entry: ScheduleHistoryEntry = {
      id: this.id("hist"), taskId, slot, startedAt, finishedAt, outcome, detail: detail.slice(0, 500),
    };
    if (this.state.history.length >= MAX_HISTORY) this.state.history.splice(0, 1);
    this.state.history.push(entry);
    return entry;
  }

  private requireTask(id: string): ScheduledTask {
    const task = this.getTask(id);
    if (!task) throw new Error(`Tâche planifiée introuvable : ${id}`);
    return task;
  }
}
