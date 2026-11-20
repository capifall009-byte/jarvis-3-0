/**
 * Suite de tests Phase 2 — Central Intelligence Core (node:test, zéro dépendance).
 * Lance avec : npm run test:core
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { CognitiveEngine } from "../../src/core/CognitiveEngine.ts";
import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import { StaticMemoryGateway } from "../../src/core/MemoryGateway.ts";
import type { MemoryGateway } from "../../src/core/MemoryGateway.ts";
import { createCoreRouter } from "../../server/modules/core/coreRoute.ts";
import type { CoreStorage } from "../../src/core/types.ts";

let counter = 0;
const now = (): number => 1_700_000_000_000 + counter++;
const id = (prefix: string): string => `${prefix}_test_${counter++}`;

async function makeCore(
  storage: CoreStorage = new MemoryCoreStorage(),
  memory?: MemoryGateway
): Promise<JarvisCore> {
  const core = new JarvisCore({
    storage,
    ...(memory ? { memory } : {}),
    now,
    id,
  });
  await core.init();
  return core;
}

test("classification : distingue demande simple et mission complexe", () => {
  const engine = new CognitiveEngine();

  const simple = engine.classify({ text: "Bonjour JARVIS, quelle est la capitale de la France ?" });
  assert.equal(simple.complex, false, "une question factuelle doit rester simple");
  assert.deepEqual(simple.suggestedTasks, []);
  assert.ok(simple.reason.includes("réponse directe"));

  const complexBuild = engine.classify({
    text: "Crée un site web professionnel pour mon entreprise et déploie-le.",
  });
  assert.equal(complexBuild.complex, true, "une création de site avec déploiement est complexe");
  assert.ok(complexBuild.suggestedTasks.length >= 3);
  assert.ok(complexBuild.signals.some((s) => s.includes("actions_sensibles")));

  const complexImprove = engine.classify({ text: "Analyse mon projet et améliore ses performances." });
  assert.equal(complexImprove.complex, true, "analyse + amélioration est une mission complexe");

  const scheduled = engine.classify({ text: "Fais un résumé de mes projets chaque matin." });
  assert.equal(scheduled.complex, true, "une intention planifiée est complexe");
});

test("non-régression Gemini : simple délégué au chat, complexe au Core", async () => {
  const core = await makeCore();

  const simple = await core.handle({ text: "Quelle heure est-il ?" });
  assert.equal(simple.kind, "simple");
  assert.equal(simple.delegateToChat, true);
  assert.equal(simple.mission, undefined);
  assert.equal(core.listMissions().length, 0, "aucune mission ne doit être créée pour un message simple");

  const complex = await core.handle({ text: "Analyse mon projet et améliore ses performances" });
  assert.equal(complex.kind, "mission");
  assert.equal(complex.delegateToChat, false);
  assert.ok(complex.mission);
  assert.equal(core.listMissions().length, 1);
});

test("mission : création, démarrage, dépendances, suivi et achèvement", async () => {
  const core = await makeCore();
  const mission = await core.createMission("Préparer un rapport", [
    { name: "Collecter les données" },
    { name: "Rédiger le rapport", dependsOn: [0] },
    { name: "Vérifier le rapport", dependsOn: [1] },
  ]);

  assert.equal(mission.status, "planned");
  assert.equal(mission.tasks.length, 3);
  assert.equal(mission.tasks[1].dependencies.length, 1);

  await core.startMission(mission.id);
  let current = core.getMission(mission.id)!;
  assert.equal(current.status, "running");
  assert.equal(current.tasks[0].status, "running");
  assert.equal(current.tasks[1].status, "pending", "une tâche dépendante reste en attente");

  await core.completeTask(mission.id, mission.tasks[0].id, "données collectées");
  current = core.getMission(mission.id)!;
  assert.equal(current.tasks[1].status, "running", "la dépendance suivante est promue");
  assert.equal(current.tasks[0].result, "données collectées");

  await core.completeTask(mission.id, mission.tasks[1].id);
  await core.completeTask(mission.id, mission.tasks[2].id);
  current = core.getMission(mission.id)!;
  assert.equal(current.status, "completed");
  assert.ok(current.tasks.every((t) => t.status === "done"));

  const actions = core.listAudit({ limit: 200 }).map((e) => e.action);
  for (const expected of ["mission_created", "mission_started", "task_completed", "mission_completed"]) {
    assert.ok(actions.includes(expected), `l'audit doit contenir ${expected}`);
  }
});

test("STOP GLOBAL : annule les missions actives sans toucher aux missions terminées", async () => {
  const core = await makeCore();
  const a = await core.createMission("Mission A", [{ name: "t1" }]);
  const b = await core.createMission("Mission B", [{ name: "t2" }]);
  const finished = await core.createMission("Mission C", [{ name: "t3" }]);
  await core.startMission(a.id);
  await core.startMission(b.id);
  await core.startMission(finished.id);
  await core.completeTask(finished.id, finished.tasks[0].id);

  const result = await core.stopAll("Test STOP GLOBAL");
  assert.equal(result.cancelledMissions, 2);
  assert.ok(result.cancelledTasks >= 2);
  assert.equal(core.getMission(a.id)!.status, "cancelled");
  assert.equal(core.getMission(b.id)!.tasks[0].status, "cancelled");
  assert.equal(core.getMission(finished.id)!.status, "completed");
  assert.equal(core.listAudit({ action: "stop_global" }).length, 1);

  const second = await core.stopAll();
  assert.equal(second.cancelledMissions, 0, "STOP GLOBAL est idempotent");
});

test("persistance : les missions survivent dans l'adaptateur local", async () => {
  const storage = new MemoryCoreStorage();
  const core = await makeCore(storage);
  const mission = await core.createMission("Mission persistée", [{ name: "tâche" }]);

  const reloaded = await storage.load();
  assert.equal(reloaded.missions.length, 1);
  assert.equal(reloaded.missions[0].id, mission.id);
  assert.equal(reloaded.missions[0].tasks[0].name, "tâche");
});

test("reprise après redémarrage : missions running → paused, tâches running → pending, idempotent", async () => {
  const storage = new MemoryCoreStorage();
  const first = await makeCore(storage);
  const mission = await first.createMission("Mission interrompue", [{ name: "t1" }]);
  await first.startMission(mission.id);
  assert.equal(coreStatus(first, mission.id), "running");

  const restarted = await makeCore(storage);
  const recovered = restarted.getMission(mission.id)!;
  assert.equal(recovered.status, "paused");
  assert.equal(recovered.tasks[0].status, "pending");
  assert.equal(restarted.listAudit({ action: "mission_recovery" }).length, 1);

  const restartedTwice = await makeCore(storage);
  assert.equal(restartedTwice.getMission(mission.id)!.status, "paused");
  assert.equal(
    restartedTwice.listAudit({ action: "mission_recovery" }).length,
    1,
    "la reprise ne doit pas être re-journalisée à chaque démarrage"
  );
});

test("permissions : approbation explicite requise, ciblée, révocable et auditée", async () => {
  const core = await makeCore();
  const request = { action: "deploy" as const, title: "Déployer en production", target: "site-web" };

  const initial = core.checkPermission(request);
  assert.equal(initial.allowed, false);
  assert.equal(initial.decision, "requires_approval");
  assert.ok(initial.approvalId?.includes("site-web"));

  await core.approve("deploy", "site-web");
  assert.equal(core.checkPermission(request).allowed, true, "approbation ciblée accordée");

  const otherTarget = core.checkPermission({ ...request, target: "autre-site" });
  assert.equal(otherTarget.allowed, false, "une approbation ne doit pas couvrir une autre cible");

  await core.deny("publish", "reseau");
  assert.equal(
    core.checkPermission({ action: "publish", title: "Publier", target: "reseau" }).decision,
    "deny"
  );

  assert.equal(await core.revoke("deploy", "site-web"), true);
  assert.equal(core.checkPermission(request).allowed, false, "approbation révoquée");

  assert.ok(core.listAudit({ action: "permission_required" }).length >= 1);
  assert.ok(core.listAudit({ action: "permission_approved" }).length >= 1);
});

test("mémoire : la passerelle lit sans supprimer ni modifier les données existantes", async () => {
  const memory = new StaticMemoryGateway([
    {
      id: "m1",
      text: "JARVIS a été créé par Abdourahmane Fall, pseudonyme Capzo",
      category: "personnel",
    },
  ]);
  const core = await makeCore(new MemoryCoreStorage(), memory);

  const found = await core.searchMemory("Capzo");
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "m1");
  assert.equal((await core.searchMemory("mot-inexistant-xyz")).length, 0);
  assert.equal(memory.info.readOnly, true);
});

test("statut : phase 4 et capacités réellement livrées déclarées exactement", async () => {
  // Assertions historiques mises à jour au fil des livraisons (phase 2 → 3 → 4,
  // dynamicSkills false → true, agentExecution false → true) parce que ces
  // capacités sont désormais livrées et testées. Toutes les autres assertions
  // Phase 2 restent inchangées.
  const core = await makeCore();
  const status = core.getStatus();
  assert.equal(status.identity.version, "4.0");
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.classification, true);
  assert.equal(status.capabilities.missionPlanning, true);
  assert.equal(status.capabilities.stopGlobal, true);
  assert.equal(status.capabilities.agentExecution, true);
  assert.equal(status.capabilities.dynamicSkills, true);
  assert.equal(status.capabilities.scheduler, true);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.equal(status.storage.sharedAcrossDevices, false);
});

test("routes HTTP /api/core/* : statut, handle complexe, STOP GLOBAL et audit", async (t) => {
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

  const statusRes = await fetch(`${base}/status`);
  assert.equal(statusRes.status, 200);
  const statusBody = (await statusRes.json()) as Record<string, any>;
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.status.capabilities.agentExecution, true);

  const classifyRes = await fetch(`${base}/classify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Bonjour JARVIS" }),
  });
  assert.equal(classifyRes.status, 200);
  const classifyBody = (await classifyRes.json()) as Record<string, any>;
  assert.equal(classifyBody.classification.complex, false);

  const handleRes = await fetch(`${base}/handle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Crée un site web pour mon entreprise" }),
  });
  assert.equal(handleRes.status, 200);
  const handleBody = (await handleRes.json()) as Record<string, any>;
  assert.equal(handleBody.ok, true);
  assert.equal(handleBody.response.kind, "mission");

  const stopRes = await fetch(`${base}/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Test HTTP STOP" }),
  });
  assert.equal(stopRes.status, 200);
  const stopBody = (await stopRes.json()) as Record<string, any>;
  assert.equal(stopBody.result.cancelledMissions, 1);
  assert.equal(stopBody.missions[0].status, "cancelled");

  const auditRes = await fetch(`${base}/audit?action=stop_global`);
  assert.equal(auditRes.status, 200);
  const auditBody = (await auditRes.json()) as Record<string, any>;
  assert.equal(auditBody.audit.length, 1);
  assert.ok(auditBody.audit[0].detail.includes("Test HTTP STOP"));
});

function coreStatus(core: JarvisCore, missionId: string): string {
  return core.getMission(missionId)!.status;
}
