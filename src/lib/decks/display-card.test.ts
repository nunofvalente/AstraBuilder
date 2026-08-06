import { describe, expect, it } from 'vitest';

import { resolveDeckDisplayCardSelection } from './display-card';

describe('deck display card selection', () => {
  it('accepts a requested card that belongs to the deck', () => {
    expect(
      resolveDeckDisplayCardSelection({
        availableCardIds: ['card-1', 'card-2'],
        currentDisplayCardId: null,
        hasRequestedDisplayCard: true,
        requestedDisplayCardId: 'card-2',
      })
    ).toEqual({ displayCardId: 'card-2', invalidRequestedCard: false });
  });

  it('rejects a requested card outside the deck', () => {
    expect(
      resolveDeckDisplayCardSelection({
        availableCardIds: ['card-1'],
        currentDisplayCardId: null,
        hasRequestedDisplayCard: true,
        requestedDisplayCardId: 'card-2',
      })
    ).toEqual({ displayCardId: null, invalidRequestedCard: true });
  });

  it('clears a saved display card when the builder removes it', () => {
    expect(
      resolveDeckDisplayCardSelection({
        availableCardIds: ['card-1'],
        currentDisplayCardId: 'card-2',
        hasRequestedDisplayCard: false,
        requestedDisplayCardId: null,
      })
    ).toEqual({ displayCardId: null, invalidRequestedCard: false });
  });
});
