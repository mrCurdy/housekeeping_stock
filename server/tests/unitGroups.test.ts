import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_UNIT_GROUP_ID, type StockData } from '@app/shared';
import { migrations } from '../src/db/sqlite/migrations';
import { HOUSEKEEPER_PIN, setup, type TestEnv } from './helpers';

/** A database from before unit groups (migrations 1–7) with units in a set order. */
function oldDb(dir: string, withUnits = true) {
  const sql = new Database(join(dir, 'stock.db'));
  sql.exec(
    'CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  for (const m of migrations.filter((m) => m.id <= 7)) {
    sql.exec(m.sql);
    sql.prepare('INSERT INTO _migrations VALUES (?, ?, ?)').run(m.id, m.name, 'then');
  }
  if (withUnits) {
    sql.exec(`
      INSERT INTO room_units (id, name, pos, names) VALUES
        ('u2', 'Shower', 0, NULL), ('u1', 'Voodi', 1, '{"en":"Bed"}');
      INSERT INTO rooms (id, number, type_id, note) VALUES ('r1', '101', NULL, NULL);
      INSERT INTO unit_status (room_id, unit_id, status_id, by, at, note)
        VALUES ('r1', 'u1', 'fix', 'Anna', 'then', NULL);
    `);
  }
  sql.close();
}

describe('room unit groups', () => {
  let env: TestEnv;
  afterEach(async () => {
    await env.cleanup();
  });
  const data = async (): Promise<StockData> => (await env.api().get('/api/data').expect(200)).body;

  it('creates, renames per language, reorders and deletes groups; a group with units stays', async () => {
    env = await setup();
    const api = env.api();
    const bath = (await api.post('/api/room-unit-groups').send({ name: 'Bathroom' }).expect(201))
      .body;
    const tech = (await api.post('/api/room-unit-groups').send({ name: 'Electronics' }).expect(201))
      .body;
    await api.patch(`/api/room-unit-groups/${bath.id}`).send({ name: 'Vannituba', lang: 'et' });
    await api
      .put('/api/room-unit-groups/order')
      .send({ ids: [tech.id, bath.id] })
      .expect(200);
    const unit = (
      await api.post('/api/room-units').send({ name: 'Faucet', group: bath.id }).expect(201)
    ).body;
    expect(unit.group).toBe(bath.id);

    let d = await data();
    expect(d.roomUnitGroups).toEqual([
      { id: tech.id, name: 'Electronics' },
      { id: bath.id, name: 'Bathroom', names: { et: 'Vannituba' } },
    ]);

    const blocked = await api.delete(`/api/room-unit-groups/${bath.id}`).expect(409);
    expect(blocked.body.error.message).toMatch(/move/i);
    await api.delete(`/api/room-unit-groups/${tech.id}`).expect(204);
    await api.delete(`/api/room-unit-groups/${tech.id}`).expect(404);
    d = await data();
    expect(d.roomUnitGroups.map((g) => g.id)).toEqual([bath.id]);
  });

  it('moves a unit into another group, at a place', async () => {
    env = await setup();
    const api = env.api();
    const g1 = (await api.post('/api/room-unit-groups').send({ name: 'A' })).body.id as string;
    const g2 = (await api.post('/api/room-unit-groups').send({ name: 'B' })).body.id as string;
    const add = async (name: string, group: string) =>
      (await api.post('/api/room-units').send({ name, group })).body.id as string;
    const a = await add('a', g1);
    const b = await add('b', g1);
    const c = await add('c', g2);
    await api
      .put('/api/room-units/order')
      .send({ ids: [b, a, c], move: { id: a, group: g2 } })
      .expect(200);
    const d = await data();
    expect(d.roomUnits.map((u) => [u.id, u.group])).toEqual([
      [b, g1],
      [a, g2],
      [c, g2],
    ]);
    // An unknown group: only the order changes
    await api
      .put('/api/room-units/order')
      .send({ ids: [a, b, c], move: { id: a, group: 'nope' } })
      .expect(200);
    expect((await data()).roomUnits.map((u) => [u.id, u.group])).toEqual([
      [a, g2],
      [b, g1],
      [c, g2],
    ]);
  });

  it('a unit added without a group goes to the first one, or a created default group', async () => {
    env = await setup();
    const api = env.api();
    const unit = (await api.post('/api/room-units').send({ name: 'Bed' }).expect(201)).body;
    expect(unit.group).toBe(DEFAULT_UNIT_GROUP_ID);
    expect((await data()).roomUnitGroups).toEqual([{ id: DEFAULT_UNIT_GROUP_ID, name: '' }]);
  });

  it('only the setup permission changes groups', async () => {
    env = await setup();
    const hk = await env.login(HOUSEKEEPER_PIN);
    await hk.post('/api/room-unit-groups').send({ name: 'X' }).expect(403);
    await hk.put('/api/room-unit-groups/order').send({ ids: [] }).expect(403);
    await hk.patch('/api/room-unit-groups/x').send({ name: 'X' }).expect(403);
    await hk.delete('/api/room-unit-groups/x').expect(403);
  });

  it('an old database puts its units into one group, order, names and statuses kept', async () => {
    env = await setup((dir) => oldDb(dir));
    const d = await data();
    expect(d.roomUnitGroups).toEqual([{ id: DEFAULT_UNIT_GROUP_ID, name: '' }]);
    expect(d.roomUnits).toEqual([
      { id: 'u2', name: 'Shower', group: DEFAULT_UNIT_GROUP_ID },
      { id: 'u1', name: 'Voodi', names: { en: 'Bed' }, group: DEFAULT_UNIT_GROUP_ID },
    ]);
    expect(d.unitStatus.r1?.u1?.status).toBe('fix');
  });

  it('an old database without units gets no group', async () => {
    env = await setup((dir) => oldDb(dir, false));
    expect((await data()).roomUnitGroups).toEqual([]);
  });

  it('backup and restore keep the groups; an old backup puts its units in one group', async () => {
    env = await setup();
    const api = env.api();
    const g = (await api.post('/api/room-unit-groups').send({ name: 'Bath' })).body.id as string;
    await api.patch(`/api/room-unit-groups/${g}`).send({ name: 'Vann', lang: 'et' });
    await api.post('/api/room-units').send({ name: 'Faucet', group: g });
    const backup = await data();
    await api.post('/api/restore').send(backup).expect(200);
    expect(await data()).toEqual(backup);

    await api
      .post('/api/restore')
      .send({ items: [], roomUnits: [{ id: 'u', name: 'Bed' }] })
      .expect(200);
    const d = await data();
    expect(d.roomUnitGroups).toEqual([{ id: DEFAULT_UNIT_GROUP_ID, name: '' }]);
    expect(d.roomUnits).toEqual([{ id: 'u', name: 'Bed', group: DEFAULT_UNIT_GROUP_ID }]);
  });
});
