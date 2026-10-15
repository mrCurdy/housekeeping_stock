# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Stock Monitor": a single-page tool for tracking daily housekeeping stock (linens, amenities, etc.) per item, where consumption is partly derived from guest-group departures.

## Commands

```bash
npm install
npm start                              # node server.js → http://localhost:3005 (override with PORT)
npm test                               # unit tests for the stock rules (node:test)
node --test --test-name-pattern="room" test/*.test.mjs   # a single test
```

There is no build step or linter. The running server must be restarted after `server.js` changes. Frontend changes only need a page reload.

## Architecture

No bundler. Vue 3 is loaded as a global build from unpkg, and the app code is native ES modules:

- `server.js`: Express 5. Serves `public/` statically (`data.json`, `server.js` and `node_modules` stay private) plus three endpoints:
  - `GET /api/data` returns `data.json` verbatim.
  - `POST /api/data` replaces it with the request body, but **keeps the `counts` already on disk** unless `?restore=1` (backup restore).
  - `POST /api/count` `{ date, locationId, itemId, value|null }` merges one room count into `counts` and returns that day's counts.

  The server validates only the top-level shape (400 otherwise) and writes atomically (tmp + rename). Counts have their own endpoint because several people count at the same time, while all other edits send the entire dataset (last write wins).
- `public/index.html`: the whole Vue template. Bindings on `#app` itself are ignored by Vue, so root-level classes go on the inner wrapper div.
- `public/js/` (`"type": "module"` via its own package.json). Modules use the `Vue` global, except `dates.js` and `stock.js`, which stay Vue-free so `test/` can import them in Node:
  - `main.js`: `createApp`/`setup()`. It wires the modules together, holds the date navigation and Stock-tab actions, and returns everything the template uses. A new template binding must be added to its return object.
  - `store.js`: state refs, `applyData`, `serializeData`, saving and polling, `getRecord`/`getGroupRecord`.
  - `stock.js`: `createStockMath(state)`, the stock rules (pure).
  - `counting.js`: Inventory count tab, rooms, tab/URL-hash state.
  - `excel.js`, `backup.js`, `theme.js`: toolbar features and the light/dark theme.
- `public/styles.css`: the boilerplate's design system as plain CSS. Layer-1 parameters plus semantic tokens (`--surface`, `--fg-muted`, `--primary`, `--success`/`--warning`/`--danger` and their `-soft` variants) for light and `[data-theme='dark']`. Component classes copy the boilerplate's `components/ui` (`.btn` + `.btn-outline`/`-ghost`/`-danger`/`-sm`/`-icon`, `.card`, `.tabs`/`.tab`, `.badge`, `.alert`, `.empty-state`, `.modal-*`). Use the tokens, never raw colours, so dark mode keeps working. The theme (system/light/dark) is stored in `localStorage.theme` and applied before first paint by the inline script in `index.html`.

### Persistence (several layers, all written on every change)

Each mutation calls `saveData()`. It is debounced (400 ms), because inputs call it on every keystroke, and saves run one after another through a promise chain so they can't reach the server out of order. Use `persistData()` when a save must happen immediately (import, file connect). A pending save is flushed with `sendBeacon` on `pagehide`. Each save writes the full state (from `serializeData()`) to:
1. the server (`POST /api/data` → `data.json`),
2. `localStorage['stockMonitorData']`,
3. a user-picked local file via the File System Access API (`fileHandle`, Chromium only).

`getRecord`/`getGroupRecord` create empty placeholder records during render (the template binds `v-model` to them). `serializeData()` drops these blank entries, so they never reach `data.json`.

On load, the app reads from the server and falls back to localStorage. `applyData()` is the one place that sets state from a parsed dataset. Every 15 s and on window focus, `startPolling()` (store.js) reloads from the server so changes made on other devices show up. It skips the refresh while a save or count is pending, an input has focus, or the group modal is open.

### Data model (`data.json`)

