/**
 * Suite de tests Phase 7 — Préparation multi-appareils locale (node:test).
 * Lance avec : npm run test:core
 *
 * Couvre : identité stable, checklist, export portable sans secret, aperçu
 * non destructif, import explicite et additif, STOP GLOBAL, routes HTTP,
 * persistance et non-régression des phases 2 à 6.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { DeviceBundleError, bundleChecksum } from "../../src/core/devices/DeviceManager.ts";
import { DEVICE_BUNDLE_SCHEMA } from "../../src/core/devices/types.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import { StaticMemoryGateway } from "../../src/core/MemoryGateway.ts";
import { createCoreRouter } from "../../server/modules/core/coreRoute.ts";
import { emptyCoreState } from "../../src/core/types.ts";
import type { CoreState, CoreStorage } from "../../src/core/types.ts";
import type { NewSkillInput } from "../../src/core/skills/types.ts";
import type { NewScheduledTask } from "../../src/core/scheduler/types.ts";
import type { NewToolDefinition } from "../../src/core/tools/types.ts";

/** Stockage volatile mais déclaré persistant : simule le fichier local du serveur. */
class LocalFileLikeStorage implements CoreStorage {
  readonly info = {
    kind: "local-file" as const,
    persistent: true,
    sharedAcrossDevices: false,
    detail: "Fichier JSON local de test.",
  };
  private readonly inner = new MemoryCoreStorage();
  async load(): Promise<CoreState> { return this.inner.load(); }
  async save(state: CoreState): Promise<void> { await this.inner.save(state); }
}

/** Stockage partagé fictif : sert à vérifier que la checklist le détecte. */
class SharedStorage implements CoreStorage {
  readonly info = {
    kind: "remote" as const,
    persistent: true,
    sharedAcrossDevices: true,
    detail: "Stockage distant fictif de test.",
  };
  private readonly inner = new MemoryCoreStorage();
  async load(): Promise<CoreState> { return this.inner.load(); }
  async save(state: CoreState): Promise<void> { await this.inner.save(state); }
}

let counter = 0;
const now = (): number => 1_700_000_700_000 + counter++ * 10;
const id = (prefix: string): string => `${prefix}_test_${counter++}`;

async function makeCore(storage: CoreStorage = new LocalFileLikeStorage()): Promise<JarvisCore> {
  const core = new JarvisCore({ storage, memory: new StaticMemoryGateway(), now, id });
  await core.init();
  return core;
}

const skillInput = (name: string): NewSkillInput => ({
  name,
  description: "Compétence déclarative de test Phase 7.",
  category: "test",
  parameters: [{ name: "sujet", type: "string", required: true, maxLength: 100 }],
  steps: [{ id: "render", kind: "template", template: "Synthèse {{params.sujet}}" }],
  tests: [{ name: "nominal", input: { sujet: "JARVIS" }, expect: { contains: "JARVIS" } }],
});

const toolInput = (name: string): NewToolDefinition => ({
  name,
  description: "Template local de test Phase 7.",
  kind: "template",
  template: "OBJECTIF : {{input.objectif}}",
  fields: [{ name: "objectif", type: "string", required: true, maxLength: 300 }],
  enabled: false,
});

async function seed(core: JarvisCore) {
  const mission = await core.createMission("Objectif source Phase 7", [
    { name: "Étape source", description: "Travail local déterministe" },
  ]);
  const extra = await core.createMission("Mission unique supplémentaire", [
    { name: "Étape simple" },
  ]);
  const skill = await core.createSkill(skillInput("Compétence source Phase 7"));
  const tool = await core.registerTool(toolInput("outil_source_local"));
  const task: NewScheduledTask = {
    name: "Rappel source Phase 7",
    kind: "once",
    at: now() - 1,
    enabled: true,
    action: { type: "reminder", text: "Rappel local" },
  };
  const scheduled = await core.createScheduledTask(task);
  return { mission, extra, skill, tool, scheduled };
}

