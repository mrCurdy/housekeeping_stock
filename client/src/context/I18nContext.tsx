import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Messages } from '@/i18n/en';
import { et } from '@/i18n/et';
import { ru } from '@/i18n/ru';

/** To add a language: add its dictionary in src/i18n and a row here. */
export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-GB', messages: en },
  { code: 'et', name: 'Eesti', locale: 'et-EE', messages: et },
  { code: 'ru', name: 'Русский', locale: 'ru-RU', messages: ru },
] as const satisfies readonly { code: string; name: string; locale: string; messages: Messages }[];

export type Lang = (typeof LANGUAGES)[number]['code'];

interface I18nState {
  lang: Lang;
  /** BCP 47 locale for Intl / toLocaleDateString */
  locale: string;
  /** The dictionary of the current language: `t.stock.items.title`, `t.data.notBackupFile(name)` */
  t: Messages;
  setLang(lang: Lang): void;
}

const byCode = (code: string | null | undefined) => LANGUAGES.find((l) => l.code === code);

/** Saved choice, else the first browser language we have, else English. Per device, like the theme. */
const initialLang = (): Lang => {
  try {
    const saved = byCode(localStorage.getItem('lang'));
    if (saved) return saved.code;
  } catch {
    /* storage unavailable */
  }
  for (const tag of navigator.languages ?? []) {
    const match = byCode(tag.slice(0, 2).toLowerCase());
    if (match) return match.code;
  }
  return 'en';
};

const state = (lang: Lang, setLang: (l: Lang) => void): I18nState => {
  const { locale, messages } = byCode(lang)!;
  return { lang, locale, t: messages, setLang };
};

// English without a provider, so the UI kit also renders in isolation (tests)
const I18nContext = createContext<I18nState>(state('en', () => {}));

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () =>
      state(lang, (l) => {
        setLangState(l);
        try {
          localStorage.setItem('lang', l);
        } catch {
          /* storage unavailable */
        }
      }),
    [lang],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

export const useI18n = () => use(I18nContext);
