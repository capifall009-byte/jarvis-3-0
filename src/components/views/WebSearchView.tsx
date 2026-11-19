import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CheckSquare,
  ExternalLink,
  FileJson,
  FileText,
  Filter,
  Globe,
  History,
  Link2,
  Microscope,
  Plus,
  Search,
  Square,
  Trash2,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import {
  clearSavedSearches,
  compareWebSourcesWithJarvis,
  exportWebHistoryAsJson,
  exportWebHistoryAsMarkdown,
  getWebHistoryDomains,
  getWebHistoryOperationType,
  getWebHistorySearchText,
  getWebHistoryStatus,
  getWebHistoryTitle,
  getWebHistoryUrls,
  inspectWebUrlWithJarvis,
  listSavedSearches,
  removeSavedSearch,
  removeSavedSearches,
  runDeepResearch,
  searchWebWithJarvis,
  type WebHistoryOperationType,
  type WebHistoryStatus,
} from "../../services/web/WebSearchClient";
import type { WebComparisonClaim, WebResearchClaim, WebSearchRecord } from "../../types/jarvis";

interface WebSearchViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  onSpeakText: (text: string) => void;
  initialMode?: "search" | "url" | "compare" | "research";
}

type TypeFilter = "all" | WebHistoryOperationType;
type StatusFilter = "all" | WebHistoryStatus;
type SortMode = "recent" | "oldest" | "alpha";

function claimTypeLabel(type: WebComparisonClaim["claimType"]): string {
  switch (type) {
    case "accord_entre_sources":
      return "Accord entre plusieurs sources";
    case "information_confirmée_par_preuve_identifiable":
      return "Information confirmée par une preuve identifiable (contenu fourni)";
    case "affirmation_non_verifiée":
      return "Affirmation non vérifiée";
    case "hypothèse":
      return "Hypothèse";
    case "contradiction":
      return "Contradiction";
    default:
      return type;
  }
}

function typeLabel(type: WebHistoryOperationType): string {
  if (type === "search") return "Recherche Web";
  if (type === "inspection") return "Analyse de page";
  if (type === "research") return "Enquête approfondie";
  return "Comparaison";
}

function statusTone(status: WebHistoryStatus, extremeDark: boolean): string {
  if (status === "réussi") return extremeDark ? "text-emerald-300/90 border-emerald-500/30 bg-emerald-500/10" : "text-emerald-200 border-emerald-400/30 bg-emerald-500/15";
  if (status === "partiel") return extremeDark ? "text-cyan-300/90 border-cyan-500/30 bg-cyan-500/10" : "text-cyan-200 border-cyan-400/30 bg-cyan-500/15";
  if (status === "erreur") return extremeDark ? "text-rose-300/90 border-rose-500/30 bg-rose-500/10" : "text-rose-200 border-rose-400/30 bg-rose-500/15";
  return extremeDark ? "text-slate-400 border-white/10 bg-white/5" : "text-slate-300 border-cyan-400/20 bg-[#050A14]/40";
}

/** Badge de type : neutre cyan (indépendant du statut, qui garde sa propre couleur). */
function typeChipClass(extremeDark: boolean): string {
  return extremeDark
    ? "text-cyan-300/90 border-cyan-500/25 bg-cyan-950/20"
    : "text-cyan-200 border-cyan-400/25 bg-cyan-500/10";
}

