import { describe, expect, it } from 'vitest';

import { createCardArtwork, normaliseCard, resolveAffinity, safeText, toNumber } from './utils';

describe('deck-builder utilities', () => {
  it('normalizes primitive card values', () => {
    expect(toNumber(3)).toBe(3);
    expect(toNumber(Number.NaN)).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(safeText(' value ')).toBe('value');
    expect(safeText(undefined)).toBe('');
    expect(resolveAffinity('terra')).toBe('Terra');
    expect(resolveAffinity('')).toBe('Neutral');
    expect(resolveAffinity('Custom')).toBe('Custom');
  });

  it('creates SVG data artwork from card names', () => {
    const artwork = createCardArtwork('Solar Mage', '#000000', '#ffffff');
    expect(artwork).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(decodeURIComponent(artwork)).toContain('SM');
    expect(decodeURIComponent(artwork)).toContain('Solar Mage');
  });

  it('normalizes database rows into searchable cards with fallback art', () => {
    const card = normaliseCard(
      {
        id: 'card-1',
        name: ' Alpha ',
        affinity: ' terra ',
        artist: ' Artist ',
        rarity: ' Common ',
        number: 7,
        type: ' Unit ',
        subtype: ' Mage ',
        cost: null,
        attack: 2,
        health: Number.NaN,
        influence: 1,
        rules_text: ' Draw ',
        description: ' Flavor ',
        image_url: '',
      },
      0,
    );

    expect(card).toMatchObject({
      id: 'card-1',
      name: 'Alpha',
      type: 'Unit',
      affinity: 'Terra',
      number: 7,
      cost: 0,
      attack: 2,
      health: 0,
      influence: 1,
      rulesText: 'Draw',
      description: 'Flavor',
    });
    expect(card.searchContent).toContain('alpha unit mage terra');
    expect(card.detailLabel).toBe('Alpha Unit ( Mage ) Cost 0 Affinity Terra Rarity  Common ');
    expect(card.imageSrc).toMatch(/^data:image\/svg\+xml;utf8,/);
  });
});
