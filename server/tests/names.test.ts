import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { displayName, NAME_LANGS, type Localized, type StockData } from '@app/shared';
import { migrations } from '../src/db/sqlite/migrations';
import { setup, type TestEnv } from './helpers';

/** A database as it was before localized names: migrations 1–6, plain names in mixed languages. */
function oldDb(dir: string) {
  const sql = new Database(join(dir, 'stock.db'));
  sql.exec(
    'CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  for (const m of migrations.filter((m) => m.id <= 6)) {
    sql.exec(m.sql);
    sql.prepare('INSERT INTO _migrations VALUES (?, ?, ?)').run(m.id, m.name, 'then');
  }
  sql.exec(`
    INSERT INTO items (id, name, pos) VALUES ('i1', 'Rätik', 0), ('i2', 'Soap', 1);
    INSERT INTO room_types (id, name, pos) VALUES ('t1', 'Двухместный', 0);
    INSERT INTO room_units (id, name, pos) VALUES ('u1', 'Voodi', 0);
    INSERT INTO room_statuses (id, name, color, pos) VALUES ('s1', 'Korras', 'green', 0);
  `);
  sql.close();
}

const BASE = {
  items: ['Rätik', 'Soap'],
  roomTypes: ['Двухместный'],
  roomUnits: ['Voodi'],
  roomStatuses: ['Korras'],
};

describe('names in several languages', () => {
  let env: TestEnv;
  afterEach(async () => {
    await env.cleanup();
  });
  const data = async (): Promise<StockData> => (await env.api().get('/api/data').expect(200)).body;

  it('an old database upgrades with every name unchanged, the base name in every language', async () => {
    env = await setup(oldDb);
    const d = await data();
    for (const [key, names] of Object.entries(BASE)) {
      const list = d[key as keyof typeof BASE] as Localized[];
      expect(list.map((e) => e.name)).toEqual(names);
      expect(list.every((e) => e.names === undefined)).toBe(true);
      for (const lang of NAME_LANGS) expect(list.map((e) => displayName(e, lang))).toEqual(names);
    }
  });

  it('renaming in en keeps the base (et) name; renaming without a language changes the base', async () => {
    env = await setup();
    const api = env.api();
    const item = (await api.post('/api/items').send({ name: 'Rätik' }).expect(201)).body;
    const renamed = (
      await api.patch(`/api/items/${item.id}`).send({ name: 'Towel', lang: 'en' }).expect(200)
    ).body;
    expect(renamed).toMatchObject({ name: 'Rätik', names: { en: 'Towel' } });
    await api.patch(`/api/items/${item.id}`).send({ name: 'Полотенце', lang: 'ru' }).expect(200);
    await api.patch(`/api/items/${item.id}`).send({ name: 'Towel', lang: 'de' }).expect(400);

    const unit = (await api.post('/api/room-units').send({ name: 'Voodi' }).expect(201)).body;
    expect(
      (await api.patch(`/api/room-units/${unit.id}`).send({ name: 'Bed', lang: 'en' }).expect(200))
        .body,
    ).toEqual({ id: unit.id, name: 'Voodi', names: { en: 'Bed' }, group: 'units' });
    const type = (await api.post('/api/room-types').send({ name: 'Kahene' }).expect(201)).body;
    await api.patch(`/api/room-types/${type.id}`).send({ name: 'Double', lang: 'en' }).expect(200);
    await api.patch(`/api/room-types/${type.id}`).send({ name: 'Kahekohaline' }).expect(200);
    const status = (
      await api.post('/api/room-statuses').send({ name: 'Katki', color: 'red' }).expect(201)
    ).body;
    await api
      .patch(`/api/room-statuses/${status.id}`)
      .send({ name: 'Broken', lang: 'en' })
      .expect(200);

    const d = await data();
    expect(d.items[0]).toMatchObject({ name: 'Rätik', names: { en: 'Towel', ru: 'Полотенце' } });
    expect(d.roomUnits[0]).toEqual({
      id: unit.id,
      name: 'Voodi',
      names: { en: 'Bed' },
      group: 'units',
    });
    expect(d.roomTypes[0]).toEqual({ id: type.id, name: 'Kahekohaline', names: { en: 'Double' } });
    const s = d.roomStatuses.find((x) => x.id === status.id)!;
    expect(s).toEqual({ id: status.id, name: 'Katki', color: 'red', names: { en: 'Broken' } });
    // the other statuses (the defaults, stored on the first change) have no versions
    expect(d.roomStatuses.filter((x) => x.names)).toHaveLength(1);
  });

  it('saving a name unchanged in a language stores that version (the base text confirmed)', async () => {
    env = await setup();
    const api = env.api();
    const item = (await api.post('/api/items').send({ name: 'Rätik' }).expect(201)).body;
    await api.patch(`/api/items/${item.id}`).send({ name: 'Rätik', lang: 'et' }).expect(200);
    const unit = (await api.post('/api/room-units').send({ name: 'Voodi' }).expect(201)).body;
    await api.patch(`/api/room-units/${unit.id}`).send({ name: 'Voodi', lang: 'et' }).expect(200);
    const d = await data();
    expect(d.items[0]).toMatchObject({ name: 'Rätik', names: { et: 'Rätik' } });
    expect(d.roomUnits[0]).toMatchObject({ name: 'Voodi', names: { et: 'Voodi' } });
  });

  it('backup and restore carry every version; an old backup restores with plain names', async () => {
    env = await setup();
    const api = env.api();
    const backup = {
      items: [
        { id: 'i1', name: 'Rätik', names: { en: 'Towel', ru: 'Полотенце' }, multipliers: {} },
      ],
      roomTypes: [{ id: 't1', name: 'Kahene', names: { en: 'Double' } }],
      roomUnits: [{ id: 'u1', name: 'Voodi', names: { ru: 'Кровать' }, group: 'g1' }],
      roomUnitGroups: [{ id: 'g1', name: 'Mööbel', names: { en: 'Furniture' } }],
      roomStatuses: [{ id: 's1', name: 'Korras', color: 'green', names: { en: 'OK' } }],
    };
    await api.post('/api/restore').send(backup).expect(200);
    const d = await data();
    expect(d.items).toEqual(backup.items);
    expect(d.roomTypes).toEqual(backup.roomTypes);
    expect(d.roomUnits).toEqual(backup.roomUnits);
    expect(d.roomUnitGroups).toEqual(backup.roomUnitGroups);
    expect(d.roomStatuses).toEqual(backup.roomStatuses);
    // and the downloaded data restores to the same
    await api.post('/api/restore').send(d).expect(200);
    expect(await data()).toEqual(d);

    await api
      .post('/api/restore')
      .send({ items: [{ id: 'i1', name: 'Rätik' }], roomUnits: [{ id: 'u1', name: 'Voodi' }] })
      .expect(200);
    const old = await data();
    expect(old.items).toEqual([{ id: 'i1', name: 'Rätik', multipliers: {} }]);
    for (const lang of NAME_LANGS) expect(displayName(old.roomUnits[0]!, lang)).toBe('Voodi');
  });
});
