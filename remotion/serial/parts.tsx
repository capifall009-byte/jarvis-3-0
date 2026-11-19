import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const SANS = "'Arial Black', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const MONO = "'Cascadia Mono', Consolas, 'Courier New', monospace";

export const WARM = {
  bg: "#0a0604",
  ink: "#fff4e4",
  amber: "#ffb545",
  amberDeep: "#b96a12",
  red: "#ff4d4d",
  cold: "#8fd8ff",
  muted: "#a08b76",
};

export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/* -------------------------------------------------- */
/* Habillage commun                                    */
/* -------------------------------------------------- */

export const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>\")",
      backgroundSize: "170px 170px",
      opacity: 0.07,
      mixBlendMode: "overlay",
    }}
  />
);

export const Vignette: React.FC<{ color?: string }> = ({ color = "rgba(6, 3, 1, 0.88)" }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `radial-gradient(circle at 50% 45%, transparent 30%, ${color} 100%)`,
    }}
  />
);

export const SceneFade: React.FC<{
  children: React.ReactNode;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ children, fadeIn = 9, fadeOut = 8 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fadeInOpacity =
    fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1;
  const fadeOutOpacity =
    fadeOut > 0
      ? interpolate(
          frame,
          [durationInFrames - fadeOut, durationInFrames - 1],
          [1, 0],
          clamp
        )
      : 1;
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeInOpacity, fadeOutOpacity) }}>
      {children}
    </AbsoluteFill>
  );
};

