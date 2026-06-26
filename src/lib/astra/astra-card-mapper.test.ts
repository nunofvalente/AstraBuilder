import { describe, expect, it } from 'vitest';

import type { AstraCardRecord } from './astra-card-types';
import { deriveCardNumber, mapAstraCardsToCardRows } from './astra-card-mapper';

describe('Astra card mapper', () => {
  it('derives numeric card numbers from card ids', () => {
    expect(deriveCardNumber('EOA-00123')).toBe(123);
    expect(deriveCardNumber(' no-digits ')).toBeNull();
    expect(deriveCardNumber('')).toBeNull();
  });

  it('maps Astra records into sorted card rows with normalized fields', () => {
    const records: AstraCardRecord[] = [
      {
        cardId: 'AST-002',
        cardName: 'Beta',
        cardAffinity: 'Terra',
        artistName: ' Artist ',
        rarity: 'Rare',
        cardType: 'Unit',
        cardSubTypes: ['Beast', ' Warrior '],
        statSupplyCost: 3,
        statAttack: -999,
        statHealth: 4,
        statInfluence: undefined,
        abilityText: ' Guard ',
        flavorText: '',
        cardImageUrl: '',
        cardImageLargeUrl: 'https://assets.echoesofastra.com/beta.webp',
        renowned: true,
      },
      {
        cardId: 'AST-001',
        cardName: 'Alpha',
        cardAffinity: '',
        artistName: null,
        rarity: null,
        cardType: 'Spell',
        cardSubTypes: [],
        statSupplyCost: Number.NaN,
        statAttack: 1,
        statHealth: null,
        statInfluence: 2,
        abilityText: '',
        flavorText: ' Flavor ',
        cardImageUrl: 'https://assets.echoesofastra.com/alpha_web.webp',
        cardImageLargeUrl: '',
        renowned: false,
      },
    ];

    expect(mapAstraCardsToCardRows(records)).toEqual([
      {
        id: 'AST-001',
        name: 'Alpha',
        affinity: null,
        artist: null,
        rarity: null,
        number: 1,
        type: 'Spell',
        subtype: null,
        cost: null,
        attack: 1,
        health: null,
        influence: 2,
        rules_text: null,
        description: 'Flavor',
        image_url: 'https://assets.echoesofastra.com/alpha_web.webp',
      },
      {
        id: 'AST-002',
        name: 'Beta',
        affinity: 'Terra',
        artist: 'Artist',
        rarity: 'Rare',
        number: 2,
        type: 'Renowned Unit',
        subtype: 'Beast Warrior',
        cost: 3,
        attack: null,
        health: 4,
        influence: null,
        rules_text: 'Guard',
        description: null,
        image_url: 'https://assets.echoesofastra.com/beta.webp',
      },
    ]);
  });
});
