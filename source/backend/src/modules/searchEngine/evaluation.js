/**
 * Chapter 9 (Evaluating Search Engines):
 * - Effectiveness metrics: Precision@K, Recall@K, F1, MAP, MRR, DCG@K, NDCG@K
 * - Preference comparison: Kendall's tau (τ)
 * - Statistical significance: Paired two-sided sign test (P-value)
 * - Efficiency metrics: Mean/P95 latency (ms), throughput (QPS)
 * - Live query & click-through evaluation from search_query_log + search_click_log
 */

import { parseQuery } from './queryProcessor.js';
import { runRetrievalModel } from './retrievalModels.js';
import { processText } from './tokenizer.js';

/** Precision@K = |retrieved[:k] ∩ relevant| / min(k, |retrieved|) (or / k if non-empty). */
export function precisionAtK(rankedIds, relevantSet, k) {
  if (k <= 0) return 0;
  const top = rankedIds.slice(0, k);
  if (!top.length) return 0;
  let hits = 0;
  for (const id of top) {
    if (relevantSet.has(id)) hits += 1;
  }
  return hits / k;
}

/** Recall@K = |retrieved[:k] ∩ relevant| / |relevant|. */
export function recallAtK(rankedIds, relevantSet, k) {
  if (!relevantSet.size || k <= 0) return 0;
  const top = rankedIds.slice(0, k);
  let hits = 0;
  for (const id of top) {
    if (relevantSet.has(id)) hits += 1;
  }
  return hits / relevantSet.size;
}

