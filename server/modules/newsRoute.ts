import { Router } from "express";
import type { Request, Response } from "express";

export type NewsCategory = "sport" | "world";

export interface NewsArticle {
  id: string;
  category: NewsCategory;
  source: string;
  sourceName: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: number;
}

export interface NewsFeedInfo {
  source: string;
  sourceName: string;
  category: NewsCategory;
  count: number;
}

interface NewsFeedConfig {
  category: NewsCategory;
  source: string;
  sourceName: string;
  url: string;
}

const RSS_FEEDS: NewsFeedConfig[] = [
  {
    category: "sport",
    source: "bbc-sport-football",
    sourceName: "BBC Sport — Football",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
  },
  {
    category: "sport",
    source: "bbc-sport",
    sourceName: "BBC Sport",
    url: "https://feeds.bbci.co.uk/sport/rss.xml",
  },
  {
    category: "world",
    source: "bbc-world",
    sourceName: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  {
    category: "world",
    source: "bbc-news",
    sourceName: "BBC News",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
  },
];

function cleanText(raw: string): string {
  const cdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const htmlStripped = cdata.replace(/<[^>]*>/g, " ");
  const decoded = htmlStripped
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decoded;
}

function parseRssItems(
  xml: string,
  category: NewsCategory,
  sourceName: string,
  source: string
): NewsArticle[] {
  const items: NewsArticle[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkM = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const descM = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const dateM = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);

    const title = cleanText(titleM ? titleM[1] : "");
    const link = cleanText(linkM ? linkM[1] : "");
    if (!title || !link) continue;

    // Ne jamais fabriquer une date : une date absente/invalide reste explicitement inconnue (0).
    const parsedDate = dateM ? Date.parse(cleanText(dateM[1])) : NaN;
    items.push({
      id: `${source}-${link}`,
      category,
      source,
      sourceName,
      title,
      summary: cleanText(descM ? descM[1] : ""),
      url: link,
      publishedAt: Number.isFinite(parsedDate) ? parsedDate : 0,
    });
  }

  return items;
}

async function fetchFeed(feed: NewsFeedConfig): Promise<NewsArticle[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "JARVIS-News/1.0" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseRssItems(xml, feed.category, feed.sourceName, feed.source);
}

export function createNewsRouter(): Router {
  const router = Router();

  router.get("/news", async (_req: Request, res: Response) => {
    try {
      const rawCategory = String(_req.query.category ?? "all");
      // "all" est un filtre d'interface, pas une NewsCategory : le typage doit le refléter.
      const category: NewsCategory | "all" =
        rawCategory === "sport" || rawCategory === "world" ? rawCategory : "all";
      const rawLimit = Number(_req.query.limit);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(50, Math.max(1, rawLimit))
        : 20;

      const settled = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
      const articles: NewsArticle[] = [];
      const sources: NewsFeedInfo[] = [];
      const seenUrls = new Set<string>();

      settled.forEach((result, idx) => {
        const feed = RSS_FEEDS[idx];
        if (result.status === "fulfilled") {
          const items = result.value;
          sources.push({
            source: feed.source,
            sourceName: feed.sourceName,
            category: feed.category,
            count: items.length,
          });
          if (category === "all" || feed.category === category) {
            for (const item of items) {
              const key = item.url || item.id;
              if (seenUrls.has(key)) continue;
              seenUrls.add(key);
              articles.push(item);
            }
          }
        } else {
          sources.push({
            source: feed.source,
            sourceName: feed.sourceName,
            category: feed.category,
            count: 0,
          });
        }
      });

      articles.sort((a, b) => b.publishedAt - a.publishedAt);
      const filtered =
        category === "all" ? articles : articles.filter((a) => a.category === category);

      res.json({
        articles: filtered.slice(0, limit),
        sources,
        generatedAt: Date.now(),
      });
    } catch (err) {
      console.error("News aggregation error:", err);
      res.status(502).json({
        error: "Impossible de récupérer les actualités depuis les sources.",
      });
    }
  });

  return router;
}
