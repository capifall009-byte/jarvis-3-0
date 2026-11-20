/**
 * Préparation multi-appareils locale — JARVIS 4.0 Phase 7.
 *
 * Moteur déterministe et borné : identité opaque persistée, checklist de
 * préparation, export/import manuel d'un sous-ensemble portable. Aucun appel
 * réseau, aucun compte, aucun secret, aucune exécution de code fourni, aucune
 * synchronisation automatique. STOP GLOBAL bloque toutes les opérations qui
 * modifient l'état (export, aperçu, application, renommage).
 */

import type { AuditLog } from "../AuditLog.ts";
import { SENSITIVE_ACTIONS } from "../types.ts";
import type { CoreSensitiveAction, CoreState, CoreStorageInfo, CoreTask, Mission } from "../types.ts";
import type { ScheduledTask } from "../scheduler/types.ts";
import type {
  SkillDefinition,
  SkillParameter,
  SkillStep,
  SkillTestCase,
} from "../skills/types.ts";
import type { ToolDefinition, ToolField } from "../tools/types.ts";
import {
  DEVICE_BUNDLE_SCHEMA,
  MAX_BUNDLE_CHARS,
  MAX_BUNDLE_ITEMS,
  MAX_DEVICE_HISTORY,
  MAX_DEVICE_LABEL,
  emptyDeviceState,
} from "./types.ts";
import type {
  DeviceBundle,
  DeviceBundleManifest,
  DeviceExportResult,
  DeviceIdentity,
  DeviceImportRecord,
  DeviceImportTotals,
  DevicePortableState,
  DevicePreviewResult,
  DeviceReadinessCheck,
  DeviceState,
  DeviceStatusView,
} from "./types.ts";

export class DeviceBundleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DeviceBundleError";
    this.code = code;
  }
}

export interface DeviceManagerDeps {
  state: CoreState;
  storage: CoreStorageInfo;
  audit: AuditLog;
  now: () => number;
  id: (prefix: string) => string;
  isStopped: () => boolean;
}

interface StagedImport {
  id: string;
  at: number;
  checksum: string;
  manifest: DeviceBundleManifest;
  text: string;
  /** Phase 9.5 : acteur explicitement demandeur de l'aperçu, si fourni. */
  actor?: string;
}

const NAME_RE = /^[a-z][a-z0-9_.]{2,63}$/;
const FIELD_RE = /^[a-z][a-z0-9_]{1,39}$/;
const ID_RE = /^[a-zA-Z0-9_-]{2,80}$/;
/** Phase 9.5 : un aperçu d'import n'est valable que 10 minutes. */
const IMPORT_STAGING_TTL_MS = 10 * 60 * 1000;
const GLOBAL_TRANSFER_ACTIONS: readonly CoreSensitiveAction[] = [
  "external_message", "private_data", "modify_permissions", "modify_secrets",
  "filesystem_write", "terminal", "deploy", "publish",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Sérialisation canonique : clés triées, identique dans le navigateur et Node. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (isRecord(current)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(current).sort()) sorted[key] = current[key];
      return sorted;
    }
    return current;
  }) ?? "null";
}

