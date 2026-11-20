/**
 * Routes du Central Intelligence Core — JARVIS 4.0.
 *
 * ADDITIF : montées sous `/api` dans server.ts, donc protégées par
 * `createApiSecurityMiddleware` (rate limit, headers, basic auth/bearer si
 * configurés). Aucune route existante n'est modifiée.
 *
 * Aucune clé ni secret n'est renvoyé : seule la_description du stockage local.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { JarvisCore, SkillRegistryError } from "../../../src/core/JarvisCore.ts";
import type { NewSkillInput } from "../../../src/core/skills/types.ts";
import type { NewToolDefinition, ToolContext } from "../../../src/core/tools/types.ts";
import { DeviceBundleError } from "../../../src/core/devices/DeviceManager.ts";
import { ContextMemoryError } from "../../../src/core/memory/ContextMemory.ts";
import type { ContextMemoryKind } from "../../../src/core/memory/types.ts";
import { FileCoreStorage } from "../../core/FileCoreStorage.ts";
import { SENSITIVE_ACTIONS } from "../../../src/core/types.ts";
import type { CoreSensitiveAction, CoreStorage } from "../../../src/core/types.ts";
import type { MemoryGateway } from "../../../src/core/MemoryGateway.ts";
import { authenticatedActor } from "../apiSecurity.ts";

export interface CoreRouterOptions {
  /** Injecté pour les tests ; en production, FileCoreStorage est utilisé. */
  storage?: CoreStorage;
  memory?: MemoryGateway;
  /** Phase 5 : reçoit l'instance initialisée pour démarrer le tick serveur réel. */
  onReady?: (core: JarvisCore) => void;
  /** Phase 9.5 : initialise le Core au démarrage du serveur, pas à la première requête. */
  eagerStart?: boolean;
}

function ok(res: Response, data: Record<string, unknown>): void {
  res.json({ ok: true, ...data });
}

function fail(res: Response, status: number, code: string, error: string): void {
  // Phase 9.5 : quelle que soit la route, une erreur STOP GLOBAL remontée par
  // le Core est traduite par le même code et le même statut.
  if (typeof error === "string" && error.startsWith("STOP GLOBAL actif")) {
    status = 400;
    code = "STOP_GLOBAL_ACTIVE";
  }
  res.status(status).json({ ok: false, code, error });
}

