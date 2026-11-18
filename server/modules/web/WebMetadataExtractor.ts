export interface WebMetadataField<T> {
  value: T | null;
  sources: string[];
}

export interface WebPageMetadata {
  requestedUrl: string | null;
  finalUrl: string | null;
  pageTitle: WebMetadataField<string>;
  mainH1: WebMetadataField<string>;
  author: WebMetadataField<string>;
  publishedDate: WebMetadataField<string>;
  modifiedDate: WebMetadataField<string>;
  description: WebMetadataField<string>;
  siteName: WebMetadataField<string>;
  canonicalUrl: WebMetadataField<string>;
  language: WebMetadataField<string>;
  provenance: Record<string, string[]>;
  issues: string[];
}

interface Candidate {
  value: string;
  source: string;
}

const MAX_TEXT = 300;
const MAX_LONG_TEXT = 500;
const MAX_URL = 1000;
const MAX_ISSUES = 20;

function emptyField(): WebMetadataField<string> {
  return { value: null, sources: [] };
}

function clampText(value: string, max = MAX_TEXT): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  let s = input;
  // Named entities (common subset)
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&copy;/gi, "©")
    .replace(/&reg;/gi, "®")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–");
  // Numeric entities
  s = s.replace(/&#(\d+);/g, (_m, dec) => {
    const code = Number(dec);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    try { return String.fromCodePoint(code); } catch { return ""; }
  });
  s = s.replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
    const code = parseInt(hex, 16);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    try { return String.fromCodePoint(code); } catch { return ""; }
  });
  return s;
}

function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function pickField(
  candidates: Candidate[],
  opts?: { maxLen?: number; url?: boolean; date?: boolean }
): { field: WebMetadataField<string>; issues: string[] } {
  const issues: string[] = [];
  const maxLen = opts?.url ? MAX_URL : opts?.date ? 120 : (opts?.maxLen ?? MAX_TEXT);
  const cleaned = candidates
    .map((c) => ({ value: clampText(decodeHtmlEntities(c.value), maxLen), source: c.source }))
    .filter((c) => c.value.length > 0);

  if (cleaned.length === 0) return { field: emptyField(), issues };

  const groups = new Map<string, string[]>();
  for (const c of cleaned) {
    const key = normalizeForCompare(c.value);
    const arr = groups.get(key) || [];
    if (!arr.includes(c.source)) arr.push(c.source);
    groups.set(key, arr);
  }

  const distinctKeys = [...groups.keys()];
  // Prefer first-seen value's canonical string
  const firstKey = distinctKeys[0];
  const chosenValue = cleaned.find((c) => normalizeForCompare(c.value) === firstKey)?.value ?? null;
  const allSources = [...new Set(cleaned.map((c) => c.source))];

  if (distinctKeys.length > 1) {
    issues.push("Valeurs contradictoires ou multiples détectées pour un même champ.");
  }

  return {
    field: { value: chosenValue, sources: allSources },
    issues,
  };
}

function getAttr(tag: string, attrName: string): string | null {
  // Matches attr="..." or attr='...' or attr=unquoted (rare)
  const re = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'<>\`]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

function extractMetaCandidates(html: string): {
  byName: Map<string, Candidate[]>;
  byProperty: Map<string, Candidate[]>;
} {
  const byName = new Map<string, Candidate[]>();
  const byProperty = new Map<string, Candidate[]>();
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0];
    const content = getAttr(tag, "content");
    if (content == null) continue;
    const name = getAttr(tag, "name");
    const property = getAttr(tag, "property");
    const itemprop = getAttr(tag, "itemprop");
    if (name) {
      const key = name.toLowerCase().trim();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push({ value: content, source: `meta[name="${key}"]` });
    }
    if (property) {
      const key = property.toLowerCase().trim();
      if (!byProperty.has(key)) byProperty.set(key, []);
      byProperty.get(key)!.push({ value: content, source: `meta[property="${key}"]` });
    }
    if (itemprop) {
      const key = itemprop.toLowerCase().trim();
      if (!byName.has(`itemprop:${key}`)) byName.set(`itemprop:${key}`, []);
      byName.get(`itemprop:${key}`)!.push({ value: content, source: `meta[itemprop="${key}"]` });
    }
  }
  return { byName, byProperty };
}

function extractTitle(html: string): Candidate[] {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return [];
  const raw = m[1].replace(/<[^>]+>/g, " ");
  return [{ value: raw, source: "html:title" }];
}

function extractH1(html: string): Candidate[] {
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].replace(/<[^>]+>/g, " ");
    const text = clampText(decodeHtmlEntities(raw), MAX_TEXT);
    if (text) return [{ value: raw, source: "html:h1" }];
  }
  return [];
}

