/**
 * Stockage des Skills — JARVIS 4.0 Phase 3.
 *
 * Adaptateur mince au-dessus de `CoreState` : aucune base propre, aucun fichier
 * supplémentaire. La persistance réelle reste assurée par le `CoreStorage`
 * injecté dans `JarvisCore` (Phase 2), sans doublon de service.
 */

import type { CoreState } from "../types.ts";
import type { SkillDefinition, SkillExecution } from "./types.ts";

export const MAX_SKILL_EXECUTIONS = 200;

export interface SkillExecutionFilter {
  skillId?: string;
  status?: SkillExecution["status"];
  actor?: string;
  limit?: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SkillStorage {
  private readonly state: CoreState;

  constructor(state: CoreState) {
    this.state = state;
    if (!Array.isArray(this.state.skills)) this.state.skills = [];
    if (!Array.isArray(this.state.skillExecutions)) this.state.skillExecutions = [];
  }

  list(): SkillDefinition[] {
    return clone(this.state.skills).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): SkillDefinition | undefined {
    const found = this.state.skills.find((skill) => skill.id === id);
    return found ? clone(found) : undefined;
  }

  /** Insère ou remplace une définition (le Registry gère les versions). */
  put(definition: SkillDefinition): void {
    const index = this.state.skills.findIndex((s) => s.id === definition.id);
    const next = clone(definition);
    if (index >= 0) this.state.skills[index] = next;
    else this.state.skills.push(next);
  }

  remove(id: string): SkillDefinition | undefined {
    const index = this.state.skills.findIndex((s) => s.id === id);
    if (index < 0) return undefined;
    const [removed] = this.state.skills.splice(index, 1);
    return clone(removed);
  }

  recordExecution(execution: SkillExecution): void {
    this.state.skillExecutions.push(clone(execution));
    if (this.state.skillExecutions.length > MAX_SKILL_EXECUTIONS) {
      this.state.skillExecutions.splice(
        0,
        this.state.skillExecutions.length - MAX_SKILL_EXECUTIONS
      );
    }
  }

  listExecutions(filter: SkillExecutionFilter = {}): SkillExecution[] {
    const limit = Math.max(0, Math.min(filter.limit ?? 50, MAX_SKILL_EXECUTIONS));
    return clone(this.state.skillExecutions)
      .filter((e) => (filter.skillId ? e.skillId === filter.skillId : true))
      .filter((e) => (filter.status ? e.status === filter.status : true))
      .filter((e) => (filter.actor ? e.actor === filter.actor : true))
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, limit);
  }

  countExecutions(): number {
    return this.state.skillExecutions.length;
  }
}
