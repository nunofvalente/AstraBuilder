import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  createUnimplementedAbilityMessage,
  getImplementedAbilitiesForTrigger,
  getPrintedAbilityTriggers,
  getRegisteredCardAbilities,
} from './card-abilities';
import {
  activateCardAbility,
  buildInitialGameState,
  triggerCardAbilities,
  type GameCardInstance,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return {
    id: 'ability-test-deck',
    title: 'Ability Test Deck',
    cardCount: 0,
    entries: [],
  };
}

function makeInstance(
  instanceId: string,
  card = createTestCard({ id: instanceId, name: instanceId, type: 'Unit' }),
  overrides: Partial<GameCardInstance> = {}
): GameCardInstance {
  return {
    instanceId,
    owner: 'player',
    card,
    ready: false,
    faceDown: false,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
    discardCardOnDeathThisTurnCount: 0,
    ...overrides,
  };
}

describe('card abilities', () => {
  it('detects printed ability triggers from rules text', () => {
    const card = createTestCard({
      name: 'Triggered Unit',
      rulesText: 'On Enter: Draw a card.\n\nOn Death: Create a token.\n\n{Exhaust}: Target friendly unit gets +1 influence.',
    });

    expect(getPrintedAbilityTriggers(card)).toEqual(['onEnter', 'onDeath', 'activated']);
  });

  it('returns no registered abilities until a card implementation is added', () => {
    expect(getRegisteredCardAbilities('missing-card')).toBeNull();
    expect(getImplementedAbilitiesForTrigger('missing-card', 'onPlay')).toEqual([]);
  });

  it('registers implemented card abilities by stable card id', () => {
    expect(getRegisteredCardAbilities('IMP001')).toMatchObject({
      cardId: 'IMP001',
      abilities: [
        {
          id: 'IMP001-sacrifice-unit-ready-self',
          trigger: 'activated',
          timing: 'activated',
          text: 'Sacrifice another unit: Ready this unit.',
          targets: [{ type: 'unit', scope: 'friendly', count: 1 }],
        },
      ],
    });
    expect(getImplementedAbilitiesForTrigger('IMP001', 'activated')).toHaveLength(1);

    expect(getRegisteredCardAbilities('IMP065')).toMatchObject({
      cardId: 'IMP065',
      abilities: [
        {
          id: 'IMP065-draw-card',
          trigger: 'onDeath',
          timing: 'automatic',
        },
      ],
    });
    expect(getImplementedAbilitiesForTrigger('IMP065', 'onDeath')).toHaveLength(1);

    expect(getRegisteredCardAbilities('IMP010')).toMatchObject({
      cardId: 'IMP010',
      abilities: [
        {
          id: 'IMP010-on-enter-create-experiment',
          trigger: 'onEnter',
          timing: 'automatic',
        },
        {
          id: 'IMP010-on-score-sacrifice-staging-units',
          trigger: 'onScore',
          timing: 'optional',
        },
      ],
    });
    expect(getRegisteredCardAbilities('IMP011')).toMatchObject({
      cardId: 'IMP011',
      abilities: [expect.objectContaining({ trigger: 'onPlay' })],
    });
    expect(getRegisteredCardAbilities('IMP012')).toMatchObject({
      cardId: 'IMP012',
      abilities: [expect.objectContaining({ trigger: 'onEnter' })],
    });
    expect(getRegisteredCardAbilities('IMP013')).toEqual({
      cardId: 'IMP013',
      abilities: [],
    });
    expect(getRegisteredCardAbilities('IMP014')).toMatchObject({
      cardId: 'IMP014',
      abilities: [
        {
          id: 'IMP014-on-enter-create-experiment',
          trigger: 'onEnter',
          timing: 'automatic',
        },
      ],
    });
  });

  it('implements IMP001 by sacrificing another friendly unit and readying itself', () => {
    const abomination = makeInstance(
      'abomination',
      createTestCard({
        id: 'IMP001',
        name: 'Assimilating Abomination',
        type: 'Unit',
        rulesText: 'Sacrifice another unit: Ready this unit.',
      })
    );
    const sacrifice = makeInstance('sacrifice', createTestCard({ id: 'unit-2', name: 'Test Subject', type: 'Unit' }), {
      ready: true,
      damage: 1,
    });
    const equipment = makeInstance(
      'equipment',
      createTestCard({ id: 'item-1', name: 'Attached Item', type: 'Item Equipment' }),
      { attachedToInstanceId: sacrifice.instanceId }
    );
    const state = {
      ...buildInitialGameState(makeDeck(), null),
      zones: {
        ...buildInitialGameState(makeDeck(), null).zones,
        staging: [abomination, sacrifice, equipment],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(state, 'activated', {
      source: abomination,
      zone: 'staging',
      targets: [{ type: 'card', instanceId: sacrifice.instanceId }],
    });

    expect(nextState.zones.staging).toEqual([{ ...abomination, ready: true }]);
    expect(nextState.zones.graveyard).toEqual([
      { ...sacrifice, faceDown: false, attachedToInstanceId: null, damage: 0 },
      { ...equipment, faceDown: false, attachedToInstanceId: null, damage: 0 },
    ]);
    expect(nextState.log[0]?.suffix).toBe('Assimilating Abomination sacrificed Test Subject and readied.');
  });

  it('does not let IMP001 sacrifice itself or an enemy unit', () => {
    const abomination = makeInstance(
      'abomination',
      createTestCard({
        id: 'IMP001',
        name: 'Assimilating Abomination',
        type: 'Unit',
        rulesText: 'Sacrifice another unit: Ready this unit.',
      })
    );
    const enemy = makeInstance('enemy', createTestCard({ id: 'enemy', name: 'Enemy Unit', type: 'Unit' }), {
      owner: 'opponent',
      ready: true,
    });
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [abomination],
        battlefieldLeft: [enemy],
      },
      log: [],
    };

    const selfResult = triggerCardAbilities(state, 'activated', {
      source: abomination,
      zone: 'staging',
      targets: [{ type: 'card', instanceId: abomination.instanceId }],
    });
    const enemyResult = triggerCardAbilities(state, 'activated', {
      source: abomination,
      zone: 'staging',
      targets: [{ type: 'card', instanceId: enemy.instanceId }],
    });

    expect(selfResult).toEqual(state);
    expect(enemyResult).toEqual(state);
  });

  it('fires On Death abilities for the unit sacrificed to IMP001', () => {
    const abomination = makeInstance(
      'abomination',
      createTestCard({
        id: 'IMP001',
        name: 'Assimilating Abomination',
        type: 'Unit',
        rulesText: 'Sacrifice another unit: Ready this unit.',
      })
    );
    const courier = makeInstance(
      'courier',
      createTestCard({ id: 'IMP065', name: 'Courier Drone', type: 'Unit', rulesText: 'On Death: Draw a card.' })
    );
    const drawnCard = makeInstance('drawn-card');
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        deck: [drawnCard],
        hand: [],
        staging: [abomination, courier],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(state, 'activated', {
      source: abomination,
      zone: 'staging',
      targets: [{ type: 'card', instanceId: courier.instanceId }],
    });

    expect(nextState.zones.hand).toEqual([drawnCard]);
    expect(nextState.zones.deck).toEqual([]);
    expect(nextState.log.map((entry) => entry.suffix)).toEqual([
      'Courier Drone drew 1 card.',
      'Assimilating Abomination sacrificed Courier Drone and readied.',
    ]);
  });

  it('activates IMP001 through the player action entry point during the main turn', () => {
    const abomination = makeInstance(
      'abomination',
      createTestCard({
        id: 'IMP001',
        name: 'Assimilating Abomination',
        type: 'Unit',
        rulesText: 'Sacrifice another unit: Ready this unit.',
      })
    );
    const sacrifice = makeInstance('sacrifice', createTestCard({ id: 'unit-2', name: 'Test Subject', type: 'Unit' }));
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...baseState.zones,
        staging: [abomination, sacrifice],
      },
      log: [],
    };

    const result = activateCardAbility(state, 'player', abomination.instanceId, sacrifice.instanceId);

    expect(result).not.toHaveProperty('error');
    if ('state' in result) {
      expect(result.state.zones.staging).toEqual([{ ...abomination, ready: true }]);
      expect(result.state.zones.graveyard[0]?.instanceId).toBe(sacrifice.instanceId);
    }
  });

  it('implements IMP002 by creating an Experiment token on death', () => {
    const cadaverSupplier = makeInstance(
      'cadaver-supplier',
      createTestCard({
        id: 'IMP002',
        name: 'Cadaver Supplier',
        type: 'Unit',
        attack: 3,
        health: 2,
        influence: 1,
        rulesText: 'On Death: Create a 2/2 Experiment unit token with 0 influence.',
      })
    );
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        graveyard: [cadaverSupplier],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(state, 'onDeath', {
      source: cadaverSupplier,
      controller: 'player',
      zone: 'graveyard',
    });

    expect(nextState.zones.staging[0]).toMatchObject({
      owner: 'player',
      card: expect.objectContaining({ id: 'IMP000', name: 'Experiment', attack: 2, health: 2, influence: 0 }),
      ready: false,
    });
    expect(nextState.log[0]?.suffix).toBe('Cadaver Supplier created Experiment in staging.');
  });

  it('implements IMP010 by creating an Experiment token on enter', () => {
    const lucille = makeInstance(
      'lucille',
      createTestCard({
        id: 'IMP010',
        name: 'Lucille, Blood Baroness',
        type: 'Renowned Unit Vampire',
        attack: 5,
        health: 4,
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.\n\nOn Score: You may sacrifice any number of units in your staging area to gain that many victory points.',
      }),
      { ready: true }
    );
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        battlefieldLeft: [lucille],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(state, 'onEnter', {
      source: lucille,
      controller: 'player',
      zone: 'battlefieldLeft',
    });

    expect(nextState.zones.staging[0]).toMatchObject({
      owner: 'player',
      card: expect.objectContaining({ id: 'IMP000', name: 'Experiment' }),
      ready: false,
    });
  });

  it('implements IMP010 on score by creating a pending choice for the player', () => {
    const lucille = makeInstance(
      'lucille',
      createTestCard({
        id: 'IMP010',
        name: 'Lucille, Blood Baroness',
        type: 'Renowned Unit Vampire',
        attack: 5,
        health: 4,
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.\n\nOn Score: You may sacrifice any number of units in your staging area to gain that many victory points.',
      }),
      { ready: true }
    );
    const unitOne = makeInstance('unit-one', createTestCard({ id: 'u1', name: 'Unit One', type: 'Unit' }), { ready: true });
    const unitTwo = makeInstance('unit-two', createTestCard({ id: 'u2', name: 'Unit Two', type: 'Unit' }), { ready: true });
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      playerVictoryPoints: 2,
      zones: {
        ...baseState.zones,
        battlefieldLeft: [lucille],
        staging: [unitOne, unitTwo],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(state, 'onScore', {
      source: lucille,
      controller: 'player',
      zone: 'battlefieldLeft',
    });

    expect(nextState.playerVictoryPoints).toBe(2);
    expect(nextState.zones.staging.map((instance) => instance.instanceId)).toEqual([unitOne.instanceId, unitTwo.instanceId]);
    expect(nextState.pendingChoice).toMatchObject({
      kind: 'lucilleScore',
      owner: 'player',
      sourceInstanceId: lucille.instanceId,
      availableUnitInstanceIds: [unitOne.instanceId, unitTwo.instanceId],
    });
  });

  it('implements IMP011 on play by creating a pending sacrifice choice for the player', () => {
    const nerezza = makeInstance(
      'nerezza',
      createTestCard({
        id: 'IMP011',
        name: 'Nerezza, Umbrasco Scion',
        type: 'Renowned Unit Vampire',
        rulesText: 'On Play: You may sacrifice another unit. If you do, take control of target enemy unit in a combat zone and move it into your staging area exhausted.',
      }),
      { ready: false }
    );
    const ally = makeInstance('ally', createTestCard({ id: 'ally', name: 'Ally', type: 'Unit' }), { ready: true });
    const enemy = makeInstance('enemy', createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit' }), {
      owner: 'opponent',
      ready: true,
    });
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [nerezza, ally],
        battlefieldLeft: [enemy],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(state, 'onPlay', {
      source: nerezza,
      controller: 'player',
      zone: 'staging',
    });

    expect(nextState.pendingChoice).toMatchObject({
      kind: 'nerezzaSacrifice',
      sourceInstanceId: nerezza.instanceId,
      availableUnitInstanceIds: [ally.instanceId],
    });
  });

  it('implements IMP012 on enter by creating a pending mark choice for the player', () => {
    const agent = makeInstance(
      'agent',
      createTestCard({
        id: 'IMP012',
        name: 'Nocturne Agent',
        type: 'Unit Human',
        rulesText: 'On Enter: If target enemy unit dies this turn, its controller discards a card.',
      }),
      { ready: false }
    );
    const enemy = makeInstance('enemy', createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit' }), {
      owner: 'opponent',
      ready: true,
    });
    const baseState = buildInitialGameState(makeDeck(), null);
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [agent],
        battlefieldLeft: [enemy],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(state, 'onEnter', {
      source: agent,
      controller: 'player',
      zone: 'staging',
    });

    expect(nextState.pendingChoice).toMatchObject({
      kind: 'nocturneMark',
      sourceInstanceId: agent.instanceId,
      availableUnitInstanceIds: [enemy.instanceId],
    });
  });

  it('rejects IMP001 activation outside its controller main turn or while already ready', () => {
    const abomination = makeInstance(
      'abomination',
      createTestCard({
        id: 'IMP001',
        name: 'Assimilating Abomination',
        type: 'Unit',
        rulesText: 'Sacrifice another unit: Ready this unit.',
      })
    );
    const sacrifice = makeInstance('sacrifice');
    const baseState = buildInitialGameState(makeDeck(), null);
    const setupState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [abomination, sacrifice],
      },
    };
    const mainState = {
      ...setupState,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...setupState.zones,
        staging: [{ ...abomination, ready: true }, sacrifice],
      },
    };

    expect(activateCardAbility(setupState, 'player', abomination.instanceId, sacrifice.instanceId)).toEqual({
      error: 'You can only activate abilities during your main turn.',
    });
    expect(activateCardAbility(mainState, 'player', abomination.instanceId, sacrifice.instanceId)).toEqual({
      error: 'Assimilating Abomination is already ready.',
    });
  });

  it('creates a clear unimplemented ability message', () => {
    const card = createTestCard({ name: 'Aegis Defender' });

    expect(createUnimplementedAbilityMessage(card, 'onEnter')).toBe(
      'On Enter is detected on Aegis Defender, but this ability is not implemented yet.'
    );
  });
});

