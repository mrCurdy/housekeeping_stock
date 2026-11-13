// The Rooms page view (level, sort, hide-green), remembered per device in localStorage.
import { useState } from 'react';
import type { RoomSort, RoomView } from './roomView';

const KEY = 'rooms.view';
const SORTS: readonly RoomSort[] = ['number', 'cleanedNew', 'cleanedOld', 'attention'];
export const DEFAULT_VIEW: RoomView = { level: null, sort: 'number', hideGreen: false };

function load(): RoomView {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RoomView> | null;
    if (!v || typeof v !== 'object') return DEFAULT_VIEW;
    return {
      level: typeof v.level === 'string' ? v.level : null,
      sort: SORTS.includes(v.sort as RoomSort) ? (v.sort as RoomSort) : 'number',
      hideGreen: v.hideGreen === true,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

/**
 * The view state. `levels` are the levels that exist now: a stored level that isn't one of them
 * shows as All (it comes back by itself if that level reappears).
 */
export function useRoomView(levels: readonly string[]) {
  const [stored, setStored] = useState(load);
  const view: RoomView =
    stored.level !== null && !levels.includes(stored.level) ? { ...stored, level: null } : stored;

  const update = (patch: Partial<RoomView>) => {
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
