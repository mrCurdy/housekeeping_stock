import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemePreference;
  resolved: 'light' | 'dark';
  setTheme(t: ThemePreference): void;
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);
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

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      resolved,
      setTheme: (t) => {
        setThemeState(t);
        try {
          localStorage.setItem('theme', t);
        } catch {
          /* storage unavailable */
        }
      },
    }),
    [theme, resolved],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
