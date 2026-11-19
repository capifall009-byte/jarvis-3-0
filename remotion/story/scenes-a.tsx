import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Grain,
  Hairline,
  Hud,
  MONO,
  NIGHT,
  Rings,
  SERIF,
  SceneFade,
  Stars,
  Subtitle,
  Vignette,
  clamp,
} from "./parts";

/* ================================================================== */
/* 1 — 2089                                                            */
/* ================================================================== */

export const Scene2089: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 200, mass: 0.8 },
    durationInFrames: 44,
  });
  const drift = interpolate(frame, [0, 180], [0, -70], clamp);

  return (
    <SceneFade fadeIn={18} fadeOut={10}>
      <AbsoluteFill style={{ backgroundColor: NIGHT.bg }} />
      <Stars opacity={0.85} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 72%, rgba(9,60,96,0.55), transparent 62%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: -780 + drift,
          width: 1500,
          height: 1500,
          marginLeft: -750,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 8%, #0b3a5c 0%, #061a2b 42%, #02050b 72%)",
          boxShadow: "0 -40px 150px rgba(34, 211, 238, 0.16)",
        }}
      />

      <Hud top={132} left={84}>
        Archive terrestre // 2089
      </Hud>
      <Hud top={132} right={84} color={NIGHT.muted}>
        secteur 07
      </Hud>

      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", paddingBottom: 240 }}
      >
        <div
          style={{
            textAlign: "center",
            opacity: title,
            transform: `translateY(${(1 - title) * 28}px)`,
          }}
        >
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 268,
              lineHeight: 0.9,
              letterSpacing: 8,
              color: "#eaf6ff",
              textShadow: "0 0 100px rgba(103,232,249,0.35)",
            }}
          >
            2089
          </div>
          <div
            style={{
              marginTop: 36,
              fontFamily: MONO,
              fontSize: 24,
              letterSpacing: 10,
              color: NIGHT.cyan,
              opacity: 0.8,
            }}
          >
            FIN DE L’ÈRE DU BRUIT
          </div>
        </div>
      </AbsoluteFill>

      <Subtitle text="La Terre a cessé d’écouter." delay={22} />
      <Grain />
      <Vignette />
    </SceneFade>
  );
};

/* ================================================================== */
/* 2 — L'antenne                                                       */
/* ================================================================== */

export const SceneAntenna: React.FC = () => {
  const frame = useCurrentFrame();
  const sweep = frame * 0.9;
  const pulse = 0.55 + 0.45 * Math.sin(frame / 14);

  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: NIGHT.bg }} />
      <Stars opacity={0.6} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 58%, rgba(12,74,110,0.45), transparent 58%)",
        }}
      />

      {/* Radar */}
      <div
        style={{
          position: "absolute",
          left: 540 - 460,
          top: 980 - 460,
          width: 920,
          height: 920,
          borderRadius: "50%",
          background: `conic-gradient(from ${sweep}deg, rgba(34,211,238,0.16), rgba(34,211,238,0.015) 32deg, transparent 58deg)`,
          opacity: 0.42,
          filter: "blur(9px)",
        }}
      />
      <Rings cx={540} cy={980} count={4} speed={0.7} color="rgba(103,232,249,0.16)" maxSize={880} />

      <Hud top={132} left={84}>
        Station 07 // veille
      </Hud>
      <Hud top={132} right={84} color={NIGHT.muted}>
        1420.4 MHz
      </Hud>

      <svg
        viewBox="0 0 600 640"
        style={{ position: "absolute", left: 240, bottom: 470, width: 600, height: 640 }}
      >
        <ellipse
          cx="300"
          cy="614"
          rx="130"
          ry="20"
          fill="#061624"
          stroke="rgba(103,232,249,0.30)"
          strokeWidth="2"
        />
        <rect
          x="292"
          y="330"
          width="16"
          height="280"
          fill="#081c2c"
          stroke="rgba(103,232,249,0.40)"
          strokeWidth="2"
        />
        <g transform="rotate(-24 300 280)">
          <ellipse
            cx="300"
            cy="280"
            rx="162"
            ry="64"
            fill="rgba(34,211,238,0.07)"
            stroke="rgba(125,211,252,0.80)"
            strokeWidth="3"
          />
          <ellipse
            cx="300"
            cy="280"
            rx="120"
            ry="42"
            fill="none"
            stroke="rgba(103,232,249,0.22)"
            strokeWidth="1.5"
            strokeDasharray="8 10"
          />
        </g>
        <line
          x1="300"
          y1="286"
          x2="196"
          y2="170"
          stroke="rgba(103,232,249,0.65)"
          strokeWidth="3"
        />
        <circle cx="196" cy="170" r="8" fill="#67e8f9" opacity={pulse} />
        <circle cx="196" cy="170" r="20" fill="none" stroke="rgba(103,232,249,0.35)" strokeWidth="1.5" />
      </svg>

      <Hairline top={1500} width={560} />
      <Subtitle text="Une seule antenne veillait encore." delay={20} />
      <Grain />
      <Vignette />
    </SceneFade>
  );
};

/* ================================================================== */
/* 3 — Trois secondes                                                  */
/* ================================================================== */

const BARS = Array.from({ length: 52 }, (_, i) => {
  const n = Math.abs(Math.sin(i * 12.9898 + 4.1414) * 43758.5453) % 1;
  return 0.22 + n * 0.78;
});

