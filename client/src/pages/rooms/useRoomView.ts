// The Rooms page view (level, sort, hide-green, full/compact), remembered per device in localStorage.
import { useState } from 'react';
import type { RoomSort, RoomView } from './roomView';

const KEY = 'rooms.view';
/** An old stored sort (`cleanedNew` / `cleanedOld`, removed) is not here, so it loads as `number`. */
const SORTS: readonly RoomSort[] = ['number', 'attention'];
/** Below Tailwind's `sm`: a phone starts with compact tiles. */
const PHONE = '(max-width: 639px)';

/** Full = the room cards; compact = small square tiles, one opens as a full card. */
export type RoomMode = 'full' | 'compact';
export type StoredRoomView = RoomView & { mode: RoomMode };

/** The mode with nothing stored: compact on a phone, full on a wider screen. */
function screenMode(): RoomMode {
  try {
    return window.matchMedia(PHONE).matches ? 'compact' : 'full';
  } catch {
    return 'full';
  }
}

/** The stored view; a missing or unknown field (an older stored view) gets its default. */
export function loadRoomView(): StoredRoomView {
  const fallback: StoredRoomView = {
    level: null,
    sort: 'number',
    hideGreen: false,
    mode: screenMode(),
  };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<StoredRoomView> | null;
    if (!v || typeof v !== 'object') return fallback;
    return {
      level: typeof v.level === 'string' ? v.level : null,
      sort: SORTS.includes(v.sort as RoomSort) ? (v.sort as RoomSort) : 'number',
      hideGreen: v.hideGreen === true,
      mode: v.mode === 'full' || v.mode === 'compact' ? v.mode : fallback.mode,
    };
  } catch {
    return fallback;
  }
}

/**
 * The view state. `levels` are the levels that exist now: a stored level that isn't one of them
 * shows as All (it comes back by itself if that level reappears).
 */
export function useRoomView(levels: readonly string[]) {
  const [stored, setStored] = useState(loadRoomView);
  const view: StoredRoomView =
    stored.level !== null && !levels.includes(stored.level) ? { ...stored, level: null } : stored;

  const update = (patch: Partial<StoredRoomView>) => {
    const next = { ...view, ...patch };
    setStored(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // no storage: the view still works, it just isn't remembered
    }
  };
  return [view, update] as const;
}
