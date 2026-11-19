import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  BLOOD,
  clamp,
  Corridor,
  Door,
  Figure,
  Flashlight,
  GlitchText,
  Grain,
  Handheld,
  JournalText,
  MONO,
  RecHud,
  SANS,
  SceneFade,
  Scanlines,
  Vignette,
} from "./parts";

/* -------------------------------------------------- */
/* S5 — planque dans le placard                       */
/* -------------------------------------------------- */
export const SceneCloset: React.FC = () => {
  const frame = useCurrentFrame();
  const breath = 0.5 + 0.5 * Math.sin(frame * 0.1);
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#010101" }}>
        <Handheld amount={0.7}>
          <div
            style={{
              position: "absolute",
              left: 500,
              top: 0,
              width: 90,
              height: 1920,
              background: "linear-gradient(90deg, transparent, rgba(220,215,200,0.12), transparent)",
              filter: "blur(4px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 500,
              height: 1920,
              background: "#000",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 590,
              top: 0,
              width: 490,
              height: 1920,
              background: "rgba(0,0,0,0.86)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 120,
              top: 780,
              fontFamily: MONO,
              fontSize: 32,
              letterSpacing: 6,
              color: BLOOD.grey,
              opacity: 0.3 + breath * 0.25,
            }}
          >
            JE RESPIRE. JE NE BOUGE PAS.
          </div>
        </Handheld>
        <RecHud seconds={24} label="PLACARD·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain opacity={0.18} />
        <JournalText text="J'ai éteint la lumière. Je filme depuis le placard." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S6 — pas dans le couloir, respiration               */
/* -------------------------------------------------- */
export const SceneHall: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#030303" }}>
        <Handheld amount={0.9}>
          <Corridor />
          <Flashlight cy={980} speed={0.028} />
          <Figure left={470} top={640} scale={1.05} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 360,
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 34,
              letterSpacing: 7,
              color: BLOOD.ink,
              opacity: interpolate(frame, [20, 44], [0, 0.85], clamp),
            }}
          >
            IL S'ARRÊTE.
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 1210,
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 40,
              letterSpacing: 5,
              color: BLOOD.red,
              opacity: interpolate(frame, [95, 120], [0, 1], clamp),
            }}
          >
            IL RESPIRE.
          </div>
        </Handheld>
        <RecHud seconds={30} label="COULOIR·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain />
        <JournalText text="Quelqu'un marche dans le couloir. Il s'arrête. Il respire." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S7 — il dit mon prénom                              */
/* -------------------------------------------------- */
export const SceneName: React.FC = () => {
  const frame = useCurrentFrame();
  const shake = frame % 49 < 5 ? 7 : 0;
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#070202" }}>
        <Handheld amount={1.6}>
          <Door alarm />
          <Figure left={830} top={690} scale={0.9} />
          <GlitchText text="IL A DIT" top={360} size={92} />
          <GlitchText text="MON PRÉNOM" top={470} size={92} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 1180,
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 32,
              letterSpacing: 5,
              color: BLOOD.grey,
              transform: `translateX(${shake}px)`,
            }}
          >
            JE N'AI JAMAIS OUVERT CETTE PORTE.
          </div>
        </Handheld>
        <RecHud seconds={36} label="COULOIR·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain opacity={0.22} />
        <JournalText text="Il vient de dire mon prénom. Je n'ai jamais ouvert cette porte." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S8 — vote                                          */
/* -------------------------------------------------- */
export const SceneVote: React.FC = () => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [10, 28], [0, 1], clamp);
  const b = interpolate(frame, [32, 50], [0, 1], clamp);
  const c = interpolate(frame, [60, 80], [0, 1], clamp);
  return (
    <SceneFade fadeOut={0}>
      <AbsoluteFill style={{ backgroundColor: "#040202" }}>
        <Handheld amount={0.4}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 40%, #1a0708, #020101 72%)" }} />
          <GlitchText text="JOUR 1 · FIN" top={280} size={74} color={BLOOD.ink} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 420,
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 30,
              letterSpacing: 5,
              color: BLOOD.grey,
            }}
          >
            LA SUITE DÉPEND DE TOI
          </div>
        </Handheld>

        <div style={{ position: "absolute", top: 620, left: 88, right: 88, opacity: a, transform: `translateY(${(1 - a) * 24}px)` }}>
          <div style={{ padding: "30px 36px", borderRadius: 22, background: "rgba(28,8,9,0.92)", border: `2px solid ${BLOOD.red}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: SANS, fontSize: 46, color: BLOOD.red }}>OUVRIR LA FENÊTRE</span>
            <span style={{ fontFamily: MONO, fontSize: 26, color: BLOOD.grey }}>01</span>
          </div>
        </div>
        <div style={{ position: "absolute", top: 790, left: 88, right: 88, opacity: b, transform: `translateY(${(1 - b) * 24}px)` }}>
          <div style={{ padding: "30px 36px", borderRadius: 22, background: "rgba(12,12,12,0.92)", border: "2px solid rgba(220,215,205,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: SANS, fontSize: 46, color: BLOOD.ink }}>RESTE CACHÉ</span>
            <span style={{ fontFamily: MONO, fontSize: 26, color: BLOOD.grey }}>02</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 1020, textAlign: "center", opacity: c }}>
          <div style={{ fontFamily: SANS, fontSize: 42, color: BLOOD.red, letterSpacing: 2 }}>VOTE EN COMMENTAIRE</div>
          <div style={{ marginTop: 20, fontFamily: MONO, fontSize: 28, letterSpacing: 5, color: BLOOD.grey }}>
            JOUR 2 DEMAIN
          </div>
        </div>

        <RecHud seconds={42} label="JOURNAL·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain />
        <JournalText text="Vote : ouvrir la fenêtre, ou rester caché. À demain, jour deux." bottom={150} size={40} />
      </AbsoluteFill>
    </SceneFade>
  );
};

void MONO;
