import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { I18nProvider, LANGUAGES, useI18n } from '@/context/I18nContext';
import { en } from './en';
import { ru } from './ru';

/** Every leaf path of a dictionary, with its value. */
function leaves(obj: object, prefix = ''): [string, unknown][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? leaves(v as object, `${prefix}${k}.`)
      : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

describe('i18n', () => {
  it.each(LANGUAGES.map((l) => [l.code, l.messages] as const))(
    '%s has every key of en, with no empty text',
    (_code, messages) => {
      const source = new Map(leaves(en));
      expect(leaves(messages).map(([k]) => k)).toEqual([...source.keys()]);
      for (const [key, value] of leaves(messages)) {
        if (typeof value === 'string') expect(value.trim(), key).not.toBe('');
        if (Array.isArray(value)) expect(value, key).toHaveLength((source.get(key) as []).length);
      }
    },
  );

  it('uses Russian plural forms', () => {
    expect(ru.data.restoreDescription('f', 1, 3, 5)).toContain('1 позиция, 3 группы и 5 помещений');
    expect(ru.data.restoreDescription('f', 21, 12, 2)).toContain(
      '21 позиция, 12 групп и 2 помещения',
    );
  });

  it('switches language and remembers it', async () => {
    function Title() {
      return <h1>{useI18n().t.nav.counter}</h1>;
    }
    render(
      <I18nProvider>
        <LanguageSwitcher />
        <Title />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: en.language }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Русский' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Инвентаризация');
    expect(document.documentElement.lang).toBe('ru');
    expect(localStorage.getItem('lang')).toBe('ru');
  });
});
