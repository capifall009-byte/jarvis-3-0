import { Composition } from "remotion";
import { InstagramReel } from "./reel/InstagramReel";
import { Story } from "./story/Story";
import { Serial } from "./serial/Serial";
import { Horror } from "./horror/Horror";
import {
  STORY_FPS,
  STORY_HEIGHT,
  STORY_TOTAL_FRAMES,
  STORY_WIDTH,
} from "./story/timeline";
import {
  SERIAL_FPS,
  SERIAL_HEIGHT,
  SERIAL_TOTAL_FRAMES,
  SERIAL_WIDTH,
} from "./serial/timeline";
import {
  HORROR_FPS,
  HORROR_HEIGHT,
  HORROR_TOTAL_FRAMES,
  HORROR_WIDTH,
} from "./horror/timeline";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./reel/timeline";
import { JarvisVideo } from "./video/JarvisVideo";
import { calculateJarvisVideoMetadata } from "./video/metadata";
import {
  DEFAULT_JARVIS_VIDEO_PROPS,
  JARVIS_VIDEO_SIZES,
  type JarvisVideoFormat,
} from "./video/types";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="InstagramReel"
        component={InstagramReel}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="DernierSignal"
        component={Story}
        durationInFrames={STORY_TOTAL_FRAMES}
        fps={STORY_FPS}
        width={STORY_WIDTH}
        height={STORY_HEIGHT}
      />
      <Composition
        id="JourUn"
        component={Serial}
        durationInFrames={SERIAL_TOTAL_FRAMES}
        fps={SERIAL_FPS}
        width={SERIAL_WIDTH}
        height={SERIAL_HEIGHT}
      />
      <Composition
        id="Horror"
        component={Horror}
        durationInFrames={HORROR_TOTAL_FRAMES}
        fps={HORROR_FPS}
        width={HORROR_WIDTH}
        height={HORROR_HEIGHT}
      />

      {/* Générateur vidéo JARVIS : scénario JSON, 9:16 et 16:9 */}
      {(["vertical", "horizontal"] as JarvisVideoFormat[]).map((format) => {
        const size = JARVIS_VIDEO_SIZES[format];
        return (
          <Composition
            key={format}
            id={
              format === "vertical" ? "JarvisVideoVertical" : "JarvisVideoHorizontal"
            }
            component={JarvisVideo}
            durationInFrames={DEFAULT_JARVIS_VIDEO_PROPS.scenes.reduce(
              (sum, scene) => sum + scene.durationInFrames,
              0
            )}
            fps={30}
            width={size.width}
            height={size.height}
            defaultProps={{ ...DEFAULT_JARVIS_VIDEO_PROPS, format }}
            calculateMetadata={calculateJarvisVideoMetadata}
          />
        );
      })}
    </>
  );
};
