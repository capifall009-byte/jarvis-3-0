import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Backdrop, Header, ProgressBar, clamp } from "./parts";
import { MUSIC, SCENES, TOTAL_FRAMES } from "./timeline";
import {
  CodeScene,
  CtaScene,
  FilmScene,
  HookScene,
  PublishScene,
  ValueScene,
} from "./scenes";

const SCENE_COMPONENTS: Record<string, React.FC> = {
  hook: HookScene,
  valeur: ValueScene,
  code: CodeScene,
  filme: FilmScene,
  publie: PublishScene,
  cta: CtaScene,
};

export const InstagramReel: React.FC = () => {
  const frame = useCurrentFrame();
  const endFade = interpolate(
    frame,
    [TOTAL_FRAMES - 8, TOTAL_FRAMES - 1],
    [0, 1],
    clamp
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070f" }}>
      <Backdrop />

      {/* Scènes */}
      {SCENES.map((scene) => {
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

      {/* Voix off : une réplique par scène */}
      {SCENES.map((scene) => (
        <Sequence
          key={scene.audio}
          from={scene.from + scene.audioOffset}
          durationInFrames={scene.duration - scene.audioOffset}
        >
          <Audio src={staticFile(scene.audio)} volume={1} />
        </Sequence>
      ))}

      {/* Nappe sonore continue, fondu entrée/sortie */}
      <Audio
        src={staticFile(MUSIC)}
        volume={(f) =>
          interpolate(
            f,
            [0, 28, TOTAL_FRAMES - 46, TOTAL_FRAMES],
            [0, 0.16, 0.16, 0],
            clamp
          )
        }
      />

      {/* Chrome de l'app : en-tête, stories, barre système */}
      <Header />
      <ProgressBar frame={frame} />

      <div
        style={{
          position: "absolute",
          bottom: 34,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          zIndex: 30,
        }}
      >
        <div
          style={{
            width: 286,
            height: 10,
            borderRadius: 99,
            background: "rgba(226, 232, 240, 0.35)",
          }}
        />
      </div>

      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          opacity: endFade,
          zIndex: 40,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
