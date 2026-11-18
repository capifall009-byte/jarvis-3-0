import type {
  WebArticleExtraction,
  WebPageMetadata,
  WebSearchRecord,
  WebSource,
  WebResearchResult,
  WebSourceComparisonResult,
  WebSourceComparisonSource,
  WebStructuredAnalysis,
} from "../../types/jarvis";
import {
  idbClearRequired,
  idbDeleteRequired,
  idbGetAll,
  idbGetAllRequired,
  idbPut,
} from "../storage/IndexedDbStore";

export type WebHistoryOperationType = "search" | "inspection" | "comparison" | "research";
export type WebHistoryStatus = "réussi" | "partiel" | "erreur" | "indisponible";

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getWebHistoryOperationType(record: WebSearchRecord): WebHistoryOperationType {
  if (record.isResearch) return "research";
  if (record.isComparison) return "comparison";
  if (record.isUrlInspection) return "inspection";
  return "search";
}

export function getWebHistoryStatus(record: WebSearchRecord): WebHistoryStatus {
  const type = getWebHistoryOperationType(record);
  if (type === "research") {
    const st = record.research?.status;
    if (st === "success") return "réussi";
    if (st === "partial") return "partiel";
    if (st === "error") return "erreur";
    if (st === "unavailable") return "indisponible";
    return "indisponible";
  }
  if (type === "comparison") {
    const st = record.sourceComparison?.status;
    if (st === "success") return "réussi";
    if (st === "partial") return "partiel";
    if (st === "invalid" || st === "error") return "erreur";
    if (st === "unavailable") return "indisponible";
    // fallback if comparison payload missing
    return record.comparisonSources && record.comparisonSources.length > 0 ? "partiel" : "indisponible";
  }
  if (type === "inspection") {
    const art = record.articleExtraction?.status;
    const sa = record.structuredAnalysis?.status;
    const hasAnswer = typeof record.answer === "string" && record.answer.trim().length > 0;
    if (!hasAnswer && (art === "impossible" || art === "insufficient")) return "indisponible";
    if (art === "impossible" || art === "insufficient" || sa === "invalid" || sa === "error") return "partiel";
    if (sa === "unavailable" && art === "partial") return "partiel";
    return hasAnswer ? "réussi" : "indisponible";
  }
  // search
  const hasAnswer = typeof record.answer === "string" && record.answer.trim().length > 0;
  return hasAnswer ? "réussi" : "indisponible";
}

function tryHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function getWebHistoryUrls(record: WebSearchRecord): string[] {
  const urls = new Set<string>();
  const push = (u?: string | null) => {
    if (typeof u === "string" && u.trim()) urls.add(u.trim());
  };
  push(record.metadata?.requestedUrl ?? null);
  push(record.metadata?.finalUrl ?? null);
  push(record.metadata?.canonicalUrl?.value ?? null);
  if (Array.isArray(record.comparedUrls)) record.comparedUrls.forEach(push);
  if (Array.isArray(record.comparisonSources)) {
    for (const s of record.comparisonSources) {
      push(s.requestedUrl);
      push(s.finalUrl ?? null);
    }
  }
  if (Array.isArray(record.sources)) {
    for (const s of record.sources) push(s.url);
  }
  if (Array.isArray(record.research?.report?.sources)) {
    for (const s of record.research!.report!.sources) push(s.url);
  }
  if (Array.isArray(record.research?.steps)) {
    for (const step of record.research!.steps) {
      if (Array.isArray(step.sources)) for (const s of step.sources) push(s.url);
    }
  }
  // fallback: query may contain inspected url in legacy format
  return [...urls];
}

export function getWebHistoryDomains(record: WebSearchRecord): string[] {
  const domains = new Set<string>();
  for (const u of getWebHistoryUrls(record)) {
    const h = tryHostname(u);
    if (h) domains.add(h);
  }
  if (Array.isArray(record.sources)) {
    for (const s of record.sources) {
      if (s.domain) domains.add(s.domain.toLowerCase().trim());
    }
  }
  return [...domains].filter(Boolean);
}

