/**
 * Types du Scheduler et du Event Monitor — JARVIS 4.0 Phase 5.
 *
 * Tick réel, persistant et déterministe : aucune tâche n'est exécutée « en
 * arrière-plan » de façon invisible. Le serveur appelle explicitement `tick`,
 * chaque exécution est journalisée, dédupliquée et bornée. Les fuseaux
 * horaires IANA sont validés via Intl ; aucun service distant ni cron externe.
 */

export type ScheduleKind = "once" | "interval" | "daily" | "weekly";
export type ScheduledActionType = "reminder" | "mission" | "agent_dispatch";
export type ScheduleOutcome = "success" | "failure" | "skipped" | "blocked";

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  kind: ScheduleKind;
  /** Fuseau IANA (ex. Europe/Paris). Validé par Intl. */
  timezone: string;
  /** `once` : horodatage epoch millisecondes. */
  at?: number;
  /** `interval` : période en millisecondes (min 1 minute). */
  everyMs?: number;
  /** `daily`/`weekly` : heure et minute locales au format 24 h. */
  hour?: number;
  minute?: number;
  /** `weekly` : 0 = dimanche … 6 = samedi, dans le fuseau déclaré. */
  weekday?: number;
  action: {
    type: ScheduledActionType;
    text: string;
    missionId?: string;
    maxConcurrency?: number;
  };
  maxRuns?: number;
  runs: number;
  /** Dernier créneau traité : clé de déduplication persistée. */
  lastSlot?: string;
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Entrée de création : validation stricte dans SchedulerEngine. */
export interface NewScheduledTask {
  name: string;
  description?: string;
  kind: ScheduledTask["kind"];
  timezone?: string;
  at?: number;
  everyMs?: number;
  hour?: number;
  minute?: number;
  weekday?: number;
  action: ScheduledTask["action"];
  maxRuns?: number;
  enabled?: boolean;
}

export type SchedulerEventKind =
  | "task_due"
  | "task_executed"
  | "task_skipped"
  | "task_failed"
  | "stop_blocked"
  | "monitor_alert"
  | "server_restart";

export interface SchedulerEvent {
  id: string;
  /** Clé stable de déduplication. */
  key: string;
  taskId?: string;
  kind: SchedulerEventKind;
  message: string;
  ts: number;
}

export interface ScheduleHistoryEntry {
  id: string;
  taskId: string;
  slot: string;
  startedAt: number;
  finishedAt: number;
  outcome: ScheduleOutcome;
  detail: string;
}

/** Règle de surveillance : corrèle les événements du journal d'audit du Core. */
export interface MonitorRule {
  id: string;
  name: string;
  /** Action d'audit à surveiller (ex. `agent_run_failed`). */
  matchAction: string;
  /** Filtre optionnel sur le résultat (`failure`, `error`, `denied`). */
  matchOutcome?: string;
  text: string;
  enabled: boolean;
  cooldownMs: number;
  lastFiredAt?: number;
  fires: number;
}

export interface MonitorAlert {
  id: string;
  ruleId: string;
  /** Événement d'audit d'origine, jamais transmis hors du Core. */
  eventId: string;
  key: string;
  message: string;
  ts: number;
}

export interface SchedulerState {
  tasks: ScheduledTask[];
  events: SchedulerEvent[];
  history: ScheduleHistoryEntry[];
  rules: MonitorRule[];
  alerts: MonitorAlert[];
  lastTickAt: number;
  tickCount: number;
  /** Curseur d'audit historique, conservé pour compatibilité des états sérialisés. */
  lastAuditIndex: number;
  /**
   * Phase 9.5 : curseur fiable basé sur l'identifiant du dernier événement traité.
   * `audit.list()` renvoie les événements du plus récent au plus ancien : un index
   * numérique ne peut pas suivre les ajouts ni la troncature du journal borné.
   */
  lastAuditEventId?: string;
}

export interface SchedulerTickResult {
  due: number;
  executed: number;
  failed: number;
  skipped: number;
  blocked: number;
  alerts: number;
  changed: boolean;
  ts: number;
}

export interface SchedulerDeps {
  state: SchedulerState;
  audit: {
    record(input: {
      actor: string;
      action: string;
      target?: string;
      outcome?: "success" | "denied" | "failure" | "info";
      severity?: "info" | "warn" | "error";
      detail?: string;
    }): void;
    list(filter?: { limit?: number }): Array<{
      id: string; action: string; outcome?: string; severity?: string; detail?: string; ts: number;
    }>;
    /** Phase 9.5 : lecture chronologique pour un curseur d'audit fiable. */
    listChronological?(limit?: number): Array<{
      id: string; action: string; outcome?: string; severity?: string; detail?: string; ts: number;
    }>;
  };
  now?: () => number;
  id?: (prefix: string) => string;
  isStopped?: () => boolean;
  actionHandler?: ScheduledActionHandler;
}

export type ScheduledActionHandler = (
  task: ScheduledTask,
  context: { slot: string; ts: number; source: string }
) => { ok: boolean; detail: string } | Promise<{ ok: boolean; detail: string }>;

export const DEFAULT_RULES: readonly Omit<MonitorRule, "fires">[] = [
  { id: "rule_agent_failure", name: "Échec d'un run agent", matchAction: "agent_run_failed", text: "Un run multi-agents a échoué.", enabled: true, cooldownMs: 60_000 },
  { id: "rule_mission_failure", name: "Échec de mission", matchAction: "task_failed", text: "Une tâche de mission a échoué.", enabled: true, cooldownMs: 60_000 },
  // Phase 9.5 : action réellement émise par SkillExecutor (auparavant règle morte).
  { id: "rule_skill_failure", name: "Échec de compétence", matchAction: "skill_execution_failed", matchOutcome: "failure", text: "Une exécution de compétence a signalé un échec.", enabled: true, cooldownMs: 60_000 },
  { id: "rule_global_stop", name: "STOP GLOBAL", matchAction: "global_stop_armed", text: "STOP GLOBAL a été activé.", enabled: true, cooldownMs: 60_000 },
];

export function emptySchedulerState(): SchedulerState {
  return {
    tasks: [],
    events: [],
    history: [],
    rules: DEFAULT_RULES.map((rule) => ({ ...rule, fires: 0 })),
    alerts: [],
    lastTickAt: 0,
    tickCount: 0,
    lastAuditIndex: 0,
  };
}

/** Complète un état sérialisé sans jamais supprimer ni réinterpréter les données. */
export function normalizeSchedulerState(value: unknown): SchedulerState {
  const base = emptySchedulerState();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<SchedulerState>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    tasks: Array.isArray(raw.tasks) ? raw.tasks : base.tasks,
    events: Array.isArray(raw.events) ? raw.events : base.events,
    history: Array.isArray(raw.history) ? raw.history : base.history,
    rules: Array.isArray(raw.rules) && raw.rules.length > 0 ? raw.rules : base.rules,
    alerts: Array.isArray(raw.alerts) ? raw.alerts : base.alerts,
    lastTickAt: num(raw.lastTickAt, 0),
    tickCount: num(raw.tickCount, 0),
    lastAuditIndex: num(raw.lastAuditIndex, 0),
    ...(typeof raw.lastAuditEventId === "string" && raw.lastAuditEventId
      ? { lastAuditEventId: raw.lastAuditEventId.slice(0, 120) }
      : {}),
  };
}
