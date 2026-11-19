import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
} from "remotion";
import { clamp } from "./parts";
import { Scene2089, SceneAntenna, SceneDoubt, SceneThreeSeconds } from "./scenes-a";
import {
  SceneAnswer,
  SceneDawn,
  SceneFourSeconds,
  SceneSilence,
} from "./scenes-b";
import {
  NARRATION_OFFSET,
  STORY_AUDIO,
  STORY_SCENES,
  STORY_TOTAL_FRAMES,
  type StorySceneId,
} from "./timeline";

const SCENE_COMPONENTS: Record<StorySceneId, React.FC> = {
  s1: Scene2089,
  s2: SceneAntenna,
  s3: SceneThreeSeconds,
  s4: SceneDoubt,
  s5: SceneAnswer,
  s6: SceneSilence,
  s7: SceneFourSeconds,
  s8: SceneDawn,
};

/** Effets sonores : [frame de départ, volume]. */
const PINGS: Array<[number, number]> = [
  [366, 0.28],
  [754, 0.22],
  [1080, 0.32],
];

export const Story: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#03060d" }}>
      {STORY_SCENES.map((scene) => {
        const Scene = SCENE_COMPONENTS[scene.id];
        return (
          <Sequence
            key={scene.id}
            from={scene.from}
            durationInFrames={scene.duration}
            premountFor={20}
          >
            <Scene />
          </Sequence>
        );
      })}

      {/* Narration */}
      {STORY_SCENES.map((scene) => (
        <Sequence
          key={`narration-${scene.id}`}
          from={scene.from + NARRATION_OFFSET}
          durationInFrames={scene.duration - NARRATION_OFFSET}
        >
          <Audio src={staticFile(scene.audio)} volume={1} />
        </Sequence>
      ))}

      {/* Nappe continue */}
      <Audio
        src={staticFile(STORY_AUDIO.ambient)}
        volume={(frame) =>
          interpolate(
            frame,
            [0, 70, STORY_TOTAL_FRAMES - 80, STORY_TOTAL_FRAMES],
            [0, 0.55, 0.55, 0],
            clamp
          )
        }
      />

      {/* Pings radar */}
      {PINGS.map(([from, volume]) => (
        <Sequence key={`ping-${from}`} from={from} durationInFrames={50}>
          <Audio src={staticFile(STORY_AUDIO.ping)} volume={volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
