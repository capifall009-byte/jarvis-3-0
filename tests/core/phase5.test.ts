/**
 * Suite de tests Phase 5 — Scheduler & Event Monitor (node:test, zéro dépendance).
 * Lance avec : npm run test:core
 *
 * Couvre : validation IANA, créneaux quotidiens/hebdomadaires/intervalles,
 * déduplication persistée, historique, limites, déclenchement manuel,
 * surveillance d'audit, STOP GLOBAL, persistance, routes HTTP et non-régression.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import { SchedulerEngine } from "../../src/core/scheduler/SchedulerEngine.ts";
import { createCoreRouter } from "../../server/modules/core/coreRoute.ts";
import type { CoreState, CoreStorage } from "../../src/core/types.ts";
import type { NewSkillInput } from "../../src/core/skills/types.ts";
import type { NewScheduledTask } from "../../src/core/scheduler/types.ts";

let counter = 0;
let nowMs = 1_700_000_300_000;
const now = (): number => nowMs;
const id = (prefix: string): string => `${prefix}_test_${counter++}`;
const tickMs = (ms: number): void => { nowMs += ms; };

async function makeCore(storage: CoreStorage = new MemoryCoreStorage()): Promise<JarvisCore> {
  const core = new JarvisCore({ storage, now, id });
  await core.init();
  return core;
}

const reminder = (name = "Rappel quotidien", overrides: Partial<NewScheduledTask> = {}): NewScheduledTask => ({
  name,
  kind: "daily",
  timezone: "Europe/Paris",
  hour: 9,
  minute: 0,
  action: { type: "reminder", text: "Rappel local de test" },
  ...overrides,
});

test("validation : fuseaux IANA, bornes de planification et action déclarative", async () => {
  const core = await makeCore();
  await assert.rejects(() => core.createScheduledTask(reminder("Mauvais fuseau", { timezone: "Mars/Olympus" })), /fuseau horaire/i);
  await assert.rejects(() => core.createScheduledTask(reminder("Intervalle court", { kind: "interval", everyMs: 1000 })), /intervalle/i);
  await assert.rejects(() => core.createScheduledTask(reminder("Heure invalide", { hour: 25 })), /heure/i);
  await assert.rejects(() => core.createScheduledTask(reminder("Mission sans cible", {
    action: { type: "mission", text: "Démarrer", missionId: "" },
  })), /mission est requise/i);

  const task = await core.createScheduledTask(reminder("Tâche valide"));
  assert.equal(task.enabled, false, "rien ne démarre sans activation explicite");
  assert.equal(task.timezone, "Europe/Paris");
  assert.ok(task.nextRunAt && task.nextRunAt > nowMs, "prochaine occurrence calculée");
  assert.equal(core.listAudit({ action: "scheduler_task_created" }).length, 1);
});

test("quotidien : une exécution par jour local, fuseau respecté, déduplication", async () => {
  const core = await makeCore();
  const task = await core.createScheduledTask(reminder("Quotidien actif", { enabled: true }));
  assert.ok(task.nextRunAt);
  nowMs = task.nextRunAt;

  const first = await core.schedulerTick("test");
  assert.equal(first.due, 1);
  assert.equal(first.executed, 1);
  assert.equal((await core.schedulerTick("test")).due, 0, "deux ticks dans le même créneau ne relancent rien");

  tickMs(12 * 60 * 60 * 1000);
  assert.equal((await core.schedulerTick("test")).executed, 0, "aucun rattrapage le même jour local");

  const stored = core.getScheduledTask(task.id)!;
  assert.ok(stored.nextRunAt);
  nowMs = stored.nextRunAt;
  const nextDay = await core.schedulerTick("test");
  assert.equal(nextDay.executed, 1, "nouveau jour local = nouveau créneau");

  const history = core.listSchedulerHistory();
  assert.equal(history.length, 2);
  assert.notEqual(history[0].slot, history[1].slot);
  assert.ok(history.every((entry) => entry.outcome === "success"));
  assert.equal(core.getScheduledTask(task.id)!.runs, 2);
});

test("intervalle : créneaux bornés, limite d'exécutions et historique audité", async () => {
  const core = await makeCore();
  const task = await core.createScheduledTask(reminder("Tâche intervalle", {
    kind: "interval", everyMs: 60 * 60 * 1000, maxRuns: 2, enabled: true,
  }));

  tickMs(60 * 60 * 1000);
  assert.equal((await core.schedulerTick("test")).executed, 1);
  tickMs(60 * 60 * 1000);
  assert.equal((await core.schedulerTick("test")).executed, 1);
  tickMs(60 * 60 * 1000);
  const limited = await core.schedulerTick("test");
  assert.equal(limited.due, 0);
  assert.equal(limited.skipped, 1);
  assert.equal(core.getScheduledTask(task.id)!.runs, 2);
  assert.equal(core.listSchedulerHistory().length, 2);
  assert.ok(core.listSchedulerEvents().some((event) => event.kind === "task_skipped"));
});

test("hebdomadaire : jour local respecté et déduplication sur 7 jours", async () => {
  const core = await makeCore();
  const task = await core.createScheduledTask(reminder("Rapport hebdo", {
    kind: "weekly", weekday: 1, hour: 8, minute: 30, enabled: true,
  }));
  let next = core.getScheduledTask(task.id)!.nextRunAt!;
  nowMs = next;
  assert.equal((await core.schedulerTick("test")).executed, 1);
  assert.equal((await core.schedulerTick("test")).due, 0);

  next = core.getScheduledTask(task.id)!.nextRunAt!;
  assert.ok(next > nowMs);
  nowMs = next;
  assert.equal((await core.schedulerTick("test")).executed, 1);
  assert.equal(core.listSchedulerHistory().length, 2);
});

test("fuseau : la même heure locale dépend du fuseau déclaré", () => {
  const base = new SchedulerEngine({
    state: { tasks: [], events: [], history: [], rules: [], alerts: [], lastTickAt: 0, tickCount: 0, lastAuditIndex: 0 },
    audit: { record: () => undefined, list: () => [] },
    now,
    id,
  });
  const paris = base.createTask(reminder("Paris", { timezone: "Europe/Paris" }));
  const tokyo = base.createTask(reminder("Tokyo", { timezone: "Asia/Tokyo" }));
  const nextParis = base.computeNext(paris, nowMs)!;
  const nextTokyo = base.computeNext(tokyo, nowMs)!;
  assert.ok(Math.abs(nextTokyo - nextParis) >= 7 * 60 * 60 * 1000, "décalage local réel, pas une chaîne codée en dur");
});

test("STOP GLOBAL : tick bloqué, planifications dormantes, levé par resume()", async () => {
  const storage = new MemoryCoreStorage();
  const core = await makeCore(storage);
  const task = await core.createScheduledTask(reminder("Tâche STOP", { enabled: true }));
  const target = core.getScheduledTask(task.id)!.nextRunAt!;
  nowMs = target;

  await core.stopAll("STOP Phase 5");
  const blocked = await core.schedulerTick("test");
  assert.equal(blocked.executed, 0);
  assert.equal(blocked.blocked, 1);
  assert.equal(core.listSchedulerHistory().length, 0);
  assert.ok(core.listSchedulerEvents().some((event) => event.kind === "stop_blocked"));

  const restarted = await makeCore(storage);
  assert.equal(restarted.isStopped(), true);
  assert.equal((await restarted.schedulerTick("test")).executed, 0);
  await restarted.resume("Reprise Phase 5");
  assert.equal((await restarted.schedulerTick("test")).executed, 1, "reprise sans pénalité perdant le créneau");
});

test("Event Monitor : alertes sur audit, déduplication et pas de notification externe", async () => {
  const core = await makeCore();
  const mission = await core.createMission("Mission monitor", [{ name: "Tâche de test" }]);
  await core.startMission(mission.id);
  await core.failTask(mission.id, mission.tasks[0].id, "échec contrôlé");

  const first = await core.schedulerTick("test");
  assert.equal(first.alerts, 1);
  assert.equal(core.listSchedulerAlerts().length, 1);
  assert.equal((await core.schedulerTick("test")).alerts, 0, "jamais deux alertes pour le même événement");

  await core.stopAll("STOP monitor");
  const afterStop = await core.schedulerTick("test");
  assert.ok(afterStop.alerts >= 1, "le monitor surveille aussi STOP GLOBAL");
  assert.ok(core.listSchedulerAlerts().some((alert) => alert.ruleId === "rule_global_stop"));
  assert.ok(core.listSchedulerAlerts().every((alert) => typeof alert.eventId === "string"));
});

test("déclenchement manuel : créneau distinct, journalisé, bloqué sous STOP", async () => {
  const core = await makeCore();
  const task = await core.createScheduledTask(reminder("Manuel"));
  const entry = await core.triggerScheduledTask(task.id, "test");
  assert.equal(entry.outcome, "success");
  assert.ok(entry.slot.startsWith("manual|test|"), "créneau manuel distinct du tick");
  assert.equal(core.getScheduledTask(task.id)!.runs, 1);
  assert.equal(core.listAudit({ action: "scheduler_task_triggered" }).length, 1);

  await core.stopAll("STOP manuel");
  await assert.rejects(() => core.triggerScheduledTask(task.id), /STOP GLOBAL/);
  await assert.rejects(() => core.removeScheduledTask(task.id), /STOP GLOBAL/);
  assert.ok(core.getScheduledTask(task.id), "la tâche reste intacte sous STOP");
});

test("persistance : état Phase 2/3/4 sans scheduler normalisé, tâches et historique rechargés", async () => {
  const storage = new MemoryCoreStorage();
  await storage.save({
    version: 1,
    missions: [{ id: "mis_legacy", goal: "Mission historique", status: "planned", tasks: [], createdAt: 1, updatedAt: 1, context: {} }],
    audit: [], approvals: {}, skills: [], skillExecutions: [], agentRuns: [],
    stop: { active: false, reason: "", requestedAt: 0 },
  } as unknown as CoreState);

  const core = await makeCore(storage);
  assert.equal(core.listMissions().length, 1);
  assert.equal(core.listScheduledTasks().length, 0);
  assert.equal(core.listSchedulerRules().length, 4, "règles par défaut créées de façon additive");

  const task = await core.createScheduledTask(reminder("Persistée", { enabled: true }));
  const target = core.getScheduledTask(task.id)!.nextRunAt!;
  nowMs = target;
  await core.schedulerTick("test");

  const reloaded = await makeCore(storage);
  assert.equal(reloaded.listMissions().length, 1, "mission historique préservée");
  assert.equal(reloaded.listScheduledTasks().length, 1);
  assert.equal(reloaded.listSchedulerHistory().length, 1);
  assert.equal(reloaded.getScheduledTask(task.id)!.lastSlot, core.getScheduledTask(task.id)!.lastSlot);
  assert.equal((await reloaded.schedulerTick("test")).due, 0, "créneau déjà traité après redémarrage");
});

test("statut Phase 5 : phase et capacités déclarés exactement", async () => {
  const core = await makeCore();
  const status = core.getStatus();
  assert.equal(status.identity.version, "4.0");
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.agentExecution, true);
  assert.equal(status.capabilities.dynamicSkills, true);
  assert.equal(status.capabilities.scheduler, true);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.equal(status.scheduler?.tasks, 0);
  assert.equal(status.scheduler?.rules, 4);
});

test("routes HTTP /api/core/scheduler/* : CRUD, tick, historique, alertes et STOP", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api", createCoreRouter({ storage: new MemoryCoreStorage() }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/core`;
  const post = (path: string, payload: unknown) => fetch(`${base}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const get = (path: string) => fetch(`${base}${path}`);

  const overview = await (await get("/scheduler")).json() as Record<string, any>;
  assert.ok(overview.scheduler && overview.rules.length === 4, "vue d'ensemble exposée");

  const created = await (await post("/scheduler/tasks", {
    name: "Tâche HTTP", kind: "daily", timezone: "Europe/Paris", hour: 9, minute: 0,
    action: { type: "reminder", text: "Rappel HTTP" },
  })).json() as Record<string, any>;
  assert.equal(created.ok, true);
  assert.equal(created.task.enabled, false);
  const taskId = created.task.id as string;

  const enabled = await (await post(`/scheduler/tasks/${taskId}/update`, { enabled: true })).json() as Record<string, any>;
  assert.equal(enabled.task.enabled, true);

  const manual = await (await post(`/scheduler/tasks/${taskId}/trigger`, { source: "http-test" })).json() as Record<string, any>;
  assert.equal(manual.entry.outcome, "success");

  const tick = await (await post("/scheduler/tick", { source: "http-test" })).json() as Record<string, any>;
  assert.equal(tick.ok, true);
  assert.equal(typeof tick.result.ts, "number");

  const tasks = await (await get("/scheduler/tasks")).json() as Record<string, any>;
  assert.equal(tasks.tasks.length, 1);
  const events = await (await get("/scheduler/events")).json() as Record<string, any>;
  assert.ok(events.events.length >= 1);
  const history = await (await get("/scheduler/history")).json() as Record<string, any>;
  assert.ok(history.history.length >= 1);
  const rules = await (await get("/scheduler/rules")).json() as Record<string, any>;
  assert.equal(rules.rules.length, 4);
  const alerts = await (await get("/scheduler/alerts")).json() as Record<string, any>;
  assert.equal(alerts.alerts.length, 0);

  await post("/stop", { reason: "STOP HTTP scheduler" });
  const status = await (await get("/status")).json() as Record<string, any>;
  assert.equal(status.status.stopActive, true);
  assert.equal(status.status.capabilities.scheduler, true);
  const removal = await post(`/scheduler/tasks/${taskId}/remove`, {});
  assert.equal(removal.status, 400);
  const removed = await removal.json() as Record<string, any>;
  assert.equal(removed.code, "STOP_GLOBAL_ACTIVE");
  const remaining = await (await get("/scheduler/tasks")).json() as Record<string, any>;
  assert.equal(remaining.tasks.length, 1);
  assert.equal(remaining.tasks[0].id, taskId, "la tâche reste intacte sous STOP");
});

test("non-régression : Skills, agents et missions restent opérationnels avec le scheduler", async () => {
  const core = await makeCore();
  const skillInput: NewSkillInput = {
    name: "Compétence non-régression Phase 5",
    description: "Vérifie le moteur de Skills avec le scheduler actif.",
    category: "test",
    parameters: [{ name: "sujet", type: "string", required: true, maxLength: 100 }],
    steps: [{ id: "render", kind: "template", template: "Synthèse {{params.sujet}}" }],
    tests: [{ name: "nominal", input: { sujet: "JARVIS" }, expect: { contains: "JARVIS" } }],
  };
  const skill = await core.createSkill(skillInput);
  await core.testSkill(skill.id);
  await core.enableSkill(skill.id);
  assert.equal((await core.executeSkill(skill.id, { sujet: "PHASE5" })).execution.status, "success");

  const mission = await core.handle({ text: "Crée un site web pour mon entreprise" });
  assert.equal(mission.kind, "mission");
  const run = await core.dispatchMission(mission.mission!.id);
  assert.equal(run.status, "completed", run.error ?? "run agent non terminé");

  const task = await core.createScheduledTask(reminder("Rappel final", { enabled: true }));
  nowMs = core.getScheduledTask(task.id)!.nextRunAt!;
  const result = await core.schedulerTick("test");
  assert.equal(result.executed, 1);
  assert.equal(core.getStatus().capabilities.scheduler, true);
  assert.equal(core.getStatus().capabilities.toolRegistry, true);
});
