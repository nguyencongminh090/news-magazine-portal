/**
 * Chapter 6 (Queries and Interfaces) & Chapter 10.2 (Result Clustering):
 * - Query parsing (Boolean AND/OR/NOT, quoted phrases, free text)
 * - Spell checking via Damerau-Levenshtein edit distance + Noisy Channel P(e|w)*P(w)
 * - Query expansion via Dice's coefficient (2 * n_ab / (n_a + n_b))
 * - Luhn-style passage snippet selection & safe segment highlighting
 * - K-Means search result clustering over TF-IDF vectors
 */

import { STOPWORDS, porterStem, tokenizeRaw } from './tokenizer.js';

/**
 * Parse a user query into structured clauses for Boolean & ranked retrieval.
 * Uppercase AND / OR / NOT act as explicit Boolean operators; `-term` excludes; `"..."` marks phrases.
 * @param {string} rawQuery
 */
export function parseQuery(rawQuery) {
  const input = String(rawQuery || '').trim();
  const phrases = [];
  const rawWords = [];
  const positiveTerms = [];
  const requiredTerms = [];
  const excludedTerms = [];
  let hasExplicitBoolean = false;

  // 1. Extract quoted phrases
  const remainder = input.replace(/"([^"]+)"/g, (_m, phraseText) => {
    const toks = tokenizeRaw(phraseText)
      .map((t) => t.lower)
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
    if (toks.length > 0) {
      rawWords.push(...toks);
      const stems = toks.map(porterStem);
      phrases.push(stems);
      for (const s of stems) {
        if (!positiveTerms.includes(s)) positiveTerms.push(s);
      }
    }
    return ' ';
  });

  // 2. Scan remaining whitespace tokens
  const parts = remainder.split(/\s+/).filter(Boolean);
  let nextMode = 'normal'; // 'normal' | 'and' | 'not'
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === 'AND') {
      hasExplicitBoolean = true;
      nextMode = 'and';
      if (positiveTerms.length > 0 && requiredTerms.length === 0) {
        requiredTerms.push(positiveTerms[positiveTerms.length - 1]);
      }
      continue;
    }
    if (part === 'OR') {
      hasExplicitBoolean = true;
      nextMode = 'normal';
      continue;
    }
    if (part === 'NOT') {
      hasExplicitBoolean = true;
      nextMode = 'not';
      continue;
    }

    const isNegated = part.startsWith('-') && part.length > 1;
    const cleanPart = isNegated ? part.slice(1) : part;
    const toks = tokenizeRaw(cleanPart).map((t) => t.lower);
    for (const w of toks) {
      if (w.length < 2 && !/^\d+$/.test(w)) continue;
      if (STOPWORDS.has(w)) continue;
      const stem = porterStem(w);
      if (isNegated || nextMode === 'not') {
        hasExplicitBoolean = true;
        if (!excludedTerms.includes(stem)) excludedTerms.push(stem);
      } else {
        rawWords.push(w);
        if (!positiveTerms.includes(stem)) positiveTerms.push(stem);
        if (nextMode === 'and' && !requiredTerms.includes(stem)) {
          requiredTerms.push(stem);
        }
      }
    }
    nextMode = 'normal';
  }

  // Fallback only if the user gave pure stopwords/free words with no Boolean negation/operators
  if (positiveTerms.length === 0 && excludedTerms.length === 0 && !hasExplicitBoolean && input) {
    const fallbackToks = tokenizeRaw(input).map((t) => t.lower);
    for (const w of fallbackToks) {
      rawWords.push(w);
      const stem = porterStem(w);
      if (!positiveTerms.includes(stem)) positiveTerms.push(stem);
    }
  }

  // Term frequency map in query (qf_i for BM25)
  const queryTermFreqs = new Map();
  for (const w of rawWords) {
    const s = porterStem(w);
    if (positiveTerms.includes(s)) {
      queryTermFreqs.set(s, (queryTermFreqs.get(s) ?? 0) + 1);
    }
  }
  for (const s of positiveTerms) {
    if (!queryTermFreqs.has(s)) queryTermFreqs.set(s, 1);
  }

  return {
    rawQuery: input,
    hasExplicitBoolean,
    phrases,
    rawWords: [...new Set(rawWords)],
    positiveTerms,
    requiredTerms,
    excludedTerms,
    queryTermFreqs,
  };
}

