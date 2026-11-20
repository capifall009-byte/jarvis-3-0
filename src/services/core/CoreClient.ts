/**
 * Client HTTP du Central Intelligence Core.
 * Toutes les routes sont sous /api et héritent de la sécurité existante.
 * Aucun secret n'est manipulé côté client.
 */
import type { AgentDefinition, AgentRun, SharedMemoryEntry } from "../../core/agents/types.ts";
import type {
  MonitorAlert,
  MonitorRule,
  ScheduleHistoryEntry,
  ScheduledTask,
  SchedulerEvent,
  SchedulerTickResult,
} from "../../core/scheduler/types.ts";
import type {
  ToolDefinition,
  ToolExecution,
  ToolResult,
} from "../../core/tools/types.ts";
import type {
  DeviceBundleManifest,
  DeviceExportResult,
  DeviceIdentity,
  DeviceImportRecord,
  DevicePreviewResult,
  DeviceStatusView,
} from "../../core/devices/types.ts";
import type {
  ContextAgentRole,
  ContextBridgeItem,
  ContextDuplicatePair,
  ContextMemoryEntry,
  ContextMemoryStatusView,
  ContextRecallResult,
  RememberInput,
} from "../../core/memory/types.ts";
import type {
  AuditEvent,
  Classification,
  CoreResponse,
  CoreSensitiveAction,
  CoreStatus,
  Mission,
  PermissionDecision,
} from "../../core/types.ts";
import type {
  NewSkillInput,
  SkillDefinition,
  SkillExecution,
  SkillMatch,
  SkillStatus,
  SkillTestResult,
  ValidationResult,
} from "../../core/skills/types.ts";

const BASE = "/api/core";

