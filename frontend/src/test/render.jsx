import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../auth/AuthContext.jsx';

const noop = async () => {};
/** `auth` overrides the stubbed (anonymous, ready) auth context so tests need no AuthProvider/network. */
export function renderWithRouter(ui, { route = '/', auth = {} } = {}) {
  const value = { user: null, status: 'ready', login: noop, register: noop, logout: noop, refresh: noop, request: noop, ...auth };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}
