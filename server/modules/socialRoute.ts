import { randomBytes } from "node:crypto";
import { ThinkingLevel } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import { Router } from "express";
import type { Request, Response } from "express";
import {
  JARVIS_GEMINI_FALLBACK_MODEL,
  JARVIS_GEMINI_MODEL,
  classifyGeminiError,
  getGeminiClient,
  isGeminiConfigured,
} from "../geminiClient.ts";
import {
  WebSecurityError,
  toSafeClientErrorMessage,
  validateSupportedSocialLink,
} from "./webSecurity.ts";
import {
  buildInstagramAuthUrl,
  buildTikTokAuthUrl,
  exchangeInstagramCode,
  exchangeTikTokCode,
  fetchInstagramDashboard,
  fetchTikTokDashboard,
  getInstagramConfig,
  getTikTokConfig,
  permissionsFromToken,
} from "./social/platforms.ts";
import { deleteStoredToken, getStoredToken, saveStoredToken } from "./social/tokenStore.ts";

type Platform = "tiktok" | "instagram";

function platformFromParam(p: unknown): Platform | null {
  return p === "tiktok" || p === "instagram" ? p : null;
}

function now() {
  return Date.now();
}

// State OAuth à usage unique, conservé en mémoire côté serveur (10 minutes).
// Empêche qu'un callback forgeé puisse exchanger un code pour le compte de l'utilisateur.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStates = new Map<string, { platform: Platform; expiresAt: number }>();

function createOauthState(platform: Platform): string {
  const state = randomBytes(24).toString("hex");
  // Nettoyage opportuniste des entrées expirées (pas de minuteur persistant).
  const current = now();
  for (const [key, value] of oauthStates) {
    if (value.expiresAt <= current) oauthStates.delete(key);
  }
  oauthStates.set(state, { platform, expiresAt: current + OAUTH_STATE_TTL_MS });
  return state;
}

function consumeOauthState(state: string, platform: Platform): boolean {
  if (!state) return false;
  const entry = oauthStates.get(state);
  oauthStates.delete(state); // usage unique, même en cas d'échec
  return !!entry && entry.platform === platform && entry.expiresAt > now();
}

function publicAccount(platform: Platform, reqOrigin?: string) {
  const token = getStoredToken(platform);
  const cfg = platform === "tiktok" ? getTikTokConfig(reqOrigin) : getInstagramConfig(reqOrigin);
  const permissions = permissionsFromToken(token);
  const eligibilityNotes = cfg.notes;
  const limitations: string[] = [];
  if (!cfg.configured) {
    limitations.push(
      "Connexion OAuth indisponible : variables d'environnement de l'application développeur non configurées côté serveur."
    );
  }
  if (platform === "instagram") {
    limitations.push(
      "Instagram Graph API : compte Instagram Business/Creator lié à une Page Facebook généralement requis pour insights et publication."
    );
  }
  if (platform === "tiktok") {
    limitations.push(
      "TikTok : les endpoints de statistiques/publication dépendent des produits API approuvés (Login Kit, Content Posting API, etc.) et de la revue d'application."
    );
  }
  return {
    platform,
    status: token ? "connected" : cfg.configured ? "configured" : "disconnected",
    accountId: token?.accountId,
    username: token?.username,
    displayName: token?.displayName,
    avatarUrl: token?.avatarUrl,
    permissions,
    connectedAt: token?.connectedAt,
    lastSyncAt: token?.updatedAt,
    eligibilityNotes,
    limitations,
    error: undefined as string | undefined,
  };
}

