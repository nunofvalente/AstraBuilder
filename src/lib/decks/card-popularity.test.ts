import { describe, expect, it } from 'vitest';

import type { Card } from '@/app/[locale]/create/deck-builder/types';

import { rankCardsByPublicDeckUsage } from './card-popularity';

function makeCard(id: string, name: string): Card {
  return {
    id,
    name,
    type: 'Unit',
    affinity: 'Neutral',
    number: null,
    cost: 1,
    attack: 1,
    health: 1,
    subtype: '',
    rarity: '',
    artist: '',
    influence: null,
    rulesText: '',
    description: '',
    imageSrc: `/${id}.png`,
    searchContent: name,
    detailLabel: name,
  };
}

describe('rankCardsByPublicDeckUsage', () => {
  it('ranks by distinct public deck inclusion before total copies', () => {
    const alpha = makeCard('alpha', 'Alpha');
    const beta = makeCard('beta', 'Beta');
    const rankings = rankCardsByPublicDeckUsage(
      [
        { deckId: '1', cards: [{ cardId: alpha.id, quantity: 1 }, { cardId: beta.id, quantity: 3 }] },
        { deckId: '2', cards: [{ cardId: alpha.id, quantity: 1 }] },
      ],
      new Map([[alpha.id, alpha], [beta.id, beta]])
    );

    expect(rankings.map((entry) => entry.card.id)).toEqual(['alpha', 'beta']);
    expect(rankings[0]).toMatchObject({ deckCount: 2, copyCount: 2, usagePercentage: 100 });
    expect(rankings[1]).toMatchObject({ deckCount: 1, copyCount: 3, usagePercentage: 50 });
  });

  it('counts duplicate rows for a card as one deck inclusion', () => {
    const card = makeCard('alpha', 'Alpha');
    const [ranking] = rankCardsByPublicDeckUsage(
      [{ deckId: '1', cards: [{ cardId: card.id, quantity: 1 }, { cardId: card.id, quantity: 2 }] }],
      new Map([[card.id, card]])
    );

    expect(ranking).toMatchObject({ deckCount: 1, copyCount: 3, usagePercentage: 100 });
  });

  it('ignores missing cards and non-positive quantities', () => {
    const card = makeCard('alpha', 'Alpha');
    const rankings = rankCardsByPublicDeckUsage(
      [{ deckId: '1', cards: [{ cardId: card.id, quantity: 0 }, { cardId: 'missing', quantity: 3 }] }],
      new Map([[card.id, card]])
    );

    expect(rankings).toEqual([]);
  });
});