export function getWebHistoryTitle(record: WebSearchRecord): string {
  const t =
    record.metadata?.pageTitle?.value ||
    record.metadata?.mainH1?.value ||
    record.articleExtraction?.title ||
    (record.isComparison ? record.query : null) ||
    record.query;
  return (t || "Entrée Web").toString().trim() || "Entrée Web";
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || value == null) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (t) out.push(t);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out, depth + 1);
  }
}

export function getWebHistorySearchText(record: WebSearchRecord): string {
  const parts: string[] = [];
  parts.push(record.query || "", record.answer || "", getWebHistoryTitle(record));
  parts.push(getWebHistoryOperationType(record), getWebHistoryStatus(record));
  for (const u of getWebHistoryUrls(record)) parts.push(u);
  for (const d of getWebHistoryDomains(record)) parts.push(d);
  if (Array.isArray(record.searchQueries)) parts.push(record.searchQueries.join(" "));
  if (Array.isArray(record.sources)) {
    for (const s of record.sources) parts.push(s.title || "", s.url || "", s.domain || "", s.snippet || "");
  }
  if (record.metadata) collectStrings(record.metadata, parts);
  if (record.articleExtraction) collectStrings(record.articleExtraction, parts);
  if (record.structuredAnalysis) collectStrings(record.structuredAnalysis, parts);
  if (record.sourceComparison) collectStrings(record.sourceComparison, parts);
  if (record.comparisonSources) collectStrings(record.comparisonSources, parts);
  if (record.research) collectStrings(record.research, parts);
  return parts.join(" ").toLowerCase();
}

export async function searchWebWithJarvis(query: string): Promise<WebSearchRecord> {
  const res = await fetch("/api/web/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const data = (await res.json()) as {
    query?: string;
    answer?: string;
    sources?: WebSource[];
    searchQueries?: string[];
    model?: string;
    timestamp?: number;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || `Erreur de recherche Web (${res.status}).`);
  }

  const record: WebSearchRecord = {
    id: createId(),
    query: data.query || query,
    answer: data.answer || "Aucun résultat.",
    sources: Array.isArray(data.sources) ? data.sources : [],
    searchQueries: data.searchQueries,
    model: data.model,
    timestamp: data.timestamp || Date.now(),
    isUrlInspection: false,
  };

  await idbPut("searches", record);
  return record;
}

export async function inspectWebUrlWithJarvis(
  url: string,
  question?: string
): Promise<WebSearchRecord> {
  const res = await fetch("/api/web/inspect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, question }),
  });

  const data = (await res.json()) as {
    url?: string;
    answer?: string;
    sources?: WebSource[];
    model?: string;
    timestamp?: number;
    error?: string;
    metadata?: WebPageMetadata;
    articleExtraction?: WebArticleExtraction;
    structuredAnalysis?: WebStructuredAnalysis;
  };

  if (!res.ok) {
    throw new Error(data.error || `Erreur d'analyse de page (${res.status}).`);
  }

  const record: WebSearchRecord = {
    id: createId(),
    query: question ? `${question} (${data.url || url})` : data.url || url,
    answer: data.answer || "Aucun contenu extrait.",
    sources: Array.isArray(data.sources) ? data.sources : [],
    model: data.model,
    timestamp: data.timestamp || Date.now(),
    isUrlInspection: true,
    ...(data.metadata ? { metadata: data.metadata } : {}),
    ...(data.articleExtraction ? { articleExtraction: data.articleExtraction } : {}),
    ...(data.structuredAnalysis ? { structuredAnalysis: data.structuredAnalysis } : {}),
  };

  await idbPut("searches", record);
  return record;
}

