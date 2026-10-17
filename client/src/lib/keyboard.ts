/** Space kept between a focused field and the top of the screen */
const MARGIN_TOP = 24;
/** Space kept above the keyboard (clears the iOS ^ ∨ Done bar, whose height varies) */
const MARGIN_BOTTOM = 64;
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
 *
 * Safari pans the page to the field itself while the keyboard slides in, so the check waits
 * until things settle (measuring mid-animation saw a half-open keyboard and fought Safari's pan,
 * making the page bounce) and looks once more a bit later, for a late change in the keyboard's
 * height. The scroll is instant: a smooth one would still be running when Safari moves again.
 */
export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  let keyboardOpen = false;
  let timers: number[] = [];

  const reveal = () => {
    const el = document.activeElement;
    if (!isField(el)) return;
    const { top, bottom } = el.getBoundingClientRect();
    const visibleTop = vv.offsetTop + MARGIN_TOP;
    const visibleBottom = vv.offsetTop + vv.height - MARGIN_BOTTOM;
    if (top >= visibleTop && bottom <= visibleBottom) return;
    const middle = (visibleTop + visibleBottom) / 2;
    // Centred, but a tall field (textarea) keeps its top in view
    const delta = Math.min((top + bottom) / 2 - middle, top - visibleTop);
    scrollParent(el).scrollBy({ top: delta, behavior: 'auto' });
  };

  const revealSoon = () => {
    timers.forEach(clearTimeout);
    timers = [window.setTimeout(reveal, 150), window.setTimeout(reveal, 550)];
  };

  vv.addEventListener('resize', () => {
    const inset = Math.round(window.innerHeight - vv.height);
    // Small differences are the browser's toolbars or pinch zoom, not the keyboard
    keyboardOpen = inset > 120 && vv.scale <= 1.01;
    document.documentElement.style.setProperty(
      '--keyboard-inset',
      keyboardOpen ? `${inset}px` : '0px',
    );
    revealSoon();
  });
  // Safari's pan moves the visual viewport without resizing it
  vv.addEventListener('scroll', () => {
    if (keyboardOpen) revealSoon();
  });
  document.addEventListener('focusin', revealSoon);
}
