import type { NewsArticle, NewsFeedInfo } from "../../types/jarvis";
import { idbClearRequired, idbDeleteRequired, idbGetAll, idbPut } from "../storage/IndexedDbStore";

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function fetchNews(params?: {
  category?: "sport" | "world";
  limit?: number;
}): Promise<NewsArticle[]> {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.limit) query.set("limit", String(params.limit));

  const res = await fetch(`/api/news${query.toString() ? `?${query.toString()}` : ""}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await res.json()) as {
    articles?: NewsArticle[];
    sources?: NewsFeedInfo[];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || `Erreur de récupération des actualités (${res.status}).`);
  }

  const articles = Array.isArray(data.articles) ? data.articles : [];
  for (const article of articles) {
    await idbPut("news", article);
  }
  return articles;
}

export async function listNews(): Promise<NewsArticle[]> {
  const items = await idbGetAll<NewsArticle>("news");
  return items.sort((a, b) => b.publishedAt - a.publishedAt);
}

/** Suppression confirmée par IndexedDB (échec explicite si la persistance échoue). */
export async function removeNews(id: string): Promise<void> {
  await idbDeleteRequired("news", id);
}

/** Effacement confirmé par IndexedDB. */
export async function clearNews(): Promise<void> {
  await idbClearRequired("news");
}
