/** Space kept between a focused field and the keyboard or the top of the screen */
const MARGIN = 24;
const NOT_TYPED = new Set([
  'button',
  'checkbox',
  'file',
  'hidden',
  'radio',
  'range',
  'reset',
  'submit',
]);

const isField = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLInputElement && !NOT_TYPED.has(el.type));

function scrollParent(el: HTMLElement): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight)
      return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Keeps the focused field visible above the on-screen keyboard. Android Chrome shrinks the page
 * for it (`interactive-widget` in index.html); iOS Safari only lays it over the page, so the
 * keyboard's height is tracked with `visualViewport`: `--keyboard-inset` pads the bottom of the
 * page so the last fields can scroll above it, and a field that ends up hidden is scrolled to
 * the middle of what is still visible.
 */
export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;

  const reveal = () => {
    const el = document.activeElement;
    if (!isField(el)) return;
    const { top, bottom } = el.getBoundingClientRect();
    const visibleTop = vv.offsetTop + MARGIN;
    const visibleBottom = vv.offsetTop + vv.height - MARGIN;
    if (top >= visibleTop && bottom <= visibleBottom) return;
    const middle = (visibleTop + visibleBottom) / 2;
    scrollParent(el).scrollBy({ top: (top + bottom) / 2 - middle, behavior: 'smooth' });
  };

  const onResize = () => {
    const inset = Math.round(window.innerHeight - vv.height);
    // Small differences are the browser's toolbars or pinch zoom, not the keyboard
    document.documentElement.style.setProperty(
      '--keyboard-inset',
      inset > 120 && vv.scale <= 1.01 ? `${inset}px` : '0px',
    );
    requestAnimationFrame(reveal);
  };

  vv.addEventListener('resize', onResize);
  document.addEventListener('focusin', () => requestAnimationFrame(reveal));
}
