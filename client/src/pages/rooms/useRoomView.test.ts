import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRoomView } from './useRoomView';

const screen = (phone: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: phone && q === '(max-width: 639px)',
    addEventListener() {},
    removeEventListener() {},
  }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('loadRoomView mode', () => {
  it('nothing stored: compact on a phone, full on a wider screen', () => {
    screen(true);
    expect(loadRoomView().mode).toBe('compact');
    screen(false);
    expect(loadRoomView().mode).toBe('full');
  });

  it('the stored mode wins over the screen default', () => {
    screen(true);
    localStorage.setItem('rooms.view', JSON.stringify({ mode: 'full' }));
    expect(loadRoomView().mode).toBe('full');
    screen(false);
    localStorage.setItem('rooms.view', JSON.stringify({ mode: 'compact' }));
    expect(loadRoomView().mode).toBe('compact');
  });

  it('an old stored view without a mode keeps its settings and uses the screen default', () => {
    screen(true);
    localStorage.setItem(
      'rooms.view',
      JSON.stringify({ level: '2', sort: 'attention', hideGreen: true }),
    );
    expect(loadRoomView()).toEqual({
      level: '2',
      sort: 'attention',
      hideGreen: true,
      mode: 'compact',
    });
  });

  it('an old stored cleaning sort loads as level order', () => {
    screen(false);
    localStorage.setItem('rooms.view', JSON.stringify({ level: '2', sort: 'cleanedOld' }));
    expect(loadRoomView()).toMatchObject({ level: '2', sort: 'number' });
    localStorage.setItem('rooms.view', JSON.stringify({ sort: 'cleanedNew' }));
    expect(loadRoomView().sort).toBe('number');
  });

  it('works without matchMedia or storage', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(loadRoomView().mode).toBe('full');
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
    });
    expect(loadRoomView().sort).toBe('number');
  });
});
