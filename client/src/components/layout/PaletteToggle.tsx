import { Palette } from 'lucide-react';
import { Button, Tooltip } from '@/components/ui';
import { useI18n } from '@/context/I18nContext';
import { PALETTES, useTheme } from '@/context/ThemeContext';

export function PaletteToggle() {
  const { palette, setPalette } = useTheme();
  const { t } = useI18n();
  const next = PALETTES[(PALETTES.indexOf(palette) + 1) % PALETTES.length]!;
  return (
    <Tooltip content={t.palette.current(t.palette.names[palette])} side="bottom" align="end">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.palette.switchTo(t.palette.names[next])}
        onClick={() => setPalette(next)}
      >
        <Palette className="h-4 w-4 text-primary" />
      </Button>
    </Tooltip>
  );
}
