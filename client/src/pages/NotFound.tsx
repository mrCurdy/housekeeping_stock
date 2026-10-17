import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { buttonVariants, EmptyState } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <EmptyState
      className="py-24"
      icon={<Compass />}
      title={t.notFound.title}
      description={t.notFound.description}
      action={
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          {t.notFound.goHome}
        </Link>
      }
    />
  );
}
