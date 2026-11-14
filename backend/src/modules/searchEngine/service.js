import { InvertedIndex } from './invertedIndex.js';
import {
  clusterResults,
  expandQueryDice,
  generateSnippet,
  parseQuery,
  suggestSpelling,
} from './queryProcessor.js';
import { runRetrievalModel } from './retrievalModels.js';
import { evaluateCorpusModels, evaluateLiveLogs } from './evaluation.js';
import {
  analyzeArticleSeo,
  buildTagCloud,
  findRelatedArticles,
  inferMissingTags,
  recommendArticles,
} from './socialAndMl.js';
import * as defaultRepo from './repo.js';
import { STOPWORDS, extractEntities, porterStem } from './tokenizer.js';

function matchesFilters(doc, { category, tag, from, to }) {
  if (category && doc.category_slug !== category) return false;
  if (tag) {
    const tagLower = tag.toLowerCase();
    const ok = (doc.tags ?? []).some(
      (t) => t.toLowerCase() === tagLower || t.toLowerCase().replace(/\s+/g, '-') === tagLower,
    );
    if (!ok) return false;
  }
  if (from || to) {
    const pubMs = doc.published_at ? Date.parse(doc.published_at) : NaN;
    if (Number.isNaN(pubMs)) return false;
    if (from && pubMs < Date.parse(from)) return false;
    if (to) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        const endExclusive = Date.parse(`${to}T00:00:00Z`) + 86_400_000;
        if (pubMs >= endExclusive) return false;
      } else if (pubMs > Date.parse(to)) {
        return false;
      }
    }
  }
  return true;
}

function sortDocuments(docs, sort) {
  const copy = [...docs];
  if (sort === 'views') {
    return copy.sort(
      (a, b) =>
        Number(b.views_count ?? 0) - Number(a.views_count ?? 0) ||
        Date.parse(b.published_at ?? 0) - Date.parse(a.published_at ?? 0) ||
        b.id - a.id,
    );
  }
  if (sort === 'oldest') {
    return copy.sort((a, b) => Date.parse(a.published_at ?? 0) - Date.parse(b.published_at ?? 0) || a.id - b.id);
  }
  // latest
  return copy.sort((a, b) => Date.parse(b.published_at ?? 0) - Date.parse(a.published_at ?? 0) || b.id - a.id);
}

/**
 * Create a SearchEngineService backed by either PostgreSQL (defaultRepo) or injected data sources (tests).
 */
