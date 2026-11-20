/**
 * Minuteur serveur réel du Scheduler — JARVIS 4.0 Phase 5.
 *
 * ADDITIF : timer in-process, aucune dépendance externe, aucun cron distant.
 * Le Core reste la seule source de vérité : ce module appelle `schedulerTick()`
 * à intervalles réguliers, respecte STOP GLOBAL et s'arrête avec le processus.
 * L'intervalle est borné (5 s – 5 min) et configurable via
 * JARVIS_SCHEDULER_TICK_MS. En cas d'erreur, le tick est journalisé et le
 * minuteur continue : aucune tâche n'est perdue, aucun rattrapage en rafale.
 */
import type { JarvisCore } from "../../../src/core/JarvisCore.ts";

export interface SchedulerTimerHandle {
  intervalMs: number;
  stop: () => void;
}

export function resolveSchedulerIntervalMs(): number {
  const raw = Number(process.env.JARVIS_SCHEDULER_TICK_MS || 30_000);
  return Number.isFinite(raw) ? Math.max(5_000, Math.min(300_000, Math.floor(raw))) : 30_000;
}

export function startSchedulerTimer(core: JarvisCore): SchedulerTimerHandle {
  const intervalMs = resolveSchedulerIntervalMs();
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    // STOP GLOBAL est vérifié côté Core ; on évite simplement les appels inutiles.
    try {
      if (core.isStopped()) return;
    } catch {
      return;
    }
    void core.schedulerTick("server-timer").catch((err: unknown) => {
      console.warn("[scheduler] tick impossible :", (err as Error)?.message ?? err);
    });
  }, intervalMs);
  // Ne bloque pas l'arrêt du processus.
  (timer as unknown as { unref?: () => void }).unref?.();
  return {
    intervalMs,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
