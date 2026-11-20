import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { JarvisVideoProps, JarvisVideoScene } from "./types";

const FONT =
  "'Segoe UI Variable Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Cascadia Mono', Consolas, 'Courier New', monospace";

const ACCENTS = {
  cyan: {
    main: "#22d3ee",
    soft: "rgba(34, 211, 238, 0.16)",
    line: "rgba(34, 211, 238, 0.55)",
    glow: "rgba(34, 211, 238, 0.35)",
  },
  violet: {
    main: "#a78bfa",
    soft: "rgba(167, 139, 250, 0.16)",
    line: "rgba(167, 139, 250, 0.55)",
    glow: "rgba(139, 92, 246, 0.35)",
  },
  amber: {
    main: "#fbbf24",
    soft: "rgba(251, 191, 36, 0.14)",
    line: "rgba(251, 191, 36, 0.5)",
    glow: "rgba(245, 158, 11, 0.32)",
  },
} as const;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const Backdrop: React.FC<{
  accent: keyof typeof ACCENTS;
  index: number;
  total: number;
  width: number;
  height: number;
}> = ({ accent, index, total, width, height }) => {
  const frame = useCurrentFrame();
  const tone = ACCENTS[accent] ?? ACCENTS.cyan;
  const phase = index / Math.max(1, total - 1);
  const driftX = Math.sin(frame / 90 + phase * Math.PI * 2) * width * 0.06;
  const driftY = Math.cos(frame / 110 + phase * Math.PI * 2) * height * 0.03;
  const scan = interpolate(frame % 260, [0, 260], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: "#04060d" }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle at 22% 18%, rgba(34,211,238,0.10), transparent 55%), radial-gradient(circle at 82% 78%, rgba(99,102,241,0.12), transparent 58%)",
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.16,
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
          backgroundSize: "84px 84px",
          maskImage:
            "radial-gradient(ellipse at 50% 42%, black 30%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 42%, black 30%, transparent 78%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: width * 0.62,
          height: width * 0.62,
          left: width * 0.2 + driftX,
          top: height * 0.16 + driftY,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${tone.glow} 0%, transparent 68%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${scan * 100}%`,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${tone.line}, transparent)`,
          opacity: 0.35,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(2,4,10,0.55) 0%, transparent 18%, transparent 78%, rgba(2,4,10,0.78) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{ children: React.ReactNode; accent: keyof typeof ACCENTS }> = ({
  children,
  accent,
}) => {
  const tone = ACCENTS[accent] ?? ACCENTS.cyan;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        border: `1px solid ${tone.line}`,
        background: tone.soft,
        color: tone.main,
        borderRadius: 999,
        padding: "12px 26px",
        fontFamily: MONO,
        fontSize: 22,
        letterSpacing: 4,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: tone.main,
          boxShadow: `0 0 16px ${tone.main}`,
        }}
      />
      {children}
    </div>
  );
};

