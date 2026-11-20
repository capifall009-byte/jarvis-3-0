/**
 * Validateur strict des Skills — JARVIS 4.0 Phase 3.
 *
 * Une Skill est un WORKFLOW DÉCLARATIF : template, json, assert. Ce validateur
 * est la porte de sécurité. Il refuse :
 *  - tout motif de code exécutable (eval, Function, require, process, fs, …) ;
 *  - les étapes inconnues ou les références non déclarées / antérieures ;
 *  - les paramètres, permissions et limites incohérents.
 *
 * Pur TypeScript, aucune API DOM/Node : utilisable côté client, serveur et tests.
 */

import { SENSITIVE_ACTIONS } from "../types.ts";
import type { ValidationIssue, ValidationResult } from "./types.ts";

const ID_RE = /^[a-z0-9][a-z0-9_-]{2,63}$/i;
const FIELD_KEY_RE = /^[a-z][a-z0-9_-]{0,39}$/i;
const REF_RE = /\{\{([^{}]+)\}\}/g;

/** Motifs interdits, même à l'intérieur d'un simple texte : défense en profondeur. */
const UNSAFE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\beval\s*\(/i, "appel eval()"],
  [/\bnew\s+Function\s*\(/i, "construction Function()"],
  [/\bFunction\s*\(/i, "appel Function()"],
  [/\brequire\s*\(/i, "appel require()"],
  [/\bimport\s*\(/i, "import dynamique"],
  [/\bprocess\s*\./i, "accès à l'environnement process"],
  [/child_process/i, "accès à child_process"],
  [/\bfs\s*\./i, "accès au système de fichiers"],
  [/\bfetch\s*\(/i, "appel réseau direct"],
  [/XMLHttpRequest/i, "appel réseau direct"],
  [/<script/i, "balise <script>"],
  [/<\/script/i, "balise </script>"],
  [/document\s*\./i, "accès au DOM"],
  [/\bwindow\s*\./i, "accès à la fenêtre navigateur"],
  [/globalThis/i, "accès à l'objet global"],
  [/__proto__|\.prototype\s*=/i, "manipulation de prototype"],
  [/\bconstructor\s*\(/i, "appel à constructor()"],
  [/\bset(?:Timeout|Interval)\s*\(/i, "minuteur arbitraire"],
  [/\b(?:exec|spawn|execSync|spawnSync)\s*\(/i, "exécution de commande"],
  [/\bnode:|file:\/\//i, "accès à une ressource Node/fichier"],
  [/\.\.[\/\\]/, "traversée de chemin"],
];

export const DEFAULT_SKILL_LIMITS = { maxSteps: 40, maxOutputChars: 8000 } as const;
export const MAX_DEFINITION_CHARS = 200_000;

/** Formate des issues pour un message d'erreur lisible (sans données sensibles). */
export function formatIssues(issues: ValidationIssue[], max = 6): string {
  if (issues.length === 0) return "Aucune erreur de validation.";
  const shown = issues.slice(0, max).map((i) => `${i.path} : ${i.message}`);
  const remaining = issues.length - shown.length;
  return `${shown.join(" ; ")}${remaining > 0 ? ` ; … (+${remaining})` : ""}`;
}

/**
 * Valide une définition (déjà construite ou simple brouillon HTTP).
 * Les champs sont `unknown` afin de pouvoir valider avant toute conversion.
 */
export function validateSkillDefinition(subject: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ path, message, severity: "error" });
  const warn = (path: string, message: string) =>
    issues.push({ path, message, severity: "warn" });

  if (!subject || typeof subject !== "object" || Array.isArray(subject)) {
    error("skill", "La définition doit être un objet.");
    return { valid: false, issues };
  }

  const skill = subject as Record<string, unknown>;

  // 1. Sérialisation bornée + détection de motifs interdits partout.
  let serialized = "";
  try {
    serialized = JSON.stringify(subject);
  } catch {
    error("skill", "La définition n'est pas sérialisable.");
    return { valid: false, issues };
  }
  if (serialized.length > MAX_DEFINITION_CHARS) {
    error("skill", `Définition trop volumineuse (${serialized.length} caractères).`);
  }
  scanValue("skill", subject, error, 0);

  // 2. Identité.
  if (skill.id !== undefined && !isIdentifier(skill.id)) {
    error("skill.id", "Identifiant attendu : 3 à 64 caractères [a-z0-9_-], débutant par une lettre ou un chiffre.");
  }
  if (typeof skill.name !== "string" || skill.name.trim().length < 2 || skill.name.length > 80) {
    error("skill.name", "Nom requis : 2 à 80 caractères.");
  }
  if (typeof skill.description !== "string" || skill.description.trim().length < 5 || skill.description.length > 2000) {
    error("skill.description", "Description requise : 5 à 2000 caractères.");
  }
  if (typeof skill.category !== "string" || skill.category.trim().length < 1 || skill.category.length > 40) {
    error("skill.category", "Catégorie requise : 1 à 40 caractères.");
  }
  if (skill.expectedResult !== undefined && typeof skill.expectedResult !== "string" && skill.expectedResult !== null) {
    error("skill.expectedResult", "Le résultat attendu doit être une chaîne.");
  }
  if (typeof skill.expectedResult === "string" && skill.expectedResult.length > 2000) {
    error("skill.expectedResult", "Résultat attendu trop long (2000 caractères maximum).");
  }

  // 3. Tags.
  const tags = skill.tags;
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > 20) {
      error("skill.tags", "Tags : tableau de 20 éléments maximum.");
    } else {
      tags.forEach((tag, index) => {
        if (typeof tag !== "string" || tag.length < 1 || tag.length > 30) {
          error(`skill.tags[${index}]`, "Tag invalide (1 à 30 caractères).");
        }
      });
    }
  }

  // 4. Paramètres.
  const parameters = skill.parameters;
  const paramNames = new Set<string>();
  if (parameters !== undefined) {
    if (!Array.isArray(parameters) || parameters.length > 30) {
      error("skill.parameters", "Paramètres : tableau de 30 éléments maximum.");
    } else {
      parameters.forEach((raw, index) => {
        const path = `skill.parameters[${index}]`;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          error(path, "Paramètre invalide.");
          return;
        }
        const p = raw as Record<string, unknown>;
        if (!isIdentifier(p.name)) {
          error(`${path}.name`, "Nom de paramètre invalide.");
          return;
        }
        const name = String(p.name);
        if (paramNames.has(name)) error(`${path}.name`, `Paramètre dupliqué : ${name}.`);
        paramNames.add(name);
        if (!["string", "number", "boolean"].includes(String(p.type))) {
          error(`${path}.type`, "Type autorisé : string, number ou boolean.");
        }
        if (p.required !== undefined && typeof p.required !== "boolean") {
          error(`${path}.required`, "required doit être un booléen.");
        }
        if (p.description !== undefined && typeof p.description !== "string") {
          error(`${path}.description`, "description doit être une chaîne.");
        }
        if (p.maxLength !== undefined && (!Number.isInteger(p.maxLength) || Number(p.maxLength) < 1 || Number(p.maxLength) > 10_000)) {
          error(`${path}.maxLength`, "maxLength doit être un entier entre 1 et 10000.");
        }
        if (p.default !== undefined && !isPrimitive(p.default)) {
          error(`${path}.default`, "La valeur par défaut doit être une chaîne, un nombre ou un booléen.");
        } else if (p.default !== undefined && !matchesParamType(p.default, String(p.type))) {
          error(`${path}.default`, "La valeur par défaut ne correspond pas au type déclaré.");
        }
        if (p.required === true && p.default !== undefined) {
          warn(`${path}.default`, "Paramètre requis avec valeur par défaut : la valeur par défaut sera ignorée.");
        }
      });
    }
  }

  // 5. Limites.
  const rawLimits = skill.limits;
  let limits: { maxSteps: number; maxOutputChars: number } = { ...DEFAULT_SKILL_LIMITS };
  if (rawLimits !== undefined) {
    if (!rawLimits || typeof rawLimits !== "object" || Array.isArray(rawLimits)) {
      error("skill.limits", "Limites invalides.");
    } else {
      const l = rawLimits as Record<string, unknown>;
      if (l.maxSteps !== undefined) {
        if (!Number.isInteger(l.maxSteps) || Number(l.maxSteps) < 1 || Number(l.maxSteps) > 200) {
          error("skill.limits.maxSteps", "maxSteps doit être un entier entre 1 et 200.");
        } else {
          limits = { ...limits, maxSteps: Number(l.maxSteps) };
        }
      }
      if (l.maxOutputChars !== undefined) {
        if (!Number.isInteger(l.maxOutputChars) || Number(l.maxOutputChars) < 100 || Number(l.maxOutputChars) > 50_000) {
          error("skill.limits.maxOutputChars", "maxOutputChars doit être un entier entre 100 et 50000.");
        } else {
          limits = { ...limits, maxOutputChars: Number(l.maxOutputChars) };
        }
      }
    }
  }

  // 6. Permissions sensibles.
  const permissions = skill.permissions;
  if (permissions !== undefined) {
    if (!Array.isArray(permissions) || permissions.length > 10) {
      error("skill.permissions", "Permissions : tableau de 10 éléments maximum.");
    } else {
      const seen = new Set<string>();
      permissions.forEach((value, index) => {
        if (typeof value !== "string" || !(SENSITIVE_ACTIONS as readonly string[]).includes(value)) {
          error(`skill.permissions[${index}]`, "Action sensible inconnue.");
          return;
        }
        if (seen.has(value)) error(`skill.permissions[${index}]`, "Permission dupliquée.");
        seen.add(value);
      });
    }
  }

  // 7. Étapes : whitelist, références antérieures uniquement, bornes.
  const steps = skill.steps;
  const declaredStepIds = new Set<string>();
  if (!Array.isArray(steps) || steps.length === 0) {
    error("skill.steps", "Au moins une étape est requise.");
  } else if (steps.length > limits.maxSteps) {
    error("skill.steps", `Trop d'étapes : ${steps.length} > maxSteps (${limits.maxSteps}).`);
  } else {
    steps.forEach((raw, index) => {
      const path = `skill.steps[${index}]`;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        error(path, "Étape invalide.");
        return;
      }
      const step = raw as Record<string, unknown>;
      if (!isIdentifier(step.id)) {
        error(`${path}.id`, "Identifiant d'étape invalide.");
        return;
      }
      const stepId = String(step.id);
      if (declaredStepIds.has(stepId)) error(`${path}.id`, `Étape dupliquée : ${stepId}.`);
      if (step.description !== undefined && typeof step.description !== "string") {
        error(`${path}.description`, "description doit être une chaîne.");
      }

      const strings: Array<[string, unknown]> = [];
      switch (step.kind) {
        case "template":
          if (typeof step.template !== "string" || step.template.length === 0) {
            error(`${path}.template`, "Template requis (chaîne non vide).");
          } else if (step.template.length > limits.maxOutputChars * 4) {
            error(`${path}.template`, "Template trop long.");
          } else {
            strings.push([`${path}.template`, step.template]);
          }
          break;
        case "json": {
          const fields = step.fields;
          if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
            error(`${path}.fields`, "Champs JSON requis (objet).");
          } else {
            const entries = Object.entries(fields as Record<string, unknown>);
            if (entries.length === 0 || entries.length > 50) {
              error(`${path}.fields`, "Entre 1 et 50 champs JSON requis.");
            }
            entries.forEach(([key, value]) => {
              if (!FIELD_KEY_RE.test(key)) error(`${path}.fields.${key}`, "Nom de champ JSON invalide.");
              if (typeof value !== "string") error(`${path}.fields.${key}`, "Valeur de champ doit être une chaîne.");
              else strings.push([`${path}.fields.${key}`, value]);
            });
          }
          break;
        }
        case "assert": {
          if (typeof step.value !== "string" || step.value.length === 0) {
            error(`${path}.value`, "Valeur à vérifier requise.");
          } else {
            strings.push([`${path}.value`, step.value]);
          }
          const check = String(step.check ?? "");
          if (!["notEmpty", "contains", "equals", "minLength"].includes(check)) {
            error(`${path}.check`, "Vérification autorisée : notEmpty, contains, equals, minLength.");
          } else if (check !== "notEmpty") {
            if (typeof step.expected !== "string" || step.expected.length === 0) {
              error(`${path}.expected`, `expected est requis pour ${check}.`);
            } else {
              strings.push([`${path}.expected`, step.expected]);
              if (check === "minLength" && (!/^\d+$/.test(step.expected) || Number(step.expected) < 1)) {
                error(`${path}.expected`, "minLength attend un entier positif.");
              }
            }
          }
          if (step.errorMessage !== undefined && typeof step.errorMessage !== "string") {
            error(`${path}.errorMessage`, "errorMessage doit être une chaîne.");
          }
          break;
        }
        default:
          error(`${path}.kind`, "Type d'étape inconnu. Autorisés : template, json, assert.");
      }

      for (const [fieldPath, value] of strings) {
        checkReferences(String(value), fieldPath, paramNames, declaredStepIds, error);
      }
      declaredStepIds.add(stepId);
    });
  }

  // 8. Tests intégrés.
  const tests = skill.tests;
  if (tests !== undefined) {
    if (!Array.isArray(tests) || tests.length > 50) {
      error("skill.tests", "Tests : tableau de 50 éléments maximum.");
    } else {
      tests.forEach((raw, index) => {
        const path = `skill.tests[${index}]`;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          error(path, "Test invalide.");
          return;
        }
        const testCase = raw as Record<string, unknown>;
        if (typeof testCase.name !== "string" || testCase.name.trim().length === 0) {
          error(`${path}.name`, "Nom de test requis.");
        }
        const input = testCase.input;
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          error(`${path}.input`, "Entrées de test requises (objet).");
        } else {
          Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
            if (!paramNames.has(key)) error(`${path}.input.${key}`, "Paramètre non déclaré dans le test.");
            if (!isPrimitive(value)) error(`${path}.input.${key}`, "Valeur de test non primitive.");
          });
        }
        if (testCase.expect !== undefined) {
          if (!testCase.expect || typeof testCase.expect !== "object" || Array.isArray(testCase.expect)) {
            error(`${path}.expect`, "Attendus invalides.");
          } else {
            const expect = testCase.expect as Record<string, unknown>;
            if (expect.contains !== undefined && typeof expect.contains !== "string") error(`${path}.expect.contains`, "Chaîne attendue.");
            if (expect.equals !== undefined && typeof expect.equals !== "string") error(`${path}.expect.equals`, "Chaîne attendue.");
            if (expect.notEmpty !== undefined && typeof expect.notEmpty !== "boolean") error(`${path}.expect.notEmpty`, "Booléen attendu.");
          }
        }
      });
    }
  }

  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

