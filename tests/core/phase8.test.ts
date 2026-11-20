/**
 * Suite de tests Phase 8 — Mémoire contextuelle locale (node:test).
 * Lance avec : npm run test:core
 *
 * Couvre : court/long terme, recherche contextuelle locale, dédoublonnage,
 * partage contrôlé entre agents, consolidation, pont explicite sans effet sur
 * les dépôts existants, STOP GLOBAL, routes HTTP et non-régression phases 2-7.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { ContextMemoryError } from "../../src/core/memory/ContextMemory.ts";
import { CONTEXT_MEMORY_SCHEMA } from "../../src/core/memory/types.ts";
import { jaccard, normalizeText, radical, textFingerprint, tokenize } from "../../src/core/memory/text.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import { StaticMemoryGateway } from "../../src/core/MemoryGateway.ts";
import { createCoreRouter } from "../../server/modules/core/coreRoute.ts";
import type { CoreState, CoreStorage } from "../../src/core/types.ts";
import type { ContextBridgeItem } from "../../src/core/memory/types.ts";

/** Stockage volatile déclaré persistant : simule le fichier local du serveur. */
class LocalLikeStorage implements CoreStorage {
  readonly info = {
    kind: "local-file" as const,
    persistent: true,
    sharedAcrossDevices: false,
    detail: "Fichier local de test Phase 8.",
  };
  private readonly inner = new MemoryCoreStorage();
  async load(): Promise<CoreState> { return this.inner.load(); }
  async save(state: CoreState): Promise<void> { await this.inner.save(state); }
}

let counter = 0;
const now = (): number => 1_800_000_800_000 + counter++ * 10;
const id = (prefix: string): string => `${prefix}_p8_${counter++}`;

async function makeCore(storage: CoreStorage = new LocalLikeStorage(), withGateway = false): Promise<JarvisCore> {
  const core = new JarvisCore({
    storage,
    now,
    id,
    ...(withGateway
      ? { memory: new StaticMemoryGateway([{ id: "old", text: "Capzo aime la mémoire existante", category: "profil" }]) }
      : {}),
  });
  await core.init();
  return core;
}

