---
name: auth
description: Fomka's PIN login and roles (admin, housekeeper, reception, counter). Use when adding or changing an API route (it needs a guard), when hiding UI by role, or when changing the role matrix, PINs, sessions or QR access.
---

# Auth: roles, guards, hiding UI

## The matrix (`shared/src/auth.ts`, the only source; the ticks below are the defaults)

| permission  | what                                                                                                                                                                               | admin | housekeeper | reception | counter (QR) |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------- | --------- | ------------ |
| `setup`     | items, groups, rooms (add/rename/delete, items-per-departure), room master setup (units, statuses, types, thresholds), room cards (add, note, number, type, delete, unit statuses) | ✓     |             |           |              |
| `tasks`     | checklist task editing (add/edit/reorder/remove)                                                                                                                                   | ✓     |             |           |              |
| `restore`   | `POST /restore`                                                                                                                                                                    | ✓     |             |           |              |
| `pins`      | `PUT /auth/pins`                                                                                                                                                                   | ✓     |             |           |              |
| `qr`        | `GET/POST/DELETE /auth/qr`                                                                                                                                                         | ✓     |             |           |              |
| `daily`     | departures, records (consumption, income, manual stock)                                                                                                                            | ✓     |             |           |              |
| `checklist` | ticks, notes                                                                                                                                                                       | ✓     |             | ✓         |              |
| `count`     | room counts                                                                                                                                                                        | ✓     | ✓           |           | today only   |
| `cleaning`  | register general cleanings (`POST /rooms/:id/cleanings`)                                                                                                                           | ✓     | ✓           |           |              |

**Editable staff permissions:** the admin can change the housekeeper/reception columns for the four
`STAFF_PERMISSIONS` (`daily`, `checklist`, `count`, `cleaning`) in Settings → Roles (`RolesCard`).
They are `settings.rolePermissions` (`rolePermissionsSchema`, stored as JSON in the `settings` table,
carried by backups; unset or equal to `DEFAULT_ROLE_PERMISSIONS` = not stored). Admin-only permissions
and the `admin`/`counter` roles are fixed. `can(role, perm, settings?)` / `permissionsFor(role, settings)`
read it; without settings they give the defaults.

`PIN_ROLES` = admin, housekeeper, reception (one PIN each, all different). The old `worker` role
became `housekeeper` (migration 6 renamed its PIN and sessions); `can()` gives an unknown role
nothing.

Reading (`GET /data`, Excel, Backup) needs only a login. To change the fixed part or the defaults, edit `FIXED` / `DEFAULT_ROLE_PERMISSIONS`
and `shared/src/auth.test.ts`; never check role names directly elsewhere, always `can(role, perm)`.
A new kind of action gets a new `Permission`. `todayOnly(role)` (true for `counter`) is the date
limit on top of the matrix: the counts route answers 403 for another day, and the UI locks the date.

## Server

- `server/src/auth/middleware.ts`: `session` (cookie → `req.role`, `req.sessionHash`),
  `requireAuth` (mounted in `app.ts` after the public routers: `system`, `auth`), `allow(perm)`.
  `session` also loads `req.settings` (`db.settings.read()`, once per request), and `allow` checks
  `can(req.role, perm, req.settings)`, so a change to the role permissions counts from the next
  request without logging anyone out. Tests: `tests/rolePermissions.test.ts`.
- **Guarding a new route:** a router mounted on its own path gets the guard in `app.ts`
  (`api.use('/things', allow('setup'), thingsRouter(ctx))`). A router mounted at `'/'` guards each
  route inside its file (`r.put('/x/:date', allow('daily'), validateBody(…), …)`), because a guard on
  a `'/'` mount would also turn unknown routes into 403.
- Tests: `server/tests/helpers.ts` gives `api()` (admin agent), `request()` (no session) and
  `login(pin)` (`ADMIN_PIN` 1234 / `HOUSEKEEPER_PIN` 1111 / `RECEPTION_PIN` 0000). Add a 403 case
  to the `adminOnly` list in `tests/auth.test.ts` for every admin-only route (it runs for both
  staff roles). `tests/roles.test.ts`: the upgrade from `worker`.
