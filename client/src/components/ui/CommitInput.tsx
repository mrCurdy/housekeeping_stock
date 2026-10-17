import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from './Input';
import { Textarea } from './Textarea';

type Value = string | number | null | undefined;

/**
 * Edit freely, save once: `commit()` (and unmounting) calls onCommit with the draft if it changed.
 * While not editing, the field follows `value`, so remote changes show up.
 */
function useCommit(value: Value, onCommit: (text: string) => void) {
  const shown = value == null ? '' : String(value);
  const [draft, setDraft] = useState<string | null>(null);

  // Latest values for the unmount flush
  const latest = useRef({ draft, shown, onCommit });
  useEffect(() => {
    latest.current = { draft, shown, onCommit };
  });
  useEffect(
    () => () => {
      const { draft, shown, onCommit } = latest.current;
      if (draft !== null && draft !== shown) onCommit(draft);
    },
    [],
  );

  return {
    text: draft ?? shown,
    setDraft,
    commit: () => {
      if (draft !== null && draft !== shown) onCommit(draft);
      setDraft(null);
    },
  };
}

export interface CommitInputProps extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: Value;
  /** Called with the typed text on blur / Enter (and on unmount), only if it changed. */
  onCommit: (text: string) => void;
}

/**
 * An input that edits freely and saves once: on blur, Enter, or when it unmounts (e.g. a page change).
 * Escape restores the saved value. While not focused it follows `value`, so remote changes show up.
 */
export function CommitInput({ value, onCommit, onBlur, onKeyDown, ...props }: CommitInputProps) {
  const { text, setDraft, commit } = useCommit(value, onCommit);
  return (
    <Input
      {...props}
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
        onKeyDown?.(e);
      }}
    />
  );
}

export interface CommitTextareaProps extends Omit<
  ComponentProps<typeof Textarea>,
  'value' | 'onChange'
> {
  value: Value;
  /** Called with the typed text on blur (and on unmount), only if it changed. */
  onCommit: (text: string) => void;
}

/** CommitInput for multi-line text: Enter adds a line, it saves on blur. Escape reverts. */
export function CommitTextarea({
  value,
  onCommit,
  onBlur,
  onKeyDown,
  ...props
}: CommitTextareaProps) {
  const { text, setDraft, commit } = useCommit(value, onCommit);
  return (
    <Textarea
      {...props}
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDraft(null);
        onKeyDown?.(e);
      }}
    />
  );
}
