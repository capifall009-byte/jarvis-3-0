/**
 * Types du noyau JARVIS 4.0.
 * Ce fichier est volontairement pur (aucune API DOM/Node) afin d'être partagé
 * entre le client React, le serveur Express et les tests node:test.
 *
 * Phase 3 : les champs `skills`, `skillExecutions` et `stop` sont additifs.
 * `normalizeCoreState()` complète les états Phase 2 sans toucher aux données.
 */

import type { SkillDefinition, SkillExecution } from "./skills/types.ts";
import type { AgentRun } from "./agents/types.ts";
import { emptySchedulerState, normalizeSchedulerState } from "./scheduler/types.ts";
import type { SchedulerState } from "./scheduler/types.ts";
import { emptyToolState, normalizeToolState } from "./tools/types.ts";
import type { ToolState } from "./tools/types.ts";
import { emptyDeviceState, normalizeDeviceState } from "./devices/types.ts";
import type { DeviceState, DeviceStatusView } from "./devices/types.ts";
import { emptyContextMemoryState, normalizeContextMemoryState } from "./memory/types.ts";
import type { ContextMemoryState, ContextMemoryStatusView } from "./memory/types.ts";

/** Phase 9.5 : erreur unique pour toute mutation refusée sous STOP GLOBAL. */
export class CoreStopError extends Error {
  readonly code = "STOP_GLOBAL_ACTIVE" as const;
  constructor(action: string) {
    super(`STOP GLOBAL actif : ${action} refusée jusqu'à reprise explicite.`);
    this.name = "CoreStopError";
  }
}

export type MissionStatus =
  | "planned"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStatus =
  | "pending"
  | "running"
  | "blocked"
  | "in_validation"
  | "done"
  | "failed"
  | "cancelled";

/** Opérations qui ne peuvent jamais être exécutées sans accord explicite. */
export type CoreSensitiveAction =
  | "deploy"
  | "publish"
  | "delete"
  | "payment"
  | "external_message"
  | "modify_secrets"
  | "modify_permissions"
  | "private_data"
  | "filesystem_write"
  | "terminal";

export const SENSITIVE_ACTIONS: readonly CoreSensitiveAction[] = [
  "deploy",
  "publish",
  "delete",
  "payment",
  "external_message",
  "modify_secrets",
  "modify_permissions",
  "private_data",
  "filesystem_write",
  "terminal",
] as const;

export interface CoreTask {
  id: string;
  missionId: string;
  name: string;
  description: string;
  priority: number;
  agent: string;
  skill?: string;
  dependencies: string[];
  status: TaskStatus;
  progress: number;
  result?: string;
  error?: string;
  permission?: CoreSensitiveAction;
  createdAt: number;
  updatedAt: number;
}

export interface Mission {
  id: string;
  goal: string;
  status: MissionStatus;
  tasks: CoreTask[];
  createdAt: number;
  updatedAt: number;
  summary?: string;
  error?: string;
  context: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  ts: number;
  actor: string;
  action: string;
  target?: string;
  outcome: "success" | "denied" | "failure" | "info";
  detail?: string;
  severity: "info" | "warn" | "error";
}

export interface ApprovalRecord {
  approved: boolean;
  decidedAt: number;
}

/** État de STOP GLOBAL (Phase 3) : persistant, prioritaire, levé seulement par resume(). */
export interface CoreStopState {
  active: boolean;
  reason: string;
  requestedAt: number;
}

export interface CoreState {
  version: 1;
  missions: Mission[];
  audit: AuditEvent[];
  approvals: Record<string, ApprovalRecord>;
  /** Phase 3 — compétences déclaratives persistées. */
  skills: SkillDefinition[];
  /** Phase 3 — historique borné des exécutions de compétences. */
  skillExecutions: SkillExecution[];
  /** Phase 3 — STOP GLOBAL actif jusqu'à reprise explicite. */
  stop: CoreStopState;
  /** Phase 4 — exécutions multi-agents, mémoire partagée et messages. */
  agentRuns: AgentRun[];
  /** Phase 5 — planifications, historique, événements et règles de surveillance. */
  scheduler: SchedulerState;
  /** Phase 6 — outils déclaratifs et historique borné des exécutions. */
  tools: ToolState;
  /** Phase 7 — identité locale, préparation et portabilité manuelle (aucune sync). */
  devices: DeviceState;
  /** Phase 8 — mémoire contextuelle locale (court/long terme), additive. */
  contextMemory: ContextMemoryState;
}

export interface Classification {
  complex: boolean;
  confidence: number;
  reason: string;
  signals: string[];
  goal: string;
  suggestedTasks: string[];
}

export interface CoreRequest {
  text: string;
  mode?: string;
  context?: Record<string, unknown>;
}

