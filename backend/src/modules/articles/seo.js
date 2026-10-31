export const SEO_MARKER = '<!--seo-meta-->';
const TITLE_MAX = 70;
const DESC_MAX = 320;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Context: HTML text and double-quoted attribute values. */
export const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

const clip = (s, max) => (s.length > max ? s.slice(0, max) : s);
const isHttps = (u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u);

/** Build the <head> fragment for one article row. baseUrl has no trailing slash. */
export function buildMetaTags(row, baseUrl) {
  const title = clip((row.meta_title || row.title || '').trim(), TITLE_MAX);
  const description = clip((row.meta_description || row.summary || '').trim(), DESC_MAX);
  const url = `${baseUrl}/articles/${row.slug}`;
  const tags = [`<title>${escapeHtml(title)}</title>`];
  const meta = (attr, name, content) => tags.push(`<meta ${attr}="${name}" content="${escapeHtml(content)}" />`);
  if (description) meta('name', 'description', description);
  meta('property', 'og:type', 'article');
  meta('property', 'og:title', title);
  if (description) meta('property', 'og:description', description);
  meta('property', 'og:url', url);
  if (isHttps(row.og_image_url)) meta('property', 'og:image', row.og_image_url);
  tags.push(`<link rel="canonical" href="${escapeHtml(url)}" />`);
  return tags.join('\n    ');
}

/** Replace the marker (and the shell's static <title> when tags carry one). Function replacers: no `$` expansion. */
export function injectMeta(shell, tags) {
  const base = tags.includes('<title>') ? shell.replace(/<title>[\s\S]*?<\/title>\s*/, () => '') : shell;
  return base.replace(SEO_MARKER, () => tags);
}

export const stripMarker = (shell) => shell.replace(SEO_MARKER, () => '');
