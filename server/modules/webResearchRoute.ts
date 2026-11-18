import { Router } from "express";
import type { Request, Response } from "express";
import { classifyGeminiError, JARVIS_GEMINI_MODEL } from "../geminiClient.ts";
import { planWebResearch, runWebResearch } from "./web/WebResearchService.ts";

/** Module 7.3 — endpoints dédiés, additifs aux routes /web/search, /web/inspect, /web/compare. */
export function createWebResearchRouter(): Router {
  const router = Router();

  /** Planification seule : exactement 1 appel Gemini, aucune exploration de sources. */
  router.post("/web/research/plan", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { question?: unknown; known?: unknown };
      const result = await planWebResearch(body.question, body.known);
      if (result.httpStatus >= 400 || !result.plan) {
        res.status(result.httpStatus).json({
          error: result.error || "Planification indisponible.",
          code: "RESEARCH_PLAN_FAILED",
          model: JARVIS_GEMINI_MODEL,
        });
        return;
      }
      res.json({ plan: result.plan, model: JARVIS_GEMINI_MODEL });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.message, code: classified.code });
    }
  });

  router.post("/web/research", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { question?: unknown; known?: unknown };
      const result = await runWebResearch(body.question, body.known);
      res.status(result.httpStatus).json(result.body);
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.message, code: classified.code });
    }
  });

  return router;
}
