import type {
  SocialAccountPublic,
  SocialCalendarItem,
  SocialContentDraft,
  SocialDashboard,
  SocialLinkAnalysis,
  SocialOAuthConfigStatus,
  SocialPlatform,
  SocialPublicationHistoryItem,
  SocialPublishRequest,
  SocialPublishResult,
} from "../../types/jarvis";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(data.error || data.message || `Erreur serveur (${res.status})`);
  }
  return data as T;
}

export async function fetchSocialConfig(): Promise<{ tiktok: SocialOAuthConfigStatus; instagram: SocialOAuthConfigStatus }> {
  const res = await fetch("/api/social/config");
  return jsonOrThrow(res);
}

export async function fetchSocialAccounts(): Promise<{ accounts: SocialAccountPublic[]; fetchedAt: number }> {
  const res = await fetch("/api/social/accounts");
  return jsonOrThrow(res);
}

export async function startSocialOAuth(platform: SocialPlatform): Promise<{ authUrl: string; redirectUri?: string }> {
  const res = await fetch(`/api/social/oauth/${platform}/start`);
  return jsonOrThrow(res);
}

export async function disconnectSocialAccount(platform: SocialPlatform): Promise<{ ok: boolean; account: SocialAccountPublic }> {
  const res = await fetch(`/api/social/${platform}/disconnect`, { method: "POST" });
  return jsonOrThrow(res);
}

export async function fetchSocialDashboard(platform: SocialPlatform): Promise<SocialDashboard> {
  const res = await fetch(`/api/social/${platform}/dashboard`);
  return jsonOrThrow(res);
}

export async function analyzeSocialPerformance(payload: {
  platform?: SocialPlatform | "all";
  question?: string;
  dashboards?: SocialDashboard[];
}): Promise<{ analysis: string; generatedAt: number; usedGemini: boolean }> {
  const res = await fetch("/api/social/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function generateSocialContent(payload: {
  platform?: SocialPlatform | "both";
  topic: string;
  tone?: string;
  sourceVideo?: { id?: string; title?: string } | null;
  count?: number;
}): Promise<any> {
  const res = await fetch("/api/social/content/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function analyzeSocialLink(url: string): Promise<SocialLinkAnalysis> {
  const res = await fetch("/api/social/link/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return jsonOrThrow(res);
}

export async function publishSocialContent(payload: SocialPublishRequest): Promise<SocialPublishResult> {
  const res = await fetch("/api/social/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // publish peut renvoyer 501/400 avec JSON structuré
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok && !data.performedAt) {
    throw new Error(data.error || data.message || `Erreur serveur (${res.status})`);
  }
  return data as SocialPublishResult;
}

// --- Local persistence (IndexedDB stores added: socialContent, socialPublications) ---
import { idbDelete, idbGetAll, idbPut } from "../storage/IndexedDbStore";

export async function listContentDrafts(): Promise<SocialContentDraft[]> {
  const items = await idbGetAll<SocialContentDraft>("socialContent");
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveContentDraft(item: SocialContentDraft): Promise<void> {
  await idbPut("socialContent", item);
}
export async function removeContentDraft(id: string): Promise<void> {
  await idbDelete("socialContent", id);
}

export async function listPublicationHistory(): Promise<SocialPublicationHistoryItem[]> {
  const items = await idbGetAll<SocialPublicationHistoryItem>("socialPublications");
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function savePublicationHistory(item: SocialPublicationHistoryItem): Promise<void> {
  await idbPut("socialPublications", item);
}
export async function removePublicationHistory(id: string): Promise<void> {
  await idbDelete("socialPublications", id);
}

// Calendar stored in localStorage for simplicity (small structured data)
const CAL_KEY = "jarvis_social_calendar_v1";
export function listCalendarItems(): SocialCalendarItem[] {
  try {
    const raw = localStorage.getItem(CAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SocialCalendarItem[];
    return Array.isArray(arr) ? arr.sort((a, b) => (b.scheduledFor || b.updatedAt) - (a.scheduledFor || a.updatedAt)) : [];
  } catch { return []; }
}
export function saveCalendarItem(item: SocialCalendarItem): void {
  const items = listCalendarItems();
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) items[idx] = item; else items.unshift(item);
  try { localStorage.setItem(CAL_KEY, JSON.stringify(items)); } catch {}
}
export function removeCalendarItem(id: string): void {
  const items = listCalendarItems().filter((i) => i.id !== id);
  try { localStorage.setItem(CAL_KEY, JSON.stringify(items)); } catch {}
}