async function assertRejectsCode(
  fn: () => unknown | Promise<unknown>,
  code: string
): Promise<void> {
  await assert.rejects(async () => { await fn(); }, (err: unknown) => {
    assert.ok(err instanceof DeviceBundleError, `erreur DeviceBundleError attendue, reçu ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

test("identité locale : générée une fois, persistée, renommage borné", async () => {
  const storage = new LocalFileLikeStorage();
  const core = await makeCore(storage);
  const first = core.getDevices();
  assert.match(first.id, /^device_test_/);
  assert.equal(first.label, "Appareil local");
  assert.ok(first.createdAt > 0);
  assert.equal(first.multiDeviceSync, false);

  const renamed = await core.renameDevice("  Bureau principal  ");
  assert.equal(renamed.label, "Bureau principal");
  assert.equal(core.getDevices().label, "Bureau principal");
  assert.equal(core.listAudit({ action: "device_renamed" }).length, 1);
  await assertRejectsCode(() => core.renameDevice("   "), "DEVICE_LABEL_REQUIRED");

  const reloaded = await makeCore(storage);
  assert.equal(reloaded.getDevices().id, first.id, "identifiant stable après redémarrage");
  assert.equal(reloaded.getDevices().label, "Bureau principal");
});

test("statut Phase 7 : phase 7, préparation vraie, synchronisation fausse", async () => {
  const core = await makeCore();
  const status = core.getStatus();
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.devicePreparation, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.equal(status.capabilities.scheduler, true);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.devices?.readiness, "ready");
  assert.equal(status.devices?.checks.length, 6);
  assert.ok(status.devices?.checks.every((check) => check.ok));
  assert.equal(status.devices?.multiDeviceSync, false);
  assert.ok(!JSON.stringify(status).match(/api[_-]?key|token|secret/i), "aucun secret exposé");
});

test("checklist : stockage volatile, stockage partagé et STOP GLOBAL détectés", async () => {
  const volatile = await makeCore(new MemoryCoreStorage());
  assert.equal(volatile.getDevices().readiness, "needs_review");
  assert.equal(volatile.getDevices().checks.find((c) => c.id === "local_persistence")?.ok, false);

  const shared = await makeCore(new SharedStorage());
  assert.equal(shared.getDevices().checks.find((c) => c.id === "no_remote_sync")?.ok, false);
  assert.equal(shared.getDevices().readiness, "needs_review");

  const core = await makeCore();
  await core.stopAll("STOP Phase 7 checklist");
  const stopped = await core.refreshDeviceReadiness();
  assert.equal(stopped.checks.find((c) => c.id === "stop_inactive")?.ok, false);
  assert.equal(stopped.readiness, "needs_review");
  const changes = core.listAudit({ action: "device_readiness_changed" });
  assert.equal(changes.length, 2, "transitions prêt → à revoir puis à revoir → prêt");
  assert.match(changes[0].detail ?? "", /ready → needs_review/);
  await core.resume("Reprise Phase 7 checklist");
  assert.equal((await core.refreshDeviceReadiness()).readiness, "ready");
  assert.match(core.listAudit({ action: "device_readiness_changed" })[0].detail ?? "", /needs_review → ready/);
});

test("export : sous-ensemble portable, aucun secret, approbation ou historique", async () => {
  const core = await makeCore();
  const seeded = await seed(core);
  await core.approve("private_data", "memory_search");
  await core.executeTool("context_template", { objectif: "Historique local" });

  const exported = await core.exportDeviceBundle();
  const bundle = JSON.parse(exported.text) as Record<string, any>;
  assert.equal(bundle.manifest.schema, DEVICE_BUNDLE_SCHEMA);
  assert.equal(bundle.manifest.version, 1);
  assert.equal(bundle.manifest.sourceDevice.id, core.getDevices().id);
  assert.deepEqual(Object.keys(bundle.state).sort(), ["missions", "skills", "tasks", "tools"]);
  assert.equal(bundle.manifest.counts.missions, 2);
  assert.equal(bundle.manifest.counts.skills, 1);
  assert.equal(bundle.manifest.counts.tools, 1);
  assert.equal(bundle.manifest.counts.tasks, 1);
  assert.equal(bundle.manifest.checksum, bundleChecksum(bundle.state));
  assert.ok(exported.bytes < 1_000_000);
  assert.ok(JSON.stringify(bundle.state).includes(seeded.mission.goal));
  assert.ok(!JSON.stringify(bundle).includes("memory_search"), "les approbations ne sont pas exportées");
  assert.ok(!JSON.stringify(bundle).includes("Historique local"), "aucun historique d'exécution");
  assert.ok(!bundle.state.missions[0].context || Object.keys(bundle.state.missions[0].context).length === 0);
  assert.ok(exported.text.length >= exported.bytes / 2);

  const status = core.getStatus();
  assert.equal(status.devices?.exports, 1);
  assert.ok(status.devices?.lastExportAt && status.devices.lastExportAt > 0);
  assert.equal(core.listAudit({ action: "device_bundle_exported" }).length, 1);
  await core.exportDeviceBundle();
  assert.equal(core.getStatus().devices?.exports, 2);
});

test("aperçu : validation stricte, aucun effet, empreinte vérifiée", async () => {
  const core = await makeCore();
  await seed(core);
  const exported = await core.exportDeviceBundle();
  const before = core.listMissions().length;

  const preview = core.previewDeviceImport(exported.text);
  assert.match(preview.stagedId, /^stg_test_/);
  assert.equal(preview.manifest.counts.missions, 2);
  assert.equal(preview.manifest.warnings.length >= 4, true);
  assert.equal(core.listMissions().length, before, "l'aperçu n'applique rien");
  assert.equal(core.getStatus().devices?.importCount, 0);

  const bundle = JSON.parse(exported.text) as Record<string, any>;
  await assertRejectsCode(() => core.previewDeviceImport("{pas du json"), "BUNDLE_INVALID_JSON");
  await assertRejectsCode(() => core.previewDeviceImport(JSON.stringify({ manifest: {}, state: {} })), "BUNDLE_UNSUPPORTED");
  await assertRejectsCode(
    () => core.previewDeviceImport(JSON.stringify({ ...bundle, state: { ...bundle.state, missions: [] } })),
    "BUNDLE_CHECKSUM_MISMATCH"
  );
  await assertRejectsCode(
    () => core.previewDeviceImport(JSON.stringify({ ...bundle, state: { ...bundle.state, tasks: "x" } })),
    "BUNDLE_INVALID_SHAPE"
  );
  await assertRejectsCode(() => core.previewDeviceImport("x".repeat(1_000_001)), "BUNDLE_TOO_LARGE");
  assert.equal(core.listMissions().length, before, "aucun échec n'a modifié l'état");
});

test("import : confirmation explicite, additif, conflits ignorés, éléments inactifs", async () => {
  const source = await makeCore();
  const seeded = await seed(source);
  await source.approve("private_data", "memory_search");
  const exported = await source.exportDeviceBundle();

  const targetStorage = new LocalFileLikeStorage();
  const conflicting = emptyCoreState();
  conflicting.missions.push({
    id: seeded.mission.id,
    goal: "Mission locale prioritaire",
    status: "completed",
    tasks: [],
    createdAt: now(),
    updatedAt: now(),
    context: {},
  });
  await targetStorage.save(conflicting);
  const target = await makeCore(targetStorage);

  const preview = target.previewDeviceImport(exported.text);
  await assertRejectsCode(
    () => target.applyDeviceImport(preview.stagedId, "user", false),
    "IMPORT_CONFIRM_REQUIRED"
  );
  await assertRejectsCode(
    () => target.applyDeviceImport("stg_inexistant", "user", true),
    "IMPORT_STAGING_MISSING"
  );

  const record = await target.applyDeviceImport(preview.stagedId, "user", true);
  assert.equal(record.actor, "user");
  assert.equal(record.sourceDeviceId, source.getDevices().id);
  assert.deepEqual(record.totals.missions, { accepted: 1, skipped: 1 });
  assert.deepEqual(record.totals.skills, { accepted: 1, skipped: 0 });
  assert.deepEqual(record.totals.tools, { accepted: 1, skipped: 0 });
  assert.deepEqual(record.totals.tasks, { accepted: 1, skipped: 0 });

  assert.equal(target.getMission(seeded.mission.id)?.goal, "Mission locale prioritaire", "aucun écrasement");
  assert.ok(target.getMission(seeded.extra.id), "mission supplémentaire importée");
  const imported = target.getMission(seeded.extra.id)!;
  assert.equal(imported.status, "planned");
  assert.ok(imported.tasks.every((task) => task.status === "pending" && task.progress === 0));
  assert.deepEqual(imported.context, {});

  const skill = target.listSkills().find((entry) => entry.id === seeded.skill.id);
  assert.ok(skill);
  assert.equal(skill.status, "draft");
  assert.equal(skill.enabled, false);
  assert.equal(skill.executionCount, 0);
  assert.equal(skill.history.length, 0);

  const tool = target.getTool(seeded.tool.name);
  assert.ok(tool);
  assert.equal(tool.enabled, false);
  assert.equal(tool.builtin, false);

  const task = target.getScheduledTask(seeded.scheduled.id);
  assert.ok(task);
  assert.equal(task.enabled, false);
  assert.equal(task.runs, 0);
  assert.equal(target.listApprovals().length, 0, "aucune approbation importée");
  assert.equal(target.listAudit({ action: "device_bundle_imported" }).length, 1);
  assert.equal(target.getStatus().devices?.importCount, 1);
  assert.ok(target.getStatus().devices?.lastImportAt && target.getStatus().devices!.lastImportAt > 0);

  await assertRejectsCode(
    () => target.applyDeviceImport(preview.stagedId, "user", true),
    "IMPORT_STAGING_MISSING"
  );
});

test("STOP GLOBAL : export, aperçu, import et renommage bloqués puis levés", async () => {
  const storage = new LocalFileLikeStorage();
  const core = await makeCore(storage);
  const exportedBeforeStop = await core.exportDeviceBundle();
  const previewBeforeStop = core.previewDeviceImport(exportedBeforeStop.text);

  await core.stopAll("STOP Phase 7 import");
  await assertRejectsCode(() => core.exportDeviceBundle(), "STOP_GLOBAL_ACTIVE");
  await assertRejectsCode(() => core.previewDeviceImport(exportedBeforeStop.text), "STOP_GLOBAL_ACTIVE");
  await assertRejectsCode(
    () => core.applyDeviceImport(previewBeforeStop.stagedId, "user", true),
    "STOP_GLOBAL_ACTIVE"
  );
  await assertRejectsCode(() => core.renameDevice("Bloqué"), "STOP_GLOBAL_ACTIVE");

  const reloaded = await makeCore(storage);
  assert.equal(reloaded.isStopped(), true);
  await assertRejectsCode(() => reloaded.exportDeviceBundle(), "STOP_GLOBAL_ACTIVE");
  await reloaded.resume("Reprise Phase 7 import");
  assert.equal((await reloaded.exportDeviceBundle()).manifest.schema, DEVICE_BUNDLE_SCHEMA);
});

test("persistance : identité, compteurs et historique rechargés", async () => {
  const storage = new LocalFileLikeStorage();
  const core = await makeCore(storage);
  await seed(core);
  const originalId = core.getDevices().id;
  await core.exportDeviceBundle();
  const exported = await core.exportDeviceBundle();
  const preview = core.previewDeviceImport(exported.text);
  await core.applyDeviceImport(preview.stagedId, "user", true);

  const reloaded = await makeCore(storage);
  assert.equal(reloaded.getDevices().id, originalId);
  assert.equal(reloaded.getDevices().exports, 2);
  assert.equal(reloaded.getDevices().importCount, 1);
  assert.equal(reloaded.getStatus().phase, 8);
  assert.equal(reloaded.listMissions().length >= 2, true, "missions historiques conservées");
});

test("routes HTTP /api/core/devices* : liste, export, aperçu, import, identité, STOP", async (t) => {
  const source = await makeCore();
  await seed(source);
  const bundleText = (await source.exportDeviceBundle()).text;

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", createCoreRouter({
    storage: new LocalFileLikeStorage(),
    memory: new StaticMemoryGateway(),
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/core`;
  const get = async (path: string) => await (await fetch(`${base}${path}`)).json() as Record<string, any>;
  const post = async (path: string, payload: unknown) => await (await fetch(`${base}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  })).json() as Record<string, any>;

  const overview = await get("/devices");
  assert.equal(overview.devices.readiness, "ready");
  assert.equal(overview.devices.multiDeviceSync, false);
  assert.equal(overview.storage.sharedAcrossDevices, false);

  const exported = await get("/devices/export");
  assert.equal(exported.manifest.schema, DEVICE_BUNDLE_SCHEMA);
  assert.equal(typeof exported.text, "string");

  const preview = await post("/devices/preview", { text: bundleText });
  assert.equal(preview.ok, true);
  assert.equal(preview.preview.manifest.counts.missions, 2);

  const denied = await post("/devices/import", { stagedId: preview.preview.stagedId, confirm: false });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "IMPORT_CONFIRM_REQUIRED");

  const applied = await post("/devices/import", {
    stagedId: preview.preview.stagedId, actor: "http-test", confirm: true,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.record.actor, "http-test");
  assert.equal(applied.record.totals.skills.accepted, 1);

  const renamed = await post("/devices/identity", { label: "Serveur local", actor: "http-test" });
  assert.equal(renamed.device.label, "Serveur local");

  const refreshed = await post("/devices/readiness", { actor: "http-test" });
  assert.equal(refreshed.devices.readiness, "ready");

  const badPreview = await post("/devices/preview", { text: "{invalide" });
  assert.equal(badPreview.ok, false);
  assert.equal(badPreview.code, "BUNDLE_INVALID_JSON");

  await post("/stop", { reason: "STOP HTTP Phase 7" });
  const blocked = await get("/devices/export");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "STOP_GLOBAL_ACTIVE");
  const status = await get("/status");
  assert.equal(status.status.phase, 8);
  assert.equal(status.status.capabilities.devicePreparation, true);
  assert.equal(status.status.capabilities.multiDeviceSync, false);
});

test("non-régression : phases 2 à 6 opérationnelles avec la portabilité active", async () => {
  const core = await makeCore();
  const classified = await core.handle({ text: "Crée un site web pour mon entreprise" });
  assert.equal(classified.kind, "mission");
  const run = await core.dispatchMission(classified.mission!.id);
  assert.equal(run.status, "completed", run.error ?? "run agent non terminé");

  await core.testSkill((await core.createSkill(skillInput("Compétence non-régression P7"))).id);
  await core.setToolEnabled("context_template", true);
  const toolResult = await core.executeTool("context_template", { objectif: "Contrôle final" });
  assert.equal(toolResult.ok, true);

  const task = await core.createScheduledTask({
    name: "Rappel non-régression P7", kind: "once", at: now() - 1, enabled: true,
    action: { type: "reminder", text: "Rappel local" },
  });
  assert.equal(task.enabled, true);

  const exported = await core.exportDeviceBundle();
  const preview = core.previewDeviceImport(exported.text);
  const record = await core.applyDeviceImport(preview.stagedId, "user", true);
  assert.ok(record.totals.missions.skipped > 0, "missions déjà présentes : aucun doublon");

  const status = core.getStatus();
  assert.equal(status.capabilities.dynamicSkills, true);
  assert.equal(status.capabilities.agentExecution, true);
  assert.equal(status.capabilities.scheduler, true);
  assert.equal(status.capabilities.toolRegistry, true);
  assert.equal(status.capabilities.devicePreparation, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.ok(status.missions.total >= 1);
});
