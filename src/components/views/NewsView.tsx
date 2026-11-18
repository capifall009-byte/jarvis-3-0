import { useEffect, useMemo, useState } from "react";
import { Globe, Newspaper, Search, Trash2, Trophy, Volume2, WifiOff } from "lucide-react";
import { clearNews, fetchNews, listNews, removeNews } from "../../services/news/NewsClient";
import type { NewsArticle, NewsCategory } from "../../types/jarvis";

interface NewsViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  onSpeakText: (text: string) => void;
}

type FreshnessFilter = "all" | "recent" | "week";

function formatDate(ts: number): string {
  // 0 = date de publication inconnue : ne jamais afficher une date inventée.
  if (!Number.isFinite(ts) || ts <= 0) return "Date de publication inconnue";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString("fr-FR");
  }
}

function isOutdated(ts: number): boolean {
  return Number.isFinite(ts) && ts > 0 && Date.now() - ts > 48 * 60 * 60 * 1000;
}

function NewsCard({
  article,
  extremeDark,
  onSpeakText,
  onRemove,
}: {
  article: NewsArticle;
  extremeDark: boolean;
  onSpeakText: (text: string) => void;
  onRemove?: (id: string) => void;
}) {
  const summary = article.summary.trim() || article.title;

  return (
    <article
      className={`rounded-2xl border p-4 space-y-2 ${
        extremeDark
          ? "bg-black border-white/[0.06]"
          : "jarvis-glass border-cyan-400/20"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
            extremeDark
              ? "border-cyan-500/25 text-cyan-300/85"
              : "border-cyan-400/30 text-cyan-300"
          }`}
        >
          {article.category === "sport" ? (
            <Trophy className="w-3 h-3" />
          ) : (
            <Globe className="w-3 h-3" />
          )}
          {article.sourceName}
        </span>
        <span className="text-slate-500">·</span>
        <time className="text-slate-500">{formatDate(article.publishedAt)}</time>
        {isOutdated(article.publishedAt) && (
          <span className="px-1.5 py-0.5 rounded-full border border-amber-400/30 text-amber-200/85">
            Publication ancienne
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(article.id)}
            className="ml-auto inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
            aria-label="Retirer cette actualité de l'historique"
            title="Retirer de l'historique"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <h3
        className={`text-[15px] font-medium leading-snug ${
          extremeDark ? "text-slate-100" : "text-slate-100"
        }`}
      >
        {article.title}
      </h3>

      <p
        className={`text-sm leading-relaxed ${
          extremeDark ? "text-slate-400" : "text-slate-400"
        }`}
      >
        {summary}
      </p>

      <div className="flex items-center gap-2 pt-1">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs underline-offset-2 hover:underline truncate ${
            extremeDark
              ? "text-cyan-400/75 hover:text-cyan-300"
              : "text-cyan-300 hover:text-cyan-200"
          }`}
        >
          Source originale
        </a>
        <button
          type="button"
          onClick={() => onSpeakText(summary)}
          className={`ml-auto inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            extremeDark
              ? "border-cyan-500/25 text-cyan-300/85 hover:bg-cyan-950/40"
              : "border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10"
          }`}
          aria-label="Lire la description à voix haute"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Lire</span>
        </button>
      </div>
    </article>
  );
}

export function NewsView({
  isOnline,
  extremeDark,
  onSpeakText,
}: NewsViewProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [history, setHistory] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<"all" | NewsCategory>("all");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [freshness, setFreshness] = useState<FreshnessFilter>("all");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listNews()
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch(() => {
        if (!cancelled) setHistoryError("Historique des actualités indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchNews({ category: category === "all" ? undefined : category, limit: 30 })
      .then((items) => {
        if (cancelled) return;
        setArticles(items);
        return listNews();
      })
      .then((items) => {
        if (!cancelled && items) setHistory(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Échec du chargement des actualités.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOnline, category]);

  const displayed = isOnline ? articles : history;

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const a of displayed) if (a.sourceName) set.add(a.sourceName);
    return [...set].sort();
  }, [displayed]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return displayed.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (sourceFilter !== "all" && a.sourceName !== sourceFilter) return false;
      if (freshness === "recent" && (!a.publishedAt || now - a.publishedAt > 24 * 60 * 60 * 1000)) return false;
      if (freshness === "week" && (!a.publishedAt || now - a.publishedAt > 7 * 24 * 60 * 60 * 1000)) return false;
      if (q && !`${a.title} ${a.summary} ${a.sourceName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [displayed, category, sourceFilter, freshness, search]);

  const handleRemove = async (id: string) => {
    try {
      await removeNews(id);
      setHistory((prev) => prev.filter((a) => a.id !== id));
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setHistoryError("Suppression non confirmée par le stockage local.");
    }
  };

  const handleClear = async () => {
    try {
      await clearNews();
      setHistory([]);
      setConfirmClear(false);
    } catch {
      setHistoryError("Effacement non confirmé par le stockage local.");
    }
  };

  const sportArticles = visible.filter((a) => a.category === "sport");
  const worldArticles = visible.filter((a) => a.category === "world");

  const inputClass = `h-10 px-3 rounded-xl border text-sm focus:outline-none ${
    extremeDark
      ? "bg-black border-white/[0.07] text-slate-200 placeholder:text-slate-600"
      : "bg-[#050A14]/85 border-cyan-400/20 text-slate-100 placeholder:text-slate-500"
  }`;

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h1
                className={`font-display text-xl sm:text-2xl font-medium ${
                  extremeDark ? "text-slate-200" : "text-cyan-50"
                }`}
              >
                Centre d&apos;Actualités
              </h1>
              <p
                className={`text-sm leading-relaxed ${
                  extremeDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Actualités sportives et internationales, avec lecture vocale des descriptions et historique consultable hors ligne.
              </p>
            </div>
            {isOnline ? (
              <Newspaper className="w-8 h-8 text-cyan-300 shrink-0" />
            ) : (
              <WifiOff className="w-8 h-8 text-amber-300 shrink-0" />
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {(
              [
                { id: "all", label: "Toutes" },
                { id: "sport", label: "Sport" },
                { id: "world", label: "Monde" },
              ] as Array<{ id: "all" | NewsCategory; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`min-h-[40px] px-4 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                  category === tab.id
                    ? extremeDark
                      ? "bg-cyan-950/40 border-cyan-500/40 text-cyan-200"
                      : "bg-cyan-500/15 border-cyan-400/35 text-cyan-100"
                    : extremeDark
                    ? "border-white/[0.08] text-slate-400 hover:text-slate-200"
                    : "border-white/[0.08] text-slate-400 hover:text-cyan-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${extremeDark ? "text-slate-500" : "text-slate-400"}`} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un sujet, un titre, une source…"
                aria-label="Rechercher dans les actualités"
                className={`w-full ${inputClass} pl-9`}
              />
            </div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Filtrer par source"
              className={inputClass}
            >
              <option value="all">Toutes les sources</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={freshness}
              onChange={(e) => setFreshness(e.target.value as FreshnessFilter)}
              aria-label="Filtrer par fraîcheur"
              className={inputClass}
            >
              <option value="all">Toutes les dates</option>
              <option value="recent">24 dernières heures</option>
              <option value="week">7 derniers jours</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={extremeDark ? "text-slate-500" : "text-slate-400"}>
              {displayed.length} article(s) disponible(s) · {history.length} en historique local
            </span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClear((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-400/25 text-red-200/85 hover:bg-red-500/10 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Effacer l&apos;historique
              </button>
            )}
          </div>

          {confirmClear && (
            <div className={`rounded-xl border p-3 text-xs space-y-2 ${extremeDark ? "border-red-500/25 bg-red-950/10 text-red-200" : "border-red-400/25 bg-red-500/10 text-red-100"}`}>
              <p>Confirmer l&apos;effacement de tout l&apos;historique des actualités ? L&apos;action sera réellement persistée localement.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void handleClear()} className="min-h-[36px] px-3 rounded-lg border border-red-400/35 bg-red-500/20 cursor-pointer">Confirmer</button>
                <button type="button" onClick={() => setConfirmClear(false)} className="min-h-[36px] px-3 rounded-lg border border-white/10 cursor-pointer">Annuler</button>
              </div>
            </div>
          )}
        </header>

        {!isOnline && (
          <div className={`rounded-2xl border p-4 text-sm ${extremeDark ? "bg-amber-950/10 border-amber-500/25 text-amber-200/85" : "bg-amber-500/10 border-amber-400/30 text-amber-100"}`}>
            Hors ligne : affichage de l&apos;historique local. Les nouvelles actualités nécessitent Internet.
          </div>
        )}
        {historyError && <p className="text-xs text-red-300">{historyError}</p>}
        {loading && (
          <div className={`rounded-2xl border p-8 text-center text-sm ${extremeDark ? "bg-black border-white/[0.06] text-slate-500" : "jarvis-glass border-cyan-400/20 text-slate-500"}`}>
            Chargement des actualités…
          </div>
        )}
        {!loading && error && (
          <div className={`rounded-2xl border p-4 text-sm ${extremeDark ? "bg-black border-white/[0.06] text-red-300/80" : "bg-red-950/40 border-red-400/30 text-red-200"}`}>
            {error}
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div className={`rounded-2xl border p-8 text-center text-sm ${extremeDark ? "bg-black border-white/[0.06] text-slate-500" : "jarvis-glass border-cyan-400/20 text-slate-500"}`}>
            Aucune actualité ne correspond aux filtres ou à la recherche.
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="space-y-8">
            {sportArticles.length > 0 && (
              <section className="space-y-3">
                <h2 className={`font-display text-lg font-medium flex items-center gap-2 ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
                  <Trophy className="w-4 h-4 text-cyan-300" /> Sport
                </h2>
                <div className="grid gap-3">
                  {sportArticles.map((a) => (
                    <NewsCard key={a.id} article={a} extremeDark={extremeDark} onSpeakText={onSpeakText} onRemove={handleRemove} />
                  ))}
                </div>
              </section>
            )}
            {worldArticles.length > 0 && (
              <section className="space-y-3">
                <h2 className={`font-display text-lg font-medium flex items-center gap-2 ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
                  <Globe className="w-4 h-4 text-cyan-300" /> Monde
                </h2>
                <div className="grid gap-3">
                  {worldArticles.map((a) => (
                    <NewsCard key={a.id} article={a} extremeDark={extremeDark} onSpeakText={onSpeakText} onRemove={handleRemove} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