async function geminiGenerate(prompt: string, systemInstruction: string): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY non configurée côté serveur.");
  }
  const ai = getGeminiClient();
  let activeModel = JARVIS_GEMINI_MODEL;
  let response: GenerateContentResponse;
  try {
    response = await ai.models.generateContent({
      model: JARVIS_GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
    });
  } catch (primaryErr) {
    const classified = classifyGeminiError(primaryErr);
    if (classified.status === 503 || classified.status === 404) {
      activeModel = JARVIS_GEMINI_FALLBACK_MODEL;
      response = await ai.models.generateContent({
        model: JARVIS_GEMINI_FALLBACK_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
    } else {
      throw classified;
    }
  }
  void activeModel;
  return (
    response.text
      ?.replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      .trim() || ""
  );
}

export function createSocialRouter(): Router {
  const router = Router();

  router.get("/social/config", (req: Request, res: Response) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({
      tiktok: getTikTokConfig(origin),
      instagram: getInstagramConfig(origin),
    });
  });

  router.get("/social/accounts", (req: Request, res: Response) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({
      accounts: [publicAccount("tiktok", origin), publicAccount("instagram", origin)],
      fetchedAt: now(),
    });
  });

  router.get("/social/oauth/:platform/start", (req: Request, res: Response) => {
    const platform = platformFromParam(req.params.platform);
    if (!platform) {
      res.status(400).json({ error: "Plateforme invalide." });
      return;
    }
    const origin = `${req.protocol}://${req.get("host")}`;
    const state = createOauthState(platform);
    const url = platform === "tiktok" ? buildTikTokAuthUrl(state, origin) : buildInstagramAuthUrl(state, origin);
    if (!url) {
      const cfg = platform === "tiktok" ? getTikTokConfig(origin) : getInstagramConfig(origin);
      res.status(400).json({
        error: "Connexion OAuth non configurée pour cette plateforme.",
        missingEnv: cfg.missingEnv,
        notes: cfg.notes,
        redirectUri: cfg.redirectUri,
      });
      return;
    }
    // Ne jamais exposer de secret; on renvoie uniquement l'URL d'autorisation officielle.
    res.json({ platform, authUrl: url, redirectUri: (platform === "tiktok" ? getTikTokConfig(origin) : getInstagramConfig(origin)).redirectUri });
  });

  router.get("/social/oauth/:platform/callback", async (req: Request, res: Response) => {
    const platform = platformFromParam(req.params.platform);
    if (!platform) {
      res.status(400).send("Plateforme invalide.");
      return;
    }
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!consumeOauthState(state, platform)) {
      res.status(400).send("État OAuth absent, invalide ou expiré. Recommencez la connexion.");
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const err = typeof req.query.error === "string" ? req.query.error : "";
    const errDesc = typeof req.query.error_description === "string" ? req.query.error_description : "";
    if (err) {
      res.status(400).send(`Autorisation refusée ou échouée: ${err} ${errDesc}`.trim());
      return;
    }
    if (!code) {
      res.status(400).send("Code d'autorisation manquant.");
      return;
    }
    try {
      const origin = `${req.protocol}://${req.get("host")}`;
      const token = platform === "tiktok"
        ? await exchangeTikTokCode(code, origin)
        : await exchangeInstagramCode(code, origin);
      saveStoredToken(token);
      // Redirection vers l'app (sans exposer de jeton)
      res.redirect(`/?view=social&connected=${platform}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec de l'échange OAuth.";
      res.status(500).send(`Échec connexion ${platform}: ${msg}`);
    }
  });

  router.post("/social/:platform/disconnect", (req: Request, res: Response) => {
    const platform = platformFromParam(req.params.platform);
    if (!platform) {
      res.status(400).json({ error: "Plateforme invalide." });
      return;
    }
    deleteStoredToken(platform);
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({ ok: true, platform, account: publicAccount(platform, origin) });
  });

  router.get("/social/:platform/dashboard", async (req: Request, res: Response) => {
    const platform = platformFromParam(req.params.platform);
    if (!platform) {
      res.status(400).json({ error: "Plateforme invalide." });
      return;
    }
    const token = getStoredToken(platform);
    const fetchedAt = now();
    if (!token) {
      res.json({
        platform,
        fetchedAt,
        followers: null,
        metrics: {
          views: { label: "Vues", value: null, unavailableReason: "Compte non connecté." },
          likes: { label: "Likes", value: null, unavailableReason: "Compte non connecté." },
          comments: { label: "Commentaires", value: null, unavailableReason: "Compte non connecté." },
          shares: { label: "Partages", value: null, unavailableReason: "Compte non connecté." },
        },
        evolution: [],
        recentPosts: [],
        limitations: ["Aucune donnée disponible : compte non connecté via OAuth officiel."],
        dataSource: "unavailable",
      });
      return;
    }

    try {
      if (platform === "tiktok") {
        const api = await fetchTikTokDashboard(token.accessToken);
        const json = api.json || {};
        const ok = api.ok && !json.error?.code;
        const videos = Array.isArray(json.data?.videos) ? json.data.videos : [];
        const recentPosts = videos.map((v: any) => ({
          id: String(v.id || ""),
          platform: "tiktok",
          title: v.title || undefined,
          caption: v.video_description || undefined,
          publishedAt: v.create_time ? Number(v.create_time) * 1000 : undefined,
          permalink: v.share_url || undefined,
          thumbnailUrl: v.cover_image_url || undefined,
          views: typeof v.view_count === "number" ? v.view_count : null,
          likes: typeof v.like_count === "number" ? v.like_count : null,
          comments: typeof v.comment_count === "number" ? v.comment_count : null,
          shares: typeof v.share_count === "number" ? v.share_count : null,
          unavailableReason: ok ? undefined : "Données non accessibles via l'API avec les permissions actuelles.",
        }));
        const sum = (key: string) => videos.reduce((acc: number, v: any) => acc + (typeof v[key] === "number" ? v[key] : 0), 0);
        const hasAny = videos.length > 0;
        res.json({
          platform,
          accountId: token.accountId,
          username: token.username,
          fetchedAt,
          followers: null, // TikTok user info followers nécessite champs/permissions spécifiques
          metrics: {
            views: { label: "Vues", value: hasAny ? sum("view_count") : null, unavailableReason: hasAny ? undefined : "Indisponible via l'API/permissions actuelles." },
            likes: { label: "Likes", value: hasAny ? sum("like_count") : null, unavailableReason: hasAny ? undefined : "Indisponible via l'API/permissions actuelles." },
            comments: { label: "Commentaires", value: hasAny ? sum("comment_count") : null, unavailableReason: hasAny ? undefined : "Indisponible via l'API/permissions actuelles." },
            shares: { label: "Partages", value: hasAny ? sum("share_count") : null, unavailableReason: hasAny ? undefined : "Indisponible via l'API/permissions actuelles." },
          },
          evolution: [],
          recentPosts,
          limitations: ok
            ? ["Nombre d'abonnés et évolution historique peuvent être indisponibles selon les permissions/produits TikTok approuvés."]
            : [`Données TikTok non accessibles (statut API ${api.status}). Vérifiez les permissions/scopes approuvés et l'éligibilité du compte.`, JSON.stringify(json.error || json).slice(0, 300)],
          dataSource: ok ? "api" : "unavailable",
        });
        return;
      }

      // Instagram
      const api = await fetchInstagramDashboard(token.accessToken, token.accountId);
      const profile = api.profile || {};
      const mediaData = Array.isArray(api.media?.data) ? api.media.data : [];
      const followers = typeof profile.followers_count === "number" ? profile.followers_count : null;
      const recentPosts = mediaData.map((m: any) => ({
        id: String(m.id || ""),
        platform: "instagram",
        caption: m.caption || undefined,
        publishedAt: m.timestamp ? Date.parse(m.timestamp) : undefined,
        permalink: m.permalink || undefined,
        thumbnailUrl: m.thumbnail_url || m.media_url || undefined,
        views: null, // nécessite insights média spécifiques
        likes: typeof m.like_count === "number" ? m.like_count : null,
        comments: typeof m.comments_count === "number" ? m.comments_count : null,
        shares: null,
        unavailableReason: "Vues/partages/portée nécessitent des insights média et permissions spécifiques (instagram_manage_insights).",
      }));
      const likesTotal = mediaData.reduce((acc: number, m: any) => acc + (typeof m.like_count === "number" ? m.like_count : 0), 0);
      const commentsTotal = mediaData.reduce((acc: number, m: any) => acc + (typeof m.comments_count === "number" ? m.comments_count : 0), 0);
      const hasMedia = mediaData.length > 0;
      const limitations: string[] = [];
      if (!token.accountId) limitations.push("Compte Instagram Business/Creator lié non identifié ; connectez un compte professionnel lié à une Page.");
      if (api.insights?.error) limitations.push("Insights compte indisponibles (permission instagram_manage_insights ou éligibilité manquante).");
      if (profile.error) limitations.push("Profil/statistiques compte partiellement inaccessibles avec les permissions actuelles.");
      res.json({
        platform,
        accountId: token.accountId,
        username: token.username || profile.username,
        fetchedAt,
        followers,
        metrics: {
          views: { label: "Vues", value: null, unavailableReason: "Insights média requis (non disponibles sans permissions/éligibilité)." },
          likes: { label: "Likes", value: hasMedia ? likesTotal : null, unavailableReason: hasMedia ? undefined : "Aucune publication accessible ou permissions insuffisantes." },
          comments: { label: "Commentaires", value: hasMedia ? commentsTotal : null, unavailableReason: hasMedia ? undefined : "Aucune publication accessible ou permissions insuffisantes." },
          shares: { label: "Partages", value: null, unavailableReason: "Non fourni par défaut par l'API pour ces médias/permissions." },
        },
        evolution: [],
        recentPosts,
        limitations,
        dataSource: (api.ok && !profile.error) ? "api" : "unavailable",
      });
    } catch (e) {
      res.status(502).json({
        error: e instanceof Error ? e.message : "Échec récupération statistiques.",
      });
    }
  });

  router.post("/social/analyze", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { platform?: "tiktok" | "instagram" | "all"; question?: string; dashboards?: any[] };
      const dashboards = Array.isArray(body.dashboards) ? body.dashboards : [];
      const question = typeof body.question === "string" && body.question.trim()
        ? body.question.trim()
        : "Analyse les performances et propose des améliorations concrètes.";
      const systemInstruction = [
        "Tu es JARVIS, analyste des réseaux sociaux.",
        "Tu dois t'appuyer UNIQUEMENT sur les données réelles fournies dans le contexte JSON.",
        "N'invente jamais de statistiques, de tendances chiffrées ou de résultats non présents.",
        "Si une donnée est manquante ou null, indique-le clairement et explique la limite.",
        "Réponds en français, de façon structurée et actionnable, sans markdown décoratif inutile.",
      ].join("\n");
      const prompt = `Contexte données (JSON):\n${JSON.stringify({ platform: body.platform || "all", dashboards }, null, 2)}\n\nDemande:\n${question}\n\nProduis: 1) synthèse des performances observées, 2) contenus les plus performants (si données), 3) comparaisons possibles, 4) points faibles, 5) améliorations, 6) recommandations d'horaires uniquement si les données temporelles le permettent (sinon préciser l'absence de données), 7) idées de contenu adaptées.`;
      const analysis = await geminiGenerate(prompt, systemInstruction);
      res.json({ analysis, generatedAt: now(), usedGemini: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec analyse.";
      const status = /GEMINI_API_KEY/i.test(msg) ? 503 : 502;
      res.status(status).json({ error: msg, usedGemini: false });
    }
  });

  router.post("/social/content/generate", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        platform?: "tiktok" | "instagram" | "both";
        topic?: string;
        tone?: string;
        sourceVideo?: { id?: string; title?: string } | null;
        count?: number;
      };
      const platform = body.platform || "both";
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      const tone = typeof body.tone === "string" ? body.tone.trim() : "engageant";
      const count = Math.max(1, Math.min(5, Number(body.count) || 3));
      if (!topic) {
        res.status(400).json({ error: "Sujet/thème requis." });
        return;
      }
      const systemInstruction = [
        "Tu es JARVIS, stratège de contenu short-form (TikTok/Instagram Reels).",
        "Génère du contenu original, concret et exploitable.",
        "Respecte les bonnes pratiques de chaque plateforme quand pertinent.",
        "Réponds STRICTEMENT en JSON valide (sans texte autour).",
      ].join("\n");
      const prompt = `Plateforme cible: ${platform}\nTon: ${tone}\nSujet: ${topic}\nVidéo source (optionnelle): ${JSON.stringify(body.sourceVideo || null)}\nNombre d'idées: ${count}\n\nRetourne un objet JSON: {"ideas":[{"idea":"","hook":"","script":"","description":"","hashtags":["#..."],"subtitles":"","title":"","calendarSuggestion":""}]}`;
      const text = await geminiGenerate(prompt, systemInstruction);
      let parsed: any = null;
      try {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
      } catch {
        parsed = { ideas: [], raw: text };
      }
      res.json({ platform, topic, tone, result: parsed, generatedAt: now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec génération contenu.";
      const status = /GEMINI_API_KEY/i.test(msg) ? 503 : 502;
      res.status(status).json({ error: msg });
    }
  });

  router.post("/social/link/analyze", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { url?: string };
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      res.status(400).json({ error: "URL requise." });
      return;
    }

    let validated;
    try {
      // Valide/normalise l'URL entrante, n'autorise que les protocoles et domaines/formats
      // réellement pris en charge (TikTok/Instagram) et empêche l'usage de liens ambigus.
      validated = validateSupportedSocialLink(rawUrl);
    } catch (err) {
      if (err instanceof WebSecurityError) {
        const safe = toSafeClientErrorMessage(err);
        res.status(safe.status).json({ error: safe.error, code: safe.code });
        return;
      }
      res.status(400).json({ error: "URL invalide. Vérifiez le format du lien." });
      return;
    }

    const { platform, normalizedUrl } = validated;
    const limitations: string[] = [
      "Analyse réalisée uniquement via accès autorisés/officiels disponibles (oEmbed/API). Aucun scraping non autorisé ni contournement de restrictions.",
    ];
    let accessible = false;
    let extracted: any = {};

    try {
      if (platform === "tiktok") {
        // TikTok oEmbed officiel (public, sans scraping). URL normalisée/validée encodée comme paramètre.
        const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(normalizedUrl)}`;
        const o = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
        const oj = await o.json().catch(() => ({}));
        if (o.ok && !oj.error) {
          accessible = true;
          extracted = {
            title: typeof oj.title === "string" ? oj.title : undefined,
            author: typeof oj.author_name === "string" ? oj.author_name : undefined,
            thumbnailUrl: typeof oj.thumbnail_url === "string" ? oj.thumbnail_url : undefined,
            html: typeof oj.html === "string" ? oj.html : undefined,
          };
        } else {
          limitations.push("oEmbed TikTok inaccessible pour ce lien ou refusé.");
        }
      } else if (platform === "instagram") {
        // Instagram oEmbed requiert généralement un access token/app Meta autorisé.
        const token = getStoredToken("instagram");
        if (!token) {
          limitations.push("Instagram oEmbed nécessite un accès API/app Meta autorisé (token) ; compte non connecté, extraction indisponible.");
        } else {
          const endpoint = `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(normalizedUrl)}&access_token=${encodeURIComponent(token.accessToken)}`;
          const o = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
          const oj = await o.json().catch(() => ({}));
          if (o.ok && !oj.error) {
            accessible = true;
            extracted = {
              title: typeof oj.title === "string" ? oj.title : undefined,
              author: typeof oj.author_name === "string" ? oj.author_name : undefined,
              thumbnailUrl: typeof oj.thumbnail_url === "string" ? oj.thumbnail_url : undefined,
              html: typeof oj.html === "string" ? oj.html : undefined,
            };
          } else {
            limitations.push("oEmbed Instagram inaccessible (permission/éligibilité/app review ou URL non prise en charge).");
          }
        }
      }
    } catch {
      limitations.push("Échec de récupération via endpoint officiel (délai dépassé ou service inaccessible).");
    }

    let analysis: any = undefined;
    if (accessible || extracted.title || extracted.author) {
      try {
        const systemInstruction = [
          "Tu es JARVIS, analyste créatif de contenus short-form.",
          "Analyse uniquement les informations accessibles fournies ; n'invente pas de détails invisibles (montage exact, métriques, etc.).",
          "Propose des idées originales inspirées, sans copier.",
          "Réponds en français, structuré et concis.",
        ].join("\n");
        const prompt = `URL: ${normalizedUrl}\nPlateforme: ${platform}\nDonnées extraites (JSON): ${JSON.stringify(extracted)}\n\nAnalyse le style, les accroches probables, les tendances suggérées par les éléments disponibles, et propose des idées originales adaptées. Si des éléments ne sont pas observables, indique-le.`;
        const text = await geminiGenerate(prompt, systemInstruction);
        analysis = { summary: text };
      } catch {
        limitations.push("Analyse IA indisponible (Gemini non configuré ou erreur).");
      }
    }

    res.json({ url: normalizedUrl, platform, accessible, extracted, analysis, limitations, analyzedAt: now() });
  });

  router.post("/social/publish", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      platform?: "tiktok" | "instagram";
      confirmed?: boolean;
      description?: string;
      hashtags?: string[];
      title?: string;
      videoSource?: string;
      videoRef?: string;
      scheduledAt?: number;
    };
    const platform = platformFromParam(body.platform);
    if (!platform) {
      res.status(400).json({ error: "Plateforme invalide." });
      return;
    }
    const token = getStoredToken(platform);
    const limitations: string[] = [];

    // Préparation / validation (aucune publication sans confirmation explicite)
    if (body.confirmed !== true) {
      res.json({
        ok: true,
        platform,
        published: false,
        scheduled: false,
        message: "Préparation de publication créée. Aucune action envoyée : confirmation explicite requise avant toute publication.",
        limitations: [
          "Aucune publication ne sera effectuée sans confirmation explicite.",
          "La publication réelle dépend des API officielles, permissions approuvées et éligibilité du compte.",
          ...(token ? [] : ["Compte non connecté : connectez le compte via OAuth officiel avant publication."]),
        ],
        performedAt: now(),
      });
      return;
    }

    if (!token) {
      res.status(400).json({
        ok: false,
        platform,
        published: false,
        scheduled: false,
        message: "Publication impossible : compte non connecté via OAuth officiel.",
        limitations: ["Connectez d'abord le compte avec les permissions requises."],
        performedAt: now(),
      });
      return;
    }

    // Tentative de publication réelle uniquement si possible via API officielle.
    // TikTok Content Posting API et Instagram Content Publishing API exigent des flux d'upload spécifiques,
    // permissions approuvées et hébergement média conforme. Sans implémentation complète validée par app review,
    // on ne doit PAS prétendre publier.
    limitations.push(
      "Publication automatique non finalisée dans ce build : l'intégration API officielle de publication (upload/init/publish TikTok, création de conteneur Instagram) nécessite permissions approuvées, app review et flux média conformes."
    );
    if (body.scheduledAt) {
      limitations.push("Programmation automatique indisponible : non supportée/activée via API officielle dans cette configuration.");
    }

    res.status(501).json({
      ok: false,
      platform,
      published: false,
      scheduled: false,
      message: "Aucune publication effectuée : flux de publication API officiel non disponible/validé pour ce compte dans la configuration actuelle.",
      limitations,
      performedAt: now(),
    });
  });

  return router;
}
