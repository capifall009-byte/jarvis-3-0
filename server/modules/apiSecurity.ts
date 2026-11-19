import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Sécurisation des API — préparation au déploiement Web distant.
 *
 * Conçu pour être ADDITIF et NON BLOQUANT en local :
 * - JARVIS_REQUIRE_AUTH="true" active l'authentification par jeton partagé ;
 * - sans configuration, le fonctionnement local actuel est préservé ;
 * - la limitation de débit est active par défaut mais généreuse.
 *
 * Aucun secret n'est renvoyé au client et aucun service externe n'est ajouté.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 180;
const EXPENSIVE_LIMIT = 30;
const EXPENSIVE_PATHS = [
  "/api/gemini",
  "/api/tts",
  "/api/siri",
  "/api/web/search",
  "/api/web/inspect",
  "/api/web/compare",
  "/api/files/analyze",
  "/api/video/ai/generate",
  "/api/reels/render",
];
const EXEMPT_PATHS = ["/api/gemini/health", "/api/news"];

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateState = new Map<string, RateEntry>();

function isTrue(value: string | undefined): boolean {
  return String(value || "").toLowerCase() === "true";
}

function clientKey(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function routeLimit(pathname: string): number {
  if (EXPENSIVE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return EXPENSIVE_LIMIT;
  }
  return DEFAULT_LIMIT;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function applyHeaders(res: Response): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(self)");
}

function checkRateLimit(req: Request, res: Response, pathname: string): boolean {
  const now = Date.now();
  const key = `${clientKey(req)}|${routeLimit(pathname)}`;
  let entry = rateState.get(key);
  if (!entry || entry.resetAt <= now) {
    // Nettoyage opportuniste pour éviter une croissance sans borne.
    if (rateState.size > 2000) {
      for (const [k, v] of rateState) {
        if (v.resetAt <= now) rateState.delete(k);
      }
    }
    entry = { count: 0, resetAt: now + DEFAULT_WINDOW_MS };
    rateState.set(key, entry);
  }
  entry.count += 1;
  const limit = routeLimit(pathname);
  if (entry.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
      code: "RATE_LIMITED",
    });
    return false;
  }
  return true;
}

/** Auth Basic pour une exposition publique : protège aussi la page d'accueil afin que
 *  le navigateur affiche l'invite de connexion dès la première navigation. */
export function createBasicAuthMiddleware(): RequestHandler | null {
  const basicUser = String(process.env.JARVIS_PUBLIC_BASIC_USER || "").trim();
  const basicPass = String(process.env.JARVIS_PUBLIC_BASIC_PASS || "").trim();
  if (!basicUser || !basicPass) return null;

  return (req: Request, res: Response, next: NextFunction): void => {
    // L'accès local reste libre (développement) ; seule l'exposition distante est protégée.
    const host = String(req.hostname || "").toLowerCase();
    const pathname = String(req.originalUrl || req.path || "").split("?")[0];
    // /api/health ne révèle aucun secret : laissé accessible aux sondes de l'hébergeur.
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      pathname === "/api/health"
    ) {
      next();
      return;
    }
    const header = String(req.get("authorization") || "");
    let ok = false;
    if (header.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
        const sep = decoded.indexOf(":");
        if (sep >= 0) {
          ok = safeEqual(decoded.slice(0, sep), basicUser) &&
            safeEqual(decoded.slice(sep + 1), basicPass);
        }
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      res.setHeader("WWW-Authenticate", 'Basic realm="JARVIS 3.0"');
      res.status(401).json({ error: "Authentification requise.", code: "BASIC_AUTH_REQUIRED" });
      return;
    }
    next();
  };
}

export function createApiSecurityMiddleware(): RequestHandler {
  const requireAuth = isTrue(process.env.JARVIS_REQUIRE_AUTH);
  const configuredToken = String(process.env.JARVIS_API_TOKEN || "").trim();
  const rateEnabled = !isTrue(process.env.JARVIS_RATE_LIMIT_DISABLED);

  if (requireAuth && !configuredToken) {
    console.warn(
      "[apiSecurity] JARVIS_REQUIRE_AUTH=true mais JARVIS_API_TOKEN est absent : toutes les routes /api seront refusées."
    );
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    applyHeaders(res);

    // L'authentification Basic est appliquée globalement dans server.ts.

    if (requireAuth) {
      if (!configuredToken) {
        res.status(503).json({
          error: "Authentification API non configurée côté serveur.",
          code: "AUTH_NOT_CONFIGURED",
        });
        return;
      }
      const header = String(req.get("authorization") || "");
      const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      const provided = bearer || String(req.get("x-jarvis-token") || "").trim();
      if (!provided || !safeEqual(provided, configuredToken)) {
        res.setHeader("WWW-Authenticate", "Bearer");
        res.status(401).json({ error: "Jeton API requis ou invalide.", code: "UNAUTHORIZED" });
        return;
      }
    }

    // req.path est relatif au montage "/api" : utiliser l'URL d'origine pour les comparaisons.
    const pathname = (req.originalUrl || req.path).split("?")[0];
    if (rateEnabled && !EXEMPT_PATHS.some((p) => pathname === p)) {
      if (!checkRateLimit(req, res, pathname)) return;
    }

    next();
  };
}
