/** « JOUR 1 · Ne réponds pas » — feuilleton interactif, timeline et textes. */

export const SERIAL_FPS = 30;
export const SERIAL_WIDTH = 1080;
export const SERIAL_HEIGHT = 1920;
export const SERIAL_SCENE_FRAMES = 180; // 6 s par scène
export const SERIAL_TOTAL_FRAMES = 8 * SERIAL_SCENE_FRAMES; // 48 s

export type SerialSceneId = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8";

export interface SerialScene {
  id: SerialSceneId;
  index: number;
  from: number;
  to: number;
  duration: number;
  audio: string;
  narration: string;
}

const RAW: Array<{ id: SerialSceneId; narration: string }> = [
  { id: "s1", narration: "Il est deux heures quarante-sept. Ton téléphone sonne." },
  { id: "s2", narration: "L'appelant affiche ton propre numéro." },
  { id: "s3", narration: "Trois secondes avant, tu t'es envoyé un message." },
  { id: "s4", narration: "Il disait : ne réponds pas." },
  { id: "s5", narration: "Le message était daté de demain." },
  { id: "s6", narration: "La sonnerie s'arrête. Puis recommence." },
  { id: "s7", narration: "Cette fois, elle vient de l'autre côté de la porte." },
  { id: "s8", narration: "Vote : répondre ou laisser sonner. À demain pour le jour deux." },
];

export const SERIAL_SCENES: SerialScene[] = RAW.map((scene, index) => {
  const from = index * SERIAL_SCENE_FRAMES;
  return {
    ...scene,
    index,
    from,
    to: from + SERIAL_SCENE_FRAMES,
    duration: SERIAL_SCENE_FRAMES,
    audio: `serial/audio/${scene.id}.mp3`,
  };
});

/** Décalage de la voix off à l'intérieur de chaque scène. */
export const SERIAL_NARRATION_OFFSET = 14;

export const SERIAL_AUDIO = {
  ambient: "serial/audio/ambient.mp3",
  ring: "serial/audio/ring.mp3",
};
