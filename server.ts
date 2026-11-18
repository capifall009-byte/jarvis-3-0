import "dotenv/config";
import http from "node:http";
import path from "node:path";
import express from "express";
import { createGeminiRouter } from "./server/geminiRoute.ts";
import { createTtsRouter } from "./server/ttsRoute.ts";
import { createWebSearchRouter } from "./server/modules/webSearchRoute.ts";
import { createWebResearchRouter } from "./server/modules/webResearchRoute.ts";
import { createFilesRouter } from "./server/modules/filesRoute.ts";
import { createNewsRouter } from "./server/modules/newsRoute.ts";
import { createVideoRouter } from "./server/modules/videoRoute.ts";
import { createAiVideoRouter } from "./server/modules/aiVideoRoute.ts";
import { createSocialRouter } from "./server/modules/socialRoute.ts";
import { createApiSecurityMiddleware, createBasicAuthMiddleware } from "./server/modules/apiSecurity.ts";
import { migratePlaintextTokens } from "./server/modules/social/tokenStore.ts";

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

async function bootstrap() {
  // Migration additive des anciens tokens sociaux en clair (copie de sécurité conservée).
  try {
    const result = migratePlaintextTokens();
    if (result.migrated) console.log("[social] Tokens migrés vers un stockage chiffré.");
    else if (result.error) console.warn("[social] Migration tokens :", result.error);
  } catch (err) {
    console.warn("[social] Migration tokens indisponible :", err);
  }

  const app = express();
  // Protection globale si une exposition publique est configurée.
  const basicAuth = createBasicAuthMiddleware();
  if (basicAuth) app.use(basicAuth);
  app.use(express.json({ limit: "25mb" }));

  // Sécurisation API (désactivée en local par défaut, prête pour un déploiement distant).
  app.use("/api", createApiSecurityMiddleware());

  app.use("/api", createGeminiRouter());
  app.use("/api", createTtsRouter());
  app.use("/api", createWebSearchRouter());
  app.use("/api", createWebResearchRouter());
  app.use("/api", createFilesRouter());
  app.use("/api", createNewsRouter());
  app.use("/api", createVideoRouter());
  app.use("/api", createAiVideoRouter());
  app.use("/api", createSocialRouter());

  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(
      `JARVIS (Google Gemini + Neural TTS) server listening on http://0.0.0.0:${PORT}`
    );
  });
}

bootstrap().catch((err) => {
  console.error("Fatal server startup error:", err);
  process.exit(1);
});
