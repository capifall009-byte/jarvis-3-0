import { ThinkingLevel } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import { Router } from "express";
import type { Request, Response } from "express";
import {
  JARVIS_GEMINI_MODEL,
  classifyGeminiError,
  getGeminiClient,
  isGeminiConfigured,
} from "../geminiClient.ts";
import {
  WebSecurityError,
  safeFetchValidatedUrl,
  toSafeClientErrorMessage,
  validatePublicHttpUrl,
} from "./webSecurity.ts";
import { extractWebPageMetadata } from "./web/WebMetadataExtractor.ts";
import { extractWebArticleContent, legacyNaiveExtractText } from "./web/WebArticleExtractor.ts";
import { generateWebStructuredAnalysis } from "./web/WebStructuredAnalysisService.ts";
import { compareWebSources } from "./web/WebSourceComparisonService.ts";

export interface WebSourceItem {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

interface SearchBody {
  query?: string;
}

interface InspectBody {
  url?: string;
  question?: string;
}

function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

function extractGroundingSources(response: GenerateContentResponse): {
  sources: WebSourceItem[];
  searchQueries: string[];
} {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const chunks = metadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: WebSourceItem[] = [];

  for (const chunk of chunks) {
    const uri = chunk.web?.uri?.trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({
      url: uri,
      title: chunk.web?.title?.trim() || extractDomain(uri),
      domain: extractDomain(uri),
    });
  }

  const searchQueries = Array.isArray(metadata?.webSearchQueries)
    ? metadata.webSearchQueries.filter((q): q is string => typeof q === "string")
    : [];

  return { sources, searchQueries };
}

function stripMarkdownForVoice(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exposé pour le Module 7.3 : réutilise exactement la même récupération publique bornée. */
export async function fetchWebSourcesFast(query: string): Promise<WebSourceItem[]> {
  const results: WebSourceItem[] = [];
  const seen = new Set<string>();

  const pushSafeResult = async (item: {
    url: string;
    title: string;
    domain?: string;
    snippet?: string;
  }) => {
    const rawUrl = item.url?.trim();
    if (!rawUrl || seen.has(rawUrl)) return;
    try {
      const validated = await validatePublicHttpUrl(rawUrl);
      const normalized = validated.normalized;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      seen.add(rawUrl);
      results.push({
        url: normalized,
        title: item.title || extractDomain(normalized),
        domain: item.domain || extractDomain(normalized),
        snippet: item.snippet,
      });
    } catch {
      // Ignore unsafe/unresolvable source URLs without failing the whole search
    }
  };

  const wikiSearchTask = async (lang: "fr" | "en", limit: number) => {
    try {
      const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        query
      )}&gsrlimit=${limit}&prop=extracts|info&exintro=1&explaintext=1&exsentences=4&inprop=url&format=json&utf8=1`;
      // Wikipedia API is a fixed public endpoint; validation protects against unexpected DNS issues.
      const fetched = await safeFetchValidatedUrl(apiUrl, {
        timeoutMs: 3500,
        maxBytes: 1_000_000,
        allowedContentTypes: ["application/json", "text/json"],
        headers: { "User-Agent": "JARVIS-WebSearch/2.0" },
      });
      const data = JSON.parse(fetched.buffer.toString("utf-8")) as {
        query?: {
          pages?: Record<
            string,
            {
              title?: string;
              fullurl?: string;
              extract?: string;
              index?: number;
            }
          >;
        };
      };
      const pages = Object.values(data.query?.pages ?? {}).sort(
        (a, b) => (a.index ?? 99) - (b.index ?? 99)
      );
      for (const page of pages) {
        const url = page.fullurl?.trim();
        if (!url) continue;
        await pushSafeResult({
          url,
          title: `${page.title || "Article"} — Wikipédia (${lang.toUpperCase()})`,
          domain: `${lang}.wikipedia.org`,
          snippet: page.extract?.trim() || undefined,
        });
      }
    } catch {
      // Non-fatal: fallback sources are best-effort
    }
  };

  const ddgInstantTask = async () => {
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query
      )}&format=json&no_html=1&skip_disambig=1`;
      const fetched = await safeFetchValidatedUrl(apiUrl, {
        timeoutMs: 3000,
        maxBytes: 1_000_000,
        allowedContentTypes: ["application/json", "application/javascript", "text/json", "text/plain"],
        headers: { "User-Agent": "JARVIS-WebSearch/2.0" },
      });
      const data = JSON.parse(fetched.buffer.toString("utf-8")) as {
        Heading?: string;
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      if (data.AbstractURL && data.AbstractText) {
        await pushSafeResult({
          url: data.AbstractURL,
          title: data.Heading || extractDomain(data.AbstractURL),
          domain: extractDomain(data.AbstractURL),
          snippet: data.AbstractText,
        });
      }
      for (const topic of (data.RelatedTopics ?? []).slice(0, 3)) {
        if (!topic.FirstURL || !topic.Text) continue;
        await pushSafeResult({
          url: topic.FirstURL,
          title:
            topic.Text.split(" - ")[0]?.slice(0, 90) ||
            extractDomain(topic.FirstURL),
          domain: extractDomain(topic.FirstURL),
          snippet: topic.Text,
        });
      }
    } catch {
      // Non-fatal: fallback sources are best-effort
    }
  };

  await Promise.allSettled([wikiSearchTask("fr", 4), ddgInstantTask()]);

  if (results.length < 2) {
    await Promise.allSettled([wikiSearchTask("en", 3)]);
  }

  return results.slice(0, 6);
}

export function createWebSearchRouter(): Router {
  const router = Router();

  router.post("/web/search", async (req: Request, res: Response) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error: "La clé API GEMINI_API_KEY n'est pas configurée côté serveur.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const body = (req.body ?? {}) as SearchBody;
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query) {
        res.status(400).json({ error: "Veuillez saisir une requête de recherche." });
        return;
      }

      const ai = getGeminiClient();
      const systemInstruction = [
        "Tu es JARVIS, l'assistant personnel intelligent de l'utilisateur.",
        "Réponds en français clair, précis, structuré et naturel (sans markdown superflu comme ** ou ###).",
        "Appuie-toi exclusivement sur les résultats web fournis pour donner des informations fiables et cite les sources entre crochets [1], [2].",
        "Si les sources sont partielles, signale-le sobrement.",
      ].join("\n");

      // Attempt 1: Gemini Google Search Grounding (bounded at 3.5s so quota/model hangs never stall UX)
      try {
        const groundingPromise = ai.models.generateContent({
          model: JARVIS_GEMINI_MODEL,
          contents: query,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });
        const response = await Promise.race([
          groundingPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Grounding timeout")), 3500)
          ),
        ]);
        const { sources, searchQueries } = extractGroundingSources(response);
        const answer = stripMarkdownForVoice(response.text?.trim() || "");
        if (answer && sources.length > 0) {
          res.json({
            query,
            answer,
            sources,
            searchQueries,
            model: JARVIS_GEMINI_MODEL,
            timestamp: Date.now(),
          });
          return;
        }
      } catch {
        // Fall through smoothly to live public web search + Gemini synthesis
      }