export const Hud: React.FC<{
  top?: number;
  left?: number;
  right?: number;
  children: React.ReactNode;
  color?: string;
  size?: number;
}> = ({ top, left, right, children, color = WARM.amber, size = 21 }) => (
  <div
    style={{
      position: "absolute",
      top,
      left,
      right,
      fontFamily: MONO,
      fontSize: size,
      letterSpacing: 4,
      color,
      opacity: 0.72,
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
}> = ({ text, delay = 14, bottom = 168, size = 46, color = WARM.ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - delay;
  const progress = spring({
    frame: Math.max(0, local),
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 24,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 92,
        right: 92,
        bottom,
        textAlign: "center",
        opacity: local >= 0 ? interpolate(local, [0, 12], [0, 1], clamp) : 0,
        transform: `translateY(${(1 - progress) * 14}px)`,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 600,
          fontSize: size,
          lineHeight: 1.32,
          color,
          textShadow: "0 4px 30px rgba(0,0,0,0.9)",
        }}
      >
        {text}
      </p>
    </div>
  );
};

export const Hairline: React.FC<{
  top: number;
  width?: number;
  color?: string;
}> = ({ top, width = 820, color = "rgba(255,181,69,0.4)" }) => (
  <div
    style={{
      position: "absolute",
      top,
      left: (1080 - width) / 2,
      width,
      height: 1,
      background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
    }}
  />
);

/** Ondes de sonnerie qui s'éloignent du centre. */
export const Ripples: React.FC<{
  cx?: number;
  cy?: number;
  count?: number;
  speed?: number;
  color?: string;
  maxSize?: number;
}> = ({ cx = 540, cy = 880, count = 5, speed = 3.1, color = "rgba(255,181,69,0.45)", maxSize = 1000 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }).map((_, i) => {
        const progress = ((frame * speed + i * (maxSize / count)) % maxSize) / maxSize;
        const size = 90 + progress * maxSize;
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
              border: `2px solid ${color}`,
              opacity: (1 - progress) * 0.85,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Halos lumineux doux. */
export const Glow: React.FC<{
  cx?: number;
  cy?: number;
  size?: number;
  color?: string;
  opacity?: number;
}> = ({ cx = 540, cy = 880, size = 900, color = "rgba(255,150,40,0.28)", opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: cx - size / 2,
      top: cy - size / 2,
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle, ${color} 0%, transparent 68%)`,
      opacity,
    }}
  />
);

/** Silhouette de téléphone, écran allumé. */
export const Phone: React.FC<{
  top?: number;
  scale?: number;
  screen?: React.ReactNode;
  glow?: string;
}> = ({ top = 470, scale = 1, screen, glow = "rgba(255,181,69,0.35)" }) => {
  const frame = useCurrentFrame();
  const breathe = 0.9 + 0.1 * Math.sin(frame * 0.18);
  return (
    <div
      style={{
        position: "absolute",
        left: 540 - 210 * scale,
        top,
        width: 420 * scale,
        height: 780 * scale,
        transform: `scale(${breathe})`,
        transformOrigin: "center center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -30 * scale,
          borderRadius: 78 * scale,
          background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 62 * scale,
          background: "linear-gradient(160deg, #2b2119, #0c0805 60%)",
          border: "3px solid rgba(255,220,180,0.28)",
          boxShadow: "0 30px 100px rgba(0,0,0,0.85), inset 0 0 0 2px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 18 * scale,
            transform: "translateX(-50%)",
            width: 120 * scale,
            height: 24 * scale,
            borderRadius: 20,
            background: "#050302",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 26 * scale,
            right: 26 * scale,
            top: 74 * scale,
            bottom: 40 * scale,
            borderRadius: 30 * scale,
            background: "linear-gradient(180deg, rgba(60,38,18,0.96), rgba(14,8,4,0.98))",
            border: "1px solid rgba(255,190,110,0.18)",
            padding: 28 * scale,
            boxSizing: "border-box",
          }}
        >
          {screen}
        </div>
      </div>
    </div>
  );
};

/** Bulle de message. */
export const Bubble: React.FC<{
  text: string;
  cold?: boolean;
  width?: number;
  fontSize?: number;
}> = ({ text, cold = false, width = 720, fontSize = 44 }) => (
  <div
    style={{
      width,
      padding: "34px 40px",
      borderRadius: 34,
      background: cold
        ? "linear-gradient(145deg, rgba(18,44,64,0.96), rgba(8,20,32,0.98))"
        : "linear-gradient(145deg, rgba(74,45,16,0.96), rgba(28,16,6,0.98))",
      border: `2px solid ${cold ? "rgba(143,216,255,0.45)" : "rgba(255,181,69,0.45)"}`,
      boxShadow: cold
        ? "0 20px 70px rgba(0,0,0,0.7), 0 0 50px rgba(80,180,255,0.15)"
        : "0 20px 70px rgba(0,0,0,0.7), 0 0 50px rgba(255,150,40,0.15)",
      fontFamily: SANS,
      fontSize,
      lineHeight: 1.18,
      letterSpacing: 1,
      color: cold ? WARM.cold : WARM.amber,
      textAlign: "center",
    }}
  >
    {text}
  </div>
);

/** Tampon « JOUR 1 ». */
export const JourStamp: React.FC<{ top?: number; label?: string; color?: string }> = ({
  top = 220,
  label = "JOUR 1",
  color = WARM.amber,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 14, mass: 0.8 }, durationInFrames: 30 });
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: SANS,
        fontSize: 76,
        letterSpacing: 12,
        color,
        opacity: interpolate(frame, [0, 8], [0, 1], clamp),
        transform: `scale(${0.7 + p * 0.3}) rotate(${(1 - p) * -4}deg)`,
        textShadow: `0 0 70px ${color}66`,
      }}
    >
      {label}
    </div>
  );
};

/** Porte avec lumière dessous et silhouette derrière le verre. */
export const Doorway: React.FC<{ figure?: boolean; alarm?: boolean }> = ({
  figure = false,
  alarm = false,
}) => {
  const frame = useCurrentFrame();
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.13));
  const light = alarm ? WARM.red : WARM.amber;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 290,
          top: 340,
          width: 500,
          height: 1080,
          borderRadius: "250px 250px 0 0",
          background: "linear-gradient(180deg, #150d07, #080503)",
          border: "4px solid rgba(255,190,110,0.18)",
          boxShadow: "0 0 120px rgba(0,0,0,0.9)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 40,
            right: 40,
            top: 60,
            bottom: 120,
            borderRadius: "210px 210px 0 0",
            background: `radial-gradient(ellipse at 50% 90%, ${light}22, transparent 70%)`,
          }}
        />
        {figure ? (
          <div
            style={{
              position: "absolute",
              left: 205,
              top: 430,
              width: 100,
              height: 340,
              borderRadius: "50px 50px 12px 12px",
              background: "rgba(0,0,0,0.78)",
              opacity: 0.55 + 0.25 * Math.sin(frame * 0.09),
              filter: "blur(3px)",
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 240,
          top: 1410,
          width: 600,
          height: 34,
          borderRadius: 20,
          background: light,
          opacity: pulse,
          boxShadow: `0 0 90px 26px ${light}88`,
        }}
      />
    </AbsoluteFill>
  );
};