- PINs: scrypt hashes in `pins` (`auth/pins.ts`); sessions: SHA-256 of the cookie token in
  `sessions` (`auth/sessions.ts`). Storage is `db.auth` (see the `sqlite-db` skill); it isn't part
  of backups. Changing a PIN deletes that role's sessions (except the admin's own). A PIN another
  role has → 400 (`pinTakenBy`). `seedPins` (env `ADMIN_PIN`/`HOUSEKEEPER_PIN` (alias
  `WORKER_PIN`)/`RECEPTION_PIN`, else 1234/1111/0000) gives a role whose PIN is taken the first
  free of 0000/1111/2222… and logs it.
- QR: at most one row in `qr_links` (SHA-256 of the token; the token itself is only returned by
  `POST /auth/qr`). `POST /auth/link { token }` (public, same rate limiter as login) starts a
  `counter` session with `sessions.link_id` set; regenerating or revoking deletes every session
  with a `link_id`. Tests: `tests/qr.test.ts` (`env.agent()` = cookie-keeping, no session).

## Client

- `client/src/context/AuthContext.tsx`: `AuthProvider` (in `App.tsx`, outside the router) checks
  `/auth/me`, exchanges `?key=` first, and renders `pages/Login.tsx` while there is no session.
  `lib/api.ts` dispatches `AUTH_EXPIRED` on a 401 outside `/auth/*` → back to the PIN screen.
- `useAuth()` returns `{ role, can, ready, logout }`. `can` uses `settings.rolePermissions` from
  `PermissionsContext` (filled by `StockProvider`); `ready` is false until the first `/data` load,
  and `AppShell`/`HomeRedirect` don't redirect before it. Hide controls with `can('setup')` etc. — hiding is
  only convenience; the server guard is what enforces it. Where a role can't edit, show the value
  as plain text (item/group names) or a disabled field (the Stock figures without `daily`) and use
  `t.common.askAdmin` in empty states.
- Pages per role: a `NAV` entry's `perm` hides it, and `AppShell` redirects a path under a NAV
  entry the role can't open to its home page (`homePath`: the first entry whose `home ?? perm` it
  has; `/stock` has `home: 'daily'`, so admin → /stock, housekeeper → /counter, reception →
  /checklist). The index route is `HomeRedirect`. Pages don't redirect themselves. Test:
  `client/src/Roles.test.tsx`.
  Hidden now: item add/rename/remove (`ItemsCard`), group controls and ⚙ (`DeparturesCard`),
  Manage rooms (`Counter`), task ✎ and "New task" (`TaskList`, `Checklist`), Restore (`pages/settings/DataCard`),
  the `/rooms` page itself and its NAV entry (`setup`; others are redirected) with its "Open Settings" links (`Rooms`; the master
  setup and "Add room" / the room list (`RoomDialog`) are in `RoomSetupCard` on the admin-only Settings page),
  and the Settings NAV entry (`perm: 'pins'` on a `NAV` item in `AppShell`, which also redirects
  `/settings` without `pins`); `/counter` (`count`), `/checklist` (`checklist`), `/cleaning`
  (`cleaning`) the same way.
- Counter mode (`todayOnly(role)`): `AppShell` renders no sidebar or menu and redirects
  every path outside `/counter` there; `DateProvider` sets `locked` (min = max = today) and
  `DateSwitcher` renders nothing. Test: `client/src/CounterMode.test.tsx` (whole `App`).
- `pages/Settings.tsx`: one PIN form per `PIN_ROLES` role (`PUT /auth/pins`; a 400 means "another role has this PIN"; texts keyed by role: `settings.pins.label/hint/changed[role]`) and the
  QR card (`GET/POST/DELETE /auth/qr`, drawn by `lib/qr.ts`). Test: `pages/Settings.test.tsx`.
- Tests: `client/src/test/fetch.ts` `mockApi((method, path, body) => reply)` stubs `fetch`;
  see `context/AuthContext.test.tsx` and `pages/Login.test.tsx`.
