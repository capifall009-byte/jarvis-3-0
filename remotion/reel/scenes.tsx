import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Chip,
  COLORS,
  FONT,
  GhostNumber,
  MONO,
  Reveal,
  SceneShell,
  clamp,
} from "./parts";

/* ------------------------------------------------------------------ */
/* 1. Hook                                                             */
/* ------------------------------------------------------------------ */

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const strike = interpolate(frame, [58, 82], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const dim = interpolate(frame, [66, 88], [1, 0.52], clamp);

  return (
    <SceneShell>
      <Reveal delay={2}>
        <Chip>IA · 2026</Chip>
      </Reveal>

      <div style={{ marginTop: 44 }}>
        <Reveal delay={8} distance={60}>
          <div style={styles.h1}>TU UTILISES</div>
        </Reveal>
        <Reveal delay={13} distance={60}>
          <div style={styles.h1}>L’IA COMME UN</div>
        </Reveal>
        <Reveal delay={18} distance={60}>
          <div
            style={{
              ...styles.h1,
              fontSize: 76,
              letterSpacing: -2.4,
              whiteSpace: "nowrap",
              opacity: dim,
              position: "relative",
              display: "inline-block",
              paddingBottom: 8,
            }}
          >
            MOTEUR DE RECHERCHE&nbsp;?
            <div
              style={{
                position: "absolute",
                left: -10,
                top: "50%",
                height: 12,
                width: `${strike * 104}%`,
                background: COLORS.pink,
                borderRadius: 8,
                transform: "rotate(-2.2deg)",
                boxShadow: "0 0 30px rgba(251, 113, 133, 0.55)",
              }}
            />
          </div>
        </Reveal>
      </div>

      <Reveal delay={78} distance={30}>
        <div
          style={{
            marginTop: 64,
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 99,
              background: COLORS.pink,
              boxShadow: `0 0 18px ${COLORS.pink}`,
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 30,
              letterSpacing: 2,
              color: "#cbd5e1",
            }}
          >
            erreur n°1
          </span>
        </div>
      </Reveal>
    </SceneShell>
  );
};

/* ------------------------------------------------------------------ */
/* 2. Le chiffre                                                       */
/* ------------------------------------------------------------------ */

export const ValueScene: React.FC = () => {
  const frame = useCurrentFrame();
  const value = Math.round(
    interpolate(frame, [2, 42], [0, 80], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    })
  );
  const bar = interpolate(frame, [10, 52], [1, 0.2], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <SceneShell>
      <Reveal delay={2}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 26,
            letterSpacing: 5,
            color: COLORS.cyan,
            textTransform: "uppercase",
          }}
        >
          à chaque requête
        </div>
      </Reveal>

      <Reveal delay={6} distance={70}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 18,
            marginTop: 8,
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 320,
              fontWeight: 900,
              lineHeight: 0.92,
              letterSpacing: -14,
              backgroundImage:
                "linear-gradient(180deg, #ecfeff 0%, #22d3ee 52%, #0e7490 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
          <span
            style={{
              fontFamily: FONT,
              fontSize: 150,
              fontWeight: 900,
              color: COLORS.pink,
              lineHeight: 1,
            }}
          >
            %
          </span>
        </div>
      </Reveal>

      <Reveal delay={16}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 62,
            fontWeight: 700,
            letterSpacing: -1.5,
            color: "#e2e8f0",
            marginTop: 4,
          }}
        >
          de sa valeur, perdue.
        </div>
      </Reveal>

      <Reveal delay={26}>
        <div
          style={{
            marginTop: 56,
            height: 12,
            width: 900,
            borderRadius: 99,
            background: "rgba(226, 232, 240, 0.10)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${bar * 100}%`,
              height: "100%",
              borderRadius: 99,
              background: "linear-gradient(90deg, #22d3ee, #fb7185)",
              boxShadow: "0 0 24px rgba(251, 113, 133, 0.5)",
            }}
          />
        </div>
      </Reveal>

      <Reveal delay={34}>
        <div
          style={{
            marginTop: 26,
            fontFamily: MONO,
            fontSize: 26,
            color: COLORS.dim,
            letterSpacing: 1,
          }}
        >
          contexte · outils · mémoire
        </div>
      </Reveal>
    </SceneShell>
  );
};

