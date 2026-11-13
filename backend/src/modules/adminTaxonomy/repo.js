import { query } from '../../db.js';
import { HttpError } from '../../http/errors.js';

function strictSlug(text, max) {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

export async function listCategories() {
  const { rows } = await query(
    `SELECT c.id, c.name, c.slug, count(d.id)::int AS article_count
       FROM categories c
       LEFT JOIN documents d ON d.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name`,
  );
  return rows;
}

export async function createCategory({ name, slug }) {
  const finalSlug = slug || strictSlug(name, 100);
  if (!finalSlug) {
    throw new HttpError(422, 'Validation failed', { errors: [{ in: 'body', path: 'name', message: 'Category name must contain letters or numbers' }] });
  }
  const { rows } = await query(
    'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id, name, slug',
    [name, finalSlug],
  );
  return { ...rows[0], article_count: 0 };
}

export async function updateCategory(id, { name, slug }) {
  const fields = [];
  const params = [id];
  if (name !== undefined) { params.push(name); fields.push(`name = $${params.length}`); }
  if (slug !== undefined) { params.push(slug); fields.push(`slug = $${params.length}`); }
  if (!fields.length) {
    const { rows } = await query('SELECT id, name, slug FROM categories WHERE id = $1', [id]);
    return rows[0] ?? null;
  }
  const { rows } = await query(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = $1 RETURNING id, name, slug`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteCategory(id) {
  try {
    const { rowCount } = await query('DELETE FROM categories WHERE id = $1', [id]);
    return rowCount > 0;
  } catch (err) {
    if (err?.code === '23503') {
      throw new HttpError(409, 'Conflict', { detail: 'Category still has articles assigned; reassign them first' });
    }
    throw err;
  }
}

export async function listTags() {
  const { rows } = await query(
    `SELECT t.id, t.name, t.slug, count(dt.document_id)::int AS article_count
       FROM tags t
       LEFT JOIN document_tags dt ON dt.tag_id = t.id
      GROUP BY t.id
      ORDER BY article_count DESC, t.name ASC`,
  );
  return rows;
}

export async function createTag({ name, slug }) {
  const finalSlug = slug || strictSlug(name, 50);
  if (!finalSlug) {
    throw new HttpError(422, 'Validation failed', { errors: [{ in: 'body', path: 'name', message: 'Tag name must contain letters or numbers' }] });
  }
  const { rows } = await query(
    'INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id, name, slug',
    [name, finalSlug],
  );
  return { ...rows[0], article_count: 0 };
}

export async function updateTag(id, { name, slug }) {
  const fields = [];
  const params = [id];
  if (name !== undefined) { params.push(name); fields.push(`name = $${params.length}`); }
  if (slug !== undefined) { params.push(slug); fields.push(`slug = $${params.length}`); }
  if (!fields.length) {
    const { rows } = await query('SELECT id, name, slug FROM tags WHERE id = $1', [id]);
    return rows[0] ?? null;
  }
  const { rows } = await query(
    `UPDATE tags SET ${fields.join(', ')} WHERE id = $1 RETURNING id, name, slug`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteTag(id) {
  const { rowCount } = await query('DELETE FROM tags WHERE id = $1', [id]);
  return rowCount > 0;
}
