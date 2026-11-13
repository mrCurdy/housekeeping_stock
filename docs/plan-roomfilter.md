# Plan: filter and sort the room cards

Do one step per session with the `plan-step` skill ("do step N of docs/plan-roomfilter.md"), or all
of them with `run-stage`. Every step ends green (`npm run lint && npm run typecheck && npm test`)
and makes one commit. Steps run in order.

## Context

With many rooms the `/rooms` page (`docs/plan-roomcards.md`) gets long. Room numbers have 3 digits
and the first one is the hotel level (101 → level 1). Staff want to see one level at a time, find
the rooms that need attention, and see which rooms are due a general cleaning. It is all a view
of data already loaded: no server, storage or API change.

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

- [ ] **2. The filter bar on the Rooms page** (skills `ui`, `i18n`)
  - New `pages/rooms/RoomFilters.tsx`: a row of level buttons ("All rooms", "1", "2"… with a
    "Level" label, `aria-pressed`), the three sort toggles and the hide-green toggle. It wraps on
    phones (no horizontal page scroll) and uses `Button` variants for on/off, never raw colours.
  - New `pages/rooms/useRoomView.ts`: the `view` state stored in `localStorage` (key
    `rooms.view`), with the invalid-level fallback.
  - `Rooms.tsx`: render `RoomFilters` above the grid when there are rooms, and the grid from
    `viewRooms`. Add the "No rooms match" empty state with Show all.
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

## Token rules for these sessions

- Start from `docs/structure.md`, this plan and the step's skill. Don't explore.
- `RoomCard.tsx` (317 lines) is not touched; don't read it. `en.ts` is read in parts.
- Run single test files while working, the full suite once at the end (`| tail -30`).
