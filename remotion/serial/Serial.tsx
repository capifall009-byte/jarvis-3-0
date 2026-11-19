import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import { clamp } from "./parts";
import { SceneAgain, SceneDoor, SceneTomorrow, SceneVote } from "./scenes-b";
import { SceneNumber, SceneRewind, SceneRing, SceneWarning } from "./scenes-a";
import {
  SERIAL_AUDIO,
  SERIAL_NARRATION_OFFSET,
  SERIAL_SCENES,
  SERIAL_TOTAL_FRAMES,
  type SerialSceneId,
} from "./timeline";

const SCENE_COMPONENTS: Record<SerialSceneId, React.FC> = {
  s1: SceneRing,
  s2: SceneNumber,
  s3: SceneRewind,
  s4: SceneWarning,
  s5: SceneTomorrow,
  s6: SceneAgain,
  s7: SceneDoor,
  s8: SceneVote,
};

/** Sonneries : [frame de départ, volume]. */
const RINGS: Array<[number, number]> = [
  [18, 0.3],
  [90, 0.26],
  [162, 0.3],
  [786, 0.34],
  [858, 0.28],
  [990, 0.36],
  [1062, 0.3],
];

export const Serial: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0604" }}>
      {SERIAL_SCENES.map((scene) => {
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
      {SERIAL_SCENES.map((scene) => (
        <Sequence
          key={`narration-${scene.id}`}
          from={scene.from + SERIAL_NARRATION_OFFSET}
          durationInFrames={scene.duration - SERIAL_NARRATION_OFFSET}
        >
          <Audio src={staticFile(scene.audio)} volume={1} />
        </Sequence>
      ))}

      {/* Nappe continue */}
      <Audio
        src={staticFile(SERIAL_AUDIO.ambient)}
        volume={(frame) =>
          interpolate(
            frame,
            [0, 80, SERIAL_TOTAL_FRAMES - 90, SERIAL_TOTAL_FRAMES],
            [0, 0.5, 0.5, 0],
            clamp
          )
        }
      />

      {/* Sonneries de téléphone */}
      {RINGS.map(([from, volume]) => (
        <Sequence key={`ring-${from}`} from={from} durationInFrames={48}>
          <Audio
            src={staticFile(SERIAL_AUDIO.ring)}
            volume={(frame) => {
              const envelope = interpolate(
                frame,
                [0, 3, 40, 47],
                [0, 1, 1, 0],
                clamp
              );
              return volume * envelope;
            }}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
