import { Router } from "express";
import type { Request, Response } from "express";
import {
  listVideoProviderInfos,
  getVideoProvider,
} from "./video/providers/ProviderRegistry.ts";
import { buildStoryboard } from "./video/StoryboardService.ts";
import { runVideoGeneration } from "./video/VideoGenerationService.ts";
import { getAiVideoJob, listAiVideoJobs } from "./video/VideoHistoryRepository.ts";
import type { VideoGenerationRequest } from "./video/VideoGenerationService.ts";

export function createAiVideoRouter(): Router {
  const router = Router();

  router.get("/video/ai/providers", (_req: Request, res: Response) => {
    res.json({ providers: listVideoProviderInfos() });
  });

  router.post("/video/ai/storyboard", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const input = {
        mode: (body.mode as "text" | "image" | "story") || "text",
        prompt: String(body.prompt ?? ""),
        story: body.story ? String(body.story) : undefined,
        durationSec: Number(body.durationSec) || 12,
        aspectRatio: (body.aspectRatio as "9:16" | "16:9" | "1:1") || "16:9",
        style: String(body.style ?? "cinematic"),
        cameraMotion: String(body.cameraMotion ?? "static"),
        characters: String(body.characters ?? ""),
        voiceover: Boolean(body.voiceover),
      };
      if (!input.prompt.trim() && !input.story?.trim()) {
        res.status(400).json({ error: "Prompt ou histoire requis." });
        return;
      }
      const scenes = await buildStoryboard(input);
      res.json({ scenes });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Échec du storyboard.",
      });
    }
  });

  router.post("/video/ai/generate", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Partial<VideoGenerationRequest> & {
        providerId?: string;
      };
      const request: VideoGenerationRequest = {
        mode: (body.mode as VideoGenerationRequest["mode"]) || "text",
        prompt: String(body.prompt ?? ""),
        story: body.story ? String(body.story) : undefined,
        imageBase64: body.imageBase64 ? String(body.imageBase64) : undefined,
        imageMimeType: body.imageMimeType ? String(body.imageMimeType) : undefined,
        durationSec: Number(body.durationSec) || 12,
        aspectRatio: (body.aspectRatio as VideoGenerationRequest["aspectRatio"]) || "16:9",
        style: (body.style as VideoGenerationRequest["style"]) || "cinematic",
        cameraMotion: (body.cameraMotion as VideoGenerationRequest["cameraMotion"]) || "static",
        transitions: Boolean(body.transitions),
        ambiance: String(body.ambiance ?? ""),
        voiceover: Boolean(body.voiceover),
        characters: String(body.characters ?? ""),
        scenes: Array.isArray(body.scenes) ? body.scenes : undefined,
      };
      if (!request.prompt.trim() && !request.story?.trim()) {
        res.status(400).json({ error: "Prompt ou histoire requis." });
        return;
      }
      const result = await runVideoGeneration(request, body.providerId);
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Échec de la génération vidéo.",
      });
    }
  });

  router.get("/video/ai/history", (_req: Request, res: Response) => {
    const items = listAiVideoJobs().map((j) => ({
      id: j.id,
      title: j.title,
      provider: j.provider,
      mode: j.mode,
      videoUrl: `/api/video/ai/output/${j.id}`,
      createdAt: j.createdAt,
      hasVideo: Boolean(j.filePath),
    }));
    res.json({ items });
  });

  router.get("/video/ai/output/:id", async (req: Request, res: Response) => {
    const job = getAiVideoJob(String(req.params.id));
    if (!job || !job.filePath) {
      res.status(404).json({ error: "Vidéo introuvable ou expirée." });
      return;
    }
    res.setHeader("Content-Type", job.mimeType || "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${job.title.replace(/[^a-z0-9_-]/gi, "_")}.mp4"`
    );
    res.sendFile(job.filePath);
  });

  return router;
}