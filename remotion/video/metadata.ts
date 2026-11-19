import type { CalculateMetadataFunction } from "remotion";
import type { JarvisVideoProps } from "./types";
import { JARVIS_VIDEO_FPS } from "./types";

/**
 * La durée de la composition est la somme des durées de scènes calculées par
 * le serveur (elles-mêmes dérivées de la durée réelle des fichiers TTS).
 */
export const calculateJarvisVideoMetadata: CalculateMetadataFunction<
  JarvisVideoProps
> = ({ props }) => {
  const scenes = Array.isArray(props.scenes) ? props.scenes : [];
  const total = scenes.reduce(
    (sum, scene) => sum + Math.max(1, Math.round(scene.durationInFrames || 0)),
    0
  );

  return {
    durationInFrames: Math.max(JARVIS_VIDEO_FPS * 2, total),
  };
};