/** F1 = 2 * P * R / (P + R) (Chapter 9.4 S11). */
export function f1Score(precision, recall) {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** Average Precision (AP) for a single query (Chapter 9.4 S12). */
export function averagePrecision(rankedIds, relevantSet) {
  if (!relevantSet.size) return 0;
  let hits = 0;
  let sumPrec = 0;
  for (let i = 0; i < rankedIds.length; i += 1) {
    if (relevantSet.has(rankedIds[i])) {
      hits += 1;
      sumPrec += hits / (i + 1);
    }
  }
  return sumPrec / relevantSet.size;
}

/** Reciprocal Rank = 1 / rank of first relevant document (Chapter 9.4 S14). */
export function reciprocalRank(rankedIds, relevantSet) {
  for (let i = 0; i < rankedIds.length; i += 1) {
    if (relevantSet.has(rankedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/** Discounted Cumulative Gain at K: sum_{i=1..k} (2^rel_i - 1) / log2(i + 1) (Chapter 9.4 S14-15). */
export function dcgAtK(rankedIds, relevanceGrades, k) {
  let dcg = 0;
  const limit = Math.min(k, rankedIds.length);
  for (let i = 0; i < limit; i += 1) {
    const rel = relevanceGrades.get(rankedIds[i]) ?? 0;
    if (rel > 0) {
      dcg += (2 ** rel - 1) / Math.log2(i + 2);
    }
  }
  return dcg;
}

/** Normalized Discounted Cumulative Gain at K: DCG@K / IDCG@K (Chapter 9.4 S15). */
export function ndcgAtK(rankedIds, relevanceGrades, k) {
  const idealOrder = [...relevanceGrades.entries()]
    .filter(([, rel]) => rel > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const idcg = dcgAtK(idealOrder, relevanceGrades, k);
  if (idcg === 0) return 0;
  return dcgAtK(rankedIds, relevanceGrades, k) / idcg;
}

/**
 * Kendall's tau rank correlation coefficient between two rankings (Chapter 9.4 S16):
 * tau = (P - Q) / (P + Q) where P = concordant pairs, Q = discordant pairs over the union.
 * @param {number[]} rankingA
 * @param {number[]} rankingB
 * @returns {number} in [-1, 1]
 */
export function kendallTau(rankingA, rankingB) {
  const posA = new Map(rankingA.map((id, idx) => [id, idx]));
  const posB = new Map(rankingB.map((id, idx) => [id, idx]));
  const items = [...new Set([...rankingA, ...rankingB])];
  const n = items.length;
  if (n < 2) return 1;

  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = items[i];
      const b = items[j];
      const rankA1 = posA.get(a) ?? n;
      const rankA2 = posA.get(b) ?? n;
      const rankB1 = posB.get(a) ?? n;
      const rankB2 = posB.get(b) ?? n;
      const diffA = rankA1 - rankA2;
      const diffB = rankB1 - rankB2;
      if (diffA === 0 || diffB === 0) continue;
      if ((diffA > 0 && diffB > 0) || (diffA < 0 && diffB < 0)) {
        concordant += 1;
      } else {
        discordant += 1;
      }
    }
  }
  const denom = concordant + discordant;
  return denom > 0 ? (concordant - discordant) / denom : 1;
}

/**
 * Two-sided Paired Sign Test P-value (Chapter 9.6 S18-19) comparing per-query metric arrays.
 * Tests H0: no effectiveness difference between system A and system B.
 * @param {number[]} scoresA
 * @param {number[]} scoresB
 * @returns {number} p-value in [0, 1]
 */
export function pairedSignTestPValue(scoresA, scoresB) {
  let winsB = 0;
  let winsA = 0;
  const len = Math.min(scoresA.length, scoresB.length);
  for (let i = 0; i < len; i += 1) {
    const diff = scoresB[i] - scoresA[i];
    if (diff > 1e-6) winsB += 1;
    else if (diff < -1e-6) winsA += 1;
  }
  const n = winsA + winsB;
  if (n === 0) return 1;

  const k = Math.min(winsA, winsB);
  // Exact binomial sum: 2 * sum_{i=0..k} C(n, i) * 0.5^n
  const binomCoeff = (total, choose) => {
    let res = 1;
    for (let i = 1; i <= choose; i += 1) {
      res = (res * (total - choose + i)) / i;
    }
    return res;
  };
  let tail = 0;
  const pow = 0.5 ** n;
  for (let i = 0; i <= k; i += 1) {
    tail += binomCoeff(n, i) * pow;
  }
  return Math.min(1, Number((2 * tail).toFixed(4)));
}

/**
 * Build an automatic TREC-style benchmark query collection from the indexed corpus
 * using editorial tags, categories, and high-signal topic concepts.
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {number} [maxQueries=16]
 */
export function buildCorpusBenchmarkQueries(index, maxQueries = 16) {
  if (index.docCount === 0) return [];
  const docs = [...index.documents.values()];

  // Group docs by normalized tag to form multi-document topical information needs
  const tagGroups = new Map();
  for (const doc of docs) {
    for (const tag of doc.tags ?? []) {
      const clean = String(tag).trim();
      if (!clean || clean.length < 3) continue;
      const key = clean.toLowerCase();
      let arr = tagGroups.get(key);
      if (!arr) {
        arr = { label: clean, docs: [] };
        tagGroups.set(key, arr);
      }
      arr.docs.push(doc);
    }
  }

  const queries = [];
  const usedQueries = new Set();

  // 1. Tag + category co-occurring topic queries (graded relevance: 2 = tag+category, 1 = tag/title term)
  const candidates = [...tagGroups.values()]
    .filter((g) => g.docs.length >= 2 && g.docs.length <= Math.max(3, Math.floor(index.docCount * 0.45)))
    .sort((a, b) => b.docs.length - a.docs.length);

  for (const group of candidates) {
    if (queries.length >= maxQueries) break;
    // Enrich query with top discriminative content word shared across group docs
    const groupTermCounts = new Map();
    for (const doc of group.docs) {
      const titleStems = new Set(processText(doc.title).terms);
      for (const st of titleStems) {
        groupTermCounts.set(st, (groupTermCounts.get(st) ?? 0) + 1);
      }
    }
    const labelTerms = new Set(processText(group.label).terms);
    const extraStem = [...groupTermCounts.entries()]
      .filter(([st]) => !labelTerms.has(st) && st.length >= 3)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const extraWord = extraStem ? (index.stemToRaw.get(extraStem)?.[0] ?? extraStem) : '';
    const queryStr = extraWord ? `${group.label} ${extraWord}` : group.label;
    const normQ = queryStr.toLowerCase();
    if (usedQueries.has(normQ)) continue;
    usedQueries.add(normQ);

    const qStems = processText(queryStr).terms;
    const relevantGrades = new Map();
    for (const doc of docs) {
      const hasTag = (doc.tags ?? []).some((t) => t.toLowerCase() === group.label.toLowerCase());
      const titleTerms = new Set(processText(doc.title).terms);
      const titleMatches = qStems.filter((s) => titleTerms.has(s)).length;
      if (hasTag && titleMatches >= 1) {
        relevantGrades.set(doc.id, 2);
      } else if (hasTag || titleMatches >= Math.max(1, qStems.length)) {
        relevantGrades.set(doc.id, 1);
      }
    }
    if (relevantGrades.size >= 1) {
      queries.push({ query: queryStr, topic: group.label, relevantGrades });
    }
  }

  // Fallback for tiny synthetic corpora without tags: derive from document title keywords
  if (queries.length === 0) {
    for (const doc of docs.slice(0, Math.min(5, docs.length))) {
      const titleTerms = processText(doc.title).keptRaw.slice(0, 2);
      if (!titleTerms.length) continue;
      const queryStr = titleTerms.join(' ');
      if (usedQueries.has(queryStr)) continue;
      usedQueries.add(queryStr);
      const grades = new Map([[doc.id, 2]]);
      queries.push({ query: queryStr, topic: doc.category_name ?? 'General', relevantGrades: grades });
    }
  }

  return queries;
}

/**
 * Run comparative offline IR benchmark across retrieval models (Chapter 9.4-9.6).
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {Array<{ query: string, topic?: string, relevantGrades: Map<number, number> }>} [customQueries]
 */
export function evaluateCorpusModels(index, customQueries = null) {
  const testQueries = customQueries ?? buildCorpusBenchmarkQueries(index);
  if (!testQueries.length || index.docCount === 0) {
    return { queryCount: 0, baseline: 'tfidf', models: [], queries: [] };
  }

  const specs = [
    { id: 'tfidf', label: 'TF-IDF (Vector Space)', model: 'tfidf', usePrf: false },
    { id: 'ql', label: 'Query Likelihood (Dirichlet)', model: 'ql', usePrf: false },
    { id: 'bm25', label: 'Okapi BM25 (Fielded)', model: 'bm25', usePrf: false },
    { id: 'bm25_prf', label: 'BM25 + PRF (RM3)', model: 'bm25', usePrf: true },
    { id: 'hybrid', label: 'Hybrid (BM25 + Proximity + Freshness)', model: 'hybrid', usePrf: false },
  ];

  const perModelQueryAp = new Map();
  const perModelRankings = new Map();
  const modelSummaries = [];

  for (const spec of specs) {
    let sumP5 = 0;
    let sumP10 = 0;
    let sumR10 = 0;
    let sumF1 = 0;
    let sumAp = 0;
    let sumRr = 0;
    let sumNdcg5 = 0;
    let sumNdcg10 = 0;
    let totalMs = 0;
    const apList = [];
    const rankingsList = [];

    for (const qItem of testQueries) {
      const relevantSet = new Set(
        [...qItem.relevantGrades.entries()].filter(([, rel]) => rel > 0).map(([id]) => id),
      );
      const parsed = parseQuery(qItem.query);
      const t0 = performance.now();
      const { results } = runRetrievalModel({
        model: spec.model,
        parsedQuery: parsed,
        index,
        usePrf: spec.usePrf,
      });
      totalMs += performance.now() - t0;

      const rankedIds = results.map((r) => r.docId);
      const p5 = precisionAtK(rankedIds, relevantSet, 5);
      const p10 = precisionAtK(rankedIds, relevantSet, 10);
      const r10 = recallAtK(rankedIds, relevantSet, 10);
      const ap = averagePrecision(rankedIds, relevantSet);

      sumP5 += p5;
      sumP10 += p10;
      sumR10 += r10;
      sumF1 += f1Score(p10, r10);
      sumAp += ap;
      sumRr += reciprocalRank(rankedIds, relevantSet);
      sumNdcg5 += ndcgAtK(rankedIds, qItem.relevantGrades, 5);
      sumNdcg10 += ndcgAtK(rankedIds, qItem.relevantGrades, 10);
      apList.push(ap);
      rankingsList.push(rankedIds.slice(0, 10));
    }

    const qCount = testQueries.length;
    const meanLatencyMs = totalMs / qCount;
    perModelQueryAp.set(spec.id, apList);
    perModelRankings.set(spec.id, rankingsList);

    modelSummaries.push({
      id: spec.id,
      label: spec.label,
      pAt5: Number((sumP5 / qCount).toFixed(4)),
      pAt10: Number((sumP10 / qCount).toFixed(4)),
      recallAt10: Number((sumR10 / qCount).toFixed(4)),
      f1At10: Number((sumF1 / qCount).toFixed(4)),
      map: Number((sumAp / qCount).toFixed(4)),
      mrr: Number((sumRr / qCount).toFixed(4)),
      ndcgAt5: Number((sumNdcg5 / qCount).toFixed(4)),
      ndcgAt10: Number((sumNdcg10 / qCount).toFixed(4)),
      avgLatencyMs: Number(meanLatencyMs.toFixed(3)),
      qps: meanLatencyMs > 0 ? Math.round(1000 / meanLatencyMs) : 0,
    });
  }

  // Compare each model against TF-IDF baseline (Kendall's tau + paired sign test p-value)
  const baseAps = perModelQueryAp.get('tfidf');
  const baseRankings = perModelRankings.get('tfidf');
  for (const m of modelSummaries) {
    if (m.id === 'tfidf') {
      m.kendallTauVsBaseline = 1;
      m.pValueVsBaseline = 1;
      m.significantVsBaseline = false;
      continue;
    }
    const rList = perModelRankings.get(m.id);
    const taus = rList.map((r, i) => kendallTau(baseRankings[i], r));
    const avgTau = taus.reduce((a, b) => a + b, 0) / Math.max(1, taus.length);
    const pVal = pairedSignTestPValue(baseAps, perModelQueryAp.get(m.id));
    m.kendallTauVsBaseline = Number(avgTau.toFixed(3));
    m.pValueVsBaseline = pVal;
    m.significantVsBaseline = pVal <= 0.05;
  }

  return {
    queryCount: testQueries.length,
    baseline: 'tfidf',
    models: modelSummaries,
    sampleQueries: testQueries.slice(0, 8).map((q) => ({
      query: q.query,
      topic: q.topic ?? 'Topic',
      relevantCount: [...q.relevantGrades.values()].filter((v) => v > 0).length,
    })),
  };
}

/**
 * Evaluate live search logs & click logs (Chapter 9.3 & 9.5):
 * computes CTR, click-based MRR, zero-hit rate, and latency stats.
 */
export function evaluateLiveLogs({ queryLogs = [], clickLogs = [] }) {
  const totalQueries = queryLogs.length;
  const totalClicks = clickLogs.length;

  const clickedQueryIds = new Set(
    clickLogs.map((c) => c.query_log_id).filter((id) => id != null).map(Number),
  );
  const queriesWithClicks = totalQueries > 0
    ? queryLogs.filter((q) => clickedQueryIds.has(Number(q.id))).length
    : 0;
  const ctr = totalQueries > 0
    ? Number((queriesWithClicks / totalQueries).toFixed(4))
    : 0;

  const zeroHitQueries = queryLogs.filter((q) => Number(q.total_results ?? 0) === 0).length;
  const zeroHitRate = totalQueries > 0 ? Number((zeroHitQueries / totalQueries).toFixed(4)) : 0;

  const rankedClicks = clickLogs.filter((c) => Number(c.rank_position) >= 1);
  const clickMrr = rankedClicks.length > 0
    ? Number((rankedClicks.reduce((s, c) => s + 1 / Number(c.rank_position), 0) / rankedClicks.length).toFixed(4))
    : null;

  const latencies = queryLogs
    .map((q) => Number(q.latency_ms))
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  const avgLatencyMs = latencies.length > 0
    ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2))
    : 0;
  const p95LatencyMs = latencies.length > 0
    ? Number(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))].toFixed(2))
    : 0;

  return {
    totalQueries,
    totalClicks,
    ctr,
    clickMrr,
    zeroHitQueries,
    zeroHitRate,
    avgLatencyMs,
    p95LatencyMs,
  };
}
