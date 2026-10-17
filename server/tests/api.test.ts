import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDays,
  formatDate,
  todayLocal,
  type Group,
  type Item,
  type Location,
  type StockData,
  type Task,
} from '@app/shared';
import { setup, type TestEnv } from './helpers';

describe('REST API', () => {
  let env: TestEnv;
  let towel: Item;
  let double: Group;
  let floor1: Location;

  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const data = async () => (await env.api().get('/api/data').expect(200)).body as StockData;

  it('health is ok', async () => {
    const res = await env.api().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'json' });
  });

  it('starts empty', async () => {
    expect(await data()).toEqual({
      items: [],
      groups: [],
      locations: [],
      records: {},
      groupRecords: {},
      counts: {},
      tasks: [],
      checks: {},
      notes: {},
    });
  });

  it('unknown api route is a JSON 404', async () => {
    const res = await env.api().get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  describe('setup', () => {
    it('creates items, groups and rooms', async () => {
      towel = (await env.api().post('/api/items').send({ name: ' Towel ' }).expect(201)).body;
      double = (await env.api().post('/api/groups').send({ name: 'DOUBLE' }).expect(201)).body;
      floor1 = (await env.api().post('/api/locations').send({ name: '1 level' }).expect(201)).body;
      expect(towel).toMatchObject({ name: 'Towel', multipliers: {} });
      expect(double.name).toBe('DOUBLE');
      expect(floor1.name).toBe('1 level');
    });

    it('renames and sets items per departure', async () => {
      const res = await env
        .api()
        .patch(`/api/items/${towel.id}`)
        .send({ name: 'Bath towel', multipliers: { [double.id]: 2 } })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Bath towel', multipliers: { [double.id]: 2 } });
      await env.api().patch(`/api/groups/${double.id}`).send({ name: 'TWIN' }).expect(200);
      await env.api().patch('/api/locations/nope').send({ name: 'x' }).expect(404);
    });

    it('validates input', async () => {
      const res = await env
        .api()
        .patch(`/api/items/${towel.id}`)
        .send({ multipliers: { [double.id]: -1 } })
        .expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('daily figures', () => {
    it('patches a record field by field; null clears', async () => {
      const url = `/api/records/${towel.id}/2026-10-01`;
      await env.api().patch(url).send({ i: 20 }).expect(200);
      const res = await env.api().patch(url).send({ mc: 3 }).expect(200);
      expect(res.body).toEqual({ i: 20, mc: 3 });
      await env.api().patch(url).send({ mc: null }).expect(200);
      expect((await data()).records[towel.id]).toEqual({ '2026-10-01': { i: 20 } });
    });

    it('rejects bad dates and unknown items', async () => {
      await env.api().patch(`/api/records/${towel.id}/2026-1-1`).send({ i: 1 }).expect(400);
      await env.api().patch('/api/records/nope/2026-10-01').send({ i: 1 }).expect(404);
    });

    it('sets departures; 0 clears them', async () => {
      await env.api().put(`/api/departures/${double.id}/2026-10-02`).send({ d: 3 }).expect(200);
      await env.api().put(`/api/departures/${double.id}/2026-10-03`).send({ d: 1 }).expect(200);
      await env.api().put(`/api/departures/${double.id}/2026-10-03`).send({ d: 0 }).expect(200);
      expect((await data()).groupRecords).toEqual({ [double.id]: { '2026-10-02': { d: 3 } } });
    });

    it('saves room counts and returns the whole day', async () => {
      const url = `/api/counts/2026-10-02/${floor1.id}/${towel.id}`;
      const res = await env.api().put(url).send({ value: 0 }).expect(200);
      expect(res.body).toEqual({ [floor1.id]: { [towel.id]: 0 } });
      const cleared = await env.api().put(url).send({ value: null }).expect(200);
      expect(cleared.body).toEqual({});
      await env.api().put(url).send({ value: 12 }).expect(200);
      await env.api().put(`/api/counts/2026-10-02/nope/${towel.id}`).send({ value: 1 }).expect(404);
    });
  });

  describe('checklist', () => {
    const day = (n: number) => formatDate(addDays(todayLocal(), n));
    const today = day(0);
    const yesterday = day(-1);
    let beds: Task;
    let bins: Task;
    const task = async (id: string) => (await data()).tasks.find((t) => t.id === id);

    it('creates, edits and reorders tasks', async () => {
      beds = (
        await env
          .api()
          .post('/api/tasks')
          .send({ name: 'Beds', description: 'Fold', from: yesterday })
          .expect(201)
      ).body;
      bins = (await env.api().post('/api/tasks').send({ name: 'Bins', from: today }).expect(201))
        .body;
      expect(bins).toMatchObject({ description: '', added: today });
      await env.api().post('/api/tasks').send({ name: 'No day' }).expect(400);
      await env
        .api()
        .patch(`/api/tasks/${beds.id}`)
        .send({ description: 'Fold corners', from: today })
        .expect(200);
      await env.api().patch('/api/tasks/nope').send({ name: 'x', from: today }).expect(404);
      const res = await env
        .api()
        .put('/api/tasks/order')
        .send({ ids: [bins.id] })
        .expect(200);
      expect((res.body as Task[]).map((t) => t.name)).toEqual(['Bins', 'Beds']);
    });

    it('keeps the old wording on the days before an edit', async () => {
      expect(await task(beds.id)).toEqual({
        id: beds.id,
        name: 'Beds',
        description: 'Fold corners',
        added: yesterday,
        earlier: [{ name: 'Beds', description: 'Fold', until: today }],
      });
    });

    it('ticks tasks per day and returns the whole day', async () => {
      const url = `/api/checks/${today}/${beds.id}`;
      const res = await env.api().put(url).send({ done: true }).expect(200);
      const time = res.body[beds.id] as string;
      expect(Date.parse(time)).not.toBeNaN();
      // ticking again keeps the first time
      expect((await env.api().put(url).send({ done: true })).body).toEqual({ [beds.id]: time });
      await env.api().put(`/api/checks/${today}/${bins.id}`).send({ done: true }).expect(200);
      const off = await env.api().put(`/api/checks/${today}/${bins.id}`).send({ done: false });
      expect(off.body).toEqual({ [beds.id]: time });
      await env.api().put(`/api/checks/${today}/nope`).send({ done: true }).expect(404);
      // Bins was added today: it was not on yesterday's list
      await env.api().put(`/api/checks/${yesterday}/${bins.id}`).send({ done: true }).expect(404);
      await env.api().put(`/api/checks/${yesterday}/${beds.id}`).send({ done: true }).expect(200);
    });

    it('saves notes; empty clears', async () => {
      await env.api().put(`/api/notes/${today}`).send({ text: 'Out of soap' }).expect(200);
      await env.api().put('/api/notes/2026-1-1').send({ text: 'x' }).expect(400);
      expect((await data()).notes).toEqual({ [today]: 'Out of soap' });
      await env.api().put(`/api/notes/${today}`).send({ text: '  ' }).expect(200);
      expect((await data()).notes).toEqual({});
    });

    it('deletes ticks and notes older than 30 days', async () => {
      const old = day(-31);
      const kept = day(-30);
      const linen = (await env.api().post('/api/tasks').send({ name: 'Linen', from: old })).body;
      await env.api().put(`/api/notes/${old}`).send({ text: 'old' }).expect(200);
      await env.api().put(`/api/notes/${kept}`).send({ text: 'kept' }).expect(200);
      await env.api().put(`/api/checks/${old}/${linen.id}`).send({ done: true }).expect(200);
      const d = await data();
      expect(d.notes).toEqual({ [kept]: 'kept' });
      expect(d.checks[old]).toBeUndefined();
      // ...and task history from before then
      expect(d.tasks.find((t) => t.id === linen.id)).toEqual({
        id: linen.id,
        name: 'Linen',
        description: '',
      });
      await env
        .api()
        .patch(`/api/tasks/${linen.id}`)
        .send({ name: 'Linen 2', from: day(-35) });
      await env
        .api()
        .patch(`/api/tasks/${linen.id}`)
        .send({ name: 'Linen 3', from: day(-5) });
      expect(await task(linen.id)).toMatchObject({
        name: 'Linen 3',
        earlier: [{ name: 'Linen 2', until: day(-5) }],
      });
      await env
        .api()
        .delete(`/api/tasks/${linen.id}/${day(-31)}`)
        .expect(204);
      expect(await task(linen.id)).toBeUndefined();
    });

    it('removing a task keeps it, and its ticks, on the days before', async () => {
      await env.api().delete(`/api/tasks/${beds.id}/${today}`).expect(204);
      await env.api().delete(`/api/tasks/${beds.id}/2026-1-1`).expect(400);
      expect(await task(beds.id)).toMatchObject({ removed: today });
      const d = await data();
      expect(Object.keys(d.checks[yesterday]!)).toEqual([beds.id]);
      expect(d.checks[today]).toBeUndefined();
      await env.api().put(`/api/checks/${today}/${beds.id}`).send({ done: true }).expect(404);
    });

    it('removing a task on the day it was added deletes it', async () => {
      await env.api().delete(`/api/tasks/${bins.id}/${today}`).expect(204);
      expect(await task(bins.id)).toBeUndefined();
      await env.api().delete(`/api/tasks/${bins.id}/${today}`).expect(404);
    });
  });

  describe('removing', () => {
    it('a group drops its departures and multipliers', async () => {
      const g = (await env.api().post('/api/groups').send({ name: 'TRIPLE' })).body as Group;
      await env
        .api()
        .patch(`/api/items/${towel.id}`)
        .send({ multipliers: { [g.id]: 1 } });
      await env.api().put(`/api/departures/${g.id}/2026-10-05`).send({ d: 2 });
      await env.api().delete(`/api/groups/${g.id}`).expect(204);
      const d = await data();
      expect(d.groupRecords[g.id]).toBeUndefined();
      expect(d.items[0]!.multipliers[g.id]).toBeUndefined();
    });

    it('a room keeps its counts (they still count in the totals)', async () => {
      await env.api().delete(`/api/locations/${floor1.id}`).expect(204);
      const d = await data();
      expect(d.locations).toEqual([]);
      expect(d.counts['2026-10-02']).toEqual({ [floor1.id]: { [towel.id]: 12 } });
    });
  });

  describe('backup', () => {
    it('restores an old-format backup, counts included', async () => {
      const backup = {
        items: [{ id: '1', name: 'Pillow case', multipliers: { g_1: 2 } }],
        records: { '1': { '2026-10-14': { c: '', i: 25, m: null, mc: null } } },
        groups: [{ id: 'g_1', name: 'DOUBLE' }],
        groupRecords: { g_1: { '2026-10-15': { d: '' } } },
        locations: [{ id: 'l_1', name: 'Cleaning room' }],
        counts: { '2026-10-15': { l_1: { '1': 5 } } },
      };
      await env.api().post('/api/restore').send(backup).expect(200);
      const d = await data();
      expect(d.items).toEqual(backup.items);
      expect(d.records).toEqual({ '1': { '2026-10-14': { i: 25 } } });
      expect(d.groupRecords).toEqual({});
      expect(d.counts).toEqual(backup.counts);
    });

    it('rejects files that are not backups', async () => {
      await env.api().post('/api/restore').send({ foo: 1 }).expect(400);
    });

    it('writes the database file, and a start-of-day copy before the first change', async () => {
      await env.db.close();
      const file = JSON.parse(readFileSync(join(env.dir, 'db.json'), 'utf8')) as StockData;
      expect(file.items[0]!.name).toBe('Pillow case');
      expect(existsSync(join(env.dir, 'backups'))).toBe(true);
      const copies = readdirSync(join(env.dir, 'backups'));
      expect(copies).toHaveLength(1);
      // The first change of the day was creating "Towel": the copy is the empty file from before it
      const copy = JSON.parse(readFileSync(join(env.dir, 'backups', copies[0]!), 'utf8'));
      expect(copy.items).toEqual([]);
    });
  });
});
