import { toEngagementSummary } from '../engagement/summary.js';

/** The single article payload builder: every page/endpoint serialises an article row through this. */
export function toArticlePayload(row) {
  const payload = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? null,
    publishedAt: row.published_at ?? null,
    authorName: row.author_name ?? null,
    category: row.category_slug ? { slug: row.category_slug, name: row.category_name } : null,
    tags: row.tags ?? [],
  };
  if (row.rating_count !== undefined) payload.engagement = toEngagementSummary(row); // list + detail share one builder
  if (row.body !== undefined) payload.body = row.body; // omitted by list queries (no full text per list row)
  return payload;
}

/** Staff superset of the public payload (same builder underneath, rule 7): adds workflow + audit fields. */
export function toAdminArticlePayload(row) {
  return {
    ...toArticlePayload(row),
    status: row.status,
    viewsCount: Number(row.views_count ?? 0),
    updatedAt: row.updated_at,
  };
}
