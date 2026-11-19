import { Router } from "express";
import type { Request, Response } from "express";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

function sanitizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 1400);
}

function buildPollinationsUrl(prompt: string, opts?: { width?: number; height?: number; seed?: number; model?: string }): string {
  const width = Math.min(1536, Math.max(256, Math.round(opts?.width || 1024)));
  const height = Math.min(1536, Math.max(256, Math.round(opts?.height || 1024)));
  const seed = Number.isFinite(opts?.seed as number) ? Math.round(opts!.seed as number) : Math.floor(Math.random() * 1_000_000_000);
  const model = (opts?.model || "flux").replace(/[^a-zA-Z0-9._-]/g, "") || "flux";
  const encoded = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: "true",
    seed: String(seed),
    model,
    enhance: "true",
  });
  return `${POLLINATIONS_BASE}/${encoded}?${params.toString()}`;
}

function inferStyleSuffix(style?: string): string {
  const s = (style || "").toLowerCase();
  if (s.includes("real")) return "photorealistic, highly detailed, natural lighting, professional photography";
  if (s.includes("artist") || s.includes("peint")) return "artistic, expressive, rich textures, masterpiece illustration";
  if (s.includes("futur")) return "futuristic, sleek, holographic accents, neon cyan and blue lighting, sci-fi concept art";
  if (s.includes("pro") || s.includes("corpor")) return "professional, clean composition, modern, high quality, polished";
  if (s.includes("anime") || s.includes("manga")) return "anime style, vibrant, detailed illustration";
  return "";
}

export function createImageGenRouter(): Router {
  const router = Router();

  router.get("/images/status", (_req: Request, res: Response) => {
    res.json({
      available: true,
      provider: "pollinations",
      billing: "0€",
      note: "Génération d'images via Pollinations.ai (service public gratuit). Disponibilité et limites dépendantes du service tiers ; aucune garantie de permanence.",
      capabilities: { textToImage: true, styles: ["realistic", "artistic", "futuristic", "professional"], imageToImage: false, inpainting: false },
    });
  });

  router.post("/images/generate", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { prompt?: string; style?: string; width?: number; height?: number; seed?: number; model?: string };
      const rawPrompt = sanitizePrompt(String(body.prompt || ""));
      if (!rawPrompt) {
        res.status(400).json({ ok: false, error: "Le prompt de génération est requis." });
        return;
      }
      const styleSuffix = inferStyleSuffix(body.style);
      const finalPrompt = styleSuffix ? `${rawPrompt}, ${styleSuffix}` : rawPrompt;
      const url = buildPollinationsUrl(finalPrompt, { width: body.width, height: body.height, seed: body.seed, model: body.model });

      // Vérification best-effort (réelle) sans bloquer longtemps : HEAD peut ne pas être supporté, on tente un GET partiel.
      let verified: boolean | null = null;
      let verifyError: string | null = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const r = await fetch(url, { method: "GET", signal: ctrl.signal, headers: { "Range": "bytes=0-2047" } });
        clearTimeout(t);
        const ct = r.headers.get("content-type") || "";
        verified = r.ok && (ct.includes("image") || ct.includes("octet-stream"));
        if (!verified) verifyError = `Réponse inattendue du service (${r.status}${ct ? ", " + ct : ""}).`;
      } catch (e) {
        verified = null; // inconnu (réseau/timeout) — URL fournie, le client pourra tenter l'affichage
        verifyError = e instanceof Error ? e.message : "Vérification indisponible.";
      }

      res.json({
        ok: true,
        provider: "pollinations",
        billing: "0€",
        prompt: rawPrompt,
        finalPrompt,
        url,
        width: Math.min(1536, Math.max(256, Math.round(body.width || 1024))),
        height: Math.min(1536, Math.max(256, Math.round(body.height || 1024))),
        verified,
        verifyNote: verifyError,
        limitsNote: "Service public gratuit : temps de génération variable, limites/indisponibilités possibles. Aucune image n'est prétendue générée si le chargement échoue.",
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Erreur de génération d'image." });
    }
  });

  return router;
}
