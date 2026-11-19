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
/* 5 — Elle répondit                                                   */
/* ================================================================== */

const TRANSMISSION = "NOUS SOMMES LÀ.";

export const SceneAnswer: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = Math.floor(interpolate(frame, [34, 34 + TRANSMISSION.length * 3], [0, TRANSMISSION.length], clamp));
  const flash = interpolate(frame, [30, 34, 38], [0, 0.34, 0], clamp);

  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: NIGHT.bg }} />
      <Stars opacity={0.25} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 47%, rgba(34,211,238,0.18), transparent 46%)",
        }}
      />
      <Rings cy={900} count={7} speed={1.8} color="rgba(103,232,249,0.22)" maxSize={1200} />

      <Hud top={132} left={84}>
        Canal sortant
      </Hud>
      <Hud top={132} right={84} color={NIGHT.muted}>
        verrou levé
      </Hud>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: 260 }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 20,
              letterSpacing: 8,
              color: NIGHT.cyan,
              opacity: 0.75,
              marginBottom: 34,
            }}
          >
            TRANSMISSION
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 62,
              letterSpacing: 4,
              color: "#f0f9ff",
              textShadow: "0 0 60px rgba(103,232,249,0.5)",
              whiteSpace: "nowrap",
            }}
          >
            {TRANSMISSION.slice(0, typed)}
            <span
              style={{
                display: "inline-block",
                width: 26,
                height: 62,
                marginLeft: 10,
                verticalAlign: "text-bottom",
                background: NIGHT.cyan,
                opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0.05,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 40,
              fontFamily: MONO,
              fontSize: 19,
              letterSpacing: 5,
              color: NIGHT.muted,
            }}
          >
            ⟶ 1420.4 MHz · 3.00 s · 1 destinataire
          </div>
        </div>
      </AbsoluteFill>

      <Subtitle text="Alors, une nuit, elle répondit." delay={20} />
      <AbsoluteFill style={{ backgroundColor: "#dff8ff", opacity: flash }} />
      <Grain />
      <Vignette />
    </SceneFade>
  );
};

/* ================================================================== */
/* 6 — Le silence                                                      */
/* ================================================================== */

export const SceneSilence: React.FC = () => {
  const frame = useCurrentFrame();
  const elapsed = interpolate(frame, [0, 180], [252, 264], clamp); // 04:12 → 04:24
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  const glitch = Math.sin(frame * 0.9) > 0.97 ? 0.08 : 0;
  const breath = 0.55 + 0.25 * Math.sin(frame / 22);
  const dotOpacity = Math.floor(frame / 20) % 2 === 0 ? 1 : 0.15;

  return (
    <SceneFade fadeIn={14} fadeOut={10}>
      <AbsoluteFill style={{ backgroundColor: "#02040a" }} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(12,20,34,0.9), #010205 70%)",
        }}
      />

      <Hud top={132} left={84} color={NIGHT.muted}>
        t+ 00:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </Hud>
      <Hud top={132} right={84} color={NIGHT.muted}>
        aucun retour
      </Hud>

      <div
        style={{
          position: "absolute",
          top: 890,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: MONO,
          fontSize: 30,
          letterSpacing: 22,
          color: "#334155",
          opacity: breath,
        }}
      >
        SILENCE
      </div>

      <svg
        style={{ position: "absolute", top: 960, left: 0, width: 1080, height: 120 }}
        viewBox="0 0 1080 120"
      >
        <line
          x1="0"
          y1="60"
          x2="1080"
          y2="60"
          stroke="rgba(103,232,249,0.28)"
          strokeWidth="1.5"
        />
        <circle
          cx={interpolate(frame, [0, 180], [40, 1040], clamp)}
          cy="60"
          r="5"
          fill="#67e8f9"
          opacity={dotOpacity}
        />
      </svg>

      <Subtitle text="Le silence dura longtemps." delay={24} color="#cbd5e1" />
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: glitch }} />
      <Grain />
      <Vignette />
    </SceneFade>
  );
};

/* ================================================================== */
/* 7 — Quatre secondes                                                 */
/* ================================================================== */

const BURST = Array.from({ length: 64 }, (_, i) => {
  const n = Math.abs(Math.sin(i * 7.312 + 1.77) * 9137.13) % 1;
  return 0.18 + n * 0.82;
});

