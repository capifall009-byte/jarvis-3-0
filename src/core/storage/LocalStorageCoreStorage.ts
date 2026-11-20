/**
 * Adaptateur navigateur : persistance locale par appareil via localStorage.
 * Ne remplace aucune donnée existante — clé dédiée au noyau 4.0 uniquement.
 */
import { cloneCoreState, emptyCoreState, normalizeCoreState } from "../types.ts";
import type { CoreState, CoreStorage } from "../types.ts";

export const CORE_STORAGE_KEY = "jarvis_core_state_v1";

export class LocalStorageCoreStorage implements CoreStorage {
  readonly info = {
    kind: "local-storage" as const,
    persistent: true,
    sharedAcrossDevices: false,
    detail: "Persistance locale sur cet appareil uniquement. Pas de synchronisation multi-appareils.",
  };

  async load(): Promise<CoreState> {
    try {
      if (typeof localStorage === "undefined") return emptyCoreState();
      const raw = localStorage.getItem(CORE_STORAGE_KEY);
      if (!raw) return emptyCoreState();
      const parsed = JSON.parse(raw) as Partial<CoreState>;
      if (parsed?.version === 1 && Array.isArray(parsed.missions)) {
        // Complète les champs Phase 3 absents sans toucher aux données Phase 2.
        return normalizeCoreState(parsed);
      }
    } catch {
      // Données corrompues : on repart d'un état vide sans toucher aux autres clés.
    }
    return emptyCoreState();
  }

  async save(state: CoreState): Promise<void> {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(CORE_STORAGE_KEY, JSON.stringify(cloneCoreState(state)));
    } catch {
      // Quota dépassé ou stockage indisponible : le noyau continue en mémoire.
    }
  }
}
