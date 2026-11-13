# Plan: filter and sort the room cards

Do one step per session with the `plan-step` skill ("do step N of docs/plan-roomfilter.md"), or all
of them with `run-stage`. Every step ends green (`npm run lint && npm run typecheck && npm test`)
and makes one commit. Steps run in order.

## Context

With many rooms the `/rooms` page (`docs/plan-roomcards.md`) gets long. Room numbers have 3 digits
and the first one is the hotel level (101 → level 1). Staff want to see one level at a time, find
the rooms that need attention, and see which rooms are due a general cleaning. It is all a view
of data already loaded: no server, storage or API change (except step 3, which makes adding a
room admin-only).

## Decisions (confirmed with the user)

- **Level buttons:** "All rooms" plus one button per level that some room has, from the first
  character of its number (101, 115, 205 → `1`, `2`), in natural order. A new floor shows up by
  itself. One level (or All) is active at a time.
- **Sort:** three separate toggle buttons. Pressing one turns the others off; pressing the active one
  turns it off, which goes back to the default order by room number (`sortRooms`).
  - **Recently cleaned first:** latest cleaning date, newest first. Never-cleaned rooms go last.
  - **Recently cleaned last:** oldest first, never-cleaned rooms at the top (they are the most
    overdue).
  - **Needs attention first:** by the room's worst unit status colour: red, then yellow, then the
    7 extra colours, then all-green last.
  - Ties always fall back to room number.
  - **Default order (no sort active) is level by level** (added by the user after step 1): first by
    level (`roomLevel`, natural order, so level `0` comes first), then by number inside the level:
    001, 002, 003, 101 … 112, 201 … With 3-digit numbers this matches the natural sort, but grouping
    by level first keeps odd numbers (`99`, `1010`) with their level. The "All rooms" view and the
    tie-breaks use this order too.
- **Hide all-green rooms:** an independent toggle. It hides a room when every unit's status
  (`unitStatusOf`, so unstored = the first status) has colour `green`. Only unit statuses count, not
  the cleaning colour. Shown only when units exist.
- **Remembered per device:** level, sort and hide-green are kept in `localStorage` (try/catch, so it
  works without storage). A stored level that no longer exists falls back to All.
- When the filters hide every room: an empty state "No rooms match" with a **Show all** button that
  resets the level and hide-green (the sort stays).
- Workers and admin both get the filters (they only change the view).

## Steps

- [x] **1. The view rules, pure** (skill `ui`)
  - Done: `roomStatusList` isn't imported (`unitStatusOf` already uses it). `viewRooms` ignores
    hide-green while there are no units; `roomUrgency` is 0 and `allGreen` true with no units.
  - New `client/src/pages/rooms/roomView.ts` (+ `roomView.test.ts`):
    - `roomLevel(number)`: the first character, trimmed;
    - `roomLevels(rooms)`: the distinct levels, natural order;
    - `roomUrgency(data, roomId)`: worst unit colour → 3 red, 2 yellow, 1 other, 0 green;
    - `allGreen(data, roomId)`;
    - `viewRooms(data, view)` with `view = { level: string | null, sort: 'number' | 'cleanedNew'
| 'cleanedOld' | 'attention', hideGreen: boolean }`, using `sortRooms`, `latestCleaning`,
      `unitStatusOf` and `roomStatusList` from `@app/shared`.
  - Tests:
    - levels from mixed numbers;
    - each sort, including never-cleaned placement and ties by number;
    - urgency order red > yellow > extra colour > green;
    - hide-green with an unstored (default first) status;
    - a level filter combined with a sort.

