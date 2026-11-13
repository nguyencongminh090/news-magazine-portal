/**
 * Chapter 5 (Ranking with Indexes):
 * - Fielded Inverted Index (title, summary, content, tags, seoKeywords) with positions
 * - Delta (d-gap) + Variable-Byte (v-byte) posting list compression
 * - Skip Pointers & skip-assisted conjunctive intersection
 * - Auxiliary vocabulary & collection statistics (df, cf, avgdl, Zipf, Heap)
 * - Near-duplicate detection via 3-shingle Jaccard similarity (Chapter 3.7)
 */

import {
  computeHeapsLaw,
  computeZipfStats,
  jaccardSimilarity,
  porterStem,
  processText,
  shingleFingerprint,
} from './tokenizer.js';

/**
 * Encode an ascending integer sequence (docIds) using d-gaps + V-Byte (7 bits per byte,
 * high bit 1 marks the terminating byte of each integer — Chapter 5.3).
 * @param {number[]} sortedIds
 * @returns {Uint8Array}
 */
export function encodeDeltaVByte(sortedIds) {
  const bytes = [];
  let prev = 0;
  for (const id of sortedIds) {
    let gap = id - prev;
    if (gap < 0) gap = 0;
    prev = id;
    const stack = [];
    do {
      stack.push(gap & 0x7f);
      gap >>>= 7;
    } while (gap > 0);
    // Emit most significant 7-bit chunk first; set continuation bit = 0 on non-last, 1 on last byte.
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      let b = stack[i];
      if (i === 0) b |= 0x80;
      bytes.push(b);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Decode V-Byte delta-encoded bytes back to original sorted integer IDs.
 * @param {Uint8Array} bytes
 * @returns {number[]}
 */
export function decodeDeltaVByte(bytes) {
  const ids = [];
  let prev = 0;
  let current = 0;
  for (const b of bytes) {
    if (b & 0x80) {
      current = (current << 7) | (b & 0x7f);
      prev += current;
      ids.push(prev);
      current = 0;
    } else {
      current = (current << 7) | b;
    }
  }
  return ids;
}

/**
 * Build skip pointers for a posting list at step floor(sqrt(L)) (Chapter 5.3 & 5.7).
 * @param {Array<{ docId: number }>} postings
 * @returns {Map<number, number>} index -> targetIndex
 */
export function buildSkipPointers(postings) {
  const skips = new Map();
  const len = postings.length;
  if (len < 4) return skips;
  const step = Math.floor(Math.sqrt(len));
  if (step < 2) return skips;
  for (let i = 0; i + step < len; i += step) {
    skips.set(i, i + step);
  }
  return skips;
}

/**
 * Conjunctive intersection of two posting lists using skip pointers (Chapter 5.3 / 5.7).
 * @param {Array<{ docId: number }>} listA
 * @param {Array<{ docId: number }>} listB
 * @param {Map<number, number>} [skipsA]
 * @param {Map<number, number>} [skipsB]
 * @returns {Array<{ docId: number, a: object, b: object }>}
 */
export function intersectWithSkips(listA, listB, skipsA = buildSkipPointers(listA), skipsB = buildSkipPointers(listB)) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < listA.length && j < listB.length) {
    const docA = listA[i].docId;
    const docB = listB[j].docId;
    if (docA === docB) {
      out.push({ docId: docA, a: listA[i], b: listB[j] });
      i += 1;
      j += 1;
    } else if (docA < docB) {
      const skipTo = skipsA.get(i);
      if (skipTo !== undefined && listA[skipTo].docId <= docB) {
        let next = skipTo;
        while (skipsA.get(next) !== undefined && listA[skipsA.get(next)].docId <= docB) {
          next = skipsA.get(next);
        }
        i = next;
      } else {
        i += 1;
      }
    } else {
      const skipTo = skipsB.get(j);
      if (skipTo !== undefined && listB[skipTo].docId <= docA) {
        let next = skipTo;
        while (skipsB.get(next) !== undefined && listB[skipsB.get(next)].docId <= docA) {
          next = skipsB.get(next);
        }
        j = next;
      } else {
        j += 1;
      }
    }
  }
  return out;
}