const styles = {
  h1: {
    fontFamily: FONT,
    fontSize: 96,
    fontWeight: 900,
    letterSpacing: -3,
    lineHeight: 1.02,
    color: COLORS.text,
  } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/* 3-5. Capacités                                                      */
/* ------------------------------------------------------------------ */

const FeatureScene: React.FC<{
  index: string;
  kicker: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ index, kicker, title, subtitle, children }) => {
  return (
    <AbsoluteFill style={{ zIndex: 5 }}>
      <GhostNumber value={index} />
      <SceneShell justify="flex-start" paddingBottom={160}>
        <Reveal delay={2}>
          <Chip>{kicker}</Chip>
        </Reveal>
        <Reveal delay={8} distance={54}>
          <div
            style={{
              ...styles.h1,
              fontSize: 128,
              marginTop: 30,
              lineHeight: 0.95,
            }}
          >
            {title}
          </div>
        </Reveal>
        <Reveal delay={15} distance={30}>
          <div
            style={{
              marginTop: 22,
              fontFamily: FONT,
              fontSize: 38,
              lineHeight: 1.32,
              color: COLORS.muted,
              maxWidth: 760,
            }}
          >
            {subtitle}
          </div>
        </Reveal>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          {children}
        </div>
      </SceneShell>
    </AbsoluteFill>
  );
};

const CodeVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const lines = [
    { text: '› jarvis "site de réservation"', color: "#e2e8f0", delay: 16 },
    { text: "  analyse du besoin…", color: COLORS.dim, delay: 24 },
    { text: "✓ index.html", color: "#34d399", delay: 32 },
    { text: "✓ app.tsx", color: "#34d399", delay: 38 },
    { text: "✓ api.ts", color: "#34d399", delay: 44 },
  ];
  const cursorOn = Math.floor(frame / 10) % 2 === 0;

  return (
    <Reveal delay={20} distance={40} style={{ width: "100%" }}>
      <div
        style={{
          width: "100%",
          borderRadius: 30,
          border: "1px solid rgba(34, 211, 238, 0.22)",
          background: "rgba(6, 14, 27, 0.82)",
          boxShadow: "0 40px 80px rgba(2, 6, 18, 0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "22px 28px",
            borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
          }}
        >
          {["#fb7185", "#fbbf24", "#34d399"].map((color) => (
            <div
              key={color}
              style={{ width: 16, height: 16, borderRadius: 99, background: color, opacity: 0.85 }}
            />
          ))}
          <span
            style={{
              marginLeft: 14,
              fontFamily: MONO,
              fontSize: 22,
              color: COLORS.dim,
              letterSpacing: 1,
            }}
          >
            jarvis — terminal
          </span>
        </div>

        <div style={{ padding: "30px 32px 34px", fontFamily: MONO }}>
          {lines.map((line) => {
            const local = frame - line.delay;
            return (
              <div
                key={line.text}
                style={{
                  fontSize: 30,
                  lineHeight: 1.75,
                  color: line.color,
                  opacity: local >= 0 ? 1 : 0,
                  transform: `translateX(${local >= 0 ? 0 : -14}px)`,
                }}
              >
                {line.text}
              </div>
            );
          })}
          <div
            style={{
              fontSize: 30,
              color: COLORS.cyan,
              opacity: cursorOn ? 1 : 0.1,
            }}
          >
            ▍
          </div>
        </div>
      </div>
    </Reveal>
  );
};

const FilmVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.8 },
    durationInFrames: 30,
  });
  const hue = 190 + Math.sin(frame / 26) * 70;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 396,
          height: 632,
          borderRadius: 46,
          padding: 10,
          background: "linear-gradient(160deg, #1e293b, #0b1220)",
          border: "1px solid rgba(34, 211, 238, 0.3)",
          boxShadow: "0 50px 110px rgba(2, 6, 18, 0.7), 0 0 60px rgba(34, 211, 238, 0.16)",
          transform: `scale(${0.86 + pop * 0.14}) rotate(${(1 - pop) * 4}deg)`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 38,
            overflow: "hidden",
            background: `linear-gradient(${160 + Math.sin(frame / 30) * 40}deg, hsl(${hue} 90% 24%), hsl(${hue + 60} 85% 12%) 55%, #05070f)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(circle at 70% 18%, rgba(255,255,255,0.35), transparent 42%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 26,
              right: 96,
              bottom: 108,
              fontFamily: FONT,
              fontSize: 40,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: -1,
              color: "#fff",
              textShadow: "0 4px 24px rgba(0,0,0,0.55)",
            }}
          >
            généré
            <br />
            par IA
          </div>

          <div
            style={{
              position: "absolute",
              left: 26,
              right: 26,
              bottom: 34,
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              height: 42,
            }}
          >
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${22 + Math.abs(Math.sin(frame / 5 + i * 0.7)) * 74}%`,
                  borderRadius: 6,
                  background: "rgba(255, 255, 255, 0.85)",
                  opacity: 0.85,
                }}
              />
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              right: 18,
              bottom: 150,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              alignItems: "center",
            }}
          >
            {[
              <path
                key="heart"
                d="M26 40c-8-6-14-11-14-18a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 7-6 12-14 18z"
                fill="#fff"
              />,
              <path
                key="comment"
                d="M12 16h28a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H22l-8 6v-6a4 4 0 0 1-2-3.6V20a4 4 0 0 1 0-4z"
                fill="#fff"
              />,
              <path
                key="share"
                d="M16 16 40 32 16 48z"
                fill="#fff"
              />,
            ].map((icon, i) => (
              <div
                key={i}
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 999,
                  background: "rgba(5, 7, 15, 0.42)",
                  border: "1px solid rgba(255, 255, 255, 0.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="34" height="34" viewBox="0 0 52 52">
                  {icon}
                </svg>
              </div>
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              top: 26,
              left: 26,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderRadius: 999,
              background: "rgba(5, 7, 15, 0.55)",
              border: "1px solid rgba(255,255,255,0.24)",
              fontFamily: MONO,
              fontSize: 18,
              color: "#e2e8f0",
              letterSpacing: 1,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 99,
                background: "#fb7185",
              }}
            />
            00:19
          </div>
        </div>
      </div>
    </div>
  );
};

const PublishVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const views = Math.round(
    interpolate(frame, [14, 50], [0, 12400], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    })
  );

  const tiles: Array<{ icon: React.ReactNode; color: string; delay: number }> = [
    {
      color: "#22d3ee",
      delay: 12,
      icon: <polygon points="18,12 44,26 18,40" fill="#06121f" />,
    },
    {
      color: "#fb7185",
      delay: 18,
      icon: (
        <path
          d="M26 40c-8-6-14-11-14-18a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 7-6 12-14 18z"
          fill="#2b0a12"
        />
      ),
    },
    {
      color: "#a78bfa",
      delay: 24,
      icon: (
        <path
          d="M12 16h28a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H22l-8 6v-6a4 4 0 0 1-2-3.6V20a4 4 0 0 1 0-4z"
          fill="#140b2b"
        />
      ),
    },
  ];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
        {tiles.map((tile, i) => {
          const pop = spring({
            frame: Math.max(0, frame - tile.delay),
            fps,
            config: { damping: 13, stiffness: 150, mass: 0.6 },
            durationInFrames: 26,
          });
          return (
            <div
              key={i}
              style={{
                width: 248,
                height: 248,
                borderRadius: 40,
                background: tile.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 24px 60px ${tile.color}44`,
                transform: `scale(${pop})`,
                opacity: pop,
              }}
            >
              <svg width="112" height="112" viewBox="0 0 52 52">
                {tile.icon}
              </svg>
            </div>
          );
        })}
      </div>

      <Reveal delay={34} distance={24}>
        <div style={{ marginTop: 52, textAlign: "center" }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: 96,
              fontWeight: 900,
              letterSpacing: -4,
              color: "#f8fafc",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {(views / 1000).toFixed(1).replace(".", ",")} k
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: MONO,
              fontSize: 26,
              letterSpacing: 3,
              color: COLORS.muted,
            }}
          >
            vues · J+1
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export const CodeScene: React.FC = () => (
  <FeatureScene
    index="01"
    kicker="capacité 01"
    title="Elle code."
    subtitle="Sites, scripts, automatisations — décrits en une phrase."
  >
    <CodeVisual />
  </FeatureScene>
);

export const FilmScene: React.FC = () => (
  <FeatureScene
    index="02"
    kicker="capacité 02"
    title="Elle filme."
    subtitle="Génère la vidéo, la voix et le montage."
  >
    <FilmVisual />
  </FeatureScene>
);

export const PublishScene: React.FC = () => (
  <FeatureScene
    index="03"
    kicker="capacité 03"
    title="Elle publie."
    subtitle="Reels, Shorts, posts — au bon format, au bon moment."
  >
    <PublishVisual />
  </FeatureScene>
);

/* ------------------------------------------------------------------ */
/* 6. CTA                                                              */
/* ------------------------------------------------------------------ */

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin(frame / 11) * 0.02;
  const bob = Math.sin(frame / 9) * 8;

  return (
    <SceneShell>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 54,
        }}
      >
        <div style={{ position: "relative", width: 320, height: 320 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: i * 34,
                borderRadius: 999,
                border: `1px solid rgba(34, 211, 238, ${0.3 - i * 0.07})`,
                transform: `rotate(${frame * (0.5 + i * 0.35)}deg)`,
                borderTopColor: "rgba(139, 92, 246, 0.75)",
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              inset: 92,
              borderRadius: 999,
              background:
                "radial-gradient(circle at 34% 30%, #a5f3fc, #22d3ee 42%, #3b82f6 78%, #312e81)",
              boxShadow: "0 0 90px rgba(34, 211, 238, 0.55)",
            }}
          />
        </div>
      </div>

      <Reveal delay={6} distance={40}>
        <div
          style={{
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 26,
            letterSpacing: 6,
            color: COLORS.cyan,
          }}
        >
          DIS-MOI JUSTE
        </div>
      </Reveal>

      <Reveal delay={11} distance={54}>
        <div
          style={{
            textAlign: "center",
            fontFamily: FONT,
            fontSize: 118,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 0.94,
            marginTop: 22,
            color: COLORS.text,
          }}
        >
          CE QUE
          <br />
          TU VEUX.
        </div>
      </Reveal>

      <Reveal delay={22} distance={30}>
        <div
          style={{
            marginTop: 60,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "28px 54px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #67e8f9, #22d3ee 55%, #3b82f6)",
              color: "#04121a",
              fontFamily: FONT,
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: -0.5,
              transform: `scale(${pulse})`,
              boxShadow: "0 24px 70px rgba(34, 211, 238, 0.45)",
            }}
          >
            Ouvrir JARVIS
            <span style={{ fontSize: 44 }}>→</span>
          </div>
        </div>
      </Reveal>

      <Reveal delay={34} distance={16}>
        <div
          style={{
            marginTop: 46,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            fontFamily: MONO,
            fontSize: 26,
            color: COLORS.muted,
            transform: `translateY(${bob}px)`,
          }}
        >
          lien en bio
          <span style={{ color: COLORS.cyan }}>↑</span>
        </div>
      </Reveal>
    </SceneShell>
  );
};
