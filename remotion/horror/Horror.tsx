import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { clamp } from "./parts";
import { SceneCloset, SceneHall, SceneName, SceneVote } from "./scenes-b";
import { SceneFloor, SceneJournal, SceneLift, SceneSteps } from "./scenes-a";
import {
  HORROR_AUDIO,
  HORROR_NARRATION_OFFSET,
  HORROR_SCENES,
  HORROR_TOTAL_FRAMES,
  type HorrorSceneId,
} from "./timeline";

const SCENE_COMPONENTS: Record<HorrorSceneId, React.FC> = {
  s1: SceneJournal,
  s2: SceneLift,
  s3: SceneFloor,
  s4: SceneSteps,
  s5: SceneCloset,
  s6: SceneHall,
  s7: SceneName,
  s8: SceneVote,
};

/** Frappes contre la porte : [frame de départ, volume]. */
const KNOCKS: Array<[number, number]> = [
  [948, 0.32],
  [1014, 0.36],
  [1086, 0.4],
  [1116, 0.34],
  [1152, 0.44],
];

export const Horror: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#020202" }}>
      {HORROR_SCENES.map((scene) => {
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

      {/* Voix off froide, décalée dans chaque scène */}
      {HORROR_SCENES.map((scene) => (
        <Sequence
          key={`narration-${scene.id}`}
          from={scene.from + HORROR_NARRATION_OFFSET}
          durationInFrames={scene.duration - HORROR_NARRATION_OFFSET}
        >
          <Audio src={staticFile(scene.audio)} volume={1} />
        </Sequence>
      ))}

      {/* Bourdon continu : monte quand la silhouette approche */}
      <Audio
        src={staticFile(HORROR_AUDIO.ambient)}
        volume={(frame) => {
          const base = interpolate(
            frame,
            [0, 90, HORROR_TOTAL_FRAMES - 100, HORROR_TOTAL_FRAMES],
            [0, 0.42, 0.42, 0],
            clamp
          );
          const swell = interpolate(frame, [900, 1120, 1260], [0, 0.28, 0.12], clamp);
          return base + swell;
        }}
      />

      {/* Coups à la porte */}
      {KNOCKS.map(([from, volume]) => (
        <Sequence key={`knock-${from}`} from={from} durationInFrames={38}>
          <Audio
            src={staticFile(HORROR_AUDIO.knock)}
            volume={(frame) => {
              const first = interpolate(frame, [0, 2, 10, 18], [0, 1, 0.5, 0], clamp);
              const second = interpolate(frame, [16, 19, 27, 36], [0, 0.85, 0.4, 0], clamp);
              return volume * Math.max(first, second);
            }}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
