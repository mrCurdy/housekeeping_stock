# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Stock Monitor": a standalone tool for tracking daily housekeeping stock (linens, amenities, etc.) per item in a hotel. Consumption is partly derived from guest-group departures. It is not integrated with any hotel system, has no login ("there is no sensitive data") and stores everything in one JSON file. The user wants it simple and lightweight but easy to extend.

## Commands

```bash
npm install
npm run dev                  # server :3000 (tsx watch) + client :5173 (Vite, proxies /api)
npm test                     # shared (stock rules) + server (API) + client (UI kit) tests, all Vitest
npm run typecheck && npm run lint
npx vitest run -t "room"     # a single test, run inside a workspace (shared/, server/ or client/)
npm run build && npm start   # production (start sets NODE_ENV=production): the server also serves client/dist
docker compose up --build -d # http://localhost:3000, data in the app-data volume
```

Before committing: `npm run lint && npm run typecheck && npm test`.

## Architecture

npm workspaces, structured like `boilerplate/` (a separate, untracked checkout of a full-stack TypeScript template; reference only, don't modify it unless asked). Auth, Socket.io, the SQL drivers and the appearance customizer were deliberately left out.

- `shared/src/` (`@app/shared`, imported as TS source by both sides):
  - `types.ts`: the dataset (`StockData`) and its parts.
  - `schemas.ts`: zod request schemas, `backupSchema` (reads old-format backups with `''` blanks) and `normalizeStockData`/`cleanRecord` (stored data contains only real values: no nulls, no empty records, no 0 departures).
  - `auth.ts`: roles (`admin`, `worker`, `counter` = QR session), `Permission`s and `can(role, perm)`, the single role matrix for server guards and UI; `pinSchema` (4 digits). See the `auth` skill (`.claude/skills/auth/SKILL.md`).
  - `stock.ts`: `createStockMath(state, { minDateStr })`, the stock rules (pure). `dates.ts`: local-date helpers.
- `server/src/`: Express 5.
  - `config.ts` validates env with zod (`ADMIN_PIN`/`WORKER_PIN`: first-start PINs, default 1234/0000). `context.ts` holds `{ config, db }` for the routes.
  - `db/types.ts`: the repository interface `Db`. Routes only use it. `db/sqlite/` (better-sqlite3, `SQLITE_PATH`, default `data/stock.db`) is the only driver: every change runs in one transaction, and before the first change of each day a JSON snapshot (Backup format) goes to `backups/db-YYYY-MM-DD.json` (pruned after `BACKUP_DAYS`). On the first start of an empty database, `JSON_DB_PATH` (the old `data/db.json`) is imported and renamed `db.json.imported`. Schema, migrations and how to add a repo method: the `sqlite-db` skill (`.claude/skills/sqlite-db/SKILL.md`).
  - `auth/`: `pins.ts` (scrypt hashes, `roleForPin`, `seedPins` run after `db.init()`), `sessions.ts` (`sm_session` cookie: random token, SHA-256 stored, httpOnly, 1 year), `middleware.ts` (`session` sets `req.role`, `requireAuth`, `allow(perm)`). Everything under `/api` except `health`, `auth/login` and `auth/link` needs a session; `app.ts` and the route files put `allow(perm)` on each router/route. Auth rows live in `db.auth` (not in `StockData` or backups).
  - `routes/`: `auth` (`POST /api/auth/login` `{ pin }`, rate-limited to 10 wrong PINs / 15 min; `GET /me` → `{ role }`; `POST /logout`; `PUT /pins` `{ role, pin }` admin-only, PINs must differ, logs out that role's other sessions; QR: `GET/POST/DELETE /qr` admin-only, POST answers `{ token }` once and revokes the old link and its sessions; `POST /link` `{ token }` opens a `counter` session, which may only `PUT` today's counts (`todayOnly`)), `checklist` (`/api/tasks`: POST and `PATCH /:id` with `from`, `DELETE /:id/:date`, `PUT /order`; `PUT /api/checks/:date/:taskId` `{ done }`, which returns the day's ticks; `PUT /api/notes/:date` `{ text }`), `system` (`/api/health`), `data` (`GET /api/data`, `POST /api/restore`), `setup` (`/api/items`, `/api/groups`, `/api/locations`: POST/PATCH/DELETE), `daily` (`PATCH /api/records/:itemId/:date`, `PUT /api/departures/:groupId/:date`, `PUT /api/counts/:date/:locationId/:itemId`, which returns the whole day's counts). Missing rows → `HttpError.notFound` via `found()` in `lib/params.ts`.
- `client/src/`: React + Vite + Tailwind 4 + React Router.
  - `App.tsx`: routes `/` → `/stock`, `/stock`, `/counter/:locationId?`, `/checklist`, `/settings` (admin), all lazy-loaded inside `AppShell`. New pages need a route here and an entry in `NAV` (`components/layout/AppShell.tsx`; `perm` hides an entry from roles without it). Counter mode (a `counter`/QR session, `todayOnly(role)`): `AppShell` drops the sidebar, menu and toolbar and redirects every other path to `/counter`.
  - `context/AuthContext.tsx`: `AuthProvider` checks `GET /auth/me` at startup (first exchanging a QR `?key=` via `/auth/link` and removing it from the URL) and shows `pages/Login.tsx` (4-digit keypad, submits on the 4th digit) until there is a session; the data and router mount only after login. `lib/api.ts` fires `auth:expired` on any 401 outside `/auth/*`, which returns to the PIN screen. `useAuth()` → `{ role, can, logout }`; hide admin-only UI with `can('setup' | 'tasks' | 'restore')` (see the `auth` skill). Logout is in the header.
  - `context/StockContext.tsx`: the dataset and every mutation (`useStock()`). Each change updates state optimistically and sends one small request for that value, so several people can edit at once. On failure it shows a toast and reloads. It polls `GET /api/data` every 15 s and on focus, skipping while requests are pending or an input has focus; a `version` ref stops a refresh that started before an edit from overwriting it.
  - `context/I18nContext.tsx` + `i18n/{en,et,ru}.ts`: all UI text in English, Estonian and Russian (`const { t, locale } = useI18n()`). `en.ts` is the source and its shape is the `Messages` type, so a key missing from et/ru fails typecheck. Language is chosen in the header and stored per device. Never hard-code UI text: follow the `i18n` skill (`.claude/skills/i18n/SKILL.md`), which has the glossary.
  - `context/DateContext.tsx`: the selected day, shared by all pages, limited to today −30 … +7 (locked to today in counter mode: `locked`, and `DateSwitcher` disappears). `ConfirmContext`: `await confirm({...})`. `ThemeContext`/`ToastContext` come from the boilerplate.
  - `components/ui/`: the boilerplate UI kit, plus `CommitInput`/`CommitTextarea` (edits freely and saves on blur/Enter/unmount; Escape reverts). Feature components live next to their page (`pages/stock/`, `pages/counter/`).
  - `lib/excel.ts`: the Excel export, dynamically imported (ExcelJS is a ~1 MB chunk). `lib/qr.ts`: the counter QR code (SVG, PNG download, print), dynamically imported too. `styles/index.css`: boilerplate tokens + `val-calc`/`val-manual`/`val-rooms`/`val-short` and `no-spin` utilities. Use semantic tokens (`bg-surface`, `text-fg-muted`, `text-primary`…), never raw colours, so dark mode keeps working.

### Data model (`StockData` = backup file format; stored in SQLite tables, see the `sqlite-db` skill)

```
items:        [{ id, name, multipliers: { [groupId]: qtyPerDeparture } }]
records:      { [itemId]: { [YYYY-MM-DD]: { c?, i?, m?, mc? } } }
groups:       [{ id, name }]
groupRecords: { [groupId]: { [YYYY-MM-DD]: { d } } }
locations:    [{ id, name }]                                   // rooms where stock is counted
counts:       { [YYYY-MM-DD]: { [locationId]: { [itemId]: number } } }   // missing = not counted
tasks:        [{ id, name, description, added?, removed?, earlier?: [{ name, description, until }] }]  // checklist, display order
checks:       { [YYYY-MM-DD]: { [taskId]: ISO time ticked } }  // missing = not done
notes:        { [YYYY-MM-DD]: string }                         // note for the next shift
```

- `d`: departures for a group on that day. `c`: extra consumption, added on top of auto consumption (no UI for it at the moment). `mc`: manual consumption, which replaces auto + extra. `i`: income. `m`: manual stock count, which resets the running total to this value for that day.
- New IDs are UUIDs. Older data has timestamp IDs (`'1792…'`, `'g_…'`, `'l_…'`); both are plain strings.
- Dates are local-time `YYYY-MM-DD` strings (`formatDate`), not ISO/UTC, so string comparison sorts them correctly.
- Checklist ticks and notes older than `CHECKLIST_DAYS` (30) are deleted by the driver (the `pruneChecklist` rule, on start and with every write). Stock data is never pruned.
- Task changes apply from a day onwards (the day shown on `/checklist`); earlier days keep their list, wording and ticks. A task is on day D when `added ≤ D < removed`; `earlier` holds old wordings (each used before its `until`), the top-level name/description is the current one. Rules in `shared/src/checklist.ts` (`tasksOn`, `editTask`, `removeTaskIn`), shared by the server and the client's optimistic updates. Removing a task on the day it was added deletes it; otherwise it gets `removed` and loses only its ticks from that day on. `pruneTasks` (part of `pruneChecklist`) forgets history older than 30 days. Tasks from before this existed have no `added` and show on every past day.
- Removing a group drops its departures and multipliers. Removing an item drops its records and counts. Removing a room keeps its counts, which still count in the totals (shown as "Removed rooms").

### Stock calculation

`dayFigures(item, date, prevTotal)` is the single source of the stock rules. Order of precedence for the end-of-day total: `m` (typed on the Stock page) > `roomSum()` (sum of the room counts that day, including removed rooms) > calculation, where `total = prevTotal + i - consumption`. Here consumption = `mc` if set, else auto + `c`, where auto = Σ over groups of `multipliers[g] × d`. A manual count `m` is intentionally the end-of-day figure, so that day's income and consumption are ignored (confirmed by the user). Totals are never stored: `calculateTotal` replays from the earliest record date, and `series(item, toDate)` returns every day in one pass (used by the Overview and the Excel export).

The Overview (`pages/stock/OverviewCard.tsx`) has one column per navigable day, scrolls sideways with item names pinned, centres the selected day, and shows "—" on days without consumption, income or a count (at the user's request). Negative totals are shortages.

### Pages

- **`/stock`**: Departures per group (the ⚙ button opens items-per-departure), items with Consumption / Income / Total stock for the selected day (× clears a manual value; totals from room counts are blue with a "2/3 rooms" caption), Overview, legend.
- **`/counter`** (all rooms: items × rooms + Sum) and **`/counter/:locationId`** (one room's list, so each floor bookmarks its own URL). Typing creates a draft (`useCountDrafts`, kept in `Counter` so switching rooms keeps unsaved numbers). Save or Enter calls `setCount`, then focuses the next item. Row states: empty / draft / saving / saved / error. Leaving with unsaved drafts triggers `beforeunload`. On phones the header hides the Excel/Backup/Restore toolbar on this page. Rooms are managed under "Manage rooms".
- **`/checklist`**: the same tasks every day, ticked per day (so each day starts empty) with the tick time shown. Tasks with a description open accordion-style. Below: "Notes for the next shift" shows the previous day's note read-only above this day's `CommitTextarea`. The "New task" line comes first while there are no tasks and below the list once there are. Each task's ✎ opens it in place (`pages/checklist/TaskEditor.tsx`: name, instructions, ↑/↓, remove, all from that day on), which saves only on Save, never on blur: always-editable name fields led to accidental renames. Like `/counter`, the header hides the toolbar on phones.
- **`/settings`** (admin only, others are redirected to `/stock`): change the admin and worker PINs (new PIN typed twice), and the QR code for counting: Make (shown once, with Print and Download PNG), Make a new one (confirmed, revokes the old) and Revoke. It encodes `${origin}/counter?key=<token>`.
- Header toolbar (`components/layout/DataMenu.tsx`): **Excel** (history workbook: "Stock" sheet with one row per day and Consumption/Income/Stock per item; "Departures" sheet when groups exist), **Backup** (JSON download), **Restore** (validates with `backupSchema`, confirms, then `POST /api/restore` replaces everything including counts).
