import { Monitor, Moon, Sun } from 'lucide-react';
import { Button, Tooltip } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { useTheme, type ThemePreference } from '@/context/ThemeContext';

const order: ThemePreference[] = ['light', 'dark', 'system'];
const icons = { light: Sun, dark: Moon, system: Monitor };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const Icon = icons[theme];
  const next = order[(order.indexOf(theme) + 1) % order.length]!;
  return (
    <Tooltip content={t.theme.current(t.theme.names[theme])} side="bottom" align="end">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.theme.switchTo(t.theme.names[next])}
        onClick={() => setTheme(next)}
      >
        <Icon className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}
