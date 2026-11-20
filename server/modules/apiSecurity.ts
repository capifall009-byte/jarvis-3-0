import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Sécurité d'accès réseau — JARVIS 4.0 (Phase 9.5).
 *
 * Principes :
 * - le mode local (connexion TCP loopback) reste utilisable sans secret ;
 * - toute connexion non loopback est refusée par défaut, même sans configuration ;
 * - une exposition réseau exige Basic et/ou Bearer configuré côté serveur ;
 * - Host, X-Forwarded-For et X-Real-IP sont NON FIABLES par défaut :
 *   ils ne sont consultés que si JARVIS_TRUST_PROXY=true est explicite ;
 * - aucun secret ni valeur de variable n'est journalisé ou renvoyé.
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
  "/api/remotion/jobs",
];
/** /api/health est une sonde non sensible : exempté du rate limit (mais pas de l'audit). */
const EXEMPT_PATHS = ["/api/gemini/health", "/api/health", "/api/news"];
/** Seule sonde autorisée sans identifiants lorsque l'exposition réseau est configurée. */
const PUBLIC_PROBE_PATH = "/api/health";

interface RateEntry {
  count: number;
  resetAt: number;
}

interface ConnectionAddress {
  /** Adresse TCP réelle retenue (ou adresse transmise par un proxy explicitement configuré). */
  address: string;
  /** Vrai uniquement si un proxy a été explicitement configuré et utilisé. */
  viaConfiguredProxy: boolean;
}

declare global {
  namespace Express {
    interface Request {
      /** Identité serveur dérivée de l'authentification ; jamais fournie par le client. */
      jarvisActor?: string;
    }
  }
}

const rateState = new Map<string, RateEntry>();

function isTrue(value: string | undefined): boolean {
  return String(value || "").toLowerCase() === "true";
}

function normalizeAddress(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  // IPv4-mappé en IPv6 : ::ffff:127.0.0.1 -> 127.0.0.1
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(raw);
  if (mapped) return mapped[1];
  if (raw === "::1") return "127.0.0.1";
  return raw.replace(/^\[|\]$/g, "");
}

/** Vrai pour les adresses de bouclage IPv4/IPv6. Aucune confiance dans Host ou XFF ici. */
export function isLoopbackAddress(value: string): boolean {
  const address = normalizeAddress(value);
  return address === "127.0.0.1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address);
}

function trustedProxyAddresses(): Set<string> {
  const configured = String(process.env.JARVIS_TRUSTED_PROXY_IPS || "")
    .split(",")
    .map((part) => normalizeAddress(part))
    .filter(Boolean);
  // Les adresses de bouclage sont des proxies locaux typiques (Render tunnel, nginx local).
  return new Set<string>([...configured, "127.0.0.1", "::1"]);
}

/**
 * Résout l'adresse de connexion réelle.
 * `req.socket.remoteAddress` est la source par défaut. Les en-têtes de proxy ne
 * sont lus que si JARVIS_TRUST_PROXY=true, et seulement depuis un pair configuré.
 */
export function resolveConnectionAddress(req: Request): ConnectionAddress {
  const socketAddress = normalizeAddress(req.socket?.remoteAddress || "");
  if (!isTrue(process.env.JARVIS_TRUST_PROXY)) {
    return { address: socketAddress, viaConfiguredProxy: false };
  }
  const trusted = trustedProxyAddresses();
  if (!trusted.has(socketAddress)) {
    return { address: socketAddress, viaConfiguredProxy: false };
  }
  const forwarded = String(req.get("x-forwarded-for") || "")
    .split(",")
    .map((part) => normalizeAddress(part))
    .filter(Boolean);
  // XFF : client, proxy1, proxy2. On ignore les proxies connus en partant de la droite.
  for (let index = forwarded.length - 1; index >= 0; index -= 1) {
    if (!trusted.has(forwarded[index])) {
      return { address: forwarded[index], viaConfiguredProxy: true };
    }
  }
  return { address: socketAddress, viaConfiguredProxy: false };
}

/**
 * Détecte une requête arrivant via un reverse proxy public (Render, Cloudflare…).
 *
 * Derrière ce type d'infrastructure, la socket TCP locale du proxy est souvent
 * une adresse de bouclage alors que le client réel se trouve sur Internet.
 * Accorder la confiance « local » dans ce cas contourne toute authentification.
 * Les signaux ci-dessous sont fournis par l'infrastructure elle-même :
 *  - en-têtes de forwarding (X-Forwarded-*, Cf-Connecting-Ip, Cf-Ray…) ;
 *  - en-tête Host explicite qui n'est pas une adresse locale.
 *
 * Un Host ABSENT (appel IPC/tests unitaires) n'est PAS considéré comme public :
 * le comportement local historique reste inchangé.
 */
export function isPublicProxyRequest(req: Request): boolean {
  const forwardingHeaders = [
    "x-forwarded-for",
    "x-forwarded-proto",
    "x-forwarded-host",
    "x-forwarded-port",
    "cf-connecting-ip",
    "cf-ray",
    "true-client-ip",
    "x-real-ip",
  ];
  if (forwardingHeaders.some((name) => !!String(req.get(name) || "").trim())) return true;

  const host = String(req.get("host") || "").trim().toLowerCase();
  if (!host) return false;
  const hostname = host.replace(/^\[|\]$/g, "").split(":")[0];
  const local =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost");
  return !local;
}

