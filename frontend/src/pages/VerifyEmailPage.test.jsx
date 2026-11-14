import { configure, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { ResendVerification } from '../components/ResendVerification.jsx';
import { VerifyEmailPage } from './VerifyEmailPage.jsx';

const ui = (
  <Routes>
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/login" element={<p>login</p>} />
  </Routes>
);

test('confirms the fragment token once (StrictMode), strips it and refreshes the session', async () => {
  configure({ reactStrictMode: true });
  try {
    window.location.hash = '#token=abc123';
    const confirmEmailVerification = vi.fn(async () => {});
    const refresh = vi.fn(async () => true);
    renderWithRouter(ui, { route: '/verify-email', auth: { confirmEmailVerification, refresh } });
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(confirmEmailVerification).toHaveBeenCalledTimes(1);
    expect(confirmEmailVerification).toHaveBeenCalledWith('abc123');
    expect(refresh).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  } finally {
    configure({ reactStrictMode: false });
  }
});

test('missing token shows an invalid-link state without calling the API', async () => {
  window.location.hash = '';
  const confirmEmailVerification = vi.fn();
  renderWithRouter(ui, { route: '/verify-email', auth: { confirmEmailVerification } });
  expect(await screen.findByRole('alert')).toHaveTextContent('missing its token');
  expect(confirmEmailVerification).not.toHaveBeenCalled();
});

test('invalid or expired token shows the invalid state', async () => {
  window.location.hash = '#token=bad';
  const confirmEmailVerification = vi.fn(async () => { throw Object.assign(new Error('bad'), { status: 400 }); });
  renderWithRouter(ui, { route: '/verify-email', auth: { confirmEmailVerification } });
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid, already used, or expired');
});

test('resend shows a neutral confirmation', async () => {
  const requestEmailVerification = vi.fn(async () => null);
  renderWithRouter(<ResendVerification />, { auth: { requestEmailVerification } });
  await userEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
  expect(requestEmailVerification).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('status')).toHaveTextContent('a new link is on its way');
});

test('resend handles the 429 limit', async () => {
  const requestEmailVerification = vi.fn(async () => { throw Object.assign(new Error('x'), { status: 429 }); });
  renderWithRouter(<ResendVerification />, { auth: { requestEmailVerification } });
  await userEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
});
