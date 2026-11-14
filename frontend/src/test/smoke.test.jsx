import { screen } from '@testing-library/react';
import { App } from '../App.jsx';
import { renderWithRouter } from './render.jsx';

test('app renders the masthead brand link', () => {
  renderWithRouter(<App />, { route: '/' });
  expect(screen.getByRole('link', { name: 'News Portal' })).toBeInTheDocument();
});
