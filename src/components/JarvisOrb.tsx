import { useEffect, useRef } from "react";
import type { VoiceState } from "../types/jarvis";

interface JarvisOrbProps {
  voiceState: VoiceState;
  getInputLevel: () => number;
  getOutputLevel: () => number;
  onOrbClick: () => void;
  extremeDark?: boolean;
  /** Version compacte pour l'en-tête de conversation (animation identique). */
  compact?: boolean;
}

const STATE_LABELS: Record<VoiceState, string> = {
  idle: "Activer l'écoute vocale",
  connecting: "Connexion à JARVIS en cours",
  listening: "JARVIS vous écoute — toucher pour arrêter",
  speaking: "JARVIS parle — toucher pour interrompre",
  thinking: "JARVIS réfléchit",
  offline: "Mode hors ligne actif — commandes locales disponibles",
  error: "Erreur de connexion — toucher pour réessayer",
};

interface HoloParticle {
  angle: number;
  radiusFactor: number;
  speed: number;
  tilt: number;
  phase: number;
  size: number;
  isCyan: boolean;
}

function createHoloParticles(count: number): HoloParticle[] {
  const list: HoloParticle[] = [];
  for (let i = 0; i < count; i++) {
    const ratio = i / count;
    list.push({
      angle: ratio * Math.PI * 2,
      radiusFactor: 0.72 + ((i * 17) % 10) * 0.068,
      speed: (i % 2 === 0 ? 1 : -1) * (0.9 + ((i * 13) % 7) * 0.24),
      tilt: 0.38 + ((i * 7) % 5) * 0.11,
      phase: ratio * Math.PI * 4,
      size: 1.1 + (i % 3) * 0.55,
      isCyan: i % 3 !== 0,
    });
  }
  return list;
}

