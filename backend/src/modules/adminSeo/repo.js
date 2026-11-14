import { query } from '../../db.js';

const likePattern = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

export async function listSeoArticles({ page, pageSize, q, missingMeta }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = ['TRUE'];
  if (q) {
    params.push(likePattern(q));
    where.push(`(d.title ILIKE $${params.length} OR d.slug ILIKE $${params.length})`);
  }
  if (missingMeta) {
    where.push(`(d.meta_title IS NULL OR d.meta_title = '' OR d.meta_description IS NULL OR d.meta_description = '' OR d.seo_keywords = '')`);
  }
  const { rows } = await query(
    `SELECT d.id, d.title, d.slug, d.status, d.summary, d.meta_title, d.meta_description,
            d.og_image_url, d.image_alt, d.seo_keywords, d.views_count, d.updated_at,
            c.name AS category_name,
            count(*) OVER () AS total
       FROM documents d JOIN categories c ON c.id = d.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.updated_at DESC, d.id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

export async function updateSeoArticle(id, data) {
  const sets = [];
  const params = [id];
  if (data.metaTitle !== undefined) { params.push(data.metaTitle); sets.push(`meta_title = $${params.length}`); }
  if (data.metaDescription !== undefined) { params.push(data.metaDescription); sets.push(`meta_description = $${params.length}`); }
  if (data.ogImageUrl !== undefined) { params.push(data.ogImageUrl); sets.push(`og_image_url = $${params.length}`); }
  if (data.imageAlt !== undefined) { params.push(data.imageAlt); sets.push(`image_alt = $${params.length}`); }
  if (data.seoKeywords !== undefined) { params.push(data.seoKeywords); sets.push(`seo_keywords = $${params.length}`); }
  if (sets.length === 0) {
    const { rows } = await query(
      `SELECT d.id, d.title, d.slug, d.status, d.summary, d.meta_title, d.meta_description,
              d.og_image_url, d.image_alt, d.seo_keywords, d.views_count, d.updated_at,
              c.name AS category_name
         FROM documents d JOIN categories c ON c.id = d.category_id
        WHERE d.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
  const { rows } = await query(
    `WITH updated AS (
       UPDATE documents SET ${sets.join(', ')}
        WHERE id = $1
       RETURNING id, title, slug, status, summary, meta_title, meta_description,
                 og_image_url, image_alt, seo_keywords, views_count, updated_at, category_id
     )
     SELECT u.id, u.title, u.slug, u.status, u.summary, u.meta_title, u.meta_description,
            u.og_image_url, u.image_alt, u.seo_keywords, u.views_count, u.updated_at,
            c.name AS category_name
       FROM updated u JOIN categories c ON c.id = u.category_id`,
    params,
  );
  return rows[0] ?? null;
}

export async function getAnalytics() {
  const [overviewRes, topArticlesRes, topQueriesRes, topClickedRes, categoryStatsRes, recentClicksRes] = await Promise.all([
    query(
      `SELECT count(*)::int AS total_articles,
              count(*) FILTER (WHERE status = 'published')::int AS published_articles,
              count(*) FILTER (WHERE status = 'draft')::int AS draft_articles,
              count(*) FILTER (WHERE status = 'archived')::int AS archived_articles,
              COALESCE(sum(views_count), 0)::bigint AS total_views,
              (SELECT count(*)::int FROM comments) AS total_comments,
              (SELECT count(*)::int FROM ratings) AS total_ratings,
              (SELECT round(avg(score), 2) FROM ratings) AS avg_rating,
              (SELECT count(*)::int FROM article_likes) AS total_likes,
              (SELECT count(*)::int FROM search_click_log) AS total_search_clicks
         FROM documents`,
    ),
    query(
      `SELECT d.id, d.title, d.slug, d.views_count, c.name AS category_name,
              (SELECT count(*)::int FROM comments cm WHERE cm.document_id = d.id AND cm.status = 'visible') AS comment_count,
              (SELECT round(avg(r.score), 1) FROM ratings r WHERE r.document_id = d.id) AS rating_avg
         FROM documents d JOIN categories c ON c.id = d.category_id
        WHERE d.status = 'published'
        ORDER BY d.views_count DESC, d.id DESC
        LIMIT 10`,
    ),
    query(
      `SELECT lower(trim(query_string)) AS query_string,
              count(*)::int AS clicks,
              count(DISTINCT clicked_doc_id)::int AS unique_docs,
              max(created_at) AS last_clicked_at
         FROM search_click_log
        GROUP BY lower(trim(query_string))
        ORDER BY clicks DESC, last_clicked_at DESC
        LIMIT 15`,
    ),
    query(
      `SELECT d.id, d.title, d.slug, count(s.id)::int AS clicks
         FROM search_click_log s
         JOIN documents d ON d.id = s.clicked_doc_id
        GROUP BY d.id
        ORDER BY clicks DESC, d.id DESC
        LIMIT 10`,
    ),
    query(
      `SELECT c.id, c.slug, c.name,
              count(d.id) FILTER (WHERE d.status = 'published')::int AS article_count,
              COALESCE(sum(d.views_count) FILTER (WHERE d.status = 'published'), 0)::bigint AS total_views
         FROM categories c
         LEFT JOIN documents d ON d.category_id = c.id
        GROUP BY c.id
        ORDER BY total_views DESC, c.name ASC`,
    ),
    query(
      `SELECT s.id, s.query_string, s.created_at,
              d.id AS doc_id, d.slug AS doc_slug, d.title AS doc_title,
              u.display_name AS user_name
         FROM search_click_log s
         JOIN documents d ON d.id = s.clicked_doc_id
         LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 20`,
    ),
  ]);

  const o = overviewRes.rows[0] ?? {};
  return {
    overview: {
      totalArticles: Number(o.total_articles ?? 0),
      publishedArticles: Number(o.published_articles ?? 0),
      draftArticles: Number(o.draft_articles ?? 0),
      archivedArticles: Number(o.archived_articles ?? 0),
      totalViews: Number(o.total_views ?? 0),
      totalComments: Number(o.total_comments ?? 0),
      totalRatings: Number(o.total_ratings ?? 0),
      avgRating: o.avg_rating != null ? Number(o.avg_rating) : null,
      totalLikes: Number(o.total_likes ?? 0),
      totalSearchClicks: Number(o.total_search_clicks ?? 0),
    },
    topArticles: topArticlesRes.rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      slug: r.slug,
      viewsCount: Number(r.views_count),
      categoryName: r.category_name,
      commentCount: Number(r.comment_count ?? 0),
      ratingAvg: r.rating_avg != null ? Number(r.rating_avg) : null,
    })),
    topQueries: topQueriesRes.rows.map((r) => ({
      queryString: r.query_string,
      clicks: Number(r.clicks),
      uniqueDocs: Number(r.unique_docs),
      lastClickedAt: r.last_clicked_at,
    })),
    topClickedArticles: topClickedRes.rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      slug: r.slug,
      clicks: Number(r.clicks),
    })),
    categoryStats: categoryStatsRes.rows.map((r) => ({
      id: Number(r.id),
      slug: r.slug,
      name: r.name,
      articleCount: Number(r.article_count),
      totalViews: Number(r.total_views),
    })),
    recentSearchClicks: recentClicksRes.rows.map((r) => ({
      id: Number(r.id),
      queryString: r.query_string,
      createdAt: r.created_at,
      article: { id: Number(r.doc_id), slug: r.doc_slug, title: r.doc_title },
      userName: r.user_name ?? null,
    })),
  };
}
