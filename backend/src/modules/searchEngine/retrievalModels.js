/**
 * Chapter 7 (Retrieval Models) & Chapter 12 (Beyond Bag of Words):
 * - Boolean + Proximity Retrieval (with skip-pointer conjunctive intersection)
 * - Vector Space Model (TF-IDF Cosine Similarity)
 * - Probabilistic Model: Fielded Okapi BM25 (k1=1.2, b=0.75, k2=100)
 * - Language Model: Query Likelihood with Dirichlet Smoothing (mu)
 * - Pseudo-Relevance Feedback (RM3-style top-k feedback expansion)
 * - Feature-Based Hybrid Model (BM25 + Term Dependence Proximity + Freshness + Engagement)
 */

import { intersectWithSkips } from './invertedIndex.js';

export const RETRIEVAL_MODELS = ['bm25', 'tfidf', 'ql', 'boolean', 'hybrid'];

const FIELD_WEIGHTS = {
  title: 3.0,
  tags: 2.2,
  seoKeywords: 2.0,
  summary: 1.5,
  content: 1.0,
};

function weightedTf(fieldTf) {
  return (
    FIELD_WEIGHTS.title * (fieldTf.title ?? 0) +
    FIELD_WEIGHTS.tags * (fieldTf.tags ?? 0) +
    FIELD_WEIGHTS.seoKeywords * (fieldTf.seoKeywords ?? 0) +
    FIELD_WEIGHTS.summary * (fieldTf.summary ?? 0) +
    FIELD_WEIGHTS.content * (fieldTf.content ?? 0)
  );
}

/**
 * Check if a document contains an exact ordered phrase of stemmed terms
 * using positional posting lists (Chapter 5.2 S11).
 * @param {number} docId
 * @param {string[]} phraseTerms
 * @param {import('./invertedIndex.js').InvertedIndex} index
 */