export function JarvisOrb({
  voiceState,
  getInputLevel,
  getOutputLevel,
  onOrbClick,
  extremeDark = false,
  compact = false,
}: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<VoiceState>(voiceState);
  const extremeDarkRef = useRef<boolean>(extremeDark);
  const smoothLevelRef = useRef(0);
  const thinkingBlendRef = useRef(0);
  const particlesRef = useRef<HoloParticle[]>(createHoloParticles(30));

  useEffect(() => {
    stateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    extremeDarkRef.current = extremeDark;
  }, [extremeDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let animationId = 0;
    const startTime = performance.now();
    let lastTime = startTime;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    const draw = (now: number) => {
      resize();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.285;
      const t = (now - startTime) / 1000;
      const currentState = stateRef.current;
      const isExtremeDark = extremeDarkRef.current;

      const rawLevel =
        currentState === "speaking"
          ? getOutputLevel()
          : currentState === "listening"
          ? getInputLevel()
          : 0;

      const lerpFactor = rawLevel > smoothLevelRef.current ? 0.32 : 0.14;
      smoothLevelRef.current += (rawLevel - smoothLevelRef.current) * lerpFactor;
      const energy = prefersReducedMotion ? 0 : smoothLevelRef.current;

      // Smooth blend factor for the 'thinking' holographic particle & lens distortion mode
      const isThinking = currentState === "thinking";
      const targetThink = isThinking ? 1 : 0;
      if (prefersReducedMotion) {
        thinkingBlendRef.current = targetThink;
      } else {
        thinkingBlendRef.current +=
          (targetThink - thinkingBlendRef.current) * (isThinking ? 0.12 : 0.08);
      }
      const thinkBlend = thinkingBlendRef.current;

      ctx.clearRect(0, 0, width, height);

      // Color palette depending on state
      const isError = currentState === "error";
      const isOffline = currentState === "offline";
      const isSpeaking = currentState === "speaking";
      const isListening = currentState === "listening";
      const isConnecting = currentState === "connecting" || isThinking;

      const primaryRgb = isError
        ? "248, 113, 113"
        : isOffline
        ? "148, 163, 184"
        : isSpeaking
        ? "103, 232, 249"
        : isConnecting
        ? "96, 165, 250"
        : "34, 211, 238";
      const secondaryRgb = isError
        ? "239, 68, 68"
        : isOffline
        ? "71, 85, 105"
        : "59, 130, 246";

      // 1. Atmospheric outer radial glow (heavily dimmed in Extreme Dark Mode)
      const glowRadius = baseRadius * (1.82 + energy * 0.45 + thinkBlend * 0.18);
      const baseGlowAlpha =
        currentState === "idle"
          ? 0.14
          : isOffline
          ? 0.08
          : isSpeaking
          ? 0.3 + energy * 0.22
          : isListening
          ? 0.22 + energy * 0.2
          : isThinking
          ? 0.24
          : 0.18;
      const glowAlpha = isExtremeDark ? baseGlowAlpha * 0.2 : baseGlowAlpha;

      const outerGlow = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.35,
        cx,
        cy,
        glowRadius
      );
      outerGlow.addColorStop(0, `rgba(${primaryRgb}, ${glowAlpha})`);
      outerGlow.addColorStop(0.55, `rgba(${secondaryRgb}, ${glowAlpha * 0.42})`);
      outerGlow.addColorStop(1, isExtremeDark ? "rgba(0, 0, 0, 0)" : "rgba(3, 5, 9, 0)");
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Subtle outer HUD tick ring (with subtle lens wave warp when thinking)
      const tickRadius = baseRadius * 1.28;
      const tickCount = 60;
      const tickRotation = prefersReducedMotion
        ? 0
        : t * (0.08 + thinkBlend * 0.28);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tickRotation);
      for (let i = 0; i < tickCount; i++) {
        const angle = (i / tickCount) * Math.PI * 2;
        const isMajor = i % 5 === 0;
        const lensOffset =
          !prefersReducedMotion && thinkBlend > 0.01
            ? Math.sin(angle * 3 - t * 4.5) * 3.5 * dpr * thinkBlend
            : 0;
        const innerR = tickRadius + lensOffset;
        const outerR = innerR + (isMajor ? 6 * dpr : 3 * dpr);
        const normalAlpha = isMajor
          ? currentState === "idle"
            ? 0.22
            : 0.42 + thinkBlend * 0.18
          : 0.12 + thinkBlend * 0.1;
        const tickAlpha = isExtremeDark ? normalAlpha * 0.32 : normalAlpha;
        ctx.strokeStyle = `rgba(${primaryRgb}, ${tickAlpha})`;
        ctx.lineWidth = (isMajor ? 1.5 : 1) * dpr;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
        ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Rotating orbital arcs
      const arcRadius1 = baseRadius * 1.15;
      const rot1 = prefersReducedMotion
        ? 0
        : t * (isSpeaking ? 1.1 : isConnecting ? 2.1 : 0.35);
      const arcAlpha = isExtremeDark
        ? isConnecting
          ? 0.26
          : 0.11
        : isConnecting
        ? 0.65
        : 0.32;
      ctx.strokeStyle = `rgba(${primaryRgb}, ${arcAlpha})`;
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, arcRadius1, rot1, rot1 + Math.PI * 0.65);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        arcRadius1,
        rot1 + Math.PI,
        rot1 + Math.PI + Math.PI * 0.45
      );
      ctx.stroke();

      // 3b. Holographic Optical Lens Distortion (Chromatic Aberration + Refractive Caustics) during 'thinking'
      if (thinkBlend > 0.01) {
        const lensAlphaScale = (isExtremeDark ? 0.32 : 1) * thinkBlend;
        const lensWave = prefersReducedMotion ? 0 : t * 4.2;

        // Chromatic split rings (Cyan + Electric Indigo lens dispersion)
        const chromaticLayers: Array<{
          color: string;
          phase: number;
          radialShift: number;
          amp: number;
        }> = [
          {
            color: `rgba(34, 211, 238, ${0.42 * lensAlphaScale})`,
            phase: 0.4,
            radialShift: 3.5 * dpr,
            amp: 4.5 * dpr,
          },
          {
            color: `rgba(129, 140, 248, ${0.36 * lensAlphaScale})`,
            phase: -0.6,
            radialShift: -3.5 * dpr,
            amp: 4.0 * dpr,
          },
        ];

        for (const layer of chromaticLayers) {
          ctx.save();
          ctx.beginPath();
          const steps = 96;
          for (let i = 0; i <= steps; i++) {
            const theta = (i / steps) * Math.PI * 2;
            const warp =
              (Math.sin(theta * 3 + lensWave + layer.phase) * 0.6 +
                Math.cos(theta * 5 - lensWave * 1.3) * 0.4) *
              layer.amp *
              thinkBlend;
            const r =
              baseRadius +
              layer.radialShift * Math.sin(theta * 2 + lensWave * 0.5) +
              warp;
            const x = cx + Math.cos(theta) * r;
            const y = cy + Math.sin(theta) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = layer.color;
          ctx.lineWidth = 1.35 * dpr;
          ctx.stroke();
          ctx.restore();
        }

        // Rotating Fresnel glass lens highlight sweeping across the core
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 0.96, 0, Math.PI * 2);
        ctx.clip();

        const sweepAngle = prefersReducedMotion ? 0.6 : t * 1.9;
        const hx = cx + Math.cos(sweepAngle) * baseRadius * 0.42;
        const hy = cy + Math.sin(sweepAngle) * baseRadius * 0.42;
        const lensGrad = ctx.createRadialGradient(
          hx,
          hy,
          0,
          cx,
          cy,
          baseRadius * 1.05
        );
        lensGrad.addColorStop(
          0,
          `rgba(186, 230, 253, ${0.22 * lensAlphaScale})`
        );
        lensGrad.addColorStop(
          0.45,
          `rgba(56, 189, 248, ${0.09 * lensAlphaScale})`
        );
        lensGrad.addColorStop(1, "rgba(3, 5, 9, 0)");
        ctx.fillStyle = lensGrad;
        ctx.fillRect(
          cx - baseRadius,
          cy - baseRadius,
          baseRadius * 2,
          baseRadius * 2
        );

        // Refractive inner distortion wave rings
        for (let ringIdx = 0; ringIdx < 2; ringIdx++) {
          const ringProgress = prefersReducedMotion
            ? 0.45 + ringIdx * 0.3
            : (t * 0.75 + ringIdx * 0.5) % 1;
          const rLens = baseRadius * (0.28 + ringProgress * 0.68);
          const ringFade = Math.sin(ringProgress * Math.PI);
          ctx.strokeStyle = `rgba(125, 211, 252, ${
            0.34 * ringFade * lensAlphaScale
          })`;
          ctx.lineWidth = 1.15 * dpr;
          ctx.beginPath();
          const segs = 64;
          for (let s = 0; s <= segs; s++) {
            const theta = (s / segs) * Math.PI * 2;
            const pinch =
              Math.sin(theta * 4 - lensWave * 1.5 + ringIdx) *
              2.5 *
              dpr *
              thinkBlend;
            const px = cx + Math.cos(theta) * (rLens + pinch);
            const py = cy + Math.sin(theta) * (rLens - pinch * 0.6);
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Primary fluid harmonic cyan circle
      const breath = prefersReducedMotion
        ? 0
        : Math.sin(t * 1.8) * (currentState === "idle" ? 2.5 * dpr : 1.5 * dpr);
      const waveAmp =
        isSpeaking
          ? (4 + energy * 20) * dpr
          : isListening
          ? (2.5 + energy * 15) * dpr
          : isConnecting
          ? (3.2 + thinkBlend * 2.2) * dpr
          : 0.8 * dpr;

      const points = 128;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const theta = (i / points) * Math.PI * 2;
        const harmonic1 = Math.sin(
          theta * 4 + t * (isSpeaking ? 5.2 : isThinking ? 4.2 : 2.8)
        );
        const harmonic2 = Math.cos(
          theta * 7 - t * (isSpeaking ? 3.8 : isThinking ? 3.1 : 2.1)
        );
        const harmonic3 = Math.sin(theta * 2 + t * 1.4);
        const offset =
          (harmonic1 * 0.5 + harmonic2 * 0.3 + harmonic3 * 0.2) * waveAmp;
        const r = baseRadius + breath + offset;
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();

      // Soft luminous fill inside ring
      const coreGrad = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.08,
        cx,
        cy,
        baseRadius * 1.1
      );
      const coreAlpha0 = isSpeaking
        ? 0.28 + energy * 0.24
        : isThinking
        ? 0.22
        : 0.12 + energy * 0.16;
      coreGrad.addColorStop(
        0,
        `rgba(${primaryRgb}, ${isExtremeDark ? coreAlpha0 * 0.3 : coreAlpha0})`
      );
      coreGrad.addColorStop(
        0.7,
        `rgba(${secondaryRgb}, ${isExtremeDark ? 0.015 : 0.06})`
      );
      coreGrad.addColorStop(
        1,
        `rgba(${primaryRgb}, ${isExtremeDark ? 0.005 : 0.02})`
      );
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Luminous cyan stroke
      ctx.shadowColor = `rgba(${primaryRgb}, ${
        isExtremeDark ? (isSpeaking ? 0.45 : 0.22) : isSpeaking ? 0.9 : 0.65
      })`;
      ctx.shadowBlur = (isExtremeDark ? (isSpeaking ? 10 : 5) : isSpeaking ? 26 : 16) * dpr;
      ctx.strokeStyle = `rgba(${primaryRgb}, ${
        isExtremeDark
          ? currentState === "idle"
            ? 0.36
            : 0.58
          : currentState === "idle"
          ? 0.72
          : 0.96
      })`;
      ctx.lineWidth = (isSpeaking ? 2.6 : 2.1) * dpr;
      ctx.stroke();
      ctx.restore();

      // 5. Crisp inner core ring (with subtle holographic tilt when thinking)
      const innerR = baseRadius * (0.64 + energy * 0.12 - thinkBlend * 0.04);
      const innerAlpha = isSpeaking
        ? 0.45 + energy * 0.35
        : isThinking
        ? 0.42
        : 0.2;
      ctx.strokeStyle = `rgba(165, 243, 252, ${
        isExtremeDark ? innerAlpha * 0.32 : innerAlpha
      })`;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.stroke();

      // 5b. 3D-tilted Neural Orbital Particle Field during 'thinking'
      if (thinkBlend > 0.01) {
        const particles = particlesRef.current;
        const pAlphaScale = (isExtremeDark ? 0.36 : 0.92) * thinkBlend;
        ctx.save();
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (!prefersReducedMotion) {
            p.angle += p.speed * dt * (0.85 + thinkBlend * 0.95);
          }

          const orbitR =
            baseRadius *
            (p.radiusFactor -
              thinkBlend * 0.08 +
              Math.sin(t * 2.2 + p.phase) * 0.04);
          const tiltRot = p.phase * 0.35 + (prefersReducedMotion ? 0 : t * 0.15);
          const cosTilt = Math.cos(tiltRot);
          const sinTilt = Math.sin(tiltRot);

          const computePoint = (ang: number) => {
            const lx = Math.cos(ang) * orbitR;
            const ly = Math.sin(ang) * orbitR * p.tilt;
            return {
              x: cx + lx * cosTilt - ly * sinTilt,
              y: cy + lx * sinTilt + ly * cosTilt,
              depth: Math.sin(ang),
            };
          };

          const head = computePoint(p.angle);
          const tail = computePoint(p.angle - Math.sign(p.speed) * 0.22);
          const depthFactor = 0.55 + (head.depth + 1) * 0.225;
          const rgb = p.isCyan ? "103, 232, 249" : "96, 165, 250";

          // Motion trail
          const trailGrad = ctx.createLinearGradient(
            tail.x,
            tail.y,
            head.x,
            head.y
          );
          trailGrad.addColorStop(0, `rgba(${rgb}, 0)`);
          trailGrad.addColorStop(
            1,
            `rgba(${rgb}, ${0.55 * depthFactor * pAlphaScale})`
          );
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = p.size * 0.85 * dpr;
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(head.x, head.y);
          ctx.stroke();

          // Luminous particle node
          ctx.fillStyle = `rgba(224, 247, 250, ${
            0.9 * depthFactor * pAlphaScale
          })`;
          ctx.beginPath();
          ctx.arc(head.x, head.y, p.size * depthFactor * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 5c. Voice-reactive radial frequency spectrum bars around the circumference
      const voiceBarEnergy =
        isSpeaking || isListening ? Math.max(0.1, energy) : thinkBlend * 0.18;
      if (voiceBarEnergy > 0.02) {
        const barCount = 36;
        const barBaseR = baseRadius * 1.07;
        const barAlpha =
          (isExtremeDark ? 0.28 : 0.72) *
          (isSpeaking || isListening ? 1 : thinkBlend);
        ctx.save();
        for (let b = 0; b < barCount; b++) {
          const theta = (b / barCount) * Math.PI * 2 - Math.PI / 2;
          const wave =
            0.45 +
            0.55 *
              Math.abs(
                Math.sin(theta * 3 + t * (isSpeaking ? 7.5 : 4.8) + b * 0.35)
              );
          const barLen =
            (2.5 + voiceBarEnergy * (isSpeaking ? 20 : 15) * wave) * dpr;
          const x1 = cx + Math.cos(theta) * barBaseR;
          const y1 = cy + Math.sin(theta) * barBaseR;
          const x2 = cx + Math.cos(theta) * (barBaseR + barLen);
          const y2 = cy + Math.sin(theta) * (barBaseR + barLen);
          ctx.strokeStyle =
            b % 3 === 0
              ? `rgba(59, 130, 246, ${barAlpha})`
              : `rgba(${primaryRgb}, ${barAlpha})`;
          ctx.lineWidth = 1.6 * dpr;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. Center focal point
      const dotR = (3.5 + energy * 6 + thinkBlend * 2.5) * dpr;
      const dotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotR * 2.5);
      dotGrad.addColorStop(
        0,
        `rgba(224, 247, 250, ${
          isExtremeDark
            ? isSpeaking || isThinking
              ? 0.55
              : 0.32
            : isSpeaking || isThinking
            ? 0.95
            : 0.75
        })`
      );
      dotGrad.addColorStop(0.5, `rgba(${primaryRgb}, ${isExtremeDark ? 0.16 : 0.4})`);
      dotGrad.addColorStop(1, "rgba(34, 211, 238, 0)");
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [getInputLevel, getOutputLevel]);

  return (
    <button
      type="button"
      onClick={onOrbClick}
      aria-label={STATE_LABELS[voiceState]}
      className={`group relative flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-4 ${
        extremeDark
          ? "focus-visible:ring-offset-black"
          : "focus-visible:ring-offset-[#020408]"
      } transition-transform duration-200 active:scale-[0.97] cursor-pointer`}
    >
      <canvas
        ref={canvasRef}
        className={
          compact
            ? "w-[88px] h-[88px] sm:w-[104px] sm:h-[104px] block"
            : "w-[210px] h-[210px] sm:w-[258px] sm:h-[258px] lg:w-[292px] lg:h-[292px] block"
        }
      />
    </button>
  );
}
