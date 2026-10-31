---
name: sqlite-db
description: Change Stock Monitor's SQLite storage (server/src/db/sqlite/) — add a table or column (migration), a repo method, or change how StockData maps to rows. Use whenever a change touches the database schema, server/src/db/types.ts or the sqlite driver.
---

# SQLite storage

Files: `server/src/db/types.ts` (the `Db` interface, the only thing routes see),
`server/src/db/sqlite/migrations.ts` (schema), `server/src/db/sqlite/index.ts` (the driver),
`server/tests/sqlite.test.ts` (driver tests; `api.test.ts` is the regression suite through the API).
`api.test.ts` uses one DB for the whole file: a new test there creates its own records, since earlier
tests' data is still present.

## Schema (migrations 1–4)

| table | columns | notes |
|---|---|---|
| `items` | `id, name, pos` | `pos` = display order |
| `multipliers` | `item_id, group_id, qty` | PK (item, group); only qty > 0 stored |
| `records` | `item_id, date, c, i, m, mc` | NULL = not entered; no all-NULL rows |
| `groups` | `id, name, pos` | |
| `departures` | `group_id, date, d` | no 0 rows |
| `locations` | `id, name, pos` | |
| `counts` | `date, location_id, item_id, value` | `location_id` may be a removed room |
| `tasks` | `id, name, description, added, removed, earlier_json, group_id, pos` | `earlier` as JSON text; `group_id` (migration 4) = its `task_groups` row |
| `task_groups` | `id, name, pos` | checklist group cards (migration 4); never empty (`writeTaskGroups` puts back `default`), so `isEmpty()` skips it |
| `checks` | `date, task_id, at` | `at` = ISO time ticked |
| `notes` | `date, text` | no blank notes |
| `stock_cards` | `id, pos` | the Stock page's card order (migration 2); empty = default |
| `settings` | `key, value` | `StockData.settings` (migration 3); a missing row = the default; a new setting needs no migration, only `writeSetting` in `fill()` |
| `pins`, `sessions`, `qr_links` | auth (`db.auth`, see the `auth` skill) | not part of `StockData` / backups; written without `write()`; `sessions.link_id` = the QR link a counter session came from |

There are **no foreign keys**, on purpose: a restored backup may hold counts of removed rooms or
ticks of old tasks. Deletes clean up dependent rows by hand (`items.delete`, the `groups` repo's
`onDelete`). `DATA_TABLES` lists the dataset tables; `fill()` and `isEmpty()` use it, so a new
dataset table must be added there.

## Adding a migration

Append `{ id: <next>, name, sql }` to `migrations`. Never edit an applied one. Each migration runs
in a transaction and is recorded in `_migrations`. For a new column use `ALTER TABLE … ADD COLUMN`
with a default, then update the row interface, `snapshot()` and `fill()`.

## Row mapping

- Row interfaces (`RecordRow`, `TaskRow`…) are snake_case as stored; map them to the shared types
  in the driver (`toTask`, `taskParams`). Missing optional fields are `NULL` in SQL and absent
  (never `null`) in `StockData`: use `cleanRecord` for records, `...(x && { x })` for tasks.
- `snapshot()` builds the whole `StockData` (ordered by `pos`; maps in insertion order).
- `fill(data)` deletes all dataset tables and inserts `data`. `replace()` runs it through
  `normalizeStockData`; the first-start import of `data/db.json` runs it through `backupSchema`.

## Transactions and side effects

Every change goes through `write(fn)`:
1. the daily backup (`backups/db-YYYY-MM-DD.json`, the start-of-day `snapshot()` in the
   Backup/Restore format; pruned after `BACKUP_DAYS`; failures are only logged);
2. `fn` and `prune()` (checklist ticks/notes/task history older than `CHECKLIST_DAYS`) in one
   `sql.transaction`.

better-sqlite3 is synchronous; repo methods are `async` only to fit the `Db` interface.

## Adding a repo method

1. Add it to the interface in `db/types.ts` (return `null`/`false` for a missing row; the route
   turns that into a 404 with `found()`).
2. Implement it in `sqlite/index.ts` inside `write(() => …)` for changes, plain `get`/`all` for reads.
   Reuse the pure rules from `@app/shared` (`editTask`, `removeTaskFrom`, `cleanRecord`…) instead of
   re-implementing them in SQL.
3. Test it through the API in a new `server/tests/<feature>.test.ts` (setup: `tests/helpers.ts`),
   and in `sqlite.test.ts` if it's about storage itself.
