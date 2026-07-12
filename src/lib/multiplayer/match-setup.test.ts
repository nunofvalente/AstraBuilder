import { describe, expect, it } from 'vitest';

import type { MatchDeckSnapshot } from './match-setup';
import { createPlayerSetup, placeMultiplayerStartingSupply, resolveMultiplayerOpeningHand } from './match-setup';

const deck = {
  id: 'deck-1', title: 'Deck', entries: [{ count: 7, card: { id: 'card-1' } }],
} as MatchDeckSnapshot;

describe('multiplayer setup', () => {
  it('deals six private cards and keeps the rest in deck order', () => {
    const setup = createPlayerSetup(deck);
    expect(setup.hand).toHaveLength(6);
    expect(setup.deck).toHaveLength(1);
    expect(new Set([...setup.hand, ...setup.deck].map((card) => card.instanceId)).size).toBe(7);
  });

  it('confirms an opening hand and places supply with a replacement draw', () => {
    const confirmed = resolveMultiplayerOpeningHand(createPlayerSetup(deck), false);
    const placed = placeMultiplayerStartingSupply(confirmed, confirmed.hand[0].instanceId);
    expect(placed?.supply).toHaveLength(1);
    expect(placed?.hand).toHaveLength(6);
    expect(placed?.deck).toHaveLength(0);
  });
});
