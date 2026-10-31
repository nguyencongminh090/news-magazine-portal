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
  if (row.body !== undefined) payload.body = row.body; // omitted by list queries (no full text per list row)
  return payload;
}
