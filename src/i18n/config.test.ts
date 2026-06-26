import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale } from './config';

describe('i18n config', () => {
  it('identifies supported locales', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(SUPPORTED_LOCALES).toEqual(['en', 'fr', 'de', 'ms']);
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('es')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});
