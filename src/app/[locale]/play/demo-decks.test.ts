import { describe, expect, it } from 'vitest';

import cardsData from '@/data/cards.json';
import type { Card } from '../create/deck-builder/types';
import { buildDemoDecks } from './demo-decks';

describe('demo simulator decks', () => {
  it('builds bundled starter decks from the fallback card catalogue', () => {
    const cards = (cardsData as { cards: Card[] }).cards;
    const decks = buildDemoDecks(new Map(cards.map((card) => [card.id, card])));

    expect(decks.map((deck) => deck.title)).toEqual([
      'Starter Deck - Blood Pact',
      'Starter Deck - Unity',
      'Starter Deck - Righteous Order',
    ]);
    expect(decks.map((deck) => deck.cardCount)).toEqual([50, 50, 50]);
    expect(decks.every((deck) => deck.entries.length > 0)).toBe(true);
  });
});