function extractCanonical(html: string): Candidate[] {
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const rel = getAttr(tag, "rel");
    if (!rel) continue;
    const relTokens = rel.toLowerCase().split(/\s+/);
    if (!relTokens.includes("canonical")) continue;
    const href = getAttr(tag, "href");
    if (href != null) return [{ value: href, source: "html:link[rel=canonical]" }];
  }
  return [];
}

function extractLanguage(html: string): Candidate[] {
  const htmlTag = html.match(/<html\b[^>]*>/i);
  if (!htmlTag) return [];
  const lang = getAttr(htmlTag[0], "lang") || getAttr(htmlTag[0], "xml:lang");
  if (!lang) return [];
  return [{ value: lang, source: "html:lang" }];
}

function extractJsonLdScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.replace(/\s+/g, " ").trim();
    return t ? t : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function authorFromJsonLd(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === "string") return node.trim() || null;
  if (Array.isArray(node)) {
    const names = node.map(authorFromJsonLd).filter((n): n is string => !!n);
    if (names.length === 0) return null;
    // join distinct
    return [...new Set(names)].join(", ");
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const name = asString(obj.name) || asString(obj.alternateName);
    if (name) return name;
    // nested author structures
    if (obj.author) return authorFromJsonLd(obj.author);
  }
  return null;
}

function siteNameFromJsonLd(obj: Record<string, unknown>): string | null {
  const publisher = obj.publisher;
  if (publisher && typeof publisher === "object" && !Array.isArray(publisher)) {
    const name = asString((publisher as Record<string, unknown>).name);
    if (name) return name;
  }
  const isPartOf = obj.isPartOf;
  if (isPartOf && typeof isPartOf === "object" && !Array.isArray(isPartOf)) {
    const name = asString((isPartOf as Record<string, unknown>).name);
    if (name) return name;
  }
  return null;
}

function collectJsonLdCandidates(html: string): {
  headline: Candidate[];
  author: Candidate[];
  publishedDate: Candidate[];
  modifiedDate: Candidate[];
  description: Candidate[];
  siteName: Candidate[];
  language: Candidate[];
  canonicalUrl: Candidate[];
  issues: string[];
} {
  const res = {
    headline: [] as Candidate[],
    author: [] as Candidate[],
    publishedDate: [] as Candidate[],
    modifiedDate: [] as Candidate[],
    description: [] as Candidate[],
    siteName: [] as Candidate[],
    language: [] as Candidate[],
    canonicalUrl: [] as Candidate[],
    issues: [] as string[],
  };
  const scripts = extractJsonLdScripts(html);
  for (const rawScript of scripts) {
    const cleanedScript = rawScript.replace(/^\s*<!--/, "").replace(/-->\s*$/, "").trim();
    if (!cleanedScript) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedScript);
    } catch {
      if (res.issues.length < MAX_ISSUES) res.issues.push("Bloc JSON-LD non parseable ignoré.");
      continue;
    }
    const queue: unknown[] = [parsed];
    const seen = new Set<unknown>();
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const item of node) queue.push(item);
        continue;
      }
      const obj = node as Record<string, unknown>;
      // @graph / nested containers
      if (Array.isArray(obj["@graph"])) queue.push(obj["@graph"]);
      if (Array.isArray(obj.graph)) queue.push(obj.graph);
      if (obj.mainEntity) queue.push(obj.mainEntity);

      const headline = asString(obj.headline) || asString(obj.name);
      if (headline) res.headline.push({ value: headline, source: "json-ld:headline/name" });

      const author = authorFromJsonLd(obj.author);
      if (author) res.author.push({ value: author, source: "json-ld:author" });

      const datePublished = asString(obj.datePublished) || asString(obj.dateCreated);
      if (datePublished) res.publishedDate.push({ value: datePublished, source: "json-ld:datePublished/dateCreated" });

      const dateModified = asString(obj.dateModified) || asString(obj.uploadDate);
      if (dateModified) res.modifiedDate.push({ value: dateModified, source: "json-ld:dateModified/uploadDate" });

      const description = asString(obj.description);
      if (description) res.description.push({ value: description, source: "json-ld:description" });

      const siteName = siteNameFromJsonLd(obj);
      if (siteName) res.siteName.push({ value: siteName, source: "json-ld:publisher/isPartOf" });

      const inLanguage = asString(obj.inLanguage);
      if (inLanguage) res.language.push({ value: inLanguage, source: "json-ld:inLanguage" });

      const url = asString(obj.url) || asString(obj.mainEntityOfPage);
      if (url) res.canonicalUrl.push({ value: url, source: "json-ld:url/mainEntityOfPage" });
    }
  }
  return res;
}

function pushIssue(issues: string[], msg: string): void {
  if (!msg) return;
  if (issues.includes(msg)) return;
  if (issues.length < MAX_ISSUES) issues.push(msg);
}

