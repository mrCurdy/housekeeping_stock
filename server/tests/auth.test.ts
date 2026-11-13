import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_PIN, HOUSEKEEPER_PIN, RECEPTION_PIN, setup, type TestEnv } from './helpers';

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
    const res = await env
      .request()
      .post('/api/auth/login')
      .send({ pin: HOUSEKEEPER_PIN })
      .expect(200);
    expect(res.body).toEqual({ role: 'housekeeper' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/sm_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=31536000/);

    const admin = await env.login(ADMIN_PIN);
    expect((await admin.get('/api/auth/me').expect(200)).body).toEqual({ role: 'admin' });
    const reception = await env.login(RECEPTION_PIN);
    expect((await reception.get('/api/auth/me').expect(200)).body).toEqual({ role: 'reception' });
    await reception.get('/api/data').expect(200);
  });

  it('rejects a wrong or malformed PIN', async () => {
    const res = await env.request().post('/api/auth/login').send({ pin: '9999' }).expect(401);
    expect(res.headers['set-cookie']).toBeUndefined();
    await env.request().post('/api/auth/login').send({ pin: '12' }).expect(400);
    await env.request().get('/api/auth/me').set('Cookie', 'sm_session=forged').expect(401);
  });

  it('logout ends the session', async () => {
    const worker = await env.login(HOUSEKEEPER_PIN);
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

  it('housekeeper and reception each do their own work and get 403 on the rest', async () => {
    const item = (await env.api().post('/api/items').send({ name: 'Towel' }).expect(201)).body;
    const group = (await env.api().post('/api/groups').send({ name: 'Double' }).expect(201)).body;
    const room = (await env.api().post('/api/locations').send({ name: 'F1' }).expect(201)).body;
    const task = (
      await env.api().post('/api/tasks').send({ name: 'Beds', from: '2026-01-01' }).expect(201)
    ).body;
    const card = (await env.api().post('/api/rooms').send({ number: '7' }).expect(201)).body;
    const unit = (await env.api().post('/api/room-units').send({ name: 'Bed' }).expect(201)).body;
    const h = await env.login(HOUSEKEEPER_PIN);
    const r = await env.login(RECEPTION_PIN);
    type Agent = typeof h;

    const cleaning = (a: Agent) =>
      a.post(`/api/rooms/${card.id}/cleanings`).send({ date: '2026-01-01', by: 'Mari' });
    const count = (a: Agent) =>
      a.put(`/api/counts/2026-01-01/${room.id}/${item.id}`).send({ value: 3 });
    const check = (a: Agent) => a.put(`/api/checks/2026-01-01/${task.id}`).send({ done: true });
    const note = (a: Agent) => a.put('/api/notes/2026-01-01').send({ text: 'hi' });
    const record = (a: Agent) => a.patch(`/api/records/${item.id}/2026-01-01`).send({ i: 5 });
    const departure = (a: Agent) => a.put(`/api/departures/${group.id}/2026-01-01`).send({ d: 2 });

    // allowed
    expect((await cleaning(h)).status).toBe(201);
    expect((await count(h)).status).toBe(200);
    expect((await check(r)).status).toBe(200);
    expect((await note(r)).status).toBe(200);

    // admin-only, for both
    const adminOnly = (w: Agent) => [
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
      () => w.post('/api/task-groups').send({ name: 'Service' }),
      () => w.patch('/api/task-groups/default').send({ name: 'x' }),
      () => w.put('/api/task-groups/order').send({ ids: [] }),
      () => w.delete('/api/task-groups/default'),
      () => w.put('/api/stock-cards/order').send({ order: [] }),
      () => w.patch('/api/settings').send({ saluteText: 'Hi' }),
      () => w.delete(`/api/tasks/${task.id}/2026-01-01`),
      () => w.post('/api/restore').send({}),
      () => w.put('/api/auth/pins').send({ role: 'housekeeper', pin: '5555' }),
      ...['room-units', 'room-types', 'room-statuses'].flatMap((list) => [
        () => w.post(`/api/${list}`).send({ name: 'X', color: 'blue' }),
        () => w.patch(`/api/${list}/ok`).send({ name: 'X' }),
        () => w.delete(`/api/${list}/ok`),
        () => w.put(`/api/${list}/order`).send({ ids: [] }),
      ]),
      () => w.patch('/api/settings').send({ cleanGreenDays: 3 }),
      () => w.post('/api/rooms').send({ number: '101', note: 'x' }),
      () => w.patch(`/api/rooms/${card.id}`).send({ note: 'Sea view' }),
      () => w.delete(`/api/rooms/${card.id}`),
      () =>
        w.put(`/api/rooms/${card.id}/units/${unit.id}`).send({ status: 'attention', by: 'Mari' }),
      // nobody but the admin does the daily stock work
      () => record(w),
      () => departure(w),
    ];
    const forbidden = [
      ...adminOnly(h).map((send) => ({ who: 'housekeeper', send })),
      ...adminOnly(r).map((send) => ({ who: 'reception', send })),
      ...[check, note].map((f) => ({ who: 'housekeeper', send: () => f(h) })),
      ...[cleaning, count].map((f) => ({ who: 'reception', send: () => f(r) })),
    ];
    for (const [n, { who, send }] of forbidden.entries()) {
      const res = await send();
      expect(res.status, `${who} request #${n}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    // nothing changed
    const data = (await env.api().get('/api/data').expect(200)).body;
    expect(data.items.map((i: { name: string }) => i.name)).toEqual(['Towel']);
    expect(data.tasks).toHaveLength(1);
    expect(data.rooms).toHaveLength(1);
    expect(data.rooms[0].note ?? '').toBe('');
    expect(data.unitStatus ?? {}).toEqual({});
    expect(data.records[item.id]?.['2026-01-01']?.i).toBeUndefined();
    expect(data.departures ?? {}).toEqual({});
    expect(data.cleanings[card.id]).toHaveLength(1);
  });

  it('changing the housekeeper PIN logs out every housekeeper, not reception', async () => {
    const w1 = await env.login(HOUSEKEEPER_PIN);
    const w2 = await env.login(HOUSEKEEPER_PIN);
    const rec = await env.login(RECEPTION_PIN);
    await env.api().put('/api/auth/pins').send({ role: 'housekeeper', pin: '5555' }).expect(204);
    await w1.get('/api/auth/me').expect(401);
    await w2.get('/api/auth/me').expect(401);
    await rec.get('/api/auth/me').expect(200);
    await env.api().get('/api/auth/me').expect(200);
    await env.request().post('/api/auth/login').send({ pin: HOUSEKEEPER_PIN }).expect(401);
    expect((await env.login('5555').then((a) => a.get('/api/auth/me'))).body.role).toBe(
      'housekeeper',
    );
  });

  it('changing the admin PIN logs out the other admins but not this one', async () => {
    const other = await env.login(ADMIN_PIN);
    const worker = await env.login(HOUSEKEEPER_PIN);
    await env.api().put('/api/auth/pins').send({ role: 'admin', pin: '4321' }).expect(204);
    await env.api().get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
    await worker.get('/api/auth/me').expect(200);
    await env.request().post('/api/auth/login').send({ pin: ADMIN_PIN }).expect(401);
    await env.login('4321');
  });

  it("a PIN must differ from every other role's PIN", async () => {
    const put = (role: string, pin: string) => env.api().put('/api/auth/pins').send({ role, pin });
    const res = await put('admin', HOUSEKEEPER_PIN).expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    await put('admin', RECEPTION_PIN).expect(400);
    await put('housekeeper', ADMIN_PIN).expect(400);
    await put('housekeeper', RECEPTION_PIN).expect(400);
    await put('reception', ADMIN_PIN).expect(400);
    await put('reception', HOUSEKEEPER_PIN).expect(400);
    await put('housekeeper', '12345').expect(400);
    await put('counter', '5555').expect(400);
    await put('worker', '5555').expect(400);
    // setting the same PIN again is fine
    await put('housekeeper', HOUSEKEEPER_PIN).expect(204);
    await put('reception', RECEPTION_PIN).expect(204);
  });

  it('PINs are stored hashed', async () => {
    const hashes = await env.db.auth.pinHashes();
    expect(Object.keys(hashes).sort()).toEqual(['admin', 'housekeeper', 'reception']);
    expect(JSON.stringify(hashes)).not.toContain(ADMIN_PIN);
  });
});

describe('PIN seeding', () => {
  const roleOf = async (env: TestEnv, pin: string) =>
    (await (await env.login(pin)).get('/api/auth/me')).body.role;

  it('seeds ADMIN_PIN, HOUSEKEEPER_PIN and RECEPTION_PIN from env on first start', async () => {
    const env = await setup(undefined, {
      ADMIN_PIN: '5111',
      HOUSEKEEPER_PIN: '5222',
      RECEPTION_PIN: '5333',
    });
    try {
      await env.request().post('/api/auth/login').send({ pin: ADMIN_PIN }).expect(401);
      expect(await roleOf(env, '5111')).toBe('admin');
      expect(await roleOf(env, '5222')).toBe('housekeeper');
      expect(await roleOf(env, '5333')).toBe('reception');
    } finally {
      await env.cleanup();
    }
  });

  it('WORKER_PIN still works as the housekeeper PIN', async () => {
    const env = await setup(undefined, { ADMIN_PIN: '5111', WORKER_PIN: '5222' });
    try {
      expect(await roleOf(env, '5222')).toBe('housekeeper');
      expect(await roleOf(env, RECEPTION_PIN)).toBe('reception');
    } finally {
      await env.cleanup();
    }
  });

  it('does not overwrite PINs changed in the app', async () => {
    const env = await setup();
    try {
      await env.api().put('/api/auth/pins').send({ role: 'housekeeper', pin: '5555' }).expect(204);
      await env.db.close();
      await env.db.init();
      const { seedPins } = await import('../src/auth/pins');
      const { loadConfig } = await import('../src/config');
      await seedPins(loadConfig({ NODE_ENV: 'test' }), env.db);
      await env.login('5555');
      await env.request().post('/api/auth/login').send({ pin: HOUSEKEEPER_PIN }).expect(401);
    } finally {
      await env.cleanup();
    }
  });

  it('rejects equal or malformed PINs in env', async () => {
    const { loadConfig } = await import('../src/config');
    expect(() => loadConfig({ ADMIN_PIN: '1111', WORKER_PIN: '1111' })).toThrow(/differ/);
    expect(() => loadConfig({ ADMIN_PIN: '1111', RECEPTION_PIN: '1111' })).toThrow(/differ/);
    expect(() => loadConfig({ HOUSEKEEPER_PIN: '2222', RECEPTION_PIN: '2222' })).toThrow(/differ/);
    expect(() => loadConfig({ ADMIN_PIN: '11' })).toThrow(/ADMIN_PIN/);
  });

  it('treats empty PINs in env (as docker compose passes them) as unset', async () => {
    const { loadConfig } = await import('../src/config');
    const config = loadConfig({
      ADMIN_PIN: '',
      HOUSEKEEPER_PIN: '',
      RECEPTION_PIN: '',
      WORKER_PIN: '',
    });
    expect(config.ADMIN_PIN).toBeUndefined();
    expect(config.HOUSEKEEPER_PIN).toBeUndefined();
    expect(config.RECEPTION_PIN).toBeUndefined();
  });
});
