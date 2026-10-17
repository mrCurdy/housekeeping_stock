# Plan: PIN login (admin/worker), QR counter access, SQLite storage

## Context
Right now Stock Monitor has no login, and anyone on the network can change anything, including the room and item lists and a full restore. The user wants:
- 4-digit PIN login with two roles, admin and worker. Each role has one PIN. The browser stays logged in until logout.
- Only the admin can change PINs.
- The admin can make a QR code that opens the Counter for today without a PIN.
- Some things become admin-only.
- SQLite replaces the JSON file.

Work happens in **separate sessions, one step each, tests first**, and is set up to keep token and context use low.

## Decisions (confirmed with the user)
- **Admin-only:** changing PINs and QR codes, and everything under items, rooms and groups: add, rename, delete, items-per-departure. Also checklist task editing (add, edit, reorder, remove) and Restore.
- **Worker:** everything else. That covers departures, consumption, income, manual stock, room counts, ticking tasks, notes, and Excel and Backup downloads.
- **QR code:** one QR code covers all rooms. It opens `/counter` for **today**. It works until the admin revokes it or makes a new one, which revokes the old one.
- **One PIN per role.** The admin and worker PINs must be different, because the login works out the role from which PIN matches.

## Design
### Shared (`shared/src/auth.ts`, the single source for both the server and the UI)
- `Role = 'admin' | 'worker' | 'counter'`. `counter` is a session created from the QR code.
- `Permission` is one of `'setup' | 'tasks' | 'restore' | 'pins' | 'qr' | 'daily' | 'checklist' | 'count'`.
- `can(role, perm)` reads a fixed matrix:
  - admin: every permission.
  - worker: `daily`, `checklist`, `count`.
  - counter: `count` only, and only for today.
- `pinSchema` is `/^\d{4}$/`.

### SQLite (`server/src/db/sqlite/`, replaces `db/json/`)
- Use `better-sqlite3`, as the boilerplate does (`boilerplate/server/src/db/sqlite/{index,migrations}.ts`), and copy its migrations pattern.
- Keep the `Db` interface in `server/src/db/types.ts` unchanged, so the routes and the existing `server/tests/api.test.ts` don't change and serve as the regression suite.
- Tables:
  - `items(id,name,pos)`, `multipliers(item_id,group_id,qty)`, `records(item_id,date,c,i,m,mc)`
  - `groups(id,name,pos)`, `departures(group_id,date,d)`
  - `locations(id,name,pos)`, `counts(date,location_id,item_id,value)`. `location_id` has no FK, because removed rooms keep their counts.
  - `tasks(id,name,description,added,removed,earlier_json,pos)`, `checks(date,task_id,at)`, `notes(date,text)`
  - Auth: `pins(role,hash)`, `sessions(token_hash,role,link_id,created_at)`, `qr_links(id,token_hash,created_at)`
- `snapshot()` builds `StockData` from the tables. `replace()` runs in one transaction and reuses `backupSchema`/`normalizeStockData`. Mutations reuse the rules in `shared/src/checklist.ts` (`editTask`, `removeTaskIn`, `newTask`) and `cleanRecord`.
- **Migration:** if the DB is empty on first start and `data/db.json` exists, import it through `backupSchema` and rename the file to `db.json.imported`.
- **Daily backup:** keep today's behaviour by writing a JSON snapshot to `backups/db-YYYY-MM-DD.json`, pruned after `BACKUP_DAYS`. This is the same format as the UI's Backup and Restore. Checklist pruning is done with SQL deletes, using the same 30-day rule as `pruneChecklist`.
- Config: `DB_DRIVER: 'sqlite'`, `SQLITE_PATH=../data/stock.db`. Keep `JSON_DB_PATH` only as the import source. Delete `db/json/`.

### Server auth (`server/src/auth/`)
- PIN hash: `node:crypto` scrypt with a salt, so no new dependency is needed.
- First start seeds the PINs from `ADMIN_PIN`/`WORKER_PIN`. If they are missing, it uses 1234/0000 and logs a warning.
- `POST /api/auth/login {pin}` sets the `sm_session` cookie: a random token stored as SHA-256, httpOnly, SameSite=Lax, Secure when `HTTPS_ONLY`, and lasting one year. It is rate-limited with `express-rate-limit` to 10 tries per 15 minutes.
- `GET /api/auth/me` returns `{ role }` or 401. `POST /api/auth/logout` ends the session.
- `PUT /api/auth/pins {role,pin}` is admin-only. The new PIN must differ from the other role's PIN. Changing the worker PIN logs out every worker session. Changing the admin PIN logs out the other admin sessions.
- QR codes are admin-only:
  - `GET /api/auth/qr` returns `{ active, createdAt }`.
  - `POST /api/auth/qr` makes a new token, revokes the old link and its sessions, and returns `{ token }`. The token can only be shown once.
  - `DELETE /api/auth/qr` revokes it.
- `POST /api/auth/link {token}` creates a `counter` session.
- Middleware:
  - `session` reads the cookie and sets `req.role`.
  - `requireAuth` applies to all of `/api` except `health`, `auth/login` and `auth/link`.
  - `allow(perm)` applies to each router or route in `app.ts` and the route files, and uses `can()`.
  - For a `counter` session, `PUT /counts/:date/...` returns 403 unless `date === todayLocal()`.
- Add the `cookie-parser` dependency, as the boilerplate does.

### Client
- `context/AuthContext.tsx` calls `/auth/me` at startup.
  - With no session, it shows `pages/Login.tsx`: a 4-digit keypad with `inputmode=numeric` that submits once 4 digits are entered.
  - If the URL contains `?key=`, it calls `/auth/link` first and then removes the key from the URL.
  - `StockProvider` is mounted only after login.
  - `lib/api.ts` fires an `auth:expired` event on 401, and `AuthContext` returns to the login screen.
