import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  Bubble,
  clamp,
  Doorway,
  Glow,
  Grain,
  Hairline,
  Hud,
  MONO,
  Ripples,
  SANS,
  SceneFade,
  Subtitle,
  Vignette,
  WARM,
} from "./parts";

/* -------------------------------------------------- */
/* S5 — daté de demain                                 */
/* -------------------------------------------------- */
export const SceneTomorrow: React.FC = () => {
  const frame = useCurrentFrame();
  const coldness = interpolate(frame, [0, 60, 130, 180], [1, 1, 0.25, 0], clamp);
  const shift = frame > 118 ? (frame % 6 < 3 ? 4 : -3) : 0;
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#050a10" }}>
        <Glow cy={820} size={1100} color={`rgba(90,185,255,${0.16 + coldness * 0.16})`} />
        <Hud top={120} left={92} color={WARM.cold}>HORODATAGE</Hud>
        <Hud top={120} right={92} color={WARM.muted}>MESSAGE · 01</Hud>
        <div
          style={{
            position: "absolute",
            left: 130,
            right: 130,
            top: 420,
            padding: "46px 44px 52px",
            borderRadius: 38,
            background: "linear-gradient(150deg, rgba(10,34,52,0.94), rgba(6,14,24,0.97))",
            border: `2px solid rgba(143,216,255,${0.3 + coldness * 0.35})`,
            boxShadow: "0 30px 100px rgba(0,0,0,0.8)",
            transform: `translateX(${shift}px)`,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 23, letterSpacing: 5, color: WARM.muted }}>
            REÇU LE · 25 OCT · 02:47
          </div>
          <div style={{ marginTop: 24, height: 1, background: "rgba(143,216,255,0.28)" }} />
          <div
            style={{
              marginTop: 34,
              fontFamily: SANS,
              fontSize: 118,
              letterSpacing: 6,
              color: WARM.cold,
              textShadow: "0 0 70px rgba(120,200,255,0.45)",
            }}
          >
            DEMAIN
          </div>
          <div style={{ marginTop: 20, fontFamily: MONO, fontSize: 34, color: WARM.ink, opacity: 0.8 }}>
            26 OCT · 02:47
          </div>
        </div>
        <Vignette color="rgba(2,8,14,0.88)" />
        <Grain />
        <Subtitle text="Le message était daté de demain." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S6 — silence, puis ça recommence                    */
/* -------------------------------------------------- */
export const SceneAgain: React.FC = () => {
  const frame = useCurrentFrame();
  const silence = frame < 96;
  const flash = frame >= 96 && frame < 112 ? 1 : 0;
  const visible = interpolate(frame, [96, 106], [0, 1], clamp);
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: silence ? "#020101" : "#0d0603" }}>
        {!silence ? (
          <>
            <Glow cy={880} size={1200} />
            <Ripples cy={880} speed={4.2} />
          </>
        ) : null}
        {flash ? <AbsoluteFill style={{ backgroundColor: "rgba(255,200,130,0.13)" }} /> : null}
        <Hud top={120} left={92} color={silence ? WARM.muted : WARM.red}>
          {silence ? "SILENCE · 00:00" : "RAPPEL EN COURS"}
        </Hud>
        <Hud top={120} right={92} color={WARM.muted}>
          {silence ? "AUCUN SIGNAL" : "02:47"}
        </Hud>
        {silence ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 760,
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 150,
              color: WARM.muted,
              opacity: 0.22,
            }}
          >
            · · ·
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 600,
              display: "flex",
              justifyContent: "center",
              opacity: visible,
            }}
          >
            <Bubble text="ÇA RECOMMENCE" width={820} fontSize={72} />
          </div>
        )}
        <Vignette />
        <Grain />
        <Subtitle text="La sonnerie s'arrête. Puis recommence." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S7 — de l'autre côté de la porte                    */
/* -------------------------------------------------- */
export const SceneDoor: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 0.75 + 0.25 * Math.sin(frame * 0.2);
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#0a0302" }}>
        <Glow cx={540} cy={1560} size={1000} color="rgba(255,60,60,0.2)" />
        <Doorway figure alarm />
        <Hud top={120} left={92} color={WARM.red}>PRÈS · 1 m</Hud>
        <Hud top={120} right={92} color={WARM.muted}>FAITE · COULOIR</Hud>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 480,
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 38,
            letterSpacing: 8,
            color: WARM.red,
            opacity: pulse,
            textShadow: "0 0 44px rgba(255,77,77,0.6)",
          }}
        >
          ON FRAPPE.
        </div>
        <Vignette color="rgba(10,2,1,0.86)" />
        <Grain />
        <Subtitle text="Cette fois, elle vient de l'autre côté de la porte." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S8 — vote et fin d'épisode                          */
/* -------------------------------------------------- */
export const SceneVote: React.FC = () => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [12, 30], [0, 1], clamp);
  const b = interpolate(frame, [34, 52], [0, 1], clamp);
  const c = interpolate(frame, [62, 82], [0, 1], clamp);
  return (
    <SceneFade fadeOut={0}>
      <AbsoluteFill style={{ backgroundColor: "#0a0604" }}>
        <Glow cy={720} size={1300} color="rgba(255,150,40,0.22)" />
        <Hud top={110} left={92}>JOUR 1 · FIN</Hud>
        <Hud top={110} right={92} color={WARM.muted}>À TOI DE CHOISIR</Hud>
        <div
          style={{
            position: "absolute",
            top: 300,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: SANS,
            fontSize: 66,
            letterSpacing: 4,
            color: WARM.ink,
          }}
        >
          LA SUITE DÉPEND DE TOI
        </div>
        <Hairline top={410} />

        <div style={{ position: "absolute", top: 540, left: 90, right: 90, opacity: a, transform: `translateY(${(1 - a) * 26}px)` }}>
          <div
            style={{
              padding: "30px 40px",
              borderRadius: 28,
              background: "linear-gradient(120deg, rgba(80,45,12,0.92), rgba(24,13,5,0.96))",
              border: "2px solid rgba(255,181,69,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontFamily: SANS, fontSize: 52, color: WARM.amber }}>RÉPONDRE</span>
            <span style={{ fontFamily: MONO, fontSize: 30, color: WARM.muted }}>01</span>
          </div>
        </div>
        <div style={{ position: "absolute", top: 700, left: 90, right: 90, opacity: b, transform: `translateY(${(1 - b) * 26}px)` }}>
          <div
            style={{
              padding: "30px 40px",
              borderRadius: 28,
              background: "linear-gradient(120deg, rgba(46,34,26,0.92), rgba(16,11,7,0.96))",
              border: "2px solid rgba(200,170,140,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontFamily: SANS, fontSize: 52, color: WARM.ink }}>LAISSER SONNER</span>
            <span style={{ fontFamily: MONO, fontSize: 30, color: WARM.muted }}>02</span>
          </div>
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, top: 940, textAlign: "center", opacity: c }}>
          <div style={{ fontFamily: SANS, fontSize: 44, color: WARM.amber, letterSpacing: 2 }}>
            VOTE EN COMMENTAIRE
          </div>
          <div style={{ marginTop: 20, fontFamily: MONO, fontSize: 28, letterSpacing: 4, color: WARM.muted }}>
            ABONNE-TOI POUR LE JOUR 2
          </div>
        </div>

        <Vignette />
        <Grain />
        <Subtitle text="Vote : répondre, ou laisser sonner. Abonne-toi pour le jour deux." bottom={150} size={42} />
      </AbsoluteFill>
    </SceneFade>
  );
};