export const SceneFourSeconds: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = interpolate(frame, [0, 3, 22], [0.9, 0.55, 0], clamp);
  const pop = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.9 },
    durationInFrames: 26,
  });

  return (
    <SceneFade fadeIn={4}>
      <AbsoluteFill style={{ backgroundColor: "#04121f" }} />
      <Rings cy={930} count={8} speed={4.2} color="rgba(255,255,255,0.32)" maxSize={1400} />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 48%, rgba(255,255,255,0.22), rgba(34,211,238,0.10) 34%, transparent 62%)",
        }}
      />

      <Hud top={132} left={84} color="#e0f2fe">
        Réponse confirmée
      </Hud>
      <Hud top={132} right={84} color="rgba(224,242,254,0.6)">
        4 signaux
      </Hud>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: 210 }}>
        <div style={{ textAlign: "center", transform: `scale(${0.82 + pop * 0.18})` }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 232,
              lineHeight: 1,
              letterSpacing: -4,
              color: "#ffffff",
              textShadow: "0 0 90px rgba(255,255,255,0.65)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            04.00
          </div>
          <div
            style={{
              marginTop: 8,
              fontFamily: MONO,
              fontSize: 24,
              letterSpacing: 12,
              color: "rgba(224,242,254,0.8)",
            }}
          >
            SECONDES
          </div>
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          top: 1180,
          left: 90,
          right: 90,
          height: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {BURST.map((height, i) => {
          const wobble = height * (0.5 + 0.5 * Math.sin(frame / 3.4 + i * 0.42));
          return (
            <div
              key={i}
              style={{
                width: 6,
                height: Math.max(6, wobble * 300),
                borderRadius: 4,
                background: "linear-gradient(180deg, #ffffff, rgba(103,232,249,0.7))",
                boxShadow: "0 0 18px rgba(255,255,255,0.45)",
              }}
            />
          );
        })}
      </div>

      <Hairline top={1600} width={640} color="rgba(255,255,255,0.55)" />
      <Subtitle text="Puis quatre secondes arrivèrent." delay={26} />
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash }} />
      <Grain />
      <Vignette />
    </SceneFade>
  );
};

/* ================================================================== */
/* 8 — L'aube                                                          */
/* ================================================================== */

export const SceneDawn: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = interpolate(frame, [0, 170], [1460, 1180], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 2.2),
  });
  const title = spring({
    frame: Math.max(0, frame - 62),
    fps,
    config: { damping: 200, mass: 0.8 },
    durationInFrames: 40,
  });
  const endFade = interpolate(frame, [158, 179], [0, 1], clamp);

  return (
    <SceneFade fadeIn={12} fadeOut={0}>
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, #04070f 0%, #0a1b33 34%, #3b2a4f 58%, #a3552c 78%, #f2a13c 100%)",
        }}
      />
      <Stars opacity={interpolate(frame, [0, 120], [0.55, 0], clamp)} />

      {/* Halo solaire — dégradé plutôt qu'un box-shadow flouté (évite un artefact rectangulaire) */}
      <div
        style={{
          position: "absolute",
          left: 540 - 620,
          top: rise - 620,
          width: 1240,
          height: 1240,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,236,180,0.40) 0%, rgba(251,146,60,0.28) 34%, rgba(249,115,22,0.09) 58%, transparent 72%)",
        }}
      />

      {/* Soleil */}
      <div
        style={{
          position: "absolute",
          left: 540 - 210,
          top: rise - 210,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 38%, #fffdf0 0%, #ffe08a 42%, #fbbf24 68%, #f97316 100%)",
        }}
      />

      {/* Sol */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 460,
          background: "linear-gradient(180deg, #1a1310 0%, #070507 100%)",
        }}
      />

      {/* Antenne silhouette */}
      <svg
        viewBox="0 0 600 640"
        style={{ position: "absolute", left: 130, bottom: 330, width: 400, height: 427 }}
      >
        <g fill="#05060a" stroke="#05060a">
          <ellipse cx="300" cy="614" rx="132" ry="22" />
          <rect x="292" y="330" width="16" height="280" />
          <g transform="rotate(-24 300 280)">
            <ellipse cx="300" cy="280" rx="162" ry="64" />
          </g>
          <line x1="300" y1="286" x2="196" y2="170" strokeWidth="6" />
        </g>
        <circle
          cx="196"
          cy="170"
          r="7"
          fill="#fde68a"
          opacity={0.6 + 0.4 * Math.sin(frame / 9)}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          top: 360,
          left: 84,
          right: 84,
          textAlign: "center",
          opacity: title,
          transform: `translateY(${(1 - title) * 30}px)`,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 20,
            letterSpacing: 12,
            color: "rgba(255,247,214,0.75)",
            marginBottom: 26,
          }}
        >
          UNE HISTOIRE DE 2089
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 96,
            lineHeight: 1.05,
            letterSpacing: 4,
            color: "#ffffff",
            textShadow:
              "0 6px 50px rgba(0,0,0,0.6), 0 0 70px rgba(255,247,214,0.22)",
          }}
        >
          LE DERNIER
          <br />
          SIGNAL
        </div>
      </div>

      <Subtitle
        text="Ce n’était pas la fin. C’était le début."
        delay={22}
        bottom={150}
        color="#fff7ed"
      />
      <Hairline top={1730} width={420} color="rgba(255,247,214,0.5)" opacity={0.7} />
      <div
        style={{
          position: "absolute",
          bottom: 88,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: MONO,
          fontSize: 17,
          letterSpacing: 8,
          color: "rgba(255,247,214,0.55)",
        }}
      >
        JARVIS · 2089
      </div>

      <AbsoluteFill style={{ backgroundColor: "#000", opacity: endFade }} />
      <Grain />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, transparent 46%, rgba(2,4,10,0.5) 100%)",
        }}
      />
    </SceneFade>
  );
};
