'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import type { SettingsDictionary } from '@/i18n/get-dictionary';
import { useTheme } from '@/theme/theme-provider';

const LANGUAGE_LABELS: Record<Locale, Record<Locale, string>> = {
  en: {
    de: 'German',
    en: 'English',
    fr: 'French',
    ms: 'Malay',
  },
  fr: {
    de: 'Allemand',
    en: 'Anglais',
    fr: 'Français',
    ms: 'Malais',
  },
  de: {
    de: 'Deutsch',
    en: 'Englisch',
    fr: 'Französisch',
    ms: 'Malaiisch',
  },
  ms: {
    de: 'Jerman',
    en: 'Inggeris',
    fr: 'Perancis',
    ms: 'Melayu',
  },
};

type SettingsClientProps = {
  locale: Locale;
  dictionary: SettingsDictionary;
};

export function SettingsClient({ locale, dictionary }: SettingsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const buildLocaleHref = useCallback(
    (targetLocale: Locale) => {
      if (!pathname || pathname === '/') {
        return `/${targetLocale}`;
      }

      const segments = pathname.split('/').filter(Boolean);
      if (segments.length === 0) {
        return `/${targetLocale}`;
      }

      const [firstSegment, ...rest] = segments;
      if (SUPPORTED_LOCALES.includes(firstSegment as Locale)) {
        return `/${[targetLocale, ...rest].join('/')}`;
      }

      return `/${targetLocale}/${segments.join('/')}`;
    },
    [pathname],
  );

  function handleLocaleSelect(targetLocale: Locale) {
    if (targetLocale === locale) {
      return;
    }

    const href = buildLocaleHref(targetLocale);
    router.push(href);
  }

  function handleThemeSelect(nextTheme: 'light' | 'dark') {
    if (nextTheme === theme) {
      return;
    }

    setTheme(nextTheme);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-lg">
      <header className="space-y-2 text-[color:var(--text-primary)]">
        <h1 className="text-2xl font-semibold">{dictionary.heading}</h1>
        <p className="text-sm text-[color:var(--text-secondary)]">{dictionary.description}</p>
      </header>

      <section aria-labelledby="language-settings" className="flex flex-col gap-4">
        <div className="space-y-1">
          <h2 id="language-settings" className="text-lg font-semibold text-[color:var(--text-primary)]">
            {dictionary.language.title}
          </h2>
          <p className="text-sm text-[color:var(--text-secondary)]">
            {dictionary.language.description}
          </p>
        </div>
        <div className="flex max-w-xs flex-col gap-2">
          <label
            htmlFor="locale-select"
            className="text-sm font-medium text-[color:var(--text-primary)]"
          >
            {dictionary.language.title}
          </label>
          <select
            id="locale-select"
            name="locale"
            value={locale}
            onChange={(event) => handleLocaleSelect(event.target.value as Locale)}
            className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm text-[color:var(--text-primary)] transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {SUPPORTED_LOCALES.map((availableLocale) => {
              const label = LANGUAGE_LABELS[locale][availableLocale];
              return (
                <option key={availableLocale} value={availableLocale}>
                  {label}
                </option>
              );
            })}
          </select>
          <span className="text-xs text-[color:var(--text-secondary)]">
            {dictionary.language.active}: {LANGUAGE_LABELS[locale][locale]}
          </span>
        </div>
      </section>

      <section aria-labelledby="theme-settings" className="flex flex-col gap-4">
        <div className="space-y-1">
          <h2 id="theme-settings" className="text-lg font-semibold text-[color:var(--text-primary)]">
            {dictionary.theme.title}
          </h2>
          <p className="text-sm text-[color:var(--text-secondary)]">
            {dictionary.theme.description}
          </p>
        </div>
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-label={dictionary.theme.title}
        >
          {(['light', 'dark'] as const).map((option) => {
            const label = dictionary.theme.options[option];
            const isActive = theme === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleThemeSelect(option)}
                className={`flex h-full flex-col justify-between gap-4 rounded-xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                  isActive
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]'
                    : 'border-[color:var(--border)] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)] hover:text-[color:var(--text-primary)]'
                }`}
                role="radio"
                aria-checked={isActive}
              >
                <span className="text-base font-semibold capitalize">{label}</span>
                <span className="text-xs uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {option}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
