/**
 * Suite de tests Phase 6 — Tool Registry (node:test, zéro dépendance).
 * Lance avec : npm run test:core
 *
 * Couvre : outils intégrés, validation stricte, permissions fail-closed,
 * absence de code arbitraire, sortie bornée, historique audité, STOP GLOBAL,
 * pont des agents [tool:...], routes HTTP et non-régression.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import { StaticMemoryGateway } from "../../src/core/MemoryGateway.ts";
import { createCoreRouter } from "../../server/modules/core/coreRoute.ts";
import type { CoreState, CoreStorage } from "../../src/core/types.ts";
import type { NewSkillInput } from "../../src/core/skills/types.ts";
import type { NewScheduledTask } from "../../src/core/scheduler/types.ts";
import type { ToolDefinition } from "../../src/core/tools/types.ts";

let counter = 0;
const now = (): number => 1_700_000_600_000 + counter++ * 10;
const id = (prefix: string): string => `${prefix}_test_${counter++}`;

async function makeCore(
  storage: CoreStorage = new MemoryCoreStorage(),
  memory = new StaticMemoryGateway()
): Promise<JarvisCore> {
  const core = new JarvisCore({ storage, memory, now, id });
  await core.init();
  return core;
}

const templateTool = (overrides: Partial<ToolDefinition> = {}): Record<string, unknown> => ({
  name: "rapport_local",
  description: "Template déclaratif de test Phase 6.",
  kind: "template",
  template: "OBJECTIF : {{input.objectif}}",
  fields: [
    { name: "objectif", type: "string", required: true, maxLength: 500 },
    { name: "contexte", type: "string", maxLength: 1000 },
  ],
  ...overrides,
});

test("registre : cinq outils intégrés, déclaration, désactivation et statut Phase 6", async () => {
  const core = await makeCore();
  const tools = core.listTools();
  assert.equal(tools.length, 5);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["agents_overview", "context_template", "core_status", "memory_search", "scheduler_overview"]
  );
  assert.ok(tools.every((tool) => tool.builtin && tool.enabled));
  assert.ok(tools.every((tool) => tool.fields.length === 2));
  assert.ok(tools.every((tool) => tool.maxOutputChars >= 100 && tool.maxOutputChars <= 4000));

  const status = core.getStatus();
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.tools?.total, 5);
  assert.equal(status.tools?.builtin, 5);
  assert.equal(status.tools?.custom, 0);
  assert.equal(status.tools?.enabled, 5);

  await core.setToolEnabled("context_template", false);
  assert.equal(core.getTool("context_template")?.enabled, false);
  const blocked = await core.executeTool("context_template", { objectif: "Test" });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error ?? "", /désactivé/i);
});

test("template : remplacement littéral, aucune évaluation de code, sortie bornée", async () => {
  const core = await makeCore();
  const direct = await core.executeTool("context_template", {
    objectif: "Faire JARVIS",
    contexte: "contexte local",
  });
  assert.equal(direct.ok, true);
  assert.match(direct.output ?? "", /OBJECTIF : Faire JARVIS/);
  assert.match(direct.output ?? "", /CONTEXTE : contexte local/);

  const tool = await core.registerTool(templateTool({
    name: "inertie_locale",
    description: "Vérifie l'absence d'évaluation de code.",
    template: "{{input.objectif}} | {{process.exit()}} | {{input.contexte}}",
    maxOutputChars: 120,
  }) as never);
  await core.setToolEnabled(tool.name, true);
  const inert = await core.executeTool(tool.name, { objectif: "Court", contexte: "Local" });
  assert.equal(inert.ok, true);
  assert.match(inert.output ?? "", /\{\{process\.exit\(\)\}\}/, "expression laissée littérale : aucun eval");
  assert.match(inert.output ?? "", /Court/, "seuls les champs déclarés sont substitués");

  const bounded = await core.executeTool(tool.name, {
    objectif: "X".repeat(400),
    contexte: "Y".repeat(400),
  });
  assert.equal(bounded.ok, true);
  assert.ok((bounded.output ?? "").length <= 120, "sortie strictement bornée");
  assert.equal(core.getStatus().tools?.custom, 1);
});

test("validation stricte : champs, types, longueurs, noms et kinds non autorisés", async () => {
  const core = await makeCore();

  const unknownField = await core.executeTool("context_template", { objetif: "faute" });
  assert.equal(unknownField.ok, false);
  assert.match(unknownField.error ?? "", /champ inconnu/i);

  const wrongType = await core.executeTool("context_template", { objectif: 42 });
  assert.equal(wrongType.ok, false);
  assert.match(wrongType.error ?? "", /chaîne/i);

  const tooLong = await core.executeTool("context_template", { objectif: "z".repeat(600) });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error ?? "", /dépasse/i);

  const missing = await core.executeTool("context_template", { contexte: "sans objectif" });
  assert.equal(missing.ok, false);
  assert.match(missing.error ?? "", /requis/i);

  await assert.rejects(
    () => core.registerTool(templateTool({ name: "Nom Invalide!" }) as never),
    /nom d'outil invalide/i
  );
  await assert.rejects(
    () => core.registerTool(templateTool({ name: "core_status" }) as never),
    /déjà enregistré/i
  );
  await assert.rejects(
    () => core.registerTool(templateTool({ name: "action_arbitraire", kind: "core_action" }) as never),
    /template/i
  );
  await assert.rejects(
    () => core.registerTool(templateTool({ name: "sans_template", template: undefined }) as never),
    /template requis/i
  );
});

test("permissions : private_data fail-closed puis approbation ciblée sur l'outil", async () => {
  const storage = new MemoryCoreStorage();
  const core = await makeCore(
    storage,
    new StaticMemoryGateway([{ text: "JARVIS a été créé par Abdourahmane Fall (Capzo)." }])
  );

  const blocked = await core.executeTool("memory_search", { objectif: "Capzo" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.requiresValidation, true);
  assert.match(blocked.error ?? "", /private_data|requires_approval/i);
  assert.equal(core.listToolExecutions()[0].outcome, "blocked");

  const otherTarget = core.checkPermission({ action: "private_data", target: "autre_outil", title: "Contrôle" });
  assert.equal(otherTarget.allowed, false, "une approbation ne couvre pas une autre cible");

  await core.approve("private_data", "memory_search");
  const allowed = await core.executeTool("memory_search", { objectif: "Capzo" });
  assert.equal(allowed.ok, true);
  assert.match(allowed.output ?? "", /Capzo/);
  assert.equal(core.listToolExecutions()[0].outcome, "success");
});

test("STOP GLOBAL : outils bloqués, persistance après redémarrage, levé par resume()", async () => {
  const storage = new MemoryCoreStorage();
  const core = await makeCore(storage);
  await core.stopAll("STOP Phase 6");

  const blocked = await core.executeTool("context_template", { objectif: "Test STOP" });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error ?? "", /STOP GLOBAL/i);
  assert.equal(blocked.requiresValidation, true);

  const restarted = await makeCore(storage);
  assert.equal(restarted.isStopped(), true);
  const stillBlocked = await restarted.executeTool("context_template", { objectif: "Test STOP" });
  assert.equal(stillBlocked.ok, false);

  await restarted.resume("Reprise Phase 6");
  const resumed = await restarted.executeTool("context_template", { objectif: "Test reprise" });
  assert.equal(resumed.ok, true);
  assert.match(resumed.output ?? "", /Test reprise/);
});

test("historique et audit : exécutions bornées, journalisées, sans donnée sensible", async () => {
  const core = await makeCore();
  for (let i = 0; i < 3; i += 1) {
    await core.executeTool("core_status", { objectif: `Lecture ${i}` }, { actor: `user-${i}` });
  }
  const executions = core.listToolExecutions();
  assert.equal(executions.length, 3);
  assert.equal(executions[0].actor, "user-2", "historique du plus récent au plus ancien");
  assert.ok(executions.every((entry) => typeof entry.output === "string" && entry.output.length <= 1800));
  assert.ok(executions.every((entry) => typeof entry.input === "object"));
  assert.equal(core.listAudit({ action: "tool_executed" }).length, 3);
  assert.equal(core.getStatus().tools?.successes, 3);

  const status = await core.executeTool("core_status", { objectif: "Vérification" });
  assert.equal(status.ok, true);
  const parsed = JSON.parse(status.output ?? "{}") as Record<string, unknown>;
  assert.equal(parsed.phase, 8);
  assert.ok(parsed.capabilities, "résumé borné exposé sans secret");
});

test("pont agent : une étape [tool:...] passe exclusivement par le registre", async () => {
  const core = await makeCore();
  const mission = await core.createMission("Synthèse courte", [
    { name: "Collecte locale", description: "Étape [tool:context_template]" },
  ]);
  const run = await core.dispatchMission(mission.id);
  assert.equal(run.status, "completed", run.error ?? "run agent non terminé");
  assert.ok(run.metrics.toolCalls >= 1, "au moins un appel outil comptabilisé");
  const calls = core.listToolExecutions().filter((entry) => entry.toolName === "context_template");
  assert.equal(calls.length, 1);
  assert.match(calls[0].actor, /^agent:/, "appel attribué à un agent, pas à l'utilisateur");
  assert.match(run.steps[0].output ?? "", /OBJECTIF :/);
  assert.equal(core.getStatus().tools?.executions, 1);
});

test("statut Phase 6 : capacités exactes et compteurs d'exécution", async () => {
  const core = await makeCore();
  const status = core.getStatus();
  assert.equal(status.identity.version, "4.0");
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.classification, true);
  assert.equal(status.capabilities.missionPlanning, true);
  assert.equal(status.capabilities.dynamicSkills, true);
  assert.equal(status.capabilities.agentExecution, true);
  assert.equal(status.capabilities.scheduler, true);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.equal(status.tools?.executions, 0);
  assert.equal(status.tools?.blocked, 0);
});

test("persistance : état Phase 2/3/4/5 sans tools normalisé, outils rechargeables", async () => {
  const storage = new MemoryCoreStorage();
  await storage.save({
    version: 1,
    missions: [{ id: "mis_legacy", goal: "Mission historique", status: "planned", tasks: [], createdAt: 1, updatedAt: 1, context: {} }],
    audit: [], approvals: {}, skills: [], skillExecutions: [], agentRuns: [],
    stop: { active: false, reason: "", requestedAt: 0 },
    scheduler: { tasks: [], events: [], history: [], rules: [], alerts: [], lastTickAt: 0, tickCount: 0, lastAuditIndex: 0 },
  } as unknown as CoreState);

  const core = await makeCore(storage);
  assert.equal(core.listMissions().length, 1);
  assert.equal(core.listTools().length, 5, "outils intégrés recréés de façon additive");
  assert.equal(core.getStatus().tools?.custom, 0);

  const custom = await core.registerTool(templateTool() as never);
  await core.setToolEnabled(custom.name, true);
  await core.executeTool(custom.name, { objectif: "Persisté" });

  const reloaded = await makeCore(storage);
  assert.equal(reloaded.listMissions().length, 1, "mission historique préservée");
  assert.equal(reloaded.listTools().length, 6);
  assert.equal(reloaded.getTool(custom.name)?.enabled, true);
  assert.equal(reloaded.listToolExecutions().length, 1);
});

test("routes HTTP /api/core/tools/* : liste, registre, exécution, toggle, historique et STOP", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api", createCoreRouter({
    storage: new MemoryCoreStorage(),
    memory: new StaticMemoryGateway([{ text: "Mémoire locale HTTP." }]),
  }));
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
  const json = async (path: string) => await (await get(path)).json() as Record<string, any>;
  const send = async (path: string, payload: unknown) => await (await post(path, payload)).json() as Record<string, any>;

  const overview = await json("/tools");
  assert.equal(overview.definitions.length, 5);
  assert.equal(overview.tools.total, 5);
  assert.equal(overview.tools.toolRegistry, undefined);

  const created = await send("/tools", {
    name: "rapport_http",
    description: "Template de test HTTP.",
    template: "RAPPORT : {{input.objectif}}",
    fields: [{ name: "objectif", type: "string", required: true, maxLength: 200 }],
    kind: "core_action",
    enabled: false,
  });
  assert.equal(created.ok, true);
  assert.equal(created.tool.kind, "template", "la couche HTTP force le type déclaratif");
  assert.equal(created.tool.enabled, false);

  const toggled = await send("/tools/rapport_http/toggle", { enabled: true });
  assert.equal(toggled.tool.enabled, true);

  const executed = await send("/tools/rapport_http/execute", {
    input: { objectif: "HTTP" },
    context: { actor: "http-test" },
  });
  assert.equal(executed.result.ok, true);
  assert.match(executed.result.output, /RAPPORT : HTTP/);

  const denied = await send("/tools/memory_search/execute", {
    input: { objectif: "Mémoire" },
    context: { actor: "http-test" },
  });
  assert.equal(denied.result.ok, false);
  assert.equal(denied.result.requiresValidation, true);

  const history = await json("/tools/executions?limit=20");
  assert.equal(history.executions.length, 2);
  assert.equal(history.executions[0].actor, "http-test");

  await send("/stop", { reason: "STOP HTTP outils" });
  const blocked = await send("/tools/rapport_http/execute", { input: { objectif: "Bloqué" } });
  assert.equal(blocked.result.ok, false);
  assert.match(blocked.result.error, /STOP GLOBAL/i);
  const status = await json("/status");
  assert.equal(status.status.capabilities.toolRegistry, true);
  assert.equal(status.status.phase, 8);
});

test("non-régression : Skills, agents, missions et scheduler restent opérationnels", async () => {
  const core = await makeCore();
  const skillInput: NewSkillInput = {
    name: "Compétence non-régression Phase 6",
    description: "Vérifie le moteur de Skills avec le registre d'outils actif.",
    category: "test",
    parameters: [{ name: "sujet", type: "string", required: true, maxLength: 100 }],
    steps: [{ id: "render", kind: "template", template: "Synthèse {{params.sujet}}" }],
    tests: [{ name: "nominal", input: { sujet: "JARVIS" }, expect: { contains: "JARVIS" } }],
  };
  const skill = await core.createSkill(skillInput);
  await core.testSkill(skill.id);
  await core.enableSkill(skill.id);
  assert.equal((await core.executeSkill(skill.id, { sujet: "PHASE6" })).execution.status, "success");

  const classified = await core.handle({ text: "Crée un site web pour mon entreprise" });
  assert.equal(classified.kind, "mission");
  const run = await core.dispatchMission(classified.mission!.id);
  assert.equal(run.status, "completed", run.error ?? "run agent non terminé");

  const task: NewScheduledTask = {
    name: "Rappel non-régression",
    kind: "once",
    at: now() - 1,
    enabled: true,
    action: { type: "reminder", text: "Rappel local" },
  };
  const scheduled = await core.createScheduledTask(task);
  assert.equal(scheduled.enabled, true);

  const toolsBefore = core.getStatus().tools?.successes ?? 0;
  const result = await core.executeTool("core_status", { objectif: "Contrôle final" });
  assert.equal(result.ok, true);
  assert.equal((core.getStatus().tools?.successes ?? 0), toolsBefore + 1);
  assert.equal(core.getStatus().capabilities.multiDeviceSync, false);
});
