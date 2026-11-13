import { emptyStockData, formatDate, type StockData } from '@app/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/fetch';
import { createMutations, editData, type Edit, type Send } from './mutations';

const sample = (): StockData => {
  const d = emptyStockData();
  d.records = { a: { '2026-11-13': { i: 2 } } };
  d.tasks = [{ id: 't', name: 'Mop', description: '' }];
  d.notes = { '2026-11-13': 'hi' };
  return d;
};

describe('editData', () => {
  it('copies only the named key; the rest is shared with the old dataset', () => {
    const prev = sample();
    const next = editData(prev, 'records', (d) => void (d.records.a!['2026-11-13'] = { i: 5 }));
    expect(next.records.a?.['2026-11-13']).toEqual({ i: 5 });
    expect(prev.records.a?.['2026-11-13']).toEqual({ i: 2 });
    expect(next.tasks).toBe(prev.tasks);
    expect(next.notes).toBe(prev.notes);
    expect(next.records).not.toBe(prev.records);
  });

  it('copies every key of a list', () => {
    const prev = sample();
    const next = editData(prev, ['tasks', 'notes'], (d) => {
      d.tasks[0]!.name = 'Sweep';
      delete d.notes['2026-11-13'];
    });
    expect(prev.tasks[0]!.name).toBe('Mop');
    expect(prev.notes).toEqual({ '2026-11-13': 'hi' });
    expect(next.tasks[0]!.name).toBe('Sweep');
    expect(next.records).toBe(prev.records);
  });
});

