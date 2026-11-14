import { configure, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { ChangePasswordPage, ForgotPasswordPage, ResetPasswordPage } from './PasswordPages.jsx';

const ui = (
  <Routes>
    <Route path="/login" element={<p>login</p>} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/account/password" element={<ChangePasswordPage />} />
  </Routes>
);

test('forgot password sends trimmed email and shows a neutral message', async () => {
  const requestPasswordReset = vi.fn(async () => {});
  renderWithRouter(ui, { route: '/forgot-password', auth: { requestPasswordReset } });
  await userEvent.type(screen.getByLabelText('Email'), ' a@b.c ');
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(requestPasswordReset).toHaveBeenCalledWith('a@b.c');
  expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
});

test('reset reads the fragment token, strips it, and confirms', async () => {
  window.location.hash = '#token=abc123';
  const confirmPasswordReset = vi.fn(async () => {});
  renderWithRouter(ui, { route: '/reset-password', auth: { confirmPasswordReset } });
  await userEvent.type(await screen.findByLabelText('New password'), 'new-pass-1');
  await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
  expect(confirmPasswordReset).toHaveBeenCalledWith('abc123', 'new-pass-1');
  expect(window.location.hash).toBe('');
  expect(await screen.findByRole('status')).toHaveTextContent('Your password was changed');
});

test('reset keeps its token under StrictMode double effects', async () => {
  configure({ reactStrictMode: true });
  try {
    window.location.hash = '#token=abc123';
    renderWithRouter(ui, { route: '/reset-password' });
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  } finally {
    configure({ reactStrictMode: false });
  }
});

test('reset without a token explains the link is invalid', async () => {
  window.location.hash = '';
  renderWithRouter(ui, { route: '/reset-password' });
  expect(await screen.findByRole('alert')).toHaveTextContent('missing its token');
});

test('reset error from the server is shown', async () => {
  window.location.hash = '#token=bad';
  const confirmPasswordReset = vi.fn(async () => { throw Object.assign(new Error('Invalid or expired token'), { status: 400 }); });
  renderWithRouter(ui, { route: '/reset-password', auth: { confirmPasswordReset } });
  await userEvent.type(await screen.findByLabelText('New password'), 'new-pass-1');
  await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired token');
});

test('change password redirects anonymous users to login', async () => {
  renderWithRouter(ui, { route: '/account/password' });
  expect(await screen.findByText('login')).toBeInTheDocument();
});

test('change password submits both fields for a signed-in user', async () => {
  const changePassword = vi.fn(async () => {});
  renderWithRouter(ui, { route: '/account/password', auth: { user: { displayName: 'A', roles: ['reader'] }, changePassword } });
  await userEvent.type(screen.getByLabelText('Current password'), 'old-pass-1');
  await userEvent.type(screen.getByLabelText('New password'), 'new-pass-1');
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(changePassword).toHaveBeenCalledWith('old-pass-1', 'new-pass-1');
  expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
});
