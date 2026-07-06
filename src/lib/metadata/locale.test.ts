import { describe, expect, it } from 'vitest';

import { buildCanonicalMetadata, buildLanguageAlternates, buildLocalePath } from './locale';

describe('locale metadata helpers', () => {
  it('builds locale paths while trimming and encoding segments', () => {
    expect(buildLocalePath('en')).toBe('/en');
    expect(buildLocalePath('fr', '/decks/', 'my deck')).toBe('/fr/decks/my%20deck');
    expect(buildLocalePath('de', '', ' cards ')).toBe('/de/cards');
  });

  it('builds language alternates and canonical metadata', () => {
    expect(buildLanguageAlternates(['decks', 42])).toEqual({
      en: '/en/decks/42',
      fr: '/fr/decks/42',
      de: '/de/decks/42',
      ms: '/ms/decks/42',
      'zh-CN': '/zh-CN/decks/42',
      ja: '/ja/decks/42',
      'x-default': '/en/decks/42',
    });

    expect(buildCanonicalMetadata('ms', ['collection'])).toEqual({
      alternates: {
        canonical: '/ms/collection',
        languages: {
          en: '/en/collection',
          fr: '/fr/collection',
          de: '/de/collection',
          ms: '/ms/collection',
          'zh-CN': '/zh-CN/collection',
          ja: '/ja/collection',
          'x-default': '/en/collection',
        },
      },
    });
  });
});
