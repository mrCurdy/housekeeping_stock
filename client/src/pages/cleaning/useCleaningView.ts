// The Cleaning page view (level, dirty first), remembered per device in localStorage.
import { useState } from 'react';
import type { CleaningQuery } from '../rooms/roomView';

const KEY = 'cleaning.view';

export type CleaningView = Omit<CleaningQuery, 'search'>;

/** The stored view; a missing or unknown field gets its default (all levels, level order). */
export function loadCleaningView(): CleaningView {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CleaningView> | null;
    if (!v || typeof v !== 'object') return { level: null, dirtyFirst: false };
    return {
      level: typeof v.level === 'string' ? v.level : null,
      dirtyFirst: v.dirtyFirst === true,
    };
  } catch {
    return { level: null, dirtyFirst: false };
  }
}

/**
 * The view state. `levels` are the levels that exist now: a stored level that isn't one of them
 * shows as All (it comes back by itself if that level reappears).
 */
export function useCleaningView(levels: readonly string[]) {
  const [stored, setStored] = useState(loadCleaningView);
  const view: CleaningView =
    stored.level !== null && !levels.includes(stored.level) ? { ...stored, level: null } : stored;

  const update = (patch: Partial<CleaningView>) => {
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
