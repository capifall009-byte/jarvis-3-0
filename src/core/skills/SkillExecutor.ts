/**
 * Exécuteur de Skills — JARVIS 4.0 Phase 3.
 *
 * Exécution DÉTERMINISTE de workflows déclaratifs (template / json / assert).
 * Aucune évaluation de code, aucun accès fichier, réseau ou système.
 * Contrôles obligatoires : validation complète, entrées typées, permissions
 * explicites (fail closed) et STOP GLOBAL vérifié avant CHAQUE étape.
 */

import type { AuditLog } from "../AuditLog.ts";
import type { PermissionManager } from "../PermissionManager.ts";
import type { SkillDefinition, SkillExecution, SkillParameter } from "./types.ts";
import { findUnsafePattern, formatIssues, validateSkillDefinition } from "./SkillValidator.ts";
import type { SkillStorage } from "./SkillStorage.ts";

const REF_RE = /\{\{([^{}]+)\}\}/g;

export interface SkillExecutorDeps {
  audit: AuditLog;
  permissions: PermissionManager;
  storage: SkillStorage;
  now?: () => number;
  id?: (prefix: string) => string;
  /** STOP GLOBAL prioritaire : fourni par JarvisCore. */
  isStopped?: () => boolean;
}

export interface SkillExecuteOptions {
  actor?: string;
  goal?: string;
  missionId?: string;
  /** "test" = vérification logique sans effet ni historique ; "run" = exécution réelle. */
  mode?: "run" | "test";
}

