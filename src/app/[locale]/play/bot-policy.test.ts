import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { chooseBotTurnCommand, getBotBattlefieldAttackChoice } from './bot-policy';
import { applyBotTurnStep, runBotTurn } from './game-bot';
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
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
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

  it('supplies the least valuable non-playable card instead of a strong playable unit', () => {
    const playableUnit = makeInstance({
      instanceId: 'playable-unit',
      card: createTestCard({ id: 'strong-unit', name: 'Strong Unit', type: 'Unit', cost: 2, attack: 4, health: 4 }),
    });
    const filler = makeInstance({
      instanceId: 'filler',
      card: createTestCard({ id: 'filler', name: 'Filler', type: 'Tactic', cost: 0, rulesText: 'Draw a card.' }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [playableUnit, filler],
        supply: [makeInstance({ instanceId: 'supply-1', ready: true }), makeInstance({ instanceId: 'supply-2', ready: true })],
      },
    };

    expect(chooseBotTurnCommand(state, 'supply')).toMatchObject({
      type: 'card',
      action: {
        instanceId: filler.instanceId,
        toZone: 'supply',
      },
    });
  });

  it('plays the highest value affordable unit first', () => {
    const smallUnit = makeInstance({
      instanceId: 'small-unit',
      card: createTestCard({ id: 'small-unit', name: 'Small Unit', type: 'Unit', cost: 1, attack: 1, health: 1 }),
    });
    const largeUnit = makeInstance({
      instanceId: 'large-unit',
      card: createTestCard({ id: 'large-unit', name: 'Large Unit', type: 'Unit', cost: 2, attack: 4, health: 4 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [smallUnit, largeUnit],
        supply: [makeInstance({ instanceId: 'supply-1', ready: true }), makeInstance({ instanceId: 'supply-2', ready: true })],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toMatchObject({
      type: 'card',
      action: {
        instanceId: largeUnit.instanceId,
        toZone: 'staging',
      },
    });
  });

  it('chooses a sacrifice target when playing Demonic Berserker', () => {
    const berserker = makeInstance({
      instanceId: 'berserker',
      card: createTestCard({
        id: 'IMP004',
        name: 'Demonic Berserker',
        type: 'Unit',
        cost: 3,
        attack: 4,
        health: 5,
        rulesText: 'As an additional cost to play this unit, sacrifice a unit.',
      }),
    });
    const fodder = makeInstance({
      instanceId: 'fodder',
      card: createTestCard({ id: 'fodder', name: 'Fodder', type: 'Unit', cost: 1, attack: 1, health: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [berserker],
        staging: [fodder],
        supply: [
          makeInstance({ instanceId: 'supply-1', ready: true }),
          makeInstance({ instanceId: 'supply-2', ready: true }),
          makeInstance({ instanceId: 'supply-3', ready: true }),
        ],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toMatchObject({
      type: 'card',
      action: {
        instanceId: berserker.instanceId,
        options: {
          sacrificeUnitInstanceId: fodder.instanceId,
        },
      },
    });

    const executedState = applyBotTurnStep(state, 'stageUnit');
    expect(executedState.opponentZones.staging).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: berserker.instanceId })])
    );
    expect(executedState.opponentZones.graveyard).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: fodder.instanceId })])
    );
  });

  it('chooses a favorable battlefield attack over an empty zone', () => {
    const weakAttacker = makeInstance({
      instanceId: 'weak-attacker',
      ready: true,
      card: createTestCard({ id: 'weak-attacker', name: 'Weak Attacker', type: 'Unit', attack: 1, health: 1 }),
    });
    const strongAttacker = makeInstance({
      instanceId: 'strong-attacker',
      ready: true,
      card: createTestCard({ id: 'strong-attacker', name: 'Strong Attacker', type: 'Unit', attack: 4, health: 4 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 3 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [weakAttacker, strongAttacker],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [defender],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toEqual({
      attackerInstanceId: strongAttacker.instanceId,
      targetZone: 'battlefieldLeft',
    });
  });

  it('can use Demonic Advance and then deploy a unit into an empty combat zone', () => {
    const demonicAdvance = makeInstance({
      instanceId: 'demonic-advance',
      card: createTestCard({
        id: 'IMP021',
        name: 'Demonic Advance',
        type: 'Tactic',
        cost: 1,
        rulesText: 'The next unit you play this turn can be played directly into an unoccupied combat zone. If you do, it enters ready.',
      }),
    });
    const attacker = makeInstance({
      instanceId: 'attacker',
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', cost: 2, attack: 3, health: 3 }),
    });
    const filler = makeInstance({
      instanceId: 'filler',
      card: createTestCard({ id: 'filler', name: 'Filler', type: 'Tactic', cost: 0 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [demonicAdvance, attacker, filler],
        supply: [
          makeInstance({ instanceId: 'supply-1', ready: true }),
          makeInstance({ instanceId: 'supply-2', ready: true }),
          makeInstance({ instanceId: 'supply-3', ready: true }),
        ],
      },
    };

    const executedState = runBotTurn(state);

    expect(executedState.opponentZones.graveyard).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: demonicAdvance.instanceId })])
    );
    expect(executedState.zones.battlefieldLeft).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: attacker.instanceId, owner: 'opponent', ready: true })])
    );
  });
});