/** Vérifie qu'une action donnée est exécutable (raccourci pour l'executor). */
export function findUnsafePattern(value: string): string | null {
  for (const [pattern, label] of UNSAFE_PATTERNS) {
    if (pattern.test(value)) return label;
  }
  return null;
}

function isIdentifier(value: unknown): boolean {
  return typeof value === "string" && ID_RE.test(value);
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function matchesParamType(value: string | number | boolean, type: string): boolean {
  return typeof value === type;
}

function checkReferences(
  text: string,
  path: string,
  paramNames: Set<string>,
  previousSteps: Set<string>,
  error: (path: string, message: string) => void
): void {
  for (const match of text.matchAll(REF_RE)) {
    const ref = (match[1] ?? "").trim();
    if (ref === "goal") continue;
    if (ref.startsWith("params.")) {
      const name = ref.slice("params.".length);
      if (!paramNames.has(name)) error(path, `Paramètre non déclaré : {{${ref}}}.`);
      continue;
    }
    if (ref.startsWith("steps.")) {
      const stepId = ref.slice("steps.".length);
      if (!previousSteps.has(stepId)) {
        error(path, `Référence d'étape inconnue ou non antérieure : {{${ref}}}.`);
      }
      continue;
    }
    error(path, `Référence non autorisée : {{${ref}}}. Utiliser {{params.x}}, {{steps.id}} ou {{goal}}.`);
  }
}

function scanValue(
  path: string,
  value: unknown,
  error: (path: string, message: string) => void,
  depth: number
): void {
  if (depth > 12) {
    error(path, "Profondeur de définition trop importante.");
    return;
  }
  if (typeof value === "string") {
    const unsafe = findUnsafePattern(value);
    if (unsafe) error(path, `Motif interdit détecté : ${unsafe}.`);
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    error(path, "Nombre invalide.");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(`${path}[${index}]`, item, error, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      scanValue(`${path}.${key}`, item, error, depth + 1);
    }
  }
}
