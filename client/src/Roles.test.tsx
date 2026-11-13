import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApp } from '@/test/fixtures';

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

/** Opens `path` as `role` and waits until the menu is drawn. */
async function open(role: string, path: string) {
  window.history.replaceState(null, '', path);
  mockApp(role);
  const { default: App } = await import('./App');
  render(<App />);
  await screen.findAllByRole('link', { name: 'Stock' });
}

const PAGES = ['Stock', 'Inventory count', 'Checklist', 'Room statuses', 'Cleaning', 'Settings'];
/** The NAV entries shown (the desktop sidebar; the drawer is closed). */
const nav = () => PAGES.filter((name) => screen.queryAllByRole('link', { name }).length > 0);

describe('pages per role', () => {
  it.each([
    ['admin', PAGES, '/stock'],
    ['housekeeper', ['Stock', 'Inventory count', 'Cleaning'], '/counter'],
    ['reception', ['Stock', 'Checklist'], '/checklist'],
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
  ])('%s opening %s is sent to %s', async (role, path, home) => {
    await open(role, path);
    await waitFor(() => expect(window.location.pathname).toBe(home));
  });

  it('every role may open the Stock page; only the admin may type in it', async () => {
    await open('reception', '/stock');
    expect(window.location.pathname).toBe('/stock');
    expect(await screen.findByRole('spinbutton', { name: 'Total stock Towels' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear manual value' })).toBeNull();
  });

  it('the admin types in the Stock page', async () => {
    await open('admin', '/stock');
    expect(await screen.findByRole('spinbutton', { name: 'Total stock Towels' })).toBeEnabled();
  });
});