export const SceneThreeSeconds: React.FC = () => {
  const frame = useCurrentFrame();
  const seconds = interpolate(frame, [12, 110], [0, 3], clamp);

  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: NIGHT.bg }} />
      <Stars opacity={0.35} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 46%, rgba(8,60,90,0.55), transparent 62%)",
        }}
      />

      <Hud top={132} left={84}>
        Signal entrant
      </Hud>
      <Hud top={132} right={84} color={NIGHT.alert}>
        <span style={{ opacity: 0.45 + 0.55 * (Math.floor(frame / 12) % 2) }}>●</span> rec
      </Hud>

      <div style={{ position: "absolute", top: 470, left: 0, right: 0, textAlign: "center" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 168,
            letterSpacing: 2,
            color: "#f0f9ff",
            textShadow: "0 0 70px rgba(103,232,249,0.45)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {seconds.toFixed(2)}
          <span style={{ fontSize: 74, color: NIGHT.cyan, marginLeft: 18 }}>s</span>
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: MONO,
            fontSize: 22,
            letterSpacing: 7,
            color: NIGHT.muted,
          }}
        >
          DURÉE DU SIGNAL
        </div>
      </div>

      {/* Waveform */}
      <div
        style={{
          position: "absolute",
          top: 840,
          left: 96,
          right: 96,
          height: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {BARS.map((height, i) => {
          const wobble = height * (0.24 + 0.76 * Math.abs(Math.sin(frame / 5.4 + i * 0.6)));
          return (
            <div
              key={i}
              style={{
                width: 8,
                height: Math.max(26, 34 + wobble * 268),
                borderRadius: 4,
                background:
                  i % 7 === 0
                    ? "linear-gradient(180deg, #ffffff, #67e8f9)"
                    : "linear-gradient(180deg, rgba(103,232,249,0.95), rgba(8,145,178,0.55))",
                boxShadow: "0 0 14px rgba(34,211,238,0.35)",
              }}
            />
          );
        })}
      </div>

      <Hairline top={1240} width={620} opacity={0.5} />
      <Subtitle text="Chaque nuit, trois secondes." delay={22} />
      <Grain />
      <Vignette />
    </SceneFade>
  );
};

/* ================================================================== */
/* 4 — Personne ne la croyait                                          */
/* ================================================================== */

const MONITORS = [
  { label: "CANAL 01", state: "aucune donnée" },
  { label: "CANAL 02", state: "aucune donnée" },
  { label: "CANAL 03", state: "aucune donnée" },
  { label: "CANAL 07", state: "signal non confirmé", alert: true },
  { label: "CANAL 04", state: "aucune donnée" },
  { label: "CANAL 05", state: "aucune donnée" },
];

export const SceneDoubt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamp = spring({
    frame: Math.max(0, frame - 56),
    fps,
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 26,
  });

  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: NIGHT.bg }} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 40%, rgba(30,41,59,0.55), transparent 65%)",
        }}
      />

      <Hud top={132} left={84}>
        Commission d’écoute
      </Hud>
      <Hud top={132} right={84} color={NIGHT.muted}>
        séance 114
      </Hud>

      <div
        style={{
          position: "absolute",
          top: 420,
          left: 96,
          right: 96,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
        }}
      >
        {MONITORS.map((monitor, i) => {
          const pop = spring({
            frame: Math.max(0, frame - 14 - i * 6),
            fps,
            config: { damping: 200, mass: 0.7 },
            durationInFrames: 24,
          });
          const alert = Boolean(monitor.alert);
          return (
            <div
              key={monitor.label}
              style={{
                height: 208,
                borderRadius: 18,
                border: `1.5px solid ${alert ? "rgba(251,113,133,0.65)" : "rgba(148,163,184,0.18)"}`,
                background: alert ? "rgba(60,10,20,0.35)" : "rgba(8,15,26,0.7)",
                padding: "20px 22px",
                opacity: pop,
                transform: `translateY(${(1 - pop) * 26}px)`,
                boxShadow: alert ? "0 0 40px rgba(251,113,133,0.22)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: MONO,
                  fontSize: 18,
                  letterSpacing: 2,
                  color: alert ? NIGHT.alert : "#64748b",
                }}
              >
                <span>{monitor.label}</span>
                <span>{alert ? "⚠" : "—"}</span>
              </div>
              <svg width="100%" height="76" style={{ marginTop: 18 }}>
                <line
                  x1="0"
                  y1="38"
                  x2="100%"
                  y2="38"
                  stroke={alert ? "rgba(251,113,133,0.55)" : "rgba(148,163,184,0.25)"}
                  strokeWidth="1.5"
                  strokeDasharray={alert ? "none" : "5 7"}
                />
              </svg>
              <div
                style={{
                  marginTop: 12,
                  fontFamily: MONO,
                  fontSize: 16,
                  letterSpacing: 1.6,
                  color: alert ? "rgba(251,113,133,0.9)" : "#475569",
                }}
              >
                {monitor.state}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tampon « NON CONFIRMÉ » */}
      <div
        style={{
          position: "absolute",
          top: 1210,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: stamp,
          transform: `rotate(-7deg) scale(${0.9 + stamp * 0.1})`,
        }}
      >
        <div
          style={{
            border: "5px solid rgba(251,113,133,0.9)",
            borderRadius: 10,
            padding: "16px 44px 12px",
            fontFamily: MONO,
            fontSize: 62,
            letterSpacing: 10,
            color: "rgba(251,113,133,0.96)",
            textShadow: "0 0 34px rgba(251,113,133,0.4)",
            boxShadow: "0 0 70px rgba(251,113,133,0.16) inset",
          }}
        >
          NON CONFIRMÉ
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 1452,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: MONO,
          fontSize: 20,
          letterSpacing: 7,
          color: "#64748b",
          opacity: stamp,
        }}
      >
        AUCUNE PREUVE MATÉRIELLE
      </div>

      <Hairline top={1540} width={480} color="rgba(251,113,133,0.28)" opacity={0.7} />
      <Subtitle text="Personne ne la croyait." delay={24} bottom={120} />
      <Grain />
      <Vignette />
    </SceneFade>
  );
};
