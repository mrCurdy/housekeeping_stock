import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { EDGE } from './useDragSort';

/** A row's place: which list, and where in it. */
export interface Place {
  list: number;
  index: number;
}

interface Drag {
  from: Place;
  /** Where it would be dropped: `index` counts the target list's rows without the dragged one */
  to: Place;
  dx: number;
  dy: number;
  /** The dragged row's height: how far the rows after it move up to close the gap */
  height: number;
}

interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

const pageBox = (r: DOMRect): Box => ({
  top: r.top + window.scrollY,
  left: r.left + window.scrollX,
  bottom: r.bottom + window.scrollY,
  right: r.right + window.scrollX,
});

/**
 * Like `useDragSort`, for rows spread over several lists (the checklist's group cards): a row can
 * be dragged into another list. `counts[l]` = the rows of list `l`.
 *
 * - Put `listRef(l)` on each list's whole area (the card: dropping anywhere on it targets that
 *   list, even when it is empty), `rowRef(l, i)`/`rowStyle(l, i)` on the rows and
 *   `handleProps(l, i)` on each row's grip.
 * - Within its own list the rows move out of the way, as in `useDragSort`. Over another list,
 *   `target` says where it would land (show a drop line there).
 * - ↑/↓ on a grip moves the row by one; past a list's edge it goes to the end of the list above or
 *   the start of the list below.
 * - `onMove(from, to)` runs on drop (`to.index` = its place in the target list after the move).
 */
export function useListsDragSort(counts: number[], onMove: (from: Place, to: Place) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef<(HTMLElement | null)[][]>([]);
  const lists = useRef<(HTMLElement | null)[]>([]);
  const start = useRef({ x: 0, y: 0, mids: [] as number[][], boxes: [] as (Box | null)[] });
  const live = useRef<Drag | null>(null);

  const update = (next: Drag | null) => {
    live.current = next;
    setDrag(next);
  };

  const finish = (drop: boolean) => {
    const d = live.current;
    update(null);
    if (!drop || !d) return;
    if (d.to.list !== d.from.list || d.to.index !== d.from.index) onMove(d.from, d.to);
  };

  const handleProps = (list: number, index: number) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const mids = counts.map((n, l) =>
        Array.from({ length: n }, (_, i) => {
          const r = rows.current[l]?.[i]?.getBoundingClientRect();
          return r ? r.top + window.scrollY + r.height / 2 : 0;
        }),
      );
      const boxes = counts.map((_, l) => {
        const r = lists.current[l]?.getBoundingClientRect();
        return r ? pageBox(r) : null;
      });
      start.current = { x: e.clientX, y: e.clientY + window.scrollY, mids, boxes };
      const height = rows.current[list]?.[index]?.getBoundingClientRect().height ?? 0;
      const here = { list, index };
      update({ from: here, to: here, dx: 0, dy: 0, height });
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = live.current;
      if (!d) return;
      if (e.clientY < EDGE) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 12);
      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;
      const dy = y - start.current.y;
      const dx = e.clientX - start.current.x;
      // The list under the pointer (between lists: keep the last one)
      const under = start.current.boxes.findIndex(
        (b) => b && b.left <= x && x <= b.right && b.top <= y && y <= b.bottom,
      );
      const list = under < 0 ? d.to.list : under;
      // The new place = how many other rows of that list the dragged row's centre has passed
      const centre = start.current.mids[d.from.list]![d.from.index]! + dy;
      const index = (start.current.mids[list] ?? []).filter(
        (mid, i) => !(list === d.from.list && i === d.from.index) && mid < centre,
      ).length;
      update({ ...d, to: { list, index }, dx, dy });
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!step) return;
      const to = index + step;
      let place: Place | null = null;
      if (to >= 0 && to < counts[list]!) place = { list, index: to };
      else if (step < 0 && list > 0) place = { list: list - 1, index: counts[list - 1]! };
      else if (step > 0 && list < counts.length - 1) place = { list: list + 1, index: 0 };
      if (!place) return;
      e.preventDefault();
      onMove({ list, index }, place);
    },
  });

  const rowStyle = (list: number, index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const { from, to, dx, dy, height: h } = drag;
    if (list === from.list && index === from.index) {
      const moved = to.list !== from.list;
      return {
        transform: moved ? `translate(${dx}px, ${dy}px)` : `translateY(${dy}px)`,
        position: 'relative',
        zIndex: 10,
      };
    }
    // Only its own list makes room; another list shows a drop line (`target`)
    if (list !== from.list || to.list !== from.list) return undefined;
    const shift =
      from.index < index && index <= to.index
        ? -h
        : to.index <= index && index < from.index
          ? h
          : 0;
    return { transform: `translateY(${shift}px)`, transition: 'transform 150ms ease' };
  };

  const rowRef = (list: number, index: number) => (el: HTMLElement | null) => {
    (rows.current[list] ??= [])[index] = el;
  };
  const listRef = (list: number) => (el: HTMLElement | null) => {
    lists.current[list] = el;
  };

  // target: set while the row is over another list
  const target = drag && drag.to.list !== drag.from.list ? drag.to : null;
  return { dragging: drag?.from ?? null, target, handleProps, rowStyle, rowRef, listRef };
}
