import type { StoryboardScene, VideoCameraMotion } from "../../../src/types/jarvis.ts";

export interface SceneManagerOptions {
  scenes: StoryboardScene[];
  totalDurationSec?: number;
}

export interface SceneOperationResult {
  scenes: StoryboardScene[];
  totalDurationSec: number;
}

export class SceneManager {
  private scenes: StoryboardScene[];

  constructor(initialScenes: StoryboardScene[] = []) {
    this.scenes = [...initialScenes].map((s, i) => ({
      ...s,
      id: s.id || `scene-${Date.now()}-${i}`,
      index: i + 1,
    }));
  }

  getScenes(): StoryboardScene[] {
    return [...this.scenes];
  }

  getScene(id: string): StoryboardScene | null {
    return this.scenes.find((s) => s.id === id) ?? null;
  }

  addScene(scene: Omit<StoryboardScene, "id" | "index">): SceneOperationResult {
    const next: StoryboardScene = {
      ...scene,
      id: `scene-${Date.now()}-${this.scenes.length}`,
      index: this.scenes.length + 1,
      cameraMotion: scene.cameraMotion || "static",
      durationSec: scene.durationSec || 4,
      transition: scene.transition || "fade",
    };
    this.scenes.push(next);
    this.reindex();
    return this.buildResult();
  }

  updateScene(id: string, patch: Partial<StoryboardScene>): SceneOperationResult {
    const idx = this.scenes.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error(`Scène introuvable : ${id}`);
    }
    this.scenes[idx] = { ...this.scenes[idx], ...patch };
    return this.buildResult();
  }

  removeScene(id: string): SceneOperationResult {
    const before = this.scenes.length;
    this.scenes = this.scenes.filter((s) => s.id !== id);
    if (this.scenes.length === before) {
      throw new Error(`Scène introuvable : ${id}`);
    }
    this.reindex();
    return this.buildResult();
  }

  reorderScene(id: string, newIndex: number): SceneOperationResult {
    const idx = this.scenes.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error(`Scène introuvable : ${id}`);
    }
    const clamped = Math.max(1, Math.min(newIndex, this.scenes.length));
    const [moved] = this.scenes.splice(idx, 1);
    this.scenes.splice(clamped - 1, 0, moved);
    this.reindex();
    return this.buildResult();
  }

  setTotalDuration(durationSec: number): SceneOperationResult {
    if (this.scenes.length === 0) {
      return { scenes: [], totalDurationSec: durationSec };
    }
    const perScene = Math.max(2, Math.round(durationSec / this.scenes.length));
    this.scenes = this.scenes.map((s) => ({ ...s, durationSec: perScene }));
    return this.buildResult();
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (this.scenes.length === 0) {
      errors.push("Aucune scène définie.");
    }
    for (const s of this.scenes) {
      if (!s.title.trim()) errors.push(`Scène ${s.index} : titre manquant.`);
      if (!s.visualDescription.trim()) errors.push(`Scène ${s.index} : description visuelle manquante.`);
      if (!s.imagePrompt.trim()) errors.push(`Scène ${s.index} : prompt visuel manquant.`);
      if (!Number.isFinite(s.durationSec) || s.durationSec < 2) {
        errors.push(`Scène ${s.index} : durée invalide (min 2s).`);
      }
      const validMotions: VideoCameraMotion[] = [
        "static", "zoom_in", "zoom_out", "pan_right", "pan_left", "orbit",
      ];
      if (!validMotions.includes(s.cameraMotion)) {
        errors.push(`Scène ${s.index} : mouvement de caméra invalide.`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private reindex(): void {
    this.scenes.forEach((s, i) => {
      s.index = i + 1;
    });
  }

  private buildResult(): SceneOperationResult {
    const totalDurationSec = this.scenes.reduce(
      (acc, s) => acc + (s.durationSec || 0),
      0
    );
    return { scenes: this.getScenes(), totalDurationSec };
  }
}

export function createSceneManager(
  initialScenes: StoryboardScene[] = []
): SceneManager {
  return new SceneManager(initialScenes);
}