/**
 * Optimal String Alignment / Damerau-Levenshtein edit distance (Chapter 6.2 S7):
 * counts insertions, deletions, substitutions, and adjacent transpositions.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function damerauLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 3) return Math.abs(m - n);

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }
  return dp[m][n];
}

/**
 * Noisy Channel Spell Checker: argmax_w P(e|w) * P(w) (Chapter 6.2 S8).
 * Suggests spelling corrections when a query word is out-of-vocabulary or missing from the index.
 * @param {string} rawQuery
 * @param {import('./invertedIndex.js').InvertedIndex} index
 */
export function suggestSpelling(rawQuery, index) {
  const parts = String(rawQuery || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || index.rawVocabFreq.size === 0) return null;

  const corrections = [];
  const correctedParts = [];
  let changed = false;
  const totalTokens = Math.max(1, index.totalTokens);
  const vocabSize = Math.max(1, index.rawVocabFreq.size);

  for (const part of parts) {
    if (part === 'AND' || part === 'OR' || part === 'NOT') {
      correctedParts.push(part);
      continue;
    }

    const leadNeg = part.startsWith('-') && part.length > 1 ? '-' : '';
    const inner = leadNeg ? part.slice(1) : part;
    const toks = tokenizeRaw(inner).map((t) => t.lower);
    if (toks.length !== 1) {
      correctedParts.push(part);
      continue;
    }
    const w = toks[0];
    if (STOPWORDS.has(w) || /^\d+$/.test(w) || w.length < 3) {
      correctedParts.push(part);
      continue;
    }
    const exactFreq = index.rawVocabFreq.get(w) ?? 0;
    const stemExists = index.postings.has(porterStem(w));
    if (exactFreq > 0 || stemExists) {
      correctedParts.push(part);
      continue;
    }

    let bestWord = null;
    let bestScore = -1;
    let bestDist = 3;
    const maxDist = w.length <= 4 ? 1 : 2;

    for (const [cand, freq] of index.rawVocabFreq.entries()) {
      if (Math.abs(cand.length - w.length) > maxDist) continue;
      if (freq < 1) continue;
      const dist = damerauLevenshtein(w, cand);
      if (dist > 0 && dist <= maxDist) {
        // P(e|w) decays exponentially with edit distance; P(w) uses Laplace-smoothed corpus freq.
        const pErrorGivenWord = Math.exp(-dist * 3.0);
        const pWord = (freq + 0.5) / (totalTokens + vocabSize);
        const score = pErrorGivenWord * pWord;
        if (score > bestScore) {
          bestScore = score;
          bestWord = cand;
          bestDist = dist;
        }
      }
    }

    if (bestWord) {
      changed = true;
      correctedParts.push(part.replace(new RegExp(w, 'i'), bestWord));
      corrections.push({ original: w, suggestion: bestWord, editDistance: bestDist });
    } else {
      correctedParts.push(part);
    }
  }

  if (!changed) return null;
  return {
    correctedQuery: correctedParts.join(' '),
    corrections,
  };
}

/**
 * Query Expansion using Dice's Coefficient (Chapter 6.2 S6 & S9):
 * Dice(a, b) = 2 * n_ab / (n_a + n_b), computed over document co-occurrence.
 * @param {string[]} queryTerms - stemmed query terms
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {number} [limit=5]
 */
export function expandQueryDice(queryTerms, index, limit = 5) {
  if (!queryTerms.length || index.docCount === 0) return [];
  const querySet = new Set(queryTerms);
  const coCounts = new Map();
  let sumNa = 0;

  for (const qt of queryTerms) {
    const postings = index.postings.get(qt);
    if (!postings?.length) continue;
    sumNa += postings.length;
    for (const p of postings) {
      const doc = index.documents.get(p.docId);
      if (!doc) continue;
      for (const cand of doc.termTf.keys()) {
        if (querySet.has(cand) || /^\d+$/.test(cand) || cand.length < 3) continue;
        coCounts.set(cand, (coCounts.get(cand) ?? 0) + 1);
      }
    }
  }

  if (sumNa === 0) return [];

  const scored = [];
  for (const [cand, nab] of coCounts.entries()) {
    const nb = index.postings.get(cand)?.length ?? 0;
    if (nb < 2 || nab < 2) continue;
    // Exclude near-universal corpus terms (> 60% of docs) to keep expansion specific
    if (nb / index.docCount > 0.6) continue;
    const dice = (2 * nab) / (sumNa + nb);
    const displayTerm = index.stemToRaw.get(cand)?.[0] ?? cand;
    scored.push({
      stem: cand,
      term: displayTerm,
      diceScore: Number(dice.toFixed(4)),
      coOccurrences: nab,
    });
  }

  return scored
    .sort((a, b) => b.diceScore - a.diceScore || b.coOccurrences - a.coOccurrences)
    .slice(0, limit);
}

