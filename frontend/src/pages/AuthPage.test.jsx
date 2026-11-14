import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { AuthPage } from './AuthPage.jsx';

const ui = (mode) => (
  <Routes>
    <Route path="/" element={<p>home</p>} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
  </Routes>
);

test('login submits trimmed credentials and goes home', async () => {
  const login = vi.fn(async () => {});
  renderWithRouter(ui(), { route: '/login', auth: { login } });
  await userEvent.type(screen.getByLabelText('Email'), ' a@b.c ');
  await userEvent.type(screen.getByLabelText('Password'), 'secret-pw');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(login).toHaveBeenCalledWith('a@b.c', 'secret-pw');
  expect(await screen.findByText('home')).toBeInTheDocument();
});

test('login failure shows the server message and stays on the form', async () => {
  const login = vi.fn(async () => { throw Object.assign(new Error('Invalid email or password'), { status: 401 }); });
  renderWithRouter(ui(), { route: '/login', auth: { login } });
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
  await userEvent.type(screen.getByLabelText('Password'), 'x');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('register sends displayName and shows 422 field messages', async () => {
  const register = vi.fn(async () => { throw Object.assign(new Error('Validation failed'), { status: 422, errors: [{ message: 'Password is too common' }] }); });
  renderWithRouter(ui(), { route: '/register', auth: { register } });
  await userEvent.type(screen.getByLabelText('Display name'), 'Ann');
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
  await userEvent.type(screen.getByLabelText('Password'), 'password1');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(register).toHaveBeenCalledWith('a@b.c', 'Ann', 'password1');
  expect(await screen.findByRole('alert')).toHaveTextContent('Password is too common');
});
