/** The single article payload builder: every page/endpoint serialises an article row through this. */
export function toArticlePayload(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? null,
    body: row.body,
    publishedAt: row.published_at ?? null,
  };
}
