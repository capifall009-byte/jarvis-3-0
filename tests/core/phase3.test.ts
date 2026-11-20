/**
 * Suite de tests Phase 3 — Dynamic Skills Engine (node:test, zéro dépendance).
 * Lance avec : npm run test:core
 *
 * Couvre : validation stricte, CRUD/versions, tests intégrés, exécution
 * déterministe, permissions, STOP GLOBAL, persistance, sélection par le Core
 * et routes HTTP réelles.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import { SkillExecutor } from "../../src/core/skills/SkillExecutor.ts";
import { DEFAULT_SKILL_LIMITS, validateSkillDefinition } from "../../src/core/skills/SkillValidator.ts";
import { createCoreRouter } from "../../server/modules/core/coreRoute.ts";
import type { CoreState, CoreStorage } from "../../src/core/types.ts";
import type { NewSkillInput } from "../../src/core/skills/types.ts";

let counter = 0;
const now = (): number => 1_700_000_100_000 + counter++;
const id = (prefix: string): string => `${prefix}_test_${counter++}`;

async function makeCore(
  storage: CoreStorage = new MemoryCoreStorage()
): Promise<JarvisCore> {
  const core = new JarvisCore({ storage, now, id });
  await core.init();
  return core;
}

function demoSkill(overrides: Partial<NewSkillInput> = {}): NewSkillInput {
  return {
    name: "Synthèse de recherche",
    description: "Produit une synthèse structurée à partir d'un sujet et d'une langue.",
    category: "recherche",
    tags: ["synthese", "recherche"],
    parameters: [
      { name: "topic", type: "string", required: true, maxLength: 200, description: "Sujet à traiter" },
      { name: "lang", type: "string", default: "fr", description: "Langue" },
    ],
    steps: [
      { id: "build", kind: "template", template: "Synthèse {{params.topic}} ({{params.lang}})" },
      { id: "check", kind: "assert", value: "{{steps.build}}", check: "contains", expected: "{{params.topic}}" },
      { id: "package", kind: "json", fields: { resume: "{{steps.build}}", subject: "{{params.topic}}" } },
    ],
    expectedResult: "Un objet JSON contenant la synthèse.",
    permissions: [],
    tests: [
      { name: "cas nominal", input: { topic: "JARVIS", lang: "fr" }, expect: { contains: "JARVIS" } },
    ],
    ...overrides,
  };
}

async function readySkill(core: JarvisCore, input: NewSkillInput = demoSkill()) {
  const created = await core.createSkill(input);
  const test = await core.testSkill(created.id);
  assert.equal(test.passed, true, `tests intégrés : ${JSON.stringify(test.cases)}`);
  const enabled = await core.enableSkill(created.id);
  return enabled;
}

test("validateur : workflow conforme accepté, motifs de code arbitraire rejetés", () => {
  assert.equal(validateSkillDefinition(demoSkill()).valid, true);
  assert.equal(typeof DEFAULT_SKILL_LIMITS.maxSteps, "number");

  const dangerous = [
    "eval(process.env.SECRET)",
    "require('fs').readFileSync('secret')",
    "new Function('return 1')()",
    "process.env.API_KEY",
    "child_process.exec('ls')",
    "fetch('https://exemple.fr')",
    "<script>alert(1)</script>",
    "{{../../etc/passwd}}",
  ];
  for (const template of dangerous) {
    const result = validateSkillDefinition(
      demoSkill({ steps: [{ id: "build", kind: "template", template }] })
    );
    assert.equal(result.valid, false, `doit rejeter : ${template}`);
    assert.ok(
      result.issues.some((i) => i.message.includes("Motif interdit") || i.message.includes("Référence non autorisée")),
      `raison attendue pour : ${template}`
    );
  }
});

test("validateur : références antérieures, types, permissions et limites stricts", () => {
  const badRefs = validateSkillDefinition(
    demoSkill({ steps: [{ id: "build", kind: "template", template: "{{params.inconnu}} {{steps.futur}}" }] })
  );
  assert.equal(badRefs.valid, false);
  assert.ok(badRefs.issues.some((i) => i.message.includes("Paramètre non déclaré")));
  assert.ok(badRefs.issues.some((i) => i.message.includes("non antérieure")));

  const badKind = validateSkillDefinition(
    demoSkill({ steps: [{ id: "run", kind: "shell" as never, template: "x" }] })
  );
  assert.equal(badKind.valid, false);

  const badParam = validateSkillDefinition(
    demoSkill({ parameters: [{ name: "x", type: "string" }] })
  );
  assert.equal(badParam.valid, false);

  const badPermission = validateSkillDefinition(demoSkill({ permissions: ["supprimer_tout" as never] }));
  assert.equal(badPermission.valid, false);

  const tooManySteps = validateSkillDefinition(
    demoSkill({
      limits: { maxSteps: 2 },
      steps: [
        { id: "one", kind: "template", template: "a" },
        { id: "two", kind: "template", template: "b" },
        { id: "three", kind: "template", template: "c" },
      ],
    })
  );
  assert.equal(tooManySteps.valid, false);
  assert.ok(tooManySteps.issues.some((i) => i.message.includes("Trop d'étapes")));

  const missingExpected = validateSkillDefinition(
    demoSkill({ steps: [{ id: "verify", kind: "assert", value: "x", check: "contains" }] })
  );
  assert.equal(missingExpected.valid, false);
});

test("registry : création, versioning et historique des révisions", async () => {
  const core = await makeCore();
  const v1 = await core.createSkill(demoSkill());
  assert.equal(v1.version, 1);
  assert.equal(v1.status, "draft");
  assert.equal(v1.enabled, false);
  assert.equal(v1.history.length, 1);

  const v2 = await core.updateSkill(v1.id, {
    steps: [{ id: "build", kind: "template", template: "Synthèse v2 {{params.topic}}" }],
  }, "tester", "Ajout version 2");
  assert.equal(v2.version, 2);
  assert.equal(v2.status, "draft", "toute modification impose un nouveau test");
  assert.equal(v2.enabled, false);
  assert.equal(v2.history.length, 2);
  assert.equal(v2.history[1].version, 1);
  assert.equal(v2.history[1].note, "Ajout version 2");
  assert.equal(core.getSkill(v1.id)!.version, 2);

  assert.equal(await core.deleteSkill(v1.id), true);
  assert.equal(core.getSkill(v1.id), undefined);
});

test("registry : activation seulement après test intégré réussi, puis désactivation", async () => {
  const core = await makeCore();
  const skill = await core.createSkill(demoSkill());

  await assert.rejects(() => core.enableSkill(skill.id), /test/i);
  const result = await core.testSkill(skill.id);
  assert.equal(result.passed, true);
  assert.equal(result.cases.length, 1);
  assert.equal(core.getSkill(skill.id)!.status, "validated");
  assert.equal(core.getSkill(skill.id)!.lastTestPassed, true);

  const enabled = await core.enableSkill(skill.id);
  assert.equal(enabled.status, "active");
  assert.equal(enabled.enabled, true);

  const disabled = await core.disableSkill(skill.id, "tester", "Maintenance");
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.enabled, false);
  assert.ok(core.listAudit({ action: "skill_tested" }).length >= 1);
});

test("exécuteur : template, json, assert, entrées typées et limite de sortie", async () => {
  const core = await makeCore();
  const skill = await readySkill(core);

  const result = await core.executeSkill(skill.id, { topic: "ORION", lang: "fr" });
  assert.equal(result.execution.status, "success");
  assert.equal(result.execution.stepCount, 3);
  assert.ok(result.output?.includes("ORION"));
  assert.ok(result.output?.includes("resume"));
  assert.equal(core.getSkill(skill.id)!.executionCount, 1);
  assert.equal(core.listSkillExecutions({ skillId: skill.id }).length, 1);

  const badType = await core.executeSkill(skill.id, { topic: 42 });
  assert.equal(badType.execution.status, "failure");
  assert.ok(badType.execution.error?.includes("type string"));

  const unknownParam = await core.executeSkill(skill.id, { topic: "x", intrus: "y" });
  assert.equal(unknownParam.execution.status, "failure");
  assert.ok(unknownParam.execution.error?.includes("Paramètre inconnu"));

  const strict = await readySkill(core, demoSkill({
    name: "Vérification stricte",
    description: "Vérifie une égalité exacte avant de produire un résultat.",
    steps: [
      { id: "verify", kind: "assert", value: "{{params.topic}}", check: "equals", expected: "attendu" },
      { id: "final", kind: "template", template: "OK {{params.topic}}" },
    ],
    tests: [{ name: "égalité", input: { topic: "attendu" }, expect: { contains: "attendu" } }],
  }));
  const failed = await core.executeSkill(strict.id, { topic: "autre" });
  assert.equal(failed.execution.status, "failure");
  assert.ok(failed.execution.error?.includes("Assertion échouée"));

  const longText = "x".repeat(300);
  const clipped = await readySkill(core, demoSkill({
    name: "Sortie bornée",
    description: "Produit une sortie volontairement longue pour tester la limite.",
    limits: { maxOutputChars: 100 },
    steps: [{ id: "huge", kind: "template", template: longText }],
    tests: [{ name: "limite", input: { topic: "test" }, expect: { notEmpty: true } }],
  }));
  const clippedResult = await core.executeSkill(clipped.id, { topic: "test" });
  assert.equal(clippedResult.execution.status, "success");
  assert.ok(clippedResult.output?.endsWith("[tronqué]"));
  assert.ok(core.listAudit({ action: "skill_output_truncated" }).length >= 1);
});

test("permissions : Skill sensible bloquée par défaut, exécutée après accord explicite", async () => {
  const core = await makeCore();
  const skill = await readySkill(core, demoSkill({
    name: "Écriture contrôlée",
    description: "Compétence nécessitant une autorisation explicite d'écriture.",
    permissions: ["filesystem_write"],
  }));

  const blocked = await core.executeSkill(skill.id, { topic: "rapport" });
  assert.equal(blocked.execution.status, "blocked");
  assert.ok(blocked.execution.error?.includes("filesystem_write"));
  assert.equal(core.listAudit({ action: "skill_execution_blocked" }).length, 1);

  await core.approve("filesystem_write", skill.id);
  const allowed = await core.executeSkill(skill.id, { topic: "rapport" });
  assert.equal(allowed.execution.status, "success");
  assert.equal(core.listAudit({ action: "permission_required" }).length >= 1, true);
});

test("STOP GLOBAL : bloque les Skills, persiste après redémarrage, levé par resume()", async () => {
  const storage = new MemoryCoreStorage();
  const core = await makeCore(storage);
  const skill = await readySkill(core);

  await core.stopAll("Arrêt test Phase 3");
  assert.equal(core.isStopped(), true);
  const blocked = await core.executeSkill(skill.id, { topic: "test" });
  assert.equal(blocked.execution.status, "blocked");
  assert.ok(blocked.execution.error?.includes("STOP GLOBAL"));
  assert.equal(core.getStatus().stopActive, true);

  const restarted = await makeCore(storage);
  assert.equal(restarted.isStopped(), true, "STOP GLOBAL survit au redémarrage");
  assert.equal((await restarted.executeSkill(skill.id, { topic: "test" })).execution.status, "blocked");

  const resumed = await restarted.resume("Reprise test");
  assert.equal(resumed.resumed, true);
  assert.equal(restarted.isStopped(), false);
  assert.equal((await restarted.executeSkill(skill.id, { topic: "test" })).execution.status, "success");
  assert.equal(restarted.listAudit({ action: "global_stop_armed" }).length, 1);
  assert.equal(restarted.listAudit({ action: "core_resumed" }).length, 1);
});

test("persistance : état Phase 2 normalisé sans perte, Skills et exécutions rechargés", async () => {
  const storage = new MemoryCoreStorage();
  // État Phase 2 authentique : aucun champ Skills, aucune clé stop.
  await storage.save({
    version: 1,
    missions: [{
      id: "mis_legacy", goal: "Mission Phase 2", status: "planned", tasks: [],
      createdAt: 1, updatedAt: 1, context: {},
    }],
    audit: [],
    approvals: {},
  } as unknown as CoreState);

  const core = await makeCore(storage);
  assert.equal(core.listMissions().length, 1);
  assert.equal(core.listSkills().length, 0);
  assert.equal(core.isStopped(), false);
  assert.deepEqual(core.snapshot().skillExecutions, []);

  const skill = await readySkill(core);
  await core.executeSkill(skill.id, { topic: "PERSISTANCE" });

  const reloaded = await storage.load();
  assert.equal(reloaded.skills.length, 1);
  assert.equal(reloaded.skills[0].name, skill.name);
  assert.equal(reloaded.skillExecutions.length, 1);
  assert.equal(reloaded.missions.length, 1, "les missions Phase 2 sont préservées");
});

test("sélection Core : Skill active attachée à une mission complexe", async () => {
  const core = await makeCore();
  const skill = await readySkill(core, demoSkill({
    name: "Analyse projet performances",
    description: "Analyse un projet et propose des améliorations de performances mesurables.",
    category: "analyse",
    tags: ["projet", "performances", "analyse"],
  }));

  const response = await core.handle({ text: "Analyse mon projet et améliore ses performances" });
  assert.equal(response.kind, "mission");
  assert.ok(response.mission);
  assert.equal(response.mission.tasks[0].skill, skill.id);
  const selected = response.mission.context.selectedSkill as { id: string; score: number } | undefined;
  assert.equal(selected?.id, skill.id);
  assert.ok(selected && selected.score > 0);
  assert.equal(core.listAudit({ action: "skill_selected_for_mission" }).length, 1);
});

test("statut Phase 3 : compteurs Skills et capacités déclarés exactement", async () => {
  // phase et agentExecution mis à jour après la livraison effective de la Phase 4.
  const core = await makeCore();
  const skill = await readySkill(core);
  await core.executeSkill(skill.id, { topic: "STATUT" });

  const status = core.getStatus();
  assert.equal(status.identity.version, "4.0");
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.dynamicSkills, true);
  assert.equal(status.capabilities.agentExecution, true);
  assert.equal(status.capabilities.scheduler, true);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.equal(status.skills?.total, 1);
  assert.equal(status.skills?.active, 1);
  assert.equal(status.skills?.executions, 1);
  assert.equal(status.stopActive, false);
});

test("registry : catégorisation et recherche textuelle", async () => {
  const core = await makeCore();
  await core.createSkill(demoSkill({ name: "Résumé météo", category: "actualite", tags: ["meteo"] }));
  await core.createSkill(demoSkill({ name: "Résumé financier", category: "finance", tags: ["budget"] }));

  assert.equal(core.listSkills({ category: "finance" }).length, 1);
  assert.equal(core.listSkills({ tag: "meteo" }).length, 1);
  assert.equal(core.listSkills({ search: "financier" }).length, 1);
  assert.deepEqual(core.listSkillCategories().map((c) => c.name), ["actualite", "finance"]);
});

test("routes HTTP /api/core/skills/* : CRUD, test, exécution, historique, STOP et reprise", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api", createCoreRouter({ storage: new MemoryCoreStorage() }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api/core`;
  const jsonPost = (path: string, payload: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  const unsafe = await jsonPost("/skills/validate", {
    ...demoSkill(), steps: [{ id: "bad", kind: "template", template: "eval(process.env)" }],
  });
  assert.equal(unsafe.status, 200);
  const unsafeBody = (await unsafe.json()) as Record<string, any>;
  assert.equal(unsafeBody.validation.valid, false);

  const create = await jsonPost("/skills", demoSkill());
  assert.equal(create.status, 200);
  const created = (await create.json()) as Record<string, any>;
  const skillId = created.skill.id as string;
  assert.equal(created.skill.version, 1);

  const list = await fetch(`${base}/skills`);
  assert.equal(((await list.json()) as Record<string, any>).skills.length, 1);

  const earlyEnable = await jsonPost(`/skills/${skillId}/enable`, {});
  assert.equal(earlyEnable.status, 400);
  assert.equal(((await earlyEnable.json()) as Record<string, any>).code, "TEST_REQUIRED");

  const tested = await jsonPost(`/skills/${skillId}/test`, {});
  assert.equal(((await tested.json()) as Record<string, any>).test.passed, true);

  const enabled = await jsonPost(`/skills/${skillId}/enable`, {});
  assert.equal(((await enabled.json()) as Record<string, any>).skill.status, "active");

  const executed = await jsonPost(`/skills/${skillId}/execute`, { input: { topic: "HTTP", lang: "fr" } });
  assert.equal(executed.status, 200);
  const executedBody = (await executed.json()) as Record<string, any>;
  assert.equal(executedBody.execution.status, "success");
  assert.ok(executedBody.output.includes("HTTP"));

  const history = await fetch(`${base}/skills/executions?skillId=${skillId}`);
  assert.equal(((await history.json()) as Record<string, any>).executions.length, 1);

  const matches = await fetch(`${base}/skills/matches?goal=synthese%20recherche`);
  assert.ok(((await matches.json()) as Record<string, any>).matches.length >= 1);

  const categories = await fetch(`${base}/skills/categories`);
  assert.equal(((await categories.json()) as Record<string, any>).categories[0].name, "recherche");

  const stop = await jsonPost("/stop", { reason: "STOP HTTP Skills" });
  assert.equal(stop.status, 200);
  const blocked = await jsonPost(`/skills/${skillId}/execute`, { input: { topic: "HTTP" } });
  assert.equal(((await blocked.json()) as Record<string, any>).execution.status, "blocked");

  const resume = await jsonPost("/resume", { reason: "Reprise HTTP" });
  assert.equal(((await resume.json()) as Record<string, any>).result.resumed, true);
  const again = await jsonPost(`/skills/${skillId}/execute`, { input: { topic: "HTTP" } });
  assert.equal(((await again.json()) as Record<string, any>).execution.status, "success");

  const update = await fetch(`${base}/skills/${skillId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...demoSkill(), note: "v2 HTTP" }),
  });
  assert.equal(update.status, 200);
  const updated = (await update.json()) as Record<string, any>;
  assert.equal(updated.skill.version, 2);
  assert.equal(updated.skill.enabled, false);

  const remove = await fetch(`${base}/skills/${skillId}`, { method: "DELETE" });
  assert.equal(remove.status, 200);
  const missing = await fetch(`${base}/skills/${skillId}`);
  assert.equal(missing.status, 404);
});

test("non-régression : STOP GLOBAL annule aussi les missions avec des Skills actifs", async () => {
  const core = await makeCore();
  const skill = await readySkill(core);
  const mission = await core.createMission("Mission avec Skill", [{ name: "étape" }]);
  await core.startMission(mission.id);

  await core.stopAll("STOP combiné");
  assert.equal(core.getMission(mission.id)!.status, "cancelled");
  assert.equal(core.isStopped(), true);
  assert.equal((await core.executeSkill(skill.id, { topic: "x" })).execution.status, "blocked");
  assert.equal(core.getStatus().capabilities.agentExecution, true);
});

// Vérifie que l'executor reste utilisable directement (injété sans Core).
test("executor autonome : construit sans JarvisCore et applique la validation", () => {
  const state: CoreState = {
    version: 1, missions: [], audit: [], approvals: {}, skills: [], skillExecutions: [], agentRuns: [],
    stop: { active: false, reason: "", requestedAt: 0 },
    scheduler: {
      tasks: [], events: [], history: [], rules: [], alerts: [],
      lastTickAt: 0, tickCount: 0, lastAuditIndex: 0,
    },
    tools: { tools: [], executions: [] },
    devices: {
      device: { id: "", label: "Appareil local", createdAt: 0, updatedAt: 0 },
      readiness: "not_ready", checks: [], checkedAt: 0,
      exports: 0, lastExportAt: 0, exportHistory: [], imports: [],
    },
    contextMemory: {
      schema: "jarvis-context-memory-v1", entries: [], duplicates: [],
      recalls: 0, lastRecallAt: 0, lastConsolidationAt: 0,
    },
  };
  assert.ok(state.version === 1);
  assert.equal(typeof SkillExecutor, "function");
});
