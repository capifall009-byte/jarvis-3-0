/**
 * Central Intelligence Core — JARVIS 4.0.
 *
 * Point de décision unique, indépendant de tout fournisseur IA.
 * - Les demandes simples sont déléguées au pipeline Gemini existant.
 * - Les missions complexes sont classées, planifiées et suivies ici.
 * - Phases 3 à 6 : Skills, agents, scheduler et outils déclaratifs.
 * - Phase 7 : identité locale et portabilité manuelle, SANS synchronisation.
 * STOP GLOBAL reste prioritaire sur tous les modules, y compris les Skills.
 */

import { AgentOrchestrator } from "./agents/AgentOrchestrator.ts";
import type { AgentRunOptions, AgentToolInvoker } from "./agents/types.ts";
import { SchedulerEngine } from "./scheduler/SchedulerEngine.ts";
import type { NewScheduledTask, SchedulerTickResult } from "./scheduler/types.ts";
import { ToolRegistry } from "./tools/ToolRegistry.ts";
import { BUILTIN_TOOLS, renderToolTemplate } from "./tools/builtins.ts";
import type { NewToolDefinition, ToolContext, ToolInvoker, ToolResult } from "./tools/types.ts";
import { DeviceManager } from "./devices/DeviceManager.ts";
import type {
  DeviceExportResult,
  DeviceIdentity,
  DeviceImportRecord,
  DevicePreviewResult,
  DeviceStatusView,
} from "./devices/types.ts";
import { ContextMemory } from "./memory/ContextMemory.ts";
import { ContextMemoryGateway } from "./memory/ContextMemoryGateway.ts";
import type { RecallOptions } from "./memory/ContextMemory.ts";
import { CONTEXT_AGENT_ROLES } from "./memory/types.ts";
import type {
  ContextAgentRole,
  ContextBridgeItem,
  ContextDuplicatePair,
  ContextMemoryEntry,
  ContextMemoryStatusView,
  ContextRecallResult,
  RememberInput,
} from "./memory/types.ts";
import { AuditLog } from "./AuditLog.ts";
import { CognitiveEngine } from "./CognitiveEngine.ts";
import { MissionEngine } from "./MissionEngine.ts";
import type { MissionTaskInput } from "./MissionEngine.ts";
import { NoopMemoryGateway } from "./MemoryGateway.ts";
import type { MemoryGateway } from "./MemoryGateway.ts";
import { PermissionManager, permissionKey } from "./PermissionManager.ts";
import { SkillExecutor } from "./skills/SkillExecutor.ts";
import type { SkillExecutionResult } from "./skills/SkillExecutor.ts";
import { SkillRegistry, SkillRegistryError } from "./skills/SkillRegistry.ts";
import type { SkillFilter } from "./skills/SkillRegistry.ts";
import { SkillStorage } from "./skills/SkillStorage.ts";
import { CoreStopError, SENSITIVE_ACTIONS, cloneCoreState, emptyCoreState, normalizeCoreState } from "./types.ts";
import type {
  NewSkillInput,
  SkillDefinition,
  SkillExecution,
  SkillMatch,
  SkillTestResult,
  ValidationResult,
} from "./skills/types.ts";
import type {
  Classification,
  CoreRequest,
  CoreResponse,
  CoreSensitiveAction,
  CoreState,
  CoreStatus,
  CoreStorage,
  PermissionRequest,
} from "./types.ts";

export type { CoreStatus } from "./types.ts";

