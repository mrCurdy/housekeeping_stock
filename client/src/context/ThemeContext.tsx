import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Colour schemes; the CSS for each is under `[data-palette]` in styles/index.css. */
export const PALETTES = ['violet', 'ocean', 'berry'] as const;
export type Palette = (typeof PALETTES)[number];

interface ThemeState {
  theme: ThemePreference;
  resolved: 'light' | 'dark';
  setTheme(t: ThemePreference): void;
  palette: Palette;
  setPalette(p: Palette): void;
}

const ThemeContext = createContext<ThemeState | null>(null);
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const readStored = (): ThemePreference => {
  try {
    const v = localStorage.getItem('theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

const readPalette = (): Palette => {
  try {
    const v = localStorage.getItem('palette');
    return PALETTES.find((p) => p === v) ?? 'violet';
  } catch {
    return 'violet';
  }
};

const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);
  const [palette, setPaletteState] = useState<Palette>(readPalette);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const mq = media();
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    // The default scheme is the plain :root tokens, so it needs no attribute.
    if (palette === 'violet') delete document.documentElement.dataset.palette;
    else document.documentElement.dataset.palette = palette;
  }, [palette]);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      resolved,
      setTheme: (t) => {
        setThemeState(t);
        store('theme', t);
      },
      palette,
      setPalette: (p) => {
        setPaletteState(p);
        store('palette', p);
      },
    }),
    [theme, resolved, palette],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
