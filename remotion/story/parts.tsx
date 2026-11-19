import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const SERIF = "Georgia, 'Times New Roman', serif";
export const MONO = "'Cascadia Mono', Consolas, monospace";
export const SANS = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const NIGHT = {
  bg: "#03060d",
  ice: "#dbeafe",
  cyan: "#67e8f9",
  cyanDeep: "#0891b2",
  muted: "#7c8fa6",
  alert: "#fb7185",
  warm: "#fbbf24",
};

export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/* -------------------------------------------------- */
/* Fond commun : étoiles, grain, vignette              */
/* -------------------------------------------------- */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(2089);
const STARS = Array.from({ length: 170 }, () => ({
  x: random() * 100,
  y: random() * 100,
  r: 0.7 + random() * 1.9,
  phase: random() * Math.PI * 2,
  speed: 0.03 + random() * 0.11,
  depth: 0.25 + random() * 0.75,
}));

export const Stars: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity }}>
      {STARS.map((star, i) => {
        const twinkle = 0.35 + 0.55 * Math.abs(Math.sin(frame * star.speed + star.phase));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y - frame * 0.002 * star.depth}%`,
              width: star.r * 2,
              height: star.r * 2,
              borderRadius: 99,
              background: "#e0f2fe",
              opacity: twinkle,
              boxShadow:
                star.r > 2 ? "0 0 8px rgba(224,242,254,0.8)" : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>\")",
      backgroundSize: "180px 180px",
      opacity: 0.05,
      mixBlendMode: "overlay",
    }}
  />
);

export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "radial-gradient(circle at 50% 46%, transparent 34%, rgba(2, 4, 10, 0.82) 100%)",
    }}
  />
);

/* -------------------------------------------------- */
/* Habillage                                           */
/* -------------------------------------------------- */

export const SceneFade: React.FC<{
  children: React.ReactNode;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ children, fadeIn = 10, fadeOut = 8 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fadeInOpacity =
    fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1;
  const fadeOutOpacity =
    fadeOut > 0
      ? interpolate(frame, [durationInFrames - fadeOut, durationInFrames - 1], [1, 0], clamp)
      : 1;
  const opacity = Math.min(fadeInOpacity, fadeOutOpacity);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Hud: React.FC<{
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  children: React.ReactNode;
  color?: string;
}> = ({ top, left, right, bottom, children, color = NIGHT.cyan }) => (
  <div
    style={{
      position: "absolute",
      top,
      left,
      right,
      bottom,
      fontFamily: MONO,
      fontSize: 22,
      letterSpacing: 3.5,
      color,
      opacity: 0.75,
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

export const Subtitle: React.FC<{
  text: string;
  delay?: number;
  bottom?: number;
  size?: number;
  color?: string;
}> = ({ text, delay = 16, bottom = 176, size = 46, color = NIGHT.ice }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - delay;
  const progress = spring({
    frame: Math.max(0, local),
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 26,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        right: 96,
        bottom,
        textAlign: "center",
        opacity: local >= 0 ? interpolate(local, [0, 14], [0, 1], clamp) : 0,
        transform: `translateY(${(1 - progress) * 16}px)`,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: SERIF,
          fontSize: size,
          lineHeight: 1.34,
          color,
          textShadow: "0 4px 32px rgba(0, 0, 0, 0.85)",
        }}
      >
        {text}
      </p>
    </div>
  );
};

/** Ligne lumineuse horizontale décorative. */
export const Hairline: React.FC<{
  top: number;
  width?: number;
  color?: string;
  opacity?: number;
}> = ({ top, width = 760, color = "rgba(103,232,249,0.4)", opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      top,
      left: (1080 - width) / 2,
      width,
      height: 1,
      background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
      opacity,
    }}
  />
);

/** Anneaux concentriques animés. */
export const Rings: React.FC<{
  cx?: number;
  cy?: number;
  count?: number;
  speed?: number;
  color?: string;
  maxSize?: number;
}> = ({
  cx = 540,
  cy = 900,
  count = 6,
  speed = 2.2,
  color = "rgba(103,232,249,0.35)",
  maxSize = 1100,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }).map((_, i) => {
        const progress = ((frame * speed + i * 90) % maxSize) / maxSize;
        const size = 80 + progress * maxSize;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx - size / 2,
              top: cy - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              border: `1.5px solid ${color}`,
              opacity: (1 - progress) * 0.9,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
