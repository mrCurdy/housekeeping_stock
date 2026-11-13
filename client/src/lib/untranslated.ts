import { useCallback } from 'react';
import { useRole } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

/**
 * For the admin only: the class and tooltip that mark a name with no version in the UI language
 * (`nameMissing` from `localizeNames`, shown from the base name). Spread the result on the element
 * that shows the name: `<span {...untranslated(item)}>`. Other roles (and translated names) get `{}`.
 * Merge with an own `className` via `cn(..., hint.className)`.
 */
export function useUntranslated() {
  const admin = useRole() === 'admin';
  const { t } = useI18n();
  const title = t.common.untranslated;
  return useCallback(
    (entity: { nameMissing?: boolean } | undefined): { className?: string; title?: string } =>
      admin && entity?.nameMissing ? { className: 'text-untranslated', title } : {},
    [admin, title],
  );
}
