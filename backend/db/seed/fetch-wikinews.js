// One-off importer: pulls recent English Wikinews articles into articles.json (committed, so seeding needs no network).
// Usage: node db/seed/fetch-wikinews.js   (re-run only to refresh the dataset)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = 'https://en.wikinews.org/w/api.php';
const OUT = fileURLToPath(new URL('./articles.json', import.meta.url));
const PER_CATEGORY = 13;
const CONCURRENCY = 3;
const MIN_CONTENT_CHARS = 1500;
// Wikinews topic category -> our category name.
const TOPICS = {
  'Politics and conflicts': 'Politics',
  Sports: 'Sports',
  'Science and technology': 'Science & Technology',
  Health: 'Health',
  'Crime and law': 'Crime & Law',
  Environment: 'Environment',
  'Disasters and accidents': 'Disasters',
  Weather: 'Weather',
};
const IGNORED_TAG = /^(published|archived|.*(articles|news|stubs).*|\d{4}.*|.*\d{4}$)/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(params, attempt = 0) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  await sleep(150); // stay polite: Wikimedia rate-limits bursts
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'news-portal-seed/0.1 (student project)' } });
  if (res.status === 429 && attempt < 6) {
    await sleep((Number(res.headers.get('retry-after')) || 5) * 1000 * (attempt + 1));
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Drop wiki leftovers from the plain-text extract: trailing Sources/Related sections, blank runs. */
export function cleanContent(text) {
  const cut = text.search(/\n==+\s*(Sources?|Related news|External links|References|Related articles)\s*==+/i);
  return (cut === -1 ? text : text.slice(0, cut))
    .replace(/==+\s*([^=\n]+?)\s*==+/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function listTitles(topic) {
  const titles = [];
  let cont = {};
  while (titles.length < PER_CATEGORY * 4) {
    const data = await api({
      action: 'query', list: 'categorymembers', cmtitle: `Category:${topic}`, cmtype: 'page',
      cmnamespace: '0', cmsort: 'timestamp', cmdir: 'desc', cmlimit: '50', ...cont,
    });
    titles.push(...data.query.categorymembers.map((m) => m.title));
    if (!data.continue) break;
    cont = data.continue;
  }
  return titles;
}

const anonymousUser = (name) => /^(\d{1,3}\.){3}\d{1,3}$/.test(name) || /^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}$/i.test(name);

async function fetchArticle(title, category) {
  const body = await api({
    action: 'query', titles: title, prop: 'extracts|revisions|categories', explaintext: '1',
    rvprop: 'user|timestamp', rvlimit: '1', rvdir: 'newer', clshow: '!hidden', cllimit: '50',
  });
  const info = body.query.pages[0];
  if (info.missing || !info.extract) return null;
  const content = cleanContent(info.extract);
  if (content.length < MIN_CONTENT_CHARS) return null;
  const first = info.revisions?.[0];
  if (!first) return null;
  const tags = (info.categories ?? [])
    .map((c) => c.title.replace(/^Category:/, ''))
    .filter((name) => !IGNORED_TAG.test(name) && !(name in TOPICS));
  return {
    title,
    category,
    // Anonymous edits are credited by IP address; don't publish those.
    author: anonymousUser(first.user) ? 'Anonymous Wikinews contributor' : first.user,
    publishedAt: first.timestamp,
    tags: tags.slice(0, 4),
    content,
    sourceUrl: `https://en.wikinews.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
  };
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return [];
  }
}

// Resumable: articles.json is rewritten after every article and already-saved titles are skipped.
async function main() {
  const articles = await loadExisting();
  const seen = new Set(articles.map((a) => a.title));
  let saving = Promise.resolve(); // serialise whole-file rewrites from parallel workers
  const save = () => (saving = saving.then(() => writeFile(OUT, `${JSON.stringify(articles, null, 2)}\n`)));

  const run = async ([topic, category]) => {
    let got = articles.filter((a) => a.category === category).length;
    if (got >= PER_CATEGORY) return;
    for (const title of await listTitles(topic)) {
      if (got >= PER_CATEGORY) break;
      if (seen.has(title)) continue;
      seen.add(title); // also remembers rejects so a retry loop never refetches them
      const article = await fetchArticle(title, category);
      if (!article) continue;
      articles.push(article);
      got += 1;
      await save();
      console.log(`[${articles.length}] ${category} (${got}/${PER_CATEGORY}): ${title}`);
    }
  };
  const queue = Object.entries(TOPICS);
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) await run(entry);
  }));
  console.log(`done: ${articles.length} articles -> ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
