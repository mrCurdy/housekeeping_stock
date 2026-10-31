# Project structure

Read this instead of exploring the tree. Each line says what a file owns; open only the files your
change needs. Line counts are approximate and flag the files worth reading in parts (`grep -n`, then
`sed -n 'A,Bp'`). Never open `client/src/i18n/et.ts`/`ru.ts` (follow the `i18n` skill),
`package-lock.json`, `dist/` or `data/`.

## Where to change X

| Change                                  | Files (in order)                                                                                                                                                                | Skill        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| New page                                | `client/src/pages/<Page>.tsx` (+ `pages/<page>/` for its parts) → route in `App.tsx` → `NAV` in `components/layout/AppShell.tsx` → `nav.*` text                                 | `ui`, `i18n` |
| New UI text                             | `client/src/i18n/en.ts`, then `et.ts`/`ru.ts` at the same place                                                                                                                 | `i18n`       |
| New stored value / field                | `shared/src/types.ts` + `schemas.ts` (`backupSchema`, `normalizeStockData`) → `server/src/db/types.ts` → `db/sqlite/` (migration + method) → route → `StockContext` → component | `sqlite-db`  |
| New request on existing data            | `shared/src/schemas.ts` (zod body) → `server/src/routes/<area>.ts` with `allow(perm)` → `StockContext` mutation → `server/tests/api.test.ts`                                    | `auth`, `ui` |
| New permission / hide UI by role        | `shared/src/auth.ts` (`PERMISSIONS`, `MATRIX`) → `allow(perm)` on the route → `useAuth().can(perm)` in the UI                                                                   | `auth`       |
| Stock rule (totals, consumption)        | `shared/src/stock.ts` + `stock.test.ts` only (pure; server and client both use it)                                                                                              | —            |
| Checklist rule (task history, ticks)    | `shared/src/checklist.ts` + `checklist.test.ts`                                                                                                                                 | —            |
| UI component used on more than one page | `client/src/components/ui/<Name>.tsx` + export in `components/ui/index.ts` + a case in `ui.test.tsx`                                                                            | `ui`         |
| Colour / utility class                  | `client/src/styles/index.css` (tokens on `:root` and `[data-theme='dark']`, `@utility` classes)                                                                                 | `ui`         |
| Backup / restore format                 | `shared/src/schemas.ts` (`backupSchema`, must still read old files) → `db/sqlite/index.ts` (`snapshot`, `fill`)                                                                 | `sqlite-db`  |
| Excel export                            | `client/src/lib/excel.ts` (uses `math.series`)                                                                                                                                  | —            |
| Env setting                             | `server/src/config.ts` → `.env.example` → `docker-compose.yml` → README                                                                                                         | —            |
| A multi-session change                  | write `docs/plan-<topic>.md` with numbered steps                                                                                                                                | `plan-step`  |

## File map

### `shared/src/` (`@app/shared`, imported as TS source by server and client)

- `types.ts`: `StockData` and its parts (see the data model below).
- `schemas.ts` (211): the zod request schemas. `backupSchema` reads old-format backups with `''` blanks. `normalizeStockData`/`cleanRecord` make sure only real values get stored. `pruneChecklist` drops ticks and notes older than `CHECKLIST_DAYS`.
- `auth.ts`: roles, `PERMISSIONS`, `can(role, perm)`, `todayOnly(role)`, `pinSchema`, login/link schemas.
- `stock.ts` (+ test): `createStockMath(state, { minDateStr })` → `dayFigures`, `calculateTotal`, `autoConsumption`, `roomSum`, `series`.
- `checklist.ts` (+ test): `newTask`, `tasksOn`, `isTaskOn`, `editTask`, `removeTaskIn`, `pruneTasks`, `itemCheckKey`/`checkTaskId` (ticks of checklist lines). Groups: `taskGroupList` (never empty), `groupOf`, `tasksByGroup`, `moveTaskTo` + `applyTaskMove` (drag/arrow reorder, also into another group), `removeTaskGroupIn`.
- `dates.ts`: local `YYYY-MM-DD` helpers (`formatDate`, `parseDateLocal`, `addDays`, `todayLocal`, `dateRange`). `index.ts`: barrel.

