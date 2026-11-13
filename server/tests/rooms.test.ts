import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup, WORKER_PIN, type TestEnv } from './helpers';

describe('room cards API', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const data = async () => (await env.api().get('/api/data').expect(200)).body;

  it('creates, edits and deletes a room; duplicate numbers are 409, unknown ids 404', async () => {
    const type = (await env.api().post('/api/room-types').send({ name: 'Double' }).expect(201))
      .body;
    const room = (
      await env.api().post('/api/rooms').send({ number: '101', type: type.id }).expect(201)
    ).body;
    expect(room).toMatchObject({ number: '101', type: type.id });
    await env.api().post('/api/rooms').send({ number: '101' }).expect(409);
    await env.api().post('/api/rooms').send({ number: '102', type: 'nope' }).expect(404);
    await env.api().post('/api/rooms').send({ number: '' }).expect(400);

    const other = (await env.api().post('/api/rooms').send({ number: '102' }).expect(201)).body;
    await env.api().patch(`/api/rooms/${other.id}`).send({ number: '101' }).expect(409);
    await env.api().patch('/api/rooms/nope').send({ number: '103' }).expect(404);
    const patched = (
      await env.api().patch(`/api/rooms/${room.id}`).send({ number: '201', type: '' }).expect(200)
    ).body;
    expect(patched.number).toBe('201');
    expect(patched.type).toBeUndefined();

    await env.api().delete(`/api/rooms/${other.id}`).expect(204);
    await env.api().delete(`/api/rooms/${other.id}`).expect(404);
    expect((await data()).rooms.map((r: { number: string }) => r.number)).toEqual(['201']);
  });

  it('saves a trimmed note, clears it with an empty one and rejects 501 characters', async () => {
    const room = (
      await env.api().post('/api/rooms').send({ number: '101', note: '  Sea view ' }).expect(201)
    ).body;
    expect(room.note).toBe('Sea view');
    const res = await env
      .api()
      .patch(`/api/rooms/${room.id}`)
      .send({ note: ' bathtub, no shower ' })
      .expect(200);
    expect(res.body.note).toBe('bathtub, no shower');
    expect((await data()).rooms[0].note).toBe('bathtub, no shower');
    await env
      .api()
      .patch(`/api/rooms/${room.id}`)
      .send({ note: 'x'.repeat(501) })
      .expect(400);
    await env.api().patch(`/api/rooms/${room.id}`).send({ note: '' }).expect(200);
    expect((await data()).rooms[0]).not.toHaveProperty('note');
  });

  it('sets unit statuses and records cleanings', async () => {
    const room = (await env.api().post('/api/rooms').send({ number: '101' }).expect(201)).body;
    const unit = (await env.api().post('/api/room-units').send({ name: 'Bed' }).expect(201)).body;
    const set = await env
      .api()
      .put(`/api/rooms/${room.id}/units/${unit.id}`)
      .send({ status: 'fix', by: 'Anna', note: 'Broken leg' })
      .expect(200);
    expect(set.body).toMatchObject({ status: 'fix', by: 'Anna', note: 'Broken leg' });
    await env
      .api()
      .put(`/api/rooms/${room.id}/units/${unit.id}`)
      .send({ status: 'nope', by: 'Anna' })
      .expect(404);
    await env
      .api()
      .put(`/api/rooms/nope/units/${unit.id}`)
      .send({ status: 'ok', by: 'Anna' })
      .expect(404);
    await env
      .api()
      .put(`/api/rooms/${room.id}/units/${unit.id}`)
      .send({ status: 'ok', by: '' })
      .expect(400);

    await env
      .api()
      .post(`/api/rooms/${room.id}/cleanings`)
      .send({ date: '2026-01-01', by: 'Mari' })
      .expect(201);
    const list = (
      await env
        .api()
        .post(`/api/rooms/${room.id}/cleanings`)
        .send({ date: '2026-01-05', by: 'Anna' })
        .expect(201)
    ).body;
    expect(list.map((c: { date: string }) => c.date)).toEqual(['2026-01-05', '2026-01-01']);
    await env
      .api()
      .post('/api/rooms/nope/cleanings')
      .send({ date: '2026-01-01', by: 'Mari' })
      .expect(404);
    await env
      .api()
      .post(`/api/rooms/${room.id}/cleanings`)
      .send({ date: '1.1.2026', by: 'Mari' })
      .expect(400);
  });

  it('manages units and types: create, rename, reorder, delete', async () => {
    const bed = (await env.api().post('/api/room-units').send({ name: 'Bed' }).expect(201)).body;
    const tv = (await env.api().post('/api/room-units').send({ name: 'TV' }).expect(201)).body;
    await env.api().post('/api/room-units').send({ name: ' ' }).expect(400);
    await env.api().patch(`/api/room-units/${bed.id}`).send({ name: 'Beds' }).expect(200);
    await env.api().patch('/api/room-units/nope').send({ name: 'x' }).expect(404);
    const order = (
      await env
        .api()
        .put('/api/room-units/order')
        .send({ ids: [tv.id, bed.id] })
        .expect(200)
    ).body;
    expect(order.map((u: { name: string }) => u.name)).toEqual(['TV', 'Beds']);
    await env.api().delete(`/api/room-units/${tv.id}`).expect(204);
    await env.api().delete(`/api/room-units/${tv.id}`).expect(404);

    const single = (await env.api().post('/api/room-types').send({ name: 'Single' }).expect(201))
      .body;
    const room = (
      await env.api().post('/api/rooms').send({ number: '1', type: single.id }).expect(201)
    ).body;
    await env.api().patch(`/api/room-types/${single.id}`).send({ name: 'Solo' }).expect(200);
    await env
      .api()
      .put('/api/room-types/order')
      .send({ ids: [single.id] })
      .expect(200);
    await env.api().delete(`/api/room-types/${single.id}`).expect(204);
    const d = await data();
    expect(d.roomUnits.map((u: { name: string }) => u.name)).toEqual(['Beds']);
    expect(d.roomTypes).toEqual([]);
    expect(d.rooms.find((r: { id: string }) => r.id === room.id)).not.toHaveProperty('type');
  });

  it('manages statuses; deleting one resets its units, the last one is 409', async () => {
    const room = (await env.api().post('/api/rooms').send({ number: '101' }).expect(201)).body;
    const unit = (await env.api().post('/api/room-units').send({ name: 'Bed' }).expect(201)).body;
    const blue = (
      await env
        .api()
        .post('/api/room-statuses')
        .send({ name: 'Ordered', color: 'blue' })
        .expect(201)
    ).body;
    await env.api().post('/api/room-statuses').send({ name: 'X', color: 'black' }).expect(400);
    const renamed = (
      await env
        .api()
        .patch(`/api/room-statuses/${blue.id}`)
        .send({ name: 'On order', color: 'teal' })
        .expect(200)
    ).body;
    expect(renamed).toMatchObject({ name: 'On order', color: 'teal' });
    await env.api().patch('/api/room-statuses/nope').send({ name: 'x' }).expect(404);
    await env
      .api()
      .put(`/api/rooms/${room.id}/units/${unit.id}`)
      .send({ status: blue.id, by: 'Anna' })
      .expect(200);
    expect((await data()).unitStatus[room.id][unit.id].status).toBe(blue.id);

    await env.api().delete(`/api/room-statuses/${blue.id}`).expect(204);
    expect((await data()).unitStatus[room.id]?.[unit.id]).toBeUndefined();
    await env.api().delete(`/api/room-statuses/${blue.id}`).expect(404);

    const order = (
      await env
        .api()
        .put('/api/room-statuses/order')
        .send({ ids: ['fix', 'ok'] })
        .expect(200)
    ).body;
    expect(order[0].id).toBe('fix');
    for (const s of order.slice(1)) {
      await env.api().delete(`/api/room-statuses/${s.id}`).expect(204);
    }
    await env.api().delete('/api/room-statuses/fix').expect(409);
    expect((await data()).roomStatuses.map((s: { id: string }) => s.id)).toEqual(['fix']);
  });

  it('checks the cleaning thresholds, also one against the stored other', async () => {
    await env
      .api()
      .patch('/api/settings')
      .send({ cleanGreenDays: 10, cleanYellowDays: 10 })
      .expect(400);
    await env.api().patch('/api/settings').send({ cleanGreenDays: 29 }).expect(400); // default yellow 29
    await env.api().patch('/api/settings').send({ cleanYellowDays: 15 }).expect(400); // default green 15
    await env.api().patch('/api/settings').send({ cleanGreenDays: 0 }).expect(200);
    await env.api().patch('/api/settings').send({ cleanYellowDays: 5 }).expect(200);
    await env.api().patch('/api/settings').send({ cleanGreenDays: 5 }).expect(400);
    const res = await env.api().patch('/api/settings').send({ cleanGreenDays: 4 }).expect(200);
    expect(res.body).toMatchObject({ cleanGreenDays: 4, cleanYellowDays: 5 });
  });

  it('a worker edits the note, changes statuses and cleans a room the admin added', async () => {
    const unit = (await env.api().post('/api/room-units').send({ name: 'Bed' }).expect(201)).body;
    const room = (await env.api().post('/api/rooms').send({ number: '7' }).expect(201)).body;
    const w = await env.login(WORKER_PIN);
    await w.patch(`/api/rooms/${room.id}`).send({ note: 'Sea view' }).expect(200);
    await w
      .put(`/api/rooms/${room.id}/units/${unit.id}`)
      .send({ status: 'attention', by: 'Mari' })
      .expect(200);
    await w
      .post(`/api/rooms/${room.id}/cleanings`)
      .send({ date: '2026-01-01', by: 'Mari' })
      .expect(201);
    await w.delete(`/api/rooms/${room.id}`).expect(204);
  });
});
