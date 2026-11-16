import { afterEach, describe, expect, it } from 'vitest';
import type { StockData } from '@app/shared';
import { setup, type TestEnv } from './helpers';

describe('a create stores the name in the creating language', () => {
  let env: TestEnv;
  afterEach(async () => {
    await env.cleanup();
  });

  it('every create route stores the lang override; without lang only the base name', async () => {
    env = await setup();
    const api = env.api();
    const item = (await api.post('/api/items').send({ name: 'Rätik', lang: 'et' }).expect(201))
      .body;
    expect(item).toMatchObject({ name: 'Rätik', names: { et: 'Rätik' } });
    const type = (
      await api.post('/api/room-types').send({ name: 'Kahene', lang: 'et' }).expect(201)
    ).body;
    const group = (
      await api.post('/api/room-unit-groups').send({ name: 'Vannituba', lang: 'et' }).expect(201)
    ).body;
    expect(group).toMatchObject({ names: { et: 'Vannituba' } });
    const unit = (
      await api
        .post('/api/room-units')
        .send({ name: 'Bed', group: group.id, lang: 'en' })
        .expect(201)
    ).body;
    expect(unit).toMatchObject({ name: 'Bed', group: group.id, names: { en: 'Bed' } });
    const status = (
      await api
        .post('/api/room-statuses')
        .send({ name: 'Сломано', color: 'red', lang: 'ru' })
        .expect(201)
    ).body;
    expect(status).toMatchObject({ names: { ru: 'Сломано' } });
    const plain = (await api.post('/api/items').send({ name: 'Seep' }).expect(201)).body;
    expect(plain.names).toBeUndefined();
    await api.post('/api/items').send({ name: 'X', lang: 'de' }).expect(400);

    const d: StockData = (await api.get('/api/data').expect(200)).body;
    expect(d.items.find((i) => i.id === item.id)!.names).toEqual({ et: 'Rätik' });
    expect(d.items.find((i) => i.id === plain.id)!.names).toBeUndefined();
    expect(d.roomTypes.find((t) => t.id === type.id)!.names).toEqual({ et: 'Kahene' });
    expect(d.roomUnitGroups.find((g) => g.id === group.id)!.names).toEqual({ et: 'Vannituba' });
    expect(d.roomUnits.find((u) => u.id === unit.id)!.names).toEqual({ en: 'Bed' });
    expect(d.roomStatuses.find((s) => s.id === status.id)!.names).toEqual({ ru: 'Сломано' });
  });
});
