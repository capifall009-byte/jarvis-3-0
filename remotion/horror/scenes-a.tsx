import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  BLOOD,
  clamp,
  GlitchText,
  Grain,
  Handheld,
  JournalText,
  MONO,
  RecHud,
  SceneFade,
  Scanlines,
  Vignette,
  Waveform,
} from "./parts";

/* -------------------------------------------------- */
/* S1 — journal, batterie 3 %                          */
/* -------------------------------------------------- */
export const SceneJournal: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = "JOUR 1 · 22:14".slice(0, Math.min(13, Math.floor(frame / 4)));
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: BLOOD.black }}>
        <Handheld>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 55%, #161616, #030303 70%)" }} />
          <div
            style={{
              position: "absolute",
              left: 140,
              right: 140,
              top: 520,
              padding: 44,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(8,8,8,0.7)",
              fontFamily: MONO,
              fontSize: 52,
              color: BLOOD.ink,
              letterSpacing: 3,
            }}
          >
            {typed}
            <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>_</span>
          </div>
          <div
            style={{
              position: "absolute",
              left: 140,
              top: 760,
              fontFamily: MONO,
              fontSize: 28,
              color: BLOOD.red,
              letterSpacing: 4,
            }}
          >
            BATTERIE ▮▮▯▯▯ 3 %
          </div>
        </Handheld>
        <RecHud label="JOURNAL·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain />
        <JournalText text="Journal. Jour un. Il reste trois pour cent de batterie." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S2 — ascenseurs arrêtés                             */
/* -------------------------------------------------- */
export const SceneLift: React.FC = () => {
  const frame = useCurrentFrame();
  const flicker = frame % 71 < 4 ? 0.25 : 1;
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#050505" }}>
        <Handheld>
          <div
            style={{
              position: "absolute",
              left: 210,
              top: 360,
              width: 660,
              height: 1220,
              background: "linear-gradient(180deg, #0d0d0d, #050505)",
              border: "4px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: flicker,
            }}
          >
            <div style={{ width: 2, height: "100%", background: "rgba(255,255,255,0.09)" }} />
            <GlitchText text="HORS SERVICE" top={640} size={68} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 140,
              top: 260,
              fontFamily: MONO,
              fontSize: 30,
              letterSpacing: 6,
              color: BLOOD.grey,
            }}
          >
            REZ-DE-CHAUSSÉE
          </div>
        </Handheld>
        <RecHud seconds={6} label="HALL·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain />
        <JournalText text="Les ascenseurs sont arrêtés depuis ce matin." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S3 — quatrième étage                                */
/* -------------------------------------------------- */
export const SceneFloor: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#040404" }}>
        <Handheld>
          <div
            style={{
              position: "absolute",
              left: 120,
              top: 300,
              width: 840,
              height: 1180,
              background:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 92px)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 120,
              top: 580,
              width: 840,
              height: 3,
              background: BLOOD.red,
              boxShadow: `0 0 40px 8px ${BLOOD.red}66`,
              opacity: 0.7 + 0.3 * Math.sin(frame * 0.15),
            }}
          />
          <GlitchText text="4e ÉTAGE" top={430} size={110} />
          <div style={{ position: "absolute", left: 560, top: 600, fontFamily: MONO, fontSize: 30, color: BLOOD.grey, letterSpacing: 4 }}>
            22:00
          </div>
        </Handheld>
        <RecHud seconds={12} label="COULOIR·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain />
        <JournalText text="À vingt-deux heures, ça a commencé au quatrième étage." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S4 — cri puis pas                                   */
/* -------------------------------------------------- */
export const SceneSteps: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = frame > 34 && frame < 46 ? 1 : 0;
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#080202" }}>
        {flash ? <AbsoluteFill style={{ backgroundColor: "rgba(216,31,38,0.16)" }} /> : null}
        <Handheld amount={1.5}>
          <Waveform />
          <GlitchText text="UN CRI." top={330} size={92} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 1130,
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 46,
              letterSpacing: 8,
              color: BLOOD.ink,
              opacity: interpolate(frame, [70, 92], [0, 1], clamp),
            }}
          >
            PUIS DES PAS.
          </div>
        </Handheld>
        <RecHud seconds={18} label="COULOIR·CAM 01" />
        <Vignette />
        <Scanlines />
        <Grain opacity={0.2} />
        <JournalText text="D'abord un cri. Puis des pas. Beaucoup de pas." />
      </AbsoluteFill>
    </SceneFade>
  );
};