      // Attempt 2: Live server-side public web retrieval + Gemini synthesis
      const liveSources = await fetchWebSourcesFast(query);
      if (liveSources.length === 0) {
        res.status(502).json({
          error:
            "Aucune source web exploitable n'a pu être récupérée pour cette requête pour le moment.",
        });
        return;
      }

      const contextBlock = liveSources
        .map(
          (src, idx) =>
            `[${idx + 1}] ${src.title} (${src.url})\nExtrait : ${src.snippet || "Non disponible"}`
        )
        .join("\n\n");

      const synthResponse = await ai.models.generateContent({
        model: JARVIS_GEMINI_MODEL,
        contents: `Requête de l'utilisateur : "${query}"\n\nSources web récupérées en direct :\n${contextBlock}`,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      const answer = stripMarkdownForVoice(
        synthResponse.text?.trim() ||
          "Voici les sources web trouvées pour votre recherche."
      );

      res.json({
        query,
        answer,
        sources: liveSources,
        searchQueries: [query],
        model: JARVIS_GEMINI_MODEL,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  router.post("/web/inspect", async (req: Request, res: Response) => {
    try {
      if (!isGeminiConfigured()) {
        res.status(503).json({
          error: "La clé API GEMINI_API_KEY n'est pas configurée côté serveur.",
          code: "API_KEY_MISSING",
        });
        return;
      }

      const body = (req.body ?? {}) as InspectBody;
      const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
      const question = typeof body.question === "string" ? body.question.trim() : "";

      // Valide/normalise l'URL cible, résout le DNS, refuse les destinations non publiques,
      // et récupère la page en bloquant les redirections automatiques (chaque saut revalidé).
      // Aucune requête réseau supplémentaire n'est effectuée pour l'extraction des métadonnées.
      const fetched = await safeFetchValidatedUrl(rawUrl, {
        method: "GET",
        timeoutMs: Math.max(1000, Number(process.env.WEB_INSPECT_TIMEOUT_MS || 8000)),
        maxBytes: Math.max(1024, Number(process.env.WEB_INSPECT_MAX_BYTES || 2_000_000)),
        maxRedirects: Math.max(0, Number(process.env.WEB_FETCH_MAX_REDIRECTS || 5)),
        allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; JARVIS-WebReader/2.0)",
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
      });

      const targetUrl = fetched.url;
      const html = fetched.buffer.toString("utf-8");
      let metadata: ReturnType<typeof extractWebPageMetadata> | undefined;
      try {
        metadata = extractWebPageMetadata(html, rawUrl, targetUrl);
      } catch {
        // Extraction des métadonnées additive et facultative : ne pas casser l'inspection existante.
        metadata = undefined;
      }

      let articleExtraction: ReturnType<typeof extractWebArticleContent> | undefined;
      try {
        articleExtraction = extractWebArticleContent(html, targetUrl);
      } catch {
        // Extraction du contenu additive : ne pas faire échouer toute l'inspection.
        articleExtraction = undefined;
      }

      const ai = getGeminiClient();
      const prompt = question
        ? `Analyse la page web ${targetUrl} et réponds en français à la demande suivante : ${question}`
        : `Résume de façon claire, fidèle et concise le contenu de cette page web en français : ${targetUrl}`;

      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch
        ? decodeHtmlEntities(titleMatch[1])
        : extractDomain(targetUrl);

      const legacyPlainText = legacyNaiveExtractText(html);
      let analysisText = "";
      if (articleExtraction && (articleExtraction.status === "success" || articleExtraction.status === "partial")) {
        analysisText = (articleExtraction.text || "").trim();
      }
      if (!analysisText && articleExtraction && articleExtraction.status === "insufficient" && (articleExtraction.text || "").trim()) {
        analysisText = (articleExtraction.text || "").trim();
      }
      // Si l'extracteur principal a échoué/impossible, conserver le fallback naïf existant pour l'analyse.
      if (!analysisText) {
        analysisText = legacyPlainText;
      }
      analysisText = analysisText.trim().slice(0, 18000);

      if (!analysisText) {
        res.status(422).json({
          error: "Aucun contenu textuel lisible n'a été trouvé sur cette page.",
          code: "UNREADABLE_CONTENT",
          ...(metadata ? { metadata } : {}),
          ...(articleExtraction ? { articleExtraction } : {}),
        });
        return;
      }

      // Analyse structurée additive (Module 7.2.3) : complémentaire à la synthèse conversationnelle existante.
      // Appel Gemini distinct et best-effort, sans recherche web supplémentaire.
      let structuredAnalysis: Awaited<ReturnType<typeof generateWebStructuredAnalysis>> | undefined;
      try {
        structuredAnalysis = await generateWebStructuredAnalysis({
          url: targetUrl,
          question,
          extractedText: analysisText,
          metadata,
          articleExtraction,
        });
      } catch {
        // Ne jamais faire échouer toute l'inspection à cause de l'analyse structurée.
        structuredAnalysis = undefined;
      }

      const summaryRes = await ai.models.generateContent({
        model: JARVIS_GEMINI_MODEL,
        contents: `${prompt}\n\nTitre : ${pageTitle}\nContenu extrait de la page :\n${analysisText}`,
        config: {
          systemInstruction:
            "Tu es JARVIS. Synthétise uniquement à partir du texte fourni, en français clair sans markdown.",
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      const answer = stripMarkdownForVoice(
        summaryRes.text?.trim() ||
          "La page n'a pas retourné suffisamment de contenu exploitable."
      );

      res.json({
        url: targetUrl,
        answer,
        sources: [
          {
            url: targetUrl,
            title: pageTitle || extractDomain(targetUrl),
            domain: extractDomain(targetUrl),
          },
        ],
        model: JARVIS_GEMINI_MODEL,
        timestamp: Date.now(),
        ...(metadata ? { metadata } : {}),
        ...(articleExtraction ? { articleExtraction } : {}),
        ...(structuredAnalysis ? { structuredAnalysis } : {}),
      });
    } catch (err: unknown) {
      if (err instanceof WebSecurityError) {
        const safe = toSafeClientErrorMessage(err);
        res.status(safe.status).json({ error: safe.error, code: safe.code });
        return;
      }
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  // Contrat historique "/compare" conservé, alias "/web/compare" ajouté pour le client 7.2.4.
  const handleCompare = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as { urls?: unknown } | undefined;
      const urls = body?.urls;

      const result = await compareWebSources(urls);

      if (result.httpStatus >= 400) {
        res.status(result.httpStatus).json({
          error: result.body.error || "La comparaison des sources a échoué.",
          ...(result.body.code ? { code: result.body.code } : {}),
          ...(result.body.sources ? { sources: result.body.sources } : {}),
          ...(result.body.comparison ? { comparison: result.body.comparison } : {}),
          model: result.body.model,
          timestamp: result.body.timestamp,
        });
        return;
      }

      res.json(result.body);
    } catch (err: unknown) {
      if (err instanceof WebSecurityError) {
        const safe = toSafeClientErrorMessage(err);
        res.status(safe.status).json({ error: safe.error, code: safe.code });
        return;
      }
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.message,
        code: classified.code,
      });
    }
  };

  router.post("/compare", handleCompare);
  router.post("/web/compare", handleCompare);

  return router;
}