/**
 * Generate a query-biased snippet with safe highlight segments (Chapter 6.3):
 * locates the highest-density passage of query terms and returns plain-text segments
 * `{ text, match }` so the UI highlights matches without unsafe HTML injection.
 * @param {object} doc
 * @param {string[]} rawWords
 * @param {string[]} stemmedTerms
 * @param {number} [maxLen=210]
 */
export function generateSnippet(doc, rawWords, stemmedTerms, maxLen = 210) {
  const source = String(doc.content ?? doc.body ?? doc.summary ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return { text: '', segments: [] };

  const queryStemSet = new Set(stemmedTerms);
  const rawSet = new Set(rawWords.map((w) => w.toLowerCase()));
  const tokens = tokenizeRaw(source);

  if (!tokens.length || (!queryStemSet.size && !rawSet.size)) {
    const clipped = source.length > maxLen ? `${source.slice(0, maxLen).trim()}…` : source;
    return { text: clipped, segments: [{ text: clipped, match: false }] };
  }

  // Identify matching token indices
  const matchFlags = tokens.map((tok) => {
    if (rawSet.has(tok.lower)) return true;
    if (STOPWORDS.has(tok.lower)) return false;
    return queryStemSet.has(porterStem(tok.lower));
  });

  // Slide a ~30-word window to find the densest passage of query hits
  const winTokens = 30;
  let bestWinStart = 0;
  let bestWinEnd = Math.min(tokens.length - 1, winTokens - 1);
  let bestScore = -1;
  let currentHits = 0;
  const distinctInWindow = new Map();

  for (let i = 0; i < tokens.length; i += 1) {
    if (matchFlags[i]) {
      currentHits += 1;
      const st = porterStem(tokens[i].lower);
      distinctInWindow.set(st, (distinctInWindow.get(st) ?? 0) + 1);
    }
    if (i >= winTokens) {
      const old = i - winTokens;
      if (matchFlags[old]) {
        currentHits -= 1;
        const st = porterStem(tokens[old].lower);
        const cnt = (distinctInWindow.get(st) ?? 1) - 1;
        if (cnt <= 0) distinctInWindow.delete(st);
        else distinctInWindow.set(st, cnt);
      }
    }
    const score = distinctInWindow.size * 3 + currentHits;
    if (score > bestScore) {
      bestScore = score;
      bestWinStart = Math.max(0, i - winTokens + 1);
      bestWinEnd = i;
    }
  }

  // Anchor snippet start near the first matched token in the winning window so matches are never clipped out
  let anchorIdx = bestWinStart;
  if (bestScore > 0) {
    for (let i = bestWinStart; i <= bestWinEnd; i += 1) {
      if (matchFlags[i]) {
        anchorIdx = i;
        break;
      }
    }
  }

  let charStart = bestScore > 0 ? Math.max(0, tokens[anchorIdx].start - 45) : 0;
  if (charStart > 0) {
    const nextSpace = source.indexOf(' ', charStart);
    if (nextSpace !== -1 && nextSpace - charStart < 20) charStart = nextSpace + 1;
  }
  let charEnd = Math.min(source.length, charStart + maxLen);
  if (charEnd < source.length) {
    const prevSpace = source.lastIndexOf(' ', charEnd);
    if (prevSpace > charStart + 40) charEnd = prevSpace;
  }

  const prefix = charStart > 0 ? '…' : '';
  const suffix = charEnd < source.length ? '…' : '';
  const slice = source.slice(charStart, charEnd);
  const fullText = `${prefix}${slice}${suffix}`;

  // Build segments over slice
  const segments = [];
  if (prefix) segments.push({ text: prefix, match: false });
  let cursor = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!matchFlags[i]) continue;
    const tok = tokens[i];
    if (tok.end <= charStart || tok.start >= charEnd) continue;
    const relStart = Math.max(0, tok.start - charStart);
    const relEnd = Math.min(slice.length, tok.end - charStart);
    if (relStart > cursor) {
      segments.push({ text: slice.slice(cursor, relStart), match: false });
    }
    segments.push({ text: slice.slice(relStart, relEnd), match: true });
    cursor = relEnd;
  }
  if (cursor < slice.length) {
    segments.push({ text: slice.slice(cursor), match: false });
  }
  if (suffix) segments.push({ text: suffix, match: false });

  return { text: fullText, segments };
}

