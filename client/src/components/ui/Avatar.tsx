import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const avatarVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none',
  {
    variants: { size: { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' } },
    defaultVariants: { size: 'md' },
  },
);

// Deterministic color per name, so a user always gets the same avatar color.
const HUES = [15, 45, 140, 175, 210, 250, 285, 320];
const hueFor = (s: string) => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  src?: string;
  online?: boolean;
  className?: string;
}

export function Avatar({ name, src, size, online, className }: AvatarProps) {
  return (
    <span
      className={cn(avatarVariants({ size }), className)}
      style={{ backgroundColor: `oklch(0.6 0.15 ${hueFor(name)})` }}
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full rounded-full object-cover" />
      ) : (
        initials(name)
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface',
            online ? 'bg-success' : 'bg-fg-muted',
          )}
        />
      )}
    </span>
  );
}