export interface CoreResponse {
  kind: "simple" | "mission";
  classification: Classification;
  /** true = le pipeline Gemini existant reste responsable de la réponse. */
  delegateToChat: boolean;
  mission?: Mission;
  message: string;
}

export interface PermissionRequest {
  action: CoreSensitiveAction;
  title: string;
  detail?: string;
  target?: string;
  missionId?: string;
  taskId?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  decision: "allow" | "deny" | "requires_approval";
  reason: string;
  approvalId?: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  permission?: CoreSensitiveAction;
  inputSchema?: unknown;
  outputSchema?: unknown;
  limits?: string;
  enabled: boolean;
}

export interface CoreStorageInfo {
  kind: "memory" | "local-file" | "local-storage" | "remote";
  persistent: boolean;
  sharedAcrossDevices: boolean;
  detail: string;
}

export interface CoreStorage {
  readonly info: CoreStorageInfo;
  load(): Promise<CoreState>;
  save(state: CoreState): Promise<void>;
}

/** État public du noyau, exposé par GET /api/core/status. */
export interface CoreStatus {
  identity: { name: string; version: string; creator: string };
  phase: number;
  initialized: boolean;
  storage: CoreStorageInfo;
  missions: Record<string, number> & { total: number };
  auditCount: number;
  approvals: number;
  capabilities: Record<string, boolean>;
  /** Phase 3 — compteurs Skills, sans exposer de définition ni de donnée sensible. */
  skills?: { total: number; active: number; validated: number; draft: number; executions: number };
  /** Phase 3 — STOP GLOBAL actif. */
  stopActive?: boolean;
  /** Phase 4 — agents logiques et exécutions orchestrées. */
  agents?: {
    roles: number;
    runs: number;
    active: number;
    completed: number;
    steps: number;
  };
  /** Phase 5 — scheduler et monitor (compteurs uniquement, aucune donnée sensible). */
  scheduler?: {
    tasks: number;
    enabled: number;
    events: number;
    history: number;
    alerts: number;
    rules: number;
    lastTickAt: number;
    tickCount: number;
  };
  /** Phase 6 — tool registry (compteurs uniquement, aucune entrée ni sortie exposée). */
  tools?: {
    total: number;
    enabled: number;
    builtin: number;
    custom: number;
    executions: number;
    successes: number;
    blocked: number;
    failures: number;
  };
  /** Phase 7 — préparation locale (identité opaque et checklist, aucun secret). */
  devices?: DeviceStatusView;
  /** Phase 8 — mémoire contextuelle (compteurs uniquement, aucun contenu exposé). */
  contextMemory?: ContextMemoryStatusView;
}

export function emptyCoreState(): CoreState {
  return {
    version: 1,
    missions: [],
    audit: [],
    approvals: {},
    skills: [],
    skillExecutions: [],
    stop: { active: false, reason: "", requestedAt: 0 },
    agentRuns: [],
    scheduler: emptySchedulerState(),
    tools: emptyToolState(),
    devices: emptyDeviceState(),
    contextMemory: emptyContextMemoryState(),
  };
}

/**
 * Complète un état sérialisé (Phase 2 ou Phase 3) avec les champs manquants.
 * Aucune donnée existante n'est supprimée, renommée ou réinterprétée.
 */
export function normalizeCoreState(value: unknown): CoreState {
  const base = emptyCoreState();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<CoreState>;
  const stop = raw.stop;
  return {
    version: 1,
    missions: Array.isArray(raw.missions) ? raw.missions : base.missions,
    audit: Array.isArray(raw.audit) ? raw.audit : base.audit,
    approvals:
      raw.approvals && typeof raw.approvals === "object" && !Array.isArray(raw.approvals)
        ? raw.approvals
        : base.approvals,
    skills: Array.isArray(raw.skills) ? raw.skills : base.skills,
    skillExecutions: Array.isArray(raw.skillExecutions) ? raw.skillExecutions : base.skillExecutions,
    stop:
      stop && typeof stop === "object" && typeof stop.active === "boolean"
        ? {
            active: stop.active,
            reason: typeof stop.reason === "string" ? stop.reason : "",
            requestedAt: typeof stop.requestedAt === "number" ? stop.requestedAt : 0,
          }
        : base.stop,
      agentRuns: Array.isArray(raw.agentRuns) ? raw.agentRuns : base.agentRuns,
      scheduler: normalizeSchedulerState(raw.scheduler),
      tools: normalizeToolState(raw.tools),
      devices: normalizeDeviceState(raw.devices),
      contextMemory: normalizeContextMemoryState(raw.contextMemory),
  };
}

export function cloneCoreState(state: CoreState): CoreState {
  return JSON.parse(JSON.stringify(state)) as CoreState;
}