### `server/src/` (Express 5)

- `index.ts`: start-up order: config → `db.init()` → `seedPins` → listen, then a graceful shutdown. `app.ts`: middleware, `/api` routers, and serving `client/dist` (`/assets` is cached as immutable).
- `config.ts`: env validated with zod. `context.ts`: `{ config, db }` for the routes.
- `build.ts`: `{ builtAt, commit }` stamped by `tsup.config.ts` at build time (`commit: 'source'` when run from source), shown by `GET /health`.
- `auth/`:
  - `pins.ts`: scrypt hashes, `roleForPin`, `seedPins`.
  - `sessions.ts`: the `sm_session` cookie (a SHA-256 of the token is stored).
  - `middleware.ts`: `session`, `requireAuth`, `allow(perm)`.
- `db/types.ts`: the `Db` interface (routes use only this). `db/index.ts`: creates the driver.
- `db/sqlite/index.ts` (**659**): the whole driver in one closure. Sections, found with `grep -n`:
  - helpers;
  - `snapshot` (rows → `StockData`) and `fill` (the reverse);
  - `prune`, `dailyBackup` (a JSON snapshot each day), `importJson`;
  - then the repo objects `items`, `records`, `departures`, `counts`, `tasks`, `checklist`, `auth`.
- `db/sqlite/migrations.ts`: numbered schema migrations.
- `routes/`:
  - `auth.ts`: login, me, logout, pins, QR create/revoke, link.
  - `checklist.ts`: tasks, task groups, checks, notes.
  - `daily.ts`: records, departures, counts.
  - `setup.ts`: items, groups, locations, the Stock page's card order (`PUT /stock-cards/order`) and the app settings (`PATCH /settings`).
  - `data.ts`: `GET /data`, `POST /restore`.
  - `system.ts`: health.
- `lib/`:
  - `errors.ts`: `HttpError.*`.
  - `params.ts`: `param()`, `found()` (null → 404).
  - `logger.ts`.
- `middleware/`:
  - `validate.ts`: `validate(schema)` for the body.
  - `error.ts`: turns errors into `{ error: { code, message } }`.
- `tests/`:
  - `helpers.ts`: app + temp DB per `setup()` call.
  - `api.test.ts` (310): the data routes. **One DB for the whole file** (`beforeAll`): each test sees what earlier tests left. A new test creates its own records (and removes them if later tests count rows) instead of changing the shared ones.
  - `auth.test.ts`, `qr.test.ts`.
  - `sqlite.test.ts`: the driver, migrations, import and backups.

#### API routes (all under `/api`)

- **`auth`:**
  - Login and sessions:
    - `POST /auth/login` `{ pin }` is rate-limited to 10 wrong PINs per 15 min.
    - `GET /me` → `{ role }`. `POST /logout`.
    - `PUT /pins` `{ role, pin }` is admin-only. The PINs must differ, and it logs out that role's other sessions.
  - QR (admin-only):
    - `GET`, `POST` and `DELETE /qr`.
    - `POST` answers `{ token }` once, and revokes the old link and its sessions.
  - `POST /link` `{ token }` opens a `counter` session. That session may only `PUT` today's counts (`todayOnly`).
- **`checklist`:**
  - `/tasks`: `POST` (with `from`, optional `group`) and `PATCH /:id` (with `from`), `DELETE /:id/:date`, `PUT /order` `{ ids, move?: { id, group } }`.
  - `/task-groups` (`tasks` permission): `POST`, `PATCH /:id` `{ name }`, `PUT /order` `{ ids }`, `DELETE /:id` (its tasks move to the group above, or below for the first; the last group → 409).
  - `PUT /checks/:date/:taskId` `{ done, item? }` returns the day's ticks. `item` ticks one checklist line of the task's instructions instead.
  - `PUT /notes/:date` `{ text }`.
