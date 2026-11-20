/**
 * Types du système multi-agents — JARVIS 4.0 Phase 4.
 *
 * Les agents sont des RÔLES LOGIQUES orchestrés par le Core, pas huit processus
 * IA indépendants. Leurs traitements sont déterministes, bornés, sans accès
 * réseau/fichier/code arbitraire. Aucune décision n'est prise hors du Core.
 */

import type { CoreSensitiveAction } from "../types.ts";

export type AgentId =
  | "main"
  | "research"
  | "coding"
  | "planning"
  | "analysis"
  | "creative"
  | "verification"
  | "memory";

export const AGENT_IDS: readonly AgentId[] = [
  "main", "research", "coding", "planning", "analysis", "creative", "verification", "memory",
] as const;

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  responsibilities: readonly string[];
  /** Le Main Agent est le seul à pouvoir distribuer et arbitrer. */
  canDelegate: boolean;
  /** Mots-clés de routage déterministe (aucun appel IA caché). */
  keywords: readonly string[];
  maxRetries: number;
}

export type AgentRunStatus =
  | "planned"
  | "running"
  | "paused"
  | "awaiting_validation"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentStepStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "blocked"
  | "needs_validation"
  | "cancelled";

export interface SharedMemoryEntry {
  id: string;
  runId: string;
  key: string;
  value: string;
  author: AgentId;
  provenance: string;
  ts: number;
}

export interface AgentMessage {
  id: string;
  runId: string;
  from: AgentId;
  to: AgentId;
  subject: string;
  body: string;
  ts: number;
}

export interface AgentStep {
  id: string;
  missionTaskId: string;
  name: string;
  description: string;
  assignee: AgentId;
  dependencies: string[];
  status: AgentStepStatus;
  attempts: number;
  maxAttempts: number;
  progress: number;
  sensitive?: CoreSensitiveAction;
  /** Raison d'une demande de validation humaine (Skill bloqué, action sensible…). */
  validationReason?: string;
  skillId?: string;
  output?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface AgentRunMetrics {
  maxConcurrentObserved: number;
  retries: number;
  verifications: number;
  skillCalls: number;
  toolCalls: number;
  messages: number;
}

export interface AgentRun {
  id: string;
  missionId: string;
  goal: string;
  status: AgentRunStatus;
  steps: AgentStep[];
  messages: AgentMessage[];
  memory: SharedMemoryEntry[];
  config: { maxConcurrency: number; maxRetries: number };
  metrics: AgentRunMetrics;
  createdAt: number;
  updatedAt: number;
  summary?: string;
  error?: string;
}

export interface AgentRunOptions {
  maxConcurrency?: number;
  maxRetries?: number;
  /** Étapes supplémentaires fournies explicitement (aucune génération de code). */
  steps?: Array<{
    name: string;
    description?: string;
    assignee?: AgentId;
    sensitive?: CoreSensitiveAction;
    skillId?: string;
    dependsOn?: number[];
  }>;
}

export interface AgentStepResult {
  ok: boolean;
  output?: string;
  error?: string;
  /** Demande de validation humaine avant poursuite. */
  needsValidation?: boolean;
}

/** Ponts injectés par JarvisCore : les agents n'ont aucun accès direct. */
export interface AgentSkillInvoker {
  (
    skillId: string,
    input: Record<string, unknown>,
    context: { goal: string; missionId: string; agent: AgentId }
  ): { status: "success" | "failure" | "blocked"; output?: string; error?: string };
}

export interface AgentToolInvoker {
  (
    toolName: string,
    input: Record<string, unknown>,
    context: { missionId: string; agent: AgentId }
  ):
    | { ok: boolean; output?: string; error?: string }
    | Promise<{ ok: boolean; output?: string; error?: string }>;
}
