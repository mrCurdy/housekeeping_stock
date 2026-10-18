import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/fetch';
import { checkKeys } from './checklist/noteText';

const tasks = [
  { id: 'a', name: 'Beds', description: '' },
  { id: 'b', name: 'Bins', description: 'Before noon:\n- [ ] Lobby\n- [ ] Kitchen' },
  { id: 'c', name: 'Mop', description: '' },
];

const start = (role = 'admin') => {
  const ticks: Record<string, string> = {};
  const fetch = mockApi((method, path, body) => {
    if (path === '/auth/me') return { status: 200, body: { role } };
    if (path === '/data') {
      return {
        status: 200,
        body: {
          ...{ items: [], records: {}, groups: [], groupRecords: {}, locations: [], counts: {} },
          ...{ tasks, checks: {}, notes: {}, stockCards: [], settings: {} },
        },
      };
    }
    if (method === 'PUT' && path.startsWith('/checks/')) {
      const done = body as { done: boolean; item?: string };
      const taskId = path.split('/').pop()!;
      const key = done.item ? `${taskId}#${done.item}` : taskId;
      if (done.done) ticks[key] = new Date().toISOString();
      else delete ticks[key];
      return { status: 200, body: { ...ticks } };
    }
    return { status: 200, body: {} };
  });
  return fetch;
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.history.replaceState(null, '', '/checklist');
  // jsdom has no canvas: the fireworks only mount their (blank) overlay
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const names = () => screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'));

describe('checklist', () => {
  it('moves a task with the arrow keys on its grip, and ticks checklist lines', async () => {
    const fetch = start();
    const user = userEvent.setup();
    const { default: App } = await import('../App');
    render(<App />);

    const grip = await screen.findByRole('button', { name: 'Move Mop' });
    grip.focus();
    await user.keyboard('{ArrowUp}');
    expect(names()).toEqual(['Beds', 'Mop', 'Bins']);
    expect(fetch).toHaveBeenCalledWith(
      '/api/tasks/order',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ ids: ['a', 'c', 'b'] }) }),
    );
    expect(document.activeElement).toBe(grip);

    // The instructions show their checklist; a line is ticked for the day
    expect(screen.getByText('0/2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Bins/ }));
    const lobby = screen.getByRole('checkbox', { name: 'Lobby' });
    await user.click(lobby);
    expect(lobby).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bins' })).not.toBeChecked();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    const [key] = checkKeys(tasks[1]!.description);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/checks\/\d{4}-\d\d-\d\d\/b$/),
      expect.objectContaining({ body: JSON.stringify({ done: true, item: key }) }),
    );
  });

  it('drags a task by its grip to another place', async () => {
    const fetch = start();
    const { default: App } = await import('../App');
    render(<App />);
    const grip = await screen.findByRole('button', { name: 'Move Beds' });
    // Rows 40px tall, one under the other
    screen.getAllByRole('listitem').forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: i * 40, height: 40 }) as DOMRect;
    });
    fireEvent.pointerDown(grip, { button: 0, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 70, pointerId: 1 });
    expect(names()).toEqual(['Beds', 'Bins', 'Mop']); // nothing moves until the drop
    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(names()).toEqual(['Bins', 'Beds', 'Mop']);
    expect(fetch).toHaveBeenCalledWith(
      '/api/tasks/order',
      expect.objectContaining({ body: JSON.stringify({ ids: ['b', 'a', 'c'] }) }),
    );
  });

  it('the editor makes lists with the buttons and Enter', async () => {
    start();
    const user = userEvent.setup();
    const { default: App } = await import('../App');
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Edit Beds' }));
    const box = screen.getByRole('textbox', { name: 'Instructions' });
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Checklist' }));
    await user.keyboard('Sheets{Enter}Pillows{Enter}{Enter}Done');
    expect(box).toHaveValue('- [ ] Sheets\n- [ ] Pillows\nDone');
    await user.click(within(box.closest('form')!).getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('0/2')).toHaveLength(2); // Beds and Bins
  });

  it('salutes when the last task of the day is ticked', async () => {
    start('worker');
    const user = userEvent.setup();
    const { default: App } = await import('../App');
    const { container } = render(<App />);

    await user.click(await screen.findByRole('checkbox', { name: 'Beds' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bins' }));
    expect(container.querySelector('.salute')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Mop' }));
    expect(screen.getByText('All tasks done')).toBeInTheDocument();
    expect(container.querySelector('.salute')).not.toBeNull();
  });

  it('workers see no grips', async () => {
    start('worker');
    const { default: App } = await import('../App');
    render(<App />);
    expect(await screen.findByRole('checkbox', { name: 'Beds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move/ })).not.toBeInTheDocument();
  });
});
