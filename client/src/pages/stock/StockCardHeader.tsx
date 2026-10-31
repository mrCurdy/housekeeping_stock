import type { ReactNode } from 'react';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui';

/** A Stock page card's title and description, with the admin's drag grip (`grip`) before them. */
export function StockCardHeader({
  title,
  description,
  grip,
}: {
  title: ReactNode;
  description: ReactNode;
  grip?: ReactNode;
}) {
  return (
    <CardHeader className="flex-row items-start gap-1">
      {grip}
      <div className="flex min-w-0 flex-col gap-1">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
    </CardHeader>
  );
}
