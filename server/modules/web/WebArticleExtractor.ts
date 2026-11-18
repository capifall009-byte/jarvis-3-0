export type WebArticleExtractionStatus = "success" | "partial" | "insufficient" | "impossible";

export interface WebArticleExtractionResult {
  status: WebArticleExtractionStatus;
  method: "heuristic-main-content" | "legacy-naive-fallback" | "none";
  usedFallback: boolean;
  isIncomplete: boolean;
  charCount: number;
  text: string;
  title?: string | null;
  notes: string[];
}

const MAX_OUTPUT_CHARS = 18000;
const MAX_PROCESSED_HTML_CHARS = 1_200_000;
const MIN_MEANINGFUL_CHARS = 220;
const MIN_PARTIAL_CHARS = 80;

function clampText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  let s = input;
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
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»");
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

function stripTagsToText(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSpaces(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function getTagAttr(tag: string, attrName: string): string | null {
  const re = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'<>\`]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return decodeHtmlEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

function buildOpenTagIndex(html: string, tag: string): number[] {
  const re = new RegExp(`<${tag}\\b`, "gi");
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m.index);
  return out;
}

function findMatchingClose(html: string, tag: string, openIdx: number): number {
  const openRe = new RegExp(`<${tag}\\b`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
  openRe.lastIndex = openIdx + 1;
  closeRe.lastIndex = openIdx + 1;
  let depth = 1;
  let nextOpen = openRe.exec(html);
  let nextClose = closeRe.exec(html);
  while (nextClose) {
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      nextOpen = openRe.exec(html);
      continue;
    }
    depth--;
    if (depth === 0) {
      return nextClose.index + nextClose[0].length;
    }
    nextClose = closeRe.exec(html);
  }
  return -1;
}

function extractElementInnerByIndex(html: string, tag: string, openIdx: number): { inner: string; outerEnd: number } | null {
  const openTagEnd = html.indexOf(">", openIdx);
  if (openTagEnd === -1) return null;
  const outerEnd = findMatchingClose(html, tag, openIdx);
  if (outerEnd === -1) return null;
  const closeStart = html.lastIndexOf(`</`, outerEnd);
  if (closeStart <= openTagEnd) return null;
  return { inner: html.slice(openTagEnd + 1, closeStart), outerEnd };
}

function removeByTag(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    out = out.replace(re, " ");
  }
  // Also remove self-closing/void-like leftovers for some tags
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    out = out.replace(re, " ");
  }
  return out;
}

function removeNoiseBlocks(html: string): string {
  // Remove obvious non-content sections by tag+attrs heuristics.
  const tags = ["nav", "header", "footer", "aside", "form", "noscript"];
  let out = html;
  for (const tag of tags) {
    // Multiple passes for nested/similar blocks; bounded by a small cap
    for (let pass = 0; pass < 3; pass++) {
      const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
      const next = out.replace(re, " ");
      if (next === out) break;
      out = next;
    }
  }

  const noisyKeywords = [
    "nav", "menu", "breadcrumb", "cookie", "consent", "gdpr", "banner", "popup", "modal", "overlay",
    "advert", "ads", "ad-", "promo", "sponsor", "subscribe", "newsletter", "paywall",
    "sidebar", "related", "recommend", "share", "social", "footer", "comment", "comments",
    "disqus", "livefyre", "outbrain", "taboola"
  ];
  const containerTags = ["div", "section", "ul", "ol"];
  for (const tag of containerTags) {
    for (let pass = 0; pass < 2; pass++) {
      const opens = buildOpenTagIndex(out, tag);
      let changed = false;
      // Scan from end to keep indices stable for earlier parts
      for (let i = opens.length - 1; i >= 0; i--) {
        const idx = opens[i];
        const openEnd = out.indexOf(">", idx);
        if (openEnd === -1) continue;
        const openTag = out.slice(idx, openEnd + 1);
        const cls = (getTagAttr(openTag, "class") || "").toLowerCase();
        const id = (getTagAttr(openTag, "id") || "").toLowerCase();
        const role = (getTagAttr(openTag, "role") || "").toLowerCase();
        const aria = (getTagAttr(openTag, "aria-label") || "").toLowerCase();
        const hay = `${cls} ${id} ${role} ${aria}`;
        if (!hay.trim()) continue;
        const isNoisy = noisyKeywords.some((k) => hay.includes(k));
        if (!isNoisy) continue;
        // Avoid removing very large generic containers too aggressively unless clearly non-content
        const match = extractElementInnerByIndex(out, tag, idx);
        if (!match) continue;
        const textLen = stripTagsToText(match.inner).length;
        const clearlyNonContent = /(cookie|consent|gdpr|banner|popup|modal|advert|ads?|promo|sponsor|subscribe|newsletter|comment|comments|disqus|breadcrumb|share|social)/i.test(hay);
        if (!clearlyNonContent && textLen > 3000) continue;
        out = `${out.slice(0, idx)} ${out.slice(match.outerEnd)}`;
        changed = true;
      }
      if (!changed) break;
    }
  }
  return out;
}

