# Project structure

Read this instead of exploring the tree. Each line says what a file owns; open only the files your
change needs. Line counts are approximate and flag the files worth reading in parts (`grep -n`, then
`sed -n 'A,Bp'`). Never open `client/src/i18n/et.ts`/`ru.ts` (follow the `i18n` skill),
`package-lock.json`, `dist/` or `data/`.

## Where to change X

| Change                                  | Files (in order)                                                                                                                                                                                                                                                                                                                                           | Skill        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| New page                                | `client/src/pages/<Page>.tsx` (+ `pages/<page>/` for its parts) → route in `App.tsx` → `NAV` in `components/layout/AppShell.tsx` → `nav.*` text                                                                                                                                                                                                            | `ui`, `i18n` |
| New UI text                             | `client/src/i18n/en.ts`, then `et.ts`/`ru.ts` at the same place                                                                                                                                                                                                                                                                                            | `i18n`       |
| New stored value / field                | `shared/src/types.ts` + `schemas.ts` (`backupSchema`, `normalizeStockData`) → `server/src/db/types.ts` → `db/sqlite/` (migration + method) → route → `StockContext` → component                                                                                                                                                                            | `sqlite-db`  |
| New request on existing data            | `shared/src/schemas.ts` (zod body) → `server/src/routes/<area>.ts` with `allow(perm)` → `StockContext` mutation → `server/tests/api.test.ts`                                                                                                                                                                                                               | `auth`, `ui` |
| New permission / hide UI by role        | `shared/src/auth.ts` (`PERMISSIONS`, `MATRIX`) → `allow(perm)` on the route → `useAuth().can(perm)` in the UI                                                                                                                                                                                                                                              | `auth`       |
| Stock rule (totals, consumption)        | `shared/src/stock.ts` + `stock.test.ts` only (pure; server and client both use it)                                                                                                                                                                                                                                                                         | —            |
| Checklist rule (task history, ticks)    | `shared/src/checklist.ts` + `checklist.test.ts`                                                                                                                                                                                                                                                                                                            | —            |
| Room-card rule (statuses, cleanings)    | `shared/src/rooms.ts` + `rooms.test.ts`                                                                                                                                                                                                                                                                                                                    | —            |
| Room card / room master setup UI        | `client/src/pages/rooms/` (`RoomCard`, `RoomTile`, `WhoDialog`, `CleaningHistory`, `RoomSearch`, `RoomFilters`, `LevelFilter`, `useRoomView`, `roomText.ts`, `roomView.ts`) · `pages/Cleaning.tsx` + `pages/cleaning/` · `pages/settings/RoomSetupCard.tsx` (+ `MasterList`, `CleaningThresholds`, `AddRoomDialog`) · `roomMutations`/`roomSetupMutations` | `ui`, `i18n` |
| UI component used on more than one page | `client/src/components/ui/<Name>.tsx` + export in `components/ui/index.ts` + a case in `ui.test.tsx`                                                                                                                                                                                                                                                       | `ui`         |
| Colour / utility class                  | `client/src/styles/index.css` (tokens on `:root` and `[data-theme='dark']`, `@utility` classes)                                                                                                                                                                                                                                                            | `ui`         |
| Backup / restore format                 | `shared/src/schemas.ts` (`backupSchema`, must still read old files) → `db/sqlite/rows.ts` (`snapshot`, `fill`)                                                                                                                                                                                                                                             | `sqlite-db`  |
| Excel export                            | `client/src/lib/excel.ts` (uses `math.series`)                                                                                                                                                                                                                                                                                                             | —            |
| Env setting                             | `server/src/config.ts` → `.env.example` → `docker-compose.yml` → README                                                                                                                                                                                                                                                                                    | —            |
| A multi-session change                  | write `docs/plan-<topic>.md` with numbered steps                                                                                                                                                                                                                                                                                                           | `plan-step`  |

## File map