function body(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

function textField(req: Request, key: string): string {
  const value = body(req)[key];
  return typeof value === "string" ? value.trim() : "";
}

function validateAction(value: unknown): CoreSensitiveAction | null {
  if (typeof value !== "string") return null;
  return (SENSITIVE_ACTIONS as readonly string[]).includes(value)
    ? (value as CoreSensitiveAction)
    : null;
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function schedulerInput(req: Request): Record<string, unknown> {
  const b = body(req);
  const action = recordField(b.action) ?? {};
  return {
    name: b.name,
    description: b.description,
    kind: b.kind,
    timezone: b.timezone,
    at: b.at,
    everyMs: b.everyMs,
    hour: b.hour,
    minute: b.minute,
    weekday: b.weekday,
    maxRuns: b.maxRuns,
    enabled: b.enabled,
    action: {
      type: action.type,
      text: action.text,
      ...(action.missionId ? { missionId: action.missionId } : {}),
      ...(action.maxConcurrency !== undefined ? { maxConcurrency: action.maxConcurrency } : {}),
    },
  };
}

/**
 * Phase 6 : la couche HTTP n'expose QUE les outils template déclaratifs.
 * Le registre applique la même règle côté Core (défense en profondeur).
 */
function toolDefinitionInput(req: Request): Record<string, unknown> {
  const b = body(req);
  const fields = Array.isArray(b.fields)
    ? b.fields
        .filter((field): field is Record<string, unknown> =>
          !!field && typeof field === "object" && !Array.isArray(field))
        .map((field) => ({
          name: field.name,
          type: field.type,
          ...(field.required !== undefined ? { required: field.required === true } : {}),
          ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
          ...(Array.isArray(field.enum) ? { enum: field.enum.map(String) } : {}),
        }))
    : [];
  return {
    name: b.name,
    description: b.description,
    kind: "template",
    fields,
    ...(typeof b.template === "string" ? { template: b.template } : {}),
    ...(b.maxOutputChars !== undefined ? { maxOutputChars: b.maxOutputChars } : {}),
    ...(b.enabled !== undefined ? { enabled: b.enabled === true } : {}),
  };
}

function toolContext(req: Request): ToolContext {
  const raw = recordField(body(req).context) ?? {};
  const text = (key: string): string | undefined =>
    typeof raw[key] === "string" && String(raw[key]).trim() ? String(raw[key]).trim().slice(0, 200) : undefined;
  const authenticated = authenticatedActor(req);
  const actor = authenticated && authenticated !== "local" && authenticated !== "probe"
    ? authenticated
    : text("actor");
  return {
    ...(actor ? { actor } : {}),
    ...(text("goal") ? { goal: text("goal") } : {}),
    ...(text("missionId") ? { missionId: text("missionId") } : {}),
    ...(text("agent") ? { agent: text("agent") } : {}),
  };
}

function failContextMemory(res: Response, err: unknown): void {
  if (err instanceof ContextMemoryError) {
    return fail(res, 400, err.code, err.message);
  }
  return fail(res, 500, "CONTEXT_MEMORY_ERROR", (err as Error)?.message ?? "Erreur mémoire contextuelle");
}

function failDevice(res: Response, err: unknown): void {
  if (err instanceof DeviceBundleError) {
    return fail(res, 400, err.code, err.message);
  }
  return fail(res, 500, "DEVICE_ERROR", (err as Error)?.message ?? "Erreur préparation multi-appareils");
}

/**
 * Phase 9.5 : en mode authentifié, l'acteur est attribué par le serveur.
 * En mode local (aucune auth), le champ `actor` reste accepté pour compatibilité
 * avec les outils et tests existants, mais il est borné et assaini.
 */
function deviceActor(req: Request): string {
  const authenticated = authenticatedActor(req);
  if (authenticated && authenticated !== "local" && authenticated !== "probe") {
    return authenticated;
  }
  const supplied = textField(req, "actor");
  return supplied ? supplied.replace(/[^\w.:@-]/g, "").slice(0, 64) || "user" : "user";
}

/**
 * Phase 9.5 : acteur à rattacher à un slot d'aperçu. Un acteur n'est lié que
 * s'il est authentifié par le serveur ou explicitement fourni : le mode local
 * sans acteur garde son comportement historique (aucun rattachement).
 */
function stagingActor(req: Request): string | undefined {
  const authenticated = authenticatedActor(req);
  if (authenticated && authenticated !== "local" && authenticated !== "probe") {
    return authenticated;
  }
  const supplied = textField(req, "actor");
  return supplied ? supplied.replace(/[^\w.:@-]/g, "").slice(0, 64) || undefined : undefined;
}

function failSkill(res: Response, err: unknown): void {
  if (err instanceof SkillRegistryError) {
    const status = err.code === "SKILL_NOT_FOUND" ? 404 : 400;
    res.status(status).json({
      ok: false,
      code: err.code,
      error: err.message,
      ...(err.issues ? { issues: err.issues } : {}),
    });
    return;
  }
  fail(res, 500, "SKILL_ERROR", (err as Error)?.message ?? "Erreur Skills");
}

export function createCoreRouter(options: CoreRouterOptions = {}): Router {
  const router = Router();
  let corePromise: Promise<JarvisCore> | null = null;
  const getCore = (): Promise<JarvisCore> => {
    if (!corePromise) {
      const core = new JarvisCore({
        storage: options.storage ?? new FileCoreStorage(),
        ...(options.memory ? { memory: options.memory } : {}),
      });
      corePromise = core.init().then(() => {
        options.onReady?.(core);
        return core;
      });
    }
    return corePromise;
  };

  if (options.eagerStart) {
    void getCore().catch((err) => {
      console.error("[core] initialisation au démarrage échouée :", (err as Error)?.message ?? "erreur inconnue");
    });
  }

  /*
   * Phase 9.5 : STOP GLOBAL est appliqué dans le Core lui-même
   * (`JarvisCore.assertMutationAllowed`) et par les moteurs qui renvoient déjà
   * un résultat structuré (SkillExecutor, ToolRegistry, AgentOrchestrator,
   * DeviceManager, ContextMemory). Un garde HTTP uniforme écraserait ces
   * contrats de réponse ; il n'est donc pas monté ici. Les erreurs STOP sont
   * mappées de façon cohérente par `fail()` (voir plus haut).
   */

  router.get("/core/status", async (_req, res) => {
    try {
      const core = await getCore();
      ok(res, { status: core.getStatus() });
    } catch (err) {
      fail(res, 500, "CORE_UNAVAILABLE", (err as Error)?.message ?? "Core indisponible");
    }
  });

  router.get("/core/missions", async (req, res) => {
    try {
      const core = await getCore();
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      ok(res, { missions: status ? core.listMissions(status as never) : core.listMissions() });
    } catch (err) {
      fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.get("/core/missions/:id", async (req, res) => {
    try {
      const core = await getCore();
      const mission = core.getMission(req.params.id);
      if (!mission) return fail(res, 404, "MISSION_NOT_FOUND", "Mission introuvable");
      return ok(res, { mission });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/classify", async (req, res) => {
    try {
      const core = await getCore();
      const text = textField(req, "text");
      if (!text) return fail(res, 400, "TEXT_REQUIRED", "Le champ 'text' est requis.");
      return ok(res, { classification: core.classify({ text, mode: textField(req, "mode") || undefined }) });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/handle", async (req, res) => {
    try {
      const core = await getCore();
      const text = textField(req, "text");
      if (!text) return fail(res, 400, "TEXT_REQUIRED", "Le champ 'text' est requis.");
      const context = body(req).context;
      const response = await core.handle({
        text,
        mode: textField(req, "mode") || undefined,
        ...(context && typeof context === "object" ? { context: context as Record<string, unknown> } : {}),
      });
      return ok(res, { response });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/missions", async (req, res) => {
    try {
      const core = await getCore();
      const goal = textField(req, "goal");
      if (!goal) return fail(res, 400, "GOAL_REQUIRED", "Le champ 'goal' est requis.");
      const rawTasks = body(req).tasks;
      const tasks = Array.isArray(rawTasks)
        ? rawTasks.map((t) => {
            const item = t as Record<string, unknown>;
            return { name: String(item.name ?? "Tâche"), description: String(item.description ?? item.name ?? "") };
          })
        : [];
      const mission = await core.createMission(goal, tasks);
      return ok(res, { mission });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/missions/:id/start", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { mission: await core.startMission(req.params.id) });
    } catch (err) {
      return fail(res, 400, "MISSION_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/missions/:id/pause", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { mission: await core.pauseMission(req.params.id, textField(req, "reason") || undefined) });
    } catch (err) {
      return fail(res, 400, "MISSION_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/missions/:id/resume", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { mission: await core.resumeMission(req.params.id) });
    } catch (err) {
      return fail(res, 400, "MISSION_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/missions/:id/cancel", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { mission: await core.cancelMission(req.params.id, textField(req, "reason") || undefined) });
    } catch (err) {
      return fail(res, 400, "MISSION_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/missions/:id/tasks/:taskId/complete", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, {
        mission: await core.completeTask(req.params.id, req.params.taskId, textField(req, "result") || undefined),
      });
    } catch (err) {
      return fail(res, 400, "TASK_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/missions/:id/tasks/:taskId/fail", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, {
        mission: await core.failTask(req.params.id, req.params.taskId, textField(req, "error") || undefined),
      });
    } catch (err) {
      return fail(res, 400, "TASK_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  /** STOP GLOBAL — interrompt toutes les missions actives. */
  router.post("/core/stop", async (req, res) => {
    try {
      const core = await getCore();
      const result = await core.stopAll(textField(req, "reason") || "STOP GLOBAL");
      ok(res, { result, missions: core.listMissions() });
    } catch (err) {
      fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.get("/core/audit", async (req, res) => {
    try {
      const core = await getCore();
      const limit = Number(req.query.limit ?? 100);
      ok(res, {
        audit: core.listAudit({
          ...(typeof req.query.actor === "string" ? { actor: req.query.actor } : {}),
          ...(typeof req.query.action === "string" ? { action: req.query.action } : {}),
          ...(Number.isFinite(limit) ? { limit } : {}),
        }),
      });
    } catch (err) {
      fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/permissions/check", async (req, res) => {
    try {
      const core = await getCore();
      const action = validateAction(body(req).action);
      if (!action) return fail(res, 400, "INVALID_ACTION", "Action sensible inconnue.");
      const target = typeof body(req).target === "string" ? (body(req).target as string) : undefined;
      return ok(res, {
        decision: core.checkPermission({
          action,
          title: textField(req, "title") || action,
          ...(target ? { target } : {}),
        }),
      });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/permissions/approve", async (req, res) => {
    try {
      const core = await getCore();
      const action = validateAction(body(req).action);
      if (!action) return fail(res, 400, "INVALID_ACTION", "Action sensible inconnue.");
      const target = typeof body(req).target === "string" ? (body(req).target as string) : undefined;
      return ok(res, { decision: await core.approve(action, target) });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.post("/core/permissions/deny", async (req, res) => {
    try {
      const core = await getCore();
      const action = validateAction(body(req).action);
      if (!action) return fail(res, 400, "INVALID_ACTION", "Action sensible inconnue.");
      const target = typeof body(req).target === "string" ? (body(req).target as string) : undefined;
      return ok(res, { decision: await core.deny(action, target) });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  router.get("/core/memory/search", async (req, res) => {
    try {
      const core = await getCore();
      const q = typeof req.query.q === "string" ? req.query.q : "";
      ok(res, { snippets: await core.searchMemory(q, 8) });
    } catch (err) {
      fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  // ---------- Phase 4 : système multi-agents ----------

  router.get("/core/agents", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, { agents: core.listAgents() });
    } catch (err) {
      return fail(res, 500, "AGENT_ERROR", (err as Error)?.message ?? "Erreur agents");
    }
  });

  router.get("/core/agents/runs", async (req, res) => {
    try {
      const core = await getCore();
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      return ok(res, { runs: core.listAgentRuns(status as never) });
    } catch (err) {
      return fail(res, 500, "AGENT_ERROR", (err as Error)?.message ?? "Erreur agents");
    }
  });

  router.get("/core/agents/runs/:id", async (req, res) => {
    try {
      const core = await getCore();
      const run = core.getAgentRun(req.params.id);
      if (!run) return fail(res, 404, "AGENT_RUN_NOT_FOUND", "Run agent introuvable");
      return ok(res, { run });
    } catch (err) {
      return fail(res, 500, "AGENT_ERROR", (err as Error)?.message ?? "Erreur agents");
    }
  });

  router.get("/core/agents/runs/:id/memory", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { memory: core.listAgentMemory(req.params.id) });
    } catch (err) {
      return fail(res, 500, "AGENT_ERROR", (err as Error)?.message ?? "Erreur agents");
    }
  });

  router.post("/core/agents/runs", async (req, res) => {
    try {
      const core = await getCore();
      const missionId = textField(req, "missionId");
      if (!missionId) return fail(res, 400, "MISSION_REQUIRED", "Le champ 'missionId' est requis.");
      const options = recordField(body(req).options) ?? {};
      const run = await core.createAgentRun(missionId, options as never);
      return ok(res, { run });
    } catch (err) {
      return fail(res, 400, "AGENT_ERROR", (err as Error)?.message ?? "Erreur agents");
    }
  });

  router.post("/core/agents/runs/:id/run", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { run: await core.runAgents(req.params.id) });
    } catch (err) {
      return fail(res, 400, "AGENT_ERROR", (err as Error)?.message ?? "Erreur agents");
    }
  });

  router.post("/core/agents/dispatch", async (req, res) => {
    try {
      const core = await getCore();
      const missionId = textField(req, "missionId");
      if (!missionId) return fail(res, 400, "MISSION_REQUIRED", "Le champ 'missionId' est requis.");
      const options = recordField(body(req).options) ?? {};
      return ok(res, { run: await core.dispatchMission(missionId, options as never) });
    } catch (err) {
      return fail(res, 400, "AGENT_ERROR", (err as Error)?.message ?? "Erreur agents");
    }
  });

  router.post("/core/agents/runs/:id/steps/:stepId/validate", async (req, res) => {
    try {
      const core = await getCore();
      const decision = textField(req, "decision") === "reject" ? "reject" : "approve";
      return ok(res, { run: await core.validateAgentStep(req.params.id, req.params.stepId, decision) });
    } catch (err) {
      return fail(res, 400, "AGENT_VALIDATION_ERROR", (err as Error)?.message ?? "Erreur de validation");
    }
  });

  // ---------- Phase 5 : Scheduler et Event Monitor ----------

  router.get("/core/scheduler", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, {
        scheduler: core.getStatus().scheduler,
        rules: core.listSchedulerRules(),
      });
    } catch (err) {
      return fail(res, 500, "SCHEDULER_ERROR", (err as Error)?.message ?? "Erreur scheduler");
    }
  });

  router.get("/core/scheduler/tasks", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, { tasks: core.listScheduledTasks() });
    } catch (err) {
      return fail(res, 500, "SCHEDULER_ERROR", (err as Error)?.message ?? "Erreur scheduler");
    }
  });

  router.post("/core/scheduler/tasks", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { task: await core.createScheduledTask(schedulerInput(req) as never) });
    } catch (err) {
      return fail(res, 400, "SCHEDULER_TASK_ERROR", (err as Error)?.message ?? "Tâche invalide");
    }
  });

  router.post("/core/scheduler/tasks/:id/update", async (req, res) => {
    try {
      const core = await getCore();
      const patch: Record<string, unknown> = {};
      for (const key of ["name", "description", "enabled", "kind", "timezone", "at", "everyMs", "hour", "minute", "weekday", "maxRuns"]) {
        if (body(req)[key] !== undefined) patch[key] = body(req)[key];
      }
      const action = recordField(body(req).action);
      if (action) patch.action = action;
      return ok(res, { task: await core.updateScheduledTask(req.params.id, patch as never) });
    } catch (err) {
      return fail(res, 400, "SCHEDULER_TASK_ERROR", (err as Error)?.message ?? "Mise à jour invalide");
    }
  });

  router.post("/core/scheduler/tasks/:id/trigger", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { entry: await core.triggerScheduledTask(req.params.id, textField(req, "source") || "user") });
    } catch (err) {
      return fail(res, 400, "SCHEDULER_TRIGGER_ERROR", (err as Error)?.message ?? "Déclenchement impossible");
    }
  });

  router.post("/core/scheduler/tasks/:id/remove", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { result: await core.removeScheduledTask(req.params.id) });
    } catch (err) {
      return fail(res, 400, "SCHEDULER_TASK_ERROR", (err as Error)?.message ?? "Suppression impossible");
    }
  });

  router.post("/core/scheduler/tick", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { result: await core.schedulerTick(textField(req, "source") || "api") });
    } catch (err) {
      return fail(res, 500, "SCHEDULER_TICK_ERROR", (err as Error)?.message ?? "Tick impossible");
    }
  });

  router.get("/core/scheduler/events", async (req, res) => {
    try {
      const core = await getCore();
      const limit = Number(req.query.limit) || undefined;
      return ok(res, { events: core.listSchedulerEvents(limit) });
    } catch (err) {
      return fail(res, 500, "SCHEDULER_ERROR", (err as Error)?.message ?? "Erreur scheduler");
    }
  });

  router.get("/core/scheduler/history", async (req, res) => {
    try {
      const core = await getCore();
      const limit = Number(req.query.limit) || undefined;
      return ok(res, { history: core.listSchedulerHistory(limit) });
    } catch (err) {
      return fail(res, 500, "SCHEDULER_ERROR", (err as Error)?.message ?? "Erreur scheduler");
    }
  });

  router.get("/core/scheduler/rules", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, { rules: core.listSchedulerRules() });
    } catch (err) {
      return fail(res, 500, "SCHEDULER_ERROR", (err as Error)?.message ?? "Erreur scheduler");
    }
  });

  router.get("/core/scheduler/alerts", async (req, res) => {
    try {
      const core = await getCore();
      const limit = Number(req.query.limit) || undefined;
      return ok(res, { alerts: core.listSchedulerAlerts(limit) });
    } catch (err) {
      return fail(res, 500, "SCHEDULER_ERROR", (err as Error)?.message ?? "Erreur scheduler");
    }
  });

  // ---------- Phase 6 : Tool Registry (outils déclaratifs) ----------

  router.get("/core/tools", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, {
        tools: core.getStatus().tools,
        definitions: core.listTools(),
      });
    } catch (err) {
      return fail(res, 500, "TOOLS_ERROR", (err as Error)?.message ?? "Erreur registre d'outils");
    }
  });

  router.get("/core/tools/executions", async (req, res) => {
    try {
      const core = await getCore();
      const limit = Number(req.query.limit) || undefined;
      return ok(res, { executions: core.listToolExecutions(limit) });
    } catch (err) {
      return fail(res, 500, "TOOLS_ERROR", (err as Error)?.message ?? "Erreur registre d'outils");
    }
  });

  router.post("/core/tools", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { tool: await core.registerTool(toolDefinitionInput(req) as unknown as NewToolDefinition) });
    } catch (err) {
      return fail(res, 400, "TOOL_REGISTER_ERROR", (err as Error)?.message ?? "Outil invalide");
    }
  });

  router.post("/core/tools/:name/toggle", async (req, res) => {
    try {
      const core = await getCore();
      const enabled = body(req).enabled === true;
      return ok(res, { tool: await core.setToolEnabled(req.params.name, enabled) });
    } catch (err) {
      return fail(res, 400, "TOOL_TOGGLE_ERROR", (err as Error)?.message ?? "Outil introuvable");
    }
  });

  router.post("/core/tools/:name/execute", async (req, res) => {
    try {
      const core = await getCore();
      const input = recordField(body(req).input) ?? {};
      return ok(res, { result: await core.executeTool(req.params.name, input, toolContext(req)) });
    } catch (err) {
      return fail(res, 400, "TOOL_EXECUTE_ERROR", (err as Error)?.message ?? "Exécution impossible");
    }
  });

  // ---------- Phase 7 : préparation multi-appareils (strictement locale) ----------

  router.get("/core/devices", async (_req, res) => {
    try {
      const core = await getCore();
      const status = core.getStatus();
      return ok(res, { devices: core.getDevices(), storage: status.storage });
    } catch (err) {
      return failDevice(res, err);
    }
  });

  router.post("/core/devices/readiness", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { devices: await core.refreshDeviceReadiness(deviceActor(req)) });
    } catch (err) {
      return failDevice(res, err);
    }
  });

  router.post("/core/devices/identity", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { device: await core.renameDevice(textField(req, "label"), deviceActor(req)) });
    } catch (err) {
      return failDevice(res, err);
    }
  });

  /** Export local : le client décide seul de télécharger le texte renvoyé. */
  router.get("/core/devices/export", async (_req, res) => {
    try {
      const core = await getCore();
      const exported = await core.exportDeviceBundle();
      return ok(res, { text: exported.text, manifest: exported.manifest, bytes: exported.bytes });
    } catch (err) {
      return failDevice(res, err);
    }
  });

  /** Aperçu : valide et prépare sans jamais appliquer ni transmettre. */
  router.post("/core/devices/preview", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { preview: core.previewDeviceImport(textField(req, "text"), stagingActor(req)) });
    } catch (err) {
      return failDevice(res, err);
    }
  });

  /** Application : `confirm: true` explicite, additive, journalisée, sans sync. */
  router.post("/core/devices/import", async (req, res) => {
    try {
      const core = await getCore();
      const b = body(req);
      return ok(res, {
        record: await core.applyDeviceImport(
          textField(req, "stagedId"),
          deviceActor(req),
          b.confirm === true
        ),
      });
    } catch (err) {
      return failDevice(res, err);
    }
  });

  // ---------- Phase 8 : mémoire contextuelle locale ----------

  router.get("/core/context-memory", async (req, res) => {
    try {
      const core = await getCore();
      const limit = Number(req.query.limit ?? 20);
      return ok(res, {
        status: core.getContextMemoryStatus(),
        entries: core.listContextMemory(Number.isFinite(limit) ? limit : 20),
      });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  router.get("/core/context-memory/duplicates", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, { duplicates: core.listContextDuplicates() });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  router.post("/core/context-memory/remember", async (req, res) => {
    try {
      const core = await getCore();
      const b = body(req);
      return ok(res, { entry: await core.remember(b as unknown as Parameters<JarvisCore["remember"]>[0]) });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  router.post("/core/context-memory/recall", async (req, res) => {
    try {
      const core = await getCore();
      const b = body(req);
      const kinds = Array.isArray(b.kinds)
        ? b.kinds.filter((k): k is ContextMemoryKind =>
            k === "episode" || k === "fact" || k === "preference" || k === "rule" || k === "decision")
        : undefined;
      return ok(res, {
        result: core.recallContext(textField(req, "query"), {
          ...(typeof b.limit === "number" ? { limit: b.limit } : {}),
          ...(b.scope === "short" || b.scope === "long" ? { scope: b.scope } : {}),
          ...(kinds ? { kinds } : {}),
        }),
      });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  /** Partage contrôlé : la politique `share` de chaque souvenir est appliquée. */
  router.post("/core/context-memory/share", async (req, res) => {
    try {
      const core = await getCore();
      const agent = textField(req, "agent");
      const limit = Number(body(req).limit ?? 5);
      return ok(res, {
        context: core.shareContextWithAgent(
          agent as Parameters<JarvisCore["shareContextWithAgent"]>[0],
          textField(req, "query"),
          Number.isFinite(limit) ? limit : 5
        ),
      });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  router.post("/core/context-memory/consolidate", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, { result: await core.consolidateContextMemory(), status: core.getContextMemoryStatus() });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  router.post("/core/context-memory/duplicates/:id/review", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { pair: await core.reviewContextDuplicate(req.params.id) });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  router.post("/core/context-memory/bridge/memories", async (req, res) => {
    try {
      const core = await getCore();
      const b = body(req);
      return ok(res, {
        result: await core.bridgeMemories(
          (Array.isArray(b.items) ? b.items : []) as Parameters<JarvisCore["bridgeMemories"]>[0],
          b.confirm === true
        ),
      });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  router.post("/core/context-memory/bridge/conversations", async (req, res) => {
    try {
      const core = await getCore();
      const b = body(req);
      return ok(res, {
        result: await core.bridgeConversationExcerpts(
          (Array.isArray(b.items) ? b.items : []) as Parameters<JarvisCore["bridgeConversationExcerpts"]>[0],
          b.confirm === true
        ),
      });
    } catch (err) {
      return failContextMemory(res, err);
    }
  });

  // ---------- Phase 3 : Skills dynamiques (workflows déclaratifs) ----------

  function skillFilter(req: Request): Parameters<JarvisCore["listSkills"]>[0] {
    const q = req.query;
    const enabled = q.enabled === "true" ? true : q.enabled === "false" ? false : undefined;
    const limit = Number(q.limit ?? 200);
    const allowedStatuses = ["draft", "validated", "active", "disabled", "failed"];
    const status = typeof q.status === "string" && allowedStatuses.includes(q.status)
      ? (q.status as "draft" | "validated" | "active" | "disabled" | "failed")
      : undefined;
    return {
      ...(typeof q.category === "string" ? { category: q.category } : {}),
      ...(typeof q.tag === "string" ? { tag: q.tag } : {}),
      ...(typeof q.search === "string" ? { search: q.search } : {}),
      ...(status ? { status } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    };
  }

  // Routes fixes AVANT /core/skills/:id pour éviter toute capture ambiguë.
  router.get("/core/skills/categories", async (_req, res) => {
    try {
      const core = await getCore();
      return ok(res, { categories: core.listSkillCategories() });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.get("/core/skills/matches", async (req, res) => {
    try {
      const core = await getCore();
      const goal = typeof req.query.goal === "string" ? req.query.goal : "";
      const limit = Number(req.query.limit ?? 3);
      return ok(res, { matches: core.matchSkill(goal, Number.isFinite(limit) ? limit : 3) });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.get("/core/skills/executions", async (req, res) => {
    try {
      const core = await getCore();
      const limit = Number(req.query.limit ?? 50);
      return ok(res, {
        executions: core.listSkillExecutions({
          ...(typeof req.query.skillId === "string" ? { skillId: req.query.skillId } : {}),
          ...(typeof req.query.actor === "string" ? { actor: req.query.actor } : {}),
          ...(Number.isFinite(limit) ? { limit } : {}),
        }),
      });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.post("/core/skills/validate", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { validation: core.validateSkill(body(req)) });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.get("/core/skills", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { skills: core.listSkills(skillFilter(req)) });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.post("/core/skills", async (req, res) => {
    try {
      const core = await getCore();
      const skill = await core.createSkill(body(req) as unknown as NewSkillInput);
      return ok(res, { skill });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.get("/core/skills/:id", async (req, res) => {
    try {
      const core = await getCore();
      const skill = core.getSkill(req.params.id);
      if (!skill) return fail(res, 404, "SKILL_NOT_FOUND", "Compétence introuvable");
      return ok(res, { skill });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.put("/core/skills/:id", async (req, res) => {
    try {
      const core = await getCore();
      const skill = await core.updateSkill(
        req.params.id,
        body(req) as Partial<NewSkillInput>,
        "user",
        textField(req, "note") || "Mise à jour via l'interface"
      );
      return ok(res, { skill });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.delete("/core/skills/:id", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { deleted: await core.deleteSkill(req.params.id) });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.post("/core/skills/:id/test", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { test: await core.testSkill(req.params.id) });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.post("/core/skills/:id/enable", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { skill: await core.enableSkill(req.params.id) });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.post("/core/skills/:id/disable", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { skill: await core.disableSkill(req.params.id, "user", textField(req, "reason") || undefined) });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  router.post("/core/skills/:id/execute", async (req, res) => {
    try {
      const core = await getCore();
      const input = recordField(body(req).input) ?? {};
      const goal = textField(req, "goal") || undefined;
      const result = await core.executeSkill(req.params.id, input, { ...(goal ? { goal } : {}) });
      return ok(res, { execution: result.execution, output: result.output });
    } catch (err) {
      return failSkill(res, err);
    }
  });

  /** Lève STOP GLOBAL de façon explicite (ne reprend pas les missions en pause). */
  router.post("/core/resume", async (req, res) => {
    try {
      const core = await getCore();
      return ok(res, { result: await core.resume(textField(req, "reason") || "Reprise explicite") });
    } catch (err) {
      return fail(res, 500, "CORE_ERROR", (err as Error)?.message ?? "Erreur");
    }
  });

  return router;
}