interface CandidateScore {
  html: string;
  score: number;
  pCount: number;
  textLen: number;
  hintBonus: number;
}

function scoreCandidate(innerHtml: string, hintBonus = 0): CandidateScore {
  const text = stripTagsToText(innerHtml);
  const textLen = text.length;
  const pCount = (innerHtml.match(/<p\b/gi) || []).length;
  const headingCount = (innerHtml.match(/<h[1-3]\b/gi) || []).length;
  const listCount = (innerHtml.match(/<(ul|ol)\b/gi) || []).length;
  const quoteCount = (innerHtml.match(/<(blockquote|pre)\b/gi) || []).length;
  const linkTextLen = Array.from(innerHtml.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi))
    .map((m) => normalizeSpaces(stripTagsToText(m[1] || "")).length)
    .reduce((a, b) => a + b, 0);
  const linkDensityPenalty = textLen > 0 ? Math.min(0.8, linkTextLen / textLen) * 120 : 0;
  const score = textLen + pCount * 80 + headingCount * 40 + listCount * 30 + quoteCount * 30 + hintBonus - linkDensityPenalty;
  return { html: innerHtml, score, pCount, textLen, hintBonus };
}

function collectCandidates(html: string): CandidateScore[] {
  const candidates: CandidateScore[] = [];
  const pushTagCandidates = (tag: string, baseBonus: number) => {
    const opens = buildOpenTagIndex(html, tag);
    for (const idx of opens.slice(0, 80)) {
      const openEnd = html.indexOf(">", idx);
      if (openEnd === -1) continue;
      const openTag = html.slice(idx, openEnd + 1);
      const cls = (getTagAttr(openTag, "class") || "").toLowerCase();
      const id = (getTagAttr(openTag, "id") || "").toLowerCase();
      const role = (getTagAttr(openTag, "role") || "").toLowerCase();
      let bonus = baseBonus;
      const hint = `${cls} ${id} ${role}`;
      if (/(article|content|post|entry|main|body|story|text|page)/.test(hint)) bonus += 220;
      if (/(comment|sidebar|related|nav|menu|footer|header|promo|ad|share|social)/.test(hint)) bonus -= 220;
      const extracted = extractElementInnerByIndex(html, tag, idx);
      if (!extracted) continue;
      const c = scoreCandidate(extracted.inner, bonus);
      if (c.textLen >= 120) candidates.push(c);
    }
  };

  pushTagCandidates("article", 350);
  pushTagCandidates("main", 320);
  // role=main or common content containers via div/section scan
  const divSectionTags = ["div", "section"];
  for (const tag of divSectionTags) {
    const opens = buildOpenTagIndex(html, tag);
    for (const idx of opens.slice(0, 120)) {
      const openEnd = html.indexOf(">", idx);
      if (openEnd === -1) continue;
      const openTag = html.slice(idx, openEnd + 1);
      const cls = (getTagAttr(openTag, "class") || "").toLowerCase();
      const id = (getTagAttr(openTag, "id") || "").toLowerCase();
      const role = (getTagAttr(openTag, "role") || "").toLowerCase();
      const hint = `${cls} ${id} ${role}`;
      const isMainHint = role === "main" || /(article|content|post-content|entry-content|main-content|story|article-body|post-body|page-content|read__content)/.test(hint);
      if (!isMainHint) continue;
      const extracted = extractElementInnerByIndex(html, tag, idx);
      if (!extracted) continue;
      const c = scoreCandidate(extracted.inner, 260);
      if (c.textLen >= 120) candidates.push(c);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function resolveHref(hrefRaw: string, baseUrl?: string): string | null {
  const href = decodeHtmlEntities(hrefRaw).trim();
  if (!href) return null;
  if (/^(javascript:|mailto:|tel:|#)/i.test(href)) return null;
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function renderInlineContent(html: string, baseUrl?: string): string {
  let out = html;
  // Line breaks
  out = out.replace(/<br\s*\/?>/gi, "\n");
  // Links: keep text and useful href when different
  out = out.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_m, inner: string, offset: number, whole: string) => {
    const tagMatch = whole.slice(offset).match(/^<a\b[^>]*>/i);
    const tag = tagMatch ? tagMatch[0] : "";
    const href = getTagAttr(tag, "href");
    const text = normalizeSpaces(stripTagsToText(inner));
    if (!text) return " ";
    const resolved = href ? resolveHref(href, baseUrl) : null;
    if (!resolved) return text;
    const compactHref = resolved.length > 120 ? `${resolved.slice(0, 117)}...` : resolved;
    // Avoid duplicating when anchor text already is the URL
    if (normalizeSpaces(text).toLowerCase() === normalizeSpaces(resolved).toLowerCase()) return compactHref;
    return `${text} (${compactHref})`;
  });
  // Emphasis/inline tags stripped implicitly
  return stripTagsToText(out)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function renderList(listHtml: string, ordered: boolean, baseUrl?: string): string {
  const items: string[] = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  let index = 1;
  while ((m = liRe.exec(listHtml)) !== null) {
    const text = renderInlineContent(m[1], baseUrl).replace(/\n+/g, " ").trim();
    if (!text) continue;
    const prefix = ordered ? `${index}. ` : "- ";
    items.push(`${prefix}${text}`);
    index++;
  }
  if (items.length === 0) {
    const fallback = renderInlineContent(listHtml, baseUrl);
    return fallback ? fallback : "";
  }
  return items.join("\n");
}

function extractStructuredText(containerHtml: string, baseUrl?: string): { text: string; truncated: boolean } {
  // Work on a copy and strip residual non-content tags inside container
  let html = containerHtml;
  html = removeByTag(html, ["script", "style", "noscript", "svg", "canvas", "iframe", "object", "embed", "picture", "source", "video", "audio", "button", "input", "select", "textarea"]);
  html = removeNoiseBlocks(html);

  const blockRe = /<(h[1-3]|p|ul|ol|blockquote|pre|table|figure)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  let total = 0;
  let truncated = false;

  while ((m = blockRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2] || "";
    let rendered = "";
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      const text = renderInlineContent(inner, baseUrl).replace(/\n+/g, " ").trim();
      if (text) rendered = `\n${text}\n`;
    } else if (tag === "p") {
      const text = renderInlineContent(inner, baseUrl).trim();
      if (text && normalizeSpaces(text).length >= 2) rendered = text;
    } else if (tag === "ul" || tag === "ol") {
      rendered = renderList(inner, tag === "ol", baseUrl);
    } else if (tag === "blockquote" || tag === "pre") {
      const text = renderInlineContent(inner, baseUrl).trim();
      if (text) {
        rendered = text
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => `> ${line}`)
          .join("\n");
      }
    } else if (tag === "table" || tag === "figure") {
      // Best-effort: capture captions or textual content only if meaningful
      const captionMatch = inner.match(/<(figcaption|caption)\b[^>]*>([\s\S]*?)<\/\1>/i);
      const text = renderInlineContent(captionMatch ? captionMatch[2] : inner, baseUrl).trim();
      if (text && text.length >= 20) rendered = text;
    }

    if (!rendered) continue;
    const chunk = rendered.trim();
    if (!chunk) continue;
    if (parts.length > 0 && parts[parts.length - 1] === chunk) continue;

    const sep = parts.length === 0 ? "" : "\n\n";
    const nextLen = total + sep.length + chunk.length;
    if (nextLen > MAX_OUTPUT_CHARS) {
      const remaining = MAX_OUTPUT_CHARS - total - sep.length;
      if (remaining > 40) {
        parts.push(`${sep}${clampText(chunk, remaining)}`.trimStart());
      }
      truncated = true;
      total = MAX_OUTPUT_CHARS;
      break;
    }
    parts.push(`${sep}${chunk}`.trimStart());
    total = nextLen;
  }

  let text = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    // Fallback inside container: plain text
    text = stripTagsToText(html);
  }
  if (text.length > MAX_OUTPUT_CHARS) {
    text = clampText(text, MAX_OUTPUT_CHARS);
    truncated = true;
  }
  return { text: text.trim(), truncated };
}

export function legacyNaiveExtractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_OUTPUT_CHARS);
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = normalizeSpaces(stripTagsToText(m[1]));
  return t || null;
}

