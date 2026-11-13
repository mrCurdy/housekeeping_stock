# Plan: fix the weak spots, keep only 30 days of stock data

Do one step per session with the `plan-step` skill: "do step N of docs/plan-cleanup.md". Every step
ends green (`npm run lint && npm run typecheck && npm test`) and makes one commit. Steps 1–3 are
independent and can run in any order. Steps 4–7 depend on each other and must run in order.

## Context

`docs/structure.md` → "Known weak spots" lists what to fix. Stock data is never deleted today, so
`GET /api/data`, the 15 s poll, the copy made on every edit and the replay in `calculateTotal` all
grow with history. The user wants stock data older than 30 days removed **without changing any
figure** (totals, the counter page, the Overview).

## Decisions (confirmed with the user)

- **A count closes the past.** A manual count (`m`) or a room count is the end-of-day total, so the
  days before it no longer matter to any later total; they only matter for display.
  - The stock math starts each item's replay from its latest count instead of from the first record.
  - Pruning turns the last day it drops into a count: a carried-over `m` holding that day's total. Then everything older can go.
- **History window:** one shared constant, `HISTORY_DAYS = 30`. The date switcher (today −30), the checklist pruning and the stock pruning all use it.
  - Stock is pruned to **2 days before** the oldest selectable day. That covers a server/client date difference around midnight, so a selectable day never loses data.
- **What remains of older history:** only the daily JSON backups (`BACKUP_DAYS`, 30 days). The Excel export starts at the oldest selectable day. README says so: "keep a monthly Excel/Backup download if you need longer history".

## Steps

- [x] **1. Small tidy-ups** (skill `ui`)
  - Delete `client/src/lib/errors.ts`. It's unused: `grep -rn "lib/errors" client/src` must return nothing.
  - Move `components/AddForm.tsx` and `components/ClearableInput.tsx` into `components/ui/`, export them from `components/ui/index.ts`, and change the imports to `@/components/ui`. Find them with `grep -rln "AddForm\|ClearableInput" client/src`.
  - Move `formatLongDate` from `context/DateContext.tsx` to a new `lib/format.ts` and update its importers.
  - Tests: add an `AddForm` case and a `ClearableInput` case (× calls `onClear`) to `components/ui/ui.test.tsx`.
  - Docs: update the file map in `docs/structure.md` and the "Outside the kit" part of the `ui` skill (now in the kit). Delete the matching weak-spot lines.
  - Done differently: inside `components/ui/` the two files import their neighbours by relative path (`./Button`, `./CommitInput`), not via the barrel, to avoid a cycle.

- [x] **2. Split Settings** (skill `ui`)
  - Move `PinForm` and `QrCard` from `pages/Settings.tsx` into `pages/settings/PinForm.tsx` and `pages/settings/QrCard.tsx`. `Settings.tsx` keeps only the page and the admin redirect.
  - Tests: `pages/Settings.test.tsx` must pass unchanged. That's the proof it's a pure move.
  - Done differently: `SaluteCard` moved too (`pages/settings/SaluteCard.tsx`), so `Settings.tsx` really keeps only the page.

- [x] **3. Tests for StockContext** (skill `ui`; tests only, no behaviour change)
  - New `client/src/context/StockContext.test.tsx`. Use `mockApi` and a small consumer component that calls `useStock()`. Use the providers I18n → Toast → Date → Stock, and the setup from `Settings.test.tsx`.
  - Cases:
    - (a) An optimistic edit shows before the request finishes.
    - (b) A failed request shows a toast and reloads `GET /data`.
    - (c) A poll that started before an edit doesn't overwrite it: the `version` ref. Use `vi.useFakeTimers` with `POLL_MS`.
    - (d) No poll runs while an input has focus.
    - (e) `setCount` rethrows on failure.
  - This step is the safety net for step 7.
  - Done differently: the providers include Auth (`DateProvider` calls `useAuth`). A local `fakeApi` with deferred replies replaces `mockApi`, so (a) and (c) can hold a request open. `POLL_MS` is now exported. Each case was checked to fail when its rule is removed.