- **`setup`:** `/items`, `/groups`, `/locations`, each with POST/PATCH/DELETE.
- **`daily`:**
  - `PATCH /records/:itemId/:date`.
  - `PUT /departures/:groupId/:date`.
  - `PUT /counts/:date/:locationId/:itemId` returns the whole day's counts.
- **`data`:** `GET /data`, `POST /restore`. **`system`:** `GET /health` → `{ status, db, uptimeSec, builtAt, commit }` (use it to spot a stale build).

#### Server details

- **Env:**
  - `ADMIN_PIN`/`WORKER_PIN` are the PINs on first start (default 1234/0000).
  - `SQLITE_PATH` defaults to `data/stock.db`.
  - `BACKUP_DAYS` sets how long the daily `backups/db-YYYY-MM-DD.json` snapshots are kept. A snapshot is written before the first change of each day.
- **Old JSON data:** on the first start with an empty database, `JSON_DB_PATH` (the old `data/db.json`) is imported and renamed `db.json.imported`.
- **Sessions:** the `sm_session` cookie holds a random token (SHA-256 stored), is httpOnly and lasts 1 year. Auth rows live in `db.auth`, not in `StockData` or the backups.

### `client/src/` (React 19, Vite, Tailwind 4, React Router 7)

- `main.tsx`, `App.tsx`: the provider stack (I18n → Theme → Toast → Confirm → Auth → Date → Stock → Router) and the lazy route table.
- `context/`:
  - `AuthContext.tsx`: the session check, QR `?key=` exchange, Login screen until signed in. `useAuth()` → `{ role, can, logout }`.
  - `StockContext.tsx` (**338**): the dataset plus every mutation (`useStock()`), with optimistic updates, `send()` and polling. See the `ui` skill.
  - `DateContext.tsx`: the selected day (−30…+7, locked in counter mode), plus `formatLongDate`.
  - `I18nContext.tsx`: `useI18n()` → `{ t, locale, lang, setLang }`.
  - `ConfirmContext.tsx`: `useConfirm()`. `ToastContext.tsx`: `useToast()`. `ThemeContext.tsx`: light/dark and palettes.
- `components/ui/`: the UI kit (barrel `index.ts`; props are listed in the `ui` skill). `ui.test.tsx`.
- `components/`:
  - `AddForm.tsx`: a "new name" field + Add button.
  - `ClearableInput.tsx`: a `CommitInput` with × to clear a manual value.
  - `Salute.tsx`: the fireworks (a canvas over the page): a rocket rises from the bottom centre, bursts in the middle and its sparks spell a word. Skipped with reduced motion.
- `components/layout/`:
  - `AppShell.tsx`: sidebar, `NAV`, header, counter-mode redirect.
  - `PageHeader`, `DateSwitcher`, `DataMenu` (Excel / Backup / Restore), `LanguageSwitcher`, `ThemeToggle`, `PaletteToggle`.
