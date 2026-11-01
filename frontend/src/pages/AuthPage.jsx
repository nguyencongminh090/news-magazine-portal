import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const COPY = {
  login: { title: 'Sign in', cta: 'Sign in', autocomplete: 'current-password', alt: ['No account?', '/register', 'Register'] },
  register: { title: 'Register', cta: 'Create account', autocomplete: 'new-password', alt: ['Have an account?', '/login', 'Sign in'] },
};

function messageFor(err) {
  if (err.status === 0) return 'Network error. Check your connection and try again.';
  if (err.status === 429) return 'Too many attempts. Please wait and try again.';
  if (err.status === 422 && err.errors?.length) return err.errors.map((e) => e.message).join(' ');
  return err.message || 'Something went wrong.';
}

export function AuthPage({ mode }) {
  const c = COPY[mode];
  const auth = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await auth.login(f.get('email').toString().trim(), f.get('password').toString());
      else await auth.register(f.get('email').toString().trim(), f.get('displayName').toString().trim(), f.get('password').toString());
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <form className="auth" onSubmit={onSubmit} noValidate>
      <img className="state-art" src="/art/empty.svg" alt="" width="480" height="320" />
      <h1>{c.title}</h1>
      {mode === 'register' && (
        <>
          <label htmlFor="displayName">Display name</label>
          <input id="displayName" name="displayName" type="text" autoComplete="name" maxLength={100} required />
        </>
      )}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete={c.autocomplete} minLength={mode === 'register' ? 8 : undefined} maxLength={128} required />
      {error && <p className="error" role="alert">{error}</p>}
      <p className="actions"><button className="btn" type="submit" disabled={busy}>{c.cta}</button></p>
      <p className="muted">{c.alt[0]} <Link to={c.alt[1]}>{c.alt[2]}</Link></p>
    </form>
  );
}
