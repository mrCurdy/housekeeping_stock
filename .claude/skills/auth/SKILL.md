---
name: auth
description: Stock Monitor's PIN login and roles (admin, worker, counter). Use when adding or changing an API route (it needs a guard), when hiding UI by role, or when changing the role matrix, PINs, sessions or QR access.
---

# Auth: roles, guards, hiding UI

## The matrix (`shared/src/auth.ts`, the only source)

| permission | what | admin | worker | counter (QR) |
|---|---|---|---|---|
| `setup` | items, groups, rooms (add/rename/delete, items-per-departure) | ✓ | | |
| `tasks` | checklist task editing (add/edit/reorder/remove) | ✓ | | |
| `restore` | `POST /restore` | ✓ | | |
| `pins` | `PUT /auth/pins` | ✓ | | |
| `qr` | `GET/POST/DELETE /auth/qr` | ✓ | | |
| `daily` | departures, records (consumption, income, manual stock) | ✓ | ✓ | |
| `checklist` | ticks, notes | ✓ | ✓ | |
| `count` | room counts | ✓ | ✓ | today only |

Reading (`GET /data`, Excel, Backup) needs only a login. To change who may do what, edit `MATRIX`
and `shared/src/auth.test.ts`; never check role names directly elsewhere, always `can(role, perm)`.
A new kind of action gets a new `Permission`. `todayOnly(role)` (true for `counter`) is the date
limit on top of the matrix: the counts route answers 403 for another day, and the UI locks the date.

## Server

- `server/src/auth/middleware.ts`: `session` (cookie → `req.role`, `req.sessionHash`),
  `requireAuth` (mounted in `app.ts` after the public routers: `system`, `auth`), `allow(perm)`.
- **Guarding a new route:** a router mounted on its own path gets the guard in `app.ts`
  (`api.use('/things', allow('setup'), thingsRouter(ctx))`). A router mounted at `'/'` guards each
  route inside its file (`r.put('/x/:date', allow('daily'), validateBody(…), …)`), because a guard on
  a `'/'` mount would also turn unknown routes into 403.
- Tests: `server/tests/helpers.ts` gives `api()` (admin agent), `request()` (no session) and
  `login(pin)` (`ADMIN_PIN` 1234 / `WORKER_PIN` 0000). Add a 403 case for the worker to
  `tests/auth.test.ts` for every admin-only route.
- PINs: scrypt hashes in `pins` (`auth/pins.ts`); sessions: SHA-256 of the cookie token in
  `sessions` (`auth/sessions.ts`). Storage is `db.auth` (see the `sqlite-db` skill); it isn't part
  of backups. Changing a PIN deletes that role's sessions (except the admin's own).
- QR: at most one row in `qr_links` (SHA-256 of the token; the token itself is only returned by
  `POST /auth/qr`). `POST /auth/link { token }` (public, same rate limiter as login) starts a
  `counter` session with `sessions.link_id` set; regenerating or revoking deletes every session
  with a `link_id`. Tests: `tests/qr.test.ts` (`env.agent()` = cookie-keeping, no session).

## Client

- `client/src/context/AuthContext.tsx`: `AuthProvider` (in `App.tsx`, outside the router) checks
  `/auth/me`, exchanges `?key=` first, and renders `pages/Login.tsx` while there is no session.
  `lib/api.ts` dispatches `AUTH_EXPIRED` on a 401 outside `/auth/*` → back to the PIN screen.
- `useAuth()` returns `{ role, can, logout }`. Hide controls with `can('setup')` etc. — hiding is
  only convenience; the server guard is what enforces it. Where a worker can't edit, show the value
  as plain text (item/group names) and use `t.common.askAdmin` in empty states.
  Hidden now: item add/rename/remove (`ItemsCard`), group controls and ⚙ (`DeparturesCard`),
  Manage rooms (`Counter`), task ✎ and "New task" (`TaskList`, `Checklist`), Restore (`DataMenu`),
  and the Settings NAV entry (`perm: 'pins'` on a `NAV` item in `AppShell`; `/settings` itself
  redirects without `pins`).
- Counter mode (`todayOnly(role)`): `AppShell` renders no sidebar, menu or toolbar and redirects
  every path outside `/counter` there; `DateProvider` sets `locked` (min = max = today) and
  `DateSwitcher` renders nothing. Test: `client/src/CounterMode.test.tsx` (whole `App`).
- `pages/Settings.tsx`: PIN forms (`PUT /auth/pins`; a 400 means "same as the other PIN") and the
  QR card (`GET/POST/DELETE /auth/qr`, drawn by `lib/qr.ts`). Test: `pages/Settings.test.tsx`.
- Tests: `client/src/test/fetch.ts` `mockApi((method, path, body) => reply)` stubs `fetch`;
  see `context/AuthContext.test.tsx` and `pages/Login.test.tsx`.