export function hasExactPhrase(docId, phraseTerms, index) {
  if (!phraseTerms.length) return true;
  const posLists = phraseTerms.map((t) => {
    const p = index.postings.get(t)?.find((item) => item.docId === docId);
    return p?.positions ?? [];
  });
  if (posLists.some((l) => l.length === 0)) return false;
  if (posLists.length === 1) return true;

  const firstSet = posLists[0];
  const restSets = posLists.slice(1).map((l) => new Set(l));
  for (const startPos of firstSet) {
    let ok = true;
    for (let offset = 1; offset < posLists.length; offset += 1) {
      if (!restSets[offset - 1].has(startPos + offset)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Minimum window span covering all matched query terms in a document (Chapter 12.2 Term Dependence).
 * Returns proximity score in [0, 1].
 * @param {Map<string, number[]>} termPosMap
 */
function computeProximityScore(termPosMap) {
  const lists = [...termPosMap.values()].filter((l) => l.length > 0);
  if (lists.length < 2) return 0;

  // Merge sorted (pos, termIdx) pairs
  const merged = [];
  for (let i = 0; i < lists.length; i += 1) {
    for (const pos of lists[i]) merged.push([pos, i]);
  }
  merged.sort((a, b) => a[0] - b[0]);

  const counts = new Array(lists.length).fill(0);
  let covered = 0;
  let left = 0;
  let minSpan = Infinity;

  for (let right = 0; right < merged.length; right += 1) {
    const [, idxR] = merged[right];
    if (counts[idxR] === 0) covered += 1;
    counts[idxR] += 1;

    while (covered === lists.length && left <= right) {
      const span = merged[right][0] - merged[left][0] + 1;
      if (span < minSpan) minSpan = span;
      const [, idxL] = merged[left];
      counts[idxL] -= 1;
      if (counts[idxL] === 0) covered -= 1;
      left += 1;
    }
  }

  if (!Number.isFinite(minSpan)) return 0;
  return lists.length / Math.max(lists.length, minSpan);
}

/**
 * Collect candidate docIds that match positive terms and satisfy NOT / AND / phrase constraints.
 * Uses skip-pointer posting intersection when requiredTerms has >= 2 terms (Chapter 5.3/5.7).
 */
function collectCandidates(parsedQuery, index, allowedDocIds = null) {
  const { positiveTerms, requiredTerms, excludedTerms, phrases } = parsedQuery;
  if (!positiveTerms.length && !excludedTerms.length) return new Set();

  // Excluded set (NOT / -term)
  const excluded = new Set();
  for (const term of excludedTerms) {
    for (const p of index.postings.get(term) ?? []) excluded.add(p.docId);
  }

  let candidateIds = null;

  if (!positiveTerms.length) {
    candidateIds = new Set(allowedDocIds ?? index.documents.keys());
  } else if (requiredTerms.length >= 2) {
    // Conjunctive skip-pointer intersection for explicit AND terms
    const sortedReq = [...requiredTerms].sort(
      (a, b) => (index.postings.get(a)?.length ?? 0) - (index.postings.get(b)?.length ?? 0),
    );
    let current = (index.postings.get(sortedReq[0]) ?? []).map((p) => ({ docId: p.docId }));
    let currentSkips = index.skipTables.get(sortedReq[0]);
    for (let i = 1; i < sortedReq.length; i += 1) {
      const nextList = index.postings.get(sortedReq[i]) ?? [];
      const nextSkips = index.skipTables.get(sortedReq[i]);
      const inter = intersectWithSkips(current, nextList, currentSkips, nextSkips);
      current = inter.map((x) => ({ docId: x.docId }));
      currentSkips = undefined;
    }
    candidateIds = new Set(current.map((x) => x.docId));
  } else {
    candidateIds = new Set();
    for (const term of positiveTerms) {
      for (const p of index.postings.get(term) ?? []) {
        candidateIds.add(p.docId);
      }
    }
    if (requiredTerms.length === 1) {
      const reqSet = new Set((index.postings.get(requiredTerms[0]) ?? []).map((p) => p.docId));
      for (const id of candidateIds) {
        if (!reqSet.has(id)) candidateIds.delete(id);
      }
    }
  }

  for (const id of [...candidateIds]) {
    if (excluded.has(id)) {
      candidateIds.delete(id);
      continue;
    }
    if (allowedDocIds && !allowedDocIds.has(id)) {
      candidateIds.delete(id);
      continue;
    }
    if (phrases.length > 0 && !phrases.every((ph) => hasExactPhrase(id, ph, index))) {
      candidateIds.delete(id);
    }
  }

  return candidateIds;
}

/**
 * Fielded Okapi BM25 Scoring (Chapter 7.2).
 * @param {object} parsedQuery
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {{ allowedDocIds?: Set<number>, k1?: number, b?: number, k2?: number, extraTermWeights?: Map<string, number> }} [opts]
 */
export function scoreBM25(parsedQuery, index, {
  allowedDocIds = null,
  k1 = 1.2,
  b = 0.75,
  k2 = 100,
  extraTermWeights = null,
} = {}) {
  const candidates = collectCandidates(parsedQuery, index, allowedDocIds);
  if (!candidates.size || index.docCount === 0) return [];

  if (!parsedQuery.positiveTerms.length) {
    return [...candidates]
      .map((docId) => ({
        docId,
        doc: index.documents.get(docId),
        score: 1,
        matchedTerms: [],
        breakdown: { model: 'bm25', fieldHits: [], termContributions: {} },
      }))
      .sort((x, y) => y.docId - x.docId);
  }

  const avgdl = Math.max(1, index.avgDocLength);
  const termsToScore = new Map(parsedQuery.queryTermFreqs);
  if (extraTermWeights) {
    for (const [t, w] of extraTermWeights.entries()) {
      if (!termsToScore.has(t)) termsToScore.set(t, w);
    }
  }

  const acc = new Map();
  for (const id of candidates) {
    acc.set(id, { score: 0, matchedTerms: [], fieldHits: new Set(), termContributions: {} });
  }

  // Term-at-a-time accumulation over inverted lists
  for (const [term, qf] of termsToScore.entries()) {
    const postings = index.postings.get(term);
    if (!postings?.length) continue;
    const idf = index.idf(term);
    const queryFactor = extraTermWeights && !parsedQuery.queryTermFreqs.has(term)
      ? qf
      : ((k2 + 1) * qf) / (k2 + qf);

    for (const p of postings) {
      const entry = acc.get(p.docId);
      if (!entry) continue;
      const doc = index.documents.get(p.docId);
      const tfW = weightedTf(p.fieldTf);
      const dlNorm = 1 - b + b * (doc.docLength / avgdl);
      const tfPart = (tfW * (k1 + 1)) / (tfW + k1 * dlNorm);
      const contrib = idf * tfPart * queryFactor;

      entry.score += contrib;
      if (parsedQuery.queryTermFreqs.has(term)) {
        entry.matchedTerms.push(term);
        for (const [fName, fCount] of Object.entries(p.fieldTf)) {
          if (fCount > 0) entry.fieldHits.add(fName);
        }
        entry.termContributions[term] = Number(contrib.toFixed(4));
      }
    }
  }

  return [...acc.entries()]
    .filter(([, v]) => v.score > 0)
    .map(([docId, v]) => ({
      docId,
      doc: index.documents.get(docId),
      score: v.score,
      matchedTerms: v.matchedTerms,
      breakdown: {
        model: 'bm25',
        fieldHits: [...v.fieldHits],
        termContributions: v.termContributions,
      },
    }))
    .sort((x, y) => y.score - x.score || y.docId - x.docId);
}

/**
 * Vector Space Model: TF-IDF Cosine Similarity (Chapter 7.1).
 * Uses consistent sublinear TF weighting (1 + ln(tf)) * IDF so scores lie strictly in [0, 1].
 * @param {object} parsedQuery
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {{ allowedDocIds?: Set<number>, extraTermWeights?: Map<string, number> }} [opts]
 */
export function scoreTFIDF(parsedQuery, index, { allowedDocIds = null, extraTermWeights = null } = {}) {
  const candidates = collectCandidates(parsedQuery, index, allowedDocIds);
  if (!candidates.size || index.docCount === 0) return [];

  if (!parsedQuery.positiveTerms.length) {
    return [...candidates]
      .map((docId) => ({
        docId,
        doc: index.documents.get(docId),
        score: 1,
        matchedTerms: [],
        breakdown: { model: 'tfidf', fieldHits: [], termContributions: {} },
      }))
      .sort((x, y) => y.docId - x.docId);
  }

  const qVec = new Map();
  let qNormSq = 0;
  for (const [term, qf] of parsedQuery.queryTermFreqs.entries()) {
    const idf = index.idf(term);
    const wq = (1 + Math.log(qf)) * idf;
    qVec.set(term, wq);
    qNormSq += wq * wq;
  }
  if (extraTermWeights) {
    for (const [term, weight] of extraTermWeights.entries()) {
      if (qVec.has(term) || weight <= 0) continue;
      const wq = weight * index.idf(term);
      if (wq > 0) {
        qVec.set(term, wq);
        qNormSq += wq * wq;
      }
    }
  }
  const qNorm = Math.sqrt(qNormSq) || 1;

  const results = [];
  for (const docId of candidates) {
    const doc = index.documents.get(docId);
    let dot = 0;
    let dNormSq = 0;
    for (const [term, tf] of doc.termTf.entries()) {
      const w = (1 + Math.log(tf)) * index.idf(term);
      dNormSq += w * w;
    }
    const dNorm = Math.sqrt(dNormSq) || 1;
    const matchedTerms = [];
    const fieldHits = new Set();
    const termContributions = {};

    for (const [term, wq] of qVec.entries()) {
      const p = index.postings.get(term)?.find((item) => item.docId === docId);
      if (!p) continue;
      const wd = (1 + Math.log(p.tf)) * index.idf(term);
      const contrib = (wd * wq) / (dNorm * qNorm);
      dot += contrib;
      if (parsedQuery.queryTermFreqs.has(term)) {
        matchedTerms.push(term);
        for (const [fName, fCount] of Object.entries(p.fieldTf)) {
          if (fCount > 0) fieldHits.add(fName);
        }
        termContributions[term] = Number(contrib.toFixed(4));
      }
    }

    if (dot > 0) {
      results.push({
        docId,
        doc,
        score: Math.min(1, dot),
        matchedTerms,
        breakdown: {
          model: 'tfidf',
          fieldHits: [...fieldHits],
          termContributions,
        },
      });
    }
  }

  return results.sort((x, y) => y.score - x.score || y.docId - x.docId);
}

/**
 * Query Likelihood Language Model with Dirichlet Smoothing (Chapter 7.3).
 * Uses log-likelihood ratio relative to collection background P(t|C) so ranking
 * is identical to log P(Q|D) and supports RM3 feedback expansion weights.
 * @param {object} parsedQuery
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {{ allowedDocIds?: Set<number>, mu?: number, extraTermWeights?: Map<string, number> }} [opts]
 */
export function scoreQueryLikelihood(parsedQuery, index, { allowedDocIds = null, mu, extraTermWeights = null } = {}) {
  const candidates = collectCandidates(parsedQuery, index, allowedDocIds);
  if (!candidates.size || index.docCount === 0) return [];

  if (!parsedQuery.positiveTerms.length) {
    return [...candidates]
      .map((docId) => ({
        docId,
        doc: index.documents.get(docId),
        score: 1,
        matchedTerms: [],
        breakdown: { model: 'ql', mu: 0, fieldHits: [], termContributions: {} },
      }))
      .sort((x, y) => y.docId - x.docId);
  }

  const dirichletMu = mu ?? Math.max(250, index.avgDocLength);
  const totalCollectionTerms = Math.max(1, index.totalTokens + 0.5 * index.vocabSize);
  const termsToScore = new Map(parsedQuery.queryTermFreqs);
  if (extraTermWeights) {
    for (const [t, w] of extraTermWeights.entries()) {
      if (!termsToScore.has(t) && w > 0) termsToScore.set(t, w);
    }
  }

  const results = [];

  for (const docId of candidates) {
    const doc = index.documents.get(docId);
    let score = 0;
    const matchedTerms = [];
    const fieldHits = new Set();
    const termContributions = {};

    for (const [term, qf] of termsToScore.entries()) {
      const cf = index.collectionFreqs.get(term) ?? 0;
      const pCollection = (cf + 0.5) / totalCollectionTerms;
      const p = index.postings.get(term)?.find((item) => item.docId === docId);
      const tfD = p ? weightedTf(p.fieldTf) : 0;
      const pDocSmoothed = (tfD + dirichletMu * pCollection) / (doc.docLength + dirichletMu);
      const llr = qf * Math.log(pDocSmoothed / pCollection);
      score += llr;
      if (p && parsedQuery.queryTermFreqs.has(term)) {
        matchedTerms.push(term);
        for (const [fName, fCount] of Object.entries(p.fieldTf)) {
          if (fCount > 0) fieldHits.add(fName);
        }
        termContributions[term] = Number(llr.toFixed(4));
      }
    }

    results.push({
      docId,
      doc,
      score,
      matchedTerms,
      breakdown: {
        model: 'ql',
        mu: Number(dirichletMu.toFixed(1)),
        fieldHits: [...fieldHits],
        termContributions,
      },
    });
  }

  return results.sort((x, y) => y.score - x.score || y.docId - x.docId);
}

/**
 * Boolean Retrieval (Chapter 7.1):
 * treats positive terms as conjunctive unless OR was explicitly used, enforces NOT and phrases.
 */
export function scoreBoolean(parsedQuery, index, { allowedDocIds = null } = {}) {
  const effectiveQuery = parsedQuery.hasExplicitBoolean
    ? parsedQuery
    : { ...parsedQuery, requiredTerms: [...parsedQuery.positiveTerms] };
  const candidates = collectCandidates(effectiveQuery, index, allowedDocIds);
  if (!candidates.size) return [];

  const results = [];
  for (const docId of candidates) {
    const doc = index.documents.get(docId);
    let tfSum = 0;
    const matchedTerms = [];
    const fieldHits = new Set();
    for (const term of parsedQuery.positiveTerms) {
      const p = index.postings.get(term)?.find((item) => item.docId === docId);
      if (p) {
        tfSum += weightedTf(p.fieldTf);
        matchedTerms.push(term);
        for (const [fName, fCount] of Object.entries(p.fieldTf)) {
          if (fCount > 0) fieldHits.add(fName);
        }
      }
    }
    const score = matchedTerms.length * 10 + Math.log1p(tfSum);
    results.push({
      docId,
      doc,
      score,
      matchedTerms,
      breakdown: { model: 'boolean', fieldHits: [...fieldHits] },
    });
  }

  return results.sort((x, y) => y.score - x.score || y.docId - x.docId);
}

/**
 * Feature-Based Linear Hybrid Ranking (Chapter 12.1 & 12.2):
 * Combines normalized BM25, Term Proximity (ordered bigrams + min-span window),
 * Freshness decay, and Engagement (views + ratings).
 */
export function scoreHybrid(parsedQuery, index, { allowedDocIds = null, extraTermWeights = null } = {}) {
  const bm25Results = scoreBM25(parsedQuery, index, { allowedDocIds, extraTermWeights });
  if (!bm25Results.length) return [];

  const maxBm25 = Math.max(...bm25Results.map((r) => r.score), 1e-6);
  const nowMs = Date.now();
  let maxLogViews = 1;
  for (const doc of index.documents.values()) {
    const lv = Math.log1p(Number(doc.views_count ?? doc.viewsCount ?? 0));
    if (lv > maxLogViews) maxLogViews = lv;
  }

  // Ordered bigrams in query (Sequential Dependence Model, Ch 12.2)
  const queryBigrams = [];
  for (let i = 0; i < parsedQuery.positiveTerms.length - 1; i += 1) {
    queryBigrams.push(`${parsedQuery.positiveTerms[i]} ${parsedQuery.positiveTerms[i + 1]}`);
  }

  const scored = bm25Results.map((item) => {
    const { docId, doc } = item;
    const fBm25 = item.score / maxBm25;

    // Term proximity feature
    const posMap = new Map();
    for (const t of parsedQuery.positiveTerms) {
      const p = index.postings.get(t)?.find((x) => x.docId === docId);
      if (p?.positions?.length) posMap.set(t, p.positions);
    }
    let bigramHits = 0;
    for (const bg of queryBigrams) {
      if (index.bigramDocs.get(bg)?.has(docId)) bigramHits += 1;
    }
    const bigramFrac = queryBigrams.length ? bigramHits / queryBigrams.length : 0;
    const minWindowProx = computeProximityScore(posMap);
    const fProximity = Math.min(1, 0.6 * bigramFrac + 0.4 * minWindowProx);

    // Freshness decay (1 year half-life scale)
    const pubMs = doc.published_at ? Date.parse(doc.published_at) : nowMs;
    const ageDays = Math.max(0, (nowMs - (Number.isNaN(pubMs) ? nowMs : pubMs)) / 86_400_000);
    const fFreshness = Math.exp(-ageDays / 365);

    // Popularity & community rating
    const views = Number(doc.views_count ?? doc.viewsCount ?? 0);
    const fViews = Math.log1p(views) / maxLogViews;
    const ratingAvg = doc.rating_avg != null ? Number(doc.rating_avg) : 3.0;
    const fRating = ratingAvg / 5;
    const fEngagement = 0.7 * fViews + 0.3 * fRating;

    const finalScore =
      0.55 * fBm25 +
      0.20 * fProximity +
      0.10 * fFreshness +
      0.15 * fEngagement;

    return {
      ...item,
      score: finalScore,
      breakdown: {
        ...item.breakdown,
        model: 'hybrid',
        features: {
          bm25Norm: Number(fBm25.toFixed(4)),
          proximity: Number(fProximity.toFixed(4)),
          freshness: Number(fFreshness.toFixed(4)),
          engagement: Number(fEngagement.toFixed(4)),
        },
      },
    };
  });

  return scored.sort((x, y) => y.score - x.score || y.docId - x.docId);
}

/**
 * Pseudo-Relevance Feedback (RM3 / Relevance Model, Chapter 7.3 S15):
 * 1. Take top-k documents from initial ranking
 * 2. Compute relevance-weighted term distribution P(w|R)
 * 3. Select top m expansion terms and re-score with BM25 / Hybrid
 * @param {object} parsedQuery
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {Array<{ docId: number, doc: object, score: number }>} initialResults
 * @param {{ feedbackDocs?: number, feedbackTerms?: number, alpha?: number }} [opts]
 */
export function computePrfExpansion(parsedQuery, index, initialResults, {
  feedbackDocs = 5,
  feedbackTerms = 5,
  alpha = 0.4,
} = {}) {
  const topDocs = initialResults.slice(0, feedbackDocs);
  if (!topDocs.length) return new Map();

  const scoreSum = topDocs.reduce((s, r) => s + Math.max(0.01, r.score), 0);
  const querySet = new Set(parsedQuery.positiveTerms);
  const termWeights = new Map();

  for (const { doc, score } of topDocs) {
    const pDoc = Math.max(0.01, score) / scoreSum;
    const dl = Math.max(1, doc.docLength);
    for (const [term, tf] of doc.termTf.entries()) {
      if (querySet.has(term) || term.length < 3 || /^\d+$/.test(term)) continue;
      const df = index.postings.get(term)?.length ?? 0;
      if (df / Math.max(1, index.docCount) > 0.55) continue;
      const pTermInDoc = tf / dl;
      termWeights.set(term, (termWeights.get(term) ?? 0) + pDoc * pTermInDoc * index.idf(term));
    }
  }

  const selected = [...termWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, feedbackTerms);
  if (!selected.length) return new Map();

  const maxW = selected[0][1] || 1;
  const extra = new Map();
  for (const [term, w] of selected) {
    extra.set(term, alpha * (w / maxW));
  }
  return extra;
}

/**
 * Dispatch search across any supported retrieval model.
 */
export function runRetrievalModel({
  model = 'bm25',
  parsedQuery,
  index,
  allowedDocIds = null,
  usePrf = false,
}) {
  let prfTerms = null;
  let effectiveExtraWeights = null;

  if (usePrf && parsedQuery.positiveTerms.length > 0) {
    const initial = model === 'ql'
      ? scoreQueryLikelihood(parsedQuery, index, { allowedDocIds })
      : model === 'tfidf'
        ? scoreTFIDF(parsedQuery, index, { allowedDocIds })
        : scoreBM25(parsedQuery, index, { allowedDocIds });
    effectiveExtraWeights = computePrfExpansion(parsedQuery, index, initial);
    prfTerms = [...effectiveExtraWeights.entries()].map(([stem, weight]) => ({
      stem,
      term: index.stemToRaw.get(stem)?.[0] ?? stem,
      weight: Number(weight.toFixed(3)),
    }));
  }

  let results;
  switch (model) {
    case 'tfidf':
      results = scoreTFIDF(parsedQuery, index, { allowedDocIds, extraTermWeights: effectiveExtraWeights });
      break;
    case 'ql':
      results = scoreQueryLikelihood(parsedQuery, index, { allowedDocIds, extraTermWeights: effectiveExtraWeights });
      break;
    case 'boolean':
      results = scoreBoolean(parsedQuery, index, { allowedDocIds });
      break;
    case 'hybrid':
      results = scoreHybrid(parsedQuery, index, { allowedDocIds, extraTermWeights: effectiveExtraWeights });
      break;
    case 'bm25':
    default:
      results = scoreBM25(parsedQuery, index, { allowedDocIds, extraTermWeights: effectiveExtraWeights });
      break;
  }

  return { results, prfTerms };
}