export interface SkillExecutionResult {
  execution: SkillExecution;
  output?: string;
}

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class SkillExecutor {
  private readonly audit: AuditLog;
  private readonly permissions: PermissionManager;
  private readonly storage: SkillStorage;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;
  private readonly isStopped: () => boolean;

  constructor(deps: SkillExecutorDeps) {
    this.audit = deps.audit;
    this.permissions = deps.permissions;
    this.storage = deps.storage;
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
    this.isStopped = deps.isStopped ?? (() => false);
  }

  execute(skill: SkillDefinition, input: Record<string, unknown> = {}, options: SkillExecuteOptions = {}): SkillExecutionResult {
    const mode = options.mode ?? "run";
    const actor = options.actor || "user";
    const startedAt = this.now();
    const execution: SkillExecution = {
      id: this.id("ske"),
      skillId: skill.id,
      skillVersion: skill.version,
      actor,
      input: { ...input },
      status: "failure",
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      stepCount: 0,
    };

    const finish = (status: SkillExecution["status"], error?: string, output?: string): SkillExecutionResult => {
      execution.status = status;
      execution.finishedAt = this.now();
      execution.durationMs = Math.max(0, execution.finishedAt - startedAt);
      if (error) execution.error = error;
      if (output !== undefined) execution.output = output;

      const action =
        status === "success" ? "skill_execution_success" :
        status === "blocked" ? "skill_execution_blocked" : "skill_execution_failed";
      this.audit.record({
        actor: options.missionId ? `mission:${options.missionId}` : actor,
        action,
        target: skill.id,
        outcome: status === "success" ? "success" : status === "blocked" ? "denied" : "failure",
        severity: status === "success" ? "info" : status === "blocked" ? "warn" : "error",
        detail: `${mode} v${skill.version} — ${error ?? `${execution.stepCount} étape(s)`}`,
      });

      if (mode === "run") {
        this.storage.recordExecution(execution);
        const current = this.storage.get(skill.id);
        if (current) {
          current.executionCount += 1;
          current.lastExecutedAt = execution.finishedAt;
          if (error) current.lastError = error;
          else delete current.lastError;
          this.storage.put(current);
        }
      }
      return { execution, ...(output !== undefined ? { output } : {}) };
    };

    // 1. STOP GLOBAL est toujours prioritaire, même avant toute validation.
    if (this.isStopped()) {
      return finish("blocked", "STOP GLOBAL actif : aucune compétence ne peut s'exécuter. Utiliser reprise explicite.");
    }

    // 2. Re-validation de défense en profondeur (état persisté potentially édité).
    const validation = validateSkillDefinition(skill);
    if (!validation.valid) {
      return finish("failure", `Définition invalide : ${formatIssues(validation.issues)}`);
    }

    // 3. Entrées strictement typées et bornées.
    let params: Record<string, string | number | boolean>;
    try {
      params = this.resolveParams(skill.parameters, input);
    } catch (err) {
      return finish("failure", (err as Error).message);
    }

    // 4. Permissions explicites — fail closed. Les tests logiques n'en ont pas besoin
    //    (workflow pur, sans effet de bord) ; l'audit le précise.
    if (mode === "run") {
      for (const action of skill.permissions) {
        try {
          const decision = this.permissions.check({
            action,
            title: `Compétence « ${skill.name} »`,
            target: skill.id,
            ...(options.missionId ? { missionId: options.missionId } : {}),
          });
          if (!decision.allowed) {
            return finish("blocked", `Permission « ${action} » non accordée (${decision.decision}).`);
          }
        } catch (err) {
          return finish("blocked", `Contrôle de permission impossible pour « ${action} » : ${(err as Error).message}`);
        }
      }
    }

    // 5. Exécution déterministe des étapes.
    const stepOutputs: Record<string, string> = {};
    const goal = typeof options.goal === "string" ? options.goal : "";
    let lastOutput = "";

    for (const step of skill.steps) {
      if (this.isStopped()) {
        return finish("blocked", "STOP GLOBAL déclenché pendant l'exécution de la compétence.");
      }
      execution.stepCount += 1;

      try {
        if (step.kind === "template") {
          const rendered = this.render(step.template, params, stepOutputs, goal);
          const clipped = this.clipOutput(rendered, skill, step.id);
          stepOutputs[step.id] = clipped;
          lastOutput = clipped;
        } else if (step.kind === "json") {
          const obj: Record<string, string> = {};
          for (const [key, value] of Object.entries(step.fields)) {
            obj[key] = this.clipOutput(this.render(value, params, stepOutputs, goal), skill, step.id);
          }
          const serialized = JSON.stringify(obj);
          if (serialized.length > skill.limits.maxOutputChars) {
            return finish("failure", `Sortie JSON trop volumineuse (${serialized.length} > ${skill.limits.maxOutputChars}).`);
          }
          stepOutputs[step.id] = serialized;
          lastOutput = serialized;
        } else if (step.kind === "assert") {
          const value = this.render(step.value, params, stepOutputs, goal);
          const expected = step.expected ? this.render(step.expected, params, stepOutputs, goal) : "";
          const passed = this.checkAssertion(step.check, value, expected);
          if (!passed) {
            const detail = step.errorMessage || `Assertion échouée (${step.check}) sur « ${value.slice(0, 80)} ».`;
            return finish("failure", detail, lastOutput);
          }
          stepOutputs[step.id] = "true";
          lastOutput = "true";
        } else {
          return finish("failure", "Type d'étape non pris en charge.");
        }
      } catch (err) {
        return finish("failure", (err as Error).message, lastOutput || undefined);
      }
    }

    return finish("success", undefined, lastOutput);
  }

  private resolveParams(
    definitions: SkillParameter[],
    input: Record<string, unknown>
  ): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {};
    for (const def of definitions) {
      if (def.default !== undefined) params[def.name] = def.default;
    }
    for (const [key, value] of Object.entries(input)) {
      const def = definitions.find((p) => p.name === key);
      if (!def) throw new Error(`Paramètre inconnu : ${key}.`);
      if (typeof value !== def.type) {
        throw new Error(`Paramètre « ${key} » : type ${def.type} attendu, ${typeof value} reçu.`);
      }
      if (def.maxLength && typeof value === "string" && value.length > def.maxLength) {
        throw new Error(`Paramètre « ${key} » trop long (${def.maxLength} caractères maximum).`);
      }
      params[key] = value as string | number | boolean;
    }
    for (const def of definitions) {
      if (def.required && params[def.name] === undefined) {
        throw new Error(`Paramètre requis manquant : ${def.name}.`);
      }
    }
    return params;
  }

  private render(
    text: string,
    params: Record<string, string | number | boolean>,
    stepOutputs: Record<string, string>,
    goal: string
  ): string {
    return text.replace(REF_RE, (whole, rawRef: string) => {
      const ref = rawRef.trim();
      if (ref === "goal") return goal;
      if (ref.startsWith("params.")) {
        const key = ref.slice("params.".length);
        if (!Object.prototype.hasOwnProperty.call(params, key)) {
          throw new Error(`Valeur de paramètre indisponible : {{${ref}}}.`);
        }
        return String(params[key]);
      }
      if (ref.startsWith("steps.")) {
        const stepId = ref.slice("steps.".length);
        if (!Object.prototype.hasOwnProperty.call(stepOutputs, stepId)) {
          throw new Error(`Résultat d'étape indisponible : {{${ref}}}.`);
        }
        return stepOutputs[stepId];
      }
      throw new Error(`Référence non autorisée : {{${ref}}}.`);
    });
  }

  private clipOutput(value: string, skill: SkillDefinition, stepId: string): string {
    const unsafe = findUnsafePattern(value);
    if (unsafe) {
      throw new Error(`Une valeur calculée contient un motif interdit (${unsafe}).`);
    }
    if (value.length <= skill.limits.maxOutputChars) return value;
    this.audit.record({
      actor: "core",
      action: "skill_output_truncated",
      target: `${skill.id}:${stepId}`,
      outcome: "info",
      severity: "warn",
      detail: `Sortie limitée à ${skill.limits.maxOutputChars} caractères.`,
    });
    return `${value.slice(0, skill.limits.maxOutputChars)}…[tronqué]`;
  }

  private checkAssertion(check: "notEmpty" | "contains" | "equals" | "minLength", value: string, expected: string): boolean {
    switch (check) {
      case "notEmpty": return value.trim().length > 0;
      case "contains": return value.includes(expected);
      case "equals": return value === expected;
      case "minLength": return value.length >= Number(expected);
      default: return false;
    }
  }
}
