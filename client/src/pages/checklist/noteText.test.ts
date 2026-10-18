import { describe, expect, it } from 'vitest';
import { checkKeys, continueList, indent, parseNote, toggleList, type TextEdit } from './noteText';

/** `|` marks the caret, `[` `]` a selection. */
const at = (text: string): TextEdit => {
  const caret = text.indexOf('|');
  if (caret >= 0) return { value: text.replace('|', ''), start: caret, end: caret };
  const start = text.indexOf('[');
  const end = text.indexOf(']') - 1;
  return { value: text.replace('[', '').replace(']', ''), start, end };
};
const show = ({ value, start, end }: TextEdit) =>
  start === end
    ? value.slice(0, start) + '|' + value.slice(start)
    : value.slice(0, start) + '[' + value.slice(start, end) + ']' + value.slice(end);

describe('task instructions', () => {
  it('reads bullets, numbers and checklist lines, nested by 2 spaces', () => {
    expect(parseNote('Intro\n- a\n  * b\n1. c\n    - [ ] d\n- [x] e\n-x')).toEqual([
      { kind: 'text', text: 'Intro' },
      { kind: 'bullet', text: 'a', depth: 0 },
      { kind: 'bullet', text: 'b', depth: 1 },
      { kind: 'number', text: 'c', depth: 0, n: 1 },
      { kind: 'check', text: 'd', depth: 2, key: expect.any(String) },
      { kind: 'check', text: 'e', depth: 0, key: expect.any(String) },
      { kind: 'text', text: '-x' },
    ]);
  });

  it('gives each checklist line a key that follows its text', () => {
    const [a, b, a2] = checkKeys('- [ ] Mop\n- [ ] Dust\n- [ ] Mop');
    expect(new Set([a, b, a2]).size).toBe(3);
    expect(checkKeys('Note\n- [ ] Dust\n  - [ ] Mop')).toEqual([b, a]);
    expect(a).toMatch(/^[a-z0-9]{1,16}$/);
  });

  it('list buttons turn lines into a list and back', () => {
    expect(show(toggleList(at('Mop|'), 'check'))).toBe('- [ ] Mop|');
    expect(show(toggleList(at('[a\n  b]'), 'number'))).toBe('1. [a\n  2. b]');
    expect(show(toggleList(at('- a\n- b|'), 'check'))).toBe('- a\n- [ ] b|');
    expect(show(toggleList(at('[- a\n- b]'), 'bullet'))).toBe('[a\nb]');
    expect(show(toggleList(at('x\n- a|\ny'), 'bullet'))).toBe('x\na|\ny');
  });

  it('indents and outdents the selected lines', () => {
    expect(show(indent(at('- a\n- |b'), 1))).toBe('- a\n  - |b');
    expect(show(indent(at('[- a\n  - b]'), -1))).toBe('[- a\n- b]');
    expect(show(indent(at(' |x'), -1))).toBe('|x');
  });

  it('Enter continues a list; Enter on an empty item ends it', () => {
    expect(show(continueList(at('  - [ ] Mop|'))!)).toBe('  - [ ] Mop\n  - [ ] |');
    expect(show(continueList(at('2. a|\nb'))!)).toBe('2. a\n3. |\nb');
    expect(show(continueList(at('- a\n- |'))!)).toBe('- a\n|');
    expect(continueList(at('plain|'))).toBeNull();
    expect(continueList(at('|- a'))).toBeNull();
  });
});