/** Identité attribuée par le serveur après authentification (jamais depuis le client). */
export function authenticatedActor(req: Request): string | null {
  return req.jarvisActor ?? null;
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

export function safeEqual(a: string, b: string): boolean {
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
  res.setHeader("Cache-Control", "no-store");
}

function checkRateLimit(req: Request, res: Response, pathname: string): boolean {
  const now = Date.now();
  const key = `${clientKey(req)}|${routeLimit(pathname)}`;
  let entry = rateState.get(key);
  if (!entry || entry.resetAt <= now) {
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

function pathnameOf(req: Request): string {
  return String(req.originalUrl || req.path || "").split("?")[0];
}

function basicCredentials(req: Request, user: string, pass: string): boolean {
  const header = String(req.get("authorization") || "");
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return false;
    return safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), pass);
  } catch {
    return false;
  }
}

function bearerCredential(req: Request, token: string): boolean {
  const header = String(req.get("authorization") || "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const provided = bearer || String(req.get("x-jarvis-token") || "").trim();
  return !!provided && safeEqual(provided, token);
}

export interface AuthConfigView {
  localLoopbackAllowed: boolean;
  basicConfigured: boolean;
  bearerConfigured: boolean;
  bearerRequired: boolean;
  trustProxy: boolean;
}

/** Configuration publique (sans secret) : utile pour les journaux et les tests. */
export function describeAuthConfig(): AuthConfigView {
  return {
    localLoopbackAllowed: true,
    basicConfigured: !!(process.env.JARVIS_PUBLIC_BASIC_USER && process.env.JARVIS_PUBLIC_BASIC_PASS),
    bearerConfigured: !!String(process.env.JARVIS_API_TOKEN || "").trim(),
    bearerRequired: isTrue(process.env.JARVIS_REQUIRE_AUTH),
    trustProxy: isTrue(process.env.JARVIS_TRUST_PROXY),
  };
}

/**
 * Contrôle d'accès GLOBAL : protège /api mais aussi les fichiers générés
 * (/reels, /hyperframes, /generated), le manifeste, le Service Worker et la SPA.
 */
export function createNetworkAccessMiddleware(): RequestHandler {
  const basicUser = String(process.env.JARVIS_PUBLIC_BASIC_USER || "").trim();
  const basicPass = String(process.env.JARVIS_PUBLIC_BASIC_PASS || "").trim();
  const basicConfigured = !!basicUser && !!basicPass;
  const token = String(process.env.JARVIS_API_TOKEN || "").trim();
  const bearerRequired = isTrue(process.env.JARVIS_REQUIRE_AUTH);

  return (req: Request, res: Response, next: NextFunction): void => {
    applyHeaders(res);
    const address = resolveConnectionAddress(req).address;
    // La confiance « local » n'est accordée que si la socket est loopback ET
    // qu'aucun signal de proxy public n'est présent. Sur Render/Cloudflare la
    // socket est loopback mais le client est distant : l'authentification reste requise.
    if (isLoopbackAddress(address) && !isPublicProxyRequest(req)) {
      req.jarvisActor = "local";
      next();
      return;
    }

    const pathname = pathnameOf(req);
    const isProbe = req.method === "GET" && pathname === PUBLIC_PROBE_PATH;
    if (isProbe) {
      // Sonde d'hébergement : non sensible, reste accessible même sans secret configuré.
      req.jarvisActor = "probe";
      next();
      return;
    }

    // Échec sécurisé : si JARVIS_REQUIRE_AUTH est explicite, au moins un secret
    // doit être configuré côté serveur. Sans secret, aucune exposition distante.
    if (bearerRequired && !basicConfigured && !token) {
      res.status(503).json({ error: "Authentification API non configurée côté serveur.", code: "AUTH_NOT_CONFIGURED" });
      return;
    }

    // Basic OU Bearer sont acceptés dès que l'un des deux est configuré.
    if (basicConfigured && basicCredentials(req, basicUser, basicPass)) {
      req.jarvisActor = "authenticated-basic";
      next();
      return;
    }
    if (token && bearerCredential(req, token)) {
      req.jarvisActor = "api-token";
      next();
      return;
    }

    if (!basicConfigured && !token) {
      res.status(503).json({
        error: "Exposition réseau non configurée : authentification requise côté serveur.",
        code: "AUTH_NOT_CONFIGURED",
      });
      return;
    }

    // Identifiants absents ou invalides : jamais de contournement Host/XFF.
    if (basicConfigured) res.setHeader("WWW-Authenticate", 'Basic realm="JARVIS 4.0"');
    else res.setHeader("WWW-Authenticate", "Bearer");
    res.status(401).json({ error: "Authentification requise ou invalide.", code: "UNAUTHORIZED" });
  };
}

/**
 * Compatibilité : l'ancien middleware Basic est remplacé par le contrôle global
 * sans contournement via l'en-tête Host. Monté globalement dans server.ts.
 */
export function createBasicAuthMiddleware(): RequestHandler {
  return createNetworkAccessMiddleware();
}

/** Limitation de débit seule. L'authentification est centralisée dans le contrôle global. */
export function createApiSecurityMiddleware(): RequestHandler {
  const rateEnabled = !isTrue(process.env.JARVIS_RATE_LIMIT_DISABLED);
  return (req: Request, res: Response, next: NextFunction): void => {
    applyHeaders(res);
    const pathname = pathnameOf(req);
    if (rateEnabled && !EXEMPT_PATHS.some((p) => pathname === p)) {
      if (!checkRateLimit(req, res, pathname)) return;
    }
    next();
  };
}