/** Empreinte non cryptographique : détecte une altération accidentelle, pas un attaquant. */
export function bundleChecksum(value: unknown): string {
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}-${text.length.toString(36)}`;
}

function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i += 1; } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function permissionOf(value: unknown): CoreSensitiveAction | undefined {
  return typeof value === "string" && (SENSITIVE_ACTIONS as readonly string[]).includes(value)
    ? (value as CoreSensitiveAction)
    : undefined;
}

function baseWarnings(): string[] {
  return [
    "Données portables uniquement : aucun secret, aucune approbation ni historique d'exécution n'est transféré.",
    "Éléments importés inactifs : missions planifiées, compétences en brouillon, outils et tâches désactivés.",
    "Les identifiants déjà présents sur cet appareil ne sont jamais remplacés.",
    "Le contexte de mission n'est pas importé ; aucune synchronisation n'est effectuée.",
  ];
}

export class DeviceManager {
  private readonly state: CoreState;
  private readonly devices: DeviceState;
  private readonly storage: CoreStorageInfo;
  private readonly audit: AuditLog;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly isStopped: () => boolean;
  /** L'aperçu est volontairement en mémoire de session : jamais persisté. */
  private staged: StagedImport | null = null;

  constructor(deps: DeviceManagerDeps) {
    this.state = deps.state;
    this.devices = this.state.devices ?? emptyDeviceState();
    this.state.devices = this.devices;
    this.storage = deps.storage;
    this.audit = deps.audit;
    this.now = deps.now;
    this.id = deps.id;
    this.isStopped = deps.isStopped;

    if (!this.devices.device.id) {
      const ts = this.now();
      this.devices.device.id = this.id("device");
      this.devices.device.createdAt = ts;
      this.devices.device.updatedAt = ts;
    }
    this.refreshChecks("core");
  }

  // ---------- identité et préparation ----------

  view(): DeviceStatusView {
    const lastImport = this.devices.imports[0];
    return {
      id: this.devices.device.id,
      label: this.devices.device.label,
      createdAt: this.devices.device.createdAt,
      readiness: this.devices.readiness,
      checks: clone(this.devices.checks),
      checkedAt: this.devices.checkedAt,
      exports: this.devices.exports,
      lastExportAt: this.devices.lastExportAt,
      importCount: this.devices.imports.length,
      lastImportAt: lastImport?.at ?? 0,
      sharedAcrossDevices: this.storage.sharedAcrossDevices,
      multiDeviceSync: false,
    };
  }

  rename(label: string, actor = "user"): DeviceIdentity {
    this.assertNotStopped("Le renommage de l'appareil");
    const clean = cleanText(label, MAX_DEVICE_LABEL);
    if (!clean) throw new DeviceBundleError("DEVICE_LABEL_REQUIRED", "Un nom d'appareil est requis.");
    this.devices.device.label = clean;
    this.devices.device.updatedAt = this.now();
    this.audit.record({
      actor: cleanText(actor, 80) || "user",
      action: "device_renamed",
      target: this.devices.device.id,
      outcome: "success",
      detail: `Nom local : ${clean}. Aucun compte ni service distant associé.`,
    });
    return { ...this.devices.device };
  }

  refreshChecks(actor = "user"): DeviceStatusView {
    const previous = this.devices.readiness;
    const wildcard = Object.keys(this.state.approvals).filter(
      (key) => key.endsWith("|*") && GLOBAL_TRANSFER_ACTIONS.some((action) => key.startsWith(`${action}|`))
    );
    const checks: DeviceReadinessCheck[] = [
      {
        id: "device_identity",
        label: "Identité locale stable",
        ok: !!this.devices.device.id && this.devices.device.createdAt > 0,
        detail: "Identifiant opaque généré une seule fois et conservé dans le stockage local.",
      },
      {
        id: "local_persistence",
        label: "Stockage local persistant",
        ok: this.storage.persistent && this.storage.kind !== "remote",
        detail: this.storage.detail.slice(0, 200),
      },
      {
        id: "no_remote_sync",
        label: "Aucune synchronisation distante configurée",
        ok: this.storage.kind !== "remote" && !this.storage.sharedAcrossDevices,
        detail: "Aucun compte, base distante ni service de synchronisation n'est configuré.",
      },
      {
        id: "no_transfer_approval",
        label: "Aucune autorisation globale de transfert",
        ok: wildcard.length === 0,
        detail: wildcard.length === 0
          ? "Aucune approbation globale n'autorise un transfert ou une écriture sensible."
          : `${wildcard.length} approbation(s) globale(s) sensible(s) détectée(s) : à révoquer manuellement.`,
      },
      {
        id: "audit_trail",
        label: "Journal d'audit local actif",
        ok: Array.isArray(this.state.audit),
        detail: "Journal local présent : chaque export/import y est enregistré avec son appareil d'origine.",
      },
      {
        id: "stop_inactive",
        label: "STOP GLOBAL inactif",
        ok: !this.isStopped(),
        detail: "STOP GLOBAL reste prioritaire : il bloque export, aperçu et import.",
      },
    ];
    this.devices.checks = checks;
    this.devices.checkedAt = this.now();
    const identityOk = checks[0].ok;
    this.devices.readiness = !identityOk
      ? "not_ready"
      : checks.every((check) => check.ok) ? "ready" : "needs_review";
    if (previous !== this.devices.readiness) {
      this.audit.record({
        actor: cleanText(actor, 80) || "user",
        action: "device_readiness_changed",
        target: this.devices.device.id,
        outcome: "info",
        detail: `Préparation locale : ${previous} → ${this.devices.readiness}.`,
      });
    }
    return this.view();
  }

  // ---------- export ----------

  exportBundle(): DeviceExportResult {
    this.assertNotStopped("L'export");
    const portable = this.buildPortableState();
    const checksum = bundleChecksum(portable);
    const payloadBytes = utf8Length(canonical(portable));
    const manifest: DeviceBundleManifest = {
      schema: DEVICE_BUNDLE_SCHEMA,
      version: 1,
      createdAt: this.now(),
      sourceDevice: {
        id: this.devices.device.id,
        label: this.devices.device.label,
      },
      counts: {
        missions: portable.missions.length,
        skills: portable.skills.length,
        tools: portable.tools.length,
        tasks: portable.tasks.length,
      },
      bytes: payloadBytes,
      checksum,
      warnings: baseWarnings(),
    };
    const bundle: DeviceBundle = { manifest, state: portable };
    const text = canonical(bundle);
    const bytes = utf8Length(text);
    if (bytes > MAX_BUNDLE_CHARS) {
      throw new DeviceBundleError(
        "BUNDLE_TOO_LARGE",
        `Export trop volumineux (${bytes} octets) : limite locale de ${MAX_BUNDLE_CHARS} octets.`
      );
    }

    this.devices.exports += 1;
    this.devices.lastExportAt = manifest.createdAt;
    this.devices.exportHistory.unshift({ id: this.id("exp"), at: manifest.createdAt, bytes, checksum });
    this.devices.exportHistory = this.devices.exportHistory.slice(0, MAX_DEVICE_HISTORY);
    this.audit.record({
      actor: "user",
      action: "device_bundle_exported",
      target: this.devices.device.id,
      outcome: "success",
      detail: `Export local : ${bytes} octets, ${manifest.counts.missions} mission(s), ${manifest.counts.skills} compétence(s), ${manifest.counts.tools} outil(s), ${manifest.counts.tasks} tâche(s). Aucune transmission.`,
    });
    return { text, manifest: clone(manifest), bytes };
  }

  // ---------- import manuel ----------

  preview(text: string, actor?: string): DevicePreviewResult {
    this.assertNotStopped("L'aperçu d'import");
    if (typeof text !== "string" || !text.trim()) {
      throw new DeviceBundleError("BUNDLE_EMPTY", "Aucun contenu de bundle fourni.");
    }
    if (text.length > MAX_BUNDLE_CHARS) {
      throw new DeviceBundleError("BUNDLE_TOO_LARGE", "Bundle trop volumineux pour un import local.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new DeviceBundleError("BUNDLE_INVALID_JSON", "Le bundle n'est pas un JSON valide.");
    }
    if (!isRecord(parsed) || !isRecord(parsed.manifest) || !isRecord(parsed.state)) {
      throw new DeviceBundleError("BUNDLE_INVALID_SHAPE", "Structure de bundle invalide.");
    }
    const rawManifest = parsed.manifest;
    if (rawManifest.schema !== DEVICE_BUNDLE_SCHEMA || rawManifest.version !== 1) {
      throw new DeviceBundleError("BUNDLE_UNSUPPORTED", "Schéma de bundle non pris en charge.");
    }
    const portable = this.validatePortable(parsed.state);
    const checksum = bundleChecksum(portable);
    if (rawManifest.checksum !== checksum) {
      throw new DeviceBundleError(
        "BUNDLE_CHECKSUM_MISMATCH",
        "Empreinte du bundle incohérente : contenu altéré ou tronqué."
      );
    }
    const suppliedWarnings = Array.isArray(rawManifest.warnings)
      ? rawManifest.warnings.slice(0, 8).map((item) => cleanText(item, 300)).filter(Boolean)
      : [];
    const manifest: DeviceBundleManifest = {
      schema: DEVICE_BUNDLE_SCHEMA,
      version: 1,
      createdAt: boundedNumber(rawManifest.createdAt, 0, 0, Number.MAX_SAFE_INTEGER),
      sourceDevice: {
        id: cleanText(isRecord(rawManifest.sourceDevice) ? rawManifest.sourceDevice.id : "", 120) || "inconnu",
        label: cleanText(isRecord(rawManifest.sourceDevice) ? rawManifest.sourceDevice.label : "", MAX_DEVICE_LABEL) || "Appareil inconnu",
      },
      counts: {
        missions: portable.missions.length,
        skills: portable.skills.length,
        tools: portable.tools.length,
        tasks: portable.tasks.length,
      },
      bytes: boundedNumber(rawManifest.bytes, 0, 0, MAX_BUNDLE_CHARS),
      checksum,
      warnings: [...baseWarnings(), ...suppliedWarnings],
    };
    this.staged = {
      id: this.id("stg"), at: this.now(), checksum, manifest, text,
      ...(actor ? { actor: cleanText(actor, 64) } : {}),
    };
    return { stagedId: this.staged.id, manifest: clone(manifest) };
  }

  apply(stagedId: string, actor = "user", confirm = false): DeviceImportRecord {
    if (confirm !== true) {
      throw new DeviceBundleError("IMPORT_CONFIRM_REQUIRED", "Application explicite requise (confirm: true).");
    }
    this.assertNotStopped("L'import");
    if (!this.staged || this.staged.id !== stagedId) {
      throw new DeviceBundleError("IMPORT_STAGING_MISSING", "Aperçu introuvable ou expiré : relancez l'aperçu.");
    }
    if (this.now() - this.staged.at > IMPORT_STAGING_TTL_MS) {
      this.staged = null;
      throw new DeviceBundleError("IMPORT_STAGING_EXPIRED", "Aperçu expiré : relancez l'aperçu avant d'appliquer l'import.");
    }
    if (this.staged.actor && this.staged.actor !== actor) {
      throw new DeviceBundleError("IMPORT_ACTOR_MISMATCH", "L'import doit être appliqué par le demandeur de l'aperçu.");
    }
    const parsed = JSON.parse(this.staged.text) as { state: Record<string, unknown> };
    const portable = this.validatePortable(parsed.state);
    const totals: Record<"missions" | "skills" | "tools" | "tasks", DeviceImportTotals> = {
      missions: { accepted: 0, skipped: 0 },
      skills: { accepted: 0, skipped: 0 },
      tools: { accepted: 0, skipped: 0 },
      tasks: { accepted: 0, skipped: 0 },
    };
    const now = this.now();
    const missionIds = new Set(this.state.missions.map((mission) => mission.id));

    for (const raw of portable.missions) {
      const mission = this.importMission(raw, missionIds, now);
      if (!mission) { totals.missions.skipped += 1; continue; }
      this.state.missions.push(mission);
      missionIds.add(mission.id);
      totals.missions.accepted += 1;
    }

    const skillIds = new Set(this.state.skills.map((skill) => skill.id));
    for (const raw of portable.skills) {
      const skill = this.importSkill(raw, now);
      if (!skill || skillIds.has(skill.id)) { totals.skills.skipped += 1; continue; }
      this.state.skills.push(skill);
      skillIds.add(skill.id);
      totals.skills.accepted += 1;
    }

    const toolNames = new Set(this.state.tools.tools.map((tool) => tool.name));
    for (const raw of portable.tools) {
      const tool = this.importTool(raw, toolNames, now);
      if (!tool) { totals.tools.skipped += 1; continue; }
      this.state.tools.tools.push(tool);
      toolNames.add(tool.name);
      totals.tools.accepted += 1;
    }

    for (const raw of portable.tasks) {
      const task = this.importTask(raw, missionIds, now);
      if (!task) { totals.tasks.skipped += 1; continue; }
      this.state.scheduler.tasks.push(task);
      totals.tasks.accepted += 1;
    }

    const safeActor = cleanText(actor, 80) || "user";
    const record: DeviceImportRecord = {
      id: this.id("imp_rec"),
      at: now,
      actor: safeActor,
      sourceDeviceId: this.staged.manifest.sourceDevice.id,
      checksum: this.staged.checksum,
      manifest: clone(this.staged.manifest),
      totals,
    };
    this.devices.imports.unshift(record);
    this.devices.imports = this.devices.imports.slice(0, MAX_DEVICE_HISTORY);
    this.audit.record({
      actor: `device-import:${safeActor}`,
      action: "device_bundle_imported",
      target: record.id,
      outcome: "success",
      detail: `Source=${record.sourceDeviceId} · missions ${totals.missions.accepted}/${totals.missions.skipped} · compétences ${totals.skills.accepted}/${totals.skills.skipped} · outils ${totals.tools.accepted}/${totals.tools.skipped} · tâches ${totals.tasks.accepted}/${totals.tasks.skipped} (accepté/ignoré). Approbations et historique non importés.`,
    });
    this.staged = null;
    this.refreshChecks(safeActor);
    return clone(record);
  }

  // ---------- interne ----------

  private assertNotStopped(action: string): void {
    if (this.isStopped()) {
      throw new DeviceBundleError("STOP_GLOBAL_ACTIVE", `STOP GLOBAL actif : ${action} refusée.`);
    }
  }

  private buildPortableState(): DevicePortableState {
    return {
      missions: this.state.missions.slice(0, MAX_BUNDLE_ITEMS).map((entry) => clone(entry)),
      skills: this.state.skills.slice(0, MAX_BUNDLE_ITEMS).map((entry) => clone(entry)),
      tools: this.state.tools.tools
        .filter((tool) => !tool.builtin && tool.kind === "template")
        .slice(0, MAX_BUNDLE_ITEMS)
        .map((entry) => clone(entry)),
      tasks: this.state.scheduler.tasks.slice(0, MAX_BUNDLE_ITEMS).map((entry) => clone(entry)),
    };
  }

  private validatePortable(value: Record<string, unknown>): DevicePortableState {
    const arrays = ["missions", "skills", "tools", "tasks"] as const;
    for (const key of arrays) {
      if (!Array.isArray(value[key])) {
        throw new DeviceBundleError("BUNDLE_INVALID_SHAPE", `Collection « ${key} » invalide.`);
      }
      if ((value[key] as unknown[]).length > MAX_BUNDLE_ITEMS) {
        throw new DeviceBundleError("BUNDLE_TOO_LARGE", `Trop d'éléments dans « ${key} ».`);
      }
    }
    return {
      missions: value.missions as Mission[],
      skills: value.skills as SkillDefinition[],
      tools: value.tools as ToolDefinition[],
      tasks: value.tasks as ScheduledTask[],
    };
  }

  private importMission(raw: unknown, knownIds: Set<string>, now: number): Mission | null {
    if (!isRecord(raw)) return null;
    const idValue = cleanText(raw.id, 80);
    if (!ID_RE.test(idValue) || knownIds.has(idValue)) return null;
    const goal = cleanText(raw.goal, 2000);
    if (!goal || !Array.isArray(raw.tasks)) return null;
    const taskIds = raw.tasks
      .map((entry) => (isRecord(entry) ? cleanText(entry.id, 80) : ""))
      .filter((entry) => ID_RE.test(entry));
    const tasks: CoreTask[] = [];
    for (const entry of raw.tasks) {
      if (!isRecord(entry)) continue;
      const taskId = cleanText(entry.id, 80);
      if (!ID_RE.test(taskId) || tasks.some((task) => task.id === taskId)) continue;
      tasks.push({
        id: taskId,
        missionId: idValue,
        name: cleanText(entry.name, 300) || taskId,
        description: cleanText(entry.description, 1500),
        priority: boundedNumber(entry.priority, 1, 0, 10),
        agent: cleanText(entry.agent, 40) || "main",
        ...(cleanText(entry.skill, 80) ? { skill: cleanText(entry.skill, 80) } : {}),
        dependencies: Array.isArray(entry.dependencies)
          ? entry.dependencies
              .map((dep) => cleanText(dep, 80))
              .filter((dep) => taskIds.includes(dep))
              .slice(0, 20)
          : [],
        status: "pending",
        progress: 0,
        ...(permissionOf(entry.permission) ? { permission: permissionOf(entry.permission) } : {}),
        createdAt: boundedNumber(entry.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
        updatedAt: now,
      });
      if (tasks.length >= MAX_BUNDLE_ITEMS) break;
    }
    return {
      id: idValue,
      goal,
      status: "planned",
      tasks,
      createdAt: boundedNumber(raw.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: now,
      context: {},
    };
  }

  private importSkill(raw: unknown, now: number): SkillDefinition | null {
    if (!isRecord(raw)) return null;
    const id = cleanText(raw.id, 80);
    if (!ID_RE.test(id)) return null;
    const name = cleanText(raw.name, 160);
    if (!name || !Array.isArray(raw.steps) || raw.steps.length === 0) return null;
    const steps: SkillStep[] = [];
    for (const entry of raw.steps.slice(0, 40)) {
      if (!isRecord(entry)) return null;
      const stepId = cleanText(entry.id, 80);
      if (!ID_RE.test(stepId)) return null;
      if (entry.kind === "template") {
        steps.push({ id: stepId, kind: "template", template: cleanText(entry.template, 4000) });
      } else if (entry.kind === "json") {
        const fields: Record<string, string> = {};
        if (isRecord(entry.fields)) {
          for (const [key, value] of Object.entries(entry.fields).slice(0, 20)) {
            if (FIELD_RE.test(key) && typeof value === "string") fields[key] = value.slice(0, 500);
          }
        }
        steps.push({ id: stepId, kind: "json", fields });
      } else if (entry.kind === "assert") {
        const check = entry.check;
        if (check !== "notEmpty" && check !== "contains" && check !== "equals" && check !== "minLength") return null;
        steps.push({
          id: stepId,
          kind: "assert",
          value: cleanText(entry.value, 1000),
          check,
          ...(cleanText(entry.expected, 500) ? { expected: cleanText(entry.expected, 500) } : {}),
          ...(cleanText(entry.errorMessage, 300) ? { errorMessage: cleanText(entry.errorMessage, 300) } : {}),
        });
      } else return null;
    }
    if (steps.length === 0) return null;

    const parameters: SkillParameter[] = [];
    if (Array.isArray(raw.parameters)) {
      for (const entry of raw.parameters.slice(0, 12)) {
        if (!isRecord(entry)) continue;
        const pName = cleanText(entry.name, 40);
        if (!FIELD_RE.test(pName)) continue;
        const type = entry.type;
        if (type !== "string" && type !== "number" && type !== "boolean") continue;
        parameters.push({
          name: pName,
          type,
          required: entry.required === true,
          ...(typeof entry.default === "string" || typeof entry.default === "number" || typeof entry.default === "boolean"
            ? { default: entry.default }
            : {}),
          ...(cleanText(entry.description, 200) ? { description: cleanText(entry.description, 200) } : {}),
          ...(entry.maxLength !== undefined ? { maxLength: boundedNumber(entry.maxLength, 1000, 1, 1000) } : {}),
        });
      }
    }

    const tests: SkillTestCase[] = [];
    if (Array.isArray(raw.tests)) {
      for (const entry of raw.tests.slice(0, 8)) {
        if (!isRecord(entry)) continue;
        const input: Record<string, string | number | boolean> = {};
        if (isRecord(entry.input)) {
          for (const [key, value] of Object.entries(entry.input).slice(0, 12)) {
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") input[key] = value;
          }
        }
        const expect = isRecord(entry.expect) ? entry.expect : {};
        tests.push({
          name: cleanText(entry.name, 120) || "cas importé",
          input,
          expect: {
            ...(cleanText(expect.contains, 300) ? { contains: cleanText(expect.contains, 300) } : {}),
            ...(cleanText(expect.equals, 300) ? { equals: cleanText(expect.equals, 300) } : {}),
            ...(expect.notEmpty === true ? { notEmpty: true } : {}),
          },
        });
      }
    }

    const permissions = Array.isArray(raw.permissions)
      ? raw.permissions.map(permissionOf).filter((value): value is CoreSensitiveAction => !!value)
      : [];
    const limits = isRecord(raw.limits) ? raw.limits : {};
    return {
      id,
      name,
      description: cleanText(raw.description, 1000),
      version: boundedNumber(raw.version, 1, 1, 10000),
      category: cleanText(raw.category, 60) || "imported",
      tags: Array.isArray(raw.tags)
        ? raw.tags.slice(0, 10).map((tag) => cleanText(tag, 40)).filter(Boolean)
        : [],
      parameters,
      steps,
      expectedResult: cleanText(raw.expectedResult, 1000),
      permissions,
      limits: {
        maxSteps: boundedNumber(limits.maxSteps, steps.length, 1, 40),
        maxOutputChars: boundedNumber(limits.maxOutputChars, 4000, 100, 4000),
      },
      status: "draft",
      enabled: false,
      tests,
      history: [],
      executionCount: 0,
      createdAt: boundedNumber(raw.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: now,
    };
  }

  private importTool(raw: unknown, knownNames: Set<string>, now: number): ToolDefinition | null {
    if (!isRecord(raw)) return null;
    if (raw.builtin !== false || raw.kind !== "template") return null;
    const name = cleanText(raw.name, 64);
    if (!NAME_RE.test(name) || knownNames.has(name)) return null;
    const template = typeof raw.template === "string" ? raw.template.slice(0, 4000) : "";
    if (!template.trim()) return null;
    const fields: ToolField[] = [];
    if (Array.isArray(raw.fields)) {
      for (const entry of raw.fields.slice(0, 12)) {
        if (!isRecord(entry)) return null;
        const fieldName = cleanText(entry.name, 40);
        if (!FIELD_RE.test(fieldName)) return null;
        const type = entry.type;
        if (type !== "string" && type !== "number" && type !== "boolean") return null;
        fields.push({
          name: fieldName,
          type,
          required: entry.required === true,
          ...(entry.maxLength !== undefined ? { maxLength: boundedNumber(entry.maxLength, 1000, 1, 4000) } : {}),
          ...(Array.isArray(entry.enum)
            ? { enum: entry.enum.slice(0, 20).map((option) => cleanText(option, 100)).filter(Boolean) }
            : {}),
        });
      }
    }
    return {
      name,
      description: cleanText(raw.description, 500) || "Template importé (à vérifier localement).",
      kind: "template",
      fields,
      ...(permissionOf(raw.permission) ? { permission: permissionOf(raw.permission) } : {}),
      enabled: false,
      builtin: false,
      template,
      maxOutputChars: boundedNumber(raw.maxOutputChars, 2000, 100, 4000),
      createdAt: boundedNumber(raw.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: now,
    };
  }

  private importTask(raw: unknown, missionIds: Set<string>, now: number): ScheduledTask | null {
    if (!isRecord(raw)) return null;
    const id = cleanText(raw.id, 80);
    if (!ID_RE.test(id)) return null;
    const name = cleanText(raw.name, 200);
    if (!name) return null;
    const kindValue = raw.kind;
    if (kindValue !== "once" && kindValue !== "interval" && kindValue !== "daily" && kindValue !== "weekly") return null;
    const timezone = cleanText(raw.timezone, 64) || "Europe/Paris";
    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: timezone });
    } catch {
      return null;
    }
    const action = isRecord(raw.action) ? raw.action : null;
    if (!action) return null;
    const type = action.type;
    if (type !== "reminder" && type !== "mission" && type !== "agent_dispatch") return null;
    const text = cleanText(action.text, 500);
    if (!text) return null;
    const missionId = cleanText(action.missionId, 80);
    if (missionId && !missionIds.has(missionId)) return null;

    return {
      id,
      name,
      description: cleanText(raw.description, 500),
      enabled: false,
      kind: kindValue,
      timezone,
      ...(typeof raw.at === "number" && Number.isFinite(raw.at) ? { at: raw.at } : {}),
      ...(typeof raw.everyMs === "number" && raw.everyMs >= 60_000 ? { everyMs: raw.everyMs } : {}),
      ...(typeof raw.hour === "number" && raw.hour >= 0 && raw.hour <= 23 ? { hour: Math.trunc(raw.hour) } : {}),
      ...(typeof raw.minute === "number" && raw.minute >= 0 && raw.minute <= 59 ? { minute: Math.trunc(raw.minute) } : {}),
      ...(typeof raw.weekday === "number" && raw.weekday >= 0 && raw.weekday <= 6 ? { weekday: Math.trunc(raw.weekday) } : {}),
      action: {
        type,
        text,
        ...(missionId ? { missionId } : {}),
        ...(typeof action.maxConcurrency === "number"
          ? { maxConcurrency: boundedNumber(action.maxConcurrency, 1, 1, 8) }
          : {}),
      },
      ...(raw.maxRuns !== undefined ? { maxRuns: boundedNumber(raw.maxRuns, 1, 1, 1000) } : {}),
      runs: 0,
      createdAt: boundedNumber(raw.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: now,
    };
  }
}
