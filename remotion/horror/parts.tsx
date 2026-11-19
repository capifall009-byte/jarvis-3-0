import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const MONO = "'Cascadia Mono', Consolas, 'Courier New', monospace";
export const SANS = "'Arial Black', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const BLOOD = {
  black: "#030303",
  ink: "#e8e4de",
  red: "#d81f26",
  redDim: "#7a1418",
  grey: "#8f8b86",
  cold: "#9ec9d6",
};

export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/* -------------------------------------------------- */
/* Texture caméra                                      */
/* -------------------------------------------------- */

/** Grain animé, plus sale que d'habitude. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.14 }) => {
  const frame = useCurrentFrame();
  const x = (frame * 37) % 170;
  const y = (frame * 53) % 170;
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='170' height='170'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/></filter><rect width='170' height='170' filter='url(%23n)'/></svg>\")",
        backgroundSize: "170px 170px",
        backgroundPosition: `${x}px ${y}px`,
        opacity,
        mixBlendMode: "overlay",
      }}
    />
  );
};

export const Scanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(0,0,0,0.42) 0px, rgba(0,0,0,0.42) 2px, transparent 2px, transparent 5px)",
      opacity: 0.35,
    }}
  />
);

export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "radial-gradient(circle at 50% 48%, transparent 24%, rgba(0,0,0,0.7) 72%, rgba(0,0,0,0.97) 100%)",
    }}
  />
);

/** Secousse de caméra portée à la main. */
export const Handheld: React.FC<{ children: React.ReactNode; amount?: number }> = ({
  children,
  amount = 1,
}) => {
  const frame = useCurrentFrame();
  const jitterX = Math.sin(frame * 1.7) * 3.2 * amount + Math.sin(frame * 0.43) * 4 * amount;
  const jitterY = Math.cos(frame * 2.3) * 2.6 * amount + Math.cos(frame * 0.61) * 3 * amount;
  const roll = Math.sin(frame * 0.9) * 0.42 * amount;
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${jitterX}px, ${jitterY}px) rotate(${roll}deg) scale(1.04)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Fondu de scène, sûr même avec fadeOut à 0. */
export const SceneFade: React.FC<{
  children: React.ReactNode;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ children, fadeIn = 7, fadeOut = 7 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inOpacity = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1;
  const outOpacity =
    fadeOut > 0
      ? interpolate(
          frame,
          [durationInFrames - fadeOut, durationInFrames - 1],
          [1, 0],
          clamp
        )
      : 1;
  return <AbsoluteFill style={{ opacity: Math.min(inOpacity, outOpacity) }}>{children}</AbsoluteFill>;
};

/* -------------------------------------------------- */
/* Habillage caméra                                    */
/* -------------------------------------------------- */

export const RecHud: React.FC<{ seconds?: number; label?: string }> = ({
  seconds = 0,
  label = "CAM 01",
}) => {
  const frame = useCurrentFrame();
  const blink = frame % 30 < 18 ? 1 : 0.15;
  const tc = seconds + frame / 30;
  const mm = String(Math.floor(tc / 60)).padStart(2, "0");
  const ss = String(Math.floor(tc % 60)).padStart(2, "0");
  const ff = String(Math.floor((tc % 1) * 30)).padStart(2, "0");
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 104,
          left: 88,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: MONO,
          fontSize: 26,
          letterSpacing: 4,
          color: BLOOD.ink,
          opacity: 0.85,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 99,
            background: BLOOD.red,
            opacity: blink,
            boxShadow: `0 0 20px ${BLOOD.red}`,
          }}
        />
        REC
      </div>
      <div
        style={{
          position: "absolute",
          top: 104,
          right: 88,
          fontFamily: MONO,
          fontSize: 26,
          letterSpacing: 3,
          color: BLOOD.ink,
          opacity: 0.7,
        }}
      >
        {mm}:{ss}:{ff}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 96,
          left: 88,
          fontFamily: MONO,
          fontSize: 22,
          letterSpacing: 5,
          color: BLOOD.grey,
          opacity: 0.65,
        }}
      >
        {label}
      </div>
      {/* Coin de viseur */}
      <div style={{ position: "absolute", top: 154, left: 88, width: 46, height: 46, borderLeft: "2px solid rgba(255,255,255,0.35)", borderTop: "2px solid rgba(255,255,255,0.35)" }} />
      <div style={{ position: "absolute", top: 154, right: 88, width: 46, height: 46, borderRight: "2px solid rgba(255,255,255,0.35)", borderTop: "2px solid rgba(255,255,255,0.35)" }} />
      <div style={{ position: "absolute", bottom: 150, left: 88, width: 46, height: 46, borderLeft: "2px solid rgba(255,255,255,0.35)", borderBottom: "2px solid rgba(255,255,255,0.35)" }} />
      <div style={{ position: "absolute", bottom: 150, right: 88, width: 46, height: 46, borderRight: "2px solid rgba(255,255,255,0.35)", borderBottom: "2px solid rgba(255,255,255,0.35)" }} />
    </>
  );
};