### `shared/src/` (`@app/shared`, imported as TS source by server and client)

- `types.ts`: `StockData` and its parts (see the data model below). `HISTORY_DAYS` (30) is the one history window: the date switcher (`DAYS_BACK`), `CHECKLIST_DAYS` and stock pruning use it.
- `schemas.ts` (211): the zod request schemas. `backupSchema` reads old-format backups with `''` blanks. `normalizeStockData`/`cleanRecord` make sure only real values get stored. `pruneChecklist` drops ticks and notes older than `CHECKLIST_DAYS`.
- `auth.ts`: roles, `PERMISSIONS`, `can(role, perm)`, `todayOnly(role)`, `pinSchema`, login/link schemas.
- `stock.ts` (+ test): `createStockMath(state, { minDateStr })` → `dayFigures`, `calculateTotal`, `autoConsumption`, `roomSum`, `series`.
- `prune.ts` (+ test): `pruneStock(data, keepFrom)` drops stock data before `keepFrom` and turns the day before it into a carried-over count (`m` = that day's total), so no later figure changes. The SQLite driver calls it (`prune`).
- `checklist.ts` (+ test): `newTask`, `tasksOn`, `isTaskOn`, `editTask`, `removeTaskIn`, `pruneTasks`, `itemCheckKey`/`checkTaskId` (ticks of checklist lines). Groups: `taskGroupList` (never empty), `groupOf`, `tasksByGroup`, `moveTaskTo` + `applyTaskMove` (drag/arrow reorder, also into another group), `removeTaskGroupIn`.
- `rooms.ts` (+ test): room-card rules. `roomStatusList` (never empty: `DEFAULT_ROOM_STATUSES` while none is stored), `unitStatusOf` (missing = first status), `cleanThresholds`, `cleaningLevel(last, today, thresholds)` → `{ days, color }`, `latestCleaning`, `sortRooms` (natural), `removeUnitIn`/`removeStatusIn`/`removeTypeIn`/`removeRoomIn`, `pruneCleanings` (keeps each room's latest).
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
- `db/sqlite/`: the driver, split per area. Each repo file exports `createX(ctx)`, where `ctx = { all, get, run, prepare, transaction, write }` (`Ctx` in `rows.ts`).
  - `index.ts`: the connection, `write()`, `init`, `pruneStockRows` + `pruneCleaningRows` + `prune` (old ticks/notes/task history, stock data and room cleanings), `dailyBackup` (a JSON snapshot each day), `importJson`. `createSqliteDb`'s `today` option is the clock both use (tests move it);
  - `rows.ts`: the row types, `DATA_TABLES`, `Ctx`, `createRows` (`snapshot` rows → `StockData`, `fill` the reverse, and the shared read/write helpers) and `namedRepo`;
  - `items.ts` (items, groups, locations), `records.ts` (records, departures), `counts.ts`, `tasks.ts` (tasks, task groups), `checklist.ts` (ticks, notes), `settings.ts` (stock-card order, app settings; the cleaning thresholds are stored as text and read back as numbers), `rooms.ts` (room cards with unit statuses and cleanings, room units, room types, room statuses), `auth.ts`.
- `db/sqlite/migrations.ts`: numbered schema migrations.
- `routes/`:
  - `auth.ts`: login, me, logout, pins, QR create/revoke, link.
  - `checklist.ts`: tasks, task groups, checks, notes.
  - `daily.ts`: records, departures, counts.
  - `setup.ts`: items, groups, locations, the Stock page's card order (`PUT /stock-cards/order`) and the app settings (`PATCH /settings`).
  - `rooms.ts`: room cards (unit statuses, cleanings) and their master lists (units, statuses, types), each route with its own guard.
  - `data.ts`: `GET /data`, `POST /restore`.
  - `system.ts`: health.
- `seed/` (`npm run seed`, not part of the build):
  - `data.ts`: `seedData(today)`, deterministic demo data: 7 linen/amenity items, 3 departure groups (Single/Double/Family) with items per departure, 2 count locations, 14 days of departures, laundry income every 2 days and a starting count; 3 checklist groups of a day shift's admin tasks (Before 11, Service, End of shift) with ticks and a note; 29 room cards (001–002, 101–109, 201–209, 301–309) with types, 7 units, the default statuses + "Part ordered", a few issues, notes and cleanings (some overdue, two never).
  - `index.ts`: `seed(db, { force, today, backupDir })` refuses a database with data unless `force`, which first saves the old data as `backups/pre-seed-<time>.json` (restorable with Restore). PINs and sessions are kept.
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
  - `seed.test.ts`: the demo data's shape, valid ids, positive totals, and the refuse/force rule.

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
- **`setup`:** `/items`, `/groups`, `/locations`, each with POST/PATCH/DELETE. `PATCH /settings`: a single cleaning threshold is checked against the stored other one (400 unless green < yellow).
- **`rooms`:**
  - `POST /rooms` `{ number, type?, note? }` needs `setup` (admin only). A duplicate number → 409.
  - `setup` (admin only) also: `PATCH /rooms/:id` (`type: ''`/`note: ''` clear), `DELETE /rooms/:id`, `PUT /rooms/:id/units/:unitId` `{ status, by, note? }`. A number another room has → 409.
  - `cleaning` permission (admin, worker): `POST /rooms/:id/cleanings` `{ date, by }` (returns the room's cleanings, newest first).
  - `setup` permission: `/room-units`, `/room-types` (`{ name }`) and `/room-statuses` (`{ name, color }`), each `POST`, `PATCH /:id`, `DELETE /:id`, `PUT /order` `{ ids }`. Deleting the last status → 409.
- **`daily`:**
  - `PATCH /records/:itemId/:date`.
  - `PUT /departures/:groupId/:date`.
  - `PUT /counts/:date/:locationId/:itemId` returns the whole day's counts.
- **`data`:** `GET /data`, `POST /restore`. **`system`:** `GET /health` → `{ status, db, uptimeSec, builtAt, commit }` (use it to spot a stale build).

#### Server details

- **Env:**
  - `ADMIN_PIN`/`WORKER_PIN` are the PINs on first start (default 1234/0000).
  - `SQLITE_PATH` defaults to `data/stock.db`.
  - `BACKUP_DAYS` sets how long the daily `data/backups/db-YYYY-MM-DD.json` snapshots are kept. A snapshot is written before the first change of each day.
- **Old JSON data:** on the first start with an empty database, `JSON_DB_PATH` (the old `data/db.json`) is imported and renamed `db.json.imported`.
- **Sessions:** the `sm_session` cookie holds a random token (SHA-256 stored), is httpOnly and lasts 1 year. Auth rows live in `db.auth`, not in `StockData` or the backups.

### `client/src/` (React 19, Vite, Tailwind 4, React Router 7)

- `main.tsx`, `App.tsx`: the provider stack (I18n → Theme → Toast → Confirm → Auth → Date → Stock → Router) and the lazy route table.
- `context/`:
  - `AuthContext.tsx`: the session check, QR `?key=` exchange, Login screen until signed in. `useAuth()` → `{ role, can, logout }`.
  - `StockContext.tsx` (**159**): the dataset, polling (`POLL_MS`: all of `GET /api/data` every 15 s, kept on purpose since stock data is pruned to ~30 days), `send()` and `edit(key, fn)` (`useStock()`). See the `ui` skill. `StockContext.test.tsx`: optimistic edit, failure → toast + reload, a stale poll can't overwrite an edit (`version`), no poll while typing, `setCount` rethrows.
  - `stock/mutations.ts`: every mutation, grouped by area (setup, daily figures, checklist, settings, room cards, the rooms' master setup), built by `createMutations({ edit, send, data })` (`useMutations` memoizes it; a hook, so the React lint allows passing it `send`, which touches refs). `editData(prev, key, fn)` copies only the top-level key(s) an edit names; the rest is shared with the old dataset. `mutations.test.ts`.
  - `DateContext.tsx`: the selected day (−30…+7, locked in counter mode).
  - `I18nContext.tsx`: `useI18n()` → `{ t, locale, lang, setLang }`.
  - `ConfirmContext.tsx`: `useConfirm()`. `ToastContext.tsx`: `useToast()`. `ThemeContext.tsx`: light/dark and palettes.
- `components/ui/`: the UI kit (barrel `index.ts`; props are listed in the `ui` skill), including `AddForm` (a "new name" field + Add button) and `ClearableInput` (a `CommitInput` with × to clear a manual value). `ui.test.tsx`.
- `components/`:
  - `Salute.tsx`: the fireworks (a canvas over the page): a rocket rises from the bottom centre, bursts in the middle and its sparks spell a word. Skipped with reduced motion.
- `components/layout/`:
  - `AppShell.tsx`: sidebar, `NAV`, header, counter-mode redirect.
  - `PageHeader`, `DateSwitcher`, `LanguageSwitcher`, `ThemeToggle`, `PaletteToggle`.
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
  - `Rooms.tsx` (+ test) + `rooms/`:
    - `RoomCard` (number, type, the note (`CommitTextarea`), every master unit with a status `Select`, ✎ number/type/delete; no cleaning line), `WhoDialog` (name prefilled from `localStorage['rooms.who']`, optional note; optional `description`, `children` above the name and `confirmLabel`, used by `CleaningDialog`), `CleaningHistory` (a room's last 10 general cleanings, newest first, "date · who"; nothing when never cleaned; for the Cleaning page's dialog);
    - `roomText.ts` (+ test): `roomExists`, `typeOptions`, `cleaningText` (today / yesterday / N days ago), `statusName` (a default status still named as in `DEFAULT_ROOM_STATUSES` shows translated, `t.rooms.defaultStatus`).
    - `roomView.ts` (+ test): the view rules (pure): `roomLevel` (first character of the number), `roomLevels`, `sortByLevel` (level by level, then number: 001 … 003, 101 … 112, 201), `worstStatus` (the worst unit status, none without units), `roomUrgency` (its colour: 3 red, 2 yellow, 1 extra, 0 green), `allGreen`, `matchesSearch(room, query)` (trimmed, any case: the number starts with it; types don't match), `viewRooms(data, { level, sort, hideGreen, search? })` (a search replaces the level filter while typed, hide-green only while units exist, sort `number` = `sortByLevel` / `attention`; ties by `sortByLevel`); for the Cleaning page `cleaningDays(data, roomId, today)` (days since the latest cleaning, null never, and its `cleaningLevel` colour) and `viewCleaning(data, { level, dirtyFirst, search? }, today)` (level and search as in `viewRooms`; dirty first = most days first, never cleaned on top, ties by `sortByLevel`; off = `sortByLevel`).
    - `RoomSearch` (the search field with ×, not remembered), `LevelFilter` (the "Level" group of buttons, and `toggleProps` for an on/off `Button`; also used by `CleaningFilters`), `RoomFilters` (the bar: `LevelFilter`, the Needs attention first toggle, hide-green, and the "View" group: Full cards / Compact tiles icon buttons; on/off = `Button` primary/outline with `aria-pressed`), `useRoomView(levels)` (+ test; the view and `mode: 'full' | 'compact'` in `localStorage['rooms.view']`, try/catch; a stored level that no longer exists shows as All; no stored mode = compact below `sm` (`matchMedia('(max-width: 639px)')`), full otherwise).
    - `RoomTile` (the compact tile, a square `button` "Open room N": number, type and a wrench coloured by `worstStatus` (no wrench without units), a `role="img"` with the translated meaning). `RoomCard` takes an optional `onClose` (an × "Close room N") and `className` for the open tile.
  - `Cleaning.tsx` (+ test) + `cleaning/`: `CleaningTile` (a square `button` "Room N: Cleaned 3 days ago · Mari": number, broom (`Broom`) and the days, both the days and the border coloured by `cleaningDays`, "—" never), `CleaningFilters` (`LevelFilter` + the Dirty first toggle), `useCleaningView(levels)` (`{ level, dirtyFirst }` in `localStorage['cleaning.view']`, try/catch), `CleaningDialog` (`WhoDialog` with the latest cleaning, `CleaningHistory` and "Cleaned today" → `markCleaned`).
  - `Settings.tsx` (+ test): the page and the admin redirect; `settings/`: `PinForm`, `QrCard`, `DataCard` (Excel / Backup / Restore), `SaluteCard`, `RoomSetupCard` (the room cards' master setup, `setup` only: an "Add room" button opening `AddRoomDialog` (number, type, note; a taken number shows the error before sending), units, statuses with a colour `Select`, room types, each a `MasterList` (rename in place, ↑/↓, remove confirmed, `AddForm`), plus `CleaningThresholds` (both days checked together, 0 ≤ green < yellow, before `updateSettings`)). `Login.tsx`: the PIN keypad (+ test); it auto-submits only a typed 4th digit, an autofilled/pasted PIN waits for "Log in". `NotFound.tsx`.
- `lib/`:
  - `api.ts`: `api.get/post/put/patch/delete`, `ApiError`, `apiErrorMessage(err, t)`; it fires `auth:expired` on 401.
  - `format.ts`: `formatLongDate(date, locale)` ("Sat, 17 Oct 2026").
  - `numbers.ts`: `parseQty` (≥ 0) and `parseNumber`, both accepting `2,5`.
  - `useDragSort.ts`: drag-a-grip (or ↑/↓) reordering; a vertical list (the checklist group cards), or with `free` rows that may sit side by side, dropped on the row under the pointer (the Stock page cards).
  - `useListsDragSort.ts`: the same over several lists (the tasks of the checklist group cards): a row dragged onto another list's area lands there (`target` shows the drop line); ↑/↓ past a list's edge goes to the neighbouring list.
  - `roomColors.ts`: `ROOM_COLOR_CLASSES`, room status colour id → `dot`/`text`/`soft`/`border` classes (`bg-status-green`…). `roomColors.test.ts` checks every colour has its tokens.
  - `backup.ts` (+ test): `hasData(data)` (anything to back up: stock, checklist or room setup) and `backupCounts(data)` (what Restore's confirmation lists).
  - `cn.ts`, `download.ts`.
  - `excel.ts` (the Excel export) and `qr.ts` (the QR code as SVG, PNG download and print): always dynamically imported, since ExcelJS alone is a ~1 MB chunk.
- `i18n/`: `en.ts` (the source; its shape is the `Messages` type), `et.ts`, `ru.ts`, `plural.ts`, `i18n.test.tsx`.
- `styles/index.css`: tokens (incl. the 10 room status colours `--status-<colour>` and `-soft`, light and dark), iOS 16px fields, and the `val-*` / `no-spin` utilities.
- `test/`: `setup.ts` (cleanup), `fetch.ts` (`mockApi`, `unauthorized`) and `fixtures.ts` (`stockFixture(extra)`: a small `StockData` with two items, three tasks and yesterday's note; `mockApp(role, data, route)`: `/auth/me` + `/data` + your routes; `today`, `yesterday`). Other tests sit next to their code: `src/CounterMode.test.tsx`, `context/AuthContext.test.tsx`, `context/StockContext.test.tsx`, `pages/*.test.tsx`.

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
settings:     { saluteText?, cleanGreenDays?, cleanYellowDays? } // app-wide preferences (key/value table); missing = default (DEFAULT_SALUTE_TEXT, DEFAULT_CLEAN_DAYS 15/29)
rooms:        [{ id, number, type?, note? }]                   // room cards; shown level by level (sortByLevel); note ≤ ROOM_NOTE_MAX (500)
roomTypes:    [{ id, name }]                                   // dropdown order
roomUnits:    [{ id, name }]                                   // master layout every room shares, display order
roomStatuses: [{ id, name, color }]                            // color ∈ ROOM_COLORS (10, green/yellow/red first); [] = DEFAULT_ROOM_STATUSES
unitStatus:   { [roomId]: { [unitId]: { status, by, at, note? } } }  // current status only; missing = first status
cleanings:    { [roomId]: [{ date, by }] }                     // newest first; older than HISTORY_DAYS pruned except each room's latest
```

- **Record fields:**
  - `d`: departures for a group on that day.
  - `c`: extra consumption, added on top of auto consumption (there's no UI for it at the moment).
  - `mc`: manual consumption, which replaces auto + extra.
  - `i`: income.
  - `m`: a manual stock count, which resets the running total to this value for that day.
- New IDs are UUIDs. Older data has timestamp IDs (`'1792…'`, `'g_…'`, `'l_…'`). Both are plain strings.
- Checklist ticks and notes older than `CHECKLIST_DAYS` (30) are deleted by the driver (the `pruneChecklist` rule, on start and with every write).
- Room cleanings older than `HISTORY_DAYS` are deleted by the same `prune`, except each room's latest (`pruneCleanings`; cheap check: a room with an old cleaning and more than one).
- **Stock data older than 30 days is removed; counts carry the totals over.** The driver's `prune` (on start, with every write, so also after a Restore) drops records, departures and room counts before `keepFrom` = today − `HISTORY_DAYS` − 2 (2 days before the oldest selectable day, for a server/client date difference around midnight) and writes the day before it, K, as one carried-over `m` per item (`pruneStock`). A cheap `date < K` check means it really runs about once a day; that day's backup was taken before it. The Excel export starts at the oldest selectable day, so K isn't exported.
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
  - a room unit drops its statuses on every card; a room status resets its units to the first status (the last one can't be removed); a room type is cleared on its cards; a room card drops its statuses and cleanings (`rooms.ts`).

## Stock calculation

`dayFigures(item, date, prevTotal)` is the single source of the stock rules.

- **End-of-day total**, in order of precedence:
  1. `m` (typed on the Stock page);
  2. `roomSum()` (the sum of that day's room counts, including removed rooms);
  3. the calculation `total = prevTotal + i - consumption`.
- **Consumption** is `mc` if set, otherwise auto + `c`, where auto = Σ over groups of `multipliers[g] × d`.
- A manual count `m` is intentionally the end-of-day figure, so that day's income and consumption are ignored (confirmed by the user).
- Totals are never stored.
  - `calculateTotal` replays from the latest count (`m` or room counts) on or before the day, since a count closes the past; with no count it replays from the earliest record date. Each item's counted days are listed once per `createStockMath`.
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
- **`/rooms`** "Room statuses" (`setup` permission: admin only, anyone else is redirected to `/cleaning`; no general cleanings here): one card per room, level by level, then by number (`sortByLevel`), in a 1/2/3-column grid.
  - The search (shown when rooms exist, not remembered): "Enter a room number". Room numbers only (not types), from the first digit (`3` → 301, 315, not 103), any case; phones get the number keypad (`inputMode="numeric"`). While typed it searches every level (the selected level applies again once cleared); sort and hide-green still apply. × clears it.
  - The filter bar (shown when rooms exist; remembered per device): "All" or one level (the levels come from the rooms' first characters); the sort toggle Needs attention first (red, yellow, extra colours, green), pressing it again goes back to level order (an old stored cleaning sort loads as level order); "Hide all-green rooms" (only with units; unit statuses only, not the cleaning colour). When nothing matches: "No rooms match" with Show all (clears the search, resets the level and hide-green, keeps the sort).
  - Full cards or compact tiles (the "View" toggle in the bar, remembered with the filters; with nothing stored phones start compact). Compact: a dense grid of square tiles (number, type, wrench = worst unit status colour). Tapping a tile opens it as its full card on its own grid row (`col-span-full`; from `sm` up capped at `max-w-xl` and centred); only one is open, tapping another switches, × closes it. The open room isn't remembered and closes when the filters or search hide it.
  - A card: number, type, its note (saved on blur), each master unit with its status (missing = the first) tinted in the status colour, with the note, who and when of the last change.
  - Changing a status opens `WhoDialog` (name required, optional note). Cancel sends nothing.
  - ✎ edits the number and type, or deletes the card (confirmed). A number another card has shows an error.
  - Rooms are added only by the admin, in Settings. Without units: a notice (the admin gets an "Open Settings" link). Without rooms: an empty state pointing to Settings.
- **`/cleaning`** "Cleaning" (`cleaning` permission: admin and worker; the counter role doesn't get it): general cleanings in a dense grid of small square tiles (4 columns on a phone up to 12), the same on every screen (no Full / Compact).
  - A tile: the room number, and under it a broom with the days since the latest general cleaning (`0` today, counted from the real today, not the date switcher), coloured green / yellow / red by the thresholds; never cleaned = "—" in red. Its accessible name says it in words (`cleaningText`).
  - The room search as on `/rooms` (not remembered); the level buttons and "Dirty first" (most days first, never cleaned on top, ties in level order; pressed again = level order), both remembered per device. No match: "No rooms match" with Show all (clears the search and the level, keeps Dirty first).
  - Tapping a tile opens `CleaningDialog`: room number and type, the latest cleaning ("Cleaned 12 days ago · Anna" / "No general cleaning yet"), the last 10 cleanings, a required "Your name" (prefilled from `localStorage['rooms.who']`) and Cancel / Cleaned today (`POST /rooms/:id/cleanings` with today's date). Cancel sends nothing.
  - No rooms: the admin gets an "Open Settings" link, a worker "Ask the admin to set this up."
- **`/settings`** (admin only; others are redirected to `/stock`):
  - The admin and worker PINs (each new PIN typed twice).
  - The QR code for counting: Make (shown once, with Print and Download PNG), Make a new one (confirmed; revokes the old one) and Revoke. It encodes `${origin}/counter?key=<token>`.
  - **Data and backups** (`DataCard`; Settings is admin-only, so workers have no Excel or Backup):
    - **Excel:** from the oldest selectable day: a "Stock" sheet with one row per day and Consumption/Income/Stock per item, plus a "Departures" sheet when groups exist.
    - **Backup:** a JSON download of everything, room cards, unit statuses and cleanings included. Refused ("No data to back up yet") only when `hasData` is false.
    - **Restore** (`restore` permission): validates with `backupSchema`, asks for confirmation (the file's items, departure groups, count locations and room cards with how many have cleanings, counts of 0 left out), then replaces everything: counts, room statuses and cleanings included.
  - The fireworks text (up to 12 characters, blank = "Tubli!"), with a Preview button. Saved for everyone (`PATCH /settings`, `setup` permission).
  - Room cards (`RoomSetupCard`, `setup` permission): "Add room" (a dialog: number, type, note; Cancel sends nothing), and the master layout every room shares. Units (rename in place, ↑/↓, remove confirmed: drops their statuses on every card), statuses (name + a colour from the 10, green/yellow/red first; remove confirmed: its units go back to the first; the last one can't be removed), room types (remove confirmed: cleared on its cards), and the cleaning thresholds (green up to N days, yellow up to M, red above; 0 ≤ green < yellow, checked before saving).
- **Counter mode** (a QR session): `AppShell` drops the sidebar and menu and redirects every other path to `/counter`. The date is locked to today.

## Known weak spots

Still open. Fix one only when a task touches it.

- **`StockContext`:** any change re-renders every page that uses `useStock()`.
