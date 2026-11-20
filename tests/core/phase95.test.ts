/**
 * Suite de sécurité Phase 9.5 — JARVIS 4.0 (node:test).
 *
 * Couvre les 17 contrôles obligatoires : authentification distante fail-closed,
 * contournement Host/X-Forwarded-For, traversée de chemins (dont symlink),
 * STOP GLOBAL sur chaque famille de mutations, reprise/approbation non
 * authentifiées, fichiers générés, mémoire privée et persistance.
 *
 * Aucun test destructif n'est exécuté sur les fichiers du projet : les cibles
 * de suppression sont créées dans des répertoires temporaires isolés.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import {
  createBasicAuthMiddleware,
  createNetworkAccessMiddleware,
  isLoopbackAddress,
  resolveConnectionAddress,
} from "../../server/modules/apiSecurity.ts";
import {
  createVideoStudioRouter,
  InvalidJobIdError,
  resolveSafeJobPath,
  validateJobId,
} from "../../server/modules/videoStudioRoute.ts";
import { JarvisCore } from "../../src/core/JarvisCore.ts";
import { CoreStopError } from "../../src/core/types.ts";
import { MemoryCoreStorage } from "../../src/core/storage/MemoryCoreStorage.ts";
import type { CoreStorage } from "../../src/core/types.ts";
import type { NewSkillInput } from "../../src/core/skills/types.ts";
import type { NewToolDefinition } from "../../src/core/tools/types.ts";
import type { NewScheduledTask } from "../../src/core/scheduler/types.ts";

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

type HeaderMap = Record<string, string>;

interface MiddlewareResult {
  status: number;
  body: Record<string, unknown> | undefined;
  headers: HeaderMap;
  nextCalled: boolean;
}

function fakeRequest(url: string, remoteAddress: string, headers: HeaderMap = {}, method = "GET"): any {
  const normalized: HeaderMap = {};
  for (const [key, value] of Object.entries(headers)) normalized[key.toLowerCase()] = value;
  return {
    method,
    originalUrl: url,
    path: url.split("?")[0],
    socket: { remoteAddress },
    get: (name: string): string => normalized[name.toLowerCase()] ?? "",
    jarvisActor: undefined,
  };
}

function runMiddleware(handler: any, req: any): MiddlewareResult {
  let status = 200;
  let body: Record<string, unknown> | undefined;
  const headers: HeaderMap = {};
  let nextCalled = false;
  const res: any = {
    setHeader: (key: string, value: string): void => { headers[key.toLowerCase()] = String(value); },
    status: (value: number): any => { status = value; return res; },
    json: (value: Record<string, unknown>): any => { body = value; return res; },
  };
  handler(req, res, (): void => { nextCalled = true; });
  return { status, body, headers, nextCalled };
}

function withEnv(values: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const REMOTE_IP = "203.0.113.42";

async function assertStopCode(fn: () => unknown | Promise<unknown>): Promise<void> {
  await assert.rejects(async () => { await fn(); }, (err: unknown) => {
    assert.equal((err as { code?: string })?.code, "STOP_GLOBAL_ACTIVE", `code STOP attendu, reçu ${String(err)}`);
    assert.match((err as Error)?.message ?? "", /STOP GLOBAL/i);
    return true;
  });
}

let counter = 0;
const now = (): number => 1_900_000_000_000 + counter++ * 10;
const id = (prefix: string): string => `${prefix}_p95_${counter++}`;

class VolatileStorage implements CoreStorage {
  readonly info = {
    kind: "local-file" as const,
    persistent: true,
    sharedAcrossDevices: false,
    detail: "Stockage volatile simulant le fichier local pour les tests Phase 9.5.",
  };
  private readonly inner = new MemoryCoreStorage();
  async load() { return this.inner.load(); }
  async save(state: Parameters<CoreStorage["save"]>[0]): Promise<void> { await this.inner.save(state); }
}

async function makeCore(storage: CoreStorage = new VolatileStorage()): Promise<JarvisCore> {
  const core = new JarvisCore({ storage, now, id });
  await core.init();
  return core;
}

function demoSkill(): NewSkillInput {
  return {
    name: "Compétence Phase 9.5",
    description: "Compétence déterministe de test de non-régression.",
    category: "test",
    parameters: [{ name: "topic", type: "string", required: true, maxLength: 100 }],
    steps: [{ id: "build", kind: "template", template: "Résumé {{params.topic}}" }],
    expectedResult: "Texte court",
    permissions: [],
    tests: [{ name: "nominal", input: { topic: "JARVIS" }, expect: { contains: "JARVIS" } }],
  } as NewSkillInput;
}

function demoTool(): NewToolDefinition {
  return {
    name: "outil_p95",
    description: "Outil déclaratif de test Phase 9.5.",
    kind: "template",
    template: "Sujet : {{input.objectif}}",
    fields: [{ name: "objectif", type: "string", required: true, maxLength: 200 }],
  };
}

const demoTask = (): NewScheduledTask => ({
  name: "Tâche Phase 9.5",
  kind: "daily",
  timezone: "Europe/Paris",
  hour: 9,
  minute: 0,
  action: { type: "reminder", text: "Rappel local" },
});

// ---------------------------------------------------------------------------
// 1-3. Authentification, Host trompeur, X-Forwarded-For
// ---------------------------------------------------------------------------

test("sécurité 1 : requête distante sans authentification refusée (fail closed)", () => {
  withEnv({
    JARVIS_REQUIRE_AUTH: undefined, JARVIS_API_TOKEN: undefined,
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
    JARVIS_TRUST_PROXY: undefined,
  }, () => {
    const result = runMiddleware(createNetworkAccessMiddleware(), fakeRequest("/api/core/status", REMOTE_IP));
    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 503);
    assert.equal(result.body?.code, "AUTH_NOT_CONFIGURED");
    assert.ok(!JSON.stringify(result.body).match(/token|password|secret/i));
  });
});

test("sécurité 2 : Host: localhost depuis une origine distante ne contourne rien", () => {
  withEnv({
    JARVIS_REQUIRE_AUTH: undefined, JARVIS_API_TOKEN: undefined,
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
    JARVIS_TRUST_PROXY: undefined,
  }, () => {
    const result = runMiddleware(
      createNetworkAccessMiddleware(),
      fakeRequest("/api/core/resume", REMOTE_IP, { host: "localhost", origin: "http://localhost" })
    );
    assert.equal(result.status, 503);
    assert.equal(result.body?.code, "AUTH_NOT_CONFIGURED");
    assert.equal(result.nextCalled, false);
  });
});

test("sécurité 3 : X-Forwarded-For non fiable par défaut, proxy explicitement configuré uniquement", () => {
  withEnv({
    JARVIS_REQUIRE_AUTH: undefined, JARVIS_API_TOKEN: undefined,
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
    JARVIS_TRUST_PROXY: undefined, JARVIS_TRUSTED_PROXY_IPS: undefined,
  }, () => {
    const spoofed = runMiddleware(
      createNetworkAccessMiddleware(),
      fakeRequest("/api/core/status", REMOTE_IP, { "x-forwarded-for": "127.0.0.1" })
    );
    assert.equal(spoofed.status, 503, "XFF ne doit pas transformer une IP distante en loopback");
    assert.equal(resolveConnectionAddress(fakeRequest("/", REMOTE_IP, { "x-forwarded-for": "127.0.0.1" })).address, REMOTE_IP);
  });

  withEnv({
    JARVIS_TRUST_PROXY: "true",
    JARVIS_TRUSTED_PROXY_IPS: REMOTE_IP,
    JARVIS_REQUIRE_AUTH: undefined, JARVIS_API_TOKEN: undefined,
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
  }, () => {
    // Configuration explicite : l'en-tête est ici légitimement pris en compte.
    const request = fakeRequest("/api/core/status", REMOTE_IP, { "x-forwarded-for": "198.51.100.7" });
    assert.equal(resolveConnectionAddress(request).address, "198.51.100.7");
    assert.equal(resolveConnectionAddress(request).viaConfiguredProxy, true);
    const result = runMiddleware(createNetworkAccessMiddleware(), request);
    assert.equal(result.status, 503, "le client transmis reste distant : auth toujours requise");
  });
});

test("sécurité : le mode local loopback reste libre et l'alias Basic reste compatible", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress(REMOTE_IP), false);

  withEnv({
    JARVIS_REQUIRE_AUTH: undefined, JARVIS_API_TOKEN: undefined,
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
    JARVIS_TRUST_PROXY: undefined,
  }, () => {
    const local = runMiddleware(createNetworkAccessMiddleware(), fakeRequest("/api/core/status", "127.0.0.1"));
    assert.equal(local.nextCalled, true);
    assert.equal(local.status, 200);
    const alias = runMiddleware(createBasicAuthMiddleware(), fakeRequest("/api/health", "::1"));
    assert.equal(alias.nextCalled, true);
  });
});

test("sécurité : proxy public avec socket loopback ne contourne pas l'authentification", () => {
  withEnv({
    JARVIS_REQUIRE_AUTH: "true", JARVIS_API_TOKEN: "token-p95-proxy",
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
    JARVIS_TRUST_PROXY: undefined,
  }, () => {
    // Cas Render/Cloudflare : socket loopback mais client réel sur Internet.
    const proxied = runMiddleware(
      createNetworkAccessMiddleware(),
      fakeRequest("/api/core/status", "127.0.0.1", {
        host: "jarvis-3-64rb.onrender.com",
        "x-forwarded-for": "203.0.113.42",
        "x-forwarded-proto": "https",
        "cf-ray": "test-ray",
      })
    );
    assert.equal(proxied.nextCalled, false);
    assert.equal(proxied.status, 401);
    assert.equal(proxied.body?.code, "UNAUTHORIZED");

    // Le Host public seul suffit à refuser la confiance locale.
    const hostOnly = runMiddleware(
      createNetworkAccessMiddleware(),
      fakeRequest("/api/core/status", "::1", { host: "jarvis-3-64rb.onrender.com" })
    );
    assert.equal(hostOnly.status, 401);

    // La sonde de santé reste publique derrière le proxy (healthcheck Render).
    const probe = runMiddleware(
      createNetworkAccessMiddleware(),
      fakeRequest("/api/health", "127.0.0.1", {
        host: "jarvis-3-64rb.onrender.com", "x-forwarded-proto": "https",
      })
    );
    assert.equal(probe.nextCalled, true);
    assert.equal(probe.status, 200);
  });
});

test("sécurité : Bearer et Basic configurés sont acceptés, mauvais identifiants refusés", () => {
  withEnv({
    JARVIS_REQUIRE_AUTH: "true",
    JARVIS_API_TOKEN: "token-de-test-unique",
    JARVIS_PUBLIC_BASIC_USER: "utilisateur-test",
    JARVIS_PUBLIC_BASIC_PASS: "mot-de-passe-de-test",
    JARVIS_TRUST_PROXY: undefined,
  }, () => {
    const bearer = Buffer.from("").toString("base64"); // garde la dépendance Buffer explicite
    assert.ok(typeof bearer === "string");
    const ok = runMiddleware(createNetworkAccessMiddleware(),
      fakeRequest("/api/core/status", REMOTE_IP, { authorization: "Bearer token-de-test-unique" }));
    assert.equal(ok.nextCalled, true);
    const bad = runMiddleware(createNetworkAccessMiddleware(),
      fakeRequest("/api/core/status", REMOTE_IP, { authorization: "Bearer mauvais" }));
    assert.equal(bad.status, 401);
    const basic = Buffer.from("utilisateur-test:mot-de-passe-de-test").toString("base64");
    const okBasic = runMiddleware(createNetworkAccessMiddleware(),
      fakeRequest("/api/core/status", REMOTE_IP, { authorization: `Basic ${basic}` }));
    assert.equal(okBasic.nextCalled, true);
  });
});

test("sécurité 14 : reprise et approbation non authentifiées depuis le réseau sont refusées", () => {
  withEnv({
    JARVIS_REQUIRE_AUTH: "true", JARVIS_API_TOKEN: "token-p95",
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
    JARVIS_TRUST_PROXY: undefined,
  }, () => {
    for (const route of ["/api/core/resume", "/api/core/permissions/approve"]) {
      const result = runMiddleware(createNetworkAccessMiddleware(), fakeRequest(route, REMOTE_IP, {}, "POST"));
      assert.equal(result.status, 401);
      assert.equal(result.body?.code, "UNAUTHORIZED");
    }
  });
});

// ---------------------------------------------------------------------------
// 4-7. Traversée de chemins et suppression
// ---------------------------------------------------------------------------

test("sécurité 4-6 : identifiants `../`, absolus et encodés refusés", () => {
  for (const value of ["../outside.txt", "..\\outside.txt", "a/b", "%2e%2e%2foutside.txt", "job%00.txt", "", "a b"]) {
    assert.throws(() => validateJobId(value), InvalidJobIdError, `doit refuser ${JSON.stringify(value)}`);
  }
  assert.throws(() => validateJobId(path.resolve("C:\\", "outside.txt")), InvalidJobIdError);
  assert.equal(validateJobId("video-123_ab"), "video-123_ab");
});

test("sécurité 4-7 : resolveSafeJobPath reste dans la racine, refuse les liens symboliques et ne supprime rien hors périmètre", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-p95-"));
  t.after(async () => { await fs.rm(base, { recursive: true, force: true }); });
  const root = path.join(base, "allowed");
  await fs.mkdir(root);
  const outside = path.join(base, "outside.txt");
  await fs.writeFile(outside, "ne jamais supprimer", "utf8");
  const valid = path.join(root, "job-ok");
  await fs.mkdir(valid);

  await assert.rejects(() => resolveSafeJobPath(root, "../outside.txt"), InvalidJobIdError);
  await assert.rejects(() => resolveSafeJobPath(root, outside), InvalidJobIdError);
  await assert.rejects(() => resolveSafeJobPath(root, "%2e%2e%2foutside.txt"), InvalidJobIdError);
  assert.equal(await fs.readFile(outside, "utf8"), "ne jamais supprimer", "aucune suppression hors périmètre");

  const safe = await resolveSafeJobPath(root, "job-ok");
  assert.equal(safe, await fs.realpath(valid));

  const link = path.join(root, "job-link");
  try {
    await fs.symlink(outside, link, "file");
    await assert.rejects(() => resolveSafeJobPath(root, "job-link"), InvalidJobIdError);
  } catch (err) {
    // Certains environnements Windows interdisent la création de liens symboliques.
    if ((err as { code?: string }).code !== "EPERM" && (err as { code?: string }).code !== "EACCES") throw err;
  }
});

test("sécurité : la route HTTP DELETE refuse une traversée sans toucher au fichier cible", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-p95-route-"));
  t.after(async () => { await fs.rm(base, { recursive: true, force: true }); });
  const outside = path.join(base, "hors-perimetre.txt");
  await fs.writeFile(outside, "intact", "utf8");

  const app = express();
  app.use(express.json());
  app.use("/api", createVideoStudioRouter());
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  for (const id of ["%2e%2e%2fhors-perimetre.txt", "..%2Fhors-perimetre.txt", "C%3A%5CWINDOWS%5Cwin.ini"]) {
    const response = await fetch(`${baseUrl}/video-studio/jobs/${id}`, { method: "DELETE" });
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_JOB_ID");
  }
  assert.equal(await fs.readFile(outside, "utf8"), "intact");
});

// ---------------------------------------------------------------------------
// 8-13, 17. STOP GLOBAL
// ---------------------------------------------------------------------------

test("sécurité 8-13,17 : STOP bloque chaque famille de mutations, persiste et laisse les lectures", async () => {
  const storage = new VolatileStorage();
  const core = await makeCore(storage);
  const skill = await core.createSkill(demoSkill());
  const task = await core.createScheduledTask(demoTask());
  await core.remember({ text: "Souvenir Phase 9.5" });

  await core.stopAll("STOP Phase 9.5");
  assert.equal(core.isStopped(), true);

  // 8. Mission
  await assertStopCode(() => core.createMission("Mission interdite sous STOP"));
  await assertStopCode(() => core.startMission("mission-inexistante"));
  // 9. Outils
  await assertStopCode(() => core.registerTool(demoTool()));
  await assertStopCode(() => core.setToolEnabled("core_status", false));
  // 10. Skills
  await assertStopCode(() => core.updateSkill(skill.id, { description: "Modification interdite" }));
  await assertStopCode(() => core.disableSkill(skill.id));
  // 11. Scheduler
  await assertStopCode(() => core.createScheduledTask(demoTask()));
  await assertStopCode(() => core.updateScheduledTask(task.id, { enabled: false }));
  await assertStopCode(() => core.triggerScheduledTask(task.id));
  await assertStopCode(() => core.removeScheduledTask(task.id));
  // 12. Permissions
  await assertStopCode(() => core.approve("private_data", "memory_search"));
  await assertStopCode(() => core.deny("private_data", "autre"));
  await assertStopCode(() => core.revoke("private_data", "memory_search"));
  // 13. Mémoire
  await assertStopCode(() => core.remember({ text: "Écriture interdite sous STOP" }));

  // Les lectures non mutantes restent disponibles et n'écrivent aucun compteur.
  assert.equal(core.listMissions().length, 0);
  assert.equal(core.listTools().length, 5);
  assert.equal(core.listContextMemory().length, 1);
  const before = core.getContextMemoryStatus().stats.recalls;
  assert.ok(core.recallContext("Souvenir").hits.length >= 1, "lecture autorisée sous STOP");
  assert.equal(core.getContextMemoryStatus().stats.recalls, before, "lecture pure sous STOP");

  // 17. Persistance après redémarrage réel de l'instance.
  const restarted = await makeCore(storage);
  assert.equal(restarted.isStopped(), true);
  await assertStopCode(() => restarted.createMission("Toujours interdit"));
  const resumed = await restarted.resume("Reprise Phase 9.5");
  assert.equal(resumed.resumed, true);
  assert.equal(restarted.isStopped(), false);
  assert.ok(restarted instanceof JarvisCore);
  assert.equal(CoreStopError.name, "CoreStopError");
});

test("sécurité 11 (complément) : suppression bloquée sous STOP, tâche strictement intacte", async () => {
  const core = await makeCore();
  const task = await core.createScheduledTask(demoTask());
  await core.stopAll("STOP suppression scheduler");

  await assertStopCode(() => core.removeScheduledTask(task.id));
  assert.deepEqual(core.getScheduledTask(task.id), task, "aucune mutation de la tâche sous STOP");
  assert.equal(core.listScheduledTasks().length, 1);

  await core.resume("Reprise suppression scheduler");
  const result = await core.removeScheduledTask(task.id);
  assert.equal(result.removed, true, "la suppression redevient possible après reprise explicite");
  assert.equal(core.listScheduledTasks().length, 0);
});

// ---------------------------------------------------------------------------
// 15-16. Fichiers générés et mémoire privée
// ---------------------------------------------------------------------------

test("sécurité 15 : fichiers générés et routes sensibles non accessibles sans authentification", () => {
  withEnv({
    JARVIS_REQUIRE_AUTH: "true", JARVIS_API_TOKEN: "token-p95",
    JARVIS_PUBLIC_BASIC_USER: undefined, JARVIS_PUBLIC_BASIC_PASS: undefined,
    JARVIS_TRUST_PROXY: undefined,
  }, () => {
    for (const route of [
      "/generated/video-1/audio.mp3", "/reels/reel.mp4", "/hyperframes/hf.mp4",
      "/api/core/context-memory", "/api/core/memory/search", "/api/core/resume",
    ]) {
      const result = runMiddleware(createNetworkAccessMiddleware(), fakeRequest(route, REMOTE_IP));
      assert.equal(result.status, 401, `${route} doit être protégé`);
      assert.equal(result.nextCalled, false);
    }
  });
});

test("sécurité 16 : memory_search ne contourne pas le filtre de partage pour un agent", async () => {
  const core = await makeCore();
  await core.approve("private_data", "memory_search");
  await core.remember({ text: "Secret prive capzo p95", share: { mode: "private" } });

  const asUser = await core.executeTool("memory_search", { objectif: "Secret prive capzo p95" });
  assert.equal(asUser.ok, true);
  assert.match(asUser.output ?? "", /capzo p95/);

  const asAgent = await core.executeTool(
    "memory_search", { objectif: "Secret prive capzo p95" }, { agent: "research" }
  );
  assert.equal(asAgent.ok, true);
  assert.doesNotMatch(asAgent.output ?? "", /capzo p95/, "un agent ne lit pas un souvenir privé");
});
