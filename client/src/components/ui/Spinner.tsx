import { cva, type VariantProps } from 'class-variance-authority';
import { useI18n } from '@/context/I18nContext';
import { cn } from '@/lib/cn';

const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-2 border-current border-r-transparent',
  {
    variants: { size: { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10 border-[3px]' } },
    defaultVariants: { size: 'md' },
  },
);

export function Spinner({
  size,
  className,
}: VariantProps<typeof spinnerVariants> & { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      role="status"
      aria-label={t.common.loading}
      className={cn(spinnerVariants({ size }), className)}
    />
  );
}
