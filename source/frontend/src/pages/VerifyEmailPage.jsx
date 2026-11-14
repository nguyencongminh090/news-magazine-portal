import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResendVerification } from '../components/ResendVerification.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Confirms the emailed token (URL fragment, never sent to server logs). Needs no session: the link may be opened
 * signed-out or on another device. The token is read in lazy state (StrictMode-safe) and confirmed once per mount.
 */
export function VerifyEmailPage() {
  const { confirmEmailVerification, refresh, user } = useAuth();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [phase, setPhase] = useState(token ? 'working' : 'missing');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    (async () => {
      try {
        await confirmEmailVerification(token);
        await refresh(); // signed in here -> emailVerified flips; signed out -> harmless no-op
        setPhase('done');
      } catch (err) {
        if (err.status === 0 || err.status === 429) setError(err.status === 0 ? 'Network error. Check your connection and reload.' : 'Too many attempts. Please wait and reload.');
        setPhase(err.status === 0 || err.status === 429 ? 'error' : 'invalid');
      }
    })();
  }, [token, confirmEmailVerification, refresh]);

  if (phase === 'working') return <div className="auth"><h1>Verifying email</h1><p className="muted" role="status">Checking your link…</p></div>;
  if (phase === 'done') {
    return (
      <div className="auth">
        <h1>Email verified</h1>
        <p role="status">Thanks — your email address is confirmed.</p>
        <p className="muted">{user ? <Link to="/">Continue to the news</Link> : <Link to="/login">Sign in</Link>}</p>
      </div>
    );
  }
  if (phase === 'error') return <div className="auth"><h1>Could not verify</h1><p className="error" role="alert">{error}</p></div>;
  return (
    <div className="auth">
      <h1>Verification link invalid</h1>
      <p className="error" role="alert">
        {phase === 'missing' ? 'This link is missing its token.' : 'This link is invalid, already used, or expired.'}{' '}
        {user ? 'Request a new one.' : 'Sign in to request a new one.'}
      </p>
      <p className="muted">{user && !user.emailVerified ? <ResendVerification /> : <Link to="/login">Sign in</Link>}</p>
    </div>
  );
}
