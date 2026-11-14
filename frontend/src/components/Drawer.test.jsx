import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../test/render.jsx';
import { mockFetch } from '../test/mockFetch.js';
import { PublicLayout } from '../layouts/PublicLayout.jsx';

const cats = { items: [{ slug: 'science-technology', name: 'Science & Technology', articleCount: 3 }] };
const renderLayout = () => {
  mockFetch({ '/api/categories': cats });
  return renderWithRouter(<Routes><Route element={<PublicLayout />}><Route index element={<p>child</p>} /></Route></Routes>);
};
afterEach(() => vi.unstubAllGlobals());

test('menu button opens a modal dialog with the topics and moves focus inside', async () => {
  renderLayout();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const button = screen.getByRole('button', { name: 'Open menu' });
  await userEvent.click(button);
  const dialog = screen.getByRole('dialog', { name: 'Categories' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toContainElement(document.activeElement);
  expect(button).toHaveAttribute('aria-expanded', 'true');
});

test('Escape closes the drawer and returns focus to the menu button', async () => {
  renderLayout();
  const button = screen.getByRole('button', { name: 'Open menu' });
  await userEvent.click(button);
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  expect(document.body).not.toHaveClass('drawer-open');
});

test('Tab wraps inside the drawer (focus trap)', async () => {
  renderLayout();
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  const dialog = screen.getByRole('dialog');
  for (let i = 0; i < 6; i += 1) {
    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement);
  }
});

test('choosing a topic closes the drawer', async () => {
  renderLayout();
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  const dialog = screen.getByRole('dialog');
  await screen.findAllByRole('link', { name: 'Science & Technology' });
  await userEvent.click(dialog.querySelector('a[href="/category/science-technology"]'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('the close button and the scrim both close it', async () => {
  const { container } = renderLayout();
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  await userEvent.click(container.ownerDocument.querySelector('.scrim'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
