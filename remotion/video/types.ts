/**
 * Contrat partagé entre le générateur serveur et les compositions Remotion.
 *
 * Aucun import runtime ici : ce fichier est consommé à la fois par le serveur
 * (tsx) et par le bundler Remotion.
 */

export type JarvisVideoFormat = "vertical" | "horizontal" | "square";

export type JarvisVideoSceneKind = "hook" | "point" | "quote" | "cta";

export interface JarvisVideoScene {
  id: string;
  kind: JarvisVideoSceneKind;
  headline: string;
  subline?: string;
  narration: string;
  /** Chemin relatif au dossier public Remotion (remotion/public). */
  audio: string | null;
  durationInFrames: number;
  audioOffsetInFrames: number;
}

export interface JarvisVideoProps {
  /** Remotion 4 exige un objet de props indexable par clé. */
  [key: string]: unknown;
  title: string;
  kicker: string;
  accent: "cyan" | "violet" | "amber";
  format: JarvisVideoFormat;
  music: string | null;
  musicVolume: number;
  scenes: JarvisVideoScene[];
}

export const JARVIS_VIDEO_FPS = 30;

export const JARVIS_VIDEO_SIZES: Record<
  JarvisVideoFormat,
  { width: number; height: number }
> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
};

export const JARVIS_VIDEO_COMPOSITIONS: Record<JarvisVideoFormat, string> = {
  vertical: "JarvisVideoVertical",
  horizontal: "JarvisVideoHorizontal",
  square: "JarvisVideoSquare",
};

export const DEFAULT_JARVIS_VIDEO_PROPS: JarvisVideoProps = {
  title: "JARVIS 3.0",
  kicker: "ASSISTANT PERSONNEL",
  accent: "cyan",
  format: "vertical",
  music: "reel/audio/music.mp3",
  musicVolume: 0.08,
  scenes: [
    {
      id: "demo-1",
      kind: "hook",
      headline: "Crée une vidéo avec JARVIS",
      subline: "Un sujet, une voix, un rendu Remotion.",
      narration:
        "Voici un aperçu de la composition vidéo générée par JARVIS.",
      audio: null,
      durationInFrames: 90,
      audioOffsetInFrames: 0,
    },
    {
      id: "demo-2",
      kind: "cta",
      headline: "JARVIS 3.0",
      subline: "Abdourahmane Fall · Capzo",
      narration: "Rendu par Remotion, piloté depuis JARVIS.",
      audio: null,
      durationInFrames: 90,
      audioOffsetInFrames: 0,
    },
  ],
};