- [x] **2. The filter bar on the Rooms page** (skills `ui`, `i18n`)
  - Done: the default order is `sortByLevel` in `roomView.ts` (its own collator; `sortRooms` stays
    for the rest of the app). The existing page test now expects `10` before `2` (level 1 first).
    `useRoomView` keeps a missing stored level (shown as All) so it returns if the level reappears.
  - New `pages/rooms/RoomFilters.tsx`: a row of level buttons ("All rooms", "1", "2"… with a
    "Level" label, `aria-pressed`), the three sort toggles and the hide-green toggle. It wraps on
    phones (no horizontal page scroll) and uses `Button` variants for on/off, never raw colours.
  - New `pages/rooms/useRoomView.ts`: the `view` state stored in `localStorage` (key
    `rooms.view`), with the invalid-level fallback.
  - `Rooms.tsx`: render `RoomFilters` above the grid when there are rooms, and the grid from
    `viewRooms`. Add the "No rooms match" empty state with Show all.
  - `roomView.ts`: the default order (sort `'number'`) and every tie-break become level first, then
    number (see Decisions). Tests in `roomView.test.ts`: `['112', '003', '101', '001', '002']` →
    `001, 002, 003, 101, 112`; `99` (level `9`) sorts after `205` (level `2`); a level filter
    keeps that order.
  - Text in en/et/ru under `rooms.filter.*`.
  - Tests in `pages/Rooms.test.tsx`:
    - level buttons appear from the rooms, and pressing one shows only that level;
    - "All rooms" shows all;
    - a sort toggle reorders the cards, and pressing it again restores number order;
    - hide-green hides an all-green room;
    - the view survives a re-render from `localStorage`;
    - "Show all" resets the filters.
  - Docs: `docs/structure.md` (file map under `pages/rooms/`, the `/rooms` page section) and the
    `ui` skill if it lists page examples. Tick the plan.

- [x] **3. Search instead of "add room"; Add room moves to Settings** (skills `ui`, `i18n`, `auth`)
  - Done: `viewRooms` takes `RoomQuery` (= `RoomView` + `search?`). `RoomSearch` is a plain `Input`
    with its own × (`ClearableInput` is commit-on-blur; the search filters live), Escape clears too.
    The no-rooms worker text is `common.askAdmin`. Also fixed a pre-existing typecheck error in
    `server/src/seed/data.ts` (`g.use[i] ?? 0`).
  - Added by the user after step 2. Decisions (confirmed):
    - **Search field** on the Rooms page, where `NewRoomForm` is now (above the filter bar, always
      shown when there are rooms). Case-insensitive, trimmed; empty = no search.
      - **Number:** prefix match, digits in order: `3` → 301, 315 (not 103); `30` → 301–309;
        `001` → 001.
      - **Type:** the room type's name starts with the query (`dou` → Double rooms). A room matches
        when its number **or** its type name matches.
      - **While a search is typed the level buttons are ignored** (search across all levels; the
        active level stays selected and applies again when the search is cleared). Sort and
        hide-green still apply.
      - Not remembered: the search starts empty on each visit (level/sort/hide-green stay in
        `localStorage` as before). An × clears it (`ClearableInput` or the `Input` with a clear
        button).
      - "No rooms match" → **Show all** also clears the search.
    - **Adding a room is admin-only and lives in Settings.** The room-card setup card gets an
      **Add room** button that opens a `Modal` with room number, type (`typeOptions`) and note,
      Cancel / Add. A taken number shows the error in the dialog before sending (`roomExists`). The
      Rooms page no longer has `NewRoomForm`; workers keep editing a card's note, statuses,
      cleanings and ✎ number/type/delete as now.
  - `roomView.ts`: `matchesSearch(room, query, types)` and a `search` field in `viewRooms`'s input
    (not in the stored `RoomView`). Tests in `roomView.test.ts`: `3` matches 301 and not 103; `30`;
    type prefix (`dou`, case-insensitive); a search ignores the level filter but keeps sort and
    hide-green; empty/space-only query = no search.
  - Rooms page: a `RoomSearch` field (or inside `RoomFilters`), placeholder "Room number or type".
    Remove `NewRoomForm` from `Rooms.tsx`. The empty state for no rooms points the admin to
    Settings (`openSettings` link, as the no-units one does) and tells a worker to ask the admin.
  - Settings: turn `pages/rooms/NewRoomForm.tsx` into `pages/settings/AddRoomDialog.tsx` (number,
    type, note) opened from an "Add room" button in `RoomSetupCard`. `addRoom` in `mutations.ts`
    sends the note too (the create schema already takes `note`; check).
  - **Server:** `POST /rooms` now needs `allow('setup')` instead of `rooms`. `PATCH`/`DELETE` and
    the unit-status/cleaning routes stay `rooms`. Tests: move the worker "may create a room" case
    to a 403 case in `tests/auth.test.ts`; worker room cases in `rooms.test.ts` create their room
    as admin first.
  - `shared/src/auth.ts` comment and the `auth` skill matrix: `rooms` = edit cards (note, number,
    type, delete), statuses, cleanings; adding rooms is `setup`.
  - Text in en/et/ru (`rooms.filter.search*`, the dialog under `settings.rooms.addRoom*`); remove
    keys that become unused.
  - Client tests: `Rooms.test.tsx`: typing `3` shows only 3xx; a type name; search ignores the level;
    × clears; no add-room form on the page. `Settings.test.tsx`: Add room → dialog → Add sends
    `POST /rooms` with number/type/note, Cancel sends nothing, a taken number shows the error.
  - Docs: `docs/structure.md` (file map: the moved file, `/rooms` and `/settings` sections, the
    API line for `POST /rooms`), README's `/rooms` line if it mentions adding.