/** Sous-titre en bas, police machine à écrire. */
export const JournalText: React.FC<{
  text: string;
  delay?: number;
  bottom?: number;
  size?: number;
  color?: string;
}> = ({ text, delay = 14, bottom = 210, size = 44, color = BLOOD.ink }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - delay;
  const progress = spring({
    frame: Math.max(0, local),
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 22,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        bottom,
        textAlign: "center",
        opacity: local >= 0 ? interpolate(local, [0, 11], [0, 1], clamp) : 0,
        transform: `translateY(${(1 - progress) * 12}px)`,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: MONO,
          fontSize: size,
          lineHeight: 1.35,
          color,
          textShadow: "0 3px 20px #000, 0 0 40px rgba(0,0,0,0.9)",
        }}
      >
        {text}
      </p>
    </div>
  );
};

/** Texte rouge qui bugge légèrement. */
export const GlitchText: React.FC<{
  text: string;
  top: number;
  size?: number;
  color?: string;
}> = ({ text, top, size = 80, color = BLOOD.red }) => {
  const frame = useCurrentFrame();
  const glitch = frame % 43 < 4 ? (frame % 2 ? 8 : -6) : 0;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 60,
        right: 60,
        textAlign: "center",
        fontFamily: SANS,
        fontSize: size,
        lineHeight: 1.14,
        letterSpacing: 2,
        color,
        transform: `translateX(${glitch}px)`,
        textShadow: `3px 0 0 rgba(0,180,255,0.35), -3px 0 0 rgba(255,0,60,0.35), 0 0 60px rgba(216,31,38,0.5)`,
      }}
    >
      {text}
    </div>
  );
};

/** Faisceau de lampe torche qui balaie. */
export const Flashlight: React.FC<{ cy?: number; speed?: number }> = ({
  cy = 900,
  speed = 0.035,
}) => {
  const frame = useCurrentFrame();
  const x = 540 + Math.sin(frame * speed) * 320;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 420,
        top: cy - 520,
        width: 840,
        height: 1040,
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse at 50% 45%, rgba(235,235,220,0.22) 0%, rgba(200,200,190,0.08) 42%, transparent 70%)",
        filter: "blur(18px)",
      }}
    />
  );
};

/** Silhouette floue, debout. */
export const Figure: React.FC<{ left?: number; top?: number; scale?: number }> = ({
  left = 470,
  top = 620,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const sway = Math.sin(frame * 0.06) * 6 * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: left + sway,
        top,
        width: 150 * scale,
        height: 430 * scale,
        borderRadius: "75px 75px 14px 14px",
        background: "rgba(0,0,0,0.92)",
        filter: "blur(5px)",
        boxShadow: "0 0 70px 20px rgba(0,0,0,0.8)",
      }}
    />
  );
};

/** Couloir en perspective. */
export const Corridor: React.FC = () => (
  <AbsoluteFill>
    <div
      style={{
        position: "absolute",
        left: 150,
        top: 300,
        width: 780,
        height: 1300,
        background: "linear-gradient(180deg, #0b0b0b, #050505)",
        clipPath: "polygon(30% 0, 70% 0, 100% 100%, 0% 100%)",
        borderLeft: "2px solid rgba(255,255,255,0.07)",
        borderRight: "2px solid rgba(255,255,255,0.07)",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 430,
        top: 300,
        width: 220,
        height: 1300,
        background: "linear-gradient(180deg, #141414, #080808)",
        clipPath: "polygon(12% 0, 88% 0, 100% 100%, 0% 100%)",
      }}
    />
  </AbsoluteFill>
);

/** Porte entrouverte avec bande de lumière. */
export const Door: React.FC<{ alarm?: boolean }> = ({ alarm = false }) => {
  const frame = useCurrentFrame();
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(frame * 0.11));
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 260,
          top: 380,
          width: 560,
          height: 1180,
          background: "linear-gradient(100deg, #0a0a0a 0%, #111 62%, #050505 63%)",
          border: "3px solid rgba(255,255,255,0.08)",
          boxShadow: "inset 0 0 120px rgba(0,0,0,0.9)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 820,
          top: 390,
          width: 26,
          height: 1170,
          background: alarm ? BLOOD.red : "#cfcabf",
          opacity: pulse,
          boxShadow: `0 0 60px 14px ${alarm ? "rgba(216,31,38,0.5)" : "rgba(220,215,200,0.35)"}`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Onde de cri / pas. */
export const Waveform: React.FC<{ color?: string; height?: number }> = ({
  color = BLOOD.red,
  height = 420,
}) => {
  const frame = useCurrentFrame();
  const bars = 56;
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 640,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 3,
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const wave = Math.abs(Math.sin(i * 0.55 + frame * 0.22)) * Math.abs(Math.sin(i * 0.13 + frame * 0.07));
        const h = 12 + wave * height;
        return (
          <div
            key={i}
            style={{
              width: 8,
              height: h,
              background: color,
              opacity: 0.35 + wave * 0.65,
              boxShadow: `0 0 18px ${color}66`,
            }}
          />
        );
      })}
    </div>
  );
};