- [x] **4. Stock math starts at the latest count** (`shared/src/stock.ts`)
  - In `createStockMath`, build once per item a sorted list of its counted days: days with `m`, plus days where `roomSum` isn't null.
  - `calculateTotal(item, D)` and `series` start at the latest counted day ≤ D (that day's total is the count) and replay forward from there. They fall back to `earliestDate()` when there's none.
  - The Overview and Excel still show every day: `series` must return the same map, only cheaper. The days before the anchor are filled by the old replay from `earliestDate()` only when `series` is asked for them.
  - Tests in `stock.test.ts`:
    - copy today's replay into the test as `referenceTotal`;
    - for a generated dataset (counts, `mc`, income, departures, room counts in removed rooms), assert `calculateTotal` equals `referenceTotal` for every day;
    - assert `series` matches too.
  - CLAUDE.md "Rules" and the "Stock calculation" part of `docs/structure.md`: replace "replays from the earliest record date" with "replays from the latest count".
  - Done differently: CLAUDE.md "Rules" never mentioned the replay, so only `docs/structure.md` changed. `series` is unchanged: it already is one forward pass where each count resets the total, so it can't get cheaper while returning every day. An extra test (a `Proxy` on departures) proves `calculateTotal` reads nothing before the latest count.

- [x] **5. The pruning rule, pure** (`shared/`)
  - `shared/src/types.ts`:
    - add `HISTORY_DAYS = 30`;
    - make `CHECKLIST_DAYS` an alias of it, or replace it;
    - make `client/src/context/DateContext.tsx`'s `DAYS_BACK` use it.
  - New `pruneStock(data, keepFrom): boolean` in `shared/src/stock.ts` (or a new `shared/src/prune.ts`, exported from `index.ts`). Let K = the day before `keepFrom`.
    1. For each item that has any data before `keepFrom`, compute `total(K)` with `createStockMath`.
    2. Delete every record, departure (`groupRecords`) and room count dated ≤ K.
    3. Set `records[item][K] = { m: total(K) }`, skipping a total of 0, since a replay starts at 0 anyway.
    - It returns false when nothing is older than K, which makes it cheap and idempotent: after one run the only rows left before `keepFrom` are the carried-over counts at K.
  - Tests:
    - (a) For a dataset with 90 days of mixed data, every `dayFigures` from `keepFrom` to today is identical before and after.
    - (b) Running it twice → the second run returns false.
    - (c) A removed room's counts before K are gone, and the totals are still equal.
    - (d) An item with no history is untouched.
    - (e) A day after `keepFrom` is never touched.
  - Done differently: in a new `shared/src/prune.ts`. `CHECKLIST_DAYS` is an alias of `HISTORY_DAYS`. The carried-over total is computed for every item (not only those with records before `keepFrom`), because departures consume items that have no records. Emptied `records[item]`/`groupRecords[group]` maps are deleted. The "nothing to do" check is `date < K` (matching step 6's cheap SQL check); rows dated exactly K wait for the next day.

- [x] **6. Prune in the SQLite driver** (skill `sqlite-db`)
  - `createSqliteDb` gets an option `today?: () => string` (default `formatDate(todayLocal())`), so tests can move the clock. Use it in `prune()` and `dailyBackup()`.
  - `prune()` computes `keepFrom = today − HISTORY_DAYS − 2`.
    - Cheap check first: `SELECT 1 FROM records|group_records|counts WHERE date < K LIMIT 1`.
    - Only if that finds a row, read the stock tables with `snapshot()`, run `pruneStock`, and rewrite the affected rows: delete `date ≤ K`, then insert the carried-over `m` rows. All of it inside the existing write transaction.
    - So it runs roughly once a day, on the first write. The daily backup is taken before it, so that day's backup still has the data that was just removed.
  - Also call it once after `init()` (start-up) and after `restore`/`importJson`. An old backup is accepted whole and then pruned.
  - Tests in `server/tests/sqlite.test.ts`:
    - seed 60 days, move `today`, write once;
    - old rows are gone, a carried-over `m` row exists at K, and `GET /api/data` totals for the visible days are unchanged (compare `createStockMath` results before and after);
    - a restore of an old backup is pruned.
  - `client/src/lib/excel.ts` `historyRange`: start at the oldest selectable day (it gets `minDate`), so the carried-over day isn't exported.
  - README and `docs/structure.md`: "stock data older than 30 days is removed; counts carry the totals over". Update the `sqlite-db` skill (pruning section).
  - Done differently: the tables are `records`, `departures`, `counts` (there is no `group_records`). Start-up and restore needed no extra call: `init()` already runs `prune` after the import and `replace()` goes through `write()`. `exportExcel` takes `{ from: minDate, today }` from `useSelectedDate()`. The daily backup's keep-list also uses the `today` clock. `server/tests/api.test.ts` used fixed October dates that now fall out of the window, so its stock dates are now relative to today.

- [x] **7. Split the SQLite driver** (skill `sqlite-db`; a pure refactor)
  - `db/sqlite/index.ts` becomes:
    - `index.ts`: the connection, `write()`, `init`, backups, prune;
    - `rows.ts`: `snapshot`, `fill`, the row types and helpers;
    - one file per repo area (`items.ts`, `records.ts`, `counts.ts`, `tasks.ts`, `checklist.ts`, `auth.ts`), each exporting `createX(ctx)` where `ctx = { all, get, run, write }`.
  - Read the old file in parts (`grep -n` the section, then `sed -n`). Move code without rewriting it.
  - Tests: all of `server/tests/` passes unchanged.
  - Update the `sqlite-db` skill ("add a repo method" now names the file) and `docs/structure.md`.
  - Done differently: `ctx` also has `prepare` and `transaction` (the code used `sql.prepare`/`sql.transaction`, and `sql` only opens in `init`). A seventh file `settings.ts` holds the `stockCards` and `settings` repos. Groups/locations live in `items.ts`, departures in `records.ts`, task groups in `tasks.ts`; `namedRepo` and the shared read/write helpers (`createRows`) are in `rows.ts`, and each repo file calls `createRows(ctx)` for the ones it needs.

- [x] **8. Lighter StockContext** (skill `ui`)
  - Step 3's tests must pass unchanged.
  - Move the mutations out of the one `useMemo` into `context/stock/mutations.ts`: a `createMutations({ edit, send, data })` grouped by area. `StockContext.tsx` keeps the state, polling, `send` and `edit`.
  - Replace the `structuredClone(prev)` of the whole dataset with copying only the parts an edit touches. Change `edit(fn)` to `edit(key, fn)`, which copies one top-level key (`records`, `counts`, `tasks`…).
  - With step 6 the dataset stays at ~30 days, so the 15 s full poll stays. Note that as the reason in `docs/structure.md`.
  - Done when: the step 3 tests, `CounterMode.test.tsx` and the full suite pass, and the `ui` skill's "feature end to end" template shows the new `edit(key, fn)` form.
  - Done differently: `edit` takes a key or a list of keys (`edit(['tasks', 'checks'], fn)`), since some edits touch several (removing a group, a task, a task group). The copy is the pure `editData` in `mutations.ts`, tested in `stock/mutations.test.ts`. The context calls it through a `useMutations` hook (the `react-hooks/refs` lint rejects passing `send` to a plain function during render). `restore` stays in `StockContext.tsx` because it replaces the whole dataset (`setData`). The areas are setup (items/groups/locations), daily (records/departures/counts), checklist and settings.

- [x] **9. Page tests** (skill `ui`)
  - `pages/Stock.test.tsx`:
    - typing income updates the total;
    - × clears a manual value;
    - a worker doesn't see the rename/remove controls.
  - `pages/Checklist.test.tsx`:
    - a tick sends `PUT /checks/...`;
    - the editor saves only on Save;
    - the previous day's note is read-only.
  - Use `mockApi` with a small `StockData` fixture in `client/src/test/fixtures.ts`, which later tests can reuse.
  - Done differently: the two files already existed, so the cases are new `describe` blocks in them. `fixtures.ts` also has `mockApp(role, data, route)` (wraps `mockApi`) and `today`/`yesterday`. The worker case is paired with an admin case so it can't pass vacuously. Tests only: the behaviour already worked, so they passed on first run.

- [x] **10. Close out**
  - Delete the "Known weak spots" section from `docs/structure.md`, or leave only what is still open.
  - Check that the `ui`, `sqlite-db` and `i18n` skills and CLAUDE.md match the code: `grep` every file path they name.
  - Delete this plan once every box is ticked, or keep it for the record.
  - Done differently: "Known weak spots" keeps only the open one (every page using `useStock()` re-renders on any change). The 15 s full-poll reason moved to the `StockContext.tsx` line of the file map; the test-coverage line was dropped (the file map lists the tests). Every file path in the `ui`, `sqlite-db`, `i18n`, `auth` skills and CLAUDE.md exists. The plan is kept for the record.

## Token rules for these sessions

- Start from `docs/structure.md`, this plan and the step's skill. Don't explore.
- `StockContext.tsx`, `db/sqlite/index.ts` and `en.ts` are read in parts.
- Run single test files while working, and the full suite once at the end (`| tail -30`).
- None of these steps adds UI text, except a README line. If one does, follow the `i18n` skill.
