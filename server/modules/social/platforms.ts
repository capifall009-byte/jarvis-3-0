import type { SocialOAuthConfigStatus, SocialPermission } from "../../../src/types/jarvis.ts";
import type { StoredSocialToken } from "./tokenStore.ts";

export type Platform = "tiktok" | "instagram";

/** N'accepte l'origine de la requête que pour un hôte local : évite qu'un Host forgé
 *  modifie l'URI de redirection OAuth envoyée aux plateformes. */
function safeLocalOrigin(reqOrigin?: string): string | undefined {
  if (!reqOrigin) return undefined;
  try {
    const url = new URL(reqOrigin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
      return reqOrigin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function getRedirectUri(platform: Platform, reqOrigin?: string): string {
  const base =
    process.env.SOCIAL_OAUTH_REDIRECT_BASE ||
    process.env.APP_BASE_URL ||
    safeLocalOrigin(reqOrigin) ||
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/social/oauth/${platform}/callback`;
}

export function getTikTokConfig(reqOrigin?: string): SocialOAuthConfigStatus {
  const missing: string[] = [];
  if (!process.env.TIKTOK_CLIENT_KEY) missing.push("TIKTOK_CLIENT_KEY");
  if (!process.env.TIKTOK_CLIENT_SECRET) missing.push("TIKTOK_CLIENT_SECRET");
  return {
    platform: "tiktok",
    configured: missing.length === 0,
    missingEnv: missing,
    redirectUri: getRedirectUri("tiktok", reqOrigin),
    notes: [
      "Nécessite une application TikTok for Developers approuvée (Login Kit / Content Posting API selon usage).",
      "Certaines permissions (publication, statistiques avancées) requièrent une revue d'application et des comptes éligibles.",
      "Redirect URI doit être enregistré exactement dans la console développeur TikTok.",
      "Scopes typiques (à adapter selon approbation) : user.info.basic, video.list, video.upload, video.publish.",
    ],
  };
}

export function getInstagramConfig(reqOrigin?: string): SocialOAuthConfigStatus {
  const missing: string[] = [];
  // Meta/Instagram Graph API généralement via Facebook App
  if (!process.env.META_APP_ID) missing.push("META_APP_ID");
  if (!process.env.META_APP_SECRET) missing.push("META_APP_SECRET");
  return {
    platform: "instagram",
    configured: missing.length === 0,
    missingEnv: missing,
    redirectUri: getRedirectUri("instagram", reqOrigin),
    notes: [
      "Nécessite une application Meta (Facebook) configurée et, pour la plupart des fonctionnalités, un compte Instagram Business/Creator lié à une Page Facebook.",
      "Permissions courantes : instagram_basic, instagram_content_publish, instagram_manage_insights, pages_show_list, pages_read_engagement (selon fonctionnalités).",
      "La publication, les insights et certaines données requièrent App Review et comptes professionnels éligibles.",
      "Redirect URI doit être enregistré dans les paramètres Facebook Login de l'application Meta.",
    ],
  };
}

export function buildTikTokAuthUrl(state: string, reqOrigin?: string): string | null {
  const cfg = getTikTokConfig(reqOrigin);
  if (!cfg.configured) return null;
  const redirectUri = encodeURIComponent(cfg.redirectUri || "");
  const clientKey = encodeURIComponent(process.env.TIKTOK_CLIENT_KEY!);
  const scope = encodeURIComponent(
    process.env.TIKTOK_SCOPES || "user.info.basic,video.list"
  );
  return `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}`;
}

export function buildInstagramAuthUrl(state: string, reqOrigin?: string): string | null {
  const cfg = getInstagramConfig(reqOrigin);
  if (!cfg.configured) return null;
  const redirectUri = encodeURIComponent(cfg.redirectUri || "");
  const clientId = encodeURIComponent(process.env.META_APP_ID!);
  const scope = encodeURIComponent(
    process.env.META_SCOPES ||
      "instagram_basic,pages_show_list,pages_read_engagement"
  );
  return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}&scope=${scope}&response_type=code`;
}

export async function exchangeTikTokCode(
  code: string,
  reqOrigin?: string
): Promise<StoredSocialToken> {
  const cfg = getTikTokConfig(reqOrigin);
  if (!cfg.configured) {
    throw new Error("Configuration TikTok incomplète (variables d'environnement manquantes).");
  }
  const redirectUri = cfg.redirectUri || getRedirectUri("tiktok", reqOrigin);
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json.error || !json.access_token) {
    const msg = json.error_description || json.error || json.message || `Erreur OAuth TikTok (${res.status})`;
    throw new Error(msg);
  }
  const now = Date.now();
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  const token: StoredSocialToken = {
    platform: "tiktok",
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    tokenType: json.token_type,
    scope: json.scope,
    expiresAt: expiresIn ? now + expiresIn * 1000 : undefined,
    accountId: json.open_id,
    permissions: typeof json.scope === "string" ? json.scope.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    connectedAt: now,
    updatedAt: now,
  };
  // Tentative de récupération du profil (si permission user.info.basic accordée)
  try {
    const profile = await fetchTikTokUserInfo(token.accessToken);
    if (profile) {
      token.username = profile.username;
      token.displayName = profile.displayName;
      token.avatarUrl = profile.avatarUrl;
      token.accountId = profile.openId || token.accountId;
      token.rawProfile = profile.raw;
    }
  } catch {
    // Profil non disponible: on conserve le token sans profil
  }
  return token;
}

export async function exchangeInstagramCode(
  code: string,
  reqOrigin?: string
): Promise<StoredSocialToken> {
  const cfg = getInstagramConfig(reqOrigin);
  if (!cfg.configured) {
    throw new Error("Configuration Meta/Instagram incomplète (variables d'environnement manquantes).");
  }
  const redirectUri = cfg.redirectUri || getRedirectUri("instagram", reqOrigin);
  // Échange code -> token court (Facebook Login)
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`);
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json.error || !json.access_token) {
    const msg = json.error?.message || json.error_description || `Erreur OAuth Meta/Instagram (${res.status})`;
    throw new Error(msg);
  }
  const now = Date.now();
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  const token: StoredSocialToken = {
    platform: "instagram",
    accessToken: json.access_token,
    tokenType: json.token_type,
    scope: undefined,
    expiresAt: expiresIn ? now + expiresIn * 1000 : undefined,
    permissions: [],
    connectedAt: now,
    updatedAt: now,
  };
  // Tentative d'identification du compte Instagram Business/Creator lié (si permissions/pages disponibles)
  try {
    const ig = await fetchInstagramLinkedAccount(token.accessToken);
    if (ig) {
      token.accountId = ig.id;
      token.username = ig.username;
      token.displayName = ig.name || ig.username;
      token.avatarUrl = ig.profilePictureUrl;
      token.permissions = ig.grantedScopes || [];
      token.rawProfile = ig.raw;
    }
  } catch {
    // Compte IG non résolu: permissions/pages insuffisantes ou compte non Business/Creator
  }
  return token;
}

export function permissionsFromToken(token: StoredSocialToken | null): SocialPermission[] {
  if (!token) return [];
  const scopes = token.permissions && token.permissions.length > 0
    ? token.permissions
    : (token.scope ? token.scope.split(",").map(s => s.trim()).filter(Boolean) : []);
  return scopes.map((s) => ({ scope: s, granted: true }));
}

async function fetchTikTokUserInfo(accessToken: string): Promise<{
  openId?: string; username?: string; displayName?: string; avatarUrl?: string; raw?: unknown;
} | null> {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json.error?.code) return null;
  const user = json.data?.user;
  if (!user) return null;
  return {
    openId: user.open_id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    raw: json,
  };
}

async function fetchInstagramLinkedAccount(accessToken: string): Promise<{
  id?: string; username?: string; name?: string; profilePictureUrl?: string; grantedScopes?: string[]; raw?: unknown;
} | null> {
  // 1) Permissions accordées (debug_token nécessite app token; on tente /me/permissions)
  let grantedScopes: string[] = [];
  try {
    const permRes = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${encodeURIComponent(accessToken)}`);
    const permJson = (await permRes.json().catch(() => ({}))) as any;
    if (permRes.ok && Array.isArray(permJson.data)) {
      grantedScopes = permJson.data.filter((p: any) => p.status === "granted").map((p: any) => p.permission).filter(Boolean);
    }
  } catch { /* ignore */ }

  // 2) Pages -> instagram_business_account
  const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(accessToken)}`);
  const pagesJson = (await pagesRes.json().catch(() => ({}))) as any;
  if (!pagesRes.ok) return { grantedScopes, raw: pagesJson };
  const pages = Array.isArray(pagesJson.data) ? pagesJson.data : [];
  for (const page of pages) {
    const ig = page.instagram_business_account;
    if (ig?.id) {
      return {
        id: ig.id,
        username: ig.username,
        name: ig.name,
        profilePictureUrl: ig.profile_picture_url,
        grantedScopes,
        raw: { pageId: page.id, ig },
      };
    }
  }
  return { grantedScopes, raw: pagesJson };
}

export async function fetchTikTokDashboard(accessToken: string): Promise<any> {
  // TikTok Display/Research APIs varient selon approbation. On tente video.list si autorisé.
  const res = await fetch("https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_count: 20 }),
  });
  return { status: res.status, ok: res.ok, json: await res.json().catch(() => ({})) };
}

export async function fetchInstagramDashboard(accessToken: string, igUserId?: string): Promise<any> {
  if (!igUserId) {
    return { ok: false, reason: "Aucun compte Instagram Business/Creator lié (ID manquant).", json: null };
  }
  // Insights et media nécessitent permissions spécifiques (instagram_manage_insights, instagram_basic)
  const mediaRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count&limit=20&access_token=${encodeURIComponent(accessToken)}`);
  const mediaJson = await mediaRes.json().catch(() => ({}));
  const profileRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}?fields=id,username,name,followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`);
  const profileJson = await profileRes.json().catch(() => ({}));
  // Insights compte (peut échouer sans permission/éligibilité)
  let insightsJson: any = null;
  try {
    const insRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/insights?metric=impressions,reach,profile_views&period=day&access_token=${encodeURIComponent(accessToken)}`);
    insightsJson = await insRes.json().catch(() => ({}));
  } catch { /* ignore */ }
  return { ok: mediaRes.ok || profileRes.ok, profile: profileJson, media: mediaJson, insights: insightsJson, status: { media: mediaRes.status, profile: profileRes.status } };
}
