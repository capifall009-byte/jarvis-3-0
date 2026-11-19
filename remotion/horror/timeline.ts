/** « JOUR 1 · Le couloir » — feuilleton horreur found-footage. */

export const HORROR_FPS = 30;
export const HORROR_WIDTH = 1080;
export const HORROR_HEIGHT = 1920;
export const HORROR_SCENE_FRAMES = 180; // 6 s
export const HORROR_TOTAL_FRAMES = 8 * HORROR_SCENE_FRAMES; // 48 s

export type HorrorSceneId = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8";

export interface HorrorScene {
  id: HorrorSceneId;
  index: number;
  from: number;
  to: number;
  duration: number;
  audio: string;
  narration: string;
}

const RAW: Array<{ id: HorrorSceneId; narration: string }> = [
  { id: "s1", narration: "Journal. Jour un. Trois pour cent." },
  { id: "s2", narration: "Les ascenseurs sont arrêtés depuis ce matin." },
  { id: "s3", narration: "À vingt-deux heures, ça a commencé au quatrième étage." },
  { id: "s4", narration: "D'abord un cri. Puis des pas. Beaucoup de pas." },
  { id: "s5", narration: "J'ai éteint la lumière. Je filme depuis le placard." },
  { id: "s6", narration: "Quelqu'un marche. Puis il respire." },
  { id: "s7", narration: "Il vient de dire mon prénom. Je n'ai jamais ouvert cette porte." },
  { id: "s8", narration: "Vote : ouvrir la fenêtre, ou rester caché. À demain." },
];

export const HORROR_SCENES: HorrorScene[] = RAW.map((scene, index) => {
  const from = index * HORROR_SCENE_FRAMES;
  return {
    ...scene,
    index,
    from,
    to: from + HORROR_SCENE_FRAMES,
    duration: HORROR_SCENE_FRAMES,
    audio: `horror/audio/${scene.id}.mp3`,
  };
});

export const HORROR_NARRATION_OFFSET = 8;

export const HORROR_AUDIO = {
  ambient: "horror/audio/ambient.mp3",
  knock: "horror/audio/knock.mp3",
};
