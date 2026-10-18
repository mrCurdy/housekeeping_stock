/**
 * Task instructions are plain text with note-app lists, nested by indenting 2 spaces:
 * `- item` (bullet), `1. item` (numbered) and `- [ ] item` (a checklist line, ticked per day).
 * Everything else is shown as typed.
 */

export type ListKind = 'bullet' | 'number' | 'check';

export type NoteLine =
  | { kind: 'text'; text: string }
  | {
      kind: ListKind;
      text: string;
      /** Nesting level (2 spaces each) */
      depth: number;
      /** The typed number of a numbered line */
      n?: number;
      /** A checklist line's tick key: stays the same while its text does */
      key?: string;
    };

const LIST = /^([ \t]*)(?:(- \[[ xX]?\])|([-*•])|(\d+)[.)])(?:[ \t]+(.*))?$/;

const indentOf = (space: string) => space.replace(/\t/g, '  ').length;

/** A short, stable key from a line's text (FNV-1a, base 36). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function parseNote(text: string): NoteLine[] {
  const seen = new Map<string, number>();
  return text.split('\n').map((line): NoteLine => {
    const m = LIST.exec(line);
    if (!m) return { kind: 'text', text: line };
    const [, space = '', check, , num, rest = ''] = m;
    const depth = Math.floor(indentOf(space) / 2);
    if (check) {
      // Two lines with the same text get different keys
      const label = rest.trim();
      const nth = seen.get(label) ?? 0;
      seen.set(label, nth + 1);
      return { kind: 'check', text: rest, depth, key: hash(nth ? `${label}\n${nth}` : label) };
    }
    if (num) return { kind: 'number', text: rest, depth, n: Number(num) };
    return { kind: 'bullet', text: rest, depth };
  });
}

/** The tick keys of the checklist lines in a task's instructions. */
export const checkKeys = (text: string): string[] =>
  parseNote(text).flatMap((l) => (l.kind === 'check' ? [l.key!] : []));

// ---- Editing (the textarea's value and selection in, the new ones out) ----

export interface TextEdit {
  value: string;
  start: number;
  end: number;
}

const marker = (kind: ListKind, n = 1) =>
  kind === 'bullet' ? '- ' : kind === 'check' ? '- [ ] ' : `${n}. `;

/** Splits a line into its indent, list marker (with the space after it) and text. */
function splitLine(line: string): { space: string; mark: string; kind?: ListKind; n?: number } {
  const m = LIST.exec(line);
  if (!m) {
    const space = /^[ \t]*/.exec(line)![0];
    return { space, mark: '' };
  }
  const [, space = '', check, , num] = m;
  const after = line.slice(space.length);
  const mark = /^(- \[[ xX]?\]|[-*•]|\d+[.)])[ \t]*/.exec(after)![0];
  const kind: ListKind = check ? 'check' : num ? 'number' : 'bullet';
  return { space, mark, kind, ...(num && { n: Number(num) }) };
}

/**
 * Replaces the start (indent and marker) of every line the selection touches, keeping the
 * selection on the same text. `fn` returns how long the old start is and what replaces it.
 */
function eachLine(
  edit: TextEdit,
  fn: (line: string, index: number) => { cut: number; put: string },
): TextEdit {
  const { value, start, end } = edit;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  // A selection ending right after a newline doesn't include the next line
  const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nl = value.indexOf('\n', last);
  const to = nl < 0 ? value.length : nl;
  let lineAt = from;
  let delta = 0;
  let newStart = start;
  let newEnd = end;
  const out = value
    .slice(from, to)
    .split('\n')
    .map((line, i) => {
      const { cut, put } = fn(line, i);
      const map = (at: number) => {
        const rel = at - lineAt;
        return lineAt + delta + (rel >= cut ? rel - cut + put.length : Math.min(rel, put.length));
      };
      if (start >= lineAt && start <= lineAt + line.length) newStart = map(start);
      if (end >= lineAt && end <= lineAt + line.length) newEnd = map(end);
      delta += put.length - cut;
      lineAt += line.length + 1;
      return put + line.slice(cut);
    });
  if (end > to) newEnd = end + delta;
  return {
    value: value.slice(0, from) + out.join('\n') + value.slice(to),
    start: newStart,
    end: newEnd,
  };
}

/**
 * Turns the selected lines into a list of `kind`, or back into plain text when they all
 * already are one (like a note app's list buttons).
 */
export function toggleList(edit: TextEdit, kind: ListKind): TextEdit {
  let allKind = true;
  eachLine(edit, (line) => {
    allKind &&= splitLine(line).kind === kind;
    return { cut: 0, put: '' };
  });
  return eachLine(edit, (line, i) => {
    const { space, mark } = splitLine(line);
    return { cut: space.length + mark.length, put: space + (allKind ? '' : marker(kind, i + 1)) };
  });
}

/** Indents (+1) or outdents (−1) the selected lines by one level (2 spaces). */
export function indent(edit: TextEdit, step: 1 | -1): TextEdit {
  return eachLine(edit, (line) =>
    step > 0 ? { cut: 0, put: '  ' } : { cut: /^( {1,2}|\t)/.exec(line)?.[0].length ?? 0, put: '' },
  );
}

/**
 * Enter inside a list line: starts the next item (numbers count up, checklist lines start
 * unticked); Enter on an empty item ends the list. Null = not in a list, type a plain newline.
 */
export function continueList(edit: TextEdit): TextEdit | null {
  const { value, start, end } = edit;
  if (start !== end) return null;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', start);
  const line = value.slice(from, nl < 0 ? value.length : nl);
  const { space, mark, kind, n } = splitLine(line);
  if (!kind || start < from + space.length + mark.length) return null;
  if (!line.slice(space.length + mark.length).trim()) {
    // An empty item: drop its marker (end the list)
    const next = value.slice(0, from) + space + value.slice(from + line.length);
    return { value: next, start: from + space.length, end: from + space.length };
  }
  const insert = `\n${space}${marker(kind, (n ?? 0) + 1)}`;
  const at = start + insert.length;
  return { value: value.slice(0, start) + insert + value.slice(end), start: at, end: at };
}
