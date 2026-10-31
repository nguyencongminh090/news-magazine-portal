import { useState } from 'react';
import { Link } from 'react-router-dom';

const COPY = {
  login: { title: 'Sign in', cta: 'Sign in', autocomplete: 'current-password', alt: ['No account?', '/register', 'Register'] },
  register: { title: 'Register', cta: 'Create account', autocomplete: 'new-password', alt: ['Have an account?', '/login', 'Sign in'] },
};

export function AuthPage({ mode }) {
  const c = COPY[mode];
  const [notice, setNotice] = useState('');

  function onSubmit(event) {
    event.preventDefault();
    setNotice('Account services are not available yet.'); // wired to the auth API in a later item
  }

  return (
    <form className="auth" onSubmit={onSubmit} noValidate>
      <h1>{c.title}</h1>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete={c.autocomplete} required />
      {notice && <p className="error" role="alert">{notice}</p>}
      <p><button className="btn" type="submit" style={{ width: '100%' }}>{c.cta}</button></p>
      <p className="muted">{c.alt[0]} <Link to={c.alt[1]}>{c.alt[2]}</Link></p>
    </form>
  );
}
