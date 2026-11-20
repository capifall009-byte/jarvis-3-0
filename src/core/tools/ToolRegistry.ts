/**
 * Registre d'outils — JARVIS 4.0 Phase 6.
 *
 * Gestionnaire déterministe et borné : validation stricte des entrées,
 * permissions explicites (fail closed), STOP GLOBAL prioritaire, sortie
 * tronquée, historique audité. Aucun eval, aucun require, aucun accès réseau
 * ou fichier. Les gestionnaires sont injectés par le Core, jamais par un agent.
 */

import type { AuditLog } from "../AuditLog.ts";
import type { PermissionManager } from "../PermissionManager.ts";
import { SENSITIVE_ACTIONS } from "../types.ts";
import type { CoreSensitiveAction } from "../types.ts";
import type {
  NewToolDefinition,
  ToolDefinition,
  ToolExecution,
  ToolField,
  ToolInvoker,
  ToolResult,
  ToolState,
  ToolContext,
} from "./types.ts";

const NAME_RE = /^[a-z][a-z0-9_.]{2,63}$/;
const MAX_TOOLS = 40;
const MAX_EXECUTIONS = 200;
const MAX_FIELDS = 12;
const MAX_OUTPUT = 4000;

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface ToolRegistryDeps {
  state: ToolState;
  audit: AuditLog;
  permissions: PermissionManager;
  invokers: Record<string, ToolInvoker>;
  now?: () => number;
  id?: (prefix: string) => string;
  isStopped?: () => boolean;
}

export class ToolRegistry {
  private readonly state: ToolState;
  private readonly audit: AuditLog;
  private readonly permissions: PermissionManager;
  private readonly invokers: Record<string, ToolInvoker>;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly isStopped: () => boolean;

  constructor(deps: ToolRegistryDeps) {
    this.state = deps.state;
    this.audit = deps.audit;
    this.permissions = deps.permissions;
    this.invokers = deps.invokers;
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
    this.isStopped = deps.isStopped ?? (() => false);
  }

  list(): ToolDefinition[] {
    return this.state.tools.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): ToolDefinition | undefined {
    return this.state.tools.find((tool) => tool.name === name);
  }

  listExecutions(limit = 80): ToolExecution[] {
    return this.state.executions.slice(-Math.max(1, Math.min(limit, MAX_EXECUTIONS))).reverse();
  }

  /** Outils utilisateur : uniquement des templates déclaratifs. */
  register(input: NewToolDefinition): ToolDefinition {
    if (this.state.tools.length >= MAX_TOOLS) throw new Error(`Limite de ${MAX_TOOLS} outils atteinte.`);
    if (input.kind !== "template") throw new Error("Seuls les outils « template » peuvent être créés.");
    if (this.get(input.name)) throw new Error(`Outil déjà enregistré : ${input.name}`);
    const definition = this.build(input, false);
    if (!definition.template || definition.template.length > 2000) throw new Error("Template requis (2000 caractères max).");
    this.state.tools.push(definition);
    this.audit.record({ actor: "user", action: "tool_registered", target: definition.name, outcome: "success" });
    return definition;
  }

  registerBuiltin(input: NewToolDefinition): ToolDefinition {
    if (this.get(input.name)) return this.get(input.name)!;
    const definition = this.build(input, true);
    this.state.tools.push(definition);
    return definition;
  }

  setEnabled(name: string, enabled: boolean): ToolDefinition {
    const tool = this.require(name);
    tool.enabled = enabled;
    tool.updatedAt = this.now();
    this.audit.record({
      actor: "user", action: "tool_toggled", target: name, outcome: "info",
      detail: enabled ? "activé" : "désactivé",
    });
    return tool;
  }

  async execute(name: string, rawInput: Record<string, unknown>, context: ToolContext = {}): Promise<ToolResult> {
    const tool = this.require(name);
    const startedAt = this.now();
    const record = (outcome: ToolExecution["outcome"], output: string, error?: string): ToolResult => {
      const execution: ToolExecution = {
        id: this.id("tex"), toolName: name, input: sanitizeInput(rawInput), output: output.slice(0, tool.maxOutputChars),
        outcome, actor: context.actor ?? context.agent ?? "user", ts: startedAt,
        ...(context.missionId ? { missionId: context.missionId } : {}),
        ...(error ? { error } : {}),
      };
      if (this.state.executions.length >= MAX_EXECUTIONS) this.state.executions.splice(0, 1);
      this.state.executions.push(execution);
      this.audit.record({
        actor: execution.actor, action: "tool_executed", target: name,
        outcome: outcome === "success" ? "success" : outcome === "blocked" ? "denied" : "failure",
        severity: outcome === "blocked" ? "warn" : undefined,
        detail: error ?? `${output.slice(0, 120)} (${Date.now() - startedAt} ms)`,
      });
      return {
        ok: outcome === "success", output: execution.output,
        ...(error ? { error } : {}),
        ...(outcome === "blocked" ? { requiresValidation: true } : {}),
      };
    };

    if (this.isStopped()) return record("blocked", "", "STOP GLOBAL actif : outil indisponible.");
    if (!tool.enabled) return record("blocked", "", "Outil désactivé.");

    let input: Record<string, unknown>;
    try {
      input = this.validateInput(tool, rawInput);
    } catch (err) {
      return record("failure", "", (err as Error).message);
    }

    if (tool.permission) {
      const decision = this.permissions.check({
        action: tool.permission,
        title: `Outil « ${tool.name} »`,
        target: tool.name,
        missionId: context.missionId,
      });
      if (!decision.allowed) {
        return record("blocked", "", `Permission ${tool.permission} : ${decision.decision}.`);
      }
    }

    const invoker = this.invokers[tool.kind];
    if (!invoker) return record("failure", "", `Aucun gestionnaire pour ${tool.kind}.`);
    try {
      const result = await invoker(tool, input, context);
      if (!result.ok) {
        return record(result.requiresValidation ? "blocked" : "failure", result.output ?? "", result.error ?? "Échec de l'outil.");
      }
      return record("success", result.output ?? "");
    } catch (err) {
      return record("failure", "", (err as Error)?.message ?? "Erreur inconnue");
    }
  }

