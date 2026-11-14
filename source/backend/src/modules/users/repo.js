import { query, withTransaction } from '../../db.js';
import { slugify } from '../adminArticles/slug.js';

export async function getProfile(userId) {
  const [userRes, tagsRes, statsRes] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.display_name, u.bio, u.avatar_url, u.email_verified_at, u.created_at,
              COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = $1
        GROUP BY u.id`,
      [userId],
    ),
    query(
      `SELECT t.id, t.slug, t.name
         FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
        WHERE ut.user_id = $1
        ORDER BY t.name`,
      [userId],
    ),
    query(
      `SELECT (SELECT count(*)::int FROM comments WHERE user_id = $1) AS comments_count,
              (SELECT count(*)::int FROM ratings WHERE user_id = $1) AS ratings_count,
              (SELECT count(*)::int FROM article_likes WHERE user_id = $1) AS likes_count`,
      [userId],
    ),
  ]);
  const u = userRes.rows[0];
  if (!u) return null;
  const s = statsRes.rows[0] ?? {};
  return {
    user: {
      id: Number(u.id),
      email: u.email,
      displayName: u.display_name,
      bio: u.bio ?? '',
      avatarUrl: u.avatar_url ?? null,
      roles: u.roles,
      emailVerified: u.email_verified_at != null,
      createdAt: u.created_at,
    },
    tags: tagsRes.rows.map((t) => ({ id: Number(t.id), slug: t.slug, name: t.name })),
    stats: {
      commentsCount: Number(s.comments_count ?? 0),
      ratingsCount: Number(s.ratings_count ?? 0),
      likesCount: Number(s.likes_count ?? 0),
    },
  };
}

export async function updateProfile(userId, { displayName, bio, avatarUrl, tags }) {
  await withTransaction(async (c) => {
    const sets = [];
    const params = [userId];
    if (displayName !== undefined) { params.push(displayName); sets.push(`display_name = $${params.length}`); }
    if (bio !== undefined) { params.push(bio); sets.push(`bio = $${params.length}`); }
    if (avatarUrl !== undefined) { params.push(avatarUrl); sets.push(`avatar_url = $${params.length}`); }
    if (sets.length > 0) {
      await c.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
    }
    if (tags !== undefined) {
      await c.query('DELETE FROM user_tags WHERE user_id = $1', [userId]);
      for (const raw of tags) {
        const clean = raw.trim().slice(0, 50);
        const slug = slugify(clean, 50);
        if (!clean || !slug) continue;
        const { rows } = await c.query(
          `INSERT INTO tags (name, slug) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
          [clean, slug],
        );
        await c.query('INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, rows[0].id]);
      }
    }
  });
  return getProfile(userId);
}
