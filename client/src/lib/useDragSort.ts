import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

interface Drag {
  from: number;
  to: number;
  dx: number;
  dy: number;
  /** The dragged row's height plus the gap between rows: how far the others move aside */
  height: number;
}

interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** How close to the top or bottom of the screen a drag starts scrolling the page. */
export const EDGE = 64;

/**
 * Reordering a vertical list (tasks, the Stock page's cards) by dragging a handle (mouse, touch or pen), or with ↑/↓ on the
 * focused handle. The rows move out of the way while dragging; `onMove(from, to)` runs on drop.
 * Put `rowRef(i)` and `rowStyle(i)` on every row and `handleProps(i)` on each row's handle.
 *
 * `free`: for rows that may sit side by side (the Stock page's cards). The dragged row follows the
 * pointer in both directions, the others stay put, and the row under the pointer is the new place
 * (`over`, to highlight it).
 */
export function useDragSort(
  count: number,
  onMove: (from: number, to: number) => void,
  { free = false }: { free?: boolean } = {},
) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const start = useRef({ x: 0, y: 0, mids: [] as number[], boxes: [] as (Box | null)[] });
  const live = useRef<Drag | null>(null);

  const update = (next: Drag | null) => {
    live.current = next;
    setDrag(next);
  };

  const finish = (drop: boolean) => {
    const d = live.current;
    update(null);
    if (drop && d && d.to !== d.from) onMove(d.from, d.to);
  };

  const handleProps = (index: number) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const rects = rows.current.slice(0, count).map((r) => r?.getBoundingClientRect());
      const { scrollX, scrollY } = window;
      start.current = {
        x: e.clientX,
        y: e.clientY + scrollY,
        mids: rects.map((r) => (r ? r.top + scrollY + r.height / 2 : 0)),
        boxes: rects.map((r) =>
          r
            ? {
                top: r.top + scrollY,
                left: r.left + scrollX,
                bottom: r.bottom + scrollY,
                right: r.right + scrollX,
              }
            : null,
        ),
      };
      const gap = rects[0] && rects[1] ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
      update({ from: index, to: index, dx: 0, dy: 0, height: (rects[index]?.height ?? 0) + gap });
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = live.current;
      if (!d) return;
      if (e.clientY < EDGE) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, 12);
      const dy = e.clientY + window.scrollY - start.current.y;
      const dx = e.clientX - start.current.x;
      if (free) {
        // The new place = the row under the pointer (between rows: keep the last one)
        const x = e.clientX + window.scrollX;
        const y = e.clientY + window.scrollY;
        const under = start.current.boxes.findIndex(
          (b) => b && b.left <= x && x <= b.right && b.top <= y && y <= b.bottom,
        );
        return update({ ...d, to: under < 0 ? d.to : under, dx, dy });
      }
      const centre = start.current.mids[d.from]! + dy;
      // The new place = how many other rows the dragged row's centre has passed
      const to = start.current.mids.filter((mid, i) => i !== d.from && mid < centre).length;
      update({ ...d, to, dx, dy });
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      const to = index + step;
      if (!step || to < 0 || to >= count) return;
      e.preventDefault();
      onMove(index, to);
    },
  });

  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const { from, to, dx, dy, height: h } = drag;
    if (index === from) {
      const transform = free ? `translate(${dx}px, ${dy}px)` : `translateY(${dy}px)`;
      return { transform, position: 'relative', zIndex: 10 };
    }
    if (free) return undefined;
    const shift = from < index && index <= to ? -h : to <= index && index < from ? h : 0;
    return { transform: `translateY(${shift}px)`, transition: 'transform 150ms ease' };
  };

  const rowRef = (index: number) => (el: HTMLElement | null) => {
    rows.current[index] = el;
  };

  // dragging: the index of the row being dragged; over (free mode): the row it would take the place of
  const over = free && drag && drag.to !== drag.from ? drag.to : null;
  return { dragging: drag?.from ?? null, over, handleProps, rowStyle, rowRef };
}