describe('room mutations', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** createMutations over a local dataset: `edit` applies at once, `send` runs the request. */
  function setup(init: (d: StockData) => void = () => {}) {
    const state = { data: emptyStockData() };
    init(state.data);
    const calls: { method: string; path: string; body: unknown }[] = [];
    const pending: Promise<unknown>[] = [];
    const edit: Edit = (keys, fn) => void (state.data = editData(state.data, keys, fn));
    const send: Send = (request) => {
      const p = request();
      pending.push(p);
      return p;
    };
    const m = () => createMutations({ edit, send, data: state.data });
    const reply = (method: string, path: string, body: unknown) => {
      calls.push({ method, path, body });
      if (method === 'POST' && path === '/rooms')
        return { status: 201, body: { id: 'r1', number: '101' } };
      if (method === 'POST' && path === '/room-units')
        return { status: 201, body: { id: 'u9', ...(body as object) } };
      if (method === 'POST' && path === '/room-statuses')
        return { status: 201, body: { id: 's9', ...(body as object) } };
      if (method === 'PUT' && path.startsWith('/rooms/'))
        return { status: 200, body: { ...(body as object), at: '2026-11-13T10:00:00.000Z' } };
      if (method === 'POST' && path.endsWith('/cleanings'))
        return { status: 201, body: [{ date: '2026-11-13', by: 'Server' }] };
      return { status: 204 };
    };
    mockApi(reply);
    return { state, calls, m, flush: () => Promise.all(pending) };
  }

  const withRoom = (d: StockData) => {
    d.rooms = [{ id: 'r1', number: '101', type: 't1', note: 'sea view' }];
    d.roomTypes = [{ id: 't1', name: 'Double' }];
    d.roomUnits = [
      { id: 'u1', name: 'Bed' },
      { id: 'u2', name: 'Shower' },
    ];
    d.unitStatus = { r1: { u1: { status: 'fix', by: 'Ann', at: 'x' } } };
    d.cleanings = { r1: [{ date: '2026-11-01', by: 'Ann' }] };
  };

  it('adds a room from the server answer', async () => {
    const { state, calls, m } = setup();
    const room = await m().addRoom({ number: '101' });
    expect(room).toEqual({ id: 'r1', number: '101' });
    expect(state.data.rooms).toEqual([{ id: 'r1', number: '101' }]);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/rooms', body: { number: '101' } });
  });

  it('updates a room: trims the note, clears a blank note and type', async () => {
    const { state, calls, m, flush } = setup(withRoom);
    m().updateRoom('r1', { note: '  bathtub  ' });
    expect(state.data.rooms[0]!.note).toBe('bathtub');
    m().updateRoom('r1', { note: '', type: '' });
    expect(state.data.rooms[0]).toEqual({ id: 'r1', number: '101' });
    await flush();
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['PATCH', '/rooms/r1', { note: '  bathtub  ' }],
      ['PATCH', '/rooms/r1', { note: '', type: '' }],
    ]);
  });

  it('removes a room with its statuses and cleanings', async () => {
    const { state, calls, m, flush } = setup(withRoom);
    m().removeRoom('r1');
    expect(state.data.rooms).toEqual([]);
    expect(state.data.unitStatus).toEqual({});
    expect(state.data.cleanings).toEqual({});
    await flush();
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/rooms/r1' });
  });

  it('sets a unit status at once, then keeps the server entry', async () => {
    const { state, calls, m, flush } = setup(withRoom);
    m().setUnitStatus('r1', 'u2', { status: 'attention', by: 'Bob', note: 'drips' });
    expect(state.data.unitStatus.r1?.u2).toMatchObject({
      status: 'attention',
      by: 'Bob',
      note: 'drips',
    });
    await flush();
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      path: '/rooms/r1/units/u2',
      body: { status: 'attention', by: 'Bob', note: 'drips' },
    });
    expect(state.data.unitStatus.r1?.u2?.at).toBe('2026-11-13T10:00:00.000Z');
  });

  it('marks a room cleaned today, newest first, then keeps the server list', async () => {
    const { state, calls, m, flush } = setup(withRoom);
    const today = formatDate(new Date());
    m().markCleaned('r1', 'Cid');
    expect(state.data.cleanings.r1?.[0]).toEqual({ date: today, by: 'Cid' });
    expect(state.data.cleanings.r1).toHaveLength(2);
    await flush();
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/rooms/r1/cleanings',
      body: { date: today, by: 'Cid' },
    });
    expect(state.data.cleanings.r1).toEqual([{ date: '2026-11-13', by: 'Server' }]);
  });

  it('master units: add, rename, move, remove (drops their statuses)', async () => {
    const { state, calls, m, flush } = setup(withRoom);
    await m().addRoomUnit('Desk');
    expect(state.data.roomUnits.map((u) => u.id)).toEqual(['u1', 'u2', 'u9']);
    m().renameRoomUnit('u1', 'Beds');
    expect(state.data.roomUnits[0]!.name).toBe('Beds');
    m().moveRoomUnit(2, 0);
    expect(state.data.roomUnits.map((u) => u.id)).toEqual(['u9', 'u1', 'u2']);
    m().removeRoomUnit('u1');
    expect(state.data.roomUnits.map((u) => u.id)).toEqual(['u9', 'u2']);
    expect(state.data.unitStatus).toEqual({});
    await flush();
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/room-units', { name: 'Desk' }],
      ['PATCH', '/room-units/u1', { name: 'Beds' }],
      ['PUT', '/room-units/order', { ids: ['u9', 'u1', 'u2'] }],
      ['DELETE', '/room-units/u1', undefined],
    ]);
  });

  it('master types: removing one clears it on its cards', async () => {
    const { state, calls, m, flush } = setup(withRoom);
    m().removeRoomType('t1');
    expect(state.data.roomTypes).toEqual([]);
    expect(state.data.rooms[0]!.type).toBeUndefined();
    await flush();
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/room-types/t1' });
  });

  it('master statuses: start from the defaults, add, recolour, move, remove', async () => {
    const { state, calls, m, flush } = setup(withRoom);
    await m().addRoomStatus('Broken', 'purple');
    expect(state.data.roomStatuses.map((s) => s.id)).toEqual(['ok', 'attention', 'fix', 's9']);
    m().updateRoomStatus('s9', { color: 'blue' });
    expect(state.data.roomStatuses[3]).toEqual({ id: 's9', name: 'Broken', color: 'blue' });
    m().moveRoomStatus(3, 0);
    expect(state.data.roomStatuses[0]!.id).toBe('s9');
    m().removeRoomStatus('fix');
    expect(state.data.roomStatuses.map((s) => s.id)).toEqual(['s9', 'ok', 'attention']);
    expect(state.data.unitStatus).toEqual({});
    await flush();
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/room-statuses', { name: 'Broken', color: 'purple' }],
      ['PATCH', '/room-statuses/s9', { color: 'blue' }],
      ['PUT', '/room-statuses/order', { ids: ['s9', 'ok', 'attention', 'fix'] }],
      ['DELETE', '/room-statuses/fix', undefined],
    ]);
  });

  it('never removes the last status (no request)', async () => {
    const { state, calls, m, flush } = setup((d) => {
      d.roomStatuses = [{ id: 'only', name: 'OK', color: 'green' }];
    });
    m().removeRoomStatus('only');
    await flush();
    expect(state.data.roomStatuses).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it('settings: stores the thresholds, keeps the thresholds on screen', async () => {
    const { state, m, flush } = setup();
    m().updateSettings({ cleanGreenDays: 10, cleanYellowDays: 20 });
    expect(state.data.settings).toEqual({ cleanGreenDays: 10, cleanYellowDays: 20 });
    await flush();
  });
});
