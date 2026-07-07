import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { chooseBotTurnCommand, getBotBattlefieldAttackChoice } from './bot-policy';
import { applyBotTurnStep, runBotTurn } from './game-bot';
import {
  buildInitialGameState,
  passCounterPriority,
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

  it('does not play targeted tactics when no legal target exists', () => {
    const quash = makeInstance({
      instanceId: 'quash',
      card: createTestCard({
        id: 'IMP027',
        name: 'Quash Insurrection',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 1,
        rulesText: 'Destroy target unit in a combat zone with cost 2 or less.',
      }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [quash],
        supply: [makeInstance({ instanceId: 'supply', ready: true })],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toBeNull();
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

  it('does not throw away a ready unit on a bad attack', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 1, influence: 1 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 4, health: 4, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [attacker],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [defender],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toEqual({
      attackerInstanceId: attacker.instanceId,
      targetZone: 'battlefieldCenter',
    });
  });

  it('passes instead of making an unfavorable forced Provoke attack', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 1, influence: 1 }),
    });
    const provokeDefender = makeInstance({
      instanceId: 'provoke-defender',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'IMP034', name: 'Provoke Defender', type: 'Unit', attack: 4, health: 4, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [attacker],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [provokeDefender],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toBeNull();
  });

  it('uses modified combat stats when choosing attacks', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 3, influence: 1 }),
    });
    const weapon = makeInstance({
      instanceId: 'weapon',
      card: createTestCard({ id: 'weapon', name: 'Weapon', type: 'Item Equipment', attack: 3, health: 0 }),
      attachedToInstanceId: attacker.instanceId,
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 3, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [attacker, weapon],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [defender],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toEqual({
      attackerInstanceId: attacker.instanceId,
      targetZone: 'battlefieldLeft',
    });
  });

  it('chooses another attack after the first bot attack resolves', () => {
    const firstAttacker = makeInstance({
      instanceId: 'first-attacker',
      ready: true,
      card: createTestCard({ id: 'first-attacker', name: 'First Attacker', type: 'Unit', attack: 2, health: 2, influence: 1 }),
    });
    const secondAttacker = makeInstance({
      instanceId: 'second-attacker',
      ready: true,
      card: createTestCard({ id: 'second-attacker', name: 'Second Attacker', type: 'Unit', attack: 2, health: 2, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [firstAttacker, secondAttacker],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    const firstAttack = applyBotTurnStep(state, 'attackBattlefield');
    const playerPassed = passCounterPriority(firstAttack, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    const botPassed = passCounterPriority(playerPassed.state, 'opponent');
    expect('error' in botPassed ? botPassed.error : null).toBeNull();
    if ('error' in botPassed) {
      return;
    }

    expect(getBotBattlefieldAttackChoice(botPassed.state)).toEqual({
      attackerInstanceId: secondAttacker.instanceId,
      targetZone: 'battlefieldLeft',
    });
  });

  it('uses a setup attack to exhaust and soften a defender for a follow-up attacker', () => {
    const setupAttacker = makeInstance({
      instanceId: 'setup-attacker',
      ready: true,
      card: createTestCard({ id: 'setup-attacker', name: 'Setup Attacker', type: 'Unit', attack: 1, health: 1, influence: 1 }),
    });
    const followUpAttacker = makeInstance({
      instanceId: 'follow-up-attacker',
      ready: true,
      card: createTestCard({ id: 'follow-up-attacker', name: 'Follow Up Attacker', type: 'Unit', attack: 3, health: 3, influence: 1 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 4, health: 4, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [setupAttacker, followUpAttacker],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [defender],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toEqual({
      attackerInstanceId: setupAttacker.instanceId,
      targetZone: 'battlefieldLeft',
    });

    const setupAttack = applyBotTurnStep(state, 'attackBattlefield');
    const playerPassed = passCounterPriority(setupAttack, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    const botPassed = passCounterPriority(playerPassed.state, 'opponent');
    expect('error' in botPassed ? botPassed.error : null).toBeNull();
    if ('error' in botPassed) {
      return;
    }

    expect(botPassed.state.zones.battlefieldLeft).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: defender.instanceId, ready: false, damage: 1 })])
    );
    expect(getBotBattlefieldAttackChoice(botPassed.state)).toEqual({
      attackerInstanceId: followUpAttacker.instanceId,
      targetZone: 'battlefieldLeft',
    });
  });

  it('avoids ready Bladewolf Templar when its defend trigger would trade with the attacker', () => {
    const enforcer = makeInstance({
      instanceId: 'noxhaven-enforcer',
      ready: true,
      card: createTestCard({
        id: 'IMP013',
        name: 'Noxhaven Enforcer',
        type: 'Unit',
        cost: 3,
        attack: 4,
        health: 3,
        influence: 1,
      }),
    });
    const bladewolf = makeInstance({
      instanceId: 'bladewolf-templar',
      owner: 'player',
      ready: true,
      card: createTestCard({
        id: 'IMP039',
        name: 'Bladewolf Templar',
        type: 'Unit',
        subtype: 'Fenrir',
        cost: 3,
        attack: 1,
        health: 4,
        influence: 1,
        rulesText: 'On Defend: Ready this unit. It gets +2/+0 during this combat.',
      }),
    });
    const aegis = makeInstance({
      instanceId: 'aegis-defender',
      owner: 'player',
      ready: true,
      card: createTestCard({
        id: 'IMP033',
        name: 'Aegis Defender',
        type: 'Unit',
        subtype: 'Fenrir',
        cost: 2,
        attack: 1,
        health: 4,
        influence: 1,
      }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [enforcer],
      },
      zones: {
        ...baseState.zones,
        battlefieldCenter: [bladewolf],
        battlefieldRight: [aegis],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toEqual({
      attackerInstanceId: enforcer.instanceId,
      targetZone: 'battlefieldRight',
    });
  });

  it('prioritizes an attack that wins by scoring this turn', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 2, influence: 2 }),
    });
    const valuableDefender = makeInstance({
      instanceId: 'valuable-defender',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'valuable-defender', name: 'Valuable Defender', type: 'Unit', cost: 10, attack: 3, health: 2, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentVictoryPoints: 18,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [attacker],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [valuableDefender],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toEqual({
      attackerInstanceId: attacker.instanceId,
      targetZone: 'battlefieldCenter',
    });
  });

  it('prioritizes removing a unit that would let the player win next score', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 4, influence: 1 }),
    });
    const scoringDefender = makeInstance({
      instanceId: 'scoring-defender',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'scoring-defender', name: 'Scoring Defender', type: 'Unit', attack: 1, health: 2, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      playerVictoryPoints: 19,
      opponentZones: {
        ...baseState.opponentZones,
        staging: [attacker],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [scoringDefender],
        battlefieldCenter: [],
        battlefieldRight: [],
      },
    };

    expect(getBotBattlefieldAttackChoice(state)).toEqual({
      attackerInstanceId: attacker.instanceId,
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
    expect(executedState.zones.battlefieldCenter).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: attacker.instanceId, owner: 'opponent', ready: true })])
    );
  });

  it('uses Demonic Advance to take the best scoring empty combat zone', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', cost: 2, attack: 3, health: 3, influence: 2 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeAdvanceState = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentDemonicAdvanceActive: true,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [attacker],
        supply: [
          makeInstance({ instanceId: 'supply-1', ready: true }),
          makeInstance({ instanceId: 'supply-2', ready: true }),
        ],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [],
        battlefieldCenter: [],
        battlefieldRight: [
          makeInstance({
            instanceId: 'territory',
            card: createTestCard({ id: 'territory', name: 'Territory', type: 'Territory', influence: 0 }),
          }),
        ],
      },
    };

    expect(chooseBotTurnCommand(activeAdvanceState, 'stageUnit')).toMatchObject({
      type: 'card',
      action: {
        instanceId: attacker.instanceId,
        toZone: 'battlefieldCenter',
      },
    });
  });

  it('targets the highest scoring enemy unit with removal tactics', () => {
    const killingBlow = makeInstance({
      instanceId: 'killing-blow',
      card: createTestCard({
        id: 'IMP026',
        name: 'Killing Blow',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 1,
        rulesText: 'Destroy target unit in a combat zone.',
      }),
    });
    const lowValue = makeInstance({
      instanceId: 'low-value',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'low-value', name: 'Low Value', type: 'Unit', attack: 1, health: 1, influence: 1 }),
    });
    const highInfluence = makeInstance({
      instanceId: 'high-influence',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'high-influence', name: 'High Influence', type: 'Unit', attack: 1, health: 3, influence: 3 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [killingBlow],
        supply: [makeInstance({ instanceId: 'supply', ready: true })],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [lowValue],
        battlefieldCenter: [highInfluence],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toMatchObject({
      type: 'card',
      action: {
        instanceId: killingBlow.instanceId,
        toZone: 'graveyard',
        options: {
          abilityTargetInstanceId: highInfluence.instanceId,
        },
      },
    });

    const executedState = applyBotTurnStep(state, 'stageUnit');
    expect(executedState.zones.battlefieldCenter.some((card) => card.instanceId === highInfluence.instanceId)).toBe(false);
    expect(executedState.zones.graveyard).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: highInfluence.instanceId })])
    );
    expect(executedState.zones.battlefieldLeft).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: lowValue.instanceId })])
    );
  });

  it('does not spend removal on a low-value unit it can already beat in combat', () => {
    const killingBlow = makeInstance({
      instanceId: 'killing-blow',
      card: createTestCard({
        id: 'IMP026',
        name: 'Killing Blow',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 1,
        rulesText: 'Destroy target unit in a combat zone.',
      }),
    });
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3, influence: 1 }),
    });
    const lowValue = makeInstance({
      instanceId: 'low-value',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'low-value', name: 'Low Value', type: 'Unit', attack: 1, health: 1, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [killingBlow],
        staging: [attacker],
        supply: [makeInstance({ instanceId: 'supply', ready: true })],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [lowValue],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toBeNull();
  });

  it('uses removal to stop lethal player scoring even when combat could answer later', () => {
    const quash = makeInstance({
      instanceId: 'quash',
      card: createTestCard({
        id: 'IMP027',
        name: 'Quash Insurrection',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 1,
        rulesText: 'Destroy target unit in a combat zone with cost 2 or less.',
      }),
    });
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3, influence: 1 }),
    });
    const scoringUnit = makeInstance({
      instanceId: 'scoring-unit',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'scoring-unit', name: 'Scoring Unit', type: 'Unit', cost: 2, attack: 1, health: 1, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      playerVictoryPoints: 19,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [quash],
        staging: [attacker],
        supply: [makeInstance({ instanceId: 'supply', ready: true })],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [scoringUnit],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toMatchObject({
      type: 'card',
      action: {
        instanceId: quash.instanceId,
        toZone: 'graveyard',
        options: {
          abilityTargetInstanceId: scoringUnit.instanceId,
        },
      },
    });
  });

  it('uses bounce tactics on the highest value enemy unit', () => {
    const rebound = makeInstance({
      instanceId: 'rebound',
      card: createTestCard({
        id: 'IMP086',
        name: 'Rebound',
        type: 'Tactic',
        cost: 1,
        rulesText: "Return target unit to its owner's hand.",
      }),
    });
    const lowValue = makeInstance({
      instanceId: 'low-value',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'low-value', name: 'Low Value', type: 'Unit', attack: 1, health: 1, influence: 1 }),
    });
    const highValue = makeInstance({
      instanceId: 'high-value',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'high-value', name: 'High Value', type: 'Unit', attack: 3, health: 4, influence: 3 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [rebound],
        supply: [makeInstance({ instanceId: 'supply', ready: true })],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [lowValue],
        battlefieldCenter: [highValue],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toMatchObject({
      type: 'card',
      action: {
        instanceId: rebound.instanceId,
        options: {
          abilityTargetInstanceId: highValue.instanceId,
        },
      },
    });

    const executedState = applyBotTurnStep(state, 'stageUnit');
    expect(executedState.zones.battlefieldCenter).toEqual([]);
    expect(executedState.zones.hand).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: highValue.instanceId })])
    );
    expect(executedState.zones.battlefieldLeft).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: lowValue.instanceId })])
    );
  });

  it('uses exhaust tactics to stop a lethal scoring unit', () => {
    const sporeBloom = makeInstance({
      instanceId: 'spore-bloom',
      card: createTestCard({
        id: 'IMP148',
        name: 'Spore Bloom',
        type: 'Tactic',
        cost: 1,
        rulesText: "Exhaust target enemy unit. It doesn't ready during its next ready phase.",
      }),
    });
    const scoringUnit = makeInstance({
      instanceId: 'scoring-unit',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'scoring-unit', name: 'Scoring Unit', type: 'Unit', attack: 1, health: 3, influence: 1 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      playerVictoryPoints: 19,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [sporeBloom],
        supply: [makeInstance({ instanceId: 'supply', ready: true })],
      },
      zones: {
        ...baseState.zones,
        battlefieldLeft: [scoringUnit],
      },
    };

    expect(chooseBotTurnCommand(state, 'stageUnit')).toMatchObject({
      type: 'card',
      action: {
        instanceId: sporeBloom.instanceId,
        options: {
          abilityTargetInstanceId: scoringUnit.instanceId,
        },
      },
    });

    const executedState = applyBotTurnStep(state, 'stageUnit');
    expect(executedState.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: scoringUnit.instanceId,
      ready: false,
      skipNextReady: true,
    });
  });
});
