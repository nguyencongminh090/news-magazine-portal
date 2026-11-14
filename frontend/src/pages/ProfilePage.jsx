import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAuthedApi } from '../api/useAuthedApi.js';
import { StateView } from '../components/StateView.jsx';
import { Icon } from '../components/Icon.jsx';
import { formatDate } from '../lib/format.js';

export function ProfilePage() {
  const { user, status, refresh } = useAuth();
  const location = useLocation();
  const profile = useAuthedApi(user ? '/api/users/me' : null);

  if (status === 'loading') return <div className="wrap page"><StateView loading /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (profile.loading || profile.error) {
    return (
      <div className="wrap page">
        <StateView loading={profile.loading} error={profile.error} onRetry={profile.reload} />
      </div>
    );
  }

  return <ProfileForm data={profile.data} onSaved={() => { profile.reload(); refresh(); }} />;
}

function ProfileForm({ data, onSaved }) {
  const { request } = useAuth();
  const p = data.user;
  const stats = data.stats ?? { commentsCount: 0, ratingsCount: 0, likesCount: 0 };
  const [displayName, setDisplayName] = useState(p.displayName ?? '');
  const [bio, setBio] = useState(p.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(p.avatarUrl ?? '');
  const [tagsText, setTagsText] = useState((data.tags ?? []).map((t) => t.name).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDisplayName(p.displayName ?? '');
    setBio(p.bio ?? '');
    setAvatarUrl(p.avatarUrl ?? '');
    setTagsText((data.tags ?? []).map((t) => t.name).join(', '));
  }, [p, data.tags]);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
      await request('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim() || null,
          tags,
        }),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      if (err.status === 422 && err.errors?.length) {
        setError(err.errors.map((e) => `${e.path ? `${e.path}: ` : ''}${e.message}`).join(' '));
      } else {
        setError(err.message || 'Could not update profile.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap page">
      <div className="profile-layout">
        <section className="card box" aria-labelledby="profile-heading">
          <div className="bar">
            <h1 id="profile-heading">Your profile</h1>
            <Link className="btn secondary" to="/account/password">Change password</Link>
          </div>
          <div className="profile-summary">
            {p.avatarUrl ? (
              <img className="profile-avatar" src={p.avatarUrl} alt={`${p.displayName} avatar`} />
            ) : (
              <span className="avatar profile-avatar-fallback" aria-hidden="true">
                {(p.displayName || p.email).slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="muted" style={{ marginBottom: 4 }}>{p.email}</p>
              <p className="meta">
                <span>Roles: {(p.roles ?? []).join(', ')}</span>
                <span>{p.emailVerified ? '✓ Email verified' : 'Email unverified'}</span>
                {p.createdAt && <span>Joined {formatDate(p.createdAt)}</span>}
              </p>
            </div>
          </div>
          <div className="stat-strip" aria-label="Activity summary">
            <div className="stat-pill"><strong>{stats.commentsCount}</strong><span>Comments</span></div>
            <div className="stat-pill"><strong>{stats.ratingsCount}</strong><span>Ratings</span></div>
            <div className="stat-pill"><strong>{stats.likesCount}</strong><span>Likes</span></div>
          </div>

          <form onSubmit={onSubmit} className="admin-form">
            <label htmlFor="p-name">Display name</label>
            <input id="p-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={100} />

            <label htmlFor="p-bio">Short bio</label>
            <textarea id="p-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} placeholder="Tell readers a bit about yourself…" />

            <label htmlFor="p-avatar">Avatar URL <span className="muted">(optional, https:// only)</span></label>
            <input id="p-avatar" type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} maxLength={500} placeholder="https://example.com/avatar.png" />

            <label htmlFor="p-tags">Topic tags <span className="muted">(comma-separated interests, e.g. Climate, Science, Politics)</span></label>
            <input id="p-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Climate, Science" />

            {data.tags?.length > 0 && (
              <div className="tags" style={{ marginTop: 10 }}>
                {data.tags.map((t) => (
                  <Link key={t.id} to={`/search?tag=${encodeURIComponent(t.name)}`}>
                    <Icon name="tag" /> {t.name}
                  </Link>
                ))}
              </div>
            )}

            {error && <p className="error" role="alert">{error}</p>}
            {saved && <p className="hint" role="status">Profile saved.</p>}
            <p style={{ marginTop: 18 }}>
              <button className="btn" type="submit" disabled={busy}>Save profile</button>
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
