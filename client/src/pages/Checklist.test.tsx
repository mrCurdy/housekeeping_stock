import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/fetch';
import { checkKeys } from './checklist/noteText';

const tasks = [
  { id: 'a', name: 'Beds', description: '' },
  { id: 'b', name: 'Bins', description: 'Before noon:\n- [ ] Lobby\n- [ ] Kitchen' },
  { id: 'c', name: 'Mop', description: '' },
];

const start = (role = 'admin', taskGroups?: { id: string; name: string }[], list = tasks) => {
  const ticks: Record<string, string> = {};
  const fetch = mockApi((method, path, body) => {
    if (path === '/auth/me') return { status: 200, body: { role } };
    if (path === '/data') {
      return {
        status: 200,
        body: {
          ...{ items: [], records: {}, groups: [], groupRecords: {}, locations: [], counts: {} },
          ...{ tasks: list, taskGroups, checks: {}, notes: {}, stockCards: [], settings: {} },
        },
      };
    }
    if (method === 'POST' && path === '/task-groups') {
      return { status: 201, body: { id: 'new', name: (body as { name: string }).name } };
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
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ids: ['a', 'c', 'b'], move: { id: 'c', group: 'default' } }),
      }),
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
      expect.objectContaining({
        body: JSON.stringify({ ids: ['b', 'a', 'c'], move: { id: 'a', group: 'default' } }),
      }),
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

  it('salutes when the last task of the (only) group is ticked', async () => {
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

  describe('groups', () => {
    const grouped = [
      { id: 'a', name: 'Beds', description: '' },
      { id: 'b', name: 'Bins', description: '', group: 'g2' },
      { id: 'c', name: 'Mop', description: '', group: 'g2' },
    ];
    const groups = [
      { id: 'g1', name: 'Before 11' },
      { id: 'g2', name: 'Service' },
    ];
    const cardOf = (name: string) =>
      screen.getByRole('heading', { name }).closest<HTMLElement>('.rounded-lg')!;

    it('starts with one group card, and adds and renames groups', async () => {
      const fetch = start();
      const user = userEvent.setup();
      const { default: App } = await import('../App');
      render(<App />);

      expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
      await user.type(screen.getByPlaceholderText('New group (e.g. Before 11)'), 'Service');
      await user.click(screen.getByRole('button', { name: 'Add group' }));
      expect(await screen.findByRole('heading', { name: 'Service' })).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith(
        '/api/task-groups',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Service' }) }),
      );

      await user.click(screen.getByRole('button', { name: 'Edit group Tasks' }));
      const field = screen.getByRole('textbox', { name: 'Group name' });
      await user.type(field, 'Before 11{Enter}');
      expect(screen.getByRole('heading', { name: 'Before 11' })).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith(
        '/api/task-groups/default',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Before 11' }) }),
      );
    });

    it('moves groups and moves a task across groups with the arrow keys', async () => {
      const fetch = start('admin', groups, grouped);
      const user = userEvent.setup();
      const { default: App } = await import('../App');
      render(<App />);

      const beds = await screen.findByRole('button', { name: 'Move Beds' });
      beds.focus();
      await user.keyboard('{ArrowDown}'); // past the end of "Before 11": first in "Service"
      expect(
        within(cardOf('Service'))
          .getAllByRole('checkbox')
          .map((c) => c.ariaLabel),
      ).toEqual(['Beds', 'Bins', 'Mop']);
      expect(fetch).toHaveBeenCalledWith(
        '/api/tasks/order',
        expect.objectContaining({
          body: JSON.stringify({ ids: ['a', 'b', 'c'], move: { id: 'a', group: 'g2' } }),
        }),
      );

      // The row moved to another card: the keyboard stays on its grip
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Beds' })),
      );

      screen.getByRole('button', { name: 'Move group Service' }).focus();
      await user.keyboard('{ArrowUp}');
      const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
      expect(headings.slice(0, 2)).toEqual(['Service', 'Before 11']);
      expect(fetch).toHaveBeenCalledWith(
        '/api/task-groups/order',
        expect.objectContaining({ body: JSON.stringify({ ids: ['g2', 'g1'] }) }),
      );
    });

    it('deleting a group moves its tasks to the group above', async () => {
      // jsdom has no <dialog> methods (the confirm dialog)
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.open = true;
      };
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.open = false;
      };
      const fetch = start('admin', groups, grouped);
      const user = userEvent.setup();
      const { default: App } = await import('../App');
      render(<App />);

      await user.click(await screen.findByRole('button', { name: 'Edit group Service' }));
      await user.click(screen.getByRole('button', { name: 'Delete group Service' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
      expect(screen.queryByRole('heading', { name: 'Service' })).not.toBeInTheDocument();
      expect(within(cardOf('Before 11')).getAllByRole('checkbox')).toHaveLength(3);
      expect(fetch).toHaveBeenCalledWith(
        '/api/task-groups/g2',
        expect.objectContaining({ method: 'DELETE' }),
      );
      // The last group can't be deleted
      await user.click(screen.getByRole('button', { name: 'Edit group Before 11' }));
      expect(screen.getByRole('button', { name: 'Delete group Before 11' })).toBeDisabled();
    });

    it('salutes when a group is finished', async () => {
      start('worker', groups, grouped);
      const user = userEvent.setup();
      const { default: App } = await import('../App');
      const { container } = render(<App />);

      await user.click(await screen.findByRole('checkbox', { name: 'Bins' }));
      expect(container.querySelector('.salute')).toBeNull();
      await user.click(screen.getByRole('checkbox', { name: 'Beds' })); // "Before 11" is done
      expect(within(cardOf('Before 11')).getByText('All tasks done')).toBeInTheDocument();
      expect(container.querySelector('.salute')).not.toBeNull();
    });
  });

  it('workers see no grips', async () => {
    start('worker');
    const { default: App } = await import('../App');
    render(<App />);
    expect(await screen.findByRole('checkbox', { name: 'Beds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move/ })).not.toBeInTheDocument();
  });
});
