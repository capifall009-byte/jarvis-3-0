import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SCENES } from "./timeline";

export const FONT =
  "'Segoe UI Variable Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const MONO = "'Cascadia Mono', Consolas, 'Courier New', monospace";

export const COLORS = {
  bg: "#05070f",
  text: "#f8fafc",
  muted: "#94a3b8",
  dim: "#64748b",
  cyan: "#22d3ee",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  pink: "#fb7185",
};

export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/** Entrée animée (ressort) : opacité + montée + léger flou. */
export const Reveal: React.FC<{
  delay?: number;
  distance?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay = 0, distance = 46, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - delay;
  const progress = spring({
    frame: Math.max(0, local),
    fps,
    config: { damping: 200, mass: 0.6 },
    durationInFrames: 22,
  });
  const visible = local >= 0;

  return (
    <div
      style={{
        opacity: visible
          ? interpolate(local, [0, 10], [0, 1], clamp)
          : 0,
        transform: `translateY(${visible ? (1 - progress) * distance : distance}px)`,
        willChange: "transform, opacity",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Petit label en pilule. */
export const Chip: React.FC<{
  children: React.ReactNode;
  tone?: "cyan" | "pink" | "neutral";
}> = ({ children, tone = "cyan" }) => {
  const palette = {
    cyan: { fg: COLORS.cyan, bg: "rgba(34, 211, 238, 0.10)", bd: "rgba(34, 211, 238, 0.35)" },
    pink: { fg: COLORS.pink, bg: "rgba(251, 113, 133, 0.10)", bd: "rgba(251, 113, 133, 0.35)" },
    neutral: { fg: "#cbd5e1", bg: "rgba(148, 163, 184, 0.10)", bd: "rgba(148, 163, 184, 0.28)" },
  }[tone];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 26px",
        borderRadius: 999,
        border: `1px solid ${palette.bd}`,
        background: palette.bg,
        color: palette.fg,
        fontFamily: MONO,
        fontSize: 26,
        letterSpacing: 3,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
};

/** Fond : dégradés animés + grille + grain + vignette. */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage: [
            `radial-gradient(circle at ${50 + Math.sin(t * 0.42) * 16}% ${26 + Math.cos(t * 0.31) * 8}%, rgba(34, 211, 238, 0.20), transparent 46%)`,
            `radial-gradient(circle at ${72 + Math.cos(t * 0.36) * 12}% ${72 + Math.sin(t * 0.27) * 10}%, rgba(139, 92, 246, 0.20), transparent 48%)`,
            `radial-gradient(circle at 20% 90%, rgba(59, 130, 246, 0.12), transparent 45%)`,
          ].join(","),
        }}
      />

      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.07) 1px, transparent 1px)",
          backgroundSize: "108px 108px",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 40%, black 12%, transparent 72%)",
          maskImage:
            "radial-gradient(ellipse at 50% 40%, black 12%, transparent 72%)",
        }}
      />

      <AbsoluteFill
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")",
          backgroundSize: "200px 200px",
          opacity: 0.055,
          mixBlendMode: "overlay",
        }}
      />

      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 45%, transparent 38%, rgba(2, 4, 10, 0.72) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** En-tête persistant façon app. */
export const Header: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: 92,
        left: 72,
        right: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            background:
              "conic-gradient(from 120deg, #22d3ee, #3b82f6, #8b5cf6, #22d3ee)",
            boxShadow: "0 0 26px rgba(34, 211, 238, 0.55)",
          }}
        />
        <span
          style={{
            fontFamily: FONT,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 7,
            color: "#e2e8f0",
          }}
        >
          JARVIS
        </span>
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 22,
          letterSpacing: 2,
          color: COLORS.dim,
        }}
      >
        9:16 · 19 s
      </span>
    </div>
  );
};

/** Barres de progression segmentées (style stories). */
export const ProgressBar: React.FC<{ frame: number }> = ({ frame }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 24,
        right: 24,
        height: 6,
        display: "flex",
        gap: 8,
        zIndex: 30,
      }}
    >
      {SCENES.map((scene) => {
        const progress = interpolate(
          frame,
          [scene.from, scene.to],
          [0, 1],
          clamp
        );
        const active = frame >= scene.from;
        return (
          <div
            key={scene.id}
            style={{
              flex: 1,
              borderRadius: 99,
              background: "rgba(226, 232, 240, 0.16)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                background: active
                  ? "linear-gradient(90deg, #22d3ee, #60a5fa)"
                  : "transparent",
                boxShadow: active ? "0 0 16px rgba(34, 211, 238, 0.8)" : "none",
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

/** Cadre de scène : marges sûres + coupe punchy à l'entrée. */
export const SceneShell: React.FC<{
  children: React.ReactNode;
  justify?: "center" | "flex-start" | "flex-end";
  paddingBottom?: number;
}> = ({ children, justify = "center", paddingBottom = 200 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const punch = spring({
    frame,
    fps,
    config: { damping: 26, stiffness: 160, mass: 0.7 },
    durationInFrames: 16,
  });

  return (
    <AbsoluteFill
      style={{
        padding: `210px 84px ${paddingBottom}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: justify,
        transform: `scale(${0.985 + punch * 0.015})`,
        zIndex: 10,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Grand numéro décoratif en contour. */
export const GhostNumber: React.FC<{ value: string }> = ({ value }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 84], [24, -18], clamp);
  return (
    <div
      style={{
        position: "absolute",
        top: 120,
        right: 18,
        fontFamily: FONT,
        fontSize: 300,
        fontWeight: 900,
        lineHeight: 0.8,
        letterSpacing: -12,
        color: "transparent",
        WebkitTextStroke: "2px rgba(34, 211, 238, 0.24)",
        transform: `translateY(${drift}px)`,
        zIndex: 1,
      }}
    >
      {value}
    </div>
  );
};