  /** Pont utilisé par les agents : aucun accès direct au registre. */
  async executeForAgent(
    name: string,
    input: Record<string, unknown>,
    context: { missionId: string; agent: string }
  ): Promise<{ ok: boolean; output?: string; error?: string }> {
    const result = await this.execute(name, input, {
      actor: `agent:${context.agent}`,
      agent: context.agent,
      missionId: context.missionId,
    });
    return { ok: result.ok, ...(result.output ? { output: result.output } : {}), ...(result.error ? { error: result.error } : {}) };
  }

  private build(input: NewToolDefinition, builtin: boolean): ToolDefinition {
    const name = typeof input.name === "string" ? input.name.trim().toLowerCase() : "";
    if (!NAME_RE.test(name)) throw new Error(`Nom d'outil invalide : ${name}`);
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 300) : "";
    if (description.length < 5) throw new Error("Description requise (5 caractères min).");
    if (!["core_query", "core_action", "memory_query", "scheduler_query", "agent_query", "template"].includes(input.kind)) {
      throw new Error("Type d'outil inconnu.");
    }
    const fields = this.validateFields(input.fields);
    const permission = input.permission
      ? (SENSITIVE_ACTIONS as readonly string[]).includes(input.permission) ? input.permission : null
      : null;
    if (input.permission && !permission) throw new Error("Permission inconnue.");
    const ts = this.now();
    return {
      name, description, kind: input.kind, fields,
      ...(permission ? { permission } : {}),
      ...(input.template ? { template: input.template.slice(0, 2000) } : {}),
      enabled: builtin ? true : input.enabled === true,
      builtin,
      maxOutputChars: Math.max(100, Math.min(MAX_OUTPUT, Math.floor(input.maxOutputChars ?? 2000))),
      createdAt: ts, updatedAt: ts,
    };
  }

  private validateFields(fields: readonly ToolField[]): ToolField[] {
    if (!Array.isArray(fields) || fields.length > MAX_FIELDS) throw new Error(`12 champs maximum.`);
    return fields.map((field) => {
      if (!field || !/^[a-z][a-z0-9_]{1,39}$/.test(field.name)) throw new Error("Nom de champ invalide.");
      if (!["string", "number", "boolean"].includes(field.type)) throw new Error("Type de champ invalide.");
      return {
        name: field.name, type: field.type,
        ...(field.required ? { required: true } : {}),
        ...(field.maxLength ? { maxLength: Math.max(1, Math.min(1000, Math.floor(field.maxLength))) } : {}),
        ...(field.enum && field.enum.length > 0 ? { enum: field.enum.slice(0, 20).map(String) } : {}),
      };
    });
  }

  private validateInput(tool: ToolDefinition, input: Record<string, unknown>): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Entrée invalide.");
    const keys = Object.keys(input);
    if (keys.length > tool.fields.length + 2) throw new Error("Trop de champs fournis.");
    const allowed = new Set(tool.fields.map((field) => field.name));
    for (const key of keys) if (!allowed.has(key)) throw new Error(`Champ inconnu : ${key}`);

    const result: Record<string, unknown> = {};
    for (const field of tool.fields) {
      const value = input[field.name];
      if (value === undefined || value === null || value === "") {
        if (field.required) throw new Error(`Champ requis : ${field.name}`);
        continue;
      }
      if (field.type === "string") {
        if (typeof value !== "string") throw new Error(`${field.name} doit être une chaîne.`);
        const limit = field.maxLength ?? 500;
        if (value.length > limit) throw new Error(`${field.name} dépasse ${limit} caractères.`);
        if (field.enum && !field.enum.includes(value)) throw new Error(`${field.name} : valeur non autorisée.`);
        result[field.name] = value;
      } else if (field.type === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field.name} doit être un nombre.`);
        result[field.name] = value;
      } else {
        if (typeof value !== "boolean") throw new Error(`${field.name} doit être un booléen.`);
        result[field.name] = value;
      }
    }
    return result;
  }

  private require(name: string): ToolDefinition {
    const tool = this.get(name);
    if (!tool) throw new Error(`Outil introuvable : ${name}`);
    return tool;
  }
}

function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (typeof value === "string") out[key] = value.slice(0, 300);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}
