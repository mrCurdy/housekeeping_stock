import { itemCheckKey } from '@app/shared';
import { cn } from '@/lib/cn';
import { parseNote } from './noteText';

/**
 * A task's instructions as shown on the list: plain lines as typed, bullets, numbers, and
 * checklist lines that are ticked per day like the tasks.
 */
export function TaskNote({
  id,
  taskId,
  text,
  ticks,
  onTick,
  className,
}: {
  id?: string;
  taskId: string;
  text: string;
  /** The day's ticks (`checks[date]`) */
  ticks: Record<string, string>;
  /** Without it the checklist lines are read-only */
  onTick?: (item: string, done: boolean) => void;
  className?: string;
}) {
  const lines = parseNote(text.replace(/\s+$/, ''));
  return (
    <div id={id} className={cn('flex flex-col text-sm leading-relaxed text-fg-muted', className)}>
      {lines.map((line, i) => {
        if (line.kind === 'text') {
          return line.text.trim() ? (
            <p key={i} className="whitespace-pre-wrap">
              {line.text}
            </p>
          ) : (
            <div key={i} className="h-3" />
          );
        }
        const pad = { paddingLeft: `${line.depth * 1.5}rem` };
        if (line.kind === 'check') {
          const done = !!ticks[itemCheckKey(taskId, line.key!)];
          return (
            <label
              key={i}
              style={pad}
              className={cn('flex min-h-9 items-start gap-2.5 py-1', onTick && 'cursor-pointer')}
            >
              <input
                type="checkbox"
                checked={done}
                disabled={!onTick}
                onChange={(e) => onTick?.(line.key!, e.target.checked)}
                className="focus-ring mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-border accent-primary"
              />
              <span className={cn('text-fg', done && 'text-fg-muted line-through')}>
                {line.text}
              </span>
            </label>
          );
        }
        return (
          <div key={i} style={pad} className="flex gap-2 py-0.5">
            <span className="w-5 shrink-0 text-right tabular-nums" aria-hidden>
              {line.kind === 'number' ? `${line.n}.` : '•'}
            </span>
            <span className="whitespace-pre-wrap">{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}