export async function compareWebSourcesWithJarvis(urls: string[]): Promise<WebSearchRecord> {
  const res = await fetch("/api/web/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    timestamp?: number;
    model?: string;
    sources?: WebSourceComparisonSource[];
    comparison?: WebSourceComparisonResult;
    error?: string;
    code?: string;
  };

  const comparisonSources = Array.isArray(data.sources) ? data.sources : undefined;
  if (!res.ok && !comparisonSources) {
    throw new Error(data.error || `Erreur de comparaison des sources (${res.status}).`);
  }

  const comparedUrls = comparisonSources
    ? comparisonSources.map((s) => s.requestedUrl).filter(Boolean)
    : urls.filter((u) => typeof u === "string" && u.trim()).map((u) => u.trim());

  const synthesis = data.comparison?.data?.generalSynthesis?.trim();
  const answer =
    synthesis ||
    data.error ||
    (data.comparison?.status === "invalid"
      ? "La comparaison a échoué : réponse d'analyse invalide."
      : data.comparison?.status === "error"
      ? "La comparaison a échoué lors de l'analyse Gemini."
      : data.comparison?.status === "unavailable"
      ? "Comparaison indisponible (aucune source exploitable ou service indisponible)."
      : "Comparaison terminée.");

  const sourceRefs: WebSource[] = (comparisonSources || []).map((s) => {
    const url = s.finalUrl || s.requestedUrl;
    let domain = "";
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      domain = url;
    }
    const title = s.metadata?.pageTitle?.value || s.articleExtraction?.title || s.label || domain || "Source";
    const statusLabel =
      s.status === "accessible"
        ? "accessible"
        : s.status === "insufficient"
        ? "contenu insuffisant"
        : s.status === "inaccessible"
        ? "inaccessible"
        : "erreur";
    const analyzedLabel = s.analyzed ? "analysée" : "non analysée";
    return {
      title,
      url,
      domain,
      snippet: `${s.label} — ${statusLabel}, ${analyzedLabel}${s.error ? ` — ${s.error}` : ""}`,
    };
  });

  const record: WebSearchRecord = {
    id: createId(),
    query: `Comparaison de ${comparedUrls.length} source${comparedUrls.length > 1 ? "s" : ""}`,
    answer,
    sources: sourceRefs,
    model: data.model || data.comparison?.model,
    timestamp: data.timestamp || Date.now(),
    isComparison: true,
    comparedUrls,
    ...(comparisonSources ? { comparisonSources } : {}),
    ...(data.comparison ? { sourceComparison: data.comparison } : {}),
  };

  await idbPut("searches", record);
  return record;
}

/** Module 7.3 — lance une enquête multi-étapes et persiste le résultat dans le store existant. */
export async function runDeepResearch(
  question: string,
  known?: Array<{ query: string; answer: string }>
): Promise<WebSearchRecord> {
  const res = await fetch("/api/web/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, known: known || [] }),
  });

  const data = (await res.json().catch(() => ({}))) as WebResearchResult & { error?: string };
  const research: WebResearchResult = data.steps
    ? data
    : {
        id: createId(),
        question,
        timestamp: Date.now(),
        status: "error",
        steps: [],
        error: data.error || `Erreur de recherche approfondie (${res.status}).`,
      };

  const report = research.report;
  const answer =
    report?.executiveSummary ||
    research.error ||
    (research.status === "unavailable"
      ? "Enquête indisponible : aucune source exploitable."
      : "Enquête terminée sans synthèse exploitable.");

  const record: WebSearchRecord = {
    id: research.id || createId(),
    query: research.question || question,
    answer,
    sources: Array.isArray(report?.sources) ? report!.sources : [],
    model: research.model,
    timestamp: research.timestamp || Date.now(),
    isResearch: true,
    research,
  };

  await idbPut("searches", record);
  return record;
}

