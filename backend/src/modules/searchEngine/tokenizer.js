/**
 * Chapter 4 (Processing Text) & Chapter 3.7 (Near-Duplicate Fingerprints).
 * Implements tokenization, stopword removal, Martin Porter's stemming algorithm,
 * bigrams, Zipf's & Heap's text statistics, lightweight entity extraction,
 * and k-shingle Jaccard fingerprinting.
 */

export const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves',
]);

const STEP2_LIST = {
  ational: 'ate',
  tional: 'tion',
  enci: 'ence',
  anci: 'ance',
  izer: 'ize',
  bli: 'ble',
  alli: 'al',
  entli: 'ent',
  eli: 'e',
  ousli: 'ous',
  ization: 'ize',
  ation: 'ate',
  ator: 'ate',
  alism: 'al',
  iveness: 'ive',
  fulness: 'ful',
  ousness: 'ous',
  aliti: 'al',
  iviti: 'ive',
  biliti: 'ble',
  logi: 'log',
};

const STEP3_LIST = {
  icate: 'ic',
  ative: '',
  alize: 'al',
  iciti: 'ic',
  ical: 'ic',
  ful: '',
  ness: '',
};

const C = '[^aeiou]';
const V = '[aeiouy]';
const CS = `${C}[^aeiouy]*`;
const VS = `${V}[aeiou]*`;
const M_GT_0 = new RegExp(`^(${CS})?${VS}${CS}`);
const M_EQ_1 = new RegExp(`^(${CS})?${VS}${CS}(${VS})?$`);
const M_GT_1 = new RegExp(`^(${CS})?${VS}${CS}${VS}${CS}`);
const HAS_VOWEL = new RegExp(`^(${CS})?${V}`);
const ENDS_CVC = new RegExp(`^${CS}${V}[^aeiouwxy]$`);

/**
 * Standard Porter Stemmer for English index terms (Chapter 4.3).
 * Normalizes morphological variants (e.g., "elections"/"elected" -> "elect")
 * so queries match inflected document terms without dictionary bloat.
 * @param {string} raw
 * @returns {string}
 */
export function porterStem(raw) {
  let w = String(raw || '').toLowerCase();
  if (w.length < 3 || !/^[a-z]+$/.test(w)) return w;

  const firstCh = w[0];
  if (firstCh === 'y') {
    w = `Y${w.slice(1)}`;
  }

  // Step 1a: plurals
  let re = /^(.+?)(ss|i)es$/;
  let re2 = /^(.+?)([^s])s$/;
  if (re.test(w)) {
    w = w.replace(re, '$1$2');
  } else if (re2.test(w)) {
    w = w.replace(re2, '$1$2');
  }

  // Step 1b: -eed, -ed, -ing
  re = /^(.+?)eed$/;
  re2 = /^(.+?)(ed|ing)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (M_GT_0.test(fp[1])) {
      w = w.slice(0, -1);
    }
  } else if (re2.test(w)) {
    const fp = re2.exec(w);
    const stem = fp[1];
    if (HAS_VOWEL.test(stem)) {
      w = stem;
      if (/(at|bl|iz)$/.test(w)) {
        w += 'e';
      } else if (/([^aeiouylsz])\1$/.test(w)) {
        w = w.slice(0, -1);
      } else if (ENDS_CVC.test(w)) {
        w += 'e';
      }
    }
  }

  // Step 1c: -y -> -i
  re = /^(.+?)y$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (HAS_VOWEL.test(fp[1])) {
      w = `${fp[1]}i`;
    }
  }

  // Step 2
  re = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (M_GT_0.test(fp[1])) {
      w = fp[1] + STEP2_LIST[fp[2]];
    }
  }

  // Step 3
  re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (M_GT_0.test(fp[1])) {
      w = fp[1] + STEP3_LIST[fp[2]];
    }
  }

  // Step 4
  re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
  re2 = /^(.+?)(s|t)(ion)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (M_GT_1.test(fp[1])) {
      w = fp[1];
    }
  } else if (re2.test(w)) {
    const fp = re2.exec(w);
    const stem = fp[1] + fp[2];
    if (M_GT_1.test(stem)) {
      w = stem;
    }
  }

  // Step 5a
  re = /^(.+?)e$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    const stem = fp[1];
    if (M_GT_1.test(stem) || (M_EQ_1.test(stem) && !ENDS_CVC.test(stem))) {
      w = stem;
    }
  }

  // Step 5b
  if (/ll$/.test(w) && M_GT_1.test(w)) {
    w = w.slice(0, -1);
  }

  if (firstCh === 'y') {
    w = `y${w.slice(1)}`;
  }

  return w;
}

/**
 * Strip HTML/XML markup and extract word tokens with character offsets.
 * Preserves positions so phrase/proximity matching and snippet highlighting stay aligned.
 * @param {string} text
 * @returns {Array<{ raw: string, lower: string, start: number, end: number, position: number }>}
 */
