import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, formatDate, todayLocal } from '@app/shared';
import { setup, WORKER_PIN, type TestEnv } from './helpers';

describe('QR counter access', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  /** A cookie-keeping client that opened the QR link with `token`. */
  const link = async (token: string) => {
    const agent = env.agent();
    const res = await agent.post('/api/auth/link').send({ token }).expect(200);
    expect(res.body).toEqual({ role: 'counter' });
    return agent;
  };

  it('starts without a QR code; creating one shows it as active', async () => {
    expect((await env.api().get('/api/auth/qr').expect(200)).body).toEqual({ active: false });
    const res = await env.api().post('/api/auth/qr').expect(201);
    expect(res.body.token).toMatch(/^[\w-]{30,}$/);
    const status = (await env.api().get('/api/auth/qr').expect(200)).body;
    expect(status.active).toBe(true);
    expect(status.createdAt).toBe(res.body.createdAt);
    expect(status).not.toHaveProperty('token');
  });

  it('linking with the token gives a counter session', async () => {
    const { token } = (await env.api().post('/api/auth/qr').expect(201)).body;
    const counter = await link(token);
    expect((await counter.get('/api/auth/me').expect(200)).body).toEqual({ role: 'counter' });
    const cookie = String(
      (await env.request().post('/api/auth/link').send({ token })).headers['set-cookie'],
    );
    expect(cookie).toMatch(/sm_session=.*HttpOnly/i);
  });

  it('rejects a wrong or missing token', async () => {
    await env.api().post('/api/auth/qr').expect(201);
    const res = await env.request().post('/api/auth/link').send({ token: 'nope' }).expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    await env.request().post('/api/auth/link').send({}).expect(400);
  });

  it("a counter reads the data and counts today's rooms, nothing else", async () => {
    const item = (await env.api().post('/api/items').send({ name: 'Towel' }).expect(201)).body;
    const group = (await env.api().post('/api/groups').send({ name: 'Double' }).expect(201)).body;
    const room = (await env.api().post('/api/locations').send({ name: 'F1' }).expect(201)).body;
    const task = (
      await env.api().post('/api/tasks').send({ name: 'Beds', from: '2026-01-01' }).expect(201)
    ).body;
    const { token } = (await env.api().post('/api/auth/qr').expect(201)).body;
    const c = await link(token);
    const today = formatDate(todayLocal());
    const yesterday = formatDate(addDays(todayLocal(), -1));
    const tomorrow = formatDate(addDays(todayLocal(), 1));

    await c.get('/api/data').expect(200);
    const day = (
      await c.put(`/api/counts/${today}/${room.id}/${item.id}`).send({ value: 3 }).expect(200)
    ).body;
    expect(day).toEqual({ [room.id]: { [item.id]: 3 } });

    const forbidden = [
      () => c.put(`/api/counts/${yesterday}/${room.id}/${item.id}`).send({ value: 1 }),
      () => c.put(`/api/counts/${tomorrow}/${room.id}/${item.id}`).send({ value: 1 }),
      () => c.patch(`/api/records/${item.id}/${today}`).send({ i: 5 }),
      () => c.put(`/api/departures/${group.id}/${today}`).send({ d: 2 }),
      () => c.put(`/api/checks/${today}/${task.id}`).send({ done: true }),
      () => c.put(`/api/notes/${today}`).send({ text: 'hi' }),
      () => c.post('/api/items').send({ name: 'Soap' }),
      () => c.post('/api/locations').send({ name: 'F2' }),
      () => c.post('/api/tasks').send({ name: 'Bins', from: today }),
      () => c.post('/api/restore').send({}),
      () => c.put('/api/auth/pins').send({ role: 'worker', pin: '5555' }),
      () => c.get('/api/auth/qr'),
      () => c.post('/api/auth/qr'),
      () => c.delete('/api/auth/qr'),
    ];
    for (const [n, send] of forbidden.entries()) {
      const res = await send();
      expect(res.status, `request #${n}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    const data = (await env.api().get('/api/data').expect(200)).body;
    expect(data.counts).toEqual({ [today]: { [room.id]: { [item.id]: 3 } } });
  });

  it('only the admin manages QR codes', async () => {
    const w = await env.login(WORKER_PIN);
    await w.get('/api/auth/qr').expect(403);
    await w.post('/api/auth/qr').expect(403);
    await w.delete('/api/auth/qr').expect(403);
    await env.request().post('/api/auth/qr').expect(401);
  });

  it('regenerating ends the old link and its sessions', async () => {
    const old = (await env.api().post('/api/auth/qr').expect(201)).body.token;
    const c = await link(old);
    const fresh = (await env.api().post('/api/auth/qr').expect(201)).body.token;
    expect(fresh).not.toBe(old);

    await c.get('/api/data').expect(401);
    await env.request().post('/api/auth/link').send({ token: old }).expect(401);
    await (await link(fresh)).get('/api/data').expect(200);
  });

  it('revoking ends the link and its sessions, but not the PIN logins', async () => {
    const { token } = (await env.api().post('/api/auth/qr').expect(201)).body;
    const c = await link(token);
    const w = await env.login(WORKER_PIN);
    await env.api().delete('/api/auth/qr').expect(204);

    await c.get('/api/data').expect(401);
    await env.request().post('/api/auth/link').send({ token }).expect(401);
    expect((await env.api().get('/api/auth/qr').expect(200)).body).toEqual({ active: false });
    await w.get('/api/data').expect(200);
    await env.api().get('/api/data').expect(200);
  });
});
