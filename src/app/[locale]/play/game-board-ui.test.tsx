// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { CombinedStagingSupplyPanel } from './game-board-ui';
import type { GameCardInstance } from './game-rules';

function makeInstance(): GameCardInstance {
  return {
    instanceId: 'graveyard-card',
    owner: 'player',
    card: createTestCard({ name: 'Graveyard Subject' }),
    ready: false,
    faceDown: false,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
  };
}

describe('CombinedStagingSupplyPanel', () => {
  it('zooms graveyard cards on hover above the graveyard dialog', () => {
    const graveyardCard = makeInstance();
    const { container } = render(
      <CombinedStagingSupplyPanel
        stagingCards={[]}
        supplyCards={[]}
        graveyardCards={[graveyardCard]}
        banishCards={[]}
        deckCards={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /graveyard/i }));
    fireEvent.mouseEnter(screen.getByTitle(graveyardCard.card.name).closest('article')!);

    expect(container.querySelector('[data-card-zoom-preview]')).toHaveClass('z-[100]');
  });
});
