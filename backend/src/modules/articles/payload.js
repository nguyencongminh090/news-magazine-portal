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
  if (row.views_count !== undefined) payload.viewsCount = Number(row.views_count ?? 0);
  if (row.og_image_url !== undefined) payload.ogImageUrl = row.og_image_url ?? null;
  if (row.image_alt !== undefined) payload.imageAlt = row.image_alt ?? null;
  if (row.seo_keywords !== undefined) payload.seoKeywords = row.seo_keywords ?? '';
  if (row.my_user_tags !== undefined) payload.myUserTags = row.my_user_tags ?? [];
  if (row.like_count !== undefined) payload.likes = { count: Number(row.like_count ?? 0), likedByMe: Boolean(row.liked_by_me) };
  if (row.rating_count !== undefined) payload.engagement = toEngagementSummary(row); // list + detail share one builder
  if (row.body !== undefined) payload.body = row.body; // omitted by list queries (no full text per list row)
  if (row.search_score != null) payload.searchScore = row.search_score;
  if (row.snippet_segments != null) payload.snippetSegments = row.snippet_segments;
  if (row.matched_terms?.length) payload.matchedTerms = row.matched_terms;
  if (row.score_breakdown !== undefined) payload.scoreBreakdown = row.score_breakdown;
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
