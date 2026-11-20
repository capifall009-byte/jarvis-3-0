/** Adaptateur de stockage volatile — utilisé par les tests et en repli. */
import { cloneCoreState, emptyCoreState, normalizeCoreState } from "../types.ts";
import type { CoreState, CoreStorage } from "../types.ts";

export class MemoryCoreStorage implements CoreStorage {
  readonly info = {
    kind: "memory" as const,
    persistent: false,
    sharedAcrossDevices: false,
    detail: "Stockage volatile : les missions disparaissent au redémarrage. Adaptateur de test/repli.",
  };

  private data: CoreState = emptyCoreState();

  async load(): Promise<CoreState> {
    return normalizeCoreState(cloneCoreState(this.data));
  }

  async save(state: CoreState): Promise<void> {
    this.data = cloneCoreState(state);
  }
}
