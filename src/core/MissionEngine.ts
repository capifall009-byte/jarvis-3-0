/**
 * Moteur de missions du noyau JARVIS 4.0.
 *
 * Création, planification, suivi, annulation et reprise idempotente après
 * redémarrage. Les tâches sont persistées dans `CoreState` via le `CoreStorage`
 * injecté dans `JarvisCore` (aucune base de données propre à ce moteur).
 */

import type { AuditLog } from "./AuditLog.ts";
import type {
  CoreSensitiveAction,
  CoreState,
  CoreTask,
  Mission,
} from "./types.ts";

export interface MissionTaskInput {
  name: string;
  description?: string;
  agent?: string;
  skill?: string;
  priority?: number;
  /** Indices des tâches du même tableau dont celle-ci dépend. */
  dependsOn?: number[];
  permission?: CoreSensitiveAction;
}

export interface MissionEngineDeps {
  state: CoreState;
  audit: AuditLog;
  now?: () => number;
  id?: (prefix: string) => string;
}

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const ACTIVE_STATUSES = new Set<Mission["status"]>(["planned", "running", "paused"]);
const TERMINAL_TASK_STATUSES = new Set<CoreTask["status"]>(["done", "failed", "cancelled"]);

export class MissionEngine {
  private readonly state: CoreState;
  private readonly audit: AuditLog;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;

  constructor(deps: MissionEngineDeps) {
    this.state = deps.state;
    this.audit = deps.audit;
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
    if (!Array.isArray(this.state.missions)) this.state.missions = [];
  }

  createMission(
    goal: string,
    inputs: MissionTaskInput[] = [],
    context: Record<string, unknown> = {}
  ): Mission {
    const ts = this.now();
    const id = this.id("mis");
    const ids = inputs.map(() => this.id("tsk"));

    const tasks: CoreTask[] = inputs.map((input, index) => ({
      id: ids[index],
      missionId: id,
      name: input.name,
      description: input.description ?? input.name,
      priority: input.priority ?? 1,
      agent: input.agent ?? "chief",
      ...(input.skill ? { skill: input.skill } : {}),
      ...(input.permission ? { permission: input.permission } : {}),
      dependencies: (input.dependsOn ?? [])
        .map((i) => ids[i])
        .filter((dep): dep is string => Boolean(dep)),
      status: "pending",
      progress: 0,
      createdAt: ts,
      updatedAt: ts,
    }));

    const mission: Mission = {
      id,
      goal,
      status: "planned",
      tasks,
      createdAt: ts,
      updatedAt: ts,
      context,
    };
    this.state.missions.push(mission);
    this.audit.record({
      actor: "core",
      action: "mission_created",
      target: id,
      outcome: "success",
      detail: `${goal} (${tasks.length} tâches)`,
    });
    return mission;
  }

  getMission(id: string): Mission | undefined {
    return this.state.missions.find((m) => m.id === id);
  }

