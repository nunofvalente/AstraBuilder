import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getRegisteredCardAbilities } from './card-abilities';
import { applyCardAction } from './game-actions';
import {
  advanceToNextTurn,
  buildInitialGameState,
  declareBattlefieldAttack,
  exhaustSupplyForCost,
  getBattlefieldAttackError,
  getCounterTargetOptions,
  getCurrentUnitAttack,
  getCurrentUnitHealth,
  getReadySupplyCount,
  passCounterPriority,
  playCounterCard,
  resolveBattlefieldAttack,
  resolvePendingChoice,
  runTurnStart,
  scoreBattlefieldVictoryPoints,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'lux-test', title: 'Lux Test', cardCount: 0, entries: [] };
}

function makeState(): GameState {
  return {
    ...buildInitialGameState(makeDeck(), makeDeck()),
    phase: 'main',
    activePlayer: 'player',
    firstPlayer: 'player',
    hasFirstPlayerSkippedDraw: true,
    log: [],
  };
}

function makeUnit(
  id: string,
  owner: 'player' | 'opponent' = 'player',
  overrides: Partial<GameCardInstance> = {}
): GameCardInstance {
  return {
    instanceId: `${owner}-${id}`,
    owner,
    card: overrides.card ?? createTestCard({
      id,
      name: id,
      type: 'Unit',
      cost: 2,
      attack: 2,
      health: 3,
      influence: 1,
    }),
    ready: overrides.ready ?? true,
    faceDown: overrides.faceDown ?? false,
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
    ...overrides,
  };
}

function makeCard(id: string, name: string, type: string, rulesText: string): GameCardInstance {
  return makeUnit(id, 'player', {
    card: createTestCard({ id, name, type, rulesText }),
  });
}

