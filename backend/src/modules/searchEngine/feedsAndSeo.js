import { Router } from 'express';
import { query } from '../../db.js';
import { escapeHtml } from '../articles/seo.js';

/**
 * Chapter 3.2 (Sitemaps), Chapter 3.4 (RSS Document Feeds), Chapter 8.6 (Technical SEO):
 * Provides /robots.txt, /sitemap.xml, and /api/feed.xml for crawlers and feed subscribers.
 */
export function feedsAndSeoRouter({
  baseUrl = 'http://localhost:5173',
  loadFeedDocs = async () => {
    const [docsRes, catsRes] = await Promise.all([
      query(
        `SELECT d.slug, d.title, d.summary, d.published_at, d.updated_at, d.author_name, c.name AS category_name
           FROM documents d JOIN categories c ON c.id = d.category_id
          WHERE d.status = 'published'
          ORDER BY d.published_at DESC
          LIMIT 200`,
      ),
      query(`SELECT slug FROM categories ORDER BY slug`),
    ]);
    return { docs: docsRes.rows, categories: catsRes.rows };
  },
} = {}) {
  const router = Router();
  const origin = String(baseUrl || 'http://localhost:5173').replace(/\/+$/, '');

  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/admin/\nSitemap: ${origin}/sitemap.xml\n`,
    );
  });

  router.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const { docs, categories } = await loadFeedDocs();
      const urls = [
        `<url><loc>${escapeHtml(origin)}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
        `<url><loc>${escapeHtml(origin)}/search</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
        ...categories.map(
          (c) => `<url><loc>${escapeHtml(`${origin}/category/${c.slug}`)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,
        ),
        ...docs.map((d) => {
          const lastmod = d.updated_at || d.published_at;
          const lm = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : '';
          return `<url><loc>${escapeHtml(`${origin}/articles/${d.slug}`)}</loc>${lm}<changefreq>weekly</changefreq><priority>0.9</priority></url>`;
        }),
      ];
      res.type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`,
      );
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/feed.xml', async (_req, res, next) => {
    try {
      const { docs } = await loadFeedDocs();
      const items = docs.slice(0, 30).map((d) => {
        const link = `${origin}/articles/${d.slug}`;
        const pubDate = d.published_at ? new Date(d.published_at).toUTCString() : new Date().toUTCString();
        return `    <item>
      <title>${escapeHtml(d.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${escapeHtml(pubDate)}</pubDate>
      <category>${escapeHtml(d.category_name ?? '')}</category>
      <description>${escapeHtml(d.summary ?? '')}</description>
    </item>`;
      });
      res.type('application/rss+xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>News Portal Feed</title>
    <link>${escapeHtml(origin)}</link>
    <description>Latest published articles from News &amp; Digital Magazine Portal</description>
${items.join('\n')}
  </channel>
</rss>`,
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
