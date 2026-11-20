/**
 * Registre des Skills — JARVIS 4.0 Phase 3.
 *
 * CRUD, catégorisation/recherche, versions, tests intégrés, activation contrôlée
 * et sélection automatique pour une mission. Aucune définition n'est activée
 * sans validation stricte + test réussi.
 */

import type { AuditLog } from "../AuditLog.ts";
import type { CoreState } from "../types.ts";
import { SkillExecutor } from "./SkillExecutor.ts";
import type { SkillExecutionResult } from "./SkillExecutor.ts";
import { SkillStorage } from "./SkillStorage.ts";
import { DEFAULT_SKILL_LIMITS, formatIssues, validateSkillDefinition } from "./SkillValidator.ts";
import type {
  NewSkillInput,
  SkillDefinition,
  SkillExecution,
  SkillMatch,
  SkillStatus,
  SkillTestResult,
  SkillTestCaseResult,
  ValidationResult,
} from "./types.ts";

export class SkillRegistryError extends Error {
  readonly code: string;
  readonly issues?: ValidationResult["issues"];

  constructor(code: string, message: string, issues?: ValidationResult["issues"]) {
    super(message);
    this.name = "SkillRegistryError";
    this.code = code;
    if (issues) this.issues = issues;
  }
}

export interface SkillRegistryDeps {
  state: CoreState;
  storage: SkillStorage;
  executor: SkillExecutor;
  audit: AuditLog;
  now?: () => number;
  id?: (prefix: string) => string;
}

export interface SkillFilter {
  category?: string;
  tag?: string;
  status?: SkillStatus;
  search?: string;
  enabled?: boolean;
  limit?: number;
}

let sequence = 0;
function defaultId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const STOPWORDS = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "ou", "pour", "avec",
  "sur", "dans", "mon", "ma", "mes", "ce", "cette", "est", "que", "qui", "je",
  "me", "se", "au", "aux", "par", "plus", "faire", "fais", "donc", "si", "en",
]);

export class SkillRegistry {
  private readonly state: CoreState;
  private readonly storage: SkillStorage;
  private readonly executor: SkillExecutor;
  private readonly audit: AuditLog;
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;

  constructor(deps: SkillRegistryDeps) {
    this.state = deps.state;
    this.storage = deps.storage;
    this.executor = deps.executor;
    this.audit = deps.audit;
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? defaultId;
  }

  list(filter: SkillFilter = {}): SkillDefinition[] {
    const needle = normalize(filter.search ?? "");
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 200;
    return this.storage.list()
      .filter((s) => (filter.category ? s.category === filter.category : true))
      .filter((s) => (filter.tag ? s.tags.includes(filter.tag) : true))
      .filter((s) => (filter.status ? s.status === filter.status : true))
      .filter((s) => (filter.enabled !== undefined ? s.enabled === filter.enabled : true))
      .filter((s) => {
        if (!needle) return true;
        const haystack = normalize(`${s.name} ${s.description} ${s.category} ${s.tags.join(" ")}`);
        return haystack.includes(needle);
      })
      .slice(0, limit);
  }

  get(id: string): SkillDefinition | undefined {
    return this.storage.get(id);
  }