describe('Lux card abilities', () => {
  it('registers every Lux card from IMP033 through IMP063', () => {
    for (let number = 33; number <= 63; number += 1) {
      const id = `IMP${String(number).padStart(3, '0')}`;
      expect(getRegisteredCardAbilities(id), id).not.toBeNull();
    }
    expect(getRegisteredCardAbilities('IMP161')).not.toBeNull();
  });

  it('gives friendly units occupying Fortified Pillbox zone +2 health', () => {
    const pillbox = makeUnit('IMP161', 'player', {
      card: createTestCard({ id: 'IMP161', name: 'Fortified Pillbox', type: 'Territory', affinity: 'Lux' }),
    });
    const friendly = makeUnit('friendly', 'player', {
      card: createTestCard({ id: 'friendly', name: 'Friendly', type: 'Unit', health: 3 }),
    });
    const enemy = makeUnit('enemy', 'opponent', {
      card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', health: 3 }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, battlefieldLeft: [pillbox, friendly, enemy] },
    };

    expect(getCurrentUnitHealth(state, friendly)).toBe(5);
    expect(getCurrentUnitHealth(state, enemy)).toBe(3);
  });

  it('creates Drone tokens for Armored Carrier and Frontline Officer', () => {
    const state = makeState();
    const carrier = makeCard('IMP036', 'Armored Carrier', 'Unit', 'On Death: Create two Drone tokens.');
    const officer = makeCard('IMP044', 'Frontline Officer', 'Unit', 'On Enter: Create a Drone token.');

    const afterCarrier = triggerCardAbilities(state, 'onDeath', {
      source: carrier,
      controller: 'player',
      zone: 'staging',
    });
    expect(afterCarrier.zones.staging.filter((card) => card.card.id === 'IMPT001')).toHaveLength(2);

    const afterOfficer = triggerCardAbilities(afterCarrier, 'onEnter', {
      source: officer,
      controller: 'player',
      zone: 'staging',
    });
    expect(afterOfficer.zones.staging.filter((card) => card.card.id === 'IMPT001')).toHaveLength(3);
  });

  it('enforces Provoke, Vanguard Mech, and Quarantine attack restrictions', () => {
    const attacker = makeUnit('attacker');
    const provoke = makeUnit('IMP034', 'opponent', {
      card: createTestCard({ id: 'IMP034', name: 'Aegis Guardian', type: 'Unit', attack: 3, health: 5, rulesText: 'Provoke' }),
    });
    const normal = makeUnit('normal', 'opponent');
    const vanguard = makeUnit('IMP050', 'opponent', {
      card: createTestCard({ id: 'IMP050', name: 'Vanguard Mech', type: 'Unit', rulesText: "Units with 2 or less attack can't attack this unit." }),
    });
    const quarantine = makeCard('IMP063', 'Quarantine Zone', 'Territory', 'Units cannot attack this zone.');
    quarantine.owner = 'opponent';
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [attacker],
        battlefieldLeft: [provoke],
        battlefieldCenter: [normal],
        battlefieldRight: [vanguard, quarantine],
      },
    };

    expect(getBattlefieldAttackError(state, 'player', attacker.instanceId, 'battlefieldCenter')).toContain('Provoke');
    expect(getBattlefieldAttackError(state, 'player', attacker.instanceId, 'battlefieldLeft')).toBeNull();

    const suppressedProvoke = {
      ...state,
      zones: {
        ...state.zones,
        battlefieldLeft: [{ ...provoke, abilitiesSuppressedUntilTurn: state.turn }],
      },
    };
    expect(getBattlefieldAttackError(suppressedProvoke, 'player', attacker.instanceId, 'battlefieldCenter')).toBeNull();

    const withoutProvoke = {
      ...state,
      zones: { ...state.zones, battlefieldLeft: [] },
    };
    expect(getBattlefieldAttackError(withoutProvoke, 'player', attacker.instanceId, 'battlefieldRight')).toContain('Quarantine');

    const withoutQuarantine = {
      ...withoutProvoke,
      zones: { ...withoutProvoke.zones, battlefieldRight: [vanguard] },
    };
    expect(getBattlefieldAttackError(withoutQuarantine, 'player', attacker.instanceId, 'battlefieldRight')).toContain('more than 2 attack');
  });

  it('applies Bladewolf, Brynn, and Selena combat modifiers', () => {
    const brynn = makeUnit('IMP040', 'player', {
      card: createTestCard({ id: 'IMP040', name: 'Brynn', type: 'Renowned Unit', attack: 3, health: 3 }),
    });
    const bladewolf = makeUnit('IMP039', 'opponent', {
      ready: false,
      card: createTestCard({
        id: 'IMP039',
        name: 'Bladewolf Templar',
        type: 'Unit',
        attack: 2,
        health: 5,
        rulesText: 'On Defend: Ready this unit. It gets +2/+0 during this combat.',
      }),
    });
    const selena = makeUnit('IMP046', 'opponent', {
      card: createTestCard({ id: 'IMP046', name: 'Selena', type: 'Renowned Unit', attack: 3, health: 5 }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [brynn],
        battlefieldLeft: [bladewolf],
        battlefieldCenter: [selena],
      },
    };

    expect(getCurrentUnitAttack(state, bladewolf)).toBe(3);
    const declared = declareBattlefieldAttack(state, 'player', brynn.instanceId, 'battlefieldLeft');
    expect(declared).not.toHaveProperty('error');
    if ('state' in declared) {
      expect(declared.state.zones.battlefieldLeft[0]).toMatchObject({ ready: true, combatAttackBonus: 2 });
      const resolved = resolveBattlefieldAttack(declared.state, 'player', brynn.instanceId, 'battlefieldLeft');
      expect(resolved).not.toHaveProperty('error');
      if ('state' in resolved) {
        expect(resolved.attackerDestroyed).toBe(false);
        expect(resolved.state.zones.staging.find((card) => card.instanceId === brynn.instanceId)?.damage).toBe(0);
      }
    }
  });

  it('combines equipment and Vero bonuses in current unit stats', () => {
    const vero = makeUnit('IMP051', 'player', {
      card: createTestCard({
        id: 'IMP051',
        name: 'Vero, Captain of the Guard',
        type: 'Renowned Unit',
        rulesText: 'On Attack: Other friendly units get +1/+1 until end of turn.',
      }),
    });
    const ally = makeUnit('ally', 'player', {
      card: createTestCard({ id: 'ally', name: 'Ally', type: 'Unit', attack: 2, health: 3 }),
    });
    const equipment = makeUnit('equipment', 'player', {
      attachedToInstanceId: ally.instanceId,
      card: createTestCard({ id: 'equipment', name: 'Equipment', type: 'Item', attack: 2, health: 3 }),
    });
    const base = makeState();
    const state = {
      ...base,
      zones: { ...base.zones, staging: [vero, ally, equipment] },
    };

    expect(getCurrentUnitAttack(state, ally)).toBe(4);
    expect(getCurrentUnitHealth(state, ally)).toBe(6);

    const buffed = triggerCardAbilities(state, 'onAttack', {
      source: vero,
      controller: 'player',
      zone: 'battlefieldLeft',
    });
    const buffedAlly = buffed.zones.staging.find((card) => card.instanceId === ally.instanceId)!;
    expect(getCurrentUnitAttack(buffed, buffedAlly)).toBe(5);
    expect(getCurrentUnitHealth(buffed, buffedAlly)).toBe(7);
  });

  it('resolves targeted Lux tactics and Community Effort choices', () => {
    const artillery = makeCard('IMP052', 'Artillery Barrage', 'Tactic', 'Deal 4 damage to target enemy staging unit.');
    const effort = makeCard('IMP053', 'Community Effort', 'Tactic', 'Exhaust up to 3 friendly ready units, then draw that many cards.');
    const resuscitate = makeCard('IMP054', 'Resuscitate', 'Tactic', 'Return a unit from your graveyard to your hand.');
    const enemy = makeUnit('enemy', 'opponent', {
      card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', health: 4 }),
    });
    const allyOne = makeUnit('ally-one');
    const allyTwo = makeUnit('ally-two');
    const dead = makeUnit('dead');
    const drawOne = makeUnit('draw-one');
    const drawTwo = makeUnit('draw-two');
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [allyOne, allyTwo],
        graveyard: [artillery, effort, resuscitate, dead],
        deck: [drawOne, drawTwo],
      },
      opponentZones: {
        ...makeState().opponentZones,
        staging: [enemy],
      },
    };

    const artilleryPending = triggerCardAbilities(state, 'onPlay', {
      source: artillery,
      controller: 'player',
      zone: 'graveyard',
    });
    const artilleryResolved = resolvePendingChoice(artilleryPending, [enemy.instanceId]);
    expect('error' in artilleryResolved ? null : artilleryResolved.opponentZones.staging).toEqual([]);

    const effortPending = triggerCardAbilities('error' in artilleryResolved ? state : artilleryResolved, 'onPlay', {
      source: effort,
      controller: 'player',
      zone: 'graveyard',
    });
    const effortResolved = resolvePendingChoice(effortPending, [allyOne.instanceId, allyTwo.instanceId]);
    expect('error' in effortResolved ? null : effortResolved.zones.hand).toHaveLength(2);
    expect('error' in effortResolved ? null : effortResolved.zones.staging.every((unit) => !unit.ready)).toBe(true);

    const resuscitatePending = triggerCardAbilities('error' in effortResolved ? state : effortResolved, 'onPlay', {
      source: resuscitate,
      controller: 'player',
      zone: 'graveyard',
    });
    const resuscitateResolved = resolvePendingChoice(resuscitatePending, [dead.instanceId]);
    expect('error' in resuscitateResolved ? null : resuscitateResolved.zones.hand.some((card) => card.instanceId === dead.instanceId)).toBe(true);
  });

  it('logs the target damaged by Stormhammer Howitzer', () => {
    const howitzer = makeCard(
      'IMP049',
      'Stormhammer Howitzer',
      'Unit Vehicle',
      'On Enter: You may exhaust another ready staging unit to deal 4 damage to an enemy staging unit.'
    );
    const spotter = makeUnit('spotter', 'player', {
      card: createTestCard({ id: 'spotter', name: 'Spotter', type: 'Unit' }),
    });
    const target = makeUnit('target', 'opponent', {
      card: createTestCard({ id: 'target', name: 'Target Drone', type: 'Unit', health: 5 }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [howitzer, spotter],
      },
      opponentZones: {
        ...makeState().opponentZones,
        staging: [target],
      },
    };

    const exhaustChoice = triggerCardAbilities(state, 'onEnter', {
      source: howitzer,
      controller: 'player',
      zone: 'staging',
    });
    const damageChoice = resolvePendingChoice(exhaustChoice, [spotter.instanceId]);
    expect('error' in damageChoice ? damageChoice.error : null).toBeNull();
    if ('error' in damageChoice) {
      return;
    }

    const damaged = resolvePendingChoice(damageChoice, [target.instanceId]);
    expect('error' in damaged ? damaged.error : null).toBeNull();
    if ('error' in damaged) {
      return;
    }

    expect(damaged.opponentZones.staging[0]).toMatchObject({ instanceId: target.instanceId, damage: 4 });
    expect(damaged.log[0]?.suffix).toBe('Stormhammer Howitzer dealt 4 damage to Target Drone.');
  });

  it('makes tokens cease when Lux effects would move them to hand', () => {
    const extraction = makeCard('IMP057', 'Emergency Extraction', 'Tactic', 'Return target friendly unit or item.');
    const resuscitate = makeCard('IMP054', 'Resuscitate', 'Tactic', 'Return a unit from your graveyard to your hand.');
    const stagingToken = makeUnit('staging-token', 'player', {
      card: createTestCard({ id: 'staging-token', name: 'Staging Token', type: 'Token Unit' }),
    });
    const graveyardToken = makeUnit('graveyard-token', 'player', {
      card: createTestCard({ id: 'graveyard-token', name: 'Graveyard Token', type: 'Token Unit' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [stagingToken],
        graveyard: [graveyardToken],
      },
    };

    const extractionPending = triggerCardAbilities(state, 'onPlay', {
      source: extraction,
      controller: 'player',
      zone: 'graveyard',
    });
    const extracted = resolvePendingChoice(extractionPending, [stagingToken.instanceId]);
    expect('error' in extracted ? null : extracted.zones.staging).toEqual([]);
    expect('error' in extracted ? null : extracted.zones.hand.some((card) => card.instanceId === stagingToken.instanceId)).toBe(false);

    const resuscitatePending = triggerCardAbilities('error' in extracted ? state : extracted, 'onPlay', {
      source: resuscitate,
      controller: 'player',
      zone: 'graveyard',
    });
    const resuscitated = resolvePendingChoice(resuscitatePending, [graveyardToken.instanceId]);
    expect('error' in resuscitated ? null : resuscitated.zones.graveyard.some((card) => card.instanceId === graveyardToken.instanceId)).toBe(false);
    expect('error' in resuscitated ? null : resuscitated.zones.hand.some((card) => card.instanceId === graveyardToken.instanceId)).toBe(false);
  });

  it('provides legal Lux counter targets', () => {
    const attacker = makeUnit('attacker');
    const defender = makeUnit('defender', 'opponent', { ready: false });
    const extraction = makeCard('IMP057', 'Emergency Extraction', 'Tactic', 'Return target friendly unit or item.');
    const muster = makeCard('IMP058', 'Muster for Battle', 'Tactic', 'Ready target friendly unit. Draw a card.');
    const medic = makeCard('IMP045', 'Nekora Medic', 'Unit', 'Swift. On Enter: Prevent combat damage.');
    medic.owner = 'opponent';
    const state = {
      ...makeState(),
      pendingCombat: {
        attackerOwner: 'player' as const,
        attackerInstanceId: attacker.instanceId,
        targetZone: 'battlefieldLeft' as const,
        defenderInstanceId: defender.instanceId,
        priorityOwner: 'opponent' as const,
        lastPassedOwner: null,
        counterStack: [],
      },
      zones: {
        ...makeState().zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...makeState().opponentZones,
        hand: [medic],
      },
    };

    expect(getCounterTargetOptions(state, extraction).map((card) => card.instanceId)).toContain(attacker.instanceId);
    expect(getCounterTargetOptions(state, muster).map((card) => card.instanceId)).not.toContain(attacker.instanceId);
    expect(getCounterTargetOptions(state, medic).map((card) => card.instanceId)).toEqual([defender.instanceId]);
  });

  it('resolves responses above Muster before pausing for Celeste to exhaust the attacker', () => {
    const attacker = makeUnit('attacker', 'opponent', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 4, health: 5 }),
    });
    const celeste = makeUnit('IMP041', 'player', {
      ready: false,
      card: createTestCard({ id: 'IMP041', name: 'Celeste, Concord Paladin', type: 'Unit', attack: 2, health: 5 }),
    });
    const muster = makeUnit('IMP058', 'player', {
      card: createTestCard({
        id: 'IMP058',
        name: 'Muster for Battle',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 2,
        rulesText: 'Ready target friendly unit. Draw a card.',
      }),
    });
    const opponentResponse = makeUnit('opponent-response', 'opponent', {
      card: createTestCard({
        id: 'opponent-response',
        name: 'Opponent Response',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'You can play this as a counter.',
      }),
    });
    const playerResponse = makeUnit('player-response', 'player', {
      card: createTestCard({
        id: 'player-response',
        name: 'Player Response',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'You can play this as a counter.',
      }),
    });
    const opponentFinalResponse = makeUnit('opponent-final-response', 'opponent', {
      card: createTestCard({
        id: 'opponent-final-response',
        name: 'Opponent Final Response',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'You can play this as a counter.',
      }),
    });
    const supply = [makeCard('supply-1', 'Supply 1', 'Territory', ''), makeCard('supply-2', 'Supply 2', 'Territory', '')];
    const drawn = makeCard('drawn', 'Drawn Card', 'Tactic', '');
    const state: GameState = {
      ...makeState(),
      activePlayer: 'opponent',
      zones: {
        ...makeState().zones,
        hand: [muster, playerResponse],
        deck: [drawn],
        supply,
        battlefieldLeft: [celeste],
      },
      opponentZones: {
        ...makeState().opponentZones,
        hand: [opponentResponse, opponentFinalResponse],
        staging: [attacker],
      },
    };

    const declared = declareBattlefieldAttack(state, 'opponent', attacker.instanceId, 'battlefieldLeft');
    expect(declared).not.toHaveProperty('error');
    if (!('state' in declared)) return;
    const played = playCounterCard(declared.state, 'player', muster.instanceId, {
      targetInstanceId: celeste.instanceId,
    });
    expect(played).not.toHaveProperty('error');
    if (!('state' in played)) return;
    const opponentResponded = playCounterCard(played.state, 'opponent', opponentResponse.instanceId);
    expect(opponentResponded).not.toHaveProperty('error');
    if (!('state' in opponentResponded)) return;
    const playerResponded = playCounterCard(opponentResponded.state, 'player', playerResponse.instanceId);
    expect(playerResponded).not.toHaveProperty('error');
    if (!('state' in playerResponded)) return;
    const opponentRespondedAgain = playCounterCard(
      playerResponded.state,
      'opponent',
      opponentFinalResponse.instanceId
    );
    expect(opponentRespondedAgain).not.toHaveProperty('error');
    if (!('state' in opponentRespondedAgain)) return;
    const paused = passCounterPriority(opponentRespondedAgain.state, 'player');
    expect(paused).not.toHaveProperty('error');
    if (!('state' in paused)) return;

    expect(paused.resolvedCombat).toBeNull();
    expect(paused.resolvedCounters.map((counter) => counter.instanceId)).toEqual([
      opponentFinalResponse.instanceId,
      playerResponse.instanceId,
      opponentResponse.instanceId,
      muster.instanceId,
    ]);
    expect(paused.state.pendingChoice).toMatchObject({
      kind: 'luxTarget',
      effect: 'celesteExhaust',
      resumeCombat: true,
      availableInstanceIds: [attacker.instanceId],
    });
    expect(paused.state.zones.hand.some((card) => card.instanceId === drawn.instanceId)).toBe(true);

    const resolved = resolvePendingChoice(paused.state, [attacker.instanceId]);
    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) return;
    expect(resolved.pendingCombat).toBeNull();
    expect(resolved.zones.battlefieldLeft.find((card) => card.instanceId === celeste.instanceId)?.damage).toBe(0);
  });

  it('does not trigger Celeste when a counter above Muster destroys her first', () => {
    const attacker = makeUnit('attacker', 'opponent', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 4, health: 5 }),
    });
    const celeste = makeUnit('IMP041', 'player', {
      ready: false,
      card: createTestCard({ id: 'IMP041', name: 'Celeste, Concord Paladin', type: 'Unit', attack: 2, health: 5 }),
    });
    const muster = makeUnit('IMP058', 'player', {
      card: createTestCard({
        id: 'IMP058',
        name: 'Muster for Battle',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'Ready target friendly unit. Draw a card.',
      }),
    });
    const killingBlow = makeUnit('IMP026', 'opponent', {
      card: createTestCard({
        id: 'IMP026',
        name: 'Killing Blow',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'Destroy target unit in a combat zone.',
      }),
    });
    const state: GameState = {
      ...makeState(),
      activePlayer: 'opponent',
      zones: {
        ...makeState().zones,
        hand: [muster],
        battlefieldLeft: [celeste],
      },
      opponentZones: {
        ...makeState().opponentZones,
        hand: [killingBlow],
        staging: [attacker],
      },
    };

    const declared = declareBattlefieldAttack(state, 'opponent', attacker.instanceId, 'battlefieldLeft');
    expect(declared).not.toHaveProperty('error');
    if (!('state' in declared)) return;
    const playedMuster = playCounterCard(declared.state, 'player', muster.instanceId, {
      targetInstanceId: celeste.instanceId,
    });
    expect(playedMuster).not.toHaveProperty('error');
    if (!('state' in playedMuster)) return;
    const playedKillingBlow = playCounterCard(playedMuster.state, 'opponent', killingBlow.instanceId, {
      targetInstanceId: celeste.instanceId,
    });
    expect(playedKillingBlow).not.toHaveProperty('error');
    if (!('state' in playedKillingBlow)) return;

    const resolved = passCounterPriority(playedKillingBlow.state, 'player');
    expect(resolved).not.toHaveProperty('error');
    if (!('state' in resolved)) return;
    expect(resolved.resolvedCounters.map((counter) => counter.instanceId)).toEqual([
      killingBlow.instanceId,
      muster.instanceId,
    ]);
    expect(resolved.resolvedCombat).not.toBeNull();
    expect(resolved.state.pendingChoice).toBeNull();
    expect(resolved.state.zones.graveyard.some((card) => card.instanceId === celeste.instanceId)).toBe(true);
  });

  it('adds and spends Fortuna temporary supply', () => {
    const fortuna = makeCard('IMP061', 'Fortuna Bank', 'Territory', 'On Flip: Add 3 supply until end of turn.');
    const state = triggerCardAbilities(makeState(), 'onFlip', {
      source: fortuna,
      controller: 'player',
      zone: 'battlefieldLeft',
    });
    expect(getReadySupplyCount(state, 'player')).toBe(3);
    const paid = exhaustSupplyForCost(state, 'player', 2);
    expect(paid.playerTemporarySupply).toBe(1);
    expect(advanceToNextTurn(paid).playerTemporarySupply).toBe(0);
  });

  it('sacrifices Fortuna Bank and draws a card when its end-turn choice is confirmed', () => {
    const fortuna = makeCard('IMP061', 'Fortuna Bank', 'Territory', 'At the end of your turn, you may sacrifice this to draw a card.');
    const occupyingUnit = makeUnit('occupying-unit');
    const drawnCard = makeUnit('drawn-card');
    const base = makeState();
    const state = {
      ...base,
      zones: {
        ...base.zones,
        deck: [drawnCard],
        battlefieldLeft: [occupyingUnit, fortuna],
      },
    };

    const pending = advanceToNextTurn(state);

    expect(pending.pendingChoice).toMatchObject({
      kind: 'luxTarget',
      effect: 'fortunaSacrifice',
      availableInstanceIds: [fortuna.instanceId],
      resumeTurnAdvance: true,
    });

    const resolved = resolvePendingChoice(pending, [fortuna.instanceId]);

    expect('error' in resolved ? resolved.error : null).toBeNull();
    if ('error' in resolved) {
      return;
    }
    expect(resolved.zones.battlefieldLeft.some((card) => card.instanceId === fortuna.instanceId)).toBe(false);
    expect(resolved.zones.graveyard.some((card) => card.instanceId === fortuna.instanceId)).toBe(true);
    expect(resolved.zones.hand.some((card) => card.instanceId === drawnCard.instanceId)).toBe(true);
    expect(resolved.activePlayer).toBe('opponent');
  });

  it('suppresses scoring and retreat in Quarantine Zone and sacrifices it after two starts', () => {
    const unit = makeUnit('quarantined');
    const quarantine = makeCard('IMP063', 'Quarantine Zone', 'Territory', 'Quarantine');
    const base = makeState();
    const state = {
      ...base,
      zones: {
        ...base.zones,
        battlefieldLeft: [unit, quarantine],
      },
    };

    expect(scoreBattlefieldVictoryPoints(state, 'player').playerVictoryPoints).toBe(0);
    expect(applyCardAction(state, {
      owner: 'player',
      instanceId: unit.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'staging',
    }).error).toContain('Quarantine');

    const firstStart = runTurnStart(state);
    expect(firstStart.zones.battlefieldLeft.find((card) => card.card.id === 'IMP063')?.progressCounters).toBe(1);
    const secondStart = runTurnStart(firstStart);
    expect(secondStart.zones.battlefieldLeft.some((card) => card.card.id === 'IMP063')).toBe(false);
    expect(secondStart.zones.graveyard.some((card) => card.card.id === 'IMP063')).toBe(true);
  });

  it('moves Seraphiel to the deck on death and revives a unit on score', () => {
    const seraphiel = makeUnit('IMP048', 'player', {
      card: createTestCard({
        id: 'IMP048',
        name: 'Seraphiel',
        type: 'Renowned Unit',
        influence: 2,
        rulesText: 'On Score: Return a unit from your graveyard to staging. On Death: Put this on the bottom of your deck.',
      }),
    });
    const dead = makeUnit('dead');
    const base = makeState();
    const deathState = {
      ...base,
      zones: { ...base.zones, graveyard: [seraphiel] },
    };
    const afterDeath = triggerCardAbilities(deathState, 'onDeath', {
      source: seraphiel,
      controller: 'player',
      zone: 'battlefieldLeft',
    });
    expect(afterDeath.zones.graveyard).toEqual([]);
    expect(afterDeath.zones.deck.at(-1)?.instanceId).toBe(seraphiel.instanceId);

    const scoringState = {
      ...base,
      zones: {
        ...base.zones,
        graveyard: [dead],
        battlefieldLeft: [seraphiel],
      },
    };
    const scored = scoreBattlefieldVictoryPoints(scoringState, 'player');
    expect(scored.pendingChoice).toMatchObject({ kind: 'luxTarget', effect: 'seraphielReturn' });
    const resolved = resolvePendingChoice(scored, [dead.instanceId]);
    expect('error' in resolved ? null : resolved.zones.staging[0]?.instanceId).toBe(dead.instanceId);
  });

  it('offers Biscuit end-turn movement before advancing', () => {
    const biscuit = makeUnit('IMP038', 'player', {
      card: createTestCard({ id: 'IMP038', name: 'Biscuit', type: 'Renowned Unit' }),
    });
    const draw = makeUnit('draw');
    const base = makeState();
    const state = {
      ...base,
      zones: { ...base.zones, staging: [biscuit], deck: [draw] },
    };
    const pending = advanceToNextTurn(state);
    expect(pending.pendingChoice).toMatchObject({ kind: 'luxTarget', effect: 'biscuitReturn', resumeTurnAdvance: true });
    const resolved = resolvePendingChoice(pending, [biscuit.instanceId]);
    expect('error' in resolved ? null : resolved.zones.deck.at(-1)?.instanceId).toBe(biscuit.instanceId);
    expect('error' in resolved ? null : resolved.zones.hand.some((card) => card.instanceId === draw.instanceId)).toBe(true);
  });
});