- [ ] **4. Card view toggle: full or compact tiles** (skills `ui`, `i18n`)
  - Added by the user after step 3. Decisions (confirmed):
    - **Two modes**, a toggle in the filter bar (two icon buttons with `aria-pressed` and
      translated `aria-label`s, e.g. `LayoutGrid` / `Grid2x2` or `Rows` / `Grid`):
      - **Full:** the cards as they are now.
      - **Compact:** each room is a small **square** tile (`aspect-square`) with the room number,
        the room type name and two icons:
        - **broom** (lucide `Brush` or similar), coloured by the general-cleaning colour
          (`cleaningLevel`: green / yellow / red);
        - **wrench** (`Wrench`), coloured by the room's worst unit status colour (the colour
          `roomUrgency` ranks; all-green → green). No units → the wrench isn't shown.
        - Colours come from the `--status-*` tokens (`text-status-red`…), never raw colours.
          Each icon has a translated `aria-label`/`title` (e.g. "Cleaned 12 days ago", the worst
          status name), so the meaning isn't only the colour.
        - The tiles go in a denser grid (several per row on a phone, more on desktop), with no
          horizontal page scroll.
    - **Opening a tile:** tapping a tile (a `button`) opens that room as the normal full card,
      **taking a whole grid row** (`col-span-full`) where it is. The other tiles stay small and
      flow above/below it, so the user keeps scrolling. **Only one is open:** tapping another tile
      closes the first and opens the new one. The open card has a close control (× or tap on its
      header) that turns it back into a tile. The open room isn't remembered, and it closes when
      the filters/search hide it.
    - **Default per device:** with nothing stored, phones (`matchMedia('(max-width: 639px)')`,
      Tailwind's `sm`) start in compact and wider screens in full. Once the user picks a mode it is
      stored with the other view settings (`rooms.view` in `localStorage`, try/catch), and an
      old stored view without the field uses the screen default.
    - Admin and workers both get the toggle. It only changes the view; no server change.
  - New `pages/rooms/RoomTile.tsx` (the square tile). The open card is the existing `RoomCard`;
    put the close control in a wrapper in `Rooms.tsx` (or a small optional `onClose` prop on
    `RoomCard`; read only the part of `RoomCard.tsx` you change). `useRoomView` gets `mode:
    'full' | 'compact'` with the screen default. The toggle goes in `RoomFilters`.
  - Text in en/et/ru (`rooms.filter.viewFull`, `rooms.filter.viewCompact`, the icon labels).
  - Tests:
    - `roomView.test.ts` (or `useRoomView` tests): the stored mode wins; no stored mode → compact
      when `matchMedia` matches, full otherwise; an old stored view without `mode` still loads.
    - `Rooms.test.tsx`: the toggle switches between cards and tiles; a tile shows the number, the
      type and the icon labels (a red unit status → the wrench says the red status; never cleaned →
      the broom is red); tapping a tile opens its full card and the others stay tiles; tapping a
      second tile closes the first; the close control turns it back into a tile; the mode survives
      a re-render from `localStorage`.
  - Docs: `docs/structure.md` (file map `RoomTile.tsx`, the `/rooms` page section), the `ui`
    skill if it lists page examples. Tick the plan.

## Token rules for these sessions

- Start from `docs/structure.md`, this plan and the step's skill. Don't explore.
- `RoomCard.tsx` (317 lines) is not touched (step 4 at most adds an `onClose` prop); don't read it whole. `en.ts` is read in parts.
- Run single test files while working, the full suite once at the end (`| tail -30`).
