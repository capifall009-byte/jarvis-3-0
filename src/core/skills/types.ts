/**
 * Types du moteur de Skills dynamiques — JARVIS 4.0 Phase 3.
 *
 * Sécurité : une Skill est un WORKFLOW DÉCLARATIF. Les seules opérations
 * possibles sont : rendu de template, construction JSON et assertions.
 * Aucun champ ne peut contenir de code exécutable (ni eval, ni require, ni
 * accès fichier/réseau). Le validateur rejette explicitement ces motifs.
 */

import type { CoreSensitiveAction } from "../types.ts";

export type SkillStepKind = "template" | "json" | "assert";

export interface SkillStepBase {
  id: string;
  kind: SkillStepKind;
  description?: string;
}

/** Rend un texte en remplaçant {{params.x}}, {{steps.id}} et {{goal}}. */
export interface TemplateStep extends SkillStepBase {
  kind: "template";
  template: string;
}

/** Construit un objet JSON à partir de champs eux-mêmes déclaratifs. */
export interface JsonStep extends SkillStepBase {
  kind: "json";
  fields: Record<string, string>;
}

/** Vérifie une condition simple sur une valeur calculée. */
export interface AssertStep extends SkillStepBase {
  kind: "assert";
  value: string;
  check: "notEmpty" | "contains" | "equals" | "minLength";
  expected?: string;
  errorMessage?: string;
}

export type SkillStep = TemplateStep | JsonStep | AssertStep;

export interface SkillParameter {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
  maxLength?: number;
}

export interface SkillTestCase {
  name: string;
  input: Record<string, string | number | boolean>;
  expect?: {
    contains?: string;
    equals?: string;
    notEmpty?: boolean;
  };
}

export interface SkillTestCaseResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface SkillTestResult {
  skillId: string;
  version: number;
  passed: boolean;
  cases: SkillTestCaseResult[];
  executedAt: number;
}

export type SkillStatus = "draft" | "validated" | "active" | "disabled" | "failed";

export interface SkillVersionRecord {
  version: number;
  updatedAt: number;
  note: string;
  name: string;
  description: string;
  steps: SkillStep[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  category: string;
  tags: string[];
  parameters: SkillParameter[];
  steps: SkillStep[];
  expectedResult: string;
  permissions: CoreSensitiveAction[];
  limits: { maxSteps: number; maxOutputChars: number };
  status: SkillStatus;
  enabled: boolean;
  tests: SkillTestCase[];
  history: SkillVersionRecord[];
  executionCount: number;
  lastExecutedAt?: number;
  /** Dernier test intégré : une Skill ne peut être activée qu'après un test réussi. */
  lastTestedAt?: number;
  lastTestPassed?: boolean;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export type SkillExecutionStatus = "success" | "failure" | "blocked";

export interface SkillExecution {
  id: string;
  skillId: string;
  skillVersion: number;
  actor: string;
  input: Record<string, unknown>;
  output?: string;
  status: SkillExecutionStatus;
  error?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  stepCount: number;
}

export interface SkillMatch {
  skillId: string;
  name: string;
  version: number;
  score: number;
  reason: string;
}

export interface NewSkillInput {
  /** Identifiant optionnel ; généré depuis le nom si absent. */
  id?: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  parameters?: SkillParameter[];
  steps: SkillStep[];
  expectedResult?: string;
  permissions?: CoreSensitiveAction[];
  limits?: Partial<SkillDefinition["limits"]>;
  tests?: SkillTestCase[];
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warn";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