export interface JarvisCoreDeps {
  storage: CoreStorage;
  memory?: MemoryGateway;
  now?: () => number;
  id?: (prefix: string) => string;
  /** Phase 6 : injectera le Tool Registry. Aucun accès direct depuis les agents. */
  toolInvoker?: AgentToolInvoker;
}

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class JarvisCore {
  readonly identity = {
    name: "JARVIS",
    version: "4.0",
    creator: "Abdourahmane Fall (Capzo)",
  };

  private readonly storage: CoreStorage;
  private memory: MemoryGateway;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly cognitive: CognitiveEngine;

  private state: CoreState = emptyCoreState();
  private audit!: AuditLog;
  private missionsEngine!: MissionEngine;
  private permissions!: PermissionManager;
  private skillStorage!: SkillStorage;
  private skillExecutor!: SkillExecutor;
  private skills!: SkillRegistry;
  private agents!: AgentOrchestrator;
  private scheduler!: SchedulerEngine;
  private tools!: ToolRegistry;
  private devices!: DeviceManager;
  private contextMemoryEngine!: ContextMemory;
  private readonly toolInvoker?: AgentToolInvoker;
  private initialized = false;

  constructor(deps: JarvisCoreDeps) {
    this.storage = deps.storage;
    this.memory = deps.memory ?? new NoopMemoryGateway();
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
    this.toolInvoker = deps.toolInvoker;
    this.cognitive = new CognitiveEngine();
  }

  async init(): Promise<void> {
    const loaded = await this.storage.load();
    // Complète les états Phase 2 sans toucher aux conversations, mémoires ou missions.
    this.state = normalizeCoreState(loaded);

    this.audit = new AuditLog({ state: this.state, now: this.now, id: this.id });
    this.permissions = new PermissionManager({ state: this.state, audit: this.audit, now: this.now });
    this.missionsEngine = new MissionEngine({
      state: this.state,
      audit: this.audit,
      now: this.now,
      id: this.id,
    });
    this.skillStorage = new SkillStorage(this.state);
    this.skillExecutor = new SkillExecutor({
      audit: this.audit,
      permissions: this.permissions,
      storage: this.skillStorage,
      now: this.now,
      id: this.id,
      isStopped: () => this.state.stop.active,
    });
    this.skills = new SkillRegistry({
      state: this.state,
      storage: this.skillStorage,
      executor: this.skillExecutor,
      audit: this.audit,
      now: this.now,
      id: this.id,
    });
    // Phase 6 : le registre est la seule porte d'entrée des outils. Les
    // gestionnaires sont injectés ici par le Core, jamais par un agent.
    this.tools = new ToolRegistry({
      state: this.state.tools,
      audit: this.audit,
      permissions: this.permissions,
      invokers: this.buildToolInvokers(),
      now: this.now,
      id: this.id,
      isStopped: () => this.state.stop.active,
    });
    for (const definition of BUILTIN_TOOLS) this.tools.registerBuiltin(definition);

    this.agents = new AgentOrchestrator({
      state: this.state,
      audit: this.audit,
      permissions: this.permissions,
      now: this.now,
      id: this.id,
      isStopped: () => this.state.stop.active,
      skillInvoker: (skillId, input, context) => {
        const result = this.skills.execute(skillId, input, {
          actor: `agent:${context.agent}`,
          goal: context.goal,
          missionId: context.missionId,
        });
        return {
          status: result.execution.status,
          ...(result.output ? { output: result.output } : {}),
          ...(result.execution.error ? { error: result.execution.error } : {}),
        };
      },
      toolInvoker: this.toolInvoker
        ? (name, input, context) => this.toolInvoker!(name, input, context)
        : (name, input, context) => this.tools.executeForAgent(name, input, {
            missionId: context.missionId,
            agent: context.agent,
          }),
    });

    this.scheduler = new SchedulerEngine({
      state: this.state.scheduler,
      audit: this.audit,
      now: this.now,
      id: this.id,
      isStopped: () => this.state.stop.active,
      actionHandler: async (task) => {
        if (this.state.stop.active) return { ok: false, detail: "STOP GLOBAL actif : action refusée." };
        if (task.action.type === "reminder") {
          return { ok: true, detail: task.action.text };
        }
        const missionId = task.action.missionId ?? "";
        const mission = this.missionsEngine.getMission(missionId);
        if (!mission) return { ok: false, detail: `Mission introuvable : ${missionId}` };
        if (["completed", "cancelled"].includes(mission.status)) {
          return { ok: false, detail: `Mission déjà ${mission.status}.` };
        }
        if (task.action.type === "agent_dispatch") {
          const run = await this.dispatchMission(mission.id, {
            maxConcurrency: task.action.maxConcurrency ?? 2,
          });
          const okRun = ["completed", "paused", "awaiting_validation"].includes(run.status);
          return okRun
            ? { ok: true, detail: `Run agent ${run.id} : ${run.status}.` }
            : { ok: false, detail: `Run agent ${run.id} : ${run.status} — ${run.error ?? ""}`.slice(0, 400) };
        }
        const started = this.missionsEngine.startMission(mission.id);
        await this.persist();
        return { ok: true, detail: `Mission ${started.id} démarrée.` };
      },
    });

    // Phase 7 : identité locale stable et préparation, sans compte ni réseau.
    this.devices = new DeviceManager({
      state: this.state,
      storage: this.storage.info,
      audit: this.audit,
      now: this.now,
      id: this.id,
      isStopped: () => this.state.stop.active,
    });

    // Phase 8 : mémoire contextuelle locale. En production, c'est elle qui
    // alimente la passerelle `MemoryGateway` (plus de Noop), sans toucher aux
    // dépôts de mémoire/conversations de l'utilisateur.
    this.contextMemoryEngine = new ContextMemory({
      state: this.state.contextMemory,
      audit: this.audit,
      now: this.now,
      id: this.id,
      isStopped: () => this.state.stop.active,
    });
    if (this.memory instanceof NoopMemoryGateway) {
      this.memory = new ContextMemoryGateway(this.contextMemoryEngine);
    }

    const recovered = this.missionsEngine.recoverInterrupted();
    const recoveredAgents = this.agents.recoverInterrupted();
    this.audit.record({
      actor: "core",
      action: "core_initialized",
      outcome: "info",
      detail: `storage=${this.storage.info.kind}; device=${this.state.devices.device.id}; contexte=${this.state.contextMemory.entries.length} souvenir(s); reprise=${recovered.missions} mission(s), ${recovered.tasks} tâche(s), ${recoveredAgents.runs} run(s) agent(s), ${this.state.scheduler.tasks.length} tâche(s) planifiée(s), ${this.state.tools.tools.length} outil(s) déclaré(s).`,
    });
    await this.persist();
    this.initialized = true;
  }

  /** Expose une copie de l'état (utilisé par les tests / diagnostics). */
  snapshot(): CoreState {
    return cloneCoreState(this.state);
  }

  classify(request: CoreRequest): Classification {
    this.ensureReady();
    return this.cognitive.classify(request);
  }

  /**
   * Point d'entrée principal. Le Core ne prend le contrôle QUE pour les
   * missions complexes ; sinon le pipeline Gemini existant est conservé.
   */
  async handle(request: CoreRequest): Promise<CoreResponse> {
    this.ensureReady();
    const classification = this.cognitive.classify(request);

    if (!classification.complex) {
      // Phase 9.5 : sous STOP, la classification reste disponible mais n'écrit rien.
      if (!this.state.stop.active) {
        this.audit.record({
          actor: "user",
          action: "classify_simple",
          outcome: "info",
          detail: classification.reason,
        });
        await this.persist();
      }
      return {
        kind: "simple",
        classification,
        delegateToChat: true,
        message: "Demande simple : traitée par le pipeline Gemini existant, sans mission.",
      };
    }

    // Phase 9.5 : une demande complexe crée une mission : mutation interdite sous STOP.
    this.assertMutationAllowed("création de mission depuis une demande complexe");

    const sensitive = this.extractSensitiveActions(classification);
    const inputs: MissionTaskInput[] = classification.suggestedTasks.map((name, index) => {
      const isApprovalTask = name.toLowerCase().includes("autorisation explicite");
      return {
        name,
        description: name,
        agent: index === 0 ? "research" : index === 1 ? "chief" : "developer",
        ...(isApprovalTask && sensitive.length > 0 ? { permission: sensitive[0] } : {}),
        dependsOn: index === 0 ? [] : [index - 1],
      };
    });

    const mission = this.missionsEngine.createMission(classification.goal, inputs, {
      ...(request.context ?? {}),
      mode: request.mode ?? "autonome",
      signals: classification.signals,
      source: "core.handle",
    });

    // Phase 3 : le Core sélectionne une Skill active pertinente, sans l'exécuter.
    const selectedSkill = this.skills.match(classification.goal, 1)[0];
    if (selectedSkill && mission.tasks.length > 0) {
      mission.tasks[0].skill = selectedSkill.skillId;
      mission.context.selectedSkill = {
        id: selectedSkill.skillId,
        name: selectedSkill.name,
        version: selectedSkill.version,
        score: selectedSkill.score,
      };
      this.audit.record({
        actor: "core",
        action: "skill_selected_for_mission",
        target: selectedSkill.skillId,
        outcome: "success",
        detail: `Mission ${mission.id} · score ${selectedSkill.score.toFixed(2)} · ${selectedSkill.reason}`,
      });
    }

    this.missionsEngine.startMission(mission.id);
    this.audit.record({
      actor: "core",
      action: "mission_dispatched",
      target: mission.id,
      outcome: "success",
      detail: `Classification complexe (score ${classification.confidence.toFixed(2)}).`,
    });
    await this.persist();

    return {
      kind: "mission",
      classification,
      delegateToChat: false,
      mission,
      message: `Mission ${mission.id} créée et planifiée (${mission.tasks.length} tâches). Le Main Agent peut la répartir via le système multi-agents.`,
    };
  }

  getStatus(): CoreStatus {
    this.ensureReady();
    const counts: Record<string, number> = {
      planned: 0, running: 0, paused: 0, completed: 0, failed: 0, cancelled: 0,
    };
    for (const mission of this.state.missions) counts[mission.status] = (counts[mission.status] ?? 0) + 1;
    return {
      identity: this.identity,
      phase: 8,
      initialized: this.initialized,
      storage: this.storage.info,
      missions: { ...counts, total: this.state.missions.length },
      auditCount: this.state.audit.length,
      approvals: Object.keys(this.state.approvals).length,
      skills: {
        total: this.state.skills.length,
        active: this.state.skills.filter((s) => s.status === "active" && s.enabled).length,
        validated: this.state.skills.filter((s) => s.status === "validated").length,
        draft: this.state.skills.filter((s) => s.status === "draft").length,
        executions: this.state.skillExecutions.length,
      },
      stopActive: this.state.stop.active,
      agents: {
        roles: this.agents.listRoles().length,
        runs: this.state.agentRuns.length,
        active: this.state.agentRuns.filter((r) => ["running", "planned", "paused", "awaiting_validation"].includes(r.status)).length,
        completed: this.state.agentRuns.filter((r) => r.status === "completed").length,
        steps: this.state.agentRuns.reduce((sum, r) => sum + r.steps.length, 0),
      },
      scheduler: {
        tasks: this.state.scheduler.tasks.length,
        enabled: this.state.scheduler.tasks.filter((task) => task.enabled).length,
        events: this.state.scheduler.events.length,
        history: this.state.scheduler.history.length,
        alerts: this.state.scheduler.alerts.length,
        rules: this.state.scheduler.rules.length,
        lastTickAt: this.state.scheduler.lastTickAt,
        tickCount: this.state.scheduler.tickCount,
      },
      tools: {
        total: this.state.tools.tools.length,
        enabled: this.state.tools.tools.filter((tool) => tool.enabled).length,
        builtin: this.state.tools.tools.filter((tool) => tool.builtin).length,
        custom: this.state.tools.tools.filter((tool) => !tool.builtin).length,
        executions: this.state.tools.executions.length,
        successes: this.state.tools.executions.filter((entry) => entry.outcome === "success").length,
        blocked: this.state.tools.executions.filter((entry) => entry.outcome === "blocked").length,
        failures: this.state.tools.executions.filter((entry) => entry.outcome === "failure").length,
      },
      devices: this.devices.view(),
      contextMemory: this.contextMemoryEngine.status(),
      capabilities: {
        classification: true,
        missionPlanning: true,
        stopGlobal: true,
        audit: true,
        permissions: true,
        memoryGateway: !(this.memory instanceof NoopMemoryGateway),
        // Phases 3 à 8 livrées et testées localement ; les autres restent fausses.
        dynamicSkills: true,
        agentExecution: true,
        scheduler: true,
        toolRegistry: true,
        devicePreparation: true,
        contextMemory: true,
        // Phase 7 ne prépare que la portabilité manuelle : aucune synchronisation.
        multiDeviceSync: false,
      },
    };
  }

  listMissions(status?: CoreState["missions"][number]["status"]) {
    this.ensureReady();
    return this.missionsEngine.listMissions(status);
  }

  getMission(id: string) {
    this.ensureReady();
    return this.missionsEngine.getMission(id);
  }

  async createMission(goal: string, tasks: MissionTaskInput[] = [], context: Record<string, unknown> = {}) {
    this.assertMutationAllowed("création de mission");
    const mission = this.missionsEngine.createMission(goal, tasks, context);
    await this.persist();
    return mission;
  }

  async startMission(id: string) {
    this.assertMutationAllowed("démarrage de mission");
    const mission = this.missionsEngine.startMission(id);
    await this.persist();
    return mission;
  }

  async pauseMission(id: string, reason?: string) {
    this.assertMutationAllowed("mise en pause de mission");
    const mission = this.missionsEngine.pauseMission(id, reason);
    await this.persist();
    return mission;
  }

  async resumeMission(id: string) {
    this.assertMutationAllowed("reprise de mission");
    const mission = this.missionsEngine.resumeMission(id);
    await this.persist();
    return mission;
  }

  async cancelMission(id: string, reason?: string) {
    this.assertMutationAllowed("annulation de mission");
    const mission = this.missionsEngine.cancelMission(id, reason);
    await this.persist();
    return mission;
  }

  async completeTask(missionId: string, taskId: string, result?: string) {
    this.assertMutationAllowed("complétion de tâche");
    const mission = this.missionsEngine.completeTask(missionId, taskId, result);
    await this.persist();
    return mission;
  }

  async failTask(missionId: string, taskId: string, error?: string) {
    this.assertMutationAllowed("échec de tâche");
    const mission = this.missionsEngine.failTask(missionId, taskId, error);
    await this.persist();
    return mission;
  }

  async updateProgress(missionId: string, taskId: string, progress: number) {
    this.assertMutationAllowed("mise à jour de progression");
    const task = this.missionsEngine.updateProgress(missionId, taskId, progress);
    await this.persist();
    return task;
  }

  /** STOP GLOBAL : interrompt missions, tâches et compétences, de façon persistante. */
  async stopAll(reason = "STOP GLOBAL") {
    this.ensureReady();
    const result = this.missionsEngine.stopAll(reason);
    const agentResult = this.agents.stopAll(reason);
    this.scheduler.stopAll(reason);
    const wasActive = this.state.stop.active;
    this.state.stop = {
      active: true,
      reason,
      requestedAt: this.now(),
    };
    if (!wasActive) {
      this.audit.record({
        actor: "user",
        action: "global_stop_armed",
        outcome: "info",
        severity: "warn",
        detail: `${reason} — ${agentResult.runs} run(s) agent(s) annulé(s) ; Skills, agents, outils, planifications, portabilité locale et mémoire contextuelle bloqués jusqu'à reprise explicite.`,
      });
    }
    await this.persist();
    return result;
  }

  /** STOP GLOBAL actif : prioritaire sur tous les modules, même après redémarrage. */
  isStopped(): boolean {
    this.ensureReady();
    return this.state.stop.active;
  }

  /** Lève explicitement STOP GLOBAL. Ne reprend aucune mission automatiquement. */
  async resume(reason = "Reprise explicite") {
    this.ensureReady();
    if (!this.state.stop.active) {
      return { resumed: false, reason: "STOP GLOBAL n'était pas actif." };
    }
    this.state.stop = { active: false, reason: "", requestedAt: 0 };
    this.audit.record({
      actor: "user",
      action: "core_resumed",
      outcome: "success",
      detail: `${reason} — missions restant en pause, à reprendre individuellement.`,
    });
    await this.persist();
    return { resumed: true, reason };
  }

  // ---------- Phase 3 : Skills déclaratives ----------

  listSkills(filter: SkillFilter = {}): SkillDefinition[] {
    this.ensureReady();
    return this.skills.list(filter);
  }

  getSkill(id: string): SkillDefinition | undefined {
    this.ensureReady();
    return this.skills.get(id);
  }

  listSkillCategories(): Array<{ name: string; count: number }> {
    this.ensureReady();
    return this.skills.categories();
  }

  validateSkill(input: unknown): ValidationResult {
    this.ensureReady();
    return this.skills.validate(input);
  }

  async createSkill(input: NewSkillInput, actor = "user"): Promise<SkillDefinition> {
    this.assertMutationAllowed("création de compétence");
    const skill = this.skills.create(input, actor);
    await this.persist();
    return skill;
  }

  async updateSkill(id: string, patch: Partial<NewSkillInput>, actor = "user", note?: string): Promise<SkillDefinition> {
    this.assertMutationAllowed("modification de compétence");
    const skill = this.skills.update(id, patch, actor, note);
    await this.persist();
    return skill;
  }

  async deleteSkill(id: string, actor = "user"): Promise<boolean> {
    this.assertMutationAllowed("suppression de compétence");
    const result = this.skills.remove(id, actor);
    await this.persist();
    return result;
  }

  async enableSkill(id: string, actor = "user"): Promise<SkillDefinition> {
    this.assertMutationAllowed("activation de compétence");
    const skill = this.skills.enable(id, actor);
    await this.persist();
    return skill;
  }

  async disableSkill(id: string, actor = "user", reason?: string): Promise<SkillDefinition> {
    this.assertMutationAllowed("désactivation de compétence");
    const skill = this.skills.disable(id, actor, reason);
    await this.persist();
    return skill;
  }

  async testSkill(id: string, actor = "user"): Promise<SkillTestResult> {
    this.assertMutationAllowed("test de compétence");
    const result = this.skills.test(id, actor);
    await this.persist();
    return result;
  }

  async executeSkill(
    id: string,
    input: Record<string, unknown> = {},
    options: { actor?: string; goal?: string; missionId?: string } = {}
  ): Promise<SkillExecutionResult> {
    // SkillExecutor vérifie STOP avant chaque étape et renvoie un statut `blocked`.
    this.ensureReady();
    const result = this.skills.execute(id, input, options);
    await this.persist();
    return result;
  }

  listSkillExecutions(filter: Parameters<SkillRegistry["listExecutions"]>[0] = {}): SkillExecution[] {
    this.ensureReady();
    return this.skills.listExecutions(filter);
  }

  matchSkill(goal: string, limit = 3): SkillMatch[] {
    this.ensureReady();
    return this.skills.match(goal, limit);
  }

  // ---------- Phase 4 : système multi-agents ----------

  listAgents() {
    this.ensureReady();
    return this.agents.listRoles();
  }

  listAgentRuns(status?: Parameters<AgentOrchestrator["listRuns"]>[0]) {
    this.ensureReady();
    return this.agents.listRuns(status);
  }

  getAgentRun(id: string) {
    this.ensureReady();
    return this.agents.getRun(id);
  }

  /** Le Main Agent répartit une mission existante entre les agents logiques. */
  async createAgentRun(missionId: string, options: AgentRunOptions = {}) {
    // Les runs créés sous STOP sont annulés par AgentOrchestrator.run().
    this.ensureReady();
    const mission = this.missionsEngine.getMission(missionId);
    if (!mission) throw new Error(`Mission introuvable : ${missionId}`);
    const run = this.agents.createRun(mission, options);
    await this.persist();
    return run;
  }

  /** Exécute le run (concurrence bornée, retries limités, STOP prioritaire). */
  async runAgents(runId: string) {
    // AgentOrchestrator.run() annule tout run sous STOP et le signale.
    this.ensureReady();
    const run = await this.agents.run(runId);
    await this.persist();
    return run;
  }

  /** Crée un run pour une mission puis l'exécute en une seule opération. */
  async dispatchMission(missionId: string, options: AgentRunOptions = {}) {
    // Le run est créé puis immédiatement annulé par l'orchestrateur sous STOP.
    this.ensureReady();
    const run = await this.createAgentRun(missionId, options);
    return this.runAgents(run.id);
  }

  async validateAgentStep(runId: string, stepId: string, decision: "approve" | "reject", actor = "user") {
    this.assertMutationAllowed("validation d'étape agent");
    const run = this.agents.validateStep(runId, stepId, decision, actor);
    await this.persist();
    return run;
  }

  listAgentMemory(runId: string) {
    this.ensureReady();
    const run = this.agents.getRun(runId);
    return run ? run.memory.slice().sort((a, b) => b.ts - a.ts) : [];
  }

  // ---------- Phase 5 : Scheduler et Event Monitor ----------

  listScheduledTasks() {
    this.ensureReady();
    return this.scheduler.listTasks();
  }

  getScheduledTask(id: string) {
    this.ensureReady();
    return this.scheduler.getTask(id);
  }

  async createScheduledTask(input: NewScheduledTask) {
    this.assertMutationAllowed("création de tâche planifiée");
    const task = this.scheduler.createTask(input);
    await this.persist();
    return task;
  }

  async updateScheduledTask(id: string, patch: Parameters<SchedulerEngine["updateTask"]>[1]) {
    this.assertMutationAllowed("modification de tâche planifiée");
    const task = this.scheduler.updateTask(id, patch);
    await this.persist();
    return task;
  }

  /** Phase 9.5 : la suppression est une mutation du Scheduler, bloquée sous STOP. */
  async removeScheduledTask(id: string) {
    this.assertMutationAllowed("suppression de tâche planifiée");
    const result = this.scheduler.removeTask(id);
    await this.persist();
    return result;
  }

  /** Tick unique : appelé par le minuteur serveur ou manuellement via l'API. */
  async schedulerTick(source = "core"): Promise<SchedulerTickResult> {
    this.ensureReady();
    const result = await this.scheduler.tick(source);
    if (result.changed) await this.persist();
    return result;
  }

  async triggerScheduledTask(id: string, source = "user") {
    this.assertMutationAllowed("déclenchement manuel de tâche planifiée");
    const entry = await this.scheduler.triggerTask(id, source);
    await this.persist();
    return entry;
  }

  listSchedulerEvents(limit?: number) {
    this.ensureReady();
    return this.scheduler.listEvents(limit);
  }

  listSchedulerHistory(limit?: number) {
    this.ensureReady();
    return this.scheduler.listHistory(limit);
  }

  listSchedulerRules() {
    this.ensureReady();
    return this.scheduler.listRules();
  }

  listSchedulerAlerts(limit?: number) {
    this.ensureReady();
    return this.scheduler.listAlerts(limit);
  }

  // ---------- Phase 6 : Tool Registry ----------

  listTools() {
    this.ensureReady();
    return this.tools.list();
  }

  getTool(name: string) {
    this.ensureReady();
    return this.tools.get(name);
  }

  /** Une requête externe ne peut enregistrer que des templates déclaratifs. */
  async registerTool(input: NewToolDefinition) {
    this.assertMutationAllowed("enregistrement d'outil");
    const tool = this.tools.register(input);
    await this.persist();
    return tool;
  }

  async setToolEnabled(name: string, enabled: boolean) {
    this.assertMutationAllowed("activation/désactivation d'outil");
    const tool = this.tools.setEnabled(name, enabled);
    await this.persist();
    return tool;
  }

  async executeTool(name: string, input: Record<string, unknown>, context: ToolContext = {}) {
    this.ensureReady();
    const result = await this.tools.execute(name, input, context);
    await this.persist();
    return result;
  }

  listToolExecutions(limit?: number) {
    this.ensureReady();
    return this.tools.listExecutions(limit);
  }

  // ---------- Phase 7 : préparation multi-appareils locale ----------

  /** Identité opaque et checklist : aucune donnée d'appareil sensible exposée. */
  getDevices(): DeviceStatusView {
    this.ensureReady();
    return this.devices.view();
  }

  async renameDevice(label: string, actor = "user"): Promise<DeviceIdentity> {
    this.ensureReady();
    const device = this.devices.rename(label, actor);
    await this.persist();
    return device;
  }

  async refreshDeviceReadiness(actor = "user"): Promise<DeviceStatusView> {
    this.ensureReady();
    const view = this.devices.refreshChecks(actor);
    await this.persist();
    return view;
  }

  async exportDeviceBundle(): Promise<DeviceExportResult> {
    this.ensureReady();
    const result = this.devices.exportBundle();
    await this.persist();
    return result;
  }

  /** Prépare un aperçu en mémoire de session : n'applique aucune donnée. */
  previewDeviceImport(text: string, actor?: string): DevicePreviewResult {
    this.ensureReady();
    return this.devices.preview(text, actor);
  }

  /** Application additive et explicite ; aucun élément existant n'est remplacé. */
  async applyDeviceImport(stagedId: string, actor = "user", confirm = false): Promise<DeviceImportRecord> {
    this.ensureReady();
    const record = this.devices.apply(stagedId, actor, confirm);
    await this.persist();
    return record;
  }

  // ---------- Phase 8 : mémoire contextuelle locale ----------

  getContextMemoryStatus(): ContextMemoryStatusView {
    this.ensureReady();
    return this.contextMemoryEngine.status();
  }

  listContextMemory(limit = 20): ContextMemoryEntry[] {
    this.ensureReady();
    return this.contextMemoryEngine.list(limit);
  }

  /** Ajoute un souvenir local ; dédoublonnage exact et quasi-doublons suggérés. */
  async remember(input: RememberInput): Promise<ContextMemoryEntry> {
    this.ensureReady();
    const entry = this.contextMemoryEngine.remember(input);
    await this.persist();
    return entry;
  }

  /** Recherche contextuelle locale (aucun appel réseau). */
  recallContext(query: string, options: RecallOptions = {}): ContextRecallResult {
    this.ensureReady();
    // Phase 9.5 : sous STOP, la lecture reste disponible mais n'écrit ni
    // compteur d'accès ni entrée d'audit.
    const readOnly = this.state.stop.active ? { ...options, track: false as const } : options;
    return this.contextMemoryEngine.recall(query, readOnly);
  }

  /** Contexte destiné à un agent, filtré par sa politique de partage. */
  shareContextWithAgent(agent: ContextAgentRole, query: string, limit = 5) {
    this.ensureReady();
    // Phase 9.5 : sous STOP, le partage reste une lecture mais n'écrit aucun
    // compteur ni audit ; le filtre de partage reste appliqué dans tous les cas.
    return this.contextMemoryEngine.sharedContext(agent, query, limit, {
      track: !this.state.stop.active,
    });
  }

  listContextDuplicates(): ContextDuplicatePair[] {
    this.ensureReady();
    return this.contextMemoryEngine.listDuplicates();
  }

  async reviewContextDuplicate(id: string): Promise<ContextDuplicatePair> {
    this.ensureReady();
    const pair = this.contextMemoryEngine.reviewDuplicate(id);
    await this.persist();
    return pair;
  }

  /** Promotion court terme → long terme ; aucun dépôt utilisateur touché. */
  async consolidateContextMemory(): Promise<{ promoted: number; pruned: number }> {
    this.ensureReady();
    const result = this.contextMemoryEngine.consolidate();
    await this.persist();
    return result;
  }

  /** Copie additive et explicite de souvenirs existants fournis par l'utilisateur. */
  async bridgeMemories(items: readonly ContextBridgeItem[], confirm = false) {
    this.ensureReady();
    const result = this.contextMemoryEngine.bridge(items, confirm, { kind: "fact", scope: "long", tags: ["pont-local"] });
    await this.persist();
    return result;
  }

  /** Copie additive d'extraits de conversations choisis, indexés comme épisodes. */
  async bridgeConversationExcerpts(items: readonly ContextBridgeItem[], confirm = false) {
    this.ensureReady();
    const result = this.contextMemoryEngine.bridge(items, confirm, { kind: "episode", scope: "short", tags: ["conversation"] });
    await this.persist();
    return result;
  }

  listAudit(filter: Parameters<AuditLog["list"]>[0] = {}) {
    this.ensureReady();
    return this.audit.list(filter);
  }

  checkPermission(request: PermissionRequest) {
    this.ensureReady();
    return this.permissions.check(request);
  }

  async approve(action: CoreSensitiveAction, target?: string, decidedBy?: string) {
    this.assertMutationAllowed("approbation");
    const decision = this.permissions.approve(action, target, decidedBy);
    await this.persist();
    return decision;
  }

  async deny(action: CoreSensitiveAction, target?: string, decidedBy?: string) {
    this.assertMutationAllowed("refus de permission");
    const decision = this.permissions.deny(action, target, decidedBy);
    await this.persist();
    return decision;
  }

  async revoke(action: CoreSensitiveAction, target?: string, decidedBy?: string) {
    this.assertMutationAllowed("révocation de permission");
    const existed = this.permissions.revoke(action, target, decidedBy);
    await this.persist();
    return existed;
  }

  listApprovals() {
    this.ensureReady();
    return this.permissions.listApprovals();
  }

  async searchMemory(query: string, limit = 8) {
    this.ensureReady();
    return this.memory.search(query, limit);
  }

  /**
   * Gestionnaires Phase 6 : tous déterministes, bornés et en lecture seule.
   * Aucun gestionnaire n'exécute de code fourni par l'appelant. Le type
   * `core_action` est volontairement indisponible (fail closed).
   */
  private buildToolInvokers(): Record<string, ToolInvoker> {
    const bounded = (value: Record<string, unknown>): ToolResult => ({
      ok: true,
      output: JSON.stringify(value).slice(0, 1800),
    });
    return {
      core_query: () => {
        const status = this.getStatus();
        return bounded({
          phase: status.phase,
          storage: status.storage.kind,
          missions: status.missions,
          agents: status.agents,
          scheduler: status.scheduler
            ? { tasks: status.scheduler.tasks, enabled: status.scheduler.enabled, alerts: status.scheduler.alerts, tickCount: status.scheduler.tickCount }
            : undefined,
          capabilities: status.capabilities,
        });
      },
      core_action: () => ({
        ok: false,
        error: "Aucune action du Core n'est exposée comme outil : fail closed (Phase 6).",
      }),
      memory_query: async (_tool, input, context) => {
        const query = String(input.objectif ?? "").slice(0, 300);
        // Phase 9.5 : un agent appelant memory_search ne doit jamais contourner
        // la politique de partage. Sans agent, l'utilisateur propriétaire garde
        // l'accès à ses propres souvenirs (contrat Phase 8 préservé).
        const agent = context.agent && (CONTEXT_AGENT_ROLES as readonly string[]).includes(context.agent)
          ? context.agent as ContextAgentRole
          : null;
        const snippets = agent
          ? this.contextMemoryEngine.recall(query, { limit: 5, track: false, agent }).hits
              .map((hit) => ({ text: hit.entry.text }))
          : await this.memory.search(query, 5);
        const lines = snippets.map((snippet) => `- ${snippet.text.slice(0, 240)}`).slice(0, 5);
        return {
          ok: true,
          output: lines.length === 0 ? "Aucun souvenir local correspondant." : lines.join("\n"),
        };
      },
      scheduler_query: () => {
        const scheduler = this.getStatus().scheduler;
        return bounded(scheduler ?? { tasks: 0, enabled: 0, alerts: 0, events: 0, tickCount: 0 });
      },
      agent_query: () => bounded(this.getStatus().agents ?? { roles: 0, runs: 0, steps: 0 }),
      template: (tool, input) => ({
        ok: true,
        output: renderToolTemplate(tool.template ?? "", input),
      }),
    };
  }

  private extractSensitiveActions(classification: Classification): CoreSensitiveAction[] {
    const signal = classification.signals.find((s) => s.startsWith("actions_sensibles:"));
    if (!signal) return [];
    const raw = signal.slice("actions_sensibles:".length).split(",");
    return raw.filter((a): a is CoreSensitiveAction =>
      (SENSITIVE_ACTIONS as readonly string[]).includes(a)
    );
  }

  private ensureReady(): void {
    if (!this.initialized) throw new Error("JarvisCore doit être initialisé avec init().");
  }

  /** Phase 9.5 : toute mutation du Core passe par ce point, y compris hors HTTP. */
  private assertMutationAllowed(action: string): void {
    this.ensureReady();
    if (this.state.stop.active) throw new CoreStopError(action);
  }

  private async persist(): Promise<void> {
    await this.storage.save(this.state);
  }
}

export { permissionKey };
export { SkillRegistryError };
