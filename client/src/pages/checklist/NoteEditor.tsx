import {
  IndentDecrease,
  IndentIncrease,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
} from 'lucide-react';
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Button, Textarea } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { continueList, indent, toggleList, type TextEdit } from './noteText';

/**
 * The instructions field: a textarea with note-app list buttons (bullets, numbers, checklist,
 * indent / outdent). Enter continues a list, Enter on an empty item ends it, Tab / Shift+Tab
 * indent and outdent list lines.
 */
export function NoteEditor({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const tx = useI18n().t.checklist.manage.format;
  const ref = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<[number, number] | null>(null);

  // Puts the caret back after a button or key changed the text
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !selection.current) return;
    el.setSelectionRange(...selection.current);
    selection.current = null;
  }, [value]);

  const apply = (fn: (edit: TextEdit) => TextEdit | null) => {
    const el = ref.current;
    if (!el) return false;
    const next = fn({ value: el.value, start: el.selectionStart, end: el.selectionEnd });
    if (!next) return false;
    selection.current = [next.start, next.end];
    onChange(next.value);
    el.focus();
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey && apply(continueList)) e.preventDefault();
    if (e.key === 'Tab') {
      const el = e.currentTarget;
      const line = el.value.slice(el.value.lastIndexOf('\n', el.selectionStart - 1) + 1);
      // Only on list lines, so Tab still moves on from a plain text field
      if (/^\s*(?:[-*•]|\d+[.)])(?:\s|$)/.test(line) || el.selectionStart !== el.selectionEnd) {
        e.preventDefault();
        apply((edit) => indent(edit, e.shiftKey ? -1 : 1));
      }
    }
  };

  const tools: [LucideIcon, string, (edit: TextEdit) => TextEdit][] = [
    [List, tx.bullet, (edit) => toggleList(edit, 'bullet')],
    [ListOrdered, tx.number, (edit) => toggleList(edit, 'number')],
    [ListChecks, tx.check, (edit) => toggleList(edit, 'check')],
    [IndentDecrease, tx.outdent, (edit) => indent(edit, -1)],
    [IndentIncrease, tx.indent, (edit) => indent(edit, 1)],
  ];

  return (
    <div className="flex flex-col gap-1">
      <div role="toolbar" aria-label={tx.toolbar} className="flex gap-0.5">
        {tools.map(([Icon, name, fn]) => (
          <Button
            key={name}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={name}
            aria-label={name}
            className="text-fg-muted"
            // Keep the focus (and selection) in the text
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(fn)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={label}
        rows={4}
        className="min-h-24 text-sm"
      />
    </div>
  );
}