export function WebSearchView({
  isOnline,
  extremeDark,
  onSpeakText,
  initialMode = "search",
}: WebSearchViewProps) {
  const [mode, setMode] = useState<"search" | "url" | "compare" | "research">(initialMode);
  const [query, setQuery] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlQuestion, setUrlQuestion] = useState("");
  const [compareUrls, setCompareUrls] = useState<string[]>(["", ""]);
  const [compareProgress, setCompareProgress] = useState<string | null>(null);
  const [researchQuestion, setResearchQuestion] = useState("");
  const [researchProgress, setResearchProgress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<WebSearchRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<WebSearchRecord | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [historySearch, setHistorySearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const detailRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const items = await listSavedSearches();
        if (!mounted) return;
        setHistory(items);
        if (items.length > 0) {
          setActiveRecord((prev) => prev ?? items[0]);
        }
      } catch (err) {
        if (!mounted) return;
        setHistoryError(
          err instanceof Error
            ? err.message
            : "Impossible de charger l'historique Web (IndexedDB)."
        );
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Keep active record in sync with history (e.g. after deletions)
  useEffect(() => {
    if (!activeRecord) return;
    const still = history.find((r) => r.id === activeRecord.id);
    if (!still) {
      setActiveRecord(history[0] ?? null);
    } else if (still !== activeRecord) {
      setActiveRecord(still);
    }
  }, [history, activeRecord]);

  // Prune selection when history changes
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(history.map((h) => h.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [history]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    let items = history.filter((record) => {
      const t = getWebHistoryOperationType(record);
      const s = getWebHistoryStatus(record);
      if (typeFilter !== "all" && t !== typeFilter) return false;
      if (statusFilter !== "all" && s !== statusFilter) return false;
      if (tokens.length > 0) {
        const hay = getWebHistorySearchText(record);
        for (const tok of tokens) {
          if (!hay.includes(tok)) return false;
        }
      }
      return true;
    });

    items = [...items];
    if (sortMode === "recent") {
      items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (sortMode === "oldest") {
      items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    } else {
      items.sort((a, b) => {
        const ta = getWebHistoryTitle(a).toLocaleLowerCase("fr");
        const tb = getWebHistoryTitle(b).toLocaleLowerCase("fr");
        const cmp = ta.localeCompare(tb, "fr");
        if (cmp !== 0) return cmp;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
    }
    return items;
  }, [history, historySearch, typeFilter, statusFilter, sortMode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setErrorMsg(
        "Connexion Internet requise pour interroger le Web. Vos recherches précédentes restent consultables ci-dessous."
      );
      return;
    }

    setErrorMsg(null);

    if (mode === "search") {
      setIsLoading(true);
      try {
        const record = await searchWebWithJarvis(query.trim());
        setActiveRecord(record);
        setHistory((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Échec de la recherche Internet."
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (mode === "url") {
      setIsLoading(true);
      try {
        const record = await inspectWebUrlWithJarvis(
          urlInput.trim(),
          urlQuestion.trim() || undefined
        );
        setActiveRecord(record);
        setHistory((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Échec de l'analyse de la page."
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (mode === "research") {
      const cleanQuestion = researchQuestion.trim();
      if (cleanQuestion.length < 8) {
        setErrorMsg("Veuillez saisir une question de recherche suffisamment précise (8 caractères minimum).");
        return;
      }
      setIsLoading(true);
      setResearchProgress(
        "Planification (Gemini), puis exploration bornée des sources sous-questions, recoupement et rapport final. Jusqu'à 3 appels Gemini maximum."
      );
      try {
        const known = history.slice(0, 8).map((r) => ({ query: r.query, answer: r.answer }));
        const record = await runDeepResearch(cleanQuestion, known);
        setActiveRecord(record);
        setHistory((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
        setResearchQuestion("");
        setResearchProgress(null);
      } catch (err) {
        setResearchProgress(null);
        setErrorMsg(
          err instanceof Error ? err.message : "Échec de la recherche approfondie."
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // compare
    const cleanedUrls = compareUrls.map((u) => u.trim()).filter(Boolean);
    if (cleanedUrls.length < 2 || cleanedUrls.length > 5) {
      setErrorMsg("Veuillez fournir entre 2 et 5 URL à comparer.");
      return;
    }

    setIsLoading(true);
    setCompareProgress(
      "Récupération sécurisée, extraction et préparation des sources (traitement individuel, concurrence limitée)… puis analyse comparative Gemini unique."
    );
    try {
      const record = await compareWebSourcesWithJarvis(cleanedUrls);
      setActiveRecord(record);
      setHistory((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
      setCompareProgress(null);
    } catch (err) {
      setCompareProgress(null);
      setErrorMsg(
        err instanceof Error ? err.message : "Échec de la comparaison des sources."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const clearActionFeedback = () => {
    setActionMsg(null);
    setActionErr(null);
  };

  const handleDelete = async (id: string) => {
    if (actionBusy) return;
    clearActionFeedback();
    setActionBusy(true);
    try {
      await removeSavedSearch(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setActionMsg("Entrée supprimée de l'historique (persistance confirmée).");
    } catch (err) {
      setActionErr(
        err instanceof Error
          ? err.message
          : "Échec de la suppression : la persistance n'a pas pu être confirmée."
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (actionBusy) return;
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    clearActionFeedback();
    setActionBusy(true);
    try {
      await removeSavedSearches(ids);
      const removed = new Set(ids);
      setHistory((prev) => prev.filter((item) => !removed.has(item.id)));
      setSelectedIds(new Set());
      setConfirmDeleteSelected(false);
      setActionMsg(`${ids.length} entrée(s) supprimée(s) de l'historique (persistance confirmée).`);
    } catch (err) {
      setActionErr(
        err instanceof Error
          ? err.message
          : "Échec de la suppression multiple : la persistance n'a pas pu être confirmée pour toutes les entrées."
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (actionBusy) return;
    clearActionFeedback();
    setActionBusy(true);
    try {
      await clearSavedSearches();
      setHistory([]);
      setActiveRecord(null);
      setSelectedIds(new Set());
      setConfirmClearAll(false);
      setActionMsg("Historique Web effacé (persistance confirmée).");
    } catch (err) {
      setActionErr(
        err instanceof Error
          ? err.message
          : "Échec de l'effacement : la persistance n'a pas pu être confirmée."
      );
    } finally {
      setActionBusy(false);
    }
  };

  const getExportTargets = (): WebSearchRecord[] => {
    if (selectedIds.size > 0) {
      return history.filter((r) => selectedIds.has(r.id));
    }
    return filteredHistory;
  };

  const handleExportJson = () => {
    clearActionFeedback();
    try {
      const targets = getExportTargets();
      if (targets.length === 0) {
        setActionErr("Aucune entrée à exporter.");
        return;
      }
      exportWebHistoryAsJson(targets);
      setActionMsg(`Export JSON lancé pour ${targets.length} entrée(s).`);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "Échec de l'export JSON.");
    }
  };

  const handleExportMarkdown = () => {
    clearActionFeedback();
    try {
      const targets = getExportTargets();
      if (targets.length === 0) {
        setActionErr("Aucune entrée à exporter.");
        return;
      }
      exportWebHistoryAsMarkdown(targets);
      setActionMsg(`Export Markdown lancé pour ${targets.length} entrée(s).`);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "Échec de l'export Markdown.");
    }
  };

  /** Ouvre une entrée enregistrée et amène la consultation détaillée à l'écran (utile sur mobile). */
  const openRecord = (record: WebSearchRecord) => {
    setActiveRecord(record);
    setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredHistory.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setConfirmDeleteSelected(false);
  };

  const updateCompareUrl = (index: number, value: string) => {
    setCompareUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  };

  const addCompareUrl = () => {
    setCompareUrls((prev) => (prev.length >= 5 ? prev : [...prev, ""]));
  };

  const removeCompareUrl = (index: number) => {
    setCompareUrls((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const renderComparisonClaims = (title: string, claims?: WebComparisonClaim[]) => {
    const list = Array.isArray(claims) ? claims : [];
    return (
      <div className="space-y-1.5">
        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>
          {title} <span className={extremeDark ? "text-slate-500" : "text-slate-400"}>({list.length})</span>
        </h4>
        {list.length === 0 ? (
          <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucun élément identifié.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((item, idx) => (
              <li
                key={`${title}-${idx}`}
                className={`rounded-lg border p-2.5 text-xs space-y-1 ${
                  extremeDark ? "border-white/[0.06] bg-white/[0.01]" : "border-cyan-400/10 bg-[#050A14]/40"
                }`}
              >
                <p className={`leading-relaxed ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{item.text}</p>
                <p className={extremeDark ? "text-cyan-300/90" : "text-cyan-200"}>
                  <span className="font-medium">Type :</span> {claimTypeLabel(item.claimType)}
                </p>
                <p className={extremeDark ? "text-slate-400" : "text-slate-300"}>
                  <span className="font-medium">Source(s) :</span>{" "}
                  {(item.sourceReferences && item.sourceReferences.length > 0
                    ? item.sourceReferences.map((r) => `${r.label} (${r.finalUrl || r.requestedUrl})`)
                    : item.sourceIds || []
                  ).join(" ; ")}
                </p>
                {item.evidence && (
                  <p className={extremeDark ? "text-slate-400" : "text-slate-300"}>
                    <span className="font-medium">Éléments dans le contenu :</span> {item.evidence}
                  </p>
                )}
                {item.proofOrCitation && (
                  <p className={extremeDark ? "text-slate-400" : "text-slate-300"}>
                    <span className="font-medium">Preuve/citation identifiable :</span> {item.proofOrCitation}
                  </p>
                )}
                {item.limitations && (
                  <p className={extremeDark ? "text-amber-300/80" : "text-amber-200/90"}>
                    <span className="font-medium">Limites :</span> {item.limitations}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderMissingInfoNotice = (record: WebSearchRecord) => {
    const t = getWebHistoryOperationType(record);
    const missing: string[] = [];
    if (t === "inspection") {
      if (!record.metadata) missing.push("métadonnées");
      if (!record.articleExtraction) missing.push("contenu extrait");
      if (!record.structuredAnalysis) missing.push("analyse structurée");
    } else if (t === "comparison") {
      if (!record.comparisonSources || record.comparisonSources.length === 0) missing.push("détail des sources comparées");
      if (!record.sourceComparison?.data) missing.push("résultat comparatif structuré");
    } else if (t === "research") {
      if (!record.research?.plan) missing.push("plan de recherche");
      if (!record.research?.report) missing.push("rapport final");
    } else {
      // recherche : certaines anciennes entrées n'ont pas de sources enregistrées
      if (!Array.isArray(record.sources) || record.sources.length === 0) missing.push("sources enregistrées");
    }
    if (missing.length === 0) return null;
    return (
      <div className={`text-[11px] rounded-lg border px-3 py-2 ${extremeDark ? "border-amber-500/20 text-amber-200/90 bg-amber-950/10" : "border-amber-400/25 text-amber-100 bg-amber-500/10"}`}>
        Certaines informations ne sont pas disponibles pour cette ancienne entrée ({missing.join(", ")}). Les données disponibles sont affichées sans être complétées ni inventées.
      </div>
    );
  };

  const inputClass = `h-11 px-4 rounded-xl border text-sm focus:outline-none ${
    extremeDark
      ? "bg-black border-white/[0.07] text-slate-200 placeholder:text-slate-600"
      : "bg-[#050A14]/85 border-cyan-400/20 focus:border-cyan-400/50 text-slate-100 placeholder:text-slate-500"
  }`;

  const smallBtnClass = (active = false) =>
    `inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40 ${
      active
        ? extremeDark
          ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
          : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"
        : extremeDark
        ? "border-white/[0.08] text-slate-300 hover:text-slate-100"
        : "border-cyan-400/15 text-slate-200 hover:text-cyan-100"
    }`;

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1
            className={`font-display text-xl sm:text-2xl font-medium ${
              extremeDark ? "text-slate-200" : "text-cyan-50"
            }`}
          >
            Recherche Internet &amp; Sources
          </h1>
          <p
            className={`text-sm leading-relaxed ${
              extremeDark ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Recherche en direct, analyse de pages, comparaison multi-sources et historique centralisé consultable hors ligne.
          </p>
        </header>

        {!isOnline && (
          <div
            className={`rounded-2xl border p-4 flex items-center gap-3 text-sm ${
              extremeDark
                ? "bg-amber-950/20 border-amber-500/25 text-amber-200/85"
                : "bg-amber-950/35 border-amber-400/30 text-amber-100"
            }`}
          >
            <WifiOff className="w-5 h-5 text-amber-300 shrink-0" />
            <span>
              Mode hors ligne actif : la recherche, l'analyse et la comparaison en direct sont suspendues, mais l'historique enregistré reste consultable.
            </span>
          </div>
        )}

        {/* Action spaces */}
        <div
          className={`rounded-2xl border p-4 space-y-4 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setMode("search")}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
                mode === "search"
                  ? extremeDark
                    ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
                    : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"
                  : "border-white/[0.08] text-slate-400 hover:text-slate-200"
              }`}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span>Recherche Web</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
                mode === "url"
                  ? extremeDark
                    ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
                    : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"
                  : "border-white/[0.08] text-slate-400 hover:text-slate-200"
              }`}
            >
              <Link2 className="w-4 h-4 shrink-0" />
              <span>Analyser une page URL</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("compare")}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
                mode === "compare"
                  ? extremeDark
                    ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
                    : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"
                  : "border-white/[0.08] text-slate-400 hover:text-slate-200"
              }`}
            >
              <Search className="w-4 h-4 shrink-0" />
              <span>Comparer plusieurs sources</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("research")}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
                mode === "research"
                  ? extremeDark
                    ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
                    : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"
                  : "border-white/[0.08] text-slate-400 hover:text-slate-200"
              }`}
            >
              <Microscope className="w-4 h-4 shrink-0" />
              <span>Recherche approfondie</span>
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            {mode === "search" && (
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex. Dernières actualités sur la fusion nucléaire…"
                  aria-label="Requête de recherche Internet"
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  type="submit"
                  disabled={!isOnline || isLoading || !query.trim()}
                  className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer ${
                    extremeDark
                      ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                      : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>{isLoading ? "Recherche…" : "Rechercher"}</span>
                </button>
              </div>
            )}

            {mode === "url" && (
              <div className="space-y-2.5">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://exemple.fr/article"
                  aria-label="URL de la page à lire"
                  className={`w-full ${inputClass}`}
                />
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={urlQuestion}
                    onChange={(e) => setUrlQuestion(e.target.value)}
                    placeholder="Question précise sur cette page (optionnel)…"
                    aria-label="Question sur la page URL"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    type="submit"
                    disabled={!isOnline || isLoading || !urlInput.trim()}
                    className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer ${
                      extremeDark
                        ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                        : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"
                    }`}
                  >
                    <Link2 className="w-4 h-4" />
                    <span>{isLoading ? "Lecture…" : "Consulter"}</span>
                  </button>
                </div>
              </div>
            )}

            {mode === "research" && (
              <div className="space-y-2.5">
                <p className={`text-xs ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                  Posez une question complexe. JARVIS la décompose, explore plusieurs sources, recoupe les affirmations et produit un rapport avec références. Les enquêtes déjà enregistrées sont réutilisées comme contexte, sans relancer Gemini inutilement.
                </p>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <textarea
                    value={researchQuestion}
                    onChange={(e) => setResearchQuestion(e.target.value)}
                    placeholder="Ex. Quelles sont les causes et les limites de la fusion nucléaire comme source d'énergie ?"
                    aria-label="Question de recherche approfondie"
                    rows={2}
                    className={`flex-1 px-4 py-3 rounded-xl border text-sm resize-none focus:outline-none ${inputClass.replace("h-11 ", "")}`}
                  />
                  <button
                    type="submit"
                    disabled={!isOnline || isLoading || researchQuestion.trim().length < 8}
                    className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer ${
                      extremeDark
                        ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                        : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"
                    }`}
                  >
                    <Microscope className="w-4 h-4" />
                    <span>{isLoading ? "Enquête en cours…" : "Lancer l'enquête"}</span>
                  </button>
                </div>
              </div>
            )}

            {mode === "compare" && (
              <div className="space-y-3">
                <p className={`text-xs ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                  Ajoutez entre 2 et 5 URL. Chaque source est récupérée et analysée individuellement avec les protections existantes ; une seule analyse comparative Gemini est effectuée sur les contenus exploitables.
                </p>
                <div className="space-y-2.5">
                  {compareUrls.map((value, index) => (
                    <div key={`cmp-url-${index}`} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={value}
                        onChange={(e) => updateCompareUrl(index, e.target.value)}
                        placeholder={`URL de la source ${index + 1} (https://...)`}
                        aria-label={`URL source ${index + 1}`}
                        className={`flex-1 ${inputClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeCompareUrl(index)}
                        disabled={compareUrls.length <= 2 || isLoading}
                        className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer ${
                          extremeDark
                            ? "border-white/[0.08] text-slate-300 hover:text-red-200 hover:border-red-500/30"
                            : "border-cyan-400/15 text-slate-200 hover:text-red-200 hover:border-red-400/30"
                        }`}
                        aria-label={`Supprimer la source ${index + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={addCompareUrl}
                    disabled={compareUrls.length >= 5 || isLoading}
                    className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border text-sm font-medium disabled:opacity-40 whitespace-nowrap cursor-pointer ${
                      extremeDark
                        ? "border-cyan-500/25 text-cyan-300 hover:bg-cyan-950/30"
                        : "border-cyan-400/25 bg-cyan-500/12 text-cyan-200 hover:bg-cyan-500/20"
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ajouter une URL</span>
                  </button>
                  <button
                    type="submit"
                    disabled={!isOnline || isLoading || compareUrls.map((u) => u.trim()).filter(Boolean).length < 2}
                    className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-sm font-medium disabled:opacity-40 whitespace-nowrap sm:ml-auto cursor-pointer ${
                      extremeDark
                        ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                        : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"
                    }`}
                  >
                    <Search className="w-4 h-4" />
                    <span>{isLoading ? "Comparaison en cours…" : "Lancer la comparaison"}</span>
                  </button>
                </div>
              </div>
            )}
          </form>

          {isLoading && mode === "compare" && compareProgress && (
            <div className={`text-xs rounded-xl border px-3 py-2 ${extremeDark ? "border-cyan-500/20 text-cyan-200/90 bg-cyan-950/10" : "border-cyan-400/20 text-cyan-100 bg-cyan-500/10"}`}>
              <p className="font-medium">Progression</p>
              <p className="mt-0.5">{compareProgress}</p>
            </div>
          )}

          {isLoading && mode === "research" && researchProgress && (
            <div className={`text-xs rounded-xl border px-3 py-2 ${extremeDark ? "border-cyan-500/20 text-cyan-200/90 bg-cyan-950/10" : "border-cyan-400/20 text-cyan-100 bg-cyan-500/10"}`}>
              <p className="font-medium">Progression de l&apos;enquête</p>
              <p className="mt-0.5">{researchProgress}</p>
            </div>
          )}

          {errorMsg && <p className="text-xs text-red-300 pt-1">{errorMsg}</p>}
        </div>

        {/* Detailed consultation (saved data, no Gemini/refetch) */}
        {activeRecord && (
          <section
            ref={detailRef}
            className={`rounded-2xl border p-5 space-y-4 ${
              extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${typeChipClass(extremeDark)}`}>
                    {typeLabel(getWebHistoryOperationType(activeRecord))}
                  </span>
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusTone(getWebHistoryStatus(activeRecord), extremeDark)}`}>
                    {getWebHistoryStatus(activeRecord)}
                  </span>
                </div>
                <h2
                  className={`font-display text-base sm:text-lg font-medium break-words ${
                    extremeDark ? "text-slate-200" : "text-cyan-100"
                  }`}
                >
                  {getWebHistoryTitle(activeRecord)}
                </h2>
                <p className="text-xs text-slate-500 font-mono-tabular">
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(activeRecord.timestamp || Date.now()))}
                  {activeRecord.model ? ` · ${activeRecord.model}` : ""}
                </p>
                {activeRecord.query && activeRecord.query !== getWebHistoryTitle(activeRecord) && (
                  <p className={`text-xs break-words ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                    <span className="font-medium">Sujet / requête :</span> {activeRecord.query}
                  </p>
                )}
                {getWebHistoryUrls(activeRecord).length > 0 && (
                  <p className={`text-[11px] break-all ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                    URL(s) : {getWebHistoryUrls(activeRecord).join(" · ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSpeakText(activeRecord.answer || "")}
                aria-label="Lire la synthèse à voix haute"
                className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  extremeDark
                    ? "border-cyan-500/25 text-cyan-300 hover:bg-cyan-950/30"
                    : "border-cyan-400/25 bg-cyan-500/12 text-cyan-200 hover:bg-cyan-500/20"
                }`}
              >
                <Volume2 className="w-4 h-4" />
                <span>Lire</span>
              </button>
            </div>

            {renderMissingInfoNotice(activeRecord)}

            <div
              className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                extremeDark ? "text-slate-300" : "text-slate-100"
              }`}
            >
              {activeRecord.answer || "Aucune réponse enregistrée."}
            </div>

            {/* Research-specific view (Module 7.3) */}
            {activeRecord.isResearch && activeRecord.research && (() => {
              const r = activeRecord.research!;
              const plan = r.plan;
              const report = r.report;
              const renderClaims = (title: string, claims?: WebResearchClaim[]) => {
                const list = Array.isArray(claims) ? claims : [];
                return (
                  <div className="space-y-1.5 pt-4 border-t border-white/[0.06]">
                    <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>{title} ({list.length})</h4>
                    {list.length === 0 ? (
                      <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucun élément identifié.</p>
                    ) : (
                      <ul className="space-y-2">
                        {list.map((c, idx) => (
                          <li key={`${title}-${idx}`} className={`rounded-lg border p-2.5 text-xs space-y-1 ${extremeDark ? "border-white/[0.06] bg-white/[0.01]" : "border-cyan-400/10 bg-[#050A14]/40"}`}>
                            <p className={`leading-relaxed ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{c.text}</p>
                            <p className={extremeDark ? "text-cyan-300/90" : "text-cyan-200"}>
                              <span className="font-medium">Sources :</span> {c.sourceUrls.join(" · ") || "non précisées"}
                            </p>
                            {c.evidence && <p className={extremeDark ? "text-slate-400" : "text-slate-300"}><span className="font-medium">Éléments dans le contenu :</span> {c.evidence}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              };

              return (
                <div className="space-y-2 pt-2">
                  <p className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                    Consultation d&apos;une enquête enregistrée : aucun nouvel appel Gemini ni téléchargement de page. Les données manquantes des anciennes enquêtes ne sont pas inventées.
                  </p>
                  {r.error && <p className={`text-xs ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>{r.error}</p>}
                  {Array.isArray(r.notes) && r.notes.map((n, i) => (
                    <p key={`rn-${i}`} className={`text-[11px] ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>{n}</p>
                  ))}

                  {plan && (
                    <div className={`pt-4 border-t space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                      <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>Plan de recherche</h3>
                      <ol className={`text-xs space-y-0.5 list-decimal list-inside ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>
                        {plan.subQuestions.map((q, i) => <li key={`sq-${i}`}>{q}</li>)}
                      </ol>
                      {plan.knownInformation.length > 0 && (
                        <p className={`text-[11px] ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                          <span className="font-medium">Déjà connu :</span> {plan.knownInformation.join(" ; ")}
                        </p>
                      )}
                    </div>
                  )}

                  {r.steps.length > 0 && (
                    <div className={`pt-4 border-t space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                      <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>Étapes ({r.steps.length})</h3>
                      <ul className="space-y-1.5">
                        {r.steps.map((s) => (
                          <li key={`step-${s.index}`} className={`text-xs rounded-lg border p-2 ${extremeDark ? "border-white/[0.06] bg-white/[0.01]" : "border-cyan-400/10 bg-[#050A14]/40"}`}>
                            <span className={`font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>{s.index}. {s.query}</span>
                            <span className={extremeDark ? "text-slate-500" : "text-slate-400"}> — {s.status} · {s.note || `${s.sources.length} source(s)`}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report && (
                    <div className="space-y-2">
                      <div className={`pt-4 border-t space-y-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>Rapport — synthèse exécutive</h3>
                        <p className={`text-sm leading-relaxed ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{report.executiveSummary}</p>
                        <p className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Confiance déclarée : {report.confidence} (qualitative, non probabiliste)</p>
                      </div>
                      {renderClaims("Faits recoupés", report.crossCheckedFacts)}
                      {renderClaims("Affirmations non vérifiées", report.unverifiedClaims)}
                      {renderClaims("Contradictions", report.contradictions)}
                      {renderClaims("Informations manquantes", report.missingInformation)}
                      <div className={`pt-4 border-t space-y-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Conclusion</h4>
                        <p className={`text-sm leading-relaxed ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{report.conclusion}</p>
                      </div>
                      {report.limits.length > 0 && (
                        <div className={`pt-4 border-t space-y-1 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                          <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Limites</h4>
                          <ul className={`text-xs list-disc list-inside space-y-0.5 ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                            {report.limits.map((l, i) => <li key={`rl-${i}`}>{l}</li>)}
                          </ul>
                        </div>
                      )}
                      {report.sources.length > 0 && (
                        <div className={`pt-4 border-t space-y-1 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                          <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Sources consultées ({report.sources.length})</h4>
                          <ul className="space-y-1 text-xs">
                            {report.sources.map((s, i) => (
                              <li key={`rs-${i}`} className="break-all">
                                <span className="font-medium">[S{i + 1}]</span>{" "}
                                <a href={s.url} target="_blank" rel="noopener noreferrer" className={`underline ${extremeDark ? "text-cyan-300" : "text-cyan-200"}`}>{s.url}</a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Comparison-specific view (Module 7.2.4/7.2.5) */}
            {activeRecord.isComparison && (() => {
              const comparison = activeRecord.sourceComparison;
              const comparedSources = Array.isArray(activeRecord.comparisonSources) ? activeRecord.comparisonSources : [];
              const data = comparison?.data;
              const compStatus = comparison?.status || "unavailable";
              const compStatusLabel =
                compStatus === "success"
                  ? "Comparaison disponible"
                  : compStatus === "partial"
                  ? "Comparaison partielle"
                  : compStatus === "invalid"
                  ? "Comparaison invalide"
                  : compStatus === "error"
                  ? "Erreur de comparaison"
                  : "Comparaison indisponible";
              const compTone =
                compStatus === "success"
                  ? extremeDark ? "text-emerald-300/90" : "text-emerald-200"
                  : compStatus === "partial"
                  ? extremeDark ? "text-cyan-300/90" : "text-cyan-200"
                  : compStatus === "invalid" || compStatus === "error"
                  ? extremeDark ? "text-amber-300/90" : "text-amber-200"
                  : extremeDark ? "text-slate-400" : "text-slate-300";

              return (
                <div className="space-y-4 pt-2">
                  <div className={`pt-4 border-t space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>
                        Comparaison multi-sources
                      </h3>
                      <span className={`text-xs font-medium ${compTone}`}>{compStatusLabel}</span>
                    </div>
                    <p className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                      Consultation d'un résultat enregistré (sans relancer Gemini ni retélécharger les pages). Analyse basée sur les contenus extraits fournis (données externes non fiables).
                    </p>
                    {comparison?.error && (
                      <p className={`text-xs ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>{comparison.error}</p>
                    )}
                    {Array.isArray(comparison?.validationErrors) && comparison!.validationErrors!.length > 0 && (
                      <div className={`text-[11px] ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>
                        <p className="font-medium">Validation / remarques</p>
                        <ul className="mt-1 space-y-0.5 list-disc list-inside">
                          {comparison!.validationErrors!.map((err, idx) => <li key={`cmp-val-${idx}`}>{err}</li>)}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(comparison?.notes) && comparison!.notes!.length > 0 && (
                      <ul className={`text-[11px] space-y-0.5 list-disc list-inside ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                        {comparison!.notes!.map((note, idx) => <li key={`cmp-note-${idx}`}>{note}</li>)}
                      </ul>
                    )}
                  </div>

                  {comparedSources.length > 0 ? (
                    <div className={`pt-4 border-t space-y-2.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                      <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>
                        Sources comparées ({comparedSources.length})
                      </h3>
                      <ul className="space-y-2">
                        {comparedSources.map((src) => {
                          const ok = src.status === "accessible";
                          const tone = ok
                            ? extremeDark ? "text-emerald-300/90" : "text-emerald-200"
                            : src.status === "insufficient"
                            ? extremeDark ? "text-amber-300/90" : "text-amber-200"
                            : extremeDark ? "text-rose-300/90" : "text-rose-200";
                          const statusText =
                            src.status === "accessible" ? "Accessible"
                            : src.status === "insufficient" ? "Contenu insuffisant"
                            : src.status === "inaccessible" ? "Inaccessible"
                            : "Erreur";
                          const displayUrl = src.finalUrl || src.requestedUrl;
                          return (
                            <li key={src.sourceId} className={`rounded-xl border p-3 text-xs space-y-1 ${extremeDark ? "border-white/[0.06] bg-white/[0.01]" : "border-cyan-400/10 bg-[#050A14]/40"}`}>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className={`font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>{src.label}</span>
                                <span className={tone}>{statusText}</span>
                                <span className={extremeDark ? "text-slate-500" : "text-slate-400"}>
                                  {src.analyzed ? "Analysée / incluse" : "Non analysée / non incluse"}
                                </span>
                              </div>
                              <p className={extremeDark ? "text-slate-400" : "text-slate-300"}><span className="font-medium">URL demandée :</span> <span className="break-all">{src.requestedUrl}</span></p>
                              {src.finalUrl && src.finalUrl !== src.requestedUrl && (
                                <p className={extremeDark ? "text-slate-400" : "text-slate-300"}><span className="font-medium">URL finale :</span> <span className="break-all">{src.finalUrl}</span></p>
                              )}
                              {displayUrl && (
                                <p className={extremeDark ? "text-slate-400" : "text-slate-300"}>
                                  <span className="font-medium">Référence :</span>{" "}
                                  <a href={displayUrl} target="_blank" rel="noopener noreferrer" className={`underline break-all ${extremeDark ? "text-cyan-300" : "text-cyan-200"}`}>{displayUrl}</a>
                                </p>
                              )}
                              {src.error && <p className={extremeDark ? "text-rose-300/90" : "text-rose-200"}><span className="font-medium">Erreur :</span> {src.error}{src.errorCode ? ` (${src.errorCode})` : ""}</p>}
                              {Array.isArray(src.issues) && src.issues.length > 0 && (
                                <ul className={`list-disc list-inside ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>
                                  {src.issues.slice(0, 6).map((issue, idx) => <li key={`${src.sourceId}-iss-${idx}`}>{issue}</li>)}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    Array.isArray(activeRecord.comparedUrls) && activeRecord.comparedUrls.length > 0 && (
                      <div className={`pt-4 border-t space-y-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>URL comparées</h3>
                        <ul className={`text-xs space-y-0.5 list-disc list-inside ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>
                          {activeRecord.comparedUrls.map((u, idx) => <li key={`curl-${idx}`} className="break-all">{u}</li>)}
                        </ul>
                      </div>
                    )
                  )}

                  {comparison && comparison.status !== "success" && comparison.status !== "partial" && !data && (
                    <p className={`text-xs ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                      Aucune synthèse comparative fiable n'a pu être produite. Les informations par source (accessibles/en erreur) sont indiquées ci-dessus. Aucun résultat de comparaison n'a été simulé.
                    </p>
                  )}

                  {data && (
                    <div className="space-y-4">
                      <div className={`pt-4 border-t space-y-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>Synthèse générale</h3>
                        <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{data.generalSynthesis}</p>
                      </div>

                      <div className={`pt-4 border-t ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>{renderComparisonClaims("Convergences / accords", data.convergences)}</div>
                      <div className={`pt-4 border-t ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>{renderComparisonClaims("Informations et affirmations communes", data.commonInformation)}</div>
                      <div className={`pt-4 border-t ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>{renderComparisonClaims("Contradictions et désaccords", data.contradictions)}</div>

                      <div className={`pt-4 border-t space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Informations propres à chaque source</h4>
                        {Array.isArray(data.uniqueBySource) && data.uniqueBySource.length > 0 ? (
                          <div className="space-y-3">
                            {data.uniqueBySource.map((group) => (
                              <div key={group.sourceId} className={`rounded-xl border p-3 space-y-2 ${extremeDark ? "border-white/[0.06] bg-white/[0.01]" : "border-cyan-400/10 bg-[#050A14]/40"}`}>
                                <p className={`text-xs font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>
                                  {group.label} — <span className="break-all font-normal">{group.finalUrl || group.requestedUrl}</span>
                                </p>
                                {renderComparisonClaims(`Éléments propres (${group.sourceId})`, group.items)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucune information propre identifiée.</p>
                        )}
                      </div>

                      <div className={`pt-4 border-t ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>{renderComparisonClaims("Informations manquantes", data.missingInformation)}</div>

                      <div className={`pt-4 border-t space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Évaluation qualitative de la fiabilité par source</h4>
                        {Array.isArray(data.reliabilityBySource) && data.reliabilityBySource.length > 0 ? (
                          <ul className="space-y-2">
                            {data.reliabilityBySource.map((r) => (
                              <li key={`rel-${r.sourceId}`} className={`rounded-xl border p-3 text-xs space-y-1 ${extremeDark ? "border-white/[0.06] bg-white/[0.01]" : "border-cyan-400/10 bg-[#050A14]/40"}`}>
                                <p className={`font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>{r.label} ({r.sourceId})</p>
                                <p className={extremeDark ? "text-slate-400" : "text-slate-300"}><span className="font-medium">Référence :</span> <span className="break-all">{r.finalUrl || r.requestedUrl}</span></p>
                                <p className={extremeDark ? "text-slate-300" : "text-slate-100"}>{r.qualitativeAssessment}</p>
                                <p className={extremeDark ? "text-slate-400" : "text-slate-300"}><span className="font-medium">Confiance qualitative :</span> {r.confidence} (non probabiliste)</p>
                                {Array.isArray(r.strengths) && r.strengths.length > 0 && <p className={extremeDark ? "text-slate-400" : "text-slate-300"}><span className="font-medium">Points forts :</span> {r.strengths.join(" ; ")}</p>}
                                {Array.isArray(r.weaknesses) && r.weaknesses.length > 0 && <p className={extremeDark ? "text-amber-300/80" : "text-amber-200/90"}><span className="font-medium">Points faibles :</span> {r.weaknesses.join(" ; ")}</p>}
                                {Array.isArray(r.limits) && r.limits.length > 0 && <p className={extremeDark ? "text-slate-400" : "text-slate-300"}><span className="font-medium">Limites :</span> {r.limits.join(" ; ")}</p>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucune évaluation de fiabilité fournie.</p>
                        )}
                      </div>

                      <div className={`pt-4 border-t space-y-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Limites de l'analyse</h4>
                        {Array.isArray(data.limits) && data.limits.length > 0 ? (
                          <ul className={`text-xs space-y-0.5 list-disc list-inside ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                            {data.limits.map((lim, idx) => <li key={`cmp-lim-${idx}`}>{lim}</li>)}
                          </ul>
                        ) : (
                          <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucune limite supplémentaire indiquée.</p>
                        )}
                      </div>

                      <div className={`pt-4 border-t space-y-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Références précises des sources utilisées</h4>
                        {Array.isArray(data.preciseReferences) && data.preciseReferences.length > 0 ? (
                          <ul className="space-y-1.5 text-xs">
                            {data.preciseReferences.map((ref, idx) => (
                              <li key={`cmp-ref-${idx}`} className={extremeDark ? "text-slate-300" : "text-slate-100"}>
                                <span className="font-medium">{ref.label} ({ref.sourceId}) :</span>{" "}
                                <a href={ref.finalUrl || ref.requestedUrl} target="_blank" rel="noopener noreferrer" className={`underline break-all ${extremeDark ? "text-cyan-300" : "text-cyan-200"}`}>
                                  {ref.finalUrl || ref.requestedUrl}
                                </a>
                                {ref.finalUrl && ref.finalUrl !== ref.requestedUrl && (
                                  <span className={extremeDark ? "text-slate-500" : "text-slate-400"}> (demandée : {ref.requestedUrl})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucune référence disponible.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Inspection details (metadata, extraction, structured analysis) */}
            {!activeRecord.isComparison && getWebHistoryOperationType(activeRecord) === "inspection" && (
              <div className={`pt-4 border-t space-y-1 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>Analyse de page</h3>
                <p className={`text-xs ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                  <span className="font-medium">URL demandée :</span> <span className="break-all">{activeRecord.metadata?.requestedUrl || getWebHistoryUrls(activeRecord)[0] || "Non disponible"}</span>
                </p>
                <p className={`text-xs ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                  <span className="font-medium">URL finale :</span> <span className="break-all">{activeRecord.metadata?.finalUrl || activeRecord.metadata?.requestedUrl || getWebHistoryUrls(activeRecord)[0] || "Non disponible"}</span>
                </p>
              </div>
            )}

            {!activeRecord.isComparison && activeRecord.metadata && (() => {
              const m = activeRecord.metadata;
              const field = (f?: { value?: string | null }) =>
                f?.value && f.value.trim() ? f.value.trim() : null;
              const rows: Array<{ label: string; value: string }> = [];
              const title = field(m.pageTitle);
              const h1 = field(m.mainH1);
              const author = field(m.author);
              const published = field(m.publishedDate);
              const modified = field(m.modifiedDate);
              const description = field(m.description);
              const siteName = field(m.siteName);
              const canonical = field(m.canonicalUrl);
              const language = field(m.language);
              const requested = m.requestedUrl?.trim() || null;
              const finalUrl = m.finalUrl?.trim() || null;

              if (title) rows.push({ label: "Titre", value: title });
              if (h1 && h1 !== title) rows.push({ label: "Titre principal (H1)", value: h1 });
              if (author) rows.push({ label: "Auteur", value: author });
              if (published) rows.push({ label: "Date de publication", value: published });
              if (modified) rows.push({ label: "Date de modification", value: modified });
              if (description) rows.push({ label: "Description", value: description });
              if (siteName) rows.push({ label: "Site", value: siteName });
              if (canonical) rows.push({ label: "URL canonique", value: canonical });
              if (language) rows.push({ label: "Langue", value: language });
              if (requested) rows.push({ label: "URL demandée", value: requested });
              if (finalUrl && finalUrl !== requested) rows.push({ label: "URL finale", value: finalUrl });

              const issues = Array.isArray(m.issues) ? m.issues.filter(Boolean) : [];
              if (rows.length === 0 && issues.length === 0) return null;

              return (
                <div
                  className={`pt-4 border-t space-y-2.5 ${
                    extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"
                  }`}
                >
                  <h3
                    className={`text-xs font-medium uppercase tracking-wider ${
                      extremeDark ? "text-slate-400" : "text-cyan-300"
                    }`}
                  >
                    Métadonnées de la page
                  </h3>
                  {rows.length > 0 && (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {rows.map((row) => (
                        <div key={row.label} className="min-w-0">
                          <dt className={extremeDark ? "text-slate-500" : "text-slate-400"}>
                            {row.label}
                          </dt>
                          <dd
                            className={`mt-0.5 break-words ${
                              extremeDark ? "text-slate-300" : "text-slate-100"
                            }`}
                          >
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {issues.length > 0 && (
                    <div className={`text-[11px] ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>
                      <p className="font-medium">Remarques sur les métadonnées</p>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        {issues.map((issue, idx) => (
                          <li key={`issue-${idx}`}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}

            {!activeRecord.isComparison && activeRecord.articleExtraction && (() => {
              const ex = activeRecord.articleExtraction;
              const statusLabel =
                ex.status === "success"
                  ? "Contenu extrait avec succès"
                  : ex.status === "partial"
                  ? "Contenu partiellement extrait"
                  : ex.status === "insufficient"
                  ? "Contenu insuffisant"
                  : "Extraction impossible";
              const methodLabel =
                ex.method === "heuristic-main-content"
                  ? "Extraction heuristique du contenu principal"
                  : ex.method === "legacy-naive-fallback"
                  ? "Repli vers l'extraction existante (texte brut)"
                  : "Aucune méthode d'extraction exploitable";
              const notes = Array.isArray(ex.notes) ? ex.notes.filter(Boolean) : [];
              const text = (ex.text || "").trim();
              const statusToneEx =
                ex.status === "success"
                  ? extremeDark ? "text-emerald-300/90" : "text-emerald-200"
                  : ex.status === "partial"
                  ? extremeDark ? "text-amber-300/90" : "text-amber-200"
                  : extremeDark ? "text-rose-300/90" : "text-rose-200";

              return (
                <div
                  className={`pt-4 border-t space-y-2.5 ${
                    extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3
                      className={`text-xs font-medium uppercase tracking-wider ${
                        extremeDark ? "text-slate-400" : "text-cyan-300"
                      }`}
                    >
                      Contenu extrait
                    </h3>
                    <span className={`text-xs font-medium ${statusToneEx}`}>{statusLabel}</span>
                  </div>
                  <div className={`text-xs space-y-1 ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                    <p>{methodLabel}</p>
                    {ex.usedFallback && <p>Un repli a été appliqué pour préserver l'analyse.</p>}
                    {ex.isIncomplete && ex.status !== "impossible" && (
                      <p>Le contenu peut être incomplet (limites de taille ou structure de page).</p>
                    )}
                    {typeof ex.charCount === "number" && ex.charCount > 0 && (
                      <p>{ex.charCount} caractère(s) extrait(s).</p>
                    )}
                  </div>
                  {notes.length > 0 && (
                    <div className={`text-[11px] ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>
                      <p className="font-medium">Remarques sur l'extraction</p>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        {notes.map((note, idx) => (
                          <li key={`article-note-${idx}`}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {text && (
                    <div
                      className={`rounded-xl border p-3 max-h-80 overflow-y-auto jarvis-scroll ${
                        extremeDark
                          ? "border-white/[0.06] bg-white/[0.02]"
                          : "border-cyan-400/15 bg-[#050A14]/50"
                      }`}
                    >
                      <p className={`text-[11px] uppercase tracking-wider mb-2 ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                        Texte extrait (donnée externe non fiable)
                      </p>
                      <div
                        className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          extremeDark ? "text-slate-300" : "text-slate-100"
                        }`}
                      >
                        {text}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {!activeRecord.isComparison && activeRecord.structuredAnalysis && (() => {
              const sa = activeRecord.structuredAnalysis;
              const d = sa.data;
              const statusLabel =
                sa.status === "success"
                  ? "Analyse structurée disponible"
                  : sa.status === "invalid"
                  ? "Analyse structurée invalide"
                  : sa.status === "error"
                  ? "Erreur d'analyse structurée"
                  : "Analyse structurée indisponible";
              const statusToneSa =
                sa.status === "success"
                  ? extremeDark ? "text-emerald-300/90" : "text-emerald-200"
                  : sa.status === "invalid" || sa.status === "error"
                  ? extremeDark ? "text-amber-300/90" : "text-amber-200"
                  : extremeDark ? "text-slate-400" : "text-slate-300";
              const validationErrors = Array.isArray(sa.validationErrors) ? sa.validationErrors.filter(Boolean) : [];
              const notes = Array.isArray(sa.notes) ? sa.notes.filter(Boolean) : [];

              const renderItems = (
                title: string,
                items?: Array<{
                  text: string;
                  category: string;
                  evidence: string | null;
                  sourceReference: string | null;
                  confidence: string;
                  limitations: string | null;
                }>
              ) => {
                const list = Array.isArray(items) ? items : [];
                return (
                  <div className="space-y-1.5">
                    <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>
                      {title} <span className={extremeDark ? "text-slate-500" : "text-slate-400"}>({list.length})</span>
                    </h4>
                    {list.length === 0 ? (
                      <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucun élément identifié.</p>
                    ) : (
                      <ul className="space-y-2">
                        {list.map((item, idx) => (
                          <li
                            key={`${title}-${idx}`}
                            className={`rounded-lg border p-2.5 text-xs space-y-1 ${
                              extremeDark ? "border-white/[0.06] bg-white/[0.01]" : "border-cyan-400/10 bg-[#050A14]/40"
                            }`}
                          >
                            <p className={`leading-relaxed ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{item.text}</p>
                            <p className={extremeDark ? "text-slate-500" : "text-slate-400"}>
                              Confiance (qualitative, non probabiliste) : <span className={extremeDark ? "text-slate-300" : "text-slate-200"}>{item.confidence}</span>
                            </p>
                            {item.evidence && (
                              <p className={extremeDark ? "text-slate-400" : "text-slate-300"}>
                                <span className="font-medium">Éléments/preuves dans le contenu :</span> {item.evidence}
                              </p>
                            )}
                            {item.sourceReference && (
                              <p className={extremeDark ? "text-slate-400" : "text-slate-300"}>
                                <span className="font-medium">Référence/source indiquée :</span> {item.sourceReference}
                              </p>
                            )}
                            {item.limitations && (
                              <p className={extremeDark ? "text-amber-300/80" : "text-amber-200/90"}>
                                <span className="font-medium">Limites :</span> {item.limitations}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              };

              return (
                <div
                  className={`pt-4 border-t space-y-3 ${
                    extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3
                      className={`text-xs font-medium uppercase tracking-wider ${
                        extremeDark ? "text-slate-400" : "text-cyan-300"
                      }`}
                    >
                      Analyse structurée et esprit critique
                    </h3>
                    <span className={`text-xs font-medium ${statusToneSa}`}>{statusLabel}</span>
                  </div>

                  <p className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                    Consultation d'un résultat enregistré (sans relancer Gemini). Analyse basée sur le contenu extrait et les métadonnées disponibles (données externes non fiables).
                  </p>

                  {sa.error && (
                    <p className={`text-xs ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>{sa.error}</p>
                  )}

                  {validationErrors.length > 0 && (
                    <div className={`text-[11px] ${extremeDark ? "text-amber-300/80" : "text-amber-200/90"}`}>
                      <p className="font-medium">Validation / remarques de structure</p>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        {validationErrors.map((err, idx) => (
                          <li key={`sa-val-${idx}`}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {notes.length > 0 && (
                    <div className={`text-[11px] ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                      <ul className="space-y-0.5 list-disc list-inside">
                        {notes.map((note, idx) => (
                          <li key={`sa-note-${idx}`}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sa.status === "success" && d && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Résumé</h4>
                        <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{d.summary}</p>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Sujet principal</h4>
                        <p className={`text-sm ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>{d.mainTopic}</p>
                      </div>

                      {renderItems("Idées essentielles", d.keyPoints)}
                      {renderItems("Faits et informations vérifiables (selon le contenu disponible)", d.verifiedFacts)}
                      {renderItems("Affirmations non vérifiées", d.unverifiedClaims)}
                      {renderItems("Hypothèses", d.hypotheses)}
                      {renderItems("Contradictions", d.contradictions)}
                      {renderItems("Informations manquantes", d.missingInformation)}
                      {renderItems("Fiabilité et limites", d.reliabilityAssessment)}

                      <div className="space-y-1.5">
                        <h4 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>Limites générales</h4>
                        {Array.isArray(d.limitations) && d.limitations.length > 0 ? (
                          <ul className={`text-xs space-y-0.5 list-disc list-inside ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                            {d.limitations.map((lim, idx) => (
                              <li key={`sa-lim-${idx}`}>{lim}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>Aucune limite générale supplémentaire indiquée.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {sa.status !== "success" && (
                    <p className={`text-xs ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>
                      Le contenu extrait et les métadonnées restent disponibles ci-dessus. Aucun champ d'analyse n'a été inventé.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Requêtes de recherche enregistrées (références disponibles) */}
            {!activeRecord.isComparison && Array.isArray(activeRecord.searchQueries) && activeRecord.searchQueries.length > 0 && (
              <div className={`pt-4 border-t space-y-1.5 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"}`}>
                <h3 className={`text-xs font-medium uppercase tracking-wider ${extremeDark ? "text-slate-400" : "text-cyan-300"}`}>
                  Requêtes utilisées
                </h3>
                <ul className={`text-xs space-y-0.5 list-disc list-inside ${extremeDark ? "text-slate-300" : "text-slate-100"}`}>
                  {activeRecord.searchQueries.map((sq, idx) => <li key={`sq-${idx}`} className="break-words">{sq}</li>)}
                </ul>
              </div>
            )}

            {/* Sources list (kept for all records) */}
            {Array.isArray(activeRecord.sources) && activeRecord.sources.length > 0 && (
              <div
                className={`pt-4 border-t space-y-2.5 ${
                  extremeDark ? "border-white/[0.06]" : "border-cyan-400/15"
                }`}
              >
                <h3
                  className={`text-xs font-medium uppercase tracking-wider ${
                    extremeDark ? "text-slate-400" : "text-cyan-300"
                  }`}
                >
                  {activeRecord.isComparison ? "Références des sources" : "Sources citées"} ({activeRecord.sources.length})
                </h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeRecord.sources.map((src, idx) => (
                    <li key={`${activeRecord.id}-s-${idx}`}>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-between gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border text-xs transition-colors ${
                          extremeDark
                            ? "border-white/[0.06] text-slate-300 hover:border-cyan-500/35"
                            : "border-cyan-400/15 bg-[#050A14]/70 text-slate-200 hover:border-cyan-400/40 hover:text-cyan-100"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            [{idx + 1}] {src.title || src.domain}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {src.domain}{src.snippet ? ` · ${src.snippet}` : ""}
                          </p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Centralized History (Module 7.2.5) */}
        <section
          className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <History className={`w-4 h-4 ${extremeDark ? "text-cyan-300" : "text-cyan-200"}`} />
              <h3 className={`text-sm sm:text-base font-medium ${extremeDark ? "text-slate-200" : "text-cyan-100"}`}>
                Historique centralisé
              </h3>
              <span className={`text-xs ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                ({history.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleExportJson} disabled={actionBusy} className={smallBtnClass()}>
                <FileJson className="w-3.5 h-3.5" /> <span>Export JSON</span>
              </button>
              <button type="button" onClick={handleExportMarkdown} disabled={actionBusy} className={smallBtnClass()}>
                <FileText className="w-3.5 h-3.5" /> <span>Export Markdown</span>
              </button>
              <button
                type="button"
                onClick={() => { clearActionFeedback(); setConfirmClearAll((v) => !v); setConfirmDeleteSelected(false); }}
                disabled={actionBusy || history.length === 0}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                  extremeDark ? "border-red-500/25 text-red-300 hover:bg-red-950/20" : "border-red-400/25 text-red-200 hover:bg-red-500/10"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" /> <span>Tout supprimer</span>
              </button>
            </div>
          </div>

          <p className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Consultation des résultats enregistrés sans relancer Gemini ni retélécharger les pages. Les exports incluent les informations disponibles (sans clés API ni tokens).
          </p>

          {confirmClearAll && (
            <div className={`rounded-xl border p-3 space-y-2 ${extremeDark ? "border-red-500/25 bg-red-950/10" : "border-red-400/25 bg-red-500/10"}`}>
              <p className={`text-sm ${extremeDark ? "text-red-200" : "text-red-100"}`}>
                Confirmer la suppression définitive de tout l'historique Web ? Cette action sera réellement persistée dans IndexedDB.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void handleClearAll()} disabled={actionBusy} className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-40 ${extremeDark ? "border-red-500/35 text-red-200 bg-red-950/30" : "border-red-400/35 text-red-50 bg-red-500/20"}`}>
                  Confirmer l'effacement
                </button>
                <button type="button" onClick={() => setConfirmClearAll(false)} disabled={actionBusy} className={smallBtnClass()}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Search & filters */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${extremeDark ? "text-slate-500" : "text-slate-400"}`} />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Rechercher dans l'historique (mot-clé, titre, URL, domaine, sujet, résumé)…"
                  aria-label="Recherche dans l'historique Web"
                  className={`w-full ${inputClass} pl-9`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className={`text-[11px] flex items-center gap-1 ${extremeDark ? "text-slate-500" : "text-slate-400"}`}><Filter className="w-3 h-3" /> Type</span>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} className={`w-full ${inputClass} h-10 px-3`}>
                  <option value="all">Toutes les opérations</option>
                  <option value="search">Recherches Web</option>
                  <option value="inspection">Analyses de pages</option>
                  <option value="comparison">Comparaisons</option>
                  <option value="research">Enquêtes approfondies</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] flex items-center gap-1 ${extremeDark ? "text-slate-500" : "text-slate-400"}`}><Filter className="w-3 h-3" /> Statut</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={`w-full ${inputClass} h-10 px-3`}>
                  <option value="all">Tous les statuts</option>
                  <option value="réussi">Réussies</option>
                  <option value="partiel">Partielles</option>
                  <option value="erreur">En erreur</option>
                  <option value="indisponible">Indisponibles</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] flex items-center gap-1 ${extremeDark ? "text-slate-500" : "text-slate-400"}`}><Filter className="w-3 h-3" /> Tri</span>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className={`w-full ${inputClass} h-10 px-3`}>
                  <option value="recent">Plus récentes</option>
                  <option value="oldest">Plus anciennes</option>
                  <option value="alpha">Alphabétique (titre)</option>
                </select>
              </label>
            </div>
          </div>

          {/* Selection actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={selectAllFiltered} disabled={actionBusy || filteredHistory.length === 0} className={smallBtnClass()}>
              <CheckSquare className="w-3.5 h-3.5" /> <span>Tout sélectionner (filtré)</span>
            </button>
            <button type="button" onClick={clearSelection} disabled={actionBusy || selectedIds.size === 0} className={smallBtnClass()}>
              <X className="w-3.5 h-3.5" /> <span>Désélectionner</span>
            </button>
            <button
              type="button"
              onClick={() => { clearActionFeedback(); setConfirmDeleteSelected((v) => !v); setConfirmClearAll(false); }}
              disabled={actionBusy || selectedIds.size === 0}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                extremeDark ? "border-red-500/25 text-red-300 hover:bg-red-950/20" : "border-red-400/25 text-red-200 hover:bg-red-500/10"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" /> <span>Supprimer la sélection ({selectedIds.size})</span>
            </button>
            <span className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
              {filteredHistory.length} affichée(s) / {history.length} au total
            </span>
          </div>

          {confirmDeleteSelected && selectedIds.size > 0 && (
            <div className={`rounded-xl border p-3 space-y-2 ${extremeDark ? "border-red-500/25 bg-red-950/10" : "border-red-400/25 bg-red-500/10"}`}>
              <p className={`text-sm ${extremeDark ? "text-red-200" : "text-red-100"}`}>
                Confirmer la suppression définitive de {selectedIds.size} entrée(s) sélectionnée(s) ? Cette action sera réellement persistée.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void handleDeleteSelected()} disabled={actionBusy} className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-40 ${extremeDark ? "border-red-500/35 text-red-200 bg-red-950/30" : "border-red-400/35 text-red-50 bg-red-500/20"}`}>
                  Confirmer la suppression
                </button>
                <button type="button" onClick={() => setConfirmDeleteSelected(false)} disabled={actionBusy} className={smallBtnClass()}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {actionMsg && <p className="text-xs text-emerald-300">{actionMsg}</p>}
          {actionErr && <p className="text-xs text-red-300">{actionErr}</p>}
          {actionBusy && <p className={`text-xs ${extremeDark ? "text-cyan-300/90" : "text-cyan-200"}`}>Opération en cours…</p>}

          {/* History states & list */}
          {historyLoading ? (
            <div className={`text-sm py-4 ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>Chargement de l'historique…</div>
          ) : historyError ? (
            <div className={`rounded-xl border p-3 text-sm ${extremeDark ? "border-red-500/25 text-red-200 bg-red-950/10" : "border-red-400/25 text-red-100 bg-red-500/10"}`}>
              Erreur lors du chargement de l'historique : {historyError}
            </div>
          ) : history.length === 0 ? (
            <div className={`rounded-xl border p-4 text-sm ${extremeDark ? "border-white/[0.06] text-slate-400" : "border-cyan-400/15 text-slate-300"}`}>
              Historique vide. Les recherches, analyses de pages et comparaisons effectuées apparaîtront ici.
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className={`rounded-xl border p-4 text-sm ${extremeDark ? "border-white/[0.06] text-slate-400" : "border-cyan-400/15 text-slate-300"}`}>
              Aucun résultat ne correspond aux filtres ou à la recherche actuelle.
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredHistory.map((item) => {
                const t = getWebHistoryOperationType(item);
                const s = getWebHistoryStatus(item);
                const title = getWebHistoryTitle(item);
                const urls = getWebHistoryUrls(item);
                const domains = getWebHistoryDomains(item);
                const selected = selectedIds.has(item.id);
                const active = activeRecord?.id === item.id;
                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border px-3 py-2.5 transition-colors ${
                      active
                        ? extremeDark
                          ? "bg-cyan-950/20 border-cyan-500/30"
                          : "bg-cyan-500/10 border-cyan-400/30"
                        : extremeDark
                        ? "bg-black border-white/[0.05]"
                        : "border-cyan-400/10 bg-[#050A14]/30"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleSelected(item.id)}
                        aria-label={selected ? "Désélectionner cette entrée" : "Sélectionner cette entrée"}
                        className={`mt-0.5 inline-flex items-center justify-center w-11 h-11 rounded-lg shrink-0 cursor-pointer ${extremeDark ? "text-slate-400 hover:text-cyan-200 hover:bg-white/[0.04]" : "text-slate-400 hover:text-cyan-100 hover:bg-cyan-500/10"}`}
                      >
                        {selected ? <CheckSquare className="w-4 h-4 text-cyan-300" /> : <Square className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => openRecord(item)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${typeChipClass(extremeDark)}`}>
                            {typeLabel(t)}
                          </span>
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusTone(s, extremeDark)}`}>
                            {s}
                          </span>
                          <span className={`text-[11px] ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.timestamp || Date.now()))}
                          </span>
                        </div>
                        <p className={`text-sm font-medium truncate ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>{title}</p>
                        {item.query && item.query !== title && (
                          <p className={`text-xs truncate ${extremeDark ? "text-slate-400" : "text-slate-300"}`}>{item.query}</p>
                        )}
                        <p className={`text-[11px] truncate ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                          {t === "comparison"
                            ? `${Array.isArray(item.comparisonSources) ? item.comparisonSources.length : (item.comparedUrls?.length || 0)} source(s) comparée(s)`
                            : `${Array.isArray(item.sources) ? item.sources.length : 0} source(s)`}
                          {domains.length > 0 ? ` · ${domains.slice(0, 3).join(", ")}${domains.length > 3 ? "…" : ""}` : ""}
                          {urls.length > 0 && domains.length === 0 ? ` · ${urls[0]}` : ""}
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          aria-label="Supprimer cette entrée"
                          disabled={actionBusy}
                          className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