export function extractWebArticleContent(html: string, finalUrl?: string): WebArticleExtractionResult {
  const notes: string[] = [];
  try {
    const rawHtml = typeof html === "string" ? html : "";
    if (!rawHtml.trim()) {
      return {
        status: "impossible",
        method: "none",
        usedFallback: false,
        isIncomplete: false,
        charCount: 0,
        text: "",
        title: null,
        notes: ["Contenu HTML vide ou non exploitable."],
      };
    }

    const processedHtml = rawHtml.length > MAX_PROCESSED_HTML_CHARS
      ? rawHtml.slice(0, MAX_PROCESSED_HTML_CHARS)
      : rawHtml;
    if (rawHtml.length > MAX_PROCESSED_HTML_CHARS) {
      notes.push("HTML volumineux : analyse limitée à une portion initiale pour maîtriser le coût.");
    }

    const title = extractTitle(processedHtml);

    // Pre-clean globally for candidate search/extraction
    let cleaned = processedHtml;
    cleaned = removeByTag(cleaned, ["script", "style", "noscript", "svg", "canvas", "iframe", "template"]);
    cleaned = removeNoiseBlocks(cleaned);

    let bestText = "";
    let truncated = false;
    let method: WebArticleExtractionResult["method"] = "none";

    const candidates = collectCandidates(cleaned).slice(0, 12);
    for (const candidate of candidates) {
      const extracted = extractStructuredText(candidate.html, finalUrl);
      const len = extracted.text.trim().length;
      if (len < MIN_PARTIAL_CHARS) continue;
      // Prefer sufficiently rich candidate
      if (len > bestText.length) {
        bestText = extracted.text.trim();
        truncated = extracted.truncated;
        method = "heuristic-main-content";
      }
      if (len >= MIN_MEANINGFUL_CHARS && candidate.pCount >= 1) {
        break;
      }
    }

    if (!bestText || bestText.length < MIN_PARTIAL_CHARS) {
      // Fallback to broader extraction (body-like cleaned content)
      const bodyMatch = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
      const broad = extractStructuredText(bodyMatch ? bodyMatch[1] : cleaned, finalUrl);
      if (broad.text.trim().length >= MIN_PARTIAL_CHARS) {
        bestText = broad.text.trim();
        truncated = truncated || broad.truncated;
        method = method === "none" ? "heuristic-main-content" : method;
        notes.push("Extraction principale incertaine : contenu extrait de manière élargie.");
      }
    }

    let usedFallback = false;
    if (!bestText || bestText.length < MIN_PARTIAL_CHARS) {
      // Final fallback to legacy naive extraction (existing method)
      const legacy = legacyNaiveExtractText(rawHtml);
      if (legacy && legacy.length >= MIN_PARTIAL_CHARS) {
        bestText = legacy;
        truncated = legacy.length >= MAX_OUTPUT_CHARS;
        method = "legacy-naive-fallback";
        usedFallback = true;
        notes.push("Repli vers la méthode d'extraction existante (texte brut).");
      }
    }

    const charCount = bestText.trim().length;
    if (!bestText || charCount === 0) {
      return {
        status: "impossible",
        method: "none",
        usedFallback: false,
        isIncomplete: false,
        charCount: 0,
        text: "",
        title,
        notes: [...notes, "Extraction impossible : aucun contenu textuel exploitable identifié."],
      };
    }

    let status: WebArticleExtractionStatus;
    let isIncomplete = truncated;
    if (charCount < MIN_PARTIAL_CHARS) {
      status = "insufficient";
    } else if (charCount < MIN_MEANINGFUL_CHARS) {
      status = "insufficient";
      notes.push("Contenu extrait trop limité pour être considéré comme suffisant.");
    } else if (method === "legacy-naive-fallback" || usedFallback) {
      status = "partial";
      isIncomplete = true;
      notes.push("Extraction partielle : le contenu principal n'a pas pu être isolé de manière fiable.");
    } else {
      // Heuristic success but can still be incomplete/uncertain
      const looksUncertain = notes.some((n) => /incertaine|limitée/i.test(n));
      if (truncated || looksUncertain) {
        status = "partial";
        isIncomplete = true;
        if (truncated) notes.push("Contenu potentiellement incomplet (limite de taille atteinte).");
      } else {
        status = "success";
      }
    }

    const finalText = clampText(bestText.trim(), MAX_OUTPUT_CHARS);
    if (finalText.length < bestText.trim().length) isIncomplete = true;

    return {
      status,
      method,
      usedFallback,
      isIncomplete,
      charCount: finalText.length,
      text: finalText,
      title,
      notes,
    };
  } catch (err) {
    try {
      const legacy = legacyNaiveExtractText(typeof html === "string" ? html : "");
      if (legacy && legacy.length >= MIN_PARTIAL_CHARS) {
        return {
          status: "partial",
          method: "legacy-naive-fallback",
          usedFallback: true,
          isIncomplete: true,
          charCount: legacy.length,
          text: legacy,
          title: extractTitle(typeof html === "string" ? html : ""),
          notes: [
            "Erreur pendant l'extraction principale ; repli vers la méthode existante.",
          ],
        };
      }
    } catch {
      // ignore
    }
    return {
      status: "impossible",
      method: "none",
      usedFallback: false,
      isIncomplete: false,
      charCount: 0,
      text: "",
      title: null,
      notes: ["Erreur pendant l'extraction du contenu."],
    };
  }
}
