import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale } from './config';
import { getDictionary } from './get-dictionary';

describe('i18n config', () => {
  it('identifies supported locales', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(SUPPORTED_LOCALES).toEqual(['en', 'fr', 'de', 'ms', 'zh-CN', 'ja']);
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('ja')).toBe(true);
    expect(isLocale('es')).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  it('loads Chinese and Japanese dictionaries', async () => {
    await expect(getDictionary('zh-CN')).resolves.toMatchObject({
      settings: { heading: '设置' },
      topBar: { builder: '构筑器' },
    });
    await expect(getDictionary('ja')).resolves.toMatchObject({
      settings: { heading: '設定' },
      topBar: { builder: 'ビルダー' },
    });
  });

  it('provides localized deck-builder metadata for every locale', async () => {
    const dictionaries = await Promise.all(SUPPORTED_LOCALES.map((locale) => getDictionary(locale)));

    for (const dictionary of dictionaries) {
      expect(dictionary.builder.metadataDescription.trim().length).toBeGreaterThan(40);
    }
  });
});
