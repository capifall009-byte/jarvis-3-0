/**
 * Types de la préparation multi-appareils — JARVIS 4.0 Phase 7.
 *
 * ADDITIF et STRICTEMENT LOCAL : identité opaque de cet appareil, checklist de
 * préparation, export/import manuel de données portables. Aucun compte, aucun
 * service distant, aucune authentification, aucune synchronisation automatique.
 * `multiDeviceSync` reste FAUX : cette phase ne prépare que la portabilité.
 */

import type { ScheduledTask } from "../scheduler/types.ts";
import type { SkillDefinition } from "../skills/types.ts";
import type { ToolDefinition } from "../tools/types.ts";
import type { Mission } from "../types.ts";

export const DEVICE_BUNDLE_SCHEMA = "jarvis-device-bundle-v1" as const;
export const MAX_BUNDLE_CHARS = 1_000_000;
export const MAX_BUNDLE_ITEMS = 200;
export const MAX_DEVICE_LABEL = 60;
export const MAX_DEVICE_HISTORY = 10;

export type DeviceReadiness = "not_ready" | "needs_review" | "ready";

/** Identifiant opaque généré localement une seule fois, jamais un compte. */
export interface DeviceIdentity {
  id: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface DeviceExportRecord {
  id: string;
  at: number;
  bytes: number;
  checksum: string;
}

export interface DeviceImportTotals {
  accepted: number;
  skipped: number;
}

export interface DeviceBundleManifest {
  schema: typeof DEVICE_BUNDLE_SCHEMA;
  version: 1;
  createdAt: number;
  sourceDevice: { id: string; label: string };
  counts: { missions: number; skills: number; tools: number; tasks: number };
  bytes: number;
  /** Empreinte NON cryptographique de contrôle d'intégrité (détection d'altération accidentelle). */
  checksum: string;
  warnings: string[];
}

/** Sous-ensemble portable : aucun secret, aucune approbation, aucun historique d'exécution. */
export interface DevicePortableState {
  missions: Mission[];
  skills: SkillDefinition[];
  tools: ToolDefinition[];
  tasks: ScheduledTask[];
}

export interface DeviceBundle {
  manifest: DeviceBundleManifest;
  state: DevicePortableState;
}

export interface DeviceExportResult {
  text: string;
  manifest: DeviceBundleManifest;
  bytes: number;
}

export interface DevicePreviewResult {
  stagedId: string;
  manifest: DeviceBundleManifest;
}

export interface DeviceImportRecord {
  id: string;
  at: number;
  actor: string;
  sourceDeviceId: string;
  checksum: string;
  manifest: DeviceBundleManifest;
  totals: Record<"missions" | "skills" | "tools" | "tasks", DeviceImportTotals>;
}

export interface DeviceState {
  device: DeviceIdentity;
  readiness: DeviceReadiness;
  checks: DeviceReadinessCheck[];
  checkedAt: number;
  exports: number;
  lastExportAt: number;
  exportHistory: DeviceExportRecord[];
  imports: DeviceImportRecord[];
}

export interface DeviceStatusView {
  id: string;
  label: string;
  createdAt: number;
  readiness: DeviceReadiness;
  checks: DeviceReadinessCheck[];
  checkedAt: number;
  exports: number;
  lastExportAt: number;
  importCount: number;
  lastImportAt: number;
  sharedAcrossDevices: boolean;
  multiDeviceSync: boolean;
}

export function emptyDeviceState(): DeviceState {
  return {
    device: { id: "", label: "Appareil local", createdAt: 0, updatedAt: 0 },
    readiness: "not_ready",
    checks: [],
    checkedAt: 0,
    exports: 0,
    lastExportAt: 0,
    exportHistory: [],
    imports: [],
  };
}

/** Complète un état historique sans toucher aux autres données du Core. */
export function normalizeDeviceState(value: unknown): DeviceState {
  const base = emptyDeviceState();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<DeviceState>;
  const device = raw.device;
  return {
    device:
      device && typeof device === "object"
        ? {
            id: typeof device.id === "string" ? device.id.slice(0, 120) : "",
            label: typeof device.label === "string" && device.label.trim()
              ? device.label.trim().slice(0, MAX_DEVICE_LABEL)
              : base.device.label,
            createdAt: typeof device.createdAt === "number" ? device.createdAt : 0,
            updatedAt: typeof device.updatedAt === "number" ? device.updatedAt : 0,
          }
        : base.device,
    readiness:
      raw.readiness === "ready" || raw.readiness === "needs_review" || raw.readiness === "not_ready"
        ? raw.readiness
        : base.readiness,
    checks: Array.isArray(raw.checks) ? raw.checks.slice(0, 20) : base.checks,
    checkedAt: typeof raw.checkedAt === "number" ? raw.checkedAt : 0,
    exports: typeof raw.exports === "number" && Number.isFinite(raw.exports) && raw.exports >= 0 ? raw.exports : 0,
    lastExportAt: typeof raw.lastExportAt === "number" ? raw.lastExportAt : 0,
    exportHistory: Array.isArray(raw.exportHistory) ? raw.exportHistory.slice(0, MAX_DEVICE_HISTORY) : [],
    imports: Array.isArray(raw.imports) ? raw.imports.slice(0, MAX_DEVICE_HISTORY) : [],
  };
}
