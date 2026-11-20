/**
 * Suite de tests Phase 4 — Multi-Agent System (node:test, zéro dépendance).
 * Lance avec : npm run test:core
 *
 * Couvre : rôles distincts, routage, dépendances, concurrence bornée, mémoire
 * partagée, messages, retries limités, validation humaine, vérification,
 * STOP GLOBAL, persistance, routes HTTP et non-régression.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import { AgentRegistry, normalizeAgentId } from "../../src/core/agents/AgentRegistry.ts";
import { createCoreRouter } from "../../server/modules/core/coreRoute.ts";
import type { CoreState, CoreStorage } from "../../src/core/types.ts";
import type { NewSkillInput } from "../../src/core/skills/types.ts";

let counter = 0;
const now = (): number => 1_700_000_200_000 + counter++;
const id = (prefix: string): string => `${prefix}_test_${counter++}`;

async function makeCore(storage: CoreStorage = new MemoryCoreStorage()): Promise<JarvisCore> {
  const core = new JarvisCore({ storage, now, id });
  await core.init();
  return core;
}

async function missionWithTasks(core: JarvisCore, names: string[], permissions: string[] = []) {
  return core.createMission("Mission multi-agents de test", names.map((name, index) => ({
    name,
    description: name,
    agent: index === 0 ? "research" : undefined,
    ...(permissions[index] ? { permission: permissions[index] as never } : {}),
    dependsOn: index === 0 ? [] : [index - 1],
  })));
}

test("rôles : huit agents distincts, un seul coordinateur, routage déterministe", () => {
  const registry = new AgentRegistry();
  const roles = registry.list();
  assert.equal(roles.length, 8);
  assert.deepEqual(roles.map((r) => r.id), [
    "main", "research", "coding", "planning", "analysis", "creative", "verification", "memory",
  ]);
  assert.equal(roles.filter((r) => r.canDelegate).length, 1);
  assert.equal(roles.find((r) => r.id === "main")?.canDelegate, true);
  for (const role of roles) {
    assert.ok(role.responsibilities.length >= 3, `${role.id} doit avoir des responsabilités propres`);
  }
  assert.equal(registry.assign("Recherche d'informations"), "research");
  assert.equal(registry.assign("Implémente une API"), "coding");
  assert.equal(registry.assign("Décompose le plan en étapes"), "planning");
  assert.equal(registry.assign("Vérifie le résultat"), "verification");
  assert.equal(registry.assign("Indexe la mémoire contextuelle"), "memory");
  assert.equal(registry.assign("Tâche sans mot-clé"), "analysis");
  assert.equal(normalizeAgentId("chief"), "main");
  assert.equal(normalizeAgentId("developer"), "coding");
});

test("planification : dépendances préservées, vérification obligatoire, concurrence bornée", async () => {
  const core = await makeCore();
  const mission = await missionWithTasks(core, [
    "Collecte d'informations", "Analyse des données", "Rédaction du rapport",
  ]);
  const run = await core.createAgentRun(mission.id, { maxConcurrency: 2, maxRetries: 1 });

  assert.equal(run.status, "planned");
  assert.equal(run.steps.length, 4, "une étape de vérification est ajoutée automatiquement");
  assert.equal(run.steps[0].assignee, "research");
  assert.equal(run.steps[1].status, "pending");
  assert.equal(run.steps[1].dependencies[0], run.steps[0].id);
  assert.equal(run.steps[3].assignee, "verification");
  assert.equal(run.steps[3].dependencies.length, 3);
  assert.equal(run.config.maxConcurrency, 2);
  assert.equal(core.listAudit({ action: "agent_run_created" }).length, 1);
  assert.ok(run.messages.some((m) => m.from === "main" && m.subject === "affectation"));
});

test("coordination : exécution réelle, agents distincts, mémoire, messages et audit", async () => {
  const core = await makeCore();
  const mission = await missionWithTasks(core, [
    "Collecte d'informations", "Analyse des données", "Idée créative",
  ]);
  const run = await core.dispatchMission(mission.id, { maxConcurrency: 2 });

  assert.equal(run.status, "completed", run.error ?? "run non terminé");
  assert.ok(run.steps.every((s) => s.status === "done"));
  const assignees = new Set(run.steps.map((s) => s.assignee));
  for (const role of ["research", "analysis", "creative", "verification"]) {
    assert.ok(assignees.has(role as never), `le rôle ${role} doit collaborer`);
  }
  assert.ok(run.steps[0].output?.startsWith("SYNTHÈSE"), "le role Research produit sa propre synthèse");
  assert.ok(run.steps[3].output?.includes("VÉRIFICATION OK"));
  assert.equal(run.metrics.verifications, 1);
  assert.ok(run.metrics.maxConcurrentObserved >= 1 && run.metrics.maxConcurrentObserved <= 2);
  assert.ok(run.messages.length >= 8);
  assert.ok(run.messages.some((m) => m.from === "verification" && m.subject === "livraison_autorisee"));

  const memory = core.listAgentMemory(run.id);
  assert.ok(memory.length >= 3);
  assert.ok(memory.every((entry) => entry.runId === run.id && entry.provenance));
  assert.ok(core.listAudit({ action: "agent_step_completed" }).length >= 4);
  assert.equal(core.listAudit({ action: "agent_run_completed" }).length, 1);
});

test("validation humaine : action sensible bloquée puis autorisée explicitement", async () => {
  const core = await makeCore();
  const mission = await missionWithTasks(core, ["Action sensible à valider", "Analyse de contrôle"], ["deploy"]);
  const run = await core.dispatchMission(mission.id);

  assert.equal(run.status, "awaiting_validation");
  const sensitive = run.steps.find((s) => s.sensitive === "deploy")!;
  assert.equal(sensitive.status, "needs_validation");
  assert.ok(sensitive.validationReason?.includes("requires_approval"));
  assert.equal(core.checkPermission({ action: "deploy", title: "test", target: sensitive.id }).allowed, false);
  assert.equal(core.listAudit({ action: "agent_validation_required" }).length, 1);

  const validated = await core.validateAgentStep(run.id, sensitive.id, "approve", "tester");
  assert.equal(validated.status, "paused");
  assert.equal(sensitive.status, "pending");
  assert.equal(core.checkPermission({ action: "deploy", title: "test", target: sensitive.id }).allowed, true);

  const resumed = await core.runAgents(run.id);
  assert.equal(resumed.status, "completed", resumed.error ?? "reprise non terminée");
  assert.equal(core.listAudit({ action: "agent_validation_approved" }).length, 1);
});

test("validation humaine : refus annule le run sans contourner les permissions", async () => {
  const core = await makeCore();
  const mission = await missionWithTasks(core, ["Action sensible"], ["terminal"]);
  const run = await core.dispatchMission(mission.id);
  const sensitive = run.steps.find((s) => s.sensitive === "terminal")!;
  const rejected = await core.validateAgentStep(run.id, sensitive.id, "reject");
  assert.equal(rejected.status, "cancelled");
  assert.equal(core.checkPermission({ action: "terminal", title: "test", target: sensitive.id }).allowed, false);
  assert.equal(core.listAudit({ action: "agent_validation_rejected" }).length, 1);
});

test("erreurs : retries limités puis échec contrôlé sans livraison", async () => {
  const core = await makeCore();
  const skillInput: NewSkillInput = {
    name: "Étape qui échoue",
    description: "Compétence de test dont l'assertion échoue systématiquement.",
    category: "test",
    parameters: [{ name: "etape", type: "string", required: true, maxLength: 200 }],
    steps: [
      { id: "check", kind: "assert", value: "{{params.etape}}", check: "equals", expected: "attendu" },
    ],
    // Le test intégré réussit avec la valeur attendue ; l'agent transmet une
    // autre valeur, ce qui fait échouer l'assertion à chaque tentative.
    tests: [{ name: "cas nominal", input: { etape: "attendu" }, expect: { notEmpty: true } }],
  };
  const skill = await core.createSkill(skillInput);
  assert.equal((await core.testSkill(skill.id)).passed, true);
  const enabledSkill = await core.enableSkill(skill.id);
  assert.equal(enabledSkill.status, "active");

  const mission = await missionWithTasks(core, ["Étape défaillante"]);
  const run = await core.dispatchMission(mission.id, {
    maxRetries: 1,
    steps: [{ name: "Étape défaillante", skillId: skill.id }],
  });
  assert.equal(run.status, "failed");
  assert.equal(run.steps[0].attempts, 2, "au plus 1 retry");
  assert.equal(run.metrics.retries, 1);
  assert.equal(core.listAudit({ action: "agent_run_completed" }).length, 0);
  assert.ok(core.listAudit({ action: "agent_step_retry" }).length >= 1);
});

test("STOP GLOBAL : annule les runs, bloque la reprise, persiste après redémarrage", async () => {
  const storage = new MemoryCoreStorage();
  const core = await makeCore(storage);
  const mission = await missionWithTasks(core, ["Collecte d'informations", "Analyse des données"]);
  // Run encore « planned » : STOP GLOBAL doit l'annuler avant toute exécution.
  const run = await core.createAgentRun(mission.id);
  assert.equal(run.status, "planned");

  await core.stopAll("STOP Phase 4");
  assert.equal(core.getAgentRun(run.id)!.status, "cancelled");
  assert.ok(core.listAudit({ action: "agent_runs_stopped" }).length >= 1);

  const afterStop = await core.dispatchMission(mission.id);
  assert.equal(afterStop.status, "cancelled", "aucun run ne peut démarrer sous STOP GLOBAL");

  const restarted = await makeCore(storage);
  assert.equal(restarted.isStopped(), true);
  assert.equal(restarted.getAgentRun(run.id)!.status, "cancelled");
  const stillBlocked = await restarted.dispatchMission(mission.id);
  assert.equal(stillBlocked.status, "cancelled");

  await restarted.resume("Reprise Phase 4");
  const fresh = await restarted.dispatchMission(mission.id);
  assert.equal(fresh.status, "completed", fresh.error ?? "reprise impossible");
});

test("persistance : état Phase 2/3 sans agentRuns normalisé sans perte", async () => {
  const storage = new MemoryCoreStorage();
  await storage.save({
    version: 1,
    missions: [{ id: "mis_legacy", goal: "Mission historique", status: "planned", tasks: [], createdAt: 1, updatedAt: 1, context: {} }],
    audit: [],
    approvals: {},
    skills: [],
    skillExecutions: [],
    stop: { active: false, reason: "", requestedAt: 0 },
  } as unknown as CoreState);

  const core = await makeCore(storage);
  assert.equal(core.listMissions().length, 1);
  assert.equal(core.listAgentRuns().length, 0);
  const mission = await missionWithTasks(core, ["Analyse historique"]);
  const run = await core.dispatchMission(mission.id);
  const reloaded = await storage.load();
  assert.equal(reloaded.agentRuns.length, 1);
  assert.equal(reloaded.agentRuns[0].id, run.id);
  assert.ok(reloaded.missions.some((m) => m.id === "mis_legacy"), "la mission Phase 2 d'origine est préservée");
});

test("statut Phase 4 : agents réels,phase et capacités déclarés exactement", async () => {
  const core = await makeCore();
  const status = core.getStatus();
  assert.equal(status.identity.version, "4.0");
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.agentExecution, true);
  assert.equal(status.capabilities.dynamicSkills, true);
  assert.equal(status.capabilities.scheduler, true);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.equal(status.agents?.roles, 8);
  assert.equal(status.agents?.runs, 0);
});

test("routes HTTP /api/core/agents/* : rôles, création, run, mémoire, validation et STOP", async (t) => {
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
  const jsonPost = (path: string, payload: unknown) => fetch(`${base}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });

  const agentsRes = await fetch(`${base}/agents`);
  assert.equal(agentsRes.status, 200);
  assert.equal(((await agentsRes.json()) as Record<string, any>).agents.length, 8);

  const missionRes = await jsonPost("/missions", {
    goal: "Mission HTTP agents",
    tasks: [{ name: "Collecte d'informations" }, { name: "Analyse des données" }],
  });
  const missionId = ((await missionRes.json()) as Record<string, any>).mission.id as string;

  const createRes = await jsonPost("/agents/runs", { missionId, options: { maxConcurrency: 2 } });
  assert.equal(createRes.status, 200);
  const runId = ((await createRes.json()) as Record<string, any>).run.id as string;

  const runRes = await jsonPost(`/agents/runs/${runId}/run`, {});
  const runBody = (await runRes.json()) as Record<string, any>;
  assert.equal(runBody.run.status, "completed");

  const listRes = await fetch(`${base}/agents/runs`);
  assert.equal(((await listRes.json()) as Record<string, any>).runs.length, 1);
  const getRes = await fetch(`${base}/agents/runs/${runId}`);
  assert.equal(((await getRes.json()) as Record<string, any>).run.steps.length, 3);
  const memRes = await fetch(`${base}/agents/runs/${runId}/memory`);
  assert.ok(((await memRes.json()) as Record<string, any>).memory.length >= 2);

  const stopRes = await jsonPost("/stop", { reason: "STOP HTTP agents" });
  assert.equal(stopRes.status, 200);
  const statusRes = await fetch(`${base}/status`);
  const statusBody = (await statusRes.json()) as Record<string, any>;
  assert.equal(statusBody.status.capabilities.agentExecution, true);
  assert.equal(statusBody.status.stopActive, true);
});

test("non-régression : Skills et missions restent opérationnels avec les agents actifs", async () => {
  const core = await makeCore();
  const skill: NewSkillInput = {
    name: "Compétence non-régression Phase 4",
    description: "Vérifie que le moteur de Skills reste fonctionnel avec les agents.",
    category: "test",
    parameters: [{ name: "sujet", type: "string", required: true }],
    steps: [{ id: "render", kind: "template", template: "Synthèse {{params.sujet}}" }],
    tests: [{ name: "nominal", input: { sujet: "JARVIS" }, expect: { contains: "JARVIS" } }],
  };
  const created = await core.createSkill(skill);
  await core.testSkill(created.id);
  await core.enableSkill(created.id);
  const result = await core.executeSkill(created.id, { sujet: "PHASE4" });
  assert.equal(result.execution.status, "success");

  const mission = await core.handle({ text: "Crée un site web pour mon entreprise" });
  assert.equal(mission.kind, "mission");
  const run = await core.dispatchMission(mission.mission!.id);
  assert.equal(run.status, "completed", run.error ?? "run non terminé");
  assert.equal(core.getStatus().capabilities.dynamicSkills, true);
});
