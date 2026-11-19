import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  Bubble,
  clamp,
  Glow,
  Grain,
  Hairline,
  Hud,
  JourStamp,
  MONO,
  Phone,
  Ripples,
  SANS,
  SceneFade,
  Subtitle,
  Vignette,
  WARM,
} from "./parts";

/* -------------------------------------------------- */
/* S1 — 02:47, le téléphone sonne                      */
/* -------------------------------------------------- */
export const SceneRing: React.FC = () => {
  const frame = useCurrentFrame();
  const shake = Math.sin(frame * 1.6) * (frame % 42 < 16 ? 2.2 : 0);
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: WARM.bg }}>
        <Glow cy={900} size={1200} />
        <Ripples cy={900} />
        <Hud top={120} left={92}>02:47</Hud>
        <Hud top={120} right={92} color={WARM.muted}>JOUR 01 · NUIT</Hud>
        <JourStamp top={230} />
        <div style={{ transform: `translateX(${shake}px)` }}>
          <Phone
            top={520}
            screen={
              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 20, color: WARM.muted, letterSpacing: 3 }}>
                  APPEL ENTRANT
                </div>
                <div style={{ fontFamily: SANS, fontSize: 62, color: WARM.amber, marginTop: 12 }}>
                  ● ● ●
                </div>
                <div style={{ marginTop: 30, height: 4, background: "rgba(255,181,69,0.25)", borderRadius: 4 }}>
                  <div
                    style={{
                      width: `${((frame % 60) / 60) * 100}%`,
                      height: "100%",
                      background: WARM.amber,
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            }
          />
        </div>
        <Hairline top={1440} />
        <Vignette />
        <Grain />
        <Subtitle text="Il est deux heures quarante-sept. Ton téléphone sonne." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S2 — ton propre numéro                              */
/* -------------------------------------------------- */
export const SceneNumber: React.FC = () => {
  const frame = useCurrentFrame();
  const glitch = frame % 47 < 5 ? (frame % 2 ? 9 : -7) : 0;
  const flash = frame % 47 < 5 ? 0.35 : 1;
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#0d0603" }}>
        <Glow cy={860} size={1000} color="rgba(255,70,70,0.22)" />
        <Hud top={120} left={92} color={WARM.red}>APPEL ENTRANT</Hud>
        <Hud top={120} right={92} color={WARM.muted}>IDENTITÉ · INCONNUE</Hud>
        <div
          style={{
            position: "absolute",
            left: 120,
            right: 120,
            top: 430,
            padding: "52px 48px",
            borderRadius: 40,
            background: "linear-gradient(150deg, rgba(60,18,10,0.9), rgba(18,7,4,0.96))",
            border: "2px solid rgba(255,77,77,0.5)",
            boxShadow: "0 30px 100px rgba(0,0,0,0.8), 0 0 70px rgba(255,60,60,0.12)",
            opacity: flash,
            transform: `translateX(${glitch}px)`,
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 80,
              background: "linear-gradient(145deg, #4a1c12, #180806)",
              border: "2px solid rgba(255,120,90,0.4)",
              marginBottom: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: SANS,
              fontSize: 54,
              color: WARM.red,
            }}
          >
            ?
          </div>
          <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 4, color: WARM.muted }}>
            L'appelant affiche
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 72,
              letterSpacing: 8,
              color: WARM.red,
              marginTop: 18,
              textShadow: "0 0 44px rgba(255,77,77,0.6)",
            }}
          >
            06 ··· ··· 47
          </div>
          <div
            style={{
              marginTop: 28,
              fontFamily: SANS,
              fontSize: 50,
              color: WARM.ink,
            }}
          >
            C'EST TON NUMÉRO.
          </div>
        </div>
        <Vignette />
        <Grain />
        <Subtitle text="L'appelant affiche ton propre numéro." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S3 — retour en arrière de 3 secondes                */
/* -------------------------------------------------- */
export const SceneRewind: React.FC = () => {
  const frame = useCurrentFrame();
  const step = Math.min(2, Math.floor(frame / 42));
  const numbers = ["03", "02", "01"];
  const bubbleIn = interpolate(frame, [95, 125], [140, 0], clamp);
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#040b12" }}>
        <Glow cy={820} size={1100} color="rgba(80,180,255,0.22)" />
        <Hud top={120} left={92} color={WARM.cold}>REWIND · −3 s</Hud>
        <Hud top={120} right={92} color={WARM.muted}>AVANT L'APPEL</Hud>
        <div
          style={{
            position: "absolute",
            top: 330,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: MONO,
            fontSize: 280,
            lineHeight: 1,
            color: WARM.cold,
            opacity: 0.22,
            textShadow: "0 0 90px rgba(120,200,255,0.45)",
          }}
        >
          {numbers[step]}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 700, display: "flex", justifyContent: "center", transform: `translateX(${bubbleIn}px)` }}>
          <Bubble text="un message envoyé" cold width={760} fontSize={46} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 940, display: "flex", justifyContent: "center", transform: `translateX(${bubbleIn}px)` }}>
          <Bubble text="à toi-même" cold width={560} fontSize={44} />
        </div>
        <Vignette color="rgba(2,8,14,0.88)" />
        <Grain />
        <Subtitle text="Trois secondes avant, tu t'es envoyé un message." />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* -------------------------------------------------- */
/* S4 — NE RÉPONDS PAS                                 */
/* -------------------------------------------------- */
export const SceneWarning: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 0.9 + 0.1 * Math.sin(frame * 0.22);
  const local = interpolate(frame, [0, 16], [0.6, 1], clamp);
  return (
    <SceneFade>
      <AbsoluteFill style={{ backgroundColor: "#100803" }}>
        <Glow cy={820} size={1200} color="rgba(255,150,30,0.3)" />
        <Hud top={120} left={92}>MESSAGE · 01</Hud>
        <Hud top={120} right={92} color={WARM.muted}>EXPÉDITEUR · TOI</Hud>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 630,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${pulse * local})`,
          }}
        >
          <Bubble text="NE RÉPONDS PAS" width={870} fontSize={82} />
        </div>
        <Hairline top={1230} />
        <Vignette />
        <Grain />
        <Subtitle text="Il disait : ne réponds pas." bottom={240} />
      </AbsoluteFill>
    </SceneFade>
  );
};
