import { useEffect, useState } from 'react';
import { useStock } from '@/context/StockContext';

export type CountState = 'empty' | 'draft' | 'saving' | 'saved' | 'error';

export const countKey = (date: string, locationId: string, itemId: string) =>
  `${date}|${locationId}|${itemId}`;

/**
 * Counting state: typed numbers stay drafts until the row is saved (Save button or Enter).
 * Keyed by date|room|item, so switching rooms or days keeps unsaved numbers.
 */
export function useCountDrafts() {
  const { data } = useStock();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, 'saving' | 'error'>>({});

  const saved = (key: string) => {
    const [date, loc, item] = key.split('|') as [string, string, string];
    return data.counts[date]?.[loc]?.[item];
  };
  const isUnsaved = (key: string) =>
    key in drafts && drafts[key]!.trim() !== String(saved(key) ?? '');

  const hasUnsaved = Object.keys(drafts).some(isUnsaved);
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  return {
    /** What the input shows: the draft, else the saved count */
    text: (key: string) => drafts[key] ?? String(saved(key) ?? ''),
    setText: (key: string, text: string) => setDrafts((d) => ({ ...d, [key]: text })),
    state: (key: string): CountState => {
      if (status[key]) return status[key];
      if (isUnsaved(key)) return 'draft';
      return saved(key) != null ? 'saved' : 'empty';
    },
    setStatus: (key: string, s: 'saving' | 'error' | null) =>
      setStatus(({ [key]: _, ...rest }) => (s ? { ...rest, [key]: s } : rest)),
    clearDraft: (key: string) => setDrafts(({ [key]: _, ...rest }) => rest),
  };
}

export type CountDrafts = ReturnType<typeof useCountDrafts>;
