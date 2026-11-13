import { ROOM_COLORS } from '@app/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOM_COLOR_CLASSES } from './roomColors';

describe('ROOM_COLOR_CLASSES', () => {
  it('has classes for every room colour, each backed by a light and a dark token', () => {
    const css = readFileSync(resolve(__dirname, '../styles/index.css'), 'utf8');
    for (const c of ROOM_COLORS) {
      expect(ROOM_COLOR_CLASSES[c].dot).toBe(`bg-status-${c}`);
      // :root, [data-theme='dark'] and the @theme mapping
      expect(css.match(new RegExp(`--status-${c}:`, 'g'))).toHaveLength(2);
      expect(css).toContain(`--color-status-${c}: var(--status-${c});`);
    }
  });
});
