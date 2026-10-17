import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_PIN, setup, WORKER_PIN, type TestEnv } from './helpers';

describe('PIN auth', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('health and login need no session; everything else is 401 without one', async () => {
    await env.request().get('/api/health').expect(200);
    const res = await env.request().get('/api/data').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    await env.request().get('/api/auth/me').expect(401);
    await env.request().post('/api/items').send({ name: 'Towel' }).expect(401);
    await env.request().get('/api/nope').expect(401);
  });

  it('logs in with a PIN and works out the role from it', async () => {
    const res = await env.request().post('/api/auth/login').send({ pin: WORKER_PIN }).expect(200);
    expect(res.body).toEqual({ role: 'worker' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/sm_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=31536000/);

    const admin = await env.login(ADMIN_PIN);
    expect((await admin.get('/api/auth/me').expect(200)).body).toEqual({ role: 'admin' });
    const worker = await env.login(WORKER_PIN);
    expect((await worker.get('/api/auth/me').expect(200)).body).toEqual({ role: 'worker' });
    await worker.get('/api/data').expect(200);
  });

  it('rejects a wrong or malformed PIN', async () => {
    const res = await env.request().post('/api/auth/login').send({ pin: '9999' }).expect(401);
    expect(res.headers['set-cookie']).toBeUndefined();
    await env.request().post('/api/auth/login').send({ pin: '12' }).expect(400);
    await env.request().get('/api/auth/me').set('Cookie', 'sm_session=forged').expect(401);
  });

  it('logout ends the session', async () => {
    const worker = await env.login(WORKER_PIN);
    await worker.post('/api/auth/logout').expect(204);
    await worker.get('/api/auth/me').expect(401);
    await worker.get('/api/data').expect(401);
  });

  it('allows 10 wrong PINs per 15 minutes, then 429 even for the right one', async () => {
    for (let n = 0; n < 10; n++) {
      await env.request().post('/api/auth/login').send({ pin: '9999' }).expect(401);
    }
    const res = await env.request().post('/api/auth/login').send({ pin: ADMIN_PIN }).expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('a worker does the daily work but gets 403 on setup, tasks, restore and PINs', async () => {
    const item = (await env.api().post('/api/items').send({ name: 'Towel' }).expect(201)).body;
    const group = (await env.api().post('/api/groups').send({ name: 'Double' }).expect(201)).body;
    const room = (await env.api().post('/api/locations').send({ name: 'F1' }).expect(201)).body;
    const task = (
      await env.api().post('/api/tasks').send({ name: 'Beds', from: '2026-01-01' }).expect(201)
    ).body;
    const w = await env.login(WORKER_PIN);

    // allowed
    await w.patch(`/api/records/${item.id}/2026-01-01`).send({ i: 5 }).expect(200);
    await w.put(`/api/departures/${group.id}/2026-01-01`).send({ d: 2 }).expect(200);
    await w.put(`/api/counts/2026-01-01/${room.id}/${item.id}`).send({ value: 3 }).expect(200);
    await w.put(`/api/checks/2026-01-01/${task.id}`).send({ done: true }).expect(200);
    await w.put('/api/notes/2026-01-01').send({ text: 'hi' }).expect(200);

    // forbidden
    const forbidden = [
      () => w.post('/api/items').send({ name: 'Soap' }),
      () => w.patch(`/api/items/${item.id}`).send({ name: 'Soap' }),
      () => w.delete(`/api/items/${item.id}`),
      () => w.post('/api/groups').send({ name: 'Single' }),
      () => w.delete(`/api/groups/${group.id}`),
      () => w.post('/api/locations').send({ name: 'F2' }),
      () => w.patch(`/api/locations/${room.id}`).send({ name: 'F2' }),
      () => w.post('/api/tasks').send({ name: 'Bins', from: '2026-01-01' }),
      () => w.patch(`/api/tasks/${task.id}`).send({ name: 'Bins', from: '2026-01-01' }),
      () => w.put('/api/tasks/order').send({ ids: [] }),
      () => w.delete(`/api/tasks/${task.id}/2026-01-01`),
      () => w.post('/api/restore').send({}),
      () => w.put('/api/auth/pins').send({ role: 'worker', pin: '5555' }),
    ];
    for (const [n, send] of forbidden.entries()) {
      const res = await send();
      expect(res.status, `request #${n}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    // nothing changed
    const data = (await env.api().get('/api/data').expect(200)).body;
    expect(data.items.map((i: { name: string }) => i.name)).toEqual(['Towel']);
    expect(data.tasks).toHaveLength(1);
  });

  it('changing the worker PIN logs out every worker', async () => {
    const w1 = await env.login(WORKER_PIN);
    const w2 = await env.login(WORKER_PIN);
    await env.api().put('/api/auth/pins').send({ role: 'worker', pin: '5555' }).expect(204);
    await w1.get('/api/auth/me').expect(401);
    await w2.get('/api/auth/me').expect(401);
    await env.api().get('/api/auth/me').expect(200);
    await env.request().post('/api/auth/login').send({ pin: WORKER_PIN }).expect(401);
    expect((await env.login('5555').then((a) => a.get('/api/auth/me'))).body.role).toBe('worker');
  });

  it('changing the admin PIN logs out the other admins but not this one', async () => {
    const other = await env.login(ADMIN_PIN);
    const worker = await env.login(WORKER_PIN);
    await env.api().put('/api/auth/pins').send({ role: 'admin', pin: '4321' }).expect(204);
    await env.api().get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
    await worker.get('/api/auth/me').expect(200);
    await env.request().post('/api/auth/login').send({ pin: ADMIN_PIN }).expect(401);
    await env.login('4321');
  });

  it('the admin and worker PINs must differ', async () => {
    const res = await env
      .api()
      .put('/api/auth/pins')
      .send({ role: 'admin', pin: WORKER_PIN })
      .expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    await env.api().put('/api/auth/pins').send({ role: 'worker', pin: ADMIN_PIN }).expect(400);
    await env.api().put('/api/auth/pins').send({ role: 'worker', pin: '12345' }).expect(400);
    await env.api().put('/api/auth/pins').send({ role: 'counter', pin: '5555' }).expect(400);
    // setting the same PIN again is fine
    await env.api().put('/api/auth/pins').send({ role: 'worker', pin: WORKER_PIN }).expect(204);
  });

  it('PINs are stored hashed', async () => {
    const hashes = await env.db.auth.pinHashes();
    expect(Object.keys(hashes).sort()).toEqual(['admin', 'worker']);
    expect(JSON.stringify(hashes)).not.toContain(ADMIN_PIN);
  });
});

describe('PIN seeding', () => {
  it('seeds ADMIN_PIN and WORKER_PIN from env on first start', async () => {
    const env = await setup(undefined, { ADMIN_PIN: '1111', WORKER_PIN: '2222' });
    try {
      await env.request().post('/api/auth/login').send({ pin: ADMIN_PIN }).expect(401);
      expect((await (await env.login('1111')).get('/api/auth/me')).body.role).toBe('admin');
      expect((await (await env.login('2222')).get('/api/auth/me')).body.role).toBe('worker');
    } finally {
      await env.cleanup();
    }
  });

  it('does not overwrite PINs changed in the app', async () => {
    const env = await setup();
    try {
      await env.api().put('/api/auth/pins').send({ role: 'worker', pin: '5555' }).expect(204);
      await env.db.close();
      await env.db.init();
      const { seedPins } = await import('../src/auth/pins');
      const { loadConfig } = await import('../src/config');
      await seedPins(loadConfig({ NODE_ENV: 'test' }), env.db);
      await env.login('5555');
      await env.request().post('/api/auth/login').send({ pin: WORKER_PIN }).expect(401);
    } finally {
      await env.cleanup();
    }
  });

  it('rejects equal or malformed PINs in env', async () => {
    const { loadConfig } = await import('../src/config');
    expect(() => loadConfig({ ADMIN_PIN: '1111', WORKER_PIN: '1111' })).toThrow(/differ/);
    expect(() => loadConfig({ ADMIN_PIN: '11' })).toThrow(/ADMIN_PIN/);
  });

  it('treats empty PINs in env (as docker compose passes them) as unset', async () => {
    const { loadConfig } = await import('../src/config');
    const config = loadConfig({ ADMIN_PIN: '', WORKER_PIN: '' });
    expect(config.ADMIN_PIN).toBeUndefined();
    expect(config.WORKER_PIN).toBeUndefined();
  });
});
