/** Timeline du Reel — source de vérité unique pour les scènes, l'audio et les barres. */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type SceneId = "hook" | "valeur" | "code" | "filme" | "publie" | "cta";

type SceneDef = {
  id: SceneId;
  duration: number;
  /** Fichier de voix off (relatif à remotion/public). */
  audio: string;
  /** Décalage de la voix off dans la scène, en frames. */
  audioOffset: number;
};

const SCENE_DEFS: SceneDef[] = [
  { id: "hook", duration: 114, audio: "reel/audio/01-hook.mp3", audioOffset: 8 },
  { id: "valeur", duration: 96, audio: "reel/audio/02-valeur.mp3", audioOffset: 6 },
  { id: "code", duration: 84, audio: "reel/audio/03-code.mp3", audioOffset: 10 },
  { id: "filme", duration: 84, audio: "reel/audio/04-filme.mp3", audioOffset: 10 },
  { id: "publie", duration: 84, audio: "reel/audio/05-publie.mp3", audioOffset: 10 },
  { id: "cta", duration: 108, audio: "reel/audio/06-cta.mp3", audioOffset: 10 },
];

export type Scene = SceneDef & { index: number; from: number; to: number };

let cursor = 0;
export const SCENES: Scene[] = SCENE_DEFS.map((def, index) => {
  const scene: Scene = { ...def, index, from: cursor, to: cursor + def.duration };
  cursor += def.duration;
  return scene;
});

export const TOTAL_FRAMES = cursor; // 570 frames = 19 s
export const MUSIC = "reel/audio/music.mp3";
