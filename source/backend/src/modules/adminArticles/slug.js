/** ASCII-fold a title into a slug matching the documents.slug CHECK (a-z0-9 words joined by single hyphens). */
export function slugify(text, max = 200) {
  const s = text
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
  return s || 'article';
}