- The `useAuth()` hook returns `{ role, can, logout }`. It hides:
  - Manage rooms (`pages/counter/ManageRooms.tsx`)
  - adding, renaming and deleting items (`pages/stock/ItemsCard.tsx`)
  - the group controls and ⚙ (`pages/stock/DeparturesCard.tsx`)
  - the task editor and "New task" (`pages/checklist/TaskList.tsx`, `pages/Checklist.tsx`)
  - Restore (`components/layout/DataMenu.tsx`)
- **Counter mode** (role `counter`): only the `/counter` routes are available and every other route redirects there. There is no NAV and no toolbar, and the date is locked to today (`DateContext`).
- **New page `/settings`** is admin-only and gets a NAV entry (`App.tsx` + `AppShell.tsx` NAV).
  - It has forms to change the admin PIN and the worker PIN.
  - It also has a QR card: Generate or Regenerate, Revoke, and Print or Download PNG. The QR is drawn with the `qrcode` npm package, dynamically imported like `lib/excel.ts`, and encodes `${location.origin}/counter?key=<token>`.
- There is a Logout button in the header.
- All text goes through the `i18n` skill in en, et and ru.

## Steps (one session each; tests first, then code, then lint/typecheck/test, then commit)
- [x] **0. Docs + workflow skill:**
   - Copy this plan to `docs/plan-auth-sqlite.md` with a checkbox per step.
   - Write `.claude/skills/plan-step/SKILL.md` with the per-session routine:
     - Read only `docs/plan-auth-sqlite.md` and that step's files.
     - Write the failing tests, then implement.
     - Run single test files (`npx vitest run tests/x.test.ts` in the workspace).
     - Tick the step's checkbox, update CLAUDE.md and commit.
     - Rules for saving tokens: grep or `sed -n` instead of reading whole files, never read `boilerplate/` beyond the file a step names, and never read `i18n/et.ts`/`ru.ts` whole.
- [ ] **1. SQLite driver:**
   - Tests first:
     - Switch `server/tests/helpers.ts` to the SQLite temp file, so the existing `api.test.ts` must still pass.
     - Add `server/tests/sqlite.test.ts` covering the import from `db.json`, the daily JSON backup and pruning, checklist pruning, and that `replace()` keeps the order.
   - Then write `db/sqlite/{index,migrations}.ts`, change config and `db/index.ts`, delete `db/json/`, and update the Dockerfile so better-sqlite3 builds or uses prebuilt binaries.
   - Write `.claude/skills/sqlite-db/SKILL.md`: the schema, how to add a migration, row mapping, transactions, and how to add a repo method.
- [ ] **2. Auth on the server:**
   - Tests first:
     - `shared/src/auth.test.ts` for the `can()` matrix and `pinSchema`.
     - `server/tests/auth.test.ts`: login, a wrong PIN, `me`, logout, the rate limit, 401 without a cookie, 403 for a worker on setup/tasks/restore/pins, PIN change logs out workers, PINs must differ, and seeding from env.
   - Update the existing `api.test.ts` helpers to log in as admin.
   - Then write `shared/src/auth.ts`, `server/src/auth/{pins,sessions,middleware}.ts`, `routes/auth.ts`, and the guards in `app.ts`.
   - Write `.claude/skills/auth/SKILL.md`: the role matrix and how to guard a new route and hide UI with `can()`.
- [ ] **3. QR on the server:**
   - Tests first in `server/tests/qr.test.ts`:
     - Creating a QR code then linking gives a counter session.
     - A counter session can `GET /data` and PUT today's counts, but gets 403 for another date, records or setup.
     - Regenerating or revoking ends the old link and its sessions.
   - Then write the routes and the repo.
- [ ] **4. Client login and roles:**
   - Tests first (Vitest + Testing Library, as in `client/src/components/ui/ui.test.tsx`):
     - `pages/Login.test.tsx`: the keypad submits after 4 digits, and an error shows on a wrong PIN.
     - An `AuthContext` test: 401 shows the login screen, and `?key=` is exchanged and removed.
   - Then write `AuthContext`, `Login`, the 401 event in `api.ts`, Logout, and hiding admin-only UI.
- [ ] **5. Client admin settings + counter mode:**
   - Tests first: the Settings PIN form validation, and a counter role sees only the Counter and today's date.
   - Then write `pages/Settings.tsx` (PINs + QR), counter mode in `AppShell`/`DateContext`, and the i18n text.
- [ ] **6. Wrap-up:**
   - Update CLAUDE.md (architecture, data model → SQLite tables, roles), README, `.env.example` (`ADMIN_PIN`, `WORKER_PIN`, `SQLITE_PATH`) and `docker-compose.yml`.
   - Run a manual end-to-end check (below) and open a PR.

To start each session: `Use the plan-step skill: do step N of docs/plan-auth-sqlite.md`.

## Verification
- After each step: `npm run lint && npm run typecheck && npm test`.
- End-to-end (`npm run dev`, or the `run` skill):
  - Existing `data/db.json` is imported, and the totals match the Stock page before the switch.
  - Log in with the worker PIN. Admin controls are hidden, and a direct API call to `POST /api/items` gets 403.
  - Reloading the page stays logged in, and Logout returns to the PIN screen.
  - Log in as admin and change the worker PIN. The worker browser falls back to the PIN screen.
  - Generate a QR code and open its URL in a private window. It shows `/counter` for today, other pages redirect, and the count saves.
  - Revoke the QR code, and that window returns to the PIN screen.
- `docker compose up --build`: the app starts and data persists in the volume.
