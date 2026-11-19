/** « Le Dernier Signal » — timeline et textes. */

export const STORY_FPS = 30;
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const SCENE_FRAMES = 180; // 6 s par scène
export const STORY_TOTAL_FRAMES = 8 * SCENE_FRAMES; // 48 s

export type StorySceneId = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8";

export interface StoryScene {
  id: StorySceneId;
  index: number;
  from: number;
  to: number;
  duration: number;
  audio: string;
  narration: string;
}

const RAW: Array<{ id: StorySceneId; narration: string }> = [
  { id: "s1", narration: "La Terre a cessé d'écouter." },
  { id: "s2", narration: "Une seule antenne veillait encore." },
  { id: "s3", narration: "Chaque nuit, trois secondes." },
  { id: "s4", narration: "Personne ne la croyait." },
  { id: "s5", narration: "Alors, une nuit, elle répondit." },
  { id: "s6", narration: "Le silence dura longtemps." },
  { id: "s7", narration: "Puis quatre secondes arrivèrent." },
  { id: "s8", narration: "Ce n'était pas la fin. C'était le début." },
];

export const STORY_SCENES: StoryScene[] = RAW.map((scene, index) => {
  const from = index * SCENE_FRAMES;
  return {
    ...scene,
    index,
    from,
    to: from + SCENE_FRAMES,
    duration: SCENE_FRAMES,
    audio: `story/audio/${scene.id}.mp3`,
  };
});

/** Décalage de la voix off à l'intérieur de chaque scène. */
export const NARRATION_OFFSET = 18;

export const STORY_AUDIO = {
  ambient: "story/audio/ambient.mp3",
  ping: "story/audio/ping.mp3",
};