/**
 * K-Means Clustering of Search Results (Chapter 6.3 & Chapter 10.2).
 * Groups top retrieved articles by TF-IDF cosine similarity and generates descriptive cluster labels.
 * @param {Array<{ doc: object, score: number }>} rankedDocs
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {number} [maxK=4]
 */
export function clusterResults(rankedDocs, index, maxK = 4) {
  const docs = rankedDocs.slice(0, 30);
  if (docs.length < 3) return [];

  const k = Math.min(maxK, Math.max(2, Math.floor(Math.sqrt(docs.length / 2))));
  // Build L2-normalized TF-IDF vectors for each doc
  const vectors = docs.map(({ doc }) => {
    const vec = new Map();
    let normSq = 0;
    for (const [term, tf] of doc.termTf.entries()) {
      const w = (1 + Math.log(tf)) * index.idf(term);
      if (w > 0) {
        vec.set(term, w);
        normSq += w * w;
      }
    }
    const norm = Math.sqrt(normSq) || 1;
    for (const [term, w] of vec.entries()) vec.set(term, w / norm);
    return vec;
  });

  const cosine = (a, b) => {
    let dot = 0;
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const [t, v] of small.entries()) {
      const ov = large.get(t);
      if (ov) dot += v * ov;
    }
    return dot;
  };

  // Deterministic initialization: spread seeds evenly across ranked list
  const centroids = [];
  for (let c = 0; c < k; c += 1) {
    const seedIdx = Math.min(docs.length - 1, Math.floor((c * docs.length) / k));
    centroids.push(new Map(vectors[seedIdx]));
  }

  let assignments = new Array(docs.length).fill(0);
  for (let iter = 0; iter < 8; iter += 1) {
    let changed = false;
    for (let i = 0; i < docs.length; i += 1) {
      let bestC = 0;
      let bestSim = -1;
      for (let c = 0; c < k; c += 1) {
        const sim = cosine(vectors[i], centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }
    if (!changed && iter > 0) break;

    // Recompute normalized centroids
    for (let c = 0; c < k; c += 1) {
      const sum = new Map();
      let count = 0;
      for (let i = 0; i < docs.length; i += 1) {
        if (assignments[i] !== c) continue;
        count += 1;
        for (const [t, w] of vectors[i].entries()) {
          sum.set(t, (sum.get(t) ?? 0) + w);
        }
      }
      if (count > 0) {
        let normSq = 0;
        for (const v of sum.values()) normSq += v * v;
        const norm = Math.sqrt(normSq) || 1;
        for (const [t, v] of sum.entries()) sum.set(t, v / norm);
        centroids[c] = sum;
      }
    }
  }

  const clusters = [];
  for (let c = 0; c < k; c += 1) {
    const memberIdxs = [];
    for (let i = 0; i < docs.length; i += 1) {
      if (assignments[i] === c) memberIdxs.push(i);
    }
    if (memberIdxs.length === 0) continue;

    // Pick top 2 descriptive terms from centroid
    const topTerms = [...centroids[c].entries()]
      .filter(([t]) => !/^\d+$/.test(t) && t.length >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([t]) => index.stemToRaw.get(t)?.[0] ?? t);

    const label = topTerms.length ? topTerms.join(' · ') : (docs[memberIdxs[0]].doc.category_name ?? 'Topic');
    clusters.push({
      id: clusters.length + 1,
      label,
      count: memberIdxs.length,
      articles: memberIdxs.slice(0, 5).map((idx) => ({
        id: docs[idx].doc.id,
        slug: docs[idx].doc.slug,
        title: docs[idx].doc.title,
      })),
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}