  categories(): Array<{ name: string; count: number }> {
    const counts = new Map<string, number>();
    for (const skill of this.storage.list()) {
      counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  validate(input: unknown): ValidationResult {
    return validateSkillDefinition(input);
  }

  create(input: NewSkillInput, actor = "user"): SkillDefinition {
    const validation = validateSkillDefinition(input);
    if (!validation.valid) {
      this.audit.record({
        actor, action: "skill_creation_rejected", outcome: "denied", severity: "warn",
        detail: formatIssues(validation.issues),
      });
      throw new SkillRegistryError("INVALID_SKILL", `Définition invalide : ${formatIssues(validation.issues)}`, validation.issues);
    }

    const ts = this.now();
    const definition: SkillDefinition = {
      id: input.id || this.id("skl"),
      name: input.name.trim(),
      description: input.description.trim(),
      version: 1,
      category: (input.category || "general").trim(),
      tags: input.tags ?? [],
      parameters: input.parameters ?? [],
      steps: JSON.parse(JSON.stringify(input.steps)) as SkillDefinition["steps"],
      expectedResult: input.expectedResult || "",
      permissions: input.permissions ?? [],
      limits: { ...DEFAULT_SKILL_LIMITS, ...(input.limits ?? {}) },
      status: "draft",
      enabled: false,
      tests: input.tests ?? [],
      history: [{
        version: 1,
        updatedAt: ts,
        note: "Création initiale",
        name: input.name.trim(),
        description: input.description.trim(),
        steps: JSON.parse(JSON.stringify(input.steps)) as SkillDefinition["steps"],
      }],
      executionCount: 0,
      createdAt: ts,
      updatedAt: ts,
    };

    if (this.storage.get(definition.id)) {
      throw new SkillRegistryError("SKILL_EXISTS", `Une compétence porte déjà l'identifiant ${definition.id}.`);
    }
    this.storage.put(definition);
    this.audit.record({
      actor, action: "skill_created", target: definition.id, outcome: "success",
      detail: `${definition.name} · v1 · ${definition.category}`,
    });
    return this.storage.get(definition.id)!;
  }

  update(id: string, patch: Partial<NewSkillInput>, actor = "user", note = "Mise à jour"): SkillDefinition {
    const current = this.storage.get(id);
    if (!current) throw new SkillRegistryError("SKILL_NOT_FOUND", "Compétence introuvable.");

    const candidate: SkillDefinition = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.parameters !== undefined ? { parameters: patch.parameters } : {}),
      ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
      ...(patch.expectedResult !== undefined ? { expectedResult: patch.expectedResult } : {}),
      ...(patch.permissions !== undefined ? { permissions: patch.permissions } : {}),
      ...(patch.limits !== undefined ? { limits: { ...current.limits, ...patch.limits } } : {}),
      ...(patch.tests !== undefined ? { tests: patch.tests } : {}),
      version: current.version + 1,
    };

    const validation = validateSkillDefinition(candidate);
    if (!validation.valid) {
      this.audit.record({
        actor, action: "skill_update_rejected", target: id, outcome: "denied", severity: "warn",
        detail: formatIssues(validation.issues),
      });
      throw new SkillRegistryError("INVALID_SKILL", `Mise à jour invalide : ${formatIssues(validation.issues)}`, validation.issues);
    }

    const ts = this.now();
    candidate.name = candidate.name.trim();
    candidate.description = candidate.description.trim();
    candidate.updatedAt = ts;
    // Toute modification invalide l'activation : un nouveau test est obligatoire.
    candidate.status = "draft";
    candidate.enabled = false;
    candidate.lastTestPassed = undefined;
    delete candidate.lastTestedAt;
    delete candidate.lastError;
    candidate.history = [
      ...current.history,
      {
        version: current.version,
        updatedAt: ts,
        note,
        name: current.name,
        description: current.description,
        steps: JSON.parse(JSON.stringify(current.steps)) as SkillDefinition["steps"],
      },
    ].slice(-30);

    this.storage.put(candidate);
    this.audit.record({
      actor, action: "skill_updated", target: id, outcome: "success",
      detail: `v${current.version} → v${candidate.version} ; réactivation après test requise.`,
    });
    return this.storage.get(id)!;
  }

  remove(id: string, actor = "user"): boolean {
    const removed = this.storage.remove(id);
    if (!removed) throw new SkillRegistryError("SKILL_NOT_FOUND", "Compétence introuvable.");
    this.audit.record({
      actor, action: "skill_deleted", target: id, outcome: "info", severity: "warn",
      detail: `${removed.name} v${removed.version}`,
    });
    return true;
  }

  enable(id: string, actor = "user"): SkillDefinition {
    const skill = this.storage.get(id);
    if (!skill) throw new SkillRegistryError("SKILL_NOT_FOUND", "Compétence introuvable.");
    const validation = validateSkillDefinition(skill);
    if (!validation.valid) {
      throw new SkillRegistryError("INVALID_SKILL", `Compétence invalide : ${formatIssues(validation.issues)}`, validation.issues);
    }
    if (skill.tests.length === 0) {
      throw new SkillRegistryError("TEST_REQUIRED", "Aucun test intégré : tester la compétence avant activation.");
    }
    if (skill.lastTestPassed !== true) {
      throw new SkillRegistryError("TEST_REQUIRED", "Le dernier test intégré n'a pas réussi : activation refusée.");
    }
    skill.status = "active";
    skill.enabled = true;
    skill.updatedAt = this.now();
    this.storage.put(skill);
    this.audit.record({
      actor, action: "skill_enabled", target: id, outcome: "success",
      detail: `${skill.name} v${skill.version} activée après test réussi.`,
    });
    return this.storage.get(id)!;
  }

  disable(id: string, actor = "user", reason = "Désactivation demandée"): SkillDefinition {
    const skill = this.storage.get(id);
    if (!skill) throw new SkillRegistryError("SKILL_NOT_FOUND", "Compétence introuvable.");
    skill.status = "disabled";
    skill.enabled = false;
    skill.updatedAt = this.now();
    this.storage.put(skill);
    this.audit.record({
      actor, action: "skill_disabled", target: id, outcome: "info", severity: "warn", detail: reason,
    });
    return this.storage.get(id)!;
  }