async function assertCode(fn: () => unknown | Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(async () => { await fn(); }, (err: unknown) => {
    assert.ok(err instanceof ContextMemoryError, `ContextMemoryError attendue, reçu ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

test("analyse textuelle locale : normalisation, radical, synonymes et similarité", () => {
  assert.equal(normalizeText("Réunions de Projet—CAPZO!"), "reunions de projet capzo");
  assert.equal(radical("réunions"), "reunion");
  assert.ok(tokenize("voiture").includes("auto"), "expansion synonymique locale");
  assert.ok(tokenize("réunions").includes("reunion"), "radicalisation");
  assert.ok(!tokenize("le la les").includes("le"), "stop-words ignorés");
  const a = tokenize("réunion projet voiture");
  const b = tokenize("meeting mission auto");
  assert.ok(jaccard(a, b) > 0, "reformulations rapprochées");
  assert.equal(textFingerprint("  Réunion  Projet "), textFingerprint("réunion projet"));
  assert.notEqual(textFingerprint("réunion"), textFingerprint("projet"));
});

test("statut Phase 8 : phase 8, capacité vraie, gateway réel en production", async () => {
  const core = await makeCore();
  const status = core.getStatus();
  assert.equal(status.phase, 8);
  assert.equal(status.capabilities.contextMemory, true);
  assert.equal(status.capabilities.memoryGateway, true, "production n'utilise plus NoopMemoryGateway");
  assert.equal(status.capabilities.devicePreparation, true);
  assert.equal(status.capabilities.multiDeviceSync, false);
  assert.equal(status.contextMemory?.schema, CONTEXT_MEMORY_SCHEMA);
  assert.equal(status.contextMemory?.stats.total, 0);
  assert.equal(status.contextMemory?.preservesExistingMemory, true);
  assert.equal(status.contextMemory?.preservesConversations, true);
  assert.equal(status.contextMemory?.remoteEmbeddings, false);
  assert.equal(status.contextMemory?.stats.duplicates, 0);
});

test("gateway : la recherche alimente réellement /core/memory/search et l'outil memory_search", async () => {
  const core = await makeCore();
  await core.approve("private_data", "memory_search");
  await core.remember({ text: "Capzo préfère une interface sobre", scope: "long", kind: "preference" });

  const snippets = await core.searchMemory("interface sobre Capzo", 5);
  assert.ok(snippets.length >= 1, "la passerelle trouve le souvenir local");
  assert.equal(snippets[0].source, "user");
  assert.ok(snippets[0].id?.startsWith("ctx_"));

  const result = await core.executeTool("memory_search", { objectif: "interface sobre" });
  assert.equal(result.ok, true);
  assert.match(result.output ?? "", /Capzo/);
  assert.equal(core.getContextMemoryStatus().stats.recalls, 0, "la passerelle est en lecture seule : aucun compteur");
});

test("pont injecté explicitement conservé (non-régression passerelle historique)", async () => {
  const core = await makeCore(new LocalLikeStorage(), true);
  const status = core.getStatus();
  assert.equal(status.capabilities.memoryGateway, true);
  const snippets = await core.searchMemory("Capzo");
  assert.equal(snippets.length, 1);
  assert.equal(snippets[0].text, "Capzo aime la mémoire existante");
  assert.equal(core.getContextMemoryStatus().stats.total, 0, "le gateway injecté n'écrit pas dans l'index Phase 8");
});

test("remember : ajout borné, court/long terme, tags, audit", async () => {
  const core = await makeCore();
  const entry = await core.remember({
    text: "  Réunion projet CAPZO demain  ",
    kind: "decision",
    scope: "short",
    categories: ["projets", "x".repeat(200)],
    tags: ["réunion", "important", "y".repeat(200)],
    importance: 2,
    confidence: -5,
    missionId: "m_test",
    notes: "note locale",
  });
  assert.equal(entry.text, "Réunion projet CAPZO demain");
  assert.equal(entry.kind, "decision");
  assert.equal(entry.scope, "short");
  assert.equal(entry.categories.length, 2);
  assert.equal(entry.categories[1].length, 48);
  assert.equal(entry.tags.length, 3);
  assert.equal(entry.importance, 1);
  assert.equal(entry.confidence, 0);
  assert.equal(entry.missionId, "m_test");
  assert.equal(entry.share.mode, "private", "partage privé par défaut (fail closed)");
  assert.equal(core.getContextMemoryStatus().stats.short, 1);
  assert.equal(core.getContextMemoryStatus().stats.byKind.decision, 1);
  assert.equal(core.listAudit({ action: "context_memory_remembered" }).length, 1);
  await assertCode(() => core.remember({ text: "   " }), "TEXT_REQUIRED");
});

test("dédoublonnage exact : aucun doublon créé, accès incrémenté", async () => {
  const core = await makeCore();
  const first = await core.remember({ text: "JARVIS utilise Gemini comme cerveau principal" });
  const second = await core.remember({ text: "  jarvis utilise gemini comme cerveau principal  " });
  assert.equal(second.id, first.id);
  assert.equal(second.accessCount, 1);
  assert.equal(core.getContextMemoryStatus().stats.total, 1);
  assert.equal(core.getContextMemoryStatus().stats.duplicates, 0);
  assert.equal(core.listAudit({ action: "context_memory_dedup_hit" }).length, 1);
});

test("doublons proches : suggérés, examinés, fusion uniquement explicite", async () => {
  const core = await makeCore();
  await core.remember({ text: "Réunion projet avec le client demain matin" });
  const second = await core.remember({
    text: "Meeting mission avec le client demain matin",
    tags: ["urgent"],
    importance: 0.9,
  });
  const pairs = core.listContextDuplicates();
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].status, "suggested");
  assert.ok(pairs[0].similarity >= 0.72);
  assert.equal(core.getContextMemoryStatus().stats.total, 2, "aucune fusion automatique");

  const reviewed = await core.reviewContextDuplicate(pairs[0].id);
  assert.equal(reviewed.status, "reviewed");
  assert.equal(core.getContextMemoryStatus().stats.duplicates, 0);

  const merged = await core.remember({
    text: "Meeting mission avec le client demain matin à neuf heures",
    mergeDuplicate: true,
    tags: ["confirme"],
    importance: 0.95,
  });
  // Le moteur choisit le candidat le plus proche : ici le premier souvenir
  // (« Réunion projet… ») partage plus de tokens avec la nouvelle phrase.
  assert.ok(merged.id === second.id || merged.id === pairs[0].firstId);
  assert.ok(merged.tags.includes("confirme"));
  assert.equal(merged.importance, 0.95);
  assert.equal(core.getContextMemoryStatus().stats.total, 2);
  assert.equal(core.listAudit({ action: "context_memory_merged" }).length, 1);
  await assertCode(() => core.reviewContextDuplicate("inexistant"), "DUPLICATE_NOT_FOUND");
});

test("recherche contextuelle : pertinence, filtres, scores et traçabilité", async () => {
  const core = await makeCore();
  await core.remember({ text: "Capzo aime les réunions courtes le matin", scope: "long", kind: "preference", importance: 0.8 });
  await core.remember({ text: "Le serveur JARVIS écoute sur le port 3190", scope: "long", kind: "fact" });
  await core.remember({ text: "Rappel d'acheter du pain", scope: "short", kind: "episode" });

  const all = core.recallContext("réunion matin Capzo", { limit: 5 });
  assert.equal(all.strategy, "lexical-contextual-local");
  assert.equal(all.remote, false);
  assert.ok(all.hits.length >= 1);
  assert.match(all.hits[0].entry.text, /réunions courtes/);
  assert.ok(all.hits[0].score > 0);
  assert.ok(all.hits[0].reasons.length >= 1);

  const scoped = core.recallContext("pain", { scope: "short" });
  assert.ok(scoped.hits.some((hit) => hit.entry.kind === "episode"));
  const typed = core.recallContext("port 3190", { kinds: ["fact"] });
  assert.ok(typed.hits.every((hit) => hit.entry.kind === "fact"));
  const strict = core.recallContext("réunion", { minScore: 1 });
  assert.equal(strict.hits.length, 0);
  const empty = core.recallContext("", {});
  assert.equal(empty.hits.length, 0);
  assert.equal(core.getContextMemoryStatus().stats.recalls, 5, "lectures tracées");
  assert.equal(core.listAudit({ action: "context_memory_recall" }).length, 5);
});

test("partage contrôlé : privé retenu, agents autorisés, all visible, agent invalide", async () => {
  const core = await makeCore();
  await core.remember({ text: "Secret local du créateur", share: { mode: "private" } });
  const shared = await core.remember({
    text: "Contexte de mission pour le planificateur",
    share: { mode: "agents", allow: ["planning"] },
  });
  await core.remember({ text: "Règle commune à tous les agents", share: { mode: "all" } });

  const planning = core.shareContextWithAgent("planning", "mission planificateur règle", 10);
  assert.ok(planning.hits.some((hit) => hit.entry.id === shared.id));
  assert.ok(planning.hits.every((hit) => hit.entry.share.mode !== "private"));
  assert.ok(planning.withheld >= 1);
  assert.equal(planning.remote, false);

  const coding = core.shareContextWithAgent("coding", "mission planificateur règle", 10);
  assert.ok(!coding.hits.some((hit) => hit.entry.id === shared.id), "agent non autorisé exclu");
  assert.ok(coding.hits.every((hit) => hit.entry.share.mode === "all"));
  assert.equal(core.listAudit({ action: "context_memory_shared" }).length, 2);
  assert.throws(
    () => core.shareContextWithAgent("inconnu" as never, "règle"),
    (err: unknown) => err instanceof ContextMemoryError && err.code === "INVALID_AGENT"
  );
});

test("consolidation : promotion court → long et reprise après redémarrage", async () => {
  const storage = new LocalLikeStorage();
  const core = await makeCore(storage);
  const recent = await core.remember({ text: "Note récente peu consultée", scope: "short" });
  await core.remember({ text: "Note mûre consultée trois fois", scope: "short", importance: 0.9 });
  for (let i = 0; i < 3; i += 1) core.recallContext("consultée", {});

  const result = await core.consolidateContextMemory();
  assert.equal(result.promoted, 1);
  assert.equal(core.listContextMemory().find((entry) => entry.id === recent.id)?.scope, "short");
  assert.equal(core.getContextMemoryStatus().stats.long, 1);
  assert.ok(core.getContextMemoryStatus().lastConsolidationAt > 0);
  assert.equal(core.listAudit({ action: "context_memory_consolidated" }).length, 1);

  const reloaded = await makeCore(storage);
  assert.equal(reloaded.getContextMemoryStatus().stats.total, 2);
  assert.equal(reloaded.getContextMemoryStatus().stats.long, 1);
  assert.equal(reloaded.getStatus().phase, 8);
});

test("pont : confirmation explicite, copie additive, dépôts source intacts", async () => {
  const core = await makeCore();
  const items: ContextBridgeItem[] = [
    { id: "mem_1", fact: "Préférence utilisateur : ton direct", category: "profil_preferences", pinned: true, confidence: 0.9 },
    { fact: "   " },
    { fact: "Préférence utilisateur : ton direct" },
  ];
  await assertCode(() => core.bridgeMemories(items, false), "BRIDGE_CONFIRM_REQUIRED");
  const result = await core.bridgeMemories(items, true);
  assert.equal(result.accepted, 1);
  assert.equal(result.skipped, 2);
  assert.equal(core.getContextMemoryStatus().stats.total, 1);
  const entry = core.listContextMemory()[0];
  assert.equal(entry.kind, "fact");
  assert.equal(entry.scope, "long");
  assert.equal(entry.share.mode, "private", "copie d'un souvenir existant reste privée");
  assert.ok(entry.tags.includes("epingle"));
  assert.equal(core.listAudit({ action: "context_memory_bridged" }).length, 1);

  const excerpt = await core.bridgeConversationExcerpts(
    [{ id: "s1_m1", fact: "[Projet X] Le client valide la maquette", category: "conversation", createdAt: now() }],
    true
  );
  assert.equal(excerpt.accepted, 1);
  assert.equal(core.listContextMemory().find((e) => e.text.includes("client valide"))?.kind, "episode");
  assert.equal(core.listContextMemory().find((e) => e.text.includes("client valide"))?.scope, "short");
  await assertCode(() => core.bridgeMemories(new Array(201).fill({ fact: "x" }), true), "BRIDGE_TOO_LARGE");
});

test("STOP GLOBAL : mutations bloquées, lecture autorisée, persistance et reprise", async () => {
  const storage = new LocalLikeStorage();
  const core = await makeCore(storage);
  await core.remember({ text: "Souvenir avant STOP" });
  await core.stopAll("STOP Phase 8");

  await assertCode(() => core.remember({ text: "Bloqué" }), "STOP_GLOBAL_ACTIVE");
  await assertCode(() => core.consolidateContextMemory(), "STOP_GLOBAL_ACTIVE");
  await assertCode(() => core.bridgeMemories([{ fact: "Bloqué aussi" }], true), "STOP_GLOBAL_ACTIVE");
  assert.equal(core.listContextMemory().length, 1, "lecture toujours possible");
  assert.equal(core.recallContext("Souvenir").hits.length >= 1, true);

  const reloaded = await makeCore(storage);
  assert.equal(reloaded.isStopped(), true);
  await assertCode(() => reloaded.remember({ text: "Toujours bloqué" }), "STOP_GLOBAL_ACTIVE");
  await reloaded.resume("Reprise Phase 8");
  await reloaded.remember({ text: "Après reprise" });
  assert.equal(reloaded.getContextMemoryStatus().stats.total, 2);
});

test("routes HTTP /api/core/context-memory* : CRUD local, partage, pont et STOP", async (t) => {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", createCoreRouter({ storage: new LocalLikeStorage(), memory: new StaticMemoryGateway() }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/core`;
  const get = async (p: string) => await (await fetch(`${base}${p}`)).json() as Record<string, any>;
  const post = async (p: string, payload: unknown) => await (await fetch(`${base}${p}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  })).json() as Record<string, any>;

  const overview = await get("/context-memory?limit=5");
  assert.equal(overview.status.schema, CONTEXT_MEMORY_SCHEMA);
  assert.equal(overview.status.stats.total, 0);
  assert.equal(overview.status.remoteEmbeddings, false);

  const remembered = await post("/context-memory/remember", {
    text: "Réunion projet client demain", kind: "decision", scope: "short",
    importance: 0.8, share: { mode: "agents", allow: ["planning"] },
  });
  assert.equal(remembered.ok, true);
  assert.equal(remembered.entry.kind, "decision");

  const recalled = await post("/context-memory/recall", { query: "réunion client", limit: 5 });
  assert.equal(recalled.ok, true);
  assert.equal(recalled.result.remote, false);
  assert.ok(recalled.result.hits.length >= 1);

  const shared = await post("/context-memory/share", { agent: "planning", query: "réunion client", limit: 5 });
  assert.equal(shared.ok, true);
  assert.equal(shared.context.agent, "planning");
  assert.ok(shared.context.hits.some((hit: any) => hit.entry.id === remembered.entry.id));
  const badAgent = await post("/context-memory/share", { agent: "inconnu", query: "réunion" });
  assert.equal(badAgent.ok, false);
  assert.equal(badAgent.code, "INVALID_AGENT");

  const consolidated = await post("/context-memory/consolidate", {});
  assert.equal(consolidated.ok, true);
  assert.ok(consolidated.status.lastConsolidationAt > 0);

  const bridgeDenied = await post("/context-memory/bridge/memories", { items: [{ fact: "test" }], confirm: false });
  assert.equal(bridgeDenied.ok, false);
  assert.equal(bridgeDenied.code, "BRIDGE_CONFIRM_REQUIRED");
  const bridge = await post("/context-memory/bridge/memories", { items: [{ fact: "test" }], confirm: true });
  assert.equal(bridge.ok, true);
  assert.equal(bridge.result.accepted, 1);

  const duplicates = await get("/context-memory/duplicates");
  assert.equal(duplicates.ok, true);
  assert.equal(Array.isArray(duplicates.duplicates), true);

  const status = await get("/status");
  assert.equal(status.status.phase, 8);
  assert.equal(status.status.capabilities.contextMemory, true);
  assert.equal(status.status.contextMemory.schema, CONTEXT_MEMORY_SCHEMA);

  await post("/stop", { reason: "STOP HTTP Phase 8" });
  const blocked = await post("/context-memory/remember", { text: "Bloqué par HTTP" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "STOP_GLOBAL_ACTIVE");
  const stillReadable = await get("/context-memory");
  assert.equal(stillReadable.ok, true);
});

test("non-régression : phases 2 à 7 opérationnelles avec la mémoire contextuelle active", async () => {
  const core = await makeCore();
  const classified = await core.handle({ text: "Crée un site web pour mon entreprise" });
  assert.equal(classified.kind, "mission");
  const run = await core.dispatchMission(classified.mission!.id);
  assert.equal(run.status, "completed", run.error ?? "run agent non terminé");
  assert.ok(core.listAgentMemory(run.id).length >= 1);

  const skill = await core.createSkill({
    name: "Compétence non-régression P8",
    description: "Test locale",
    category: "test",
    parameters: [{ name: "sujet", type: "string", required: true, maxLength: 80 }],
    steps: [{ id: "render", kind: "template", template: "Synthèse {{params.sujet}}" }],
    tests: [{ name: "nominal", input: { sujet: "JARVIS" }, expect: { contains: "JARVIS" } }],
  });
  await core.testSkill(skill.id);
  await core.setToolEnabled("context_template", true);
  assert.equal((await core.executeTool("context_template", { objectif: "Contrôle final" })).ok, true);

  const task = await core.createScheduledTask({
    name: "Rappel non-régression P8", kind: "once", at: now() - 1, enabled: true,
    action: { type: "reminder", text: "Rappel local" },
  });
  assert.equal(task.enabled, true);

  const device = core.getDevices();
  assert.equal(device.readiness, "ready");
  assert.equal(device.multiDeviceSync, false);
  const exported = await core.exportDeviceBundle();
  assert.equal(JSON.parse(exported.text).manifest.schema, "jarvis-device-bundle-v1");

  const entry = await core.remember({ text: "Capzo aime les synthèses claires", scope: "long" });
  const hits = core.recallContext("synthèses claires Capzo").hits;
  assert.ok(hits.some((hit) => hit.entry.id === entry.id));

  const caps = core.getStatus().capabilities;
  assert.equal(caps.dynamicSkills, true);
  assert.equal(caps.agentExecution, true);
  assert.equal(caps.scheduler, true);
  assert.equal(caps.toolRegistry, true);
  assert.equal(caps.devicePreparation, true);
  assert.equal(caps.contextMemory, true);
  assert.equal(caps.multiDeviceSync, false);
});