  listMissions(status?: Mission["status"]): Mission[] {
    return this.state.missions
      .filter((m) => (status ? m.status === status : true))
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  startMission(id: string): Mission {
    const mission = this.requireMission(id);
    if (mission.status !== "planned" && mission.status !== "paused") {
      throw new Error(`Mission ${id} ne peut pas être démarrée depuis l'état ${mission.status}.`);
    }
    mission.status = "running";
    mission.updatedAt = this.now();
    this.promoteReadyTasks(mission);
    this.audit.record({ actor: "core", action: "mission_started", target: id, outcome: "success" });
    return mission;
  }

  pauseMission(id: string, reason = "Pause demandée"): Mission {
    const mission = this.requireMission(id);
    mission.status = "paused";
    mission.updatedAt = this.now();
    for (const task of mission.tasks) {
      if (task.status === "running") {
        task.status = "pending";
        task.updatedAt = mission.updatedAt;
      }
    }
    this.audit.record({
      actor: "core", action: "mission_paused", target: id, outcome: "info", detail: reason,
    });
    return mission;
  }

  resumeMission(id: string): Mission {
    const mission = this.requireMission(id);
    if (mission.status !== "paused") {
      throw new Error(`Mission ${id} n'est pas en pause.`);
    }
    return this.startMission(id);
  }

  cancelMission(id: string, reason = "Annulation demandée"): Mission {
    const mission = this.requireMission(id);
    mission.status = "cancelled";
    mission.updatedAt = this.now();
    for (const task of mission.tasks) {
      if (!TERMINAL_TASK_STATUSES.has(task.status)) {
        task.status = "cancelled";
        task.updatedAt = mission.updatedAt;
      }
    }
    this.audit.record({
      actor: "core", action: "mission_cancelled", target: id, outcome: "info", detail: reason,
    });
    return mission;
  }

  updateProgress(missionId: string, taskId: string, progress: number): CoreTask {
    const task = this.requireTask(missionId, taskId);
    task.progress = Math.max(0, Math.min(100, Math.round(progress)));
    task.updatedAt = this.now();
    this.requireMission(missionId).updatedAt = task.updatedAt;
    return task;
  }

  completeTask(missionId: string, taskId: string, result?: string): Mission {
    const mission = this.requireMission(missionId);
    const task = this.requireTask(missionId, taskId);
    task.status = "done";
    task.progress = 100;
    task.updatedAt = this.now();
    if (result) task.result = result;
    mission.updatedAt = task.updatedAt;
    this.audit.record({
      actor: "core", action: "task_completed", target: taskId, outcome: "success", detail: missionId,
    });

    this.promoteReadyTasks(mission);
    if (mission.tasks.every((t) => t.status === "done")) {
      mission.status = "completed";
      mission.summary = `Mission terminée : ${mission.goal}`;
      this.audit.record({
        actor: "core", action: "mission_completed", target: mission.id, outcome: "success",
      });
    }
    return mission;
  }

  failTask(missionId: string, taskId: string, error?: string): Mission {
    const mission = this.requireMission(missionId);
    const task = this.requireTask(missionId, taskId);
    task.status = "failed";
    task.updatedAt = this.now();
    if (error) task.error = error;
    mission.updatedAt = task.updatedAt;
    this.audit.record({
      actor: "core", action: "task_failed", target: taskId, outcome: "failure",
      severity: "error", detail: error ?? missionId,
    });
    if (!mission.tasks.some((t) => t.status === "running" || t.status === "pending")) {
      mission.status = "failed";
      mission.error = error ?? "Une tâche a échoué.";
    }
    return mission;
  }

  /** STOP GLOBAL : annule immédiatement toutes les missions actives et leurs tâches. */
  stopAll(reason = "STOP GLOBAL"): { cancelledMissions: number; cancelledTasks: number } {
    let cancelledMissions = 0;
    let cancelledTasks = 0;
    for (const mission of this.state.missions) {
      if (!ACTIVE_STATUSES.has(mission.status)) continue;
      const before = mission.tasks.filter((t) => !TERMINAL_TASK_STATUSES.has(t.status)).length;
      this.cancelMission(mission.id, reason);
      cancelledTasks += before;
      cancelledMissions += 1;
    }
    this.audit.record({
      actor: "user",
      action: "stop_global",
      outcome: "success",
      severity: "warn",
      detail: `${reason} — ${cancelledMissions} mission(s), ${cancelledTasks} tâche(s) annulée(s).`,
    });
    return { cancelledMissions, cancelledTasks };
  }

  /**
   * Reprise après redémarrage. Idempotent : un second appel ne modifie rien.
   * Les missions « running » deviennent « paused » et les tâches « running »
   * repassent en « pending » afin de pouvoir être reprises sans duplicata.
   */
  recoverInterrupted(): { missions: number; tasks: number } {
    let missions = 0;
    let tasks = 0;
    for (const mission of this.state.missions) {
      if (mission.status === "running") {
        mission.status = "paused";
        mission.updatedAt = this.now();
        missions += 1;
      }
      for (const task of mission.tasks) {
        if (task.status === "running") {
          task.status = "pending";
          task.updatedAt = mission.updatedAt;
          tasks += 1;
        }
      }
    }
    if (missions > 0 || tasks > 0) {
      this.audit.record({
        actor: "core",
        action: "mission_recovery",
        outcome: "info",
        detail: `Reprise : ${missions} mission(s) en pause, ${tasks} tâche(s) réinitialisée(s).`,
      });
    }
    return { missions, tasks };
  }

  private promoteReadyTasks(mission: Mission): void {
    const done = new Set(mission.tasks.filter((t) => t.status === "done").map((t) => t.id));
    for (const task of mission.tasks) {
      if (task.status !== "pending") continue;
      if (task.dependencies.every((dep) => done.has(dep))) {
        task.status = "running";
        task.updatedAt = this.now();
      }
    }
  }

  private requireMission(id: string): Mission {
    const mission = this.getMission(id);
    if (!mission) throw new Error(`Mission introuvable : ${id}`);
    return mission;
  }

  private requireTask(missionId: string, taskId: string): CoreTask {
    const task = this.requireMission(missionId).tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Tâche introuvable : ${taskId}`);
    return task;
  }
}