export class InvertedIndex {
  constructor() {
    /** @type {Map<number, object>} */
    this.documents = new Map();
    /** @type {Map<string, Array<{ docId: number, tf: number, fieldTf: object, positions: number[] }>>} */
    this.postings = new Map();
    /** @type {Map<string, Map<number, number>>} */
    this.skipTables = new Map();
    /** @type {Map<string, Uint8Array>} */
    this.compressedPostings = new Map();
    /** @type {Map<string, number>} */
    this.collectionFreqs = new Map();
    /** @type {Map<string, number>} */
    this.rawVocabFreq = new Map();
    /** @type {Map<string, Set<number>>} */
    this.bigramDocs = new Map();
    /** @type {Map<number, Set<string>>} */
    this.shingles = new Map();
    /** @type {Map<string, string[]>} */
    this.stemToRaw = new Map();
    this.totalTokens = 0;
    this.avgDocLength = 0;
    this.avgFieldLengths = { title: 0, summary: 0, content: 0, tags: 0, seoKeywords: 0 };
    this.builtAt = null;
  }

  get docCount() {
    return this.documents.size;
  }

  get vocabSize() {
    return this.postings.size;
  }

  /**
   * Build the complete inverted index from an array of published document rows.
   * @param {Array<object>} docs
   */
  build(docs) {
    this.documents.clear();
    this.postings.clear();
    this.skipTables.clear();
    this.compressedPostings.clear();
    this.collectionFreqs.clear();
    this.rawVocabFreq.clear();
    this.bigramDocs.clear();
    this.shingles.clear();
    this.stemToRaw.clear();
    this.totalTokens = 0;

    const fieldTotals = { title: 0, summary: 0, content: 0, tags: 0, seoKeywords: 0 };
    const sortedDocs = [...docs].sort((a, b) => Number(a.id) - Number(b.id));
    const docTermLists = [];

    for (const rawDoc of sortedDocs) {
      const id = Number(rawDoc.id);
      const titleText = String(rawDoc.title ?? '');
      const summaryText = String(rawDoc.summary ?? '');
      const contentText = String(rawDoc.content ?? rawDoc.body ?? '');
      const tagsList = Array.isArray(rawDoc.tags) ? rawDoc.tags : [];
      const tagsText = tagsList.join(' ');
      const seoKeywordsText = String(rawDoc.seo_keywords ?? rawDoc.seoKeywords ?? '');

      const titleProc = processText(titleText);
      const summaryProc = processText(summaryText);
      const contentProc = processText(contentText);
      const tagsProc = processText(tagsText);
      const seoProc = processText(seoKeywordsText);

      // Combine raw vocabulary counts (un-stemmed, stopword-filtered) for noisy-channel spelling
      for (const proc of [titleProc, summaryProc, contentProc, tagsProc, seoProc]) {
        for (let i = 0; i < proc.keptRaw.length; i += 1) {
          const rw = proc.keptRaw[i];
          const st = proc.terms[i];
          this.rawVocabFreq.set(rw, (this.rawVocabFreq.get(rw) ?? 0) + 1);
          let rawList = this.stemToRaw.get(st);
          if (!rawList) {
            rawList = [];
            this.stemToRaw.set(st, rawList);
          }
          if (!rawList.includes(rw) && rawList.length < 8) rawList.push(rw);
        }
      }

      // Unified per-document term map with field-level TFs and content positions
      const docTerms = new Map();
      const addField = (proc, fieldName) => {
        for (const [term, count] of proc.termFreqs.entries()) {
          let rec = docTerms.get(term);
          if (!rec) {
            rec = {
              tf: 0,
              fieldTf: { title: 0, summary: 0, content: 0, tags: 0, seoKeywords: 0 },
              positions: [],
            };
            docTerms.set(term, rec);
          }
          rec.tf += count;
          rec.fieldTf[fieldName] += count;
        }
      };

      addField(titleProc, 'title');
      addField(summaryProc, 'summary');
      addField(contentProc, 'content');
      addField(tagsProc, 'tags');
      addField(seoProc, 'seoKeywords');

      // Positions in body/title concatenated space for phrase & proximity distance
      const titleOffset = titleProc.totalRawTokens + 10;
      for (const [term, pos] of titleProc.termPositions.entries()) {
        docTerms.get(term).positions.push(...pos);
      }
      for (const [term, pos] of contentProc.termPositions.entries()) {
        docTerms.get(term).positions.push(...pos.map((p) => p + titleOffset));
      }

      // Bigrams across title + summary + content
      for (const bg of [...titleProc.bigrams, ...summaryProc.bigrams, ...contentProc.bigrams]) {
        let set = this.bigramDocs.get(bg);
        if (!set) {
          set = new Set();
          this.bigramDocs.set(bg, set);
        }
        set.add(id);
      }

      const fieldLengths = {
        title: titleProc.totalTerms,
        summary: summaryProc.totalTerms,
        content: contentProc.totalTerms,
        tags: tagsProc.totalTerms,
        seoKeywords: seoProc.totalTerms,
      };
      const docLength = fieldLengths.title + fieldLengths.summary + fieldLengths.content + fieldLengths.tags + fieldLengths.seoKeywords;

      fieldTotals.title += fieldLengths.title;
      fieldTotals.summary += fieldLengths.summary;
      fieldTotals.content += fieldLengths.content;
      fieldTotals.tags += fieldLengths.tags;
      fieldTotals.seoKeywords += fieldLengths.seoKeywords;
      this.totalTokens += docLength;

      // Store document metadata + per-doc TF map (used for VSM cosine / clustering / related)
      const docTermTf = new Map();
      for (const [term, rec] of docTerms.entries()) {
        docTermTf.set(term, rec.tf);
        this.collectionFreqs.set(term, (this.collectionFreqs.get(term) ?? 0) + rec.tf);
        let list = this.postings.get(term);
        if (!list) {
          list = [];
          this.postings.set(term, list);
        }
        list.push({
          docId: id,
          tf: rec.tf,
          fieldTf: rec.fieldTf,
          positions: rec.positions,
        });
      }

      this.documents.set(id, {
        ...rawDoc,
        id,
        tags: tagsList,
        docLength,
        fieldLengths,
        termTf: docTermTf,
      });

      this.shingles.set(id, shingleFingerprint(`${titleText} ${contentText}`, 3));
      docTermLists.push({ terms: [...titleProc.terms, ...summaryProc.terms, ...contentProc.terms] });
    }

    const n = this.documents.size;
    this.avgDocLength = n > 0 ? this.totalTokens / n : 0;
    if (n > 0) {
      for (const k of Object.keys(this.avgFieldLengths)) {
        this.avgFieldLengths[k] = fieldTotals[k] / n;
      }
    }

    // Build skip pointers + delta V-Byte compressed postings for every term
    for (const [term, list] of this.postings.entries()) {
      this.skipTables.set(term, buildSkipPointers(list));
      this.compressedPostings.set(term, encodeDeltaVByte(list.map((p) => p.docId)));
    }

    this._heapsCache = computeHeapsLaw(docTermLists.map((d) => d.terms));
    this.builtAt = new Date().toISOString();
    return this;
  }

