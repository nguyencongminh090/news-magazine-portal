/**
 * Chapter 8 (SEO), Chapter 10 (Classification/Similarity), Chapter 11 (Social Search):
 * - Inferring Missing Tags via TF-IDF term weights (Chapter 11.2 S8)
 * - Weighted Tag Cloud generation (Chapter 11.2 S9)
 * - Content-based Related Articles (TF-IDF cosine similarity + tag/category overlap)
 * - Collaborative Filtering + Profile-based Recommendations (Chapter 11.4 S18-21)
 * - On-Page SEO Audit Scorer (Chapter 8.4 & 8.6)
 */

import { processText } from './tokenizer.js';

/**
 * Compute normalized TF-IDF vector for an indexed document.
 * @param {object} doc
 * @param {import('./invertedIndex.js').InvertedIndex} index
 */
function docTfIdfVector(doc, index) {
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
}

function cosineMap(vecA, vecB) {
  let dot = 0;
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  for (const [k, v] of small.entries()) {
    const ov = large.get(k);
    if (ov) dot += v * ov;
  }
  return dot;
}

/**
 * Infer missing tags for a document by selecting top-K TF-IDF terms (Chapter 11.2 S8).
 * @param {object} doc
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {number} [limit=5]
 */
export function inferMissingTags(doc, index, limit = 5) {
  const text = `${doc.title ?? ''} ${doc.summary ?? ''} ${doc.content ?? doc.body ?? ''}`;
  const proc = processText(text);
  const existingStems = new Set(
    (doc.tags ?? []).flatMap((t) => processText(t).terms),
  );
  const nDocs = Math.max(1, index.docCount);
  const candidates = [];

  for (const [stem, tf] of proc.termFreqs.entries()) {
    if (existingStems.has(stem) || stem.length < 3 || /^\d+$/.test(stem)) continue;
    const df = index.postings.get(stem)?.length ?? 1;
    // Skip overly common terms (> 50% of corpus)
    if (nDocs >= 5 && df / nDocs > 0.5) continue;
    const idf = Math.log(1 + nDocs / df);
    const tfidfWeight = (1 + Math.log(tf)) * idf;
    const rawCandidates = index.stemToRaw.get(stem) ?? [];
    const bestCorpusForm = rawCandidates.reduce((best, cand) => {
      if (!best) return cand;
      const candFreq = index.rawVocabFreq.get(cand) ?? 0;
      const bestFreq = index.rawVocabFreq.get(best) ?? 0;
      return candFreq > bestFreq ? cand : best;
    }, null);
    const rawForm = bestCorpusForm
      ?? proc.keptRaw.find((w) => processText(w).terms[0] === stem)
      ?? stem;
    const label = rawForm.charAt(0).toUpperCase() + rawForm.slice(1);
    candidates.push({
      tag: label,
      stem,
      score: Number(tfidfWeight.toFixed(4)),
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/**
 * Build a weighted tag cloud sorted alphabetically (Chapter 11.2 S9).
 * @param {Array<{ id: number, slug: string, name: string, article_count: number | string }>} tags
 * @param {number} [limit=40]
 */
export function buildTagCloud(tags, limit = 40) {
  const top = [...tags]
    .map((t) => ({
      id: Number(t.id),
      slug: t.slug,
      name: t.name,
      count: Number(t.article_count ?? t.articleCount ?? 0),
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  if (!top.length) return [];
  const counts = top.map((t) => t.count);
  const minC = Math.min(...counts);
  const maxC = Math.max(...counts);
  const span = Math.max(1, maxC - minC);

  return top
    .map((t) => ({
      ...t,
      weight: minC === maxC ? 3 : 1 + Math.round(((t.count - minC) / span) * 4), // tier 1..5
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find related articles using TF-IDF cosine similarity + category/tag overlap (Chapter 10 & 11).
 * @param {number} docId
 * @param {import('./invertedIndex.js').InvertedIndex} index
 * @param {number} [limit=4]
 */
export function findRelatedArticles(docId, index, limit = 4) {
  const target = index.documents.get(Number(docId));
  if (!target) return [];

  const targetVec = docTfIdfVector(target, index);
  const targetTags = new Set((target.tags ?? []).map((t) => t.toLowerCase()));
  const scored = [];

  for (const doc of index.documents.values()) {
    if (doc.id === target.id) continue;
    const vec = docTfIdfVector(doc, index);
    const cos = cosineMap(targetVec, vec);
    const docTags = (doc.tags ?? []).map((t) => t.toLowerCase());
    const sharedTags = docTags.filter((t) => targetTags.has(t)).length;
    const tagBonus = targetTags.size > 0 ? (sharedTags / Math.max(targetTags.size, docTags.length)) * 0.25 : 0;
    const catBonus = doc.category_slug && doc.category_slug === target.category_slug ? 0.1 : 0;
    const score = cos + tagBonus + catBonus;
    if (score > 0.02) {
      scored.push({ doc, score, similarity: Number(cos.toFixed(4)), sharedTags });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || b.doc.id - a.doc.id)
    .slice(0, limit);
}

/**
 * Social & Collaborative Filtering Recommendations (Chapter 11.4 S18-21):
 * 1. Nearest-Neighbor Collaborative Filtering on user-article ratings (cosine similarity).
 * 2. User tag profile + liked/rated article content similarity.
 * @param {object} opts
 * @param {number | null} opts.userId
 * @param {string[]} [opts.userTagNames]
 * @param {Array<{ user_id: number, document_id: number, score: number }>} [opts.allRatings]
 * @param {number[]} [opts.likedDocIds]
 * @param {import('./invertedIndex.js').InvertedIndex} opts.index
 * @param {number} [opts.limit=6]
 */
export function recommendArticles({
  userId = null,
  userTagNames = [],
  allRatings = [],
  likedDocIds = [],
  index,
  limit = 6,
}) {
  if (index.docCount === 0) return [];

  // Build user -> Map<docId, score>
  const userRatings = new Map();
  for (const r of allRatings) {
    const uid = Number(r.user_id);
    const did = Number(r.document_id);
    let m = userRatings.get(uid);
    if (!m) {
      m = new Map();
      userRatings.set(uid, m);
    }
    m.set(did, Number(r.score));
  }

  const seenDocIds = new Set(likedDocIds.map(Number));
  const myRatings = userId != null ? (userRatings.get(Number(userId)) ?? new Map()) : new Map();
  for (const did of myRatings.keys()) seenDocIds.add(did);

  // Collaborative Filtering prediction via K-Nearest Neighbors (cosine similarity of centered ratings)
  const cfPredictions = new Map();
  if (userId != null && myRatings.size > 0) {
    const myAvg = [...myRatings.values()].reduce((a, b) => a + b, 0) / myRatings.size;
    const neighbors = [];

    for (const [otherId, otherMap] of userRatings.entries()) {
      if (otherId === Number(userId)) continue;
      let dot = 0;
      let normA = 0;
      let normB = 0;
      let overlap = 0;
      const otherAvg = [...otherMap.values()].reduce((a, b) => a + b, 0) / otherMap.size;
      for (const [did, score] of myRatings.entries()) {
        const oScore = otherMap.get(did);
        if (oScore !== undefined) {
          overlap += 1;
          const da = score - myAvg;
          const db = oScore - otherAvg;
          dot += da * db;
          normA += da * da;
          normB += db * db;
        }
      }
      if (overlap > 0) {
        const sim = (normA > 0 && normB > 0) ? dot / Math.sqrt(normA * normB) : (overlap >= 1 ? 0.5 : 0);
        if (sim > 0) neighbors.push({ otherMap, otherAvg, sim });
      }
    }

    neighbors.sort((a, b) => b.sim - a.sim);
    const topNeighbors = neighbors.slice(0, 10);
    if (topNeighbors.length > 0) {
      for (const doc of index.documents.values()) {
        if (seenDocIds.has(doc.id)) continue;
        let num = 0;
        let den = 0;
        for (const n of topNeighbors) {
          const r = n.otherMap.get(doc.id);
          if (r !== undefined) {
            num += n.sim * (r - n.otherAvg);
            den += Math.abs(n.sim);
          }
        }
        if (den > 0) {
          cfPredictions.set(doc.id, Math.max(1, Math.min(5, myAvg + num / den)));
        }
      }
    }
  }

  // Content profile from user_tags + liked/high-rated docs
  const profileTerms = new Set(userTagNames.flatMap((t) => processText(t).terms));
  const userTagLower = new Set(userTagNames.map((t) => t.toLowerCase()));
  for (const did of seenDocIds) {
    const d = index.documents.get(did);
    if (!d) continue;
    const rating = myRatings.get(did);
    if (rating !== undefined && rating < 3) continue;
    for (const [term, tf] of d.termTf.entries()) {
      if (tf >= 2) profileTerms.add(term);
    }
  }

  const scored = [];
  for (const doc of index.documents.values()) {
    if (seenDocIds.has(doc.id)) continue;

    // 1. Tag interest match
    const docTagMatches = (doc.tags ?? []).filter((t) => userTagLower.has(t.toLowerCase())).length;
    // 2. Content profile term overlap weighted by IDF
    let contentMatch = 0;
    for (const term of profileTerms) {
      if (doc.termTf.has(term)) contentMatch += index.idf(term);
    }
    const normContent = profileTerms.size > 0 ? Math.min(1, contentMatch / Math.max(3, profileTerms.size * 1.5)) : 0;
    // 3. Collaborative filtering predicted rating
    const cfPred = cfPredictions.get(doc.id);
    const cfNorm = cfPred != null ? cfPred / 5 : 0;
    // 4. Community popularity baseline
    const popNorm = Math.min(1, Math.log1p(Number(doc.views_count ?? 0)) / 8);

    const hasPersonalSignal = profileTerms.size > 0 || cfPred != null;
    const score = hasPersonalSignal
      ? 0.40 * normContent + 0.25 * Math.min(1, docTagMatches * 0.5) + 0.25 * cfNorm + 0.10 * popNorm
      : 0.70 * popNorm + 0.30 * (doc.rating_avg != null ? Number(doc.rating_avg) / 5 : 0.6);

    const reason = cfPred != null
      ? `Collaborative Filtering (predicted ${cfPred.toFixed(1)}/5)`
      : docTagMatches > 0
        ? `Matches your topic tag${docTagMatches > 1 ? 's' : ''}`
        : normContent > 0.1
          ? 'Matches your reading interests'
          : 'Popular across the portal';

    scored.push({ doc, score: Number(score.toFixed(4)), reason });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.doc.id - a.doc.id)
    .slice(0, limit);
}

/**
 * On-Page SEO Audit Analyzer (Chapter 8.4 & 8.6):
 * Evaluates metadata completeness, keyword placement, slug structure, and content depth.
 * @param {object} article
 */
export function analyzeArticleSeo(article) {
  const title = String(article.title ?? '').trim();
  const metaTitle = String(article.meta_title ?? article.metaTitle ?? '').trim();
  const metaDesc = String(article.meta_description ?? article.metaDescription ?? '').trim();
  const summary = String(article.summary ?? '').trim();
  const keywordsRaw = String(article.seo_keywords ?? article.seoKeywords ?? '').trim();
  const keywords = keywordsRaw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  const content = String(article.content ?? article.body ?? '').trim();
  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
  const effectiveTitle = metaTitle || title;
  const effectiveDesc = metaDesc || summary;
  const ogImg = String(article.og_image_url ?? article.ogImageUrl ?? '').trim();
  const imageAlt = String(article.image_alt ?? article.imageAlt ?? '').trim();

  const checks = [
    {
      id: 'meta_title',
      label: 'Meta title length (30–65 chars)',
      passed: metaTitle.length >= 30 && metaTitle.length <= 65,
      detail: metaTitle ? `${metaTitle.length} chars` : `Using fallback title (${effectiveTitle.length} chars)`,
      points: metaTitle.length >= 30 && metaTitle.length <= 65 ? 15 : metaTitle ? 8 : 4,
      maxPoints: 15,
    },
    {
      id: 'meta_description',
      label: 'Meta description length (70–160 chars)',
      passed: metaDesc.length >= 70 && metaDesc.length <= 160,
      detail: metaDesc ? `${metaDesc.length} chars` : `Missing custom meta description (summary: ${effectiveDesc.length} chars)`,
      points: metaDesc.length >= 70 && metaDesc.length <= 160 ? 15 : metaDesc ? 8 : 3,
      maxPoints: 15,
    },
    {
      id: 'seo_keywords',
      label: 'Target SEO keywords defined (2+)',
      passed: keywords.length >= 2,
      detail: keywords.length ? `${keywords.length} keyword(s): ${keywords.join(', ')}` : 'No SEO keywords set',
      points: keywords.length >= 2 ? 15 : keywords.length === 1 ? 8 : 0,
      maxPoints: 15,
    },
    {
      id: 'keyword_in_title',
      label: 'Primary keyword appears in title',
      passed: keywords.length > 0 && effectiveTitle.toLowerCase().includes(keywords[0]),
      detail: keywords.length ? `Checking "${keywords[0]}" in title` : 'Define a primary keyword first',
      points: keywords.length > 0 && effectiveTitle.toLowerCase().includes(keywords[0]) ? 15 : 0,
      maxPoints: 15,
    },
    {
      id: 'keyword_in_body',
      label: 'Primary keyword appears in article body',
      passed: keywords.length > 0 && content.toLowerCase().includes(keywords[0]),
      detail: keywords.length ? `Checking "${keywords[0]}" in body` : 'Define a primary keyword first',
      points: keywords.length > 0 && content.toLowerCase().includes(keywords[0]) ? 10 : 0,
      maxPoints: 10,
    },
    {
      id: 'og_image',
      label: 'HTTPS OpenGraph image + descriptive alt text',
      passed: /^https:\/\/\S+$/.test(ogImg) && imageAlt.length >= 5,
      detail: !ogImg ? 'No OG image URL' : !imageAlt ? 'OG image set, missing alt text' : 'OG image and alt text configured',
      points: /^https:\/\/\S+$/.test(ogImg) ? (imageAlt.length >= 5 ? 15 : 8) : 0,
      maxPoints: 15,
    },
    {
      id: 'content_depth',
      label: 'Content depth (≥ 150 words)',
      passed: wordCount >= 150,
      detail: `${wordCount} words`,
      points: wordCount >= 150 ? 15 : wordCount >= 60 ? 8 : 3,
      maxPoints: 15,
    },
  ];

  const score = checks.reduce((s, c) => s + c.points, 0);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  return { score, grade, wordCount, checks };
}
