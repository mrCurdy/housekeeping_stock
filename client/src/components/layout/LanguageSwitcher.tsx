import { Check, Languages } from 'lucide-react';
import { Button, Dropdown } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/context/I18nContext';

/** Header menu: English / Eesti / Русский. The choice is remembered on this device. */
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <Dropdown
      trigger={(props) => (
        <Button
          {...props}
          variant="ghost"
          size="sm"
          aria-label={t.language}
          title={t.language}
          leftIcon={<Languages className="h-4 w-4" />}
        >
          {lang.toUpperCase()}
        </Button>
      )}
      items={LANGUAGES.map((l) => ({
        label: <span className="flex-1">{l.name}</span>,
        icon: <Check className={l.code === lang ? '' : 'invisible'} />,
        onSelect: () => setLang(l.code),
      }))}
    />
  );
}
