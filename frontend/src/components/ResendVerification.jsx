import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

function messageFor(err) {
  if (err.status === 0) return 'Network error. Try again.';
  if (err.status === 429) return 'Too many requests. Try again in an hour.';
  return err.message || 'Something went wrong.';
}

/** "Resend verification email" for a signed-in, unverified user. Neutral confirmation; 429 and errors shown inline. */
export function ResendVerification() {
  const { requestEmailVerification } = useAuth();
  const [state, setState] = useState({ busy: false, sent: false, error: '' });

  async function resend() {
    setState({ busy: true, sent: false, error: '' });
    try {
      await requestEmailVerification();
      setState({ busy: false, sent: true, error: '' });
    } catch (err) {
      setState({ busy: false, sent: false, error: messageFor(err) });
    }
  }

  return (
    <span className="resend">
      <button type="button" className="link-btn" disabled={state.busy} onClick={resend}>Resend verification email</button>
      {state.sent && <span role="status"> If your address is still unverified, a new link is on its way.</span>}
      {state.error && <span className="error" role="alert"> {state.error}</span>}
    </span>
  );
}