export function extractWebPageMetadata(html: string, requestedUrl?: string | null, finalUrl?: string | null): WebPageMetadata {
  const safeHtml = typeof html === "string" ? html : "";
  const { byName, byProperty } = extractMetaCandidates(safeHtml);
  const jsonLd = collectJsonLdCandidates(safeHtml);
  const issues: string[] = [...jsonLd.issues];

  const titleCandidates = [
    ...extractTitle(safeHtml),
    ...(byProperty.get("og:title") || []),
    ...(byName.get("twitter:title") || []),
    ...jsonLd.headline,
  ];
  const h1Candidates = [...extractH1(safeHtml)];

  const authorCandidates = [
    ...(byName.get("author") || []),
    ...(byProperty.get("article:author") || []),
    ...(byName.get("twitter:creator") || []),
    ...jsonLd.author,
  ];

  const publishedCandidates = [
    ...(byProperty.get("article:published_time") || []),
    ...(byName.get("article:published_time") || []),
    ...(byName.get("pubdate") || []),
    ...(byName.get("publishdate") || []),
    ...(byName.get("date") || []),
    ...jsonLd.publishedDate,
  ];

  const modifiedCandidates = [
    ...(byProperty.get("article:modified_time") || []),
    ...(byProperty.get("og:updated_time") || []),
    ...(byName.get("article:modified_time") || []),
    ...(byName.get("last-modified") || []),
    ...jsonLd.modifiedDate,
  ];

  const descriptionCandidates = [
    ...(byProperty.get("og:description") || []),
    ...(byName.get("description") || []),
    ...(byName.get("twitter:description") || []),
    ...jsonLd.description,
  ];

  const siteNameCandidates = [
    ...(byProperty.get("og:site_name") || []),
    ...(byName.get("application-name") || []),
    ...jsonLd.siteName,
  ];

  const canonicalCandidates = [
    ...extractCanonical(safeHtml),
    ...(byProperty.get("og:url") || []),
    ...(byName.get("twitter:url") || []),
    ...jsonLd.canonicalUrl,
  ];

  const languageCandidates = [
    ...extractLanguage(safeHtml),
    ...(byProperty.get("og:locale") || []),
    ...(byName.get("content-language") || []),
    ...jsonLd.language,
  ];

  const pageTitle = pickField(titleCandidates, { maxLen: MAX_TEXT });
  const mainH1 = pickField(h1Candidates, { maxLen: MAX_TEXT });
  const author = pickField(authorCandidates, { maxLen: MAX_TEXT });
  const publishedDate = pickField(publishedCandidates, { date: true });
  const modifiedDate = pickField(modifiedCandidates, { date: true });
  const description = pickField(descriptionCandidates, { maxLen: MAX_LONG_TEXT });
  const siteName = pickField(siteNameCandidates, { maxLen: MAX_TEXT });
  const canonicalUrl = pickField(canonicalCandidates, { url: true });
  const language = pickField(languageCandidates, { maxLen: 64 });

  for (const i of [...pageTitle.issues, ...mainH1.issues, ...author.issues, ...publishedDate.issues, ...modifiedDate.issues, ...description.issues, ...siteName.issues, ...canonicalUrl.issues, ...language.issues]) {
    pushIssue(issues, i);
  }

  // If publication and modification dates are both present and identical, note ambiguity (could be same event or mis-tagged).
  if (
    publishedDate.field.value &&
    modifiedDate.field.value &&
    normalizeForCompare(publishedDate.field.value) === normalizeForCompare(modifiedDate.field.value)
  ) {
    // Not necessarily contradictory; do not flag as contradiction, but keep fields distinct as extracted.
  }

  const provenance: Record<string, string[]> = {
    pageTitle: pageTitle.field.sources,
    mainH1: mainH1.field.sources,
    author: author.field.sources,
    publishedDate: publishedDate.field.sources,
    modifiedDate: modifiedDate.field.sources,
    description: description.field.sources,
    siteName: siteName.field.sources,
    canonicalUrl: canonicalUrl.field.sources,
    language: language.field.sources,
  };

  return {
    requestedUrl: typeof requestedUrl === "string" && requestedUrl.trim() ? clampText(requestedUrl.trim(), MAX_URL) : null,
    finalUrl: typeof finalUrl === "string" && finalUrl.trim() ? clampText(finalUrl.trim(), MAX_URL) : null,
    pageTitle: pageTitle.field,
    mainH1: mainH1.field,
    author: author.field,
    publishedDate: publishedDate.field,
    modifiedDate: modifiedDate.field,
    description: description.field,
    siteName: siteName.field,
    canonicalUrl: canonicalUrl.field,
    language: language.field,
    provenance,
    issues,
  };
}
