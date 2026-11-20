/**
 * Orchestrateur multi-agents — JARVIS 4.0 Phase 4.
 *
 * Le Main Agent distribue les tâches, gère dépendances, concurrence bornée,
 * retries limités, validation humaine et vérification finale. Tous les
 * traitements sont déterministes et journalisés ; STOP GLOBAL est vérifié
 * avant chaque étape et reste prioritaire. Aucun agent n'exécute de code.
 */

import type { AuditLog } from "../AuditLog.ts";
import type { PermissionManager } from "../PermissionManager.ts";
import type { CoreState, Mission } from "../types.ts";
import { AgentRegistry, normalizeAgentId } from "./AgentRegistry.ts";
import { SharedMemory } from "./SharedMemory.ts";
import type {
  AgentId,
  AgentMessage,
  AgentRun,
  AgentRunOptions,
  AgentSkillInvoker,
  AgentStep,
  AgentStepResult,
  AgentToolInvoker,
} from "./types.ts";

const MAX_STEPS = 40;
const MAX_MESSAGES = 80;
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 4;

export interface AgentOrchestratorDeps {
  state: CoreState;
  audit: AuditLog;
  permissions: PermissionManager;
  registry?: AgentRegistry;
  now?: () => number;
  id?: (prefix: string) => string;
  isStopped?: () => boolean;
  skillInvoker?: AgentSkillInvoker;
  toolInvoker?: AgentToolInvoker;
}

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AgentOrchestrator {
  private readonly state: CoreState;
  private readonly audit: AuditLog;
  private readonly permissions: PermissionManager;
  private readonly registry: AgentRegistry;
  private readonly memory: SharedMemory;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly isStopped: () => boolean;
  private readonly skillInvoker?: AgentSkillInvoker;
  private readonly toolInvoker?: AgentToolInvoker;

  constructor(deps: AgentOrchestratorDeps) {
    this.state = deps.state;
    this.audit = deps.audit;
    this.permissions = deps.permissions;
    this.registry = deps.registry ?? new AgentRegistry();
    this.memory = new SharedMemory({ now: deps.now, id: deps.id });
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
    this.isStopped = deps.isStopped ?? (() => false);
    this.skillInvoker = deps.skillInvoker;
    this.toolInvoker = deps.toolInvoker;
    if (!Array.isArray(this.state.agentRuns)) this.state.agentRuns = [];
  }

  listRoles() {
    return this.registry.list();
  }

  listRuns(status?: AgentRun["status"]): AgentRun[] {
    return this.state.agentRuns
      .filter((run) => (status ? run.status === status : true))
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getRun(id: string): AgentRun | undefined {
    return this.state.agentRuns.find((run) => run.id === id);
  }

  /** Crée un run à partir d'une mission existante, sans rien exécuter. */
  createRun(mission: Mission, options: AgentRunOptions = {}): AgentRun {
    const ts = this.now();
    const maxConcurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(options.maxConcurrency ?? DEFAULT_CONCURRENCY)));
    const rawSteps = options.steps ?? mission.tasks.map((task) => ({
      name: task.name,
      description: task.description,
      assignee: normalizeAgentId(task.agent) ?? undefined,
      sensitive: task.permission,
      skillId: task.skill,
      dependsOn: task.dependencies
        .map((depId) => mission.tasks.findIndex((t) => t.id === depId))
        .filter((index) => index >= 0),
    }));

    const limited = rawSteps.slice(0, MAX_STEPS);
    const ids = limited.map(() => this.id("ast"));
    const steps: AgentStep[] = limited.map((item, index) => {
      const explicit = normalizeAgentId(item.assignee);
      // « chief » est le rôle générique posé par la Phase 2 : il ne doit pas
      // capturer les tâches métier. Le Main Agent coordonne, il n'exécute que
      // les tâches explicitement de coordination.
      const coordination = /coordination|réparti|distribu|orchestr|arbitrage|pilotage/i.test(
        `${item.name} ${item.description ?? ""}`
      );
      const assignee = explicit && (explicit !== "main" || coordination)
        ? explicit
        : this.registry.assign(item.name, item.description ?? "");
      const maxRetries = Math.max(0, Math.min(2, Math.floor(options.maxRetries ?? this.registry.get(assignee).maxRetries)));
      return {
        id: ids[index],
        missionTaskId: options.steps ? "" : (mission.tasks[index]?.id ?? ""),
        name: item.name,
        description: item.description ?? item.name,
        assignee,
        dependencies: (item.dependsOn ?? []).map((i) => ids[i]).filter((dep): dep is string => Boolean(dep)),
        status: "pending",
        attempts: 0,
        maxAttempts: maxRetries + 1,
        progress: 0,
        ...(item.sensitive ? { sensitive: item.sensitive } : {}),
        ...(item.skillId ? { skillId: item.skillId } : {}),
      };
    });

    // Vérification obligatoire avant livraison : ajoutée si la mission n'en
    // contient pas déjà une. Elle dépend de toutes les autres étapes.
    if (!steps.some((step) => step.assignee === "verification")) {
      const verificationId = this.id("ast");
      steps.push({
        id: verificationId,
        missionTaskId: "",
        name: "Vérification finale des résultats",
        description: "Contrôle de complétude et de cohérence avant livraison au Core.",
        assignee: "verification",
        dependencies: steps.map((step) => step.id),
        status: "pending",
        attempts: 0,
        maxAttempts: 1,
        progress: 0,
      });
    }

    const run: AgentRun = {
      id: this.id("run"),
      missionId: mission.id,
      goal: mission.goal,
      status: "planned",
      steps,
      messages: [],
      memory: [],
      config: { maxConcurrency, maxRetries: Math.max(0, Math.min(2, Math.floor(options.maxRetries ?? 2))) },
      metrics: { maxConcurrentObserved: 0, retries: 0, verifications: 0, skillCalls: 0, toolCalls: 0, messages: 0 },
      createdAt: ts,
      updatedAt: ts,
    };
    this.state.agentRuns.push(run);
    this.message(run, "main", "main", "mission_reçue", `Mission ${mission.id} répartie entre ${new Set(steps.map((s) => s.assignee)).size} agent(s).`);
    for (const step of steps) {
      if (step.assignee !== "main") {
        this.message(run, "main", step.assignee, "affectation", `${step.name} — ${step.description}`);
      }
    }
    this.audit.record({
      actor: "main", action: "agent_run_created", target: run.id, outcome: "success",
      detail: `Mission ${mission.id} · ${steps.length} étape(s) · concurrence max ${maxConcurrency}.`,
    });
    return run;
  }

  /** Exécute un run. Idempotent : un run terminé ou annulé n'est pas relancé. */
  async run(runId: string): Promise<AgentRun> {
    const run = this.requireRun(runId);
    if (run.status === "completed" || run.status === "cancelled") return run;
    if (this.isStopped()) return this.cancelRun(run, "STOP GLOBAL");

    run.status = "running";
    run.updatedAt = this.now();
    this.audit.record({ actor: "main", action: "agent_run_started", target: run.id, outcome: "success" });

    const maxIterations = run.steps.length * (Math.max(...run.steps.map((s) => s.maxAttempts)) + 2) + 5;
    let iterations = 0;

    while (iterations++ < maxIterations) {
      if (this.isStopped()) return this.cancelRun(run, "STOP GLOBAL");

      const pending = run.steps.filter((step) => step.status === "pending");
      if (pending.length === 0) break;

      const doneIds = new Set(run.steps.filter((s) => s.status === "done").map((s) => s.id));
      const blockedIds = new Set(run.steps.filter((s) => ["failed", "cancelled", "blocked", "needs_validation"].includes(s.status)).map((s) => s.id));
      const ready = pending.filter((step) => {
        if (step.dependencies.some((dep) => blockedIds.has(dep))) {
          step.status = "cancelled";
          step.error = "Dépendance non satisfaite.";
          return false;
        }
        return step.dependencies.every((dep) => doneIds.has(dep));
      });

      if (ready.length === 0) {
        if (run.steps.some((s) => s.status === "needs_validation")) {
          run.status = "awaiting_validation";
          return run;
        }
        if (run.steps.some((s) => s.status === "failed")) {
          return this.failRun(run, "Aucune étape exécutable : dépendances non satisfaites.");
        }
        return this.failRun(run, "Blocage de dépendances : aucune étape prête.");
      }

      const wave = ready.slice(0, run.config.maxConcurrency);
      run.metrics.maxConcurrentObserved = Math.max(run.metrics.maxConcurrentObserved, wave.length);
      run.updatedAt = this.now();

      for (const step of wave) {
        if (this.isStopped()) return this.cancelRun(run, "STOP GLOBAL pendant l'exécution");
        step.status = "running";
        step.progress = 10;
        step.startedAt = this.now();

        // Droits sensibles : fail closed, validation humaine obligatoire.
        if (step.sensitive) {
          const decision = this.permissions.check({
            action: step.sensitive,
            title: `Étape « ${step.name} »`,
            target: step.id,
            missionId: run.missionId,
            taskId: step.id,
          });
          if (!decision.allowed) {
            step.status = "needs_validation";
            step.progress = 0;
            step.validationReason = `Permission « ${step.sensitive} » : ${decision.decision}.`;
            delete step.startedAt;
            run.status = "awaiting_validation";
            this.message(run, step.assignee, "main", "validation_requise", `${step.name} : ${step.validationReason}`);
            this.audit.record({
              actor: step.assignee, action: "agent_validation_required", target: step.id,
              outcome: "denied", severity: "warn", detail: step.validationReason,
            });
            this.resetOtherRunning(run, step.id);
            return run;
          }
        }

        const result = await this.performStep(run, step);
        if (result.needsValidation) {
          step.status = "needs_validation";
          step.progress = 0;
          step.validationReason = result.error ?? "Validation humaine requise.";
          delete step.startedAt;
          run.status = "awaiting_validation";
          this.message(run, step.assignee, "main", "validation_requise", `${step.name} : ${step.validationReason}`);
          this.resetOtherRunning(run, step.id);
          return run;
        }
        if (!result.ok) {
          step.attempts += 1;
          step.error = result.error ?? "Échec d'étape.";
          if (step.attempts < step.maxAttempts) {
            step.status = "pending";
            step.progress = 0;
            delete step.startedAt;
            run.metrics.retries += 1;
            this.message(run, "main", step.assignee, "nouvelle_tentative", `${step.name} : tentative ${step.attempts + 1}/${step.maxAttempts}.`);
            this.audit.record({
              actor: "main", action: "agent_step_retry", target: step.id, outcome: "info",
              detail: `${step.attempts}/${step.maxAttempts} — ${step.error}`,
            });
          } else {
            step.status = "failed";
            step.finishedAt = this.now();
            this.message(run, step.assignee, "main", "echec_etape", `${step.name} : ${step.error}`);
            this.audit.record({
              actor: step.assignee, action: "agent_step_failed", target: step.id,
              outcome: "failure", severity: "error", detail: step.error,
            });
          }
          continue;
        }

        step.status = "done";
        step.progress = 100;
        step.output = result.output ?? "";
        step.finishedAt = this.now();
        delete step.error;
        delete step.validationReason;
        this.memory.write(run, `resultat.${step.id}`, step.output, step.assignee, step.id);
        if (step.assignee === "verification") run.metrics.verifications += 1;
        this.message(run, step.assignee, "main", "etape_terminee", `${step.name} : ${step.output.slice(0, 300)}`);
        this.audit.record({
          actor: step.assignee, action: "agent_step_completed", target: step.id,
          outcome: "success", detail: run.missionId,
        });
      }
      run.updatedAt = this.now();
    }

    if (this.isStopped()) return this.cancelRun(run, "STOP GLOBAL");

    if (run.steps.every((step) => step.status === "done")) {
      run.status = "completed";
      run.summary = `Mission ${run.missionId} vérifiée et livrée (${run.steps.length} étapes).`;
      this.message(run, "verification", "main", "livraison_autorisee", run.summary);
      this.audit.record({
        actor: "verification", action: "agent_run_completed", target: run.id,
        outcome: "success", detail: run.summary,
      });
    } else if (run.steps.some((step) => step.status === "needs_validation")) {
      run.status = "awaiting_validation";
    } else {
      return this.failRun(run, "Une ou plusieurs étapes n'ont pas abouti.");
    }
    run.updatedAt = this.now();
    return run;
  }

  /**
   * Validation humaine : approuve (éventuellement l'permission sensibles) puis
   * remet l'étape en attente ; l'appelant relance `run()` pour reprendre.
   */
  validateStep(
    runId: string,
    stepId: string,
    decision: "approve" | "reject",
    actor = "user"
  ): AgentRun {
    const run = this.requireRun(runId);
    const step = run.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`Étape agent introuvable : ${stepId}`);
    if (step.status !== "needs_validation") {
      throw new Error(`L'étape ${stepId} n'attend pas de validation.`);
    }
    if (decision === "reject") {
      step.status = "cancelled";
      step.error = "Validation humaine refusée.";
      const others = run.steps.filter((s) => s.status === "pending");
      for (const other of others) other.status = "cancelled";
      run.status = "cancelled";
      run.updatedAt = this.now();
      this.message(run, "main", "main", "validation_refusee", `${step.name} refusée par ${actor}.`);
      this.audit.record({
        actor, action: "agent_validation_rejected", target: step.id, outcome: "denied", severity: "warn",
      });
      return run;
    }

    if (step.sensitive) {
      this.permissions.approve(step.sensitive, step.id, actor);
    }
    step.status = "pending";
    step.progress = 0;
    delete step.validationReason;
    run.status = "paused";
    run.updatedAt = this.now();
    this.message(run, "main", step.assignee, "validation_accordee", `${step.name} autorisée par ${actor}.`);
    this.audit.record({
      actor, action: "agent_validation_approved", target: step.id, outcome: "success",
    });
    return run;
  }

  /** STOP GLOBAL : annule tous les runs actifs, y compris en attente de validation. */
  stopAll(reason = "STOP GLOBAL"): { runs: number; steps: number } {
    let runs = 0;
    let steps = 0;
    for (const run of this.state.agentRuns) {
      if (!["planned", "running", "paused", "awaiting_validation"].includes(run.status)) continue;
      runs += 1;
      for (const step of run.steps) {
        if (!["done", "failed", "cancelled"].includes(step.status)) {
          step.status = "cancelled";
          step.error = reason;
          steps += 1;
        }
      }
      run.status = "cancelled";
      run.error = reason;
      run.updatedAt = this.now();
    }
    if (runs > 0) {
      this.audit.record({
        actor: "user", action: "agent_runs_stopped", outcome: "success", severity: "warn",
        detail: `${reason} — ${runs} run(s), ${steps} étape(s) annulée(s).`,
      });
    }
    return { runs, steps };
  }

  /** Reprise après redémarrage : « running » redevient « paused », étapes prêtes. */
  recoverInterrupted(): { runs: number; steps: number } {
    let runs = 0;
    let steps = 0;
    for (const run of this.state.agentRuns) {
      if (run.status === "running") {
        run.status = "paused";
        run.updatedAt = this.now();
        runs += 1;
      }
      for (const step of run.steps) {
        if (step.status === "running") {
          step.status = "pending";
          step.progress = 0;
          delete step.startedAt;
          steps += 1;
        }
      }
    }
    if (runs > 0 || steps > 0) {
      this.audit.record({
        actor: "core", action: "agent_recovery", outcome: "info",
        detail: `Reprise : ${runs} run(s) en pause, ${steps} étape(s) réinitialisée(s).`,
      });
    }
    return { runs, steps };
  }

  // ---------- interne ----------

  private async performStep(run: AgentRun, step: AgentStep): Promise<AgentStepResult> {
    if (this.isStopped()) {
      return { ok: false, error: "STOP GLOBAL actif : étape interrompue." };
    }
    const priorOutputs = run.steps
      .filter((s) => step.dependencies.includes(s.id) && s.status === "done")
      .map((s) => `${s.name} : ${(s.output ?? "").slice(0, 240)}`);
    const memoryHits = this.memory.search(run, `${step.name} ${step.description}`, 2)
      .map((entry) => `${entry.key} : ${entry.value.slice(0, 200)}`);
    const context = [...priorOutputs, ...memoryHits].join(" | ") || "aucun contexte antérieur";

    // Skill sélectionné par le Core : seul point d'accès autorisé.
    if (step.skillId && this.skillInvoker) {
      run.metrics.skillCalls += 1;
      const result = this.skillInvoker(step.skillId, {
        objectif: run.goal,
        etape: step.name,
        contexte: context.slice(0, 1000),
      }, { goal: run.goal, missionId: run.missionId, agent: step.assignee });
      if (result.status === "blocked") {
        return { ok: false, needsValidation: true, error: result.error ?? "Compétence bloquée." };
      }
      if (result.status !== "success") {
        return { ok: false, error: result.error ?? "Échec de la compétence." };
      }
      step.output = result.output ?? "";
    }

    // Outil déclaratif [tool:nom] : passe exclusivement par le Tool Registry.
    // La sortie est ajoutée APRÈS la synthèse : compose() ne l'écrase pas.
    let toolOutput = "";
    const toolMatch = step.description.match(/\[tool:([a-z0-9_-]{2,40})\]/i);
    if (toolMatch && this.toolInvoker) {
      run.metrics.toolCalls += 1;
      const result = await this.toolInvoker(toolMatch[1], {
        objectif: run.goal,
        contexte: context.slice(0, 1000),
      }, { missionId: run.missionId, agent: step.assignee });
      if (!result.ok) {
        return { ok: false, needsValidation: true, error: result.error ?? "Outil refusé." };
      }
      toolOutput = (result.output ?? "").slice(0, 2000);
    }

    const composed = this.compose(step.assignee, run, step, context);
    const output = toolOutput ? `${composed}\n${toolOutput}`.trim() : composed;
    // Le Memory Agent indexe explicitement la synthèse contextuelle.
    if (step.assignee === "memory") {
      this.memory.write(run, `synthese.${step.id}`, output, "memory", step.id);
      this.message(run, "memory", "main", "memoire_indexee", `${step.name} : contexte partagé mis à jour.`);
    }
    return { ok: true, output };
  }

  private compose(agent: AgentId, run: AgentRun, step: AgentStep, context: string): string {
    const objective = run.goal.slice(0, 300);
    switch (agent) {
      case "planning":
        return `PLAN — ${step.name}\nObjectif : ${objective}\nÉtapes dépendantes : ${step.dependencies.length}\nContexte : ${context.slice(0, 800)}`;
      case "research":
        return `SYNTHÈSE — ${step.name}\nÉléments locaux disponibles : ${context.slice(0, 900)}\nLimites : aucune source externe autorisée dans cette phase.`;
      case "coding":
        return `ANALYSE TECHNIQUE — ${step.name}\nBesoins : ${objective}\nContexte : ${context.slice(0, 800)}\nPoints de contrôle : types, limites, non-régression.`;
      case "analysis":
        return `ANALYSE — ${step.name}\nDonnées : ${context.slice(0, 900)}\nConclusion : cohérence évaluée à partir des éléments vérifiables uniquement.`;
      case "creative":
        return `PROPOSITION — ${step.name}\nAngle : ${objective}\nContexte exploité : ${context.slice(0, 700)}\nVariante : formulation claire et exploitable, sans fait non vérifié.`;
      case "verification": {
        const required = run.steps.filter((s) => s.assignee !== "verification");
        const missing = required.filter((s) => s.status !== "done" || !(s.output ?? "").trim());
        if (missing.length > 0) {
          return `ÉCHEC VÉRIFICATION — livrables incomplets : ${missing.map((s) => s.name).join(", ")}.`;
        }
        return `VÉRIFICATION OK — ${required.length} livrable(s) contrôlé(s), aucune étape en échec, résultat transmis au Main Agent.`;
      }
      case "memory":
        return `MÉMOIRE PARTAGÉE — ${step.name}\nContexte indexé : ${context.slice(0, 900)}`;
      case "main":
      default:
        return `COORDINATION — ${step.name}\nObjectif : ${objective}\nContexte arbitré : ${context.slice(0, 800)}`;
    }
  }

  private message(run: AgentRun, from: AgentId, to: AgentId, subject: string, body: string): void {
    if (run.messages.length >= MAX_MESSAGES) run.messages.splice(0, 1);
    const item: AgentMessage = {
      id: this.id("msg"), runId: run.id, from, to, subject,
      body: body.slice(0, 1200), ts: this.now(),
    };
    run.messages.push(item);
    run.metrics.messages += 1;
  }

  private resetOtherRunning(run: AgentRun, exceptId: string): void {
    for (const step of run.steps) {
      if (step.id !== exceptId && step.status === "running") {
        step.status = "pending";
        step.progress = 0;
        delete step.startedAt;
      }
    }
  }

  private cancelRun(run: AgentRun, reason: string): AgentRun {
    for (const step of run.steps) {
      if (!["done", "failed", "cancelled"].includes(step.status)) {
        step.status = "cancelled";
        step.error = reason;
      }
    }
    run.status = "cancelled";
    run.error = reason;
    run.updatedAt = this.now();
    this.audit.record({
      actor: "user", action: "agent_run_cancelled", target: run.id,
      outcome: "success", severity: "warn", detail: reason,
    });
    return run;
  }

  private failRun(run: AgentRun, reason: string): AgentRun {
    run.status = "failed";
    run.error = reason;
    run.updatedAt = this.now();
    this.message(run, "main", "main", "echec_mission", reason);
    this.audit.record({
      actor: "main", action: "agent_run_failed", target: run.id,
      outcome: "failure", severity: "error", detail: reason,
    });
    return run;
  }

  private requireRun(id: string): AgentRun {
    const run = this.getRun(id);
    if (!run) throw new Error(`Run agent introuvable : ${id}`);
    return run;
  }
}
