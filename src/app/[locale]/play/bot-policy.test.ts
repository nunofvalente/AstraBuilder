import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { chooseBotTurnCommand } from './bot-policy';
import { applyBotTurnStep } from './game-bot';
import {
  buildInitialGameState,
  type GameCardInstance,
  type SavedDeck,
} from './game-rules';

function makeDeck(cardCount: number): SavedDeck {
  return {
    id: 'deck-1',
    title: 'Bot Policy Deck',
    cardCount,
    entries: Array.from({ length: cardCount }, (_, index) => ({
      card: createTestCard({ id: `card-${index}`, name: `Card ${index}` }),
      count: 1,
    })),
  };
}

function makeInstance(overrides: Partial<GameCardInstance> = {}): GameCardInstance {
  const card = overrides.card ?? createTestCard({ id: 'unit', name: 'Unit', type: 'Unit' });

  return {
    instanceId: overrides.instanceId ?? `opponent-${card.id}`,
    owner: overrides.owner ?? 'opponent',
    card,
    ready: overrides.ready ?? false,
    faceDown: overrides.faceDown ?? false,
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
  };
}

describe('bot policy', () => {
  it('returns a supply command without mutating state', () => {
    const handCard = makeInstance({ instanceId: 'bot-hand-card' });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [handCard],
        supply: [],
      },
    };

    const command = chooseBotTurnCommand(state, 'supply');

    expect(command).toEqual({
      type: 'card',
      action: {
        owner: 'opponent',
        instanceId: handCard.instanceId,
        fromZone: 'hand',
        toZone: 'supply',
      },
    });
    expect(state.opponentZones.hand).toEqual([handCard]);
    expect(state.opponentZones.supply).toEqual([]);
  });

  it('selects affordable equipment and its staging host', () => {
    const host = makeInstance({ instanceId: 'host', ready: true });
    const equipment = makeInstance({
      instanceId: 'equipment',
      card: createTestCard({ id: 'equipment', name: 'Equipment', type: 'Item Equipment', cost: 1 }),
    });
    const supply = makeInstance({ instanceId: 'supply', ready: true });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [equipment],
        staging: [host],
        supply: [supply],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toEqual({
      type: 'card',
      action: {
        owner: 'opponent',
        instanceId: equipment.instanceId,
        fromZone: 'hand',
        toZone: 'staging',
        options: {
          attachToInstanceId: host.instanceId,
        },
      },
    });
    expect(state.opponentZones.hand).toEqual([equipment]);
    expect(state.opponentZones.staging).toEqual([host]);
    expect(state.opponentZones.supply[0]?.ready).toBe(true);

    const executedState = applyBotTurnStep(state, 'stageUnit');
    expect(executedState.opponentZones.hand).toEqual([]);
    expect(executedState.opponentZones.staging).toEqual(
      expect.arrayContaining([
        host,
        expect.objectContaining({
          instanceId: equipment.instanceId,
          attachedToInstanceId: host.instanceId,
        }),
      ])
    );
    expect(executedState.opponentZones.supply[0]?.ready).toBe(false);
  });
});
