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
import { createReelRouter } from "./server/modules/reelRoute.ts";
import { createHyperframesRouter } from "./server/modules/hyperframesRoute.ts";
import { createVideoStudioRouter } from "./server/modules/videoStudioRoute.ts";
import { createRemotionRouter } from "./server/modules/remotion/remotionRoute.ts";
import { createSocialRouter } from "./server/modules/socialRoute.ts";
import { createAiProvidersRouter } from "./server/modules/aiProvidersRoute.ts";
import { createOllamaRouter } from "./server/modules/ollamaRoute.ts";
import { createImageGenRouter } from "./server/modules/imageGenRoute.ts";
import { createCoreRouter } from "./server/modules/core/coreRoute.ts";
import { startSchedulerTimer } from "./server/modules/core/schedulerTimer.ts";
import {
  createApiSecurityMiddleware,
  createNetworkAccessMiddleware,
  describeAuthConfig,
} from "./server/modules/apiSecurity.ts";
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
  // Phase 9.5 : contrôle d'accès GLOBAL et fail-closed. Protège /api mais aussi
  // /reels, /hyperframes, /generated, le manifeste, le SW et la SPA.
  // Le mode loopback reste libre ; toute exposition distante exige un secret configuré.
  const authConfig = describeAuthConfig();
  app.use(createNetworkAccessMiddleware());
  console.log(
    `[sécurité] accès local autorisé ; exposition distante ${authConfig.basicConfigured || authConfig.bearerConfigured ? "authentifiée" : "refusée (aucun secret configuré)"} ; proxy explicitement configuré : ${authConfig.trustProxy}.`
  );
  app.use(express.json({ limit: "25mb" }));

  // Reels rendus (Remotion) : servis dans les deux modes, même si public/ n'est pas
  // recopié après le build de production.
  app.use("/reels", express.static(path.resolve(process.cwd(), "public", "reels")));

  // Vidéos rendues par Hyperframes (compositions HTML -> MP4).
  app.use(
    "/hyperframes",
    express.static(path.resolve(process.cwd(), "public", "hyperframes"))
  );

  // Vidéos générées par le Studio vidéo (script + voix off + Remotion).
  app.use(
    "/generated",
    express.static(path.resolve(process.cwd(), "public", "generated"))
  );

  // Limitation de débit /api (l'authentification est désormais globale, sans doublon).
  app.use("/api", createApiSecurityMiddleware());

  app.use("/api", createGeminiRouter());
  app.use("/api", createTtsRouter());
  app.use("/api", createWebSearchRouter());
  app.use("/api", createWebResearchRouter());
  app.use("/api", createFilesRouter());
  app.use("/api", createNewsRouter());
  app.use("/api", createVideoRouter());
  app.use("/api", createAiVideoRouter());
  app.use("/api", createReelRouter());
  app.use("/api", createHyperframesRouter());
  app.use("/api", createVideoStudioRouter());
  // Service Remotion isolé (routes additives, mêmes protections que les autres /api).
  app.use("/api", createRemotionRouter());
  app.use("/api", createSocialRouter());
  app.use("/api", createAiProvidersRouter());
  app.use("/api", createOllamaRouter());
  app.use("/api", createImageGenRouter());
  // Noyau Central Intelligence 4.0+ (additif, sous la même protection /api).
  // Phase 5 : le minuteur in-process démarre quand le Core est réellement prêt.
  app.use("/api", createCoreRouter({
    // Phase 9.5 : initialisation immédiate au démarrage, sans attendre la première requête /api.
    eagerStart: true,
    onReady: (core) => {
      const timer = startSchedulerTimer(core);
      console.log(`[scheduler] tick serveur actif toutes les ${timer.intervalMs} ms (in-process, STOP GLOBAL respecté).`);
    },
  }));

  const httpServer = http.createServer(app);

  if (!isProduction) {
    // En développement, éviter qu'un ancien Service Worker (PWA/prod) ne serve une UI obsolète.
    // Ce SW de dev se remplace lui-même et se désinscrit côté client, sans affecter la production.
    app.get("/sw.js", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(
        `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',(e)=>{e.waitUntil((async()=>{try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}catch{} try{await self.registration.unregister();}catch{} try{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});clients.forEach(c=>c.navigate(c.url));}catch{}})());});self.addEventListener('fetch',()=>{});`
      );
    });
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
