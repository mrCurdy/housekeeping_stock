---
name: sqlite-db
description: Change Fomka's SQLite storage (server/src/db/sqlite/) — add a table or column (migration), a repo method, or change how StockData maps to rows. Use whenever a change touches the database schema, server/src/db/types.ts or the sqlite driver.
---

# SQLite storage

Files: `server/src/db/types.ts` (the `Db` interface, the only thing routes see),
`server/src/db/sqlite/migrations.ts` (schema), `server/src/db/sqlite/index.ts` (connection, `write()`,
`init`, backups, pruning), `server/src/db/sqlite/rows.ts` (row types, `DATA_TABLES`, `snapshot`/`fill`
and shared helpers in `createRows`, `namedRepo`), one repo file per area (`items.ts`, `records.ts`,
`counts.ts`, `tasks.ts`, `checklist.ts`, `settings.ts`, `rooms.ts`, `auth.ts`),
`server/tests/sqlite.test.ts` (driver tests; `api.test.ts` is the regression suite through the API).
`api.test.ts` uses one DB for the whole file: a new test there creates its own records, since earlier
tests' data is still present.

## Schema (migrations 1–8; 6 renamed the `worker` PIN and sessions to `housekeeper`; 7 added `names`; 8 added unit groups)

| table                          | columns                                                              | notes                                                                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`                        | `id, name, pos, names`                                               | `pos` = display order; `names` (migration 7, also on `room_types`, `room_units`, `room_statuses`) = the per-language versions as JSON, NULL = none (`LOCALIZED_TABLES`, `toLocalized`, `namesJson`); renames go through `renameIn`         |
| `multipliers`                  | `item_id, group_id, qty`                                             | PK (item, group); only qty > 0 stored                                                                                                                                                                                                      |
| `records`                      | `item_id, date, c, i, m, mc`                                         | NULL = not entered; no all-NULL rows                                                                                                                                                                                                       |
| `groups`                       | `id, name, pos`                                                      |                                                                                                                                                                                                                                            |
| `departures`                   | `group_id, date, d`                                                  | no 0 rows                                                                                                                                                                                                                                  |
| `locations`                    | `id, name, pos`                                                      |                                                                                                                                                                                                                                            |
| `counts`                       | `date, location_id, item_id, value`                                  | `location_id` may be a removed room                                                                                                                                                                                                        |
| `tasks`                        | `id, name, description, added, removed, earlier_json, group_id, pos` | `earlier` as JSON text; `group_id` (migration 4) = its `task_groups` row                                                                                                                                                                   |
| `task_groups`                  | `id, name, pos`                                                      | checklist group cards (migration 4); never empty (`writeTaskGroups` puts back `default`), so `isEmpty()` skips it                                                                                                                          |
| `checks`                       | `date, task_id, at`                                                  | `at` = ISO time ticked                                                                                                                                                                                                                     |
| `notes`                        | `date, text`                                                         | no blank notes                                                                                                                                                                                                                             |
| `stock_cards`                  | `id, pos`                                                            | the Stock page's card order (migration 2); empty = default                                                                                                                                                                                 |
| `settings`                     | `key, value`                                                         | `StockData.settings` (migration 3); a missing row = the default; a new setting needs no migration, only `writeSetting` in `fill()` (a number setting also goes in `NUMBER_SETTINGS`, an object one (`rolePermissions`) in `JSON_SETTINGS`) |
| `rooms`                        | `id, number, type_id, note`                                          | room cards (migration 5); `number` UNIQUE (the repo returns `'duplicate'`); NULL type/note = none                                                                                                                                          |
| `room_types`, `room_units`     | `id, name, pos` (+ `group_id` on units)                              | master lists (`orderedRepo` in `rooms.ts`: `namedRepo` + `reorder`); `room_units.group_id` (migration 8) = its `room_unit_groups` row, read with `readUnits`; `createRoomUnits` has its own `create(name, group?)` and `reorder(ids, move?)` |
| `room_unit_groups`             | `id, name, pos, names`                                               | unit groups (migration 8, which put every existing unit into one group `units`, name '', only if units existed); delete refused while units are in it (`'notEmpty'`)                                                                     |
| `room_statuses`                | `id, name, color, pos`                                               | empty = `DEFAULT_ROOM_STATUSES`; every change rewrites the whole list (`readRoomStatuses`), so the defaults get stored                                                                                                                     |
| `unit_status`                  | `room_id, unit_id, status_id, by, at, note`                          | PK (room, unit); the current status only; no row = the first status                                                                                                                                                                        |
| `cleanings`                    | `room_id, date, by, at`                                              | newest first = `CLEANING_ORDER` (date, then rowid); `fill` inserts oldest first; `at` (ISO) isn't in `StockData` (`''` after fill)                                                                                                         |
| `pins`, `sessions`, `qr_links` | auth (`db.auth`, see the `auth` skill)                               | not part of `StockData` / backups; written without `write()`; `sessions.link_id` = the QR link a counter session came from                                                                                                                 |

There are **no foreign keys**, on purpose: a restored backup may hold counts of removed rooms or
ticks of old tasks. Deletes clean up dependent rows by hand (`items.delete`, the `groups` repo's
`onDelete`). `DATA_TABLES` lists the dataset tables; `fill()` and `isEmpty()` use it, so a new
dataset table must be added there.

## Adding a migration

Append `{ id: <next>, name, sql }` to `migrations`. Never edit an applied one. Each migration runs
in a transaction and is recorded in `_migrations`. For a new column use `ALTER TABLE … ADD COLUMN`
with a default, then update the row interface, `snapshot()` and `fill()`.

## Row mapping

- Names in several languages: `name` is the base name and is never rewritten by a language rename;
  `namedRepo.rename(id, name, lang?)` and the item/status updates apply `renameIn` and write both
  columns. A new localized list goes in `LOCALIZED_TABLES` (read with `readNamed`, written by `fill`).

- Row interfaces (`RecordRow`, `TaskRow`…, in `rows.ts`) are snake_case as stored; map them to the shared types
  in the driver (`toTask`, `taskParams`). Missing optional fields are `NULL` in SQL and absent
  (never `null`) in `StockData`: use `cleanRecord` for records, `...(x && { x })` for tasks.
- `snapshot()` builds the whole `StockData` (ordered by `pos`; maps in insertion order).
- `fill(data)` deletes all dataset tables and inserts `data`. `replace()` runs it through
  `normalizeStockData`; the first-start import of `data/db.json` runs it through `backupSchema`.

## Transactions and side effects

Every change goes through `write(fn)`:

1. the daily backup (`data/backups/db-YYYY-MM-DD.json`, i.e. `backups/` next to the DB file; the start-of-day `snapshot()` in the
   Backup/Restore format; pruned after `BACKUP_DAYS`; failures are only logged);
2. `fn` and `prune()` in one `sql.transaction`.

## Pruning

`prune()` runs on start (after a `db.json` import), and inside every `write()` (so also after
`replace()`, i.e. a Restore: an old backup is accepted whole, then pruned). The clock is the
`today` option of `createSqliteDb` (default `formatDate(todayLocal())`); tests pass their own.

- Checklist ticks, notes and task history older than `CHECKLIST_DAYS`: SQL deletes plus `pruneTasks`.
- Room cleanings (`pruneCleaningRows`): before today − `HISTORY_DAYS`, except each room's latest.
  Cheap check `GROUP BY room_id HAVING MIN(date) < ? AND COUNT(*) > 1`; on a hit `pruneCleanings`
  runs on the rows (with their `rowid`) and the dropped rowids are deleted.
- Stock (`pruneStockRows`): `keepFrom = today − HISTORY_DAYS − 2`, K = the day before. A cheap
  `SELECT 1 … WHERE date < K LIMIT 1` on `records`/`departures`/`counts` first; only on a hit it
  runs `pruneStock` on `snapshot()`, deletes `date ≤ K` from those tables and inserts the
  carried-over `m` rows at K. Totals never change, since a count closes the past.

better-sqlite3 is synchronous; repo methods are `async` only to fit the `Db` interface.

## Adding a repo method

1. Add it to the interface in `db/types.ts` (return `null`/`false` for a missing row; the route
   turns that into a 404 with `found()`).
2. Implement it in the area's file (`sqlite/items.ts`, `tasks.ts`…; a new area = a new
   `createX(ctx: Ctx)` file, wired into the object `createSqliteDb` returns in `index.ts`) inside
   `write(() => …)` for changes, plain `get`/`all` from `ctx` for reads. Helpers shared by several
   areas or by `snapshot`/`fill` go in `createRows` (`rows.ts`).
   Reuse the pure rules from `@app/shared` (`editTask`, `removeTaskFrom`, `cleanRecord`…) instead of
   re-implementing them in SQL.
3. Test it through the API in a new `server/tests/<feature>.test.ts` (setup: `tests/helpers.ts`),
   and in `sqlite.test.ts` if it's about storage itself.
