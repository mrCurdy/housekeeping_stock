import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApp, stockFixture } from '@/test/fixtures';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollTo ??= () => {}; // the Stock overview centres the day; jsdom lacks it
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  // The router reads the URL when App is imported, so every test gets a fresh one
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Opens `path` as `role` and waits until the menu is drawn (the brand link is always there). */
async function open(role: string, path: string, data = stockFixture()) {
  window.history.replaceState(null, '', path);
  mockApp(role, data);
  const { default: App } = await import('./App');
  render(<App />);
  await screen.findAllByRole('link', { name: 'Fomka' });
}

const PAGES = ['Stock', 'Inventory count', 'Checklist', 'Room statuses', 'Cleaning', 'Settings'];
/** The NAV entries shown (the desktop sidebar; the drawer is closed). */
const nav = () => PAGES.filter((name) => screen.queryAllByRole('link', { name }).length > 0);

describe('pages per role', () => {
  it.each([
    ['admin', PAGES, '/stock'],
    ['housekeeper', ['Inventory count', 'Cleaning'], '/counter'],
    ['reception', ['Checklist'], '/checklist'],
  ])('%s sees only its pages and starts on its home page', async (role, pages, home) => {
    await open(role, '/');
    expect(nav()).toEqual(pages);
    await waitFor(() => expect(window.location.pathname).toBe(home));
  });

  it.each([
    ['housekeeper', '/checklist', '/counter'],
    ['housekeeper', '/settings', '/counter'],
    ['housekeeper', '/rooms', '/counter'],
    ['reception', '/counter', '/checklist'],
    ['reception', '/counter/l1', '/checklist'],
    ['reception', '/cleaning', '/checklist'],
    ['housekeeper', '/stock', '/counter'],
    ['reception', '/stock', '/checklist'],
  ])('%s opening %s is sent to %s', async (role, path, home) => {
    await open(role, path);
    await waitFor(() => expect(window.location.pathname).toBe(home));
  });

  it('a role left no page sees a notice instead of a redirect loop', async () => {
    const data = stockFixture({
      settings: { rolePermissions: { housekeeper: [], reception: [] } },
    });
    await open('reception', '/stock', data);
    expect(await screen.findByText('No pages are open to you yet.')).toBeInTheDocument();
    expect(nav()).toEqual([]);
  });

  it('the admin types in the Stock page', async () => {
    await open('admin', '/stock');
    expect(await screen.findByRole('spinbutton', { name: 'Total stock Towels' })).toBeEnabled();
  });

  it('the NAV follows the role permissions the admin set', async () => {
    const data = stockFixture({
      settings: { rolePermissions: { housekeeper: ['count'], reception: ['daily', 'cleaning'] } },
    });
    await open('reception', '/', data);
    await waitFor(() => expect(nav()).toEqual(['Stock', 'Cleaning']));
    await waitFor(() => expect(window.location.pathname).toBe('/stock'));
    expect(await screen.findByRole('spinbutton', { name: 'Total stock Towels' })).toBeEnabled();
  });
});