  test(id: string, actor = "user"): SkillTestResult {
    const skill = this.storage.get(id);
    if (!skill) throw new SkillRegistryError("SKILL_NOT_FOUND", "Compétence introuvable.");
    const executedAt = this.now();
    const cases: SkillTestCaseResult[] = [];

    const validation = validateSkillDefinition(skill);
    if (!validation.valid) {
      cases.push({
        name: "validation_structuelle",
        passed: false,
        detail: formatIssues(validation.issues),
      });
    } else if (skill.tests.length === 0) {
      cases.push({
        name: "tests_intégrés",
        passed: false,
        detail: "Aucun cas de test déclaré : activation impossible.",
      });
    } else {
      for (const testCase of skill.tests) {
        cases.push(this.runTestCase(skill, testCase));
      }
    }

    const passed = cases.length > 0 && cases.every((c) => c.passed);
    const current = this.storage.get(id)!;
    current.lastTestedAt = executedAt;
    current.lastTestPassed = passed;
    current.status = passed ? "validated" : "failed";
    if (!passed) current.enabled = false;
    current.updatedAt = executedAt;
    if (!passed) current.lastError = formatIssues(cases.filter((c) => !c.passed).map((c) => ({ path: c.name, message: c.detail, severity: "error" })));
    else delete current.lastError;
    this.storage.put(current);

    this.audit.record({
      actor, action: "skill_tested", target: id, outcome: passed ? "success" : "failure",
      severity: passed ? "info" : "error",
      detail: `v${skill.version} — ${cases.filter((c) => c.passed).length}/${cases.length} cas réussis.`,
    });

    return { skillId: id, version: skill.version, passed, cases, executedAt };
  }

  execute(id: string, input: Record<string, unknown> = {}, options: { actor?: string; goal?: string; missionId?: string } = {}): SkillExecutionResult {
    const skill = this.storage.get(id);
    if (!skill) throw new SkillRegistryError("SKILL_NOT_FOUND", "Compétence introuvable.");
    if (!skill.enabled || skill.status !== "active") {
      throw new SkillRegistryError("SKILL_INACTIVE", "Compétence inactive : activer après un test réussi avant exécution.");
    }
    return this.executor.execute(skill, input, { ...options, mode: "run" });
  }

  listExecutions(filter: Parameters<SkillStorage["listExecutions"]>[0] = {}): SkillExecution[] {
    return this.storage.listExecutions(filter);
  }

  /** Sélection déterministe d'une Skill active par pertinence avec un objectif. */
  match(goal: string, limit = 3): SkillMatch[] {
    const tokens = tokenize(goal);
    if (tokens.length === 0) return [];
    const matches: SkillMatch[] = [];

    for (const skill of this.storage.list()) {
      if (!skill.enabled || skill.status !== "active") continue;
      const nameTokens = tokenize(skill.name);
      const tagTokens = tokenize(skill.tags.join(" "));
      const categoryTokens = tokenize(skill.category);
      const descriptionTokens = tokenize(skill.description);
      const hits = new Set<string>();
      let weight = 0;
      for (const token of tokens) {
        if (nameTokens.includes(token)) { weight += 3; hits.add(token); }
        if (tagTokens.includes(token)) { weight += 2; hits.add(token); }
        if (categoryTokens.includes(token)) { weight += 1; hits.add(token); }
        if (descriptionTokens.includes(token)) { weight += 1; hits.add(token); }
      }
      if (weight === 0) continue;
      matches.push({
        skillId: skill.id,
        name: skill.name,
        version: skill.version,
        score: Math.min(1, Number((weight / 5).toFixed(3))),
        reason: `Mots correspondants : ${[...hits].slice(0, 6).join(", ")}.`,
      });
    }
    return matches.sort((a, b) => b.score - a.score || a.skillId.localeCompare(b.skillId)).slice(0, Math.max(1, Math.min(limit, 10)));
  }

  private runTestCase(skill: SkillDefinition, testCase: SkillDefinition["tests"][number]): SkillTestCaseResult {
    const { execution, output } = this.executor.execute(skill, testCase.input, {
      actor: "test",
      goal: testCase.name,
      mode: "test",
    });
    if (execution.status !== "success") {
      return { name: testCase.name, passed: false, detail: execution.error ?? "Échec d'exécution du test." };
    }
    const expect = testCase.expect;
    if (!expect) {
      return { name: testCase.name, passed: true, detail: `Sortie : ${truncate(output ?? "")}` };
    }
    const value = output ?? "";
    const failures: string[] = [];
    if (expect.contains !== undefined && !value.includes(expect.contains)) {
      failures.push(`ne contient pas « ${expect.contains} »`);
    }
    if (expect.equals !== undefined && value !== expect.equals) {
      failures.push(`n'est pas égal à « ${expect.equals} »`);
    }
    if (expect.notEmpty === true && value.trim().length === 0) {
      failures.push("sortie vide");
    }
    return failures.length === 0
      ? { name: testCase.name, passed: true, detail: `Sortie : ${truncate(value)}` }
      : { name: testCase.name, passed: false, detail: failures.join(" ; ") };
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