  /**
   * Standard non-negative BM25 IDF: ln(1 + (N - df + 0.5) / (df + 0.5)).
   * @param {string} term
   * @returns {number}
   */
  idf(term) {
    const df = this.postings.get(term)?.length ?? 0;
    const N = this.docCount;
    if (N === 0 || df === 0) return 0;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  /**
   * Compute compression & corpus index statistics (Chapter 4.2 & Chapter 5.3).
   */
  getStats() {
    let totalPostings = 0;
    let compressedBytes = 0;
    for (const list of this.postings.values()) {
      totalPostings += list.length;
    }
    for (const buf of this.compressedPostings.values()) {
      compressedBytes += buf.byteLength;
    }
    const rawInt32Bytes = totalPostings * 4;
    const compressionRatio = compressedBytes > 0 ? Number((rawInt32Bytes / compressedBytes).toFixed(2)) : 1;
    const spaceSavingsPct = rawInt32Bytes > 0 ? Number((((rawInt32Bytes - compressedBytes) / rawInt32Bytes) * 100).toFixed(1)) : 0;

    return {
      docCount: this.docCount,
      vocabSize: this.vocabSize,
      rawVocabSize: this.rawVocabFreq.size,
      totalTokens: this.totalTokens,
      totalPostings,
      avgDocLength: Number(this.avgDocLength.toFixed(2)),
      avgFieldLengths: Object.fromEntries(
        Object.entries(this.avgFieldLengths).map(([k, v]) => [k, Number(v.toFixed(2))]),
      ),
      compression: {
        algorithm: 'Delta (d-gap) + Variable-Byte (V-Byte)',
        rawInt32Bytes,
        compressedBytes,
        compressionRatio,
        spaceSavingsPct,
      },
      zipf: computeZipfStats(this.collectionFreqs, 25),
      heaps: this._heapsCache ?? { totalTokensN: 0, vocabularyV: 0, fittedK: 0, fittedBeta: 0, points: [] },
      nearDuplicates: this.findNearDuplicates(0.55),
      builtAt: this.builtAt,
    };
  }

  /**
   * Inspect one term's inverted list, skip pointers, and V-Byte compressed bytes (Chapter 5.2 & 5.3).
   * @param {string} rawTerm
   */
  inspectTerm(rawTerm) {
    const clean = String(rawTerm || '').trim().toLowerCase();
    const stemmed = porterStem(clean);
    const list = this.postings.get(stemmed) ?? [];
    const skips = this.skipTables.get(stemmed) ?? new Map();
    const compressed = this.compressedPostings.get(stemmed) ?? new Uint8Array(0);
    const docIds = list.map((p) => p.docId);
    const deltas = docIds.map((id, i) => (i === 0 ? id : id - docIds[i - 1]));

    return {
      rawTerm: clean,
      stemmedTerm: stemmed,
      df: list.length,
      cf: this.collectionFreqs.get(stemmed) ?? 0,
      idf: Number(this.idf(stemmed).toFixed(4)),
      rawVariants: this.stemToRaw.get(stemmed) ?? [],
      skipCount: skips.size,
      compression: {
        rawBytes: docIds.length * 4,
        vbyteBytes: compressed.byteLength,
        deltas: deltas.slice(0, 20),
        vbyteHex: [...compressed.slice(0, 24)].map((b) => b.toString(16).padStart(2, '0')).join(' '),
      },
      postings: list.slice(0, 25).map((p) => {
        const doc = this.documents.get(p.docId);
        return {
          docId: p.docId,
          slug: doc?.slug ?? null,
          title: doc?.title ?? '',
          tf: p.tf,
          fieldTf: p.fieldTf,
          positions: p.positions.slice(0, 12),
        };
      }),
    };
  }

  /**
   * Detect near-duplicate articles using 3-shingle Jaccard similarity (Chapter 3.7).
   * @param {number} [threshold=0.55]
   */
  findNearDuplicates(threshold = 0.55) {
    const ids = [...this.shingles.keys()];
    const pairs = [];
    for (let i = 0; i < ids.length; i += 1) {
      const aId = ids[i];
      const setA = this.shingles.get(aId);
      if (!setA || setA.size < 5) continue;
      for (let j = i + 1; j < ids.length; j += 1) {
        const bId = ids[j];
        const setB = this.shingles.get(bId);
        if (!setB || setB.size < 5) continue;
        // Quick size bound: Jaccard(A,B) <= min(|A|,|B|)/max(|A|,|B|)
        const minSize = Math.min(setA.size, setB.size);
        const maxSize = Math.max(setA.size, setB.size);
        if (minSize / maxSize < threshold) continue;
        const sim = jaccardSimilarity(setA, setB);
        if (sim >= threshold) {
          const docA = this.documents.get(aId);
          const docB = this.documents.get(bId);
          pairs.push({
            similarity: Number(sim.toFixed(3)),
            docA: { id: aId, slug: docA.slug, title: docA.title },
            docB: { id: bId, slug: docB.slug, title: docB.title },
          });
        }
      }
    }
    return pairs.sort((a, b) => b.similarity - a.similarity).slice(0, 15);
  }
}
