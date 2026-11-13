import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStockData, type StockData } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { DateProvider } from '@/context/DateContext';
import { StockProvider } from '@/context/StockContext';
import { ToastProvider } from '@/context/ToastContext';
import { mockApi } from '@/test/fetch';
import Settings from '../Settings';

beforeEach(() => {
  // jsdom has no <dialog> methods (the confirm dialog)
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => vi.unstubAllGlobals());

const grouped: Partial<StockData> = {
  roomUnitGroups: [
    { id: 'bath', name: 'Bathroom' },
    { id: 'tech', name: 'Electronics' },
  ],
  roomUnits: [
    { id: 'faucet', name: 'Faucet', group: 'bath' },
    { id: 'shower', name: 'Shower', group: 'bath' },
    { id: 'tv', name: 'TV', group: 'tech' },
  ],
};

function start(data: Partial<StockData> = {}) {
  const fetch = mockApi((method, path, body) => {
    if (path === '/auth/me') return { status: 200, body: { role: 'admin' } };
    if (path === '/data') return { status: 200, body: { ...emptyStockData(), ...data } };
    if (path === '/auth/qr') return { status: 200, body: { active: false } };
    if (path === '/room-unit-groups' && method === 'POST') {
      return { status: 201, body: { id: 'g-new', ...(body as object) } };
    }
    if (path === '/room-units' && method === 'POST') {
      return { status: 201, body: { id: 'u-new', ...(body as object) } };
    }
    return { status: 204 };
  });
  render(
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <DateProvider>
            <StockProvider>
              <Settings />
            </StockProvider>
          </DateProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>,
  );
  return fetch;
}

const sent = (fetch: ReturnType<typeof mockApi>, url: string, method: string) =>
  fetch.mock.calls
    .filter(([u, init]) => u === url && init?.method === method)
    .map(([, init]) => (init?.body ? JSON.parse(init.body as string) : undefined));

const group = (name: string) => screen.getByRole('group', { name });
const unitsIn = (name: string) =>
  within(group(name))
    .queryAllByRole('textbox', { name: /^Unit name/ })
    .map((f) => (f as HTMLInputElement).value);

describe('Settings: room unit groups', () => {
  it('without groups: add a group, then a unit in it', async () => {
    const fetch = start();
    expect(await screen.findByText('No groups yet. Add a group, then its units.')).toBeVisible();
    await userEvent.type(screen.getByPlaceholderText('New group (bathroom, furniture…)'), 'Bath');
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(sent(fetch, '/api/room-unit-groups', 'POST')).toEqual([{ name: 'Bath' }]);

    const box = await screen.findByRole('group', { name: 'Bath' });
    await userEvent.type(within(box).getByPlaceholderText('New unit (bed, shower…)'), 'Faucet');
    await userEvent.click(within(box).getByRole('button', { name: 'Add unit' }));
    expect(sent(fetch, '/api/room-units', 'POST')).toEqual([{ name: 'Faucet', group: 'g-new' }]);
    await waitFor(() => expect(unitsIn('Bath')).toEqual(['Faucet']));
  });

  it('renames a group in the current language', async () => {
    const fetch = start(grouped);
    const field = await screen.findByRole('textbox', { name: 'Group name Bathroom' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Bath{Enter}');
    expect(sent(fetch, '/api/room-unit-groups/bath', 'PATCH')).toEqual([
      { name: 'Bath', lang: 'en' },
    ]);
  });

  it('drags a unit into another group', async () => {
    const fetch = start(grouped);
    const grip = await screen.findByRole('button', { name: 'Move Faucet' });
    const box = (el: Element, top: number, height: number) => {
      (el as HTMLElement).getBoundingClientRect = () =>
        ({ top, bottom: top + height, left: 0, right: 500, height }) as DOMRect;
    };
    // Bathroom 0–100 (Faucet 30–50, Shower 50–70), Electronics 100–200 (TV 130–150)
    box(group('Bathroom'), 0, 100);
    box(group('Electronics'), 100, 100);
    const rows = (name: string) => within(group(name)).getAllByRole('listitem');
    box(rows('Bathroom')[0]!, 30, 20);
    box(rows('Bathroom')[1]!, 50, 20);
    box(rows('Electronics')[0]!, 130, 20);

    fireEvent.pointerDown(grip, { button: 0, clientX: 10, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 10, clientY: 145, pointerId: 1 });
    expect(group('Electronics')).toHaveClass('ring-2'); // the drop target
    fireEvent.pointerUp(grip, { pointerId: 1 });

    expect(unitsIn('Bathroom')).toEqual(['Shower']);
    expect(unitsIn('Electronics')).toEqual(['TV', 'Faucet']);
    expect(sent(fetch, '/api/room-units/order', 'PUT')).toEqual([
      { ids: ['shower', 'tv', 'faucet'], move: { id: 'faucet', group: 'tech' } },
    ]);
  });

  it('moves a unit and a group with the arrow keys', async () => {
    const fetch = start(grouped);
    (await screen.findByRole('button', { name: 'Move Shower' })).focus();
    await userEvent.keyboard('{ArrowDown}'); // past the end of Bathroom: first in Electronics
    expect(unitsIn('Electronics')).toEqual(['Shower', 'TV']);
    expect(sent(fetch, '/api/room-units/order', 'PUT')).toEqual([
      { ids: ['faucet', 'shower', 'tv'], move: { id: 'shower', group: 'tech' } },
    ]);

    screen.getByRole('button', { name: 'Move group Electronics' }).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('textbox', { name: /^Group name/ }).map((f) => f.ariaLabel)).toEqual(
      ['Group name Electronics', 'Group name Bathroom'],
    );
    expect(sent(fetch, '/api/room-unit-groups/order', 'PUT')).toEqual([{ ids: ['tech', 'bath'] }]);
  });

  it('a group with units is not deleted; an empty one is, after a confirm', async () => {
    const fetch = start({
      ...grouped,
      roomUnitGroups: [...grouped.roomUnitGroups!, { id: 'empty', name: 'Furniture' }],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group Bathroom' }));
    expect(await screen.findByText('The group "Bathroom" still has units')).toBeVisible();
    expect(
      screen.getByText('Move its units to another group first, then delete it.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Delete group Furniture' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    );
    expect(screen.queryByRole('group', { name: 'Furniture' })).toBeNull();
    expect(sent(fetch, '/api/room-unit-groups/empty', 'DELETE')).toEqual([undefined]);
    expect(sent(fetch, '/api/room-unit-groups/bath', 'DELETE')).toEqual([]);
  });

  it('units from old data without groups show in one unnamed group', async () => {
    start({ roomUnits: [{ id: 'bed', name: 'Bed' }] });
    expect(await screen.findByRole('group', { name: 'Units' })).toBeVisible();
    expect(unitsIn('Units')).toEqual(['Bed']);
  });
});
