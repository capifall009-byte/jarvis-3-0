/**
 * Types du Tool Registry — JARVIS 4.0 Phase 6.
 *
 * Un outil est une DESCRIPTION DECLARATIVE avec champs typés et limites.
 * Aucun champ ne peut contenir du code : le registre ne fait que valider,
 * vérifier les permissions et appeler un gestionnaire interne enregistré.
 */

import type { CoreSensitiveAction } from "../types.ts";

export type ToolKind =
  | "core_query"
  | "core_action"
  | "memory_query"
  | "scheduler_query"
  | "agent_query"
  | "template";

export type ToolFieldType = "string" | "number" | "boolean";

export interface ToolField {
  name: string;
  type: ToolFieldType;
  required?: boolean;
  maxLength?: number;
  enum?: readonly string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  kind: ToolKind;
  fields: readonly ToolField[];
  permission?: CoreSensitiveAction;
  enabled: boolean;
  builtin: boolean;
  /** Uniquement pour `template` : remplace {{input.champ}} sans évaluer de code. */
  template?: string;
  maxOutputChars: number;
  createdAt: number;
  updatedAt: number;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  outcome: "success" | "failure" | "blocked";
  actor: string;
  missionId?: string;
  error?: string;
  ts: number;
}

export interface ToolResult {
  ok: boolean;
  output?: string;
  error?: string;
  requiresValidation?: boolean;
  permission?: CoreSensitiveAction;
}

export interface ToolState {
  tools: ToolDefinition[];
  executions: ToolExecution[];
}

export interface ToolContext {
  actor?: string;
  goal?: string;
  missionId?: string;
  agent?: string;
}

export type ToolInvoker = (
  tool: ToolDefinition,
  input: Record<string, unknown>,
  context: ToolContext
) => ToolResult | Promise<ToolResult>;

export interface NewToolDefinition {
  name: string;
  description: string;
  kind: ToolKind;
  fields: readonly ToolField[];
  permission?: CoreSensitiveAction;
  template?: string;
  maxOutputChars?: number;
  enabled?: boolean;
}

export function emptyToolState(): ToolState {
  return { tools: [], executions: [] };
}

export function normalizeToolState(value: unknown): ToolState {
  const base = emptyToolState();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<ToolState>;
  return {
    tools: Array.isArray(raw.tools) ? raw.tools : base.tools,
    executions: Array.isArray(raw.executions) ? raw.executions : base.executions,
  };
}