export function tokenizeRaw(text) {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ');
  const tokens = [];
  const re = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g;
  let m;
  let position = 0;
  while ((m = re.exec(clean)) !== null) {
    let raw = m[0];
    let lower = raw.toLowerCase();
    // Strip possessive 's for cleaner indexing (e.g., "Trump's" -> "trump")
    if (lower.endsWith("'s") && lower.length > 2) {
      lower = lower.slice(0, -2);
      raw = raw.slice(0, -2);
    } else if (lower.includes("'")) {
      lower = lower.replace(/'/g, '');
    }
    if (!lower) continue;
    tokens.push({
      raw,
      lower,
      start: m.index,
      end: m.index + m[0].length,
      position,
    });
    position += 1;
  }
  return tokens;
}

/**
 * Full Chapter 4 text transformation pipeline: Tokenize -> Stop -> Stem -> N-grams.
 * @param {string} text
 * @param {{ removeStopwords?: boolean, stem?: boolean, minLength?: number }} [opts]
 */
export function processText(text, { removeStopwords = true, stem = true, minLength = 2 } = {}) {
  const rawTokens = tokenizeRaw(text);
  const terms = [];
  const termPositions = new Map();
  const termFreqs = new Map();
  const keptRaw = [];

  for (const tok of rawTokens) {
    const word = tok.lower;
    if (word.length < minLength && !/^\d+$/.test(word)) continue;
    if (removeStopwords && STOPWORDS.has(word)) continue;

    const term = stem ? porterStem(word) : word;
    if (!term) continue;

    keptRaw.push(word);
    terms.push(term);
    termFreqs.set(term, (termFreqs.get(term) ?? 0) + 1);
    let posList = termPositions.get(term);
    if (!posList) {
      posList = [];
      termPositions.set(term, posList);
    }
    posList.push(tok.position);
  }

  const bigrams = [];
  for (let i = 0; i < terms.length - 1; i += 1) {
    bigrams.push(`${terms[i]} ${terms[i + 1]}`);
  }

  return {
    rawTokens,
    keptRaw,
    terms,
    termPositions,
    termFreqs,
    bigrams,
    totalRawTokens: rawTokens.length,
    totalTerms: terms.length,
  };
}

/**
 * Compute Zipf's Law rank-frequency statistics: r * f ≈ C (Chapter 4.2).
 * @param {Map<string, number>} termFreqMap
 * @param {number} [topK=25]
 */
export function computeZipfStats(termFreqMap, topK = 25) {
  const entries = [...termFreqMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const totalTokens = entries.reduce((sum, [, f]) => sum + f, 0);
  const top = entries.slice(0, topK);
  const cEstimate = top.length ? top[0][1] : 0;

  return {
    totalTokens,
    vocabularySize: entries.length,
    cConstant: cEstimate,
    topTerms: top.map(([term, frequency], idx) => {
      const rank = idx + 1;
      return {
        rank,
        term,
        frequency,
        rankTimesFreq: rank * frequency,
        probability: totalTokens > 0 ? Number((frequency / totalTokens).toFixed(5)) : 0,
        zipfPredicted: Number((cEstimate / rank).toFixed(2)),
      };
    }),
  };
}

/**
 * Compute Heap's Law vocabulary growth curve V = K * N^beta (Chapter 4.2).
 * Samples cumulative (N, V) as documents are traversed and fits K and beta via log-log OLS.
 * @param {Array<{ terms: string[] }>} docTermLists
 */
export function computeHeapsLaw(docTermLists) {
  const seen = new Set();
  let totalN = 0;
  const points = [];
  const step = Math.max(1, Math.floor(docTermLists.length / 15));

  for (let i = 0; i < docTermLists.length; i += 1) {
    for (const term of docTermLists[i]) {
      totalN += 1;
      seen.add(term);
    }
    if ((i + 1) % step === 0 || i === docTermLists.length - 1) {
      points.push({ docs: i + 1, tokensN: totalN, vocabularyV: seen.size });
    }
  }

  // Log-log linear regression: ln(V) = ln(K) + beta * ln(N)
  const valid = points.filter((p) => p.tokensN > 1 && p.vocabularyV > 1);
  let k = 0;
  let beta = 0;
  if (valid.length >= 2) {
    const xs = valid.map((p) => Math.log(p.tokensN));
    const ys = valid.map((p) => Math.log(p.vocabularyV));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i += 1) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    beta = den > 0 ? num / den : 0.5;
    k = Math.exp(my - beta * mx);
  }

  return {
    totalTokensN: totalN,
    vocabularyV: seen.size,
    fittedK: Number(k.toFixed(3)),
    fittedBeta: Number(beta.toFixed(3)),
    points: points.map((p) => ({
      ...p,
      heapsPredicted: k > 0 ? Math.round(k * (p.tokensN ** beta)) : p.vocabularyV,
    })),
  };
}

/**
 * Lightweight Rule-Based Named Entity Extraction (Chapter 4.6):
 * extracts capitalized proper noun sequences and year/date mentions from English news prose.
 * @param {string} text
 * @param {number} [limit=12]
 */
export function extractEntities(text, limit = 12) {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ');
  const counts = new Map();
  const re = /\b([A-Z][a-z]{2,}(?:\s+(?:of|the|and|for|in)?\s*[A-Z][a-z]{2,}){0,3})\b/g;
  const ignore = new Set(['The', 'This', 'That', 'These', 'Those', 'However', 'Meanwhile', 'According', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
  let m;
  while ((m = re.exec(clean)) !== null) {
    const entity = m[1].trim();
    if (ignore.has(entity)) continue;
    counts.set(entity, (counts.get(entity) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Build k-word shingle set for near-duplicate document detection (Chapter 3.7).
 * @param {string} text
 * @param {number} [k=3]
 * @returns {Set<string>}
 */
export function shingleFingerprint(text, k = 3) {
  const words = tokenizeRaw(text).map((t) => t.lower);
  const shingles = new Set();
  if (words.length < k) {
    if (words.length > 0) shingles.add(words.join(' '));
    return shingles;
  }
  for (let i = 0; i <= words.length - k; i += 1) {
    shingles.add(words.slice(i, i + k).join(' '));
  }
  return shingles;
}

/**
 * Jaccard similarity |A ∩ B| / |A ∪ B| for shingle sets (Chapter 3.7).
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number}
 */
export function jaccardSimilarity(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const item of small) {
    if (large.has(item)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}
