import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOUSEKEEPER_PIN, RECEPTION_PIN, setup, type TestEnv } from './helpers';

describe('editable role permissions', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  const setPerms = (rolePermissions: unknown) =>
    env.api().patch('/api/settings').send({ rolePermissions });

  it('turning daily on for reception lets it post a departure; the session stays valid', async () => {
    const group = (await env.api().post('/api/groups').send({ name: 'Double' }).expect(201)).body;
    const r = await env.login(RECEPTION_PIN);
    const departure = () => r.put(`/api/departures/${group.id}/2026-01-01`).send({ d: 2 });
    await departure().expect(403);

    const res = await setPerms({
      housekeeper: ['count', 'cleaning'],
      reception: ['daily', 'checklist'],
    }).expect(200);
    expect(res.body.rolePermissions).toEqual({
      housekeeper: ['count', 'cleaning'],
      reception: ['daily', 'checklist'],
    });
    await departure().expect(200);
  });

  it('turning cleaning off for the housekeeper → 403', async () => {
    const card = (await env.api().post('/api/rooms').send({ number: '7' }).expect(201)).body;
    const h = await env.login(HOUSEKEEPER_PIN);
    const cleaning = () =>
      h.post(`/api/rooms/${card.id}/cleanings`).send({ date: '2026-01-01', by: 'Mari' });
    await cleaning().expect(201);
    await setPerms({ housekeeper: ['count'], reception: ['checklist'] }).expect(200);
    await cleaning().expect(403);
  });

  it('refuses a non-staff permission or a missing role (400), and staff may not change it', async () => {
    await setPerms({ housekeeper: ['setup'], reception: [] }).expect(400);
    await setPerms({ housekeeper: ['count'] }).expect(400);
    const h = await env.login(HOUSEKEEPER_PIN);
    await h
      .patch('/api/settings')
      .send({ rolePermissions: { housekeeper: ['daily'], reception: [] } })
      .expect(403);
  });

  it('the defaults are not stored', async () => {
    await setPerms({ housekeeper: ['daily'], reception: [] }).expect(200);
    const res = await setPerms({ housekeeper: ['cleaning', 'count'], reception: ['checklist'] });
    expect(res.body.rolePermissions).toBeUndefined();
    const data = (await env.api().get('/api/data').expect(200)).body;
    expect(data.settings.rolePermissions).toBeUndefined();
  });

  it('backup and restore keep the overrides', async () => {
    const perms = { housekeeper: ['daily', 'count'], reception: [] };
    await setPerms(perms).expect(200);
    const backup = (await env.api().get('/api/data').expect(200)).body;
    expect(backup.settings.rolePermissions).toEqual(perms);

    await setPerms({ housekeeper: ['count', 'cleaning'], reception: ['checklist'] }).expect(200);
    const restored = (await env.api().post('/api/restore').send(backup).expect(200)).body;
    expect(restored.settings.rolePermissions).toEqual(perms);
    const h = await env.login(HOUSEKEEPER_PIN);
    const group = (await env.api().post('/api/groups').send({ name: 'Double' }).expect(201)).body;
    await h.put(`/api/departures/${group.id}/2026-01-01`).send({ d: 1 }).expect(200);
  });
});
