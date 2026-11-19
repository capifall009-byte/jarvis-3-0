import { DAILY_QUOTES, type DailyQuote } from "../../data/dailyQuotes";

const QUOTE_CACHE_KEY = "jarvis_daily_quote_v1";

function getLocalDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hashStringToIndex(input: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return mod > 0 ? hash % mod : 0;
}

export function getDailyQuote(now = new Date()): DailyQuote {
  const dateKey = getLocalDateKey(now);
  const fallbackIndex = hashStringToIndex(dateKey, DAILY_QUOTES.length);
  const fallback = DAILY_QUOTES[fallbackIndex] ?? DAILY_QUOTES[0];

  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(QUOTE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { dateKey?: string; index?: number } | null;
      if (
        parsed?.dateKey === dateKey &&
        typeof parsed.index === "number" &&
        parsed.index >= 0 &&
        parsed.index < DAILY_QUOTES.length
      ) {
        return DAILY_QUOTES[parsed.index];
      }
    }
    localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify({ dateKey, index: fallbackIndex }));
  } catch {
    // ignore storage issues, deterministic fallback still works
  }

  return fallback;
}