/** Liste complète de l'historique Web (recherches, inspections, comparaisons, enquêtes), du plus récent au plus ancien. */
export async function listSavedSearches(): Promise<WebSearchRecord[]> {
  try {
    const items = await idbGetAllRequired<WebSearchRecord>("searches");
    return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    // fallback compatible si lecture required indisponible
    const items = await idbGetAll<WebSearchRecord>("searches");
    return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
}

/** Suppression individuelle réellement persistée (échec explicite si non confirmé). */
export async function removeSavedSearch(id: string): Promise<void> {
  await idbDeleteRequired("searches", id);
}

/** Suppression multiple réellement persistée (arrêt et erreur si une suppression échoue). */
export async function removeSavedSearches(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  for (const id of unique) {
    await idbDeleteRequired("searches", id);
  }
}

/** Effacement complet réellement persisté (échec explicite si non confirmé). */
export async function clearSavedSearches(): Promise<void> {
  await idbClearRequired("searches");
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  if (typeof document === "undefined") {
    throw new Error("Export indisponible dans cet environnement.");
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function exportWebHistoryAsJson(records: WebSearchRecord[]): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    format: "jarvis-web-history-json-v1",
    count: records.length,
    records,
  };
  downloadTextFile(
    `jarvis-web-historique-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
}

function mdEscape(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function exportWebHistoryAsMarkdown(records: WebSearchRecord[]): void {
  const lines: string[] = [];
  lines.push("# Historique Web JARVIS");
  lines.push("");
  lines.push(`- Exporté le : ${new Date().toLocaleString("fr-FR")}`);
  lines.push(`- Entrées : ${records.length}`);
  lines.push("");
  lines.push("> Export local des informations disponibles. Les données manquantes des anciennes entrées ne sont pas inventées. Aucune clé API ni token n'est inclus.");
  lines.push("");

  for (const record of records) {
    const type = getWebHistoryOperationType(record);
    const status = getWebHistoryStatus(record);
    const urls = getWebHistoryUrls(record);
    lines.push(`## ${mdEscape(getWebHistoryTitle(record))}`);
    lines.push("");
    lines.push(`- **ID** : ${record.id}`);
    lines.push(`- **Type** : ${type === "search" ? "Recherche Web" : type === "inspection" ? "Analyse de page" : "Comparaison de sources"}`);
    lines.push(`- **Date** : ${new Date(record.timestamp || Date.now()).toLocaleString("fr-FR")}`);
    lines.push(`- **Statut** : ${status}`);
    lines.push(`- **Sujet / requête** : ${mdEscape(record.query || "Non disponible")}`);
    if (record.model) lines.push(`- **Modèle** : ${record.model}`);
    if (urls.length > 0) {
      lines.push(`- **URL(s)** :`);
      for (const u of urls) lines.push(`  - ${u}`);
    }
    lines.push("");
    lines.push("### Résumé / réponse");
    lines.push("");
    lines.push(mdEscape(record.answer || "Non disponible"));
    lines.push("");

    if (Array.isArray(record.sources) && record.sources.length > 0) {
      lines.push("### Sources et références");
      lines.push("");
      for (const s of record.sources) {
        lines.push(`- **${mdEscape(s.title || s.domain || "Source")}** — ${s.url || ""}${s.domain ? ` (${s.domain})` : ""}${s.snippet ? ` — ${mdEscape(s.snippet)}` : ""}`);
      }
      lines.push("");
    }

    if (record.metadata) {
      lines.push("### Métadonnées disponibles");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(record.metadata, null, 2));
      lines.push("```");
      lines.push("");
    }

    if (record.articleExtraction) {
      lines.push("### Résultats d'extraction");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(record.articleExtraction, null, 2));
      lines.push("```");
      lines.push("");
    }

    if (record.structuredAnalysis) {
      lines.push("### Analyse structurée");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(record.structuredAnalysis, null, 2));
      lines.push("```");
      lines.push("");
    }

    if (record.isComparison && (record.comparisonSources || record.sourceComparison)) {
      lines.push("### Comparaison de sources");
      lines.push("");
      if (record.comparisonSources) {
        lines.push("#### Sources comparées");
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify(record.comparisonSources, null, 2));
        lines.push("```");
        lines.push("");
      }
      if (record.sourceComparison) {
        lines.push("#### Résultat comparatif");
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify(record.sourceComparison, null, 2));
        lines.push("```");
        lines.push("");
      }
    }

    if (record.research) {
      lines.push("### Enquête approfondie");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(record.research, null, 2));
      lines.push("```");
      lines.push("");
    }

    if (!record.metadata && !record.articleExtraction && !record.structuredAnalysis && !(record.isComparison && (record.comparisonSources || record.sourceComparison)) && !record.research) {
      lines.push("_Certaines informations détaillées ne sont pas disponibles pour cette ancienne entrée._");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  downloadTextFile(
    `jarvis-web-historique-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
    lines.join("\n"),
    "text/markdown;charset=utf-8"
  );
}