export function createSearchService(deps = {}) {
  const repo = { ...defaultRepo, ...deps };
  const index = new InvertedIndex();
  let dirty = true;
  let building = null;

  async function ensureIndex(force = false) {
    if (!dirty && !force) return index;
    if (building) return building;
    building = (async () => {
      try {
        const docs = await repo.loadPublishedDocuments();
        index.build(docs);
        dirty = false;
        return index;
      } finally {
        building = null;
      }
    })();
    return building;
  }

  function invalidate() {
    dirty = true;
  }

  /**
   * Execute a full search query using the Inverted Index & chosen Retrieval Model.
   */
  async function search({
    q = '',
    category,
    tag,
    from,
    to,
    sort = 'relevance',
    model = 'bm25',
    prf = false,
    cluster = true,
    explain = false,
    page = 1,
    pageSize = 20,
    userId = null,
    log = true,
  } = {}) {
    await ensureIndex();
    const t0 = performance.now();

    const allowedDocIds = new Set();
    for (const doc of index.documents.values()) {
      if (matchesFilters(doc, { category, tag, from, to })) {
        allowedDocIds.add(doc.id);
      }
    }

    const trimmedQ = String(q || '').trim();
    const parsed = parseQuery(trimmedQ);

    let ranked = [];
    let prfTerms = null;
    let suggestion = null;
    let expansions = [];
    let clusters = [];

    if (trimmedQ && (parsed.positiveTerms.length > 0 || parsed.excludedTerms.length > 0)) {
      const out = runRetrievalModel({
        model,
        parsedQuery: parsed,
        index,
        allowedDocIds,
        usePrf: Boolean(prf),
      });
      ranked = out.results;
      prfTerms = out.prfTerms;

      if (sort === 'latest' || sort === 'views' || sort === 'oldest') {
        const ordered = sortDocuments(ranked.map((r) => r.doc), sort);
        const byId = new Map(ranked.map((r) => [r.docId, r]));
        ranked = ordered.map((d) => byId.get(d.id));
      }

      if (ranked.length <= 2 && parsed.positiveTerms.length > 0) {
        suggestion = suggestSpelling(trimmedQ, index);
      }
      if (parsed.positiveTerms.length > 0) {
        expansions = expandQueryDice(parsed.positiveTerms, index, 5);
      }
      if (cluster && ranked.length >= 3) {
        clusters = clusterResults(ranked, index, 4);
      }
    } else if (!trimmedQ) {
      const filteredDocs = [...allowedDocIds].map((id) => index.documents.get(id));
      const effectiveSort = sort === 'relevance' ? 'latest' : sort;
      ranked = sortDocuments(filteredDocs, effectiveSort).map((doc) => ({
        docId: doc.id,
        doc,
        score: null,
        matchedTerms: [],
        breakdown: null,
      }));
    }

    const latencyMs = Number((performance.now() - t0).toFixed(2));
    const total = ranked.length;
    const offset = (page - 1) * pageSize;
    const pageItems = ranked.slice(offset, offset + pageSize).map((r) => {
      const snippet = trimmedQ
        ? generateSnippet(r.doc, parsed.rawWords, parsed.positiveTerms)
        : null;
      return {
        ...r.doc,
        search_score: r.score != null ? Number(r.score.toFixed(4)) : null,
        snippet_text: snippet?.text ?? null,
        snippet_segments: snippet?.segments ?? null,
        matched_terms: r.matchedTerms ?? [],
        score_breakdown: explain ? r.breakdown : undefined,
      };
    });

    let queryLogId = null;
    if (log && trimmedQ && typeof repo.insertSearchQueryLog === 'function') {
      try {
        const logged = await repo.insertSearchQueryLog({
          userId,
          queryString: trimmedQ,
          model,
          filters: { category, tag, from, to, sort },
          resultDocIds: ranked.slice(0, 50).map((r) => r.docId),
          totalResults: total,
          latencyMs,
        });
        queryLogId = logged?.id != null ? Number(logged.id) : null;
      } catch {
        // Logging failure must never break search responses
      }
    }

    return {
      rows: pageItems,
      total,
      latencyMs,
      model,
      sort,
      parsedTokens: parsed.positiveTerms.length,
      suggestion,
      expansions,
      prfTerms,
      clusters,
      queryLogId,
    };
  }

  /** Fast prefix autocomplete & spelling correction hints (Chapter 6.2). */
  async function suggest(prefix, limit = 8) {
    await ensureIndex();
    const clean = String(prefix || '').trim().toLowerCase();
    if (!clean) return { terms: [], titles: [], correction: null };

    const terms = [...index.rawVocabFreq.entries()]
      .filter(([w]) => w.startsWith(clean) && w.length >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([term, frequency]) => ({ term, frequency }));

    const titles = [...index.documents.values()]
      .filter((d) => d.title.toLowerCase().includes(clean))
      .sort((a, b) => Number(b.views_count ?? 0) - Number(a.views_count ?? 0))
      .slice(0, 5)
      .map((d) => ({ slug: d.slug, title: d.title, category: d.category_name }));

    const correction = terms.length === 0 ? suggestSpelling(clean, index) : null;
    return { terms, titles, correction };
  }

  async function getStats() {
    await ensureIndex();
    return index.getStats();
  }

  async function inspectTerm(term) {
    await ensureIndex();
    return index.inspectTerm(term);
  }

  async function evaluate() {
    await ensureIndex();
    const offline = evaluateCorpusModels(index);
    let live = { totalQueries: 0, totalClicks: 0, ctr: 0, clickMrr: null, zeroHitQueries: 0, zeroHitRate: 0, avgLatencyMs: 0, p95LatencyMs: 0 };
    if (typeof repo.loadEvaluationLogs === 'function') {
      try {
        const logs = await repo.loadEvaluationLogs(500);
        live = evaluateLiveLogs(logs);
      } catch {
        // Ignore if table unavailable in isolated unit tests
      }
    }
    return {
      corpus: {
        docCount: index.docCount,
        vocabSize: index.vocabSize,
        totalTokens: index.totalTokens,
        avgDocLength: Number(index.avgDocLength.toFixed(2)),
        compression: index.getStats().compression,
      },
      offline,
      live,
    };
  }

  async function getRelatedArticles(slug, limit = 4) {
    await ensureIndex();
    const doc = [...index.documents.values()].find((d) => d.slug === slug);
    if (!doc) return null;
    return findRelatedArticles(doc.id, index, limit).map((r) => ({
      ...r.doc,
      similarity: r.similarity,
      sharedTags: r.sharedTags,
    }));
  }

  async function getSuggestedTags({ id, slug }, limit = 6) {
    await ensureIndex();
    let doc = null;
    if (id != null) doc = index.documents.get(Number(id)) ?? null;
    else if (slug) doc = [...index.documents.values()].find((d) => d.slug === slug) ?? null;

    if (!doc && typeof repo.findDocumentByIdOrSlug === 'function') {
      doc = await repo.findDocumentByIdOrSlug({ id, slug });
    }
    if (!doc) return null;
    return {
      tags: inferMissingTags(doc, index, limit),
      entities: extractEntities(`${doc.title ?? ''} ${doc.content ?? doc.body ?? ''}`, 10),
    };
  }

  async function getRecommendations(userId = null, limit = 6) {
    await ensureIndex();
    let ctx = { userTagNames: [], likedDocIds: [], allRatings: [] };
    if (typeof repo.loadRecommendationContext === 'function') {
      try {
        ctx = await repo.loadRecommendationContext(userId);
      } catch {
        // fallback gracefully
      }
    }
    return recommendArticles({ userId, ...ctx, index, limit }).map((r) => ({
      ...r.doc,
      recommendationScore: r.score,
      recommendationReason: r.reason,
    }));
  }

  async function getTagCloud(limit = 40) {
    if (typeof repo.loadTagsWithCounts === 'function') {
      const tags = await repo.loadTagsWithCounts();
      return buildTagCloud(tags, limit);
    }
    return [];
  }

  async function auditSeo(id) {
    await ensureIndex();
    let doc = index.documents.get(Number(id)) ?? null;
    if (!doc && typeof repo.findDocumentByIdOrSlug === 'function') {
      doc = await repo.findDocumentByIdOrSlug({ id });
    }
    if (!doc) return null;
    const seoAudit = analyzeArticleSeo(doc);
    const inferredTags = inferMissingTags(doc, index, 5);
    const entities = extractEntities(`${doc.title ?? ''} ${doc.content ?? ''}`, 8);
    return {
      id: Number(doc.id),
      slug: doc.slug,
      title: doc.title,
      ...seoAudit,
      suggestedKeywords: inferredTags.map((t) => t.tag.toLowerCase()),
      entities,
    };
  }

  function hasNonStopwordToken(q) {
    const parsed = parseQuery(q);
    if (parsed.excludedTerms.length > 0) return true;
    return parsed.rawWords.some((w) => !STOPWORDS.has(w) && porterStem(w).length > 0);
  }

  return {
    index,
    ensureIndex,
    invalidate,
    search,
    suggest,
    getStats,
    inspectTerm,
    evaluate,
    getRelatedArticles,
    getSuggestedTags,
    getRecommendations,
    getTagCloud,
    auditSeo,
    hasNonStopwordToken,
  };
}

export const defaultSearchService = createSearchService();