```
items:        [{ id, name, multipliers: { [groupId]: qtyPerDeparture } }]
records:      { [itemId]: { [YYYY-MM-DD]: { c, i, m, mc } } }
groups:       [{ id: 'g_<ts>', name }]
groupRecords: { [groupId]: { [YYYY-MM-DD]: { d } } }
locations:    [{ id: 'l_<ts>', name }]                        // rooms where stock is counted
counts:       { [YYYY-MM-DD]: { [locationId]: { [itemId]: number } } }   // missing = not counted
```

- `d`: departures for a group on that day.
- `c`: extra consumption, added on top of auto consumption.
- `mc`: manual consumption override, which replaces auto + extra.
- `i`: income (stock received).
- `m`: manual stock-count override, which resets the running total to this value for that day.
- Dates are local-time `YYYY-MM-DD` strings (`formatDate`), not ISO/UTC, so string comparison sorts them correctly.

### Stock calculation

`dayFigures(item, date, prevTotal)` is the single source of the stock rules. Order of precedence for the end-of-day total: `m` (typed on the Stock tab) > `roomSum()` (sum of the room counts for that day, including rooms removed since) > calculation, where `total = prevTotal + i - consumption`. Here consumption = `mc` if set, else auto + `c`, where auto = Σ over groups of `multipliers[g] × d`. A manual count `m` is intentionally the end-of-day figure: that day's income and consumption are ignored. The user confirmed this. `calculateTotal(itemId, date)` doesn't store totals: it replays `dayFigures` from the earliest record date up to the target date. The Excel export does the same in one pass.

Date navigation is limited to today −30 / +7 days. The Overview table (`overviewDays`) has one column per navigable day (today −30 … +7) and scrolls sideways, with the item names pinned on the left. It keeps the selected day centred (`scrollOverviewToSelected`). It shows `calculateTotal` only on days where `hasActivity` is true (consumption, income or a count) and "—" otherwise, at the user's request. Clicking a day header jumps to it, and negative totals are shown as shortages.

### Tabs

The tab and selected room live in the URL hash (`#count/<locationId>`), so each floor can bookmark its own room.

- **Stock:** everything above. When a total comes from room counts, it is styled `rooms-val` with a "2/3 rooms" caption (`roomStatus`).
- **Inventory count:** pick a room to see every item with a count input. Typing only creates a draft (`countDrafts`). The row's Save button or Enter calls `submitCount` → `setRoomCount` → `/api/count`, then focuses the next item. Row states are empty / draft / saving / saved / error (`countState`), and failures show a plain-language banner (`countError`). A 404 means the running server predates `/api/count`. On phones (≤768px) the admin toolbar is hidden on this tab and each row stacks the name above a large input and button. **All rooms** shows items × rooms + Sum, plus a "Removed rooms" column when needed. Rooms are added and removed under "Manage rooms".

### Toolbar: Excel / Backup / Restore / Auto-save

- **Excel** (`exportExcel`) is the human-readable history. It lazy-loads ExcelJS from jsdelivr on click; ExcelJS was chosen over SheetJS because SheetJS CE can't write styles. The "Stock" sheet has one row per day, from the first day with data to max(last day, today), with Consumption / Income / Stock columns per item. Counted stock is highlighted and negative stock is red. A "Departures" sheet is added when groups exist. Item names are often Cyrillic, which is one reason the export is .xlsx rather than CSV.
- **Backup** downloads the restorable JSON (`serializeData()`, pretty-printed, including `locations` and `counts`). **Restore** (`handleImport`) asks for confirmation, then replaces all data, counts included, and saves with `?restore=1`.
- **Auto-save** (Chromium only) links a local JSON file that is rewritten on every save.

## `boilerplate/`

`boilerplate/` is an untracked, separate git checkout of a full-stack TypeScript template. This app does not run on it. The user decided against moving to its React/TypeScript/database stack as too heavy for this tool, and against logins ("there is no sensitive data"). It is only the reference for the look: `boilerplate/client/src/styles/index.css` and `components/ui/` are the source of `public/styles.css`. Don't modify it unless explicitly asked.
