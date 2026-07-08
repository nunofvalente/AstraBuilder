import { describe, expect, it } from 'vitest';

import { MIN_DECK_CARD_COUNT, isConstructedDeckSize } from './rules';

describe('deck rules', () => {
  it('requires at least 50 cards for simulator decks', () => {
    expect(MIN_DECK_CARD_COUNT).toBe(50);
    expect(isConstructedDeckSize(49)).toBe(false);
    expect(isConstructedDeckSize(50)).toBe(true);
    expect(isConstructedDeckSize(51)).toBe(true);
  });
});