- `pages/`:
  - `Stock.tsx` + `stock/`:
    - `DeparturesCard`, `ItemsCard` (192), `OverviewCard`, each titled by `StockCardHeader` (title, description, drag grip);
    - `GroupItemsModal`, `Legend`;
    - `useRoomStatus` (the "2/3 rooms" caption).
  - `Counter.tsx` + `counter/`:
    - `AllRoomsTable`, `RoomCountList` (plays `Salute` when the room is fully counted), `RoomSwitcher`, `ManageRooms`;
    - `useCountDrafts` (drafts and row states).
  - `Checklist.tsx` (+ test) + `checklist/`:
    - `TaskGroupCard` (one group: name with ✎ rename/delete, progress, its `TaskList`, "New task"), `TaskList` (grip handles via `lib/useListsDragSort`; ticking the group's last task calls `onAllDone`, the page plays `Salute`), `TaskEditor`, `ShiftNotes`;
    - `noteText.ts` (+ test): the instructions format (`parseNote`, `checkKeys`) and the list editing (`toggleList`, `indent`, `continueList`);
    - `NoteEditor` (the instructions textarea with list buttons), `TaskNote` (instructions shown with tickable checklist lines).
  - `Settings.tsx`: `PinForm`, `QrCard` and `SaluteCard` (+ test). `Login.tsx`: the PIN keypad (+ test); it auto-submits only a typed 4th digit, an autofilled/pasted PIN waits for "Log in". `NotFound.tsx`.
- `lib/`:
  - `api.ts`: `api.get/post/put/patch/delete`, `ApiError`, `apiErrorMessage(err, t)`; it fires `auth:expired` on 401.
  - `numbers.ts`: `parseQty` (≥ 0) and `parseNumber`, both accepting `2,5`.
  - `useDragSort.ts`: drag-a-grip (or ↑/↓) reordering; a vertical list (the checklist group cards), or with `free` rows that may sit side by side, dropped on the row under the pointer (the Stock page cards).
  - `useListsDragSort.ts`: the same over several lists (the tasks of the checklist group cards): a row dragged onto another list's area lands there (`target` shows the drop line); ↑/↓ past a list's edge goes to the neighbouring list.
  - `cn.ts`, `download.ts`.
  - `excel.ts` (the Excel export) and `qr.ts` (the QR code as SVG, PNG download and print): always dynamically imported, since ExcelJS alone is a ~1 MB chunk.
- `i18n/`: `en.ts` (the source; its shape is the `Messages` type), `et.ts`, `ru.ts`, `plural.ts`, `i18n.test.tsx`.
- `styles/index.css`: tokens, iOS 16px fields, and the `val-*` / `no-spin` utilities.
- `test/`: `setup.ts` (cleanup) and `fetch.ts` (`mockApi`, `unauthorized`). Other tests sit next to their code: `src/CounterMode.test.tsx`, `context/AuthContext.test.tsx`, `pages/*.test.tsx`.

### Root

- `deploy.sh`: backup, rebuild, health wait, rollback; deploys the `production` branch.
- `Dockerfile`, `docker-compose.yml`, `.env.example`.
- `docs/plan-*.md`: step plans (`plan-step` skill).

## Data model

`StockData` is also the backup file format. It's stored in SQLite tables (see the `sqlite-db` skill).

```
items:        [{ id, name, multipliers: { [groupId]: qtyPerDeparture } }]
records:      { [itemId]: { [YYYY-MM-DD]: { c?, i?, m?, mc? } } }
groups:       [{ id, name }]
groupRecords: { [groupId]: { [YYYY-MM-DD]: { d } } }
locations:    [{ id, name }]                                   // rooms where stock is counted
counts:       { [YYYY-MM-DD]: { [locationId]: { [itemId]: number } } }   // missing = not counted
tasks:        [{ id, name, description, added?, removed?, earlier?: [{ name, description, until }], group? }]  // checklist, display order within a group
taskGroups:   [{ id, name }]                                   // checklist group cards, display order; never empty ('default', name '' = "Tasks")
checks:       { [YYYY-MM-DD]: { [taskId | taskId#lineKey]: ISO time ticked } }  // missing = not done
notes:        { [YYYY-MM-DD]: string }                         // note for the next shift
stockCards:   ['departures' | 'items' | 'overview']            // Stock page card order; [] = default, missing cards follow (stockCardOrder)
settings:     { saluteText? }                                   // app-wide preferences (key/value table); missing = default (DEFAULT_SALUTE_TEXT)
```

- **Record fields:**
  - `d`: departures for a group on that day.
  - `c`: extra consumption, added on top of auto consumption (there's no UI for it at the moment).
  - `mc`: manual consumption, which replaces auto + extra.
  - `i`: income.
  - `m`: a manual stock count, which resets the running total to this value for that day.
- New IDs are UUIDs. Older data has timestamp IDs (`'1792…'`, `'g_…'`, `'l_…'`). Both are plain strings.
- Checklist ticks and notes older than `CHECKLIST_DAYS` (30) are deleted by the driver (the `pruneChecklist` rule, on start and with every write). Stock data is never pruned.
- **Task changes apply from a day onwards** (the day shown on `/checklist`). Earlier days keep their list, wording and ticks.
  - A task is on day D when `added ≤ D < removed`.
  - `earlier` holds old wordings, each used before its `until`; the top-level name/description is the current one.
  - Removing a task on the day it was added deletes it. Otherwise it gets `removed` and loses only its ticks from that day on.
  - `pruneTasks` forgets history older than 30 days.
  - Groups and a task's group are not tracked per day: a rename or a move shows on past days too. A task without a (known) group is in the `default` group, or the first group once that is deleted (`groupOf`); new tasks store their group.
  - Tasks from before this existed have no `added` and show on every past day.
- **Task instructions** are plain text with note-app lists, nested by 2 spaces: `- item`, `1. item`, `- [ ] item` (`noteText.ts`).
  - A checklist line is ticked per day under `checks[date]['<taskId>#<key>']`. The key is a hash of the line's text (plus its occurrence), so rewording a line clears its tick.
  - Line ticks don't tick the task; the row shows "1/3" next to the name.
- **Removing things:**
  - a group drops its departures and multipliers;
  - an item drops its records and counts;
  - a room keeps its counts, which still count in the totals (shown as "Removed rooms").

## Stock calculation

`dayFigures(item, date, prevTotal)` is the single source of the stock rules.

- **End-of-day total**, in order of precedence:
  1. `m` (typed on the Stock page);
  2. `roomSum()` (the sum of that day's room counts, including removed rooms);
  3. the calculation `total = prevTotal + i - consumption`.
- **Consumption** is `mc` if set, otherwise auto + `c`, where auto = Σ over groups of `multipliers[g] × d`.
- A manual count `m` is intentionally the end-of-day figure, so that day's income and consumption are ignored (confirmed by the user).
- Totals are never stored.
  - `calculateTotal` replays from the earliest record date.
  - `series(item, toDate)` returns every day in one pass; the Overview and the Excel export use it.
- Negative totals are shortages (`val-short`).

## Pages

- **`/stock`:** three cards in the order in `stockCards`, then the legend. While Departures and Stock are next to each other they share a row on wide screens (1fr / 2fr, in their order); the Overview always takes a full row.
  - With `setup` permission (admin) each card header has a grip: drag it onto the card whose place it should take (the card follows the pointer and the target is outlined), or press ↑/↓ on it. The order is the same for everyone (`PUT /stock-cards/order`). Hidden cards (Departures without groups, Overview without items) keep their place in the saved order.
  - Departures per group (⚙ opens items-per-departure).
  - Items with Consumption / Income / Total stock for the selected day. × clears a manual value. Totals from room counts are blue, with a "2/3 rooms" caption.
  - The Overview (`OverviewCard`):
    - has one column per navigable day up to tomorrow (further only to the selected day or the last future day with an entry) and scrolls sideways with item names pinned, on a full-size scrollbar (`scrollbar-thick`);
    - centres the selected day;
    - shows "—" on days without consumption, income or a count (at the user's request).
    - an item's name opens it like a task's instructions: one row per room with that day's count ("—" when not counted), and a "Removed rooms" row when those have counts in view (the sum is the item's own row). The open list ends with a stronger border.
- **`/counter`** shows all rooms (items × rooms + Sum). **`/counter/:locationId`** is one room's list, so each floor bookmarks its own URL.
  - Typing creates a draft (`useCountDrafts`, kept in `Counter`, so switching rooms keeps unsaved numbers).
  - Save or Enter calls `setCount`, then focuses the next item.
  - Row states: empty / draft / saving / saved / error.
  - Leaving with unsaved drafts triggers `beforeunload`.
  - Saving a room's last uncounted item plays the fireworks (`Salute`); re-saving a counted item doesn't.
  - Rooms are managed under "Manage rooms".
- **`/checklist`:**
  - The same tasks every day, ticked per day (so each day starts empty), with the tick time shown. Tasks with a description open accordion-style.
  - Below them, "Notes for the next shift" shows the previous day's note read-only above this day's `CommitTextarea`.
  - Tasks are split into group cards ("Before 11", "Service"…), one `default` group to start with. Each card shows its own progress. With `tasks` permission: "Add group" below the cards; ✎ in a card's header renames it or deletes it (confirmed; its tasks move to the group above; the only group can't be deleted); the header grip drags the card (or ↑/↓). Workers don't see empty groups.
  - "New task" in each card adds to that group. While the whole checklist is empty the one card shows the empty state.
  - ✎ opens a task in place (`TaskEditor`: name, instructions, ↑/↓, remove, all from that day on). It saves only on Save, never on blur, because always-editable name fields led to accidental renames.
  - The instructions editor (`NoteEditor`) has buttons for bulleted / numbered lists, checklists, indent and outdent. Enter continues a list, Enter on an empty item ends it, Tab/Shift+Tab indent list lines.
  - When the user ticks a group's last task (not when a finished day is opened or polled), fireworks spell `settings.saluteText` (default "Tubli!"). Checklist lines inside instructions don't count.
  - With `tasks` permission each row has a grip: drag it (mouse or touch; the page scrolls near the screen edges), also onto another group's card (it gets a ring and a drop line), or press ↑/↓ on it (past a card's edge it moves to the neighbouring group). The order and the group are global (`PUT /tasks/order`), not per day.
- **`/settings`** (admin only; others are redirected to `/stock`):
  - The admin and worker PINs (each new PIN typed twice).
  - The QR code for counting: Make (shown once, with Print and Download PNG), Make a new one (confirmed; revokes the old one) and Revoke. It encodes `${origin}/counter?key=<token>`.
  - The fireworks text (up to 12 characters, blank = "Tubli!"), with a Preview button. Saved for everyone (`PATCH /settings`, `setup` permission).
- **Counter mode** (a QR session): `AppShell` drops the sidebar, menu and toolbar and redirects every other path to `/counter`. The date is locked to today.
- **Header toolbar** (`DataMenu`), hidden on phones on `/counter` and `/checklist`:
  - **Excel:** a "Stock" sheet with one row per day and Consumption/Income/Stock per item, plus a "Departures" sheet when groups exist.
  - **Backup:** a JSON download.
  - **Restore:** validates with `backupSchema`, asks for confirmation, then replaces everything, counts included.

## Known weak spots

These are known and don't need to be copied. Fix one only when a task touches it.

- **`db/sqlite/index.ts`** is 659 lines in one closure. A split per area (`items.ts`, `tasks.ts`, `auth.ts`…) would make edits cheaper.
- **`StockContext`:**
  - Every mutation lives in one `useMemo`, and every edit runs `structuredClone` on the whole dataset.
  - Every 15 s it polls all of `GET /api/data`.
  - This is fine for one hotel's data but grows with history, since stock data is never pruned.
  - Any change re-renders every page that uses `useStock()`.
- **Placement:**
  - `AddForm` and `ClearableInput` sit in `components/`, not in `components/ui/`.
  - `formatLongDate` lives in `DateContext`, not in a `lib/format.ts`.
  - `Settings.tsx` holds three features (`PinForm`, `QrCard`, `SaluteCard`).
- **`client/src/lib/errors.ts`** (`fieldErrors`, `errorMessage`) is not imported anywhere: it's dead code.
- **Client tests** cover login, settings, counter mode (incl. the room-done fireworks), the checklist (reorder, line ticks, list editing), i18n and the UI kit. There are none for the `StockContext` optimistic update and rollback. `Stock.test.tsx` covers the card order and the Overview's per-room rows.
