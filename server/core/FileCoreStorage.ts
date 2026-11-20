/**
 * Adaptateur serveur (Node uniquement) : fichier JSON local.
 *
 * LIMITATION HONNÊTE : sur un hébergement gratuit (Render free), le disque
 * peut être éphémère. Ce stockage n'est donc NI partagé entre appareils NI
 * garanti durable après redéploiement. Aucune base externe n'est configurée
 * dans cette phase ; aucun compte ni donnée n'a été transmis à un tiers.
 */
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cloneCoreState, emptyCoreState, normalizeCoreState } from "../../src/core/types.ts";
import type { CoreState, CoreStorage } from "../../src/core/types.ts";

export const DEFAULT_CORE_STATE_PATH = path.resolve(
  process.cwd(),
  "server",
  ".data",
  "core-state.json"
);

/** Chemin surchargeable par JARVIS_CORE_STATE_PATH (chemin relatif à la racine du projet). */
function resolveStatePath(): string {
  const configured = String(process.env.JARVIS_CORE_STATE_PATH || "").trim();
  return configured ? path.resolve(process.cwd(), configured) : DEFAULT_CORE_STATE_PATH;
}

export class FileCoreStorage implements CoreStorage {
  readonly info = {
    kind: "local-file" as const,
    persistent: true,
    sharedAcrossDevices: false,
    detail:
      "Fichier local serveur (server/.data/core-state.json, surchargeable via JARVIS_CORE_STATE_PATH). " +
      "Non partagé entre appareils ; peut être perdu lors d'un redéploiement sur un hébergement gratuit. " +
      "Aucune base externe configurée en Phase 2.",
  };

  private readonly filePath: string;

  constructor(filePath: string = resolveStatePath()) {
    this.filePath = filePath;
  }

  async load(): Promise<CoreState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CoreState>;
      if (parsed?.version === 1 && Array.isArray(parsed.missions)) {
        // Compatibilité ascendante : un état Phase 2 reçoit les champs Phase 3 vides.
        return normalizeCoreState(parsed);
      }
      console.warn("[core] État local illisible, réinitialisation de la structure seulement.");
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "ENOENT") {
        console.warn("[core] Lecture de l'état impossible :", (err as Error)?.message ?? err);
      }
    }
    return emptyCoreState();
  }

  async save(state: CoreState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // Phase 9.5 : fichier temporaire UNIQUE par écriture. Un `.tmp` fixe pouvait
    // être écrasé par deux sauvegardes concurrentes et corrompre l'état.
    const temp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(cloneCoreState(state), null, 2), {
        encoding: "utf8",
        flag: "wx",
      });
      await fs.rename(temp, this.filePath);
    } catch (err) {
      await fs.rm(temp, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}