const SceneBody: React.FC<{
  scene: JarvisVideoScene;
  index: number;
  total: number;
  durationInFrames: number;
  accent: keyof typeof ACCENTS;
  width: number;
  height: number;
}> = ({ scene, index, total, durationInFrames, accent, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tone = ACCENTS[accent] ?? ACCENTS.cyan;
  const isVertical = height > width;
  const isSquare = width === height;

  const enter = spring({
    frame,
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 28,
  });
  const exit = interpolate(
    frame,
    [Math.max(0, durationInFrames - 14), durationInFrames],
    [1, 0],
    clamp
  );
  const opacity = Math.min(enter, exit);
  const rise = (1 - enter) * 64;

  const padding = isSquare ? 92 : isVertical ? 104 : 150;
  const base = isSquare ? 0.92 : isVertical ? 1 : 1.08;
  const headlineLength = scene.headline.length;
  const headlineSize =
    (headlineLength > 46 ? 62 : headlineLength > 32 ? 76 : headlineLength > 20 ? 90 : 106) *
    base;
  const sublineSize = (isVertical ? 38 : 36) * (isVertical ? 1 : 1.05);

  const number = String(index + 1).padStart(2, "0");
  const totalLabel = String(total).padStart(2, "0");

  return (
    <AbsoluteFill>
      <Backdrop
        accent={accent}
        index={index}
        total={total}
        width={width}
        height={height}
      />

      {/* Compteur de scène */}
      <div
        style={{
          position: "absolute",
          top: padding * 0.55,
          right: padding * 0.7,
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontFamily: MONO,
          color: "rgba(226,232,240,0.55)",
          fontSize: 26,
          letterSpacing: 3,
        }}
      >
        <span style={{ color: tone.main }}>{number}</span>
        <span>/ {totalLabel}</span>
      </div>

      {scene.kind === "point" && (
        <div
          style={{
            position: "absolute",
            right: isVertical ? -20 : 60,
            bottom: isVertical ? 60 : 10,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: isVertical ? 520 : 460,
            lineHeight: 0.8,
            color: tone.main,
            opacity: 0.07,
            letterSpacing: -20,
          }}
        >
          {number}
        </div>
      )}

      <AbsoluteFill
        style={{
          padding,
          justifyContent: "center",
          alignItems:
            scene.kind === "quote" || scene.kind === "cta" ? "center" : "flex-start",
          textAlign:
            scene.kind === "quote" || scene.kind === "cta" ? "center" : "left",
          opacity,
          transform: `translateY(${rise}px)`,
        }}
      >
        <div
          style={{
            maxWidth: isSquare || isVertical ? width - padding * 2 : width * 0.68,
            display: "flex",
            flexDirection: "column",
            gap: 28,
            alignItems:
              scene.kind === "quote" || scene.kind === "cta"
                ? "center"
                : "flex-start",
          }}
        >
          {scene.kind === "hook" && <Kicker accent={accent}>{scene.subline || "JARVIS"}</Kicker>}

          {scene.kind === "quote" && (
            <div
              style={{
                fontFamily: FONT,
                fontSize: 120,
                lineHeight: 0.7,
                color: tone.main,
                opacity: 0.8,
              }}
            >
              “
            </div>
          )}

          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: headlineSize,
              lineHeight: 1.02,
              letterSpacing: -2.4,
              color: "#f8fafc",
              textShadow: "0 20px 60px rgba(0,0,0,0.45)",
              fontStyle: scene.kind === "quote" ? "italic" : "normal",
            }}
          >
            {scene.headline}
          </div>

          {scene.subline && scene.kind !== "hook" && (
            <div
              style={{
                fontFamily: FONT,
                fontSize: sublineSize,
                lineHeight: 1.35,
                color: "rgba(203,213,225,0.86)",
                maxWidth: isSquare || isVertical ? width - padding * 2 : width * 0.6,
              }}
            >
              {scene.subline}
            </div>
          )}

          {scene.kind === "cta" && (
            <>
              <div
                style={{
                  width: isVertical ? 220 : 260,
                  height: 3,
                  background: `linear-gradient(90deg, transparent, ${tone.main}, transparent)`,
                  marginTop: 6,
                }}
              />
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 24,
                  letterSpacing: 6,
                  color: "rgba(148,163,184,0.9)",
                  textTransform: "uppercase",
                }}
              >
                Abdourahmane Fall · Capzo
              </div>
            </>
          )}

          {scene.kind !== "hook" && scene.kind !== "cta" && (
            <div
              style={{
                width: 120,
                height: 4,
                borderRadius: 4,
                background: tone.main,
                boxShadow: `0 0 24px ${tone.glow}`,
              }}
            />
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const JarvisVideo: React.FC<JarvisVideoProps> = (props) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = props.accent ?? "cyan";
  const tone = ACCENTS[accent] ?? ACCENTS.cyan;
  const scenes = Array.isArray(props.scenes) ? props.scenes : [];
  const total = scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
  const progress = total > 0 ? interpolate(frame, [0, total], [0, 1], clamp) : 0;

  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#04060d" }}>
      {props.music ? (
        <Audio
          src={staticFile(props.music)}
          volume={props.musicVolume ?? 0.08}
          loop
        />
      ) : null}

      {scenes.map((scene, index) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence
            key={scene.id || `scene-${index}`}
            from={from}
            durationInFrames={scene.durationInFrames}
          >
            <SceneBody
              scene={scene}
              index={index}
              total={scenes.length}
              durationInFrames={scene.durationInFrames}
              accent={accent}
              width={width}
              height={height}
            />
            {scene.audio ? (
              <Sequence from={scene.audioOffsetInFrames ?? 0}>
                <Audio src={staticFile(scene.audio)} volume={1} />
              </Sequence>
            ) : null}
          </Sequence>
        );
      })}

      {/* Bandeau de progression global */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: "rgba(148,163,184,0.16)",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${tone.main}, #6366f1)`,
            boxShadow: `0 0 18px ${tone.glow}`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 28,
          bottom: 26,
          fontFamily: MONO,
          fontSize: 18,
          letterSpacing: 4,
          color: "rgba(148,163,184,0.55)",
          textTransform: "uppercase",
        }}
      >
        {props.kicker || "JARVIS 3.0"}
      </div>
    </AbsoluteFill>
  );
};
