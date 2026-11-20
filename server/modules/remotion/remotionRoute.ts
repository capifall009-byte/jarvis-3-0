import { Router } from "express";
import type { Request, Response } from "express";
import {
  cancelRemotionJob,
  createRemotionJob,
  getRemotionJob,
  getRemotionStatus,
  hasActiveRender,
  listRemotionJobs,
  type StartRemotionInput,
} from "./remotionService.ts";

/**
 * Routes Additives du service Remotion isolé.
 *
 * Montées sous /api : elles héritent automatiquement du middleware de sécurité
 * existant (auth par jeton si configurée + limitation de débit).
 * Aucune route existante n'est modifiée.
 */
export function createRemotionRouter(): Router {
  const router = Router();

  /** Capacités réelles détectées (binaire Remotion, formats, Gemini, HyperFrames). */
  router.get("/remotion/status", async (_req: Request, res: Response) => {
    try {
      res.json({ ...(await getRemotionStatus()), activeRender: hasActiveRender() });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Statut Remotion indisponible.",
      });
    }
  });

  router.get("/remotion/jobs", async (_req: Request, res: Response) => {
    try {
      res.json({ jobs: await listRemotionJobs() });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Liste des rendus indisponible.",
      });
    }
  });

  router.get("/remotion/jobs/:id", async (req: Request, res: Response) => {
    try {
      const job = await getRemotionJob(String(req.params.id || ""));
      if (!job) {
        res.status(404).json({ error: "Rendu Remotion introuvable." });
        return;
      }
      res.json({ job });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Statut du rendu indisponible.",
      });
    }
  });

  /** Lance un rendu réel de façon non bloquante (processus enfant détaché du HTTP). */
  router.post("/remotion/jobs", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
    if (prompt.length < 8) {
      res.status(400).json({
        error: "Décris ta vidéo en au moins 8 caractères.",
      });
      return;
    }

    const input: StartRemotionInput = {
      prompt,
      format: body.format as StartRemotionInput["format"],
      durationSec: body.durationSec as number,
      style: body.style as StartRemotionInput["style"],
    };

    try {
      const job = await createRemotionJob(input);
      if (!job) {
        res.status(409).json({
          error: "Un rendu Remotion est déjà en cours. Attends sa fin avant d'en lancer un autre.",
        });
        return;
      }
      res.status(202).json({ job });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Lancement du rendu impossible.",
      });
    }
  });

  /** Annule un rendu en cours (le processus Remotion est tué). */
  router.delete("/remotion/jobs/:id", async (req: Request, res: Response) => {
    try {
      const result = await cancelRemotionJob(String(req.params.id || ""));
      if (result === "not_found") {
        res.status(404).json({ error: "Rendu Remotion introuvable." });
        return;
      }
      if (result === "not_running") {
        res.status(409).json({ error: "Ce rendu n'est plus en cours." });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Annulation impossible.",
      });
    }
  });

  return router;
}
