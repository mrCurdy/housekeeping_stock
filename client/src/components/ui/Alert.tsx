import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const alertVariants = cva('flex gap-3 rounded-md border px-4 py-3 text-sm', {
  variants: {
    tone: {
      info: 'border-info/30 bg-info-soft text-fg [&_svg]:text-info',
      success: 'border-success/30 bg-success-soft text-fg [&_svg]:text-success',
      warning: 'border-warning/40 bg-warning-soft text-fg [&_svg]:text-warning',
      danger: 'border-danger/30 bg-danger-soft text-fg [&_svg]:text-danger',
    },
  },
  defaultVariants: { tone: 'info' },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export interface AlertProps extends VariantProps<typeof alertVariants> {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const Icon = icons[tone ?? 'info'];
  return (
    <div role="alert" className={cn(alertVariants({ tone }), className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-fg-muted">{children}</div>}
      </div>
    </div>
  );
}
