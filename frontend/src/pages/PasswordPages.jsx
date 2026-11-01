import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

function messageFor(err) {
  if (err.status === 0) return 'Network error. Check your connection and try again.';
  if (err.status === 429) return 'Too many attempts. Please wait and try again.';
  if (err.status === 422 && err.errors?.length) return err.errors.map((e) => e.message).join(' ');
  return err.message || 'Something went wrong.';
}

/** Shared form shell: busy/error state and the standard `.auth` card. */
function PasswordForm({ title, cta, onSubmit, children, footer }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function handle(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await onSubmit(f);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth" onSubmit={handle} noValidate>
      <h1>{title}</h1>
      {children}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="actions"><button className="btn" type="submit" disabled={busy}>{cta}</button></p>
      {footer}
    </form>
  );
}

const field = (id, label, auto, extra = {}) => (
  <>
    <label htmlFor={id}>{label}</label>
    <input id={id} name={id} type="password" autoComplete={auto} maxLength={128} required {...extra} />
  </>
);

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className="auth">
        <h1>Check your email</h1>
        <p role="status">If an account exists for that address, we have sent a link to reset the password. It expires in 30 minutes.</p>
        <p className="muted"><Link to="/login">Back to sign in</Link></p>
      </div>
    );
  }
  return (
    <PasswordForm
      title="Forgot password"
      cta="Send reset link"
      onSubmit={async (f) => { await requestPasswordReset(f.get('email').toString().trim()); setSent(true); }}
      footer={<p className="muted"><Link to="/login">Back to sign in</Link></p>}
    >
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
    </PasswordForm>
  );
}

export function ResetPasswordPage() {
  const { confirmPasswordReset } = useAuth();
  const navigate = useNavigate();
  // Token travels in the URL fragment (never in server logs). Read it during the first render (lazy initial state,
  // so StrictMode's double effect cannot re-read an already stripped address), then strip it in an idempotent effect.
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [done, setDone] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  if (done) {
    return (
      <div className="auth">
        <h1>Password updated</h1>
        <p role="status">Your password was changed. Sign in with the new one.</p>
        <p className="actions"><button className="btn" type="button" onClick={() => navigate('/login')}>Sign in</button></p>
      </div>
    );
  }
  if (!token) {
    return (
      <div className="auth">
        <h1>Reset link invalid</h1>
        <p className="error" role="alert">This link is missing its token. Request a new one.</p>
        <p className="muted"><Link to="/forgot-password">Forgot password</Link></p>
      </div>
    );
  }
  return (
    <PasswordForm
      title="Choose a new password"
      cta="Set password"
      onSubmit={async (f) => { await confirmPasswordReset(token, f.get('newPassword').toString()); setDone(true); }}
      footer={<p className="muted">Link expired? <Link to="/forgot-password">Request a new one</Link></p>}
    >
      {field('newPassword', 'New password', 'new-password', { minLength: 8 })}
    </PasswordForm>
  );
}

export function ChangePasswordPage() {
  const { user, status, changePassword } = useAuth();
  const [done, setDone] = useState(false);
  if (status === 'loading') return <p className="muted" role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/account/password' }} />;
  return (
    <PasswordForm
      title="Change password"
      cta="Change password"
      onSubmit={async (f) => {
        await changePassword(f.get('currentPassword').toString(), f.get('newPassword').toString());
        setDone(true);
      }}
      footer={done ? <p role="status">Password changed. Other devices were signed out.</p> : null}
    >
      {field('currentPassword', 'Current password', 'current-password')}
      {field('newPassword', 'New password', 'new-password', { minLength: 8 })}
    </PasswordForm>
  );
}