interface ApiEnvelope<T> {
  ok: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & T;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Erreur Core (HTTP ${response.status}).`);
  }
  return payload;
}

function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return call<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export const coreClient = {
  async getStatus(): Promise<CoreStatus> {
    const data = await call<{ status: CoreStatus }>("/status");
    return data.status;
  },

  async classify(text: string, mode?: string): Promise<Classification> {
    const data = await post<{ classification: Classification }>("/classify", { text, mode });
    return data.classification;
  },

  async handle(text: string, mode?: string): Promise<CoreResponse> {
    const data = await post<{ response: CoreResponse }>("/handle", { text, mode });
    return data.response;
  },

  async listMissions(status?: string): Promise<Mission[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await call<{ missions: Mission[] }>(`/missions${query}`);
    return data.missions;
  },

  async getMission(id: string): Promise<Mission> {
    const data = await call<{ mission: Mission }>(`/missions/${encodeURIComponent(id)}`);
    return data.mission;
  },

  async stopAll(reason = "STOP GLOBAL"): Promise<{ cancelledMissions: number; cancelledTasks: number }> {
    const data = await post<{ result: { cancelledMissions: number; cancelledTasks: number } }>(
      "/stop",
      { reason }
    );
    return data.result;
  },

  async getAudit(limit = 30): Promise<AuditEvent[]> {
    const data = await call<{ audit: AuditEvent[] }>(`/audit?limit=${limit}`);
    return data.audit;
  },

  async checkPermission(action: CoreSensitiveAction, target?: string, title?: string): Promise<PermissionDecision> {
    const data = await post<{ decision: PermissionDecision }>("/permissions/check", {
      action,
      target,
      title,
    });
    return data.decision;
  },

  async approve(action: CoreSensitiveAction, target?: string): Promise<PermissionDecision> {
    const data = await post<{ decision: PermissionDecision }>("/permissions/approve", { action, target });
    return data.decision;
  },

  async deny(action: CoreSensitiveAction, target?: string): Promise<PermissionDecision> {
    const data = await post<{ decision: PermissionDecision }>("/permissions/deny", { action, target });
    return data.decision;
  },

  // ---------- Phase 6 : Tool Registry ----------

  async getTools(): Promise<{ tools: CoreStatus["tools"]; definitions: ToolDefinition[] }> {
    return call<{ tools: CoreStatus["tools"]; definitions: ToolDefinition[] }>("/tools");
  },

  async getToolExecutions(limit = 80): Promise<ToolExecution[]> {
    const data = await call<{ executions: ToolExecution[] }>(`/tools/executions?limit=${limit}`);
    return data.executions;
  },

  async registerTool(input: Record<string, unknown>): Promise<ToolDefinition> {
    const data = await post<{ tool: ToolDefinition }>("/tools", input);
    return data.tool;
  },

  async toggleTool(name: string, enabled: boolean): Promise<ToolDefinition> {
    const data = await post<{ tool: ToolDefinition }>(
      `/tools/${encodeURIComponent(name)}/toggle`, { enabled }
    );
    return data.tool;
  },

  async executeTool(
    name: string,
    input: Record<string, unknown>,
    context: Record<string, unknown> = {}
  ): Promise<ToolResult> {
    const data = await post<{ result: ToolResult }>(
      `/tools/${encodeURIComponent(name)}/execute`, { input, context }
    );
    return data.result;
  },

  // ---------- Phase 7 : préparation multi-appareils locale ----------

  async getDevices(): Promise<{ devices: DeviceStatusView; storage: CoreStatus["storage"] }> {
    return call<{ devices: DeviceStatusView; storage: CoreStatus["storage"] }>("/devices");
  },

  async refreshDeviceReadiness(actor = "user"): Promise<DeviceStatusView> {
    const data = await post<{ devices: DeviceStatusView }>("/devices/readiness", { actor });
    return data.devices;
  },

  async renameDevice(label: string, actor = "user"): Promise<DeviceIdentity> {
    const data = await post<{ device: DeviceIdentity }>("/devices/identity", { label, actor });
    return data.device;
  },

  async exportDeviceBundle(): Promise<DeviceExportResult> {
    return call<DeviceExportResult>("/devices/export");
  },

  async previewDeviceImport(text: string): Promise<DevicePreviewResult> {
    const data = await post<{ preview: DevicePreviewResult }>("/devices/preview", { text });
    return data.preview;
  },

  async applyDeviceImport(
    stagedId: string,
    actor = "user",
    confirm = false
  ): Promise<DeviceImportRecord> {
    const data = await post<{ record: DeviceImportRecord }>("/devices/import", {
      stagedId, actor, confirm,
    });
    return data.record;
  },

  // ---------- Phase 8 : mémoire contextuelle locale ----------

  async getContextMemory(limit = 20): Promise<{
    status: ContextMemoryStatusView;
    entries: ContextMemoryEntry[];
  }> {
    return call<{ status: ContextMemoryStatusView; entries: ContextMemoryEntry[] }>(
      `/context-memory?limit=${limit}`
    );
  },

  async listContextDuplicates(): Promise<ContextDuplicatePair[]> {
    const data = await call<{ duplicates: ContextDuplicatePair[] }>("/context-memory/duplicates");
    return data.duplicates;
  },

  async remember(input: RememberInput): Promise<ContextMemoryEntry> {
    const data = await post<{ entry: ContextMemoryEntry }>("/context-memory/remember", input as unknown as Record<string, unknown>);
    return data.entry;
  },

  async recallContext(options: {
    query: string;
    limit?: number;
    scope?: "short" | "long";
    kinds?: ContextMemoryEntry["kind"][];
  }): Promise<ContextRecallResult> {
    const data = await post<{ result: ContextRecallResult }>("/context-memory/recall", options as unknown as Record<string, unknown>);
    return data.result;
  },

  async shareContext(agent: ContextAgentRole, query: string, limit = 5) {
    const data = await post<{ context: unknown }>("/context-memory/share", { agent, query, limit });
    return data.context;
  },

  async consolidateContextMemory(): Promise<{ promoted: number; pruned: number }> {
    const data = await post<{ result: { promoted: number; pruned: number } }>("/context-memory/consolidate", {});
    return data.result;
  },

  async reviewContextDuplicate(id: string): Promise<ContextDuplicatePair> {
    const data = await post<{ pair: ContextDuplicatePair }>(`/context-memory/duplicates/${encodeURIComponent(id)}/review`, {});
    return data.pair;
  },

  async bridgeMemories(items: ContextBridgeItem[], confirm = false): Promise<{ accepted: number; skipped: number }> {
    const data = await post<{ result: { accepted: number; skipped: number } }>(
      "/context-memory/bridge/memories", { items, confirm }
    );
    return data.result;
  },

  async bridgeConversationExcerpts(items: ContextBridgeItem[], confirm = false): Promise<{ accepted: number; skipped: number }> {
    const data = await post<{ result: { accepted: number; skipped: number } }>(
      "/context-memory/bridge/conversations", { items, confirm }
    );
    return data.result;
  },

  // ---------- Phase 5 : Scheduler et Event Monitor ----------

  async getScheduler(): Promise<{ scheduler: CoreStatus["scheduler"]; rules: MonitorRule[] }> {
    return call<{ scheduler: CoreStatus["scheduler"]; rules: MonitorRule[] }>("/scheduler");
  },

  async getScheduledTasks(): Promise<ScheduledTask[]> {
    const data = await call<{ tasks: ScheduledTask[] }>("/scheduler/tasks");
    return data.tasks;
  },

  async createScheduledTask(input: Record<string, unknown>): Promise<ScheduledTask> {
    const data = await post<{ task: ScheduledTask }>("/scheduler/tasks", input);
    return data.task;
  },

  async updateScheduledTask(id: string, patch: Record<string, unknown>): Promise<ScheduledTask> {
    const data = await post<{ task: ScheduledTask }>(`/scheduler/tasks/${encodeURIComponent(id)}/update`, patch);
    return data.task;
  },

  async removeScheduledTask(id: string): Promise<{ removed: boolean; id: string }> {
    const data = await post<{ result: { removed: boolean; id: string } }>(
      `/scheduler/tasks/${encodeURIComponent(id)}/remove`, {}
    );
    return data.result;
  },

  async triggerScheduledTask(id: string, source = "user"): Promise<ScheduleHistoryEntry> {
    const data = await post<{ entry: ScheduleHistoryEntry }>(
      `/scheduler/tasks/${encodeURIComponent(id)}/trigger`, { source }
    );
    return data.entry;
  },

  async schedulerTick(source = "ui"): Promise<SchedulerTickResult> {
    const data = await post<{ result: SchedulerTickResult }>("/scheduler/tick", { source });
    return data.result;
  },

  async getSchedulerEvents(limit = 80): Promise<SchedulerEvent[]> {
    const data = await call<{ events: SchedulerEvent[] }>(`/scheduler/events?limit=${limit}`);
    return data.events;
  },

  async getSchedulerHistory(limit = 80): Promise<ScheduleHistoryEntry[]> {
    const data = await call<{ history: ScheduleHistoryEntry[] }>(`/scheduler/history?limit=${limit}`);
    return data.history;
  },

  async getSchedulerRules(): Promise<MonitorRule[]> {
    const data = await call<{ rules: MonitorRule[] }>("/scheduler/rules");
    return data.rules;
  },

  async getSchedulerAlerts(limit = 80): Promise<MonitorAlert[]> {
    const data = await call<{ alerts: MonitorAlert[] }>(`/scheduler/alerts?limit=${limit}`);
    return data.alerts;
  },

  // ---------- Phase 4 : système multi-agents ----------

  async getAgents(): Promise<AgentDefinition[]> {
    const data = await call<{ agents: AgentDefinition[] }>("/agents");
    return data.agents;
  },

  async getAgentRuns(status?: string): Promise<AgentRun[]> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await call<{ runs: AgentRun[] }>(`/agents/runs${suffix}`);
    return data.runs;
  },

  async getAgentRun(id: string): Promise<AgentRun> {
    const data = await call<{ run: AgentRun }>(`/agents/runs/${encodeURIComponent(id)}`);
    return data.run;
  },

  async getAgentMemory(id: string): Promise<SharedMemoryEntry[]> {
    const data = await call<{ memory: SharedMemoryEntry[] }>(`/agents/runs/${encodeURIComponent(id)}/memory`);
    return data.memory;
  },

  async createAgentRun(missionId: string, options: Record<string, unknown> = {}): Promise<AgentRun> {
    const data = await post<{ run: AgentRun }>("/agents/runs", { missionId, options });
    return data.run;
  },

  async runAgents(runId: string): Promise<AgentRun> {
    const data = await post<{ run: AgentRun }>(`/agents/runs/${encodeURIComponent(runId)}/run`, {});
    return data.run;
  },

  async dispatchMission(missionId: string, options: Record<string, unknown> = {}): Promise<AgentRun> {
    const data = await post<{ run: AgentRun }>("/agents/dispatch", { missionId, options });
    return data.run;
  },

  async validateAgentStep(
    runId: string,
    stepId: string,
    decision: "approve" | "reject" = "approve"
  ): Promise<AgentRun> {
    const data = await post<{ run: AgentRun }>(
      `/agents/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/validate`,
      { decision }
    );
    return data.run;
  },

  // ---------- Phase 3 : Skills dynamiques ----------

  async getSkills(filter: {
    category?: string;
    tag?: string;
    status?: SkillStatus;
    search?: string;
    enabled?: boolean;
  } = {}): Promise<SkillDefinition[]> {
    const query = new URLSearchParams();
    if (filter.category) query.set("category", filter.category);
    if (filter.tag) query.set("tag", filter.tag);
    if (filter.status) query.set("status", filter.status);
    if (filter.search) query.set("search", filter.search);
    if (filter.enabled !== undefined) query.set("enabled", String(filter.enabled));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const data = await call<{ skills: SkillDefinition[] }>(`/skills${suffix}`);
    return data.skills;
  },

  async getSkill(id: string): Promise<SkillDefinition> {
    const data = await call<{ skill: SkillDefinition }>(`/skills/${encodeURIComponent(id)}`);
    return data.skill;
  },

  async getSkillCategories(): Promise<Array<{ name: string; count: number }>> {
    const data = await call<{ categories: Array<{ name: string; count: number }> }>("/skills/categories");
    return data.categories;
  },

  async validateSkill(input: unknown): Promise<ValidationResult> {
    const data = await post<{ validation: ValidationResult }>("/skills/validate", { ...(input as Record<string, unknown>) });
    return data.validation;
  },

  async createSkill(input: NewSkillInput): Promise<SkillDefinition> {
    const data = await post<{ skill: SkillDefinition }>("/skills", input as unknown as Record<string, unknown>);
    return data.skill;
  },

  async updateSkill(id: string, patch: Partial<NewSkillInput>): Promise<SkillDefinition> {
    const data = await call<{ skill: SkillDefinition }>(`/skills/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    return data.skill;
  },

  async deleteSkill(id: string): Promise<boolean> {
    const data = await call<{ deleted: boolean }>(`/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
    return data.deleted;
  },

  async testSkill(id: string): Promise<SkillTestResult> {
    const data = await post<{ test: SkillTestResult }>(`/skills/${encodeURIComponent(id)}/test`, {});
    return data.test;
  },

  async enableSkill(id: string): Promise<SkillDefinition> {
    const data = await post<{ skill: SkillDefinition }>(`/skills/${encodeURIComponent(id)}/enable`, {});
    return data.skill;
  },

  async disableSkill(id: string, reason?: string): Promise<SkillDefinition> {
    const data = await post<{ skill: SkillDefinition }>(`/skills/${encodeURIComponent(id)}/disable`, { reason });
    return data.skill;
  },

  async executeSkill(
    id: string,
    input: Record<string, string | number | boolean> = {},
    goal?: string
  ): Promise<{ execution: SkillExecution; output?: string }> {
    return post<{ execution: SkillExecution; output?: string }>(`/skills/${encodeURIComponent(id)}/execute`, {
      input,
      ...(goal ? { goal } : {}),
    });
  },

  async getSkillExecutions(filter: { skillId?: string; limit?: number } = {}): Promise<SkillExecution[]> {
    const query = new URLSearchParams();
    if (filter.skillId) query.set("skillId", filter.skillId);
    if (filter.limit) query.set("limit", String(filter.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const data = await call<{ executions: SkillExecution[] }>(`/skills/executions${suffix}`);
    return data.executions;
  },

  async matchSkills(goal: string, limit = 3): Promise<SkillMatch[]> {
    const query = new URLSearchParams({ goal, limit: String(limit) });
    const data = await call<{ matches: SkillMatch[] }>(`/skills/matches?${query.toString()}`);
    return data.matches;
  },

  async resumeCore(reason = "Reprise explicite"): Promise<{ resumed: boolean; reason: string }> {
    const data = await post<{ result: { resumed: boolean; reason: string } }>("/resume", { reason });
    return data.result;
  },
};
