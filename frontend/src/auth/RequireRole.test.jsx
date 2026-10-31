import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { RequireRole } from './RequireRole.jsx';

const ui = (
  <Routes>
    <Route path="/login" element={<p>login page</p>} />
    <Route path="/admin" element={<RequireRole roles={['admin', 'editor']}><p>secret</p></RequireRole>} />
  </Routes>
);
const user = (roles) => ({ id: 1, email: 'a@b.c', displayName: 'A', roles });

test('anonymous is redirected to /login', () => {
  renderWithRouter(ui, { route: '/admin', auth: { user: null } });
  expect(screen.getByText('login page')).toBeInTheDocument();
});
test('reader sees a permission message, not the page', () => {
  renderWithRouter(ui, { route: '/admin', auth: { user: user(['reader']) } });
  expect(screen.getByRole('alert')).toHaveTextContent(/permission/i);
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});
test('allowed role sees the page', () => {
  renderWithRouter(ui, { route: '/admin', auth: { user: user(['editor']) } });
  expect(screen.getByText('secret')).toBeInTheDocument();
});
test('while loading neither redirects nor reveals', () => {
  renderWithRouter(ui, { route: '/admin', auth: { user: null, status: 'loading' } });
  expect(screen.queryByText('login page')).not.toBeInTheDocument();
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});
