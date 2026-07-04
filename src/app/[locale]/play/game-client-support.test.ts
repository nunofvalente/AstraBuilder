import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getPendingChoiceTargetCards } from './game-client-support';
import {
  buildInitialGameState,
  type GameCardInstance,
  type PendingChoice,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'support-test', title: 'Support Test', cardCount: 0, entries: [] };
}

function makeInstance(id: string): GameCardInstance {
  return {
    instanceId: id,
    owner: 'player',
    card: createTestCard({ id, name: id }),
    ready: false,
    faceDown: true,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
  };
}

describe('game client support', () => {
  it('includes supply cards for Wingshield Transport target choices', () => {
    const supplyCard = makeInstance('supply-choice');
    const state = {
      ...buildInitialGameState(makeDeck(), makeDeck()),
      zones: {
        ...buildInitialGameState(makeDeck(), makeDeck()).zones,
        supply: [supplyCard],
      },
    };
    const pendingChoice: PendingChoice = {
      kind: 'caelumTarget',
      owner: 'player',
      sourceInstanceId: 'transport',
      sourceName: 'Wingshield Transport',
      prompt: 'Choose a supply card to reveal and return to your hand.',
      effect: 'wingshieldSupply',
      availableInstanceIds: [supplyCard.instanceId],
      optional: true,
    };

    expect(getPendingChoiceTargetCards(state, pendingChoice)).toEqual([supplyCard]);
  });
});
