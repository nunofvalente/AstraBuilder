import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getRegisteredCardAbilities } from './card-abilities';
import { applyCardAction } from './game-actions';
import {
  advanceToNextTurn,
  buildInitialGameState,
  clearEndOfTurnDamage,
  declareBattlefieldAttack,
  getBattlefieldAttackError,
  getCurrentUnitAttack,
  getCurrentUnitHealth,
  passCounterPriority,
  prepareCardForZone,
  readyCardsForOwner,
  resolveBattlefieldAttack,
  resolvePendingChoice,
  resolveUnitTakesControlOfZone,
  scoreBattlefieldVictoryPoints,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'solara-test', title: 'Solara Test', cardCount: 0, entries: [] };
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

function makeCard(
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
      affinity: 'Solara',
    }),
    ready: overrides.ready ?? true,
    faceDown: overrides.faceDown ?? false,
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
    ...overrides,
  };
}

function abilityCard(id: string, name: string, type: string): GameCardInstance {
  return makeCard(id, 'player', {
    card: createTestCard({ id, name, type, cost: 0, affinity: 'Solara' }),
  });
}

describe('Solara card abilities', () => {
  it('registers every Solara card from IMP096 through IMP126', () => {
    for (let number = 96; number <= 126; number += 1) {
      const id = `IMP${String(number).padStart(3, '0')}`;
      expect(getRegisteredCardAbilities(id), id).not.toBeNull();
    }
  });

  it('locks Ashfang Pillager supply for one ready phase and restricts Ashfang Raider for its entry turn', () => {
    const pillager = abilityCard('IMP096', 'Ashfang Pillager', 'Unit');
    const raider = abilityCard('IMP097', 'Ashfang Raider', 'Unit');
    const supply = makeCard('supply', 'opponent');
    const defender = makeCard('defender', 'opponent');
    const base = makeState();
    const state = {
      ...base,
      zones: { ...base.zones, staging: [raider], battlefieldLeft: [defender] },
      opponentZones: { ...base.opponentZones, supply: [supply] },
    };

    const pending = triggerCardAbilities(state, 'onPlay', { source: pillager, controller: 'player', zone: 'staging' });
    const locked = resolvePendingChoice(pending, [supply.instanceId]);
    expect('error' in locked ? null : locked.opponentZones.supply[0]).toMatchObject({ ready: false, skipNextReady: true });
    const firstReady = 'error' in locked ? state : readyCardsForOwner(locked, 'opponent');
    expect(firstReady.opponentZones.supply[0]).toMatchObject({ ready: false, skipNextReady: false });
    expect(readyCardsForOwner(firstReady, 'opponent').opponentZones.supply[0]?.ready).toBe(true);

    const entered = triggerCardAbilities(state, 'onEnter', { source: raider, controller: 'player', zone: 'staging' });
    expect(getBattlefieldAttackError(entered, 'player', raider.instanceId, 'battlefieldLeft')).toContain('unoccupied');
    expect(getBattlefieldAttackError(entered, 'player', raider.instanceId, 'battlefieldCenter')).toBeNull();
  });

  it('draws for Fearless Whelp and grants temporary Glory with Frenzied Firedancer', () => {
    const whelp = abilityCard('IMP100', 'Fearless Whelp', 'Unit');
    const firedancer = abilityCard('IMP101', 'Frenzied Firedancer', 'Unit');
    const ally = makeCard('ally');
    const draw = makeCard('draw');
    const base = makeState();
    const state = { ...base, zones: { ...base.zones, deck: [draw], staging: [firedancer, ally] } };

    expect(triggerCardAbilities(state, 'onDeath', { source: whelp, controller: 'player', zone: 'graveyard' }).zones.hand[0]?.instanceId).toBe(draw.instanceId);
    const pending = triggerCardAbilities(state, 'onAttack', { source: firedancer, controller: 'player', zone: 'battlefieldLeft' });
    const granted = resolvePendingChoice(pending, [ally.instanceId]);
    expect('error' in granted ? null : granted.zones.staging.find((card) => card.instanceId === ally.instanceId)).toMatchObject({
      temporaryGloryBonus: 1,
      temporaryGloryExpiresAfterTurn: state.turn,
    });
    expect('error' in granted ? [] : granted.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suffix: 'Frenzied Firedancer gave ally Glory 1 until end of turn.',
        }),
      ])
    );
  });

  it('lets Lingyi banish a unit and play it once from banish with Blitz', () => {
    const lingyi = abilityCard('IMP105', 'Lingyi', 'Renowned Unit');
    const unit = makeCard('banished-unit', 'player', {
      card: createTestCard({ id: 'banished-unit', name: 'Banished Unit', type: 'Unit', cost: 2, affinity: 'Solara' }),
    });
    const supplyOne = makeCard('supply-one');
    const supplyTwo = makeCard('supply-two');
    const base = makeState();
    const state = {
      ...base,
      zones: { ...base.zones, hand: [unit], staging: [lingyi], supply: [supplyOne, supplyTwo] },
    };
    const pending = triggerCardAbilities(state, 'onEnter', { source: lingyi, controller: 'player', zone: 'staging' });
    const banished = resolvePendingChoice(pending, [unit.instanceId]);
    expect('error' in banished ? null : banished.zones.banish[0]).toMatchObject({
      instanceId: unit.instanceId,
      lingyiPlayableFromBanishOnce: true,
      lingyiGrantedBlitz: true,
    });
    if ('error' in banished) return;
    const played = applyCardAction(banished, {
      owner: 'player',
      instanceId: unit.instanceId,
      fromZone: 'banish',
      toZone: 'staging',
    });
    expect(played.applied).toBe(true);
    expect(played.state.zones.staging.find((card) => card.instanceId === unit.instanceId)).toMatchObject({
      ready: true,
      lingyiPlayableFromBanishOnce: undefined,
    });
    expect(played.state.zones.supply.every((card) => !card.ready)).toBe(true);
  });

  it('exposes Hongzhen and Ruins Looter top cards for the turn and returns unused cards', () => {
    const hongzhen = makeCard('IMP102', 'player', {
      card: createTestCard({ id: 'IMP102', name: 'Hongzhen', type: 'Renowned Unit', affinity: 'Solara' }),
    });
    const looter = makeCard('IMP109', 'player', {
      card: createTestCard({ id: 'IMP109', name: 'Ruins Looter', type: 'Unit', attack: 4, health: 4, affinity: 'Solara' }),
    });
    const topOne = makeCard('top-one');
    const topTwo = makeCard('top-two');
    const topThree = makeCard('top-three');
    const defender = makeCard('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 0, health: 1 }),
    });
    const base = makeState();
    const controlled = resolveUnitTakesControlOfZone({
      ...base,
      zones: { ...base.zones, deck: [topOne], battlefieldLeft: [hongzhen] },
    }, 'battlefieldLeft');
    expect(controlled.zones.hand[0]).toMatchObject({
      instanceId: topOne.instanceId,
      solaraRevealedFromDeckUntilTurn: base.turn,
    });
    const cleaned = clearEndOfTurnDamage(controlled);
    expect(cleaned.zones.hand).toEqual([]);
    expect(cleaned.zones.deck[0]?.instanceId).toBe(topOne.instanceId);

    const looted = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, deck: [topTwo], staging: [looter], battlefieldLeft: [defender] },
    }, 'player', looter.instanceId, 'battlefieldLeft');
    expect('error' in looted ? null : looted.state.zones.hand[0]).toMatchObject({
      instanceId: topTwo.instanceId,
      solaraRevealedFromDeckUntilTurn: base.turn,
    });

    const captured = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, deck: [topThree], staging: [hongzhen], battlefieldLeft: [defender] },
    }, 'player', hongzhen.instanceId, 'battlefieldLeft');
    expect('error' in captured ? null : captured.state.zones.hand[0]).toMatchObject({
      instanceId: topThree.instanceId,
      solaraRevealedFromDeckUntilTurn: base.turn,
    });
    expect('error' in captured ? [] : captured.state.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suffix: 'Hongzhen revealed top-three; it may be played or used to extend supply this turn.',
        }),
      ])
    );
  });

  it('reveals top cards for Ruins Looter from printed text after destroying a defender', () => {
    const looter = makeCard('text-ruins-looter', 'player', {
      card: createTestCard({
        id: 'text-ruins-looter',
        name: 'Ruins Looter',
        type: 'Unit',
        attack: 4,
        health: 4,
        affinity: 'Solara',
        rulesText: 'Whenever this unit destroys a defending unit in combat, reveal the top card of your deck. Until end of turn, you may play it or use it to extend supply. (Extend supply can be done once per turn.)',
      }),
    });
    const top = makeCard('revealed-module', 'player', {
      card: createTestCard({ id: 'revealed-module', name: 'Revealed Module', type: 'Item', affinity: 'Solara' }),
    });
    const defender = makeCard('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 0, health: 1 }),
    });
    const base = makeState();
    const result = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, deck: [top], staging: [looter], battlefieldLeft: [defender] },
    }, 'player', looter.instanceId, 'battlefieldLeft');

    expect('error' in result ? null : result.state.zones.hand[0]).toMatchObject({
      instanceId: top.instanceId,
      solaraRevealedFromDeckUntilTurn: base.turn,
    });
    expect('error' in result ? [] : result.state.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suffix: 'Ruins Looter revealed Revealed Module; it may be played or used to extend supply this turn.',
        }),
      ])
    );
  });

  it('supports Flanking attacks from combat zones once per turn', () => {
    const flanker = makeCard('IMP102', 'player', {
      card: createTestCard({
        id: 'IMP102',
        name: 'Hongzhen',
        type: 'Renowned Unit',
        attack: 2,
        health: 5,
        rulesText: 'Flanking',
        affinity: 'Solara',
      }),
    });
    const defender = makeCard('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 5 }),
    });
    const base = makeState();
    const result = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [flanker], battlefieldCenter: [defender] },
    }, 'player', flanker.instanceId, 'battlefieldCenter');
    expect(result).not.toHaveProperty('error');
    if ('error' in result) return;
    expect(result.state.zones.battlefieldLeft.find((card) => card.instanceId === flanker.instanceId)).toMatchObject({
      ready: false,
      flankingAttackUsedTurn: base.turn,
    });
    const readied = readyCardsForOwner(result.state, 'player');
    expect(getBattlefieldAttackError(readied, 'player', flanker.instanceId, 'battlefieldCenter')).toContain('already attacked');
  });

  it('keeps Flanking attackers in their origin zone during the counter window and captures battlefield-to-battlefield', () => {
    const flanker = makeCard('IMP102', 'player', {
      card: createTestCard({
        id: 'IMP102',
        name: 'Hongzhen',
        type: 'Renowned Unit',
        attack: 5,
        health: 5,
        rulesText: 'Flanking',
        affinity: 'Solara',
      }),
    });
    const equipment = makeCard('equipment', 'player', {
      attachedToInstanceId: flanker.instanceId,
      card: createTestCard({ id: 'equipment', name: 'Equipment', type: 'Item Equipment', attack: 0, health: 0 }),
    });
    const defender = makeCard('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 0, health: 3 }),
    });
    const top = makeCard('top-card');
    const base = makeState();
    const declared = declareBattlefieldAttack({
      ...base,
      zones: { ...base.zones, deck: [top], battlefieldLeft: [flanker, equipment], battlefieldCenter: [defender] },
    }, 'player', flanker.instanceId, 'battlefieldCenter');

    expect('error' in declared ? null : declared.state.pendingCombat).toMatchObject({
      flankingOriginZone: 'battlefieldLeft',
    });
    expect('error' in declared ? [] : declared.state.zones.staging.map((card) => card.instanceId)).not.toContain(flanker.instanceId);
    expect('error' in declared ? [] : declared.state.zones.battlefieldLeft.map((card) => card.instanceId)).toEqual([
      flanker.instanceId,
      equipment.instanceId,
    ]);
    expect('error' in declared ? null : declared.state.log[0]).toMatchObject({
      prefix: 'Declared attack ',
      cardName: 'Hongzhen',
      suffix: ' from Battlefield 1 into Battlefield 2, targeting Defender. Counter priority opened.',
    });
    if ('error' in declared) return;

    const botPassed = passCounterPriority(declared.state, 'opponent');
    const playerPassed = 'error' in botPassed ? botPassed : passCounterPriority(botPassed.state, 'player');

    expect('error' in playerPassed ? null : playerPassed.resolvedCombat?.captured).toBe(true);
    expect('error' in playerPassed ? [] : playerPassed.state.zones.staging.map((card) => card.instanceId)).not.toContain(flanker.instanceId);
    expect('error' in playerPassed ? [] : playerPassed.state.zones.battlefieldLeft.map((card) => card.instanceId)).toEqual([]);
    expect('error' in playerPassed ? [] : playerPassed.state.zones.battlefieldCenter.map((card) => card.instanceId)).toEqual([
      flanker.instanceId,
      equipment.instanceId,
    ]);
    expect('error' in playerPassed ? undefined : playerPassed.state.zones.battlefieldCenter[0]?.flankingAttackUsedTurn).toBe(base.turn);
    expect('error' in playerPassed ? null : playerPassed.state.zones.hand[0]).toMatchObject({
      instanceId: top.instanceId,
      solaraRevealedFromDeckUntilTurn: base.turn,
    });
    expect('error' in playerPassed ? [] : playerPassed.state.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prefix: 'Flanked ',
          cardName: 'Hongzhen',
          suffix: ' from Battlefield 1 into Battlefield 2, fighting Defender.',
        }),
        expect.objectContaining({
          suffix: 'Hongzhen revealed top-card; it may be played or used to extend supply this turn.',
        }),
      ])
    );
  });

  it('makes Voracious Wyvern choose and declare its compulsory ready attack', () => {
    const wyvern = makeCard('IMP112', 'player', {
      ready: false,
      card: createTestCard({
        id: 'IMP112',
        name: 'Voracious Wyvern',
        type: 'Unit',
        rulesText: "Flanking. On Ready: If it's your turn, attack an enemy-controlled combat zone.",
        affinity: 'Solara',
      }),
    });
    const enemy = makeCard('enemy', 'opponent');
    const base = makeState();
    const pending = readyCardsForOwner({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [wyvern], battlefieldCenter: [enemy] },
    }, 'player');
    expect(pending.pendingChoice).toMatchObject({ kind: 'solaraTarget', effect: 'wyvernAttack' });
    const declared = resolvePendingChoice(pending, [enemy.instanceId]);
    expect('error' in declared ? null : declared.pendingCombat).toMatchObject({
      attackerInstanceId: wyvern.instanceId,
      targetZone: 'battlefieldCenter',
      defenderInstanceId: enemy.instanceId,
    });
  });

  it('applies Emberfang immunity, printed and equipment Glory, and Rally Point base stats in combat', () => {
    const assassin = makeCard('IMP099', 'player', {
      card: createTestCard({ id: 'IMP099', name: 'Emberfang Assassin', type: 'Unit', attack: 2, health: 1, affinity: 'Solara' }),
    });
    const defender = makeCard('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 9, health: 2 }),
    });
    const base = makeState();
    const immuneState = { ...base, zones: { ...base.zones, staging: [assassin], battlefieldLeft: [defender] } };
    const immuneCombat = resolveBattlefieldAttack(immuneState, 'player', assassin.instanceId, 'battlefieldLeft');
    expect('error' in immuneCombat ? null : immuneCombat.attackerDestroyed).toBe(false);

    const warrior = makeCard('IMP107', 'player', {
      card: createTestCard({ id: 'IMP107', name: 'Reckless Warrior', type: 'Unit', attack: 3, health: 3, affinity: 'Solara' }),
    });
    const glorybringer = makeCard('IMP122', 'player', {
      attachedToInstanceId: warrior.instanceId,
      card: createTestCard({ id: 'IMP122', name: 'Glorybringer', type: 'Item', attack: 0, health: 0, affinity: 'Solara' }),
    });
    const rally = makeCard('IMP124', 'player', {
      card: createTestCard({ id: 'IMP124', name: 'Ashfang Rally Point', type: 'Territory', affinity: 'Solara' }),
    });
    const weakDefender = makeCard('weak', 'opponent', {
      card: createTestCard({ id: 'weak', name: 'Weak Defender', type: 'Unit', attack: 0, health: 3 }),
    });
    const gloryState = {
      ...base,
      zones: { ...base.zones, staging: [warrior, glorybringer], battlefieldLeft: [weakDefender, rally] },
    };
    const declaredState = {
      ...gloryState,
      pendingCombat: {
        attackerOwner: 'player' as const,
        attackerInstanceId: warrior.instanceId,
        targetZone: 'battlefieldLeft' as const,
        defenderInstanceId: weakDefender.instanceId,
        priorityOwner: 'opponent' as const,
        lastPassedOwner: null,
        counterStack: [],
      },
    };
    expect(getCurrentUnitAttack(declaredState, warrior)).toBe(3);
    expect(getCurrentUnitHealth(declaredState, warrior)).toBe(3);
    const combat = resolveBattlefieldAttack(declaredState, 'player', warrior.instanceId, 'battlefieldLeft');
    expect('error' in combat ? null : combat.state.playerVictoryPoints).toBe(3);
  });

  it('awards Reckless Warrior Glory through the declared attack counter window path', () => {
    const warrior = makeCard('live-reckless-warrior', 'player', {
      card: createTestCard({
        id: 'live-reckless-warrior',
        name: 'Reckless Warrior',
        type: 'Unit',
        attack: 3,
        health: 2,
        affinity: 'Solara',
        rulesText: 'Glory 2 (Whenever this unit destroys a defending unit through combat damage, gain 2 victory points.)',
      }),
    });
    const defender = makeCard('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 0, health: 3 }),
    });
    const declared = declareBattlefieldAttack({
      ...makeState(),
      zones: { ...makeState().zones, staging: [warrior], battlefieldLeft: [defender] },
    }, 'player', warrior.instanceId, 'battlefieldLeft');
    expect('error' in declared ? null : declared.state.pendingCombat).toBeTruthy();

    const botPassed = 'error' in declared ? declared : passCounterPriority(declared.state, 'opponent');
    const playerPassed = 'error' in botPassed ? botPassed : passCounterPriority(botPassed.state, 'player');

    expect('error' in playerPassed ? null : playerPassed.resolvedCombat?.defenderDestroyed).toBe(true);
    expect('error' in playerPassed ? null : playerPassed.state.playerVictoryPoints).toBe(2);
    expect('error' in playerPassed ? [] : playerPassed.state.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ suffix: 'Reckless Warrior gained 2 victory points from Glory.' }),
      ])
    );
  });

  it('applies Solara Blitz, Vainglory Reaver Glory, and Varenthus Fortify', () => {
    for (const id of ['IMP104', 'IMP106', 'IMP114']) {
      const blitzUnit = makeCard(id, 'player', {
        ready: false,
        card: createTestCard({ id, name: id, type: 'Unit', rulesText: 'Blitz', affinity: 'Solara' }),
      });
      expect(prepareCardForZone(blitzUnit, 'staging').ready).toBe(true);
    }

    const reaver = makeCard('IMP110', 'player', {
      card: createTestCard({ id: 'IMP110', name: 'Vainglory Reaver', type: 'Unit', attack: 3, health: 3, affinity: 'Solara' }),
    });
    const defender = makeCard('glory-defender', 'opponent', {
      card: createTestCard({ id: 'glory-defender', name: 'Defender', type: 'Unit', attack: 0, health: 3 }),
    });
    const base = makeState();
    const gloryResult = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, staging: [reaver], battlefieldLeft: [defender] },
    }, 'player', reaver.instanceId, 'battlefieldLeft');
    expect('error' in gloryResult ? null : gloryResult.state.playerVictoryPoints).toBe(1);

    const attacker = makeCard('attacker');
    const varenthus = makeCard('IMP111', 'opponent', {
      ready: false,
      card: createTestCard({ id: 'IMP111', name: 'Varenthus', type: 'Renowned Unit', rulesText: 'Fortify', affinity: 'Solara' }),
    });
    const discard = makeCard('discard', 'opponent', {
      card: createTestCard({ id: 'discard', name: 'Solara Card', type: 'Unit', affinity: 'Solara' }),
    });
    const declared = declareBattlefieldAttack({
      ...base,
      zones: { ...base.zones, staging: [attacker], battlefieldLeft: [varenthus] },
      opponentZones: { ...base.opponentZones, hand: [discard] },
    }, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? null : declared.state.opponentZones.hand).toEqual([]);
    expect('error' in declared ? null : declared.state.zones.battlefieldLeft[0]?.ready).toBe(true);
  });

  it('retreats a unit for Rockjaw and resolves Varenthus sacrifices and destruction', () => {
    const rockjaw = abilityCard('IMP108', 'Rockjaw', 'Renowned Unit');
    const ally = makeCard('ally');
    const enemy = makeCard('enemy', 'opponent');
    const varenthus = abilityCard('IMP111', 'Varenthus', 'Renowned Unit');
    const base = makeState();
    const rockjawState = {
      ...base,
      zones: { ...base.zones, staging: [rockjaw], battlefieldLeft: [ally] },
    };
    const rockjawPending = triggerCardAbilities(rockjawState, 'onPlay', { source: rockjaw, controller: 'player', zone: 'staging' });
    const moved = resolvePendingChoice(rockjawPending, [ally.instanceId]);
    expect('error' in moved ? null : moved.zones.battlefieldLeft[0]?.instanceId).toBe(rockjaw.instanceId);
    expect('error' in moved ? null : moved.zones.staging[0]?.instanceId).toBe(ally.instanceId);

    const varenthusState = {
      ...base,
      zones: { ...base.zones, staging: [ally], battlefieldLeft: [enemy, varenthus] },
    };
    const sacrificePending = triggerCardAbilities(varenthusState, 'onAttack', { source: varenthus, controller: 'player', zone: 'battlefieldLeft' });
    const destroyPending = resolvePendingChoice(sacrificePending, [ally.instanceId]);
    expect('error' in destroyPending ? null : destroyPending.pendingChoice).toMatchObject({ kind: 'solaraTarget', effect: 'varenthusDestroy' });
    const destroyed = 'error' in destroyPending ? destroyPending : resolvePendingChoice(destroyPending, [enemy.instanceId]);
    expect('error' in destroyed ? null : destroyed.opponentZones.graveyard.some((card) => card.instanceId === enemy.instanceId)).toBe(true);
  });

  it('triggers Varenthus on Attack when attacking an empty battlefield', () => {
    const varenthus = abilityCard('IMP111', 'Varenthus', 'Renowned Unit');
    const ally = makeCard('ally');
    const enemy = makeCard('enemy', 'opponent');
    const base = makeState();
    const result = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, staging: [varenthus, ally], battlefieldCenter: [enemy] },
    }, 'player', varenthus.instanceId, 'battlefieldLeft');

    expect('error' in result ? null : result.state.pendingChoice).toMatchObject({
      kind: 'solaraTarget',
      effect: 'varenthusSacrifice',
      availableInstanceIds: [ally.instanceId],
      contextInstanceIds: [enemy.instanceId],
    });
    expect('error' in result ? null : result.state.zones.battlefieldLeft[0]?.instanceId).toBe(varenthus.instanceId);
  });

  it('handles Wyrmscar Dragon damage and Zhufeng readying', () => {
    const dragon = abilityCard('IMP113', 'Wyrmscar Dragon', 'Unit');
    const zhufeng = makeCard('IMP114', 'player', { ready: false });
    const defender = makeCard('defender', 'opponent');
    const base = makeState();
    const state = { ...base, zones: { ...base.zones, staging: [dragon], battlefieldLeft: [defender, zhufeng] } };
    const burned = triggerCardAbilities(state, 'onAttack', {
      source: dragon,
      controller: 'player',
      zone: 'battlefieldLeft',
      targets: [{ type: 'card', instanceId: defender.instanceId }],
    });
    expect(burned.zones.battlefieldLeft.find((card) => card.instanceId === defender.instanceId)?.damage).toBe(2);
    expect(triggerCardAbilities(state, 'onDefend', { source: zhufeng, controller: 'player', zone: 'battlefieldLeft' }).zones.battlefieldLeft.find((card) => card.instanceId === zhufeng.instanceId)?.ready).toBe(true);
  });

  it('resolves Brand, Mark of Death, Rocket Barrage, Ransack, and Lava Flow', () => {
    const brand = abilityCard('IMP115', 'Brand', 'Tactic');
    const lava = abilityCard('IMP116', 'Lava Flow', 'Tactic');
    const mark = abilityCard('IMP117', 'Mark of Death', 'Tactic');
    const ransack = abilityCard('IMP118', 'Ransack', 'Tactic');
    const rocket = abilityCard('IMP119', 'Rocket Barrage', 'Tactic');
    const fragile = makeCard('fragile', 'opponent', { card: createTestCard({ id: 'fragile', name: 'Fragile', type: 'Unit', health: 1 }) });
    const marked = makeCard('marked', 'opponent', { card: createTestCard({ id: 'marked', name: 'Marked', type: 'Unit', health: 9 }) });
    const stagingAlly = makeCard('staging-ally', 'player', { card: createTestCard({ id: 'staging-ally', name: 'Ally', type: 'Unit', health: 2 }) });
    const territory = makeCard('territory', 'player', { card: createTestCard({ id: 'territory', name: 'Territory', type: 'Territory' }) });
    const item = makeCard('item', 'opponent', { card: createTestCard({ id: 'item', name: 'Item', type: 'Item' }) });
    const base = makeState();
    const state = {
      ...base,
      zones: { ...base.zones, staging: [stagingAlly], battlefieldLeft: [fragile, territory, item], battlefieldCenter: [marked] },
    };

    const brandPending = triggerCardAbilities(state, 'onPlay', { source: brand, controller: 'player', zone: 'graveyard' });
    const branded = resolvePendingChoice(brandPending, [fragile.instanceId]);
    expect('error' in branded ? null : branded.playerVictoryPoints).toBe(1);

    const markPending = triggerCardAbilities(state, 'onPlay', { source: mark, controller: 'player', zone: 'graveyard' });
    const markedState = resolvePendingChoice(markPending, [marked.instanceId]);
    expect('error' in markedState ? null : markedState.zones.battlefieldCenter[0]).toMatchObject({
      destroyOnNextDamageUntilTurn: base.turn,
    });
    expect('error' in markedState ? [] : markedState.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suffix: 'Mark of Death marked Marked; the next time it takes damage this turn, destroy it.',
        }),
      ])
    );
    const rocketPending = 'error' in markedState ? markedState : triggerCardAbilities(markedState, 'onPlay', { source: rocket, controller: 'player', zone: 'graveyard' });
    const rocketed = 'error' in rocketPending ? rocketPending : resolvePendingChoice(rocketPending, [marked.instanceId]);
    expect('error' in rocketed ? null : rocketed.opponentZones.graveyard.some((card) => card.instanceId === marked.instanceId)).toBe(true);

    const luxDamage = abilityCard('IMP043', 'Farsight Operative', 'Unit');
    luxDamage.card.affinity = 'Lux';
    const crossAffinityMarked = makeCard('cross-marked', 'opponent', {
      card: createTestCard({ id: 'cross-marked', name: 'Cross Marked', type: 'Unit', health: 99 }),
    });
    const crossState = {
      ...state,
      zones: { ...state.zones, battlefieldCenter: [crossAffinityMarked] },
    };
    const crossMarkPending = triggerCardAbilities(crossState, 'onPlay', { source: mark, controller: 'player', zone: 'graveyard' });
    const crossMarked = resolvePendingChoice(crossMarkPending, [crossAffinityMarked.instanceId]);
    const luxPending = 'error' in crossMarked ? crossMarked : triggerCardAbilities(crossMarked, 'onEnter', { source: luxDamage, controller: 'player', zone: 'staging' });
    const luxResolved = 'error' in luxPending ? luxPending : resolvePendingChoice(luxPending, [crossAffinityMarked.instanceId]);
    expect('error' in luxResolved ? null : luxResolved.opponentZones.graveyard.some((card) => card.instanceId === crossAffinityMarked.instanceId)).toBe(true);

    const ransackPending = triggerCardAbilities(state, 'onPlay', { source: ransack, controller: 'player', zone: 'graveyard' });
    const ransacked = resolvePendingChoice(ransackPending, [item.instanceId]);
    expect('error' in ransacked ? null : ransacked.opponentZones.graveyard.some((card) => card.instanceId === item.instanceId)).toBe(true);

    const lavaPending = triggerCardAbilities(state, 'onPlay', { source: lava, controller: 'player', zone: 'graveyard' });
    const flowed = resolvePendingChoice(lavaPending, [territory.instanceId]);
    expect('error' in flowed ? null : flowed.zones.graveyard.some((card) => card.instanceId === stagingAlly.instanceId)).toBe(true);
  });

  it('resolves Uprising and Enrage choices', () => {
    const uprising = abilityCard('IMP120', 'Uprising', 'Tactic');
    const enrage = abilityCard('IMP121', 'Enrage', 'Tactic');
    const ally = makeCard('ally', 'player', { ready: false });
    const enemy = makeCard('enemy', 'opponent');
    const base = makeState();
    const state = { ...base, zones: { ...base.zones, staging: [ally], battlefieldLeft: [enemy] } };
    const uprisingPending = triggerCardAbilities(state, 'onPlay', { source: uprising, controller: 'player', zone: 'graveyard' });
    const exhaustPending = resolvePendingChoice(uprisingPending, [ally.instanceId]);
    expect('error' in exhaustPending ? null : exhaustPending.pendingChoice).toMatchObject({ effect: 'uprisingExhaust' });
    const exhausted = 'error' in exhaustPending ? exhaustPending : resolvePendingChoice(exhaustPending, [enemy.instanceId]);
    expect('error' in exhausted ? null : exhausted.zones.battlefieldLeft[0]?.ready).toBe(false);
    expect('error' in exhausted ? null : exhausted.zones.staging[0]?.temporaryAttackBonus).toBe(2);

    const enragePending = triggerCardAbilities(state, 'onPlay', { source: enrage, controller: 'player', zone: 'graveyard' });
    const enraged = resolvePendingChoice(enragePending, [ally.instanceId]);
    expect('error' in enraged ? null : enraged.zones.staging[0]).toMatchObject({ ready: true, temporaryAttackBonus: 1 });
  });

  it('returns Vengeance when its attacking host dies', () => {
    const attacker = makeCard('attacker', 'player', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 1 }),
    });
    const vengeance = makeCard('IMP123', 'player', {
      attachedToInstanceId: attacker.instanceId,
      card: createTestCard({ id: 'IMP123', name: 'Vengeance', type: 'Item', affinity: 'Solara' }),
    });
    const defender = makeCard('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 3 }),
    });
    const base = makeState();
    const result = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, staging: [attacker, vengeance], battlefieldLeft: [defender] },
    }, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in result ? null : result.state.pendingChoice).toMatchObject({
      kind: 'solaraTarget',
      effect: 'vengeanceReturn',
      optional: true,
    });
    if ('error' in result) return;
    const returned = resolvePendingChoice(result.state, [vengeance.instanceId]);
    expect('error' in returned ? null : returned.zones.hand.some((card) => card.instanceId === vengeance.instanceId)).toBe(true);
  });

  it('adds Ruins counters on scoring and resolves Wyrmscar Peaks once during turn advance', () => {
    const scorer = makeCard('scorer');
    const ruins = makeCard('IMP125', 'player', {
      progressCounters: 2,
      card: createTestCard({ id: 'IMP125', name: 'Ruins', type: 'Territory', affinity: 'Solara' }),
    });
    const peak = makeCard('IMP126', 'player', {
      card: createTestCard({ id: 'IMP126', name: 'Wyrmscar Peaks', type: 'Territory', affinity: 'Solara' }),
    });
    const cheap = makeCard('cheap');
    const supply = makeCard('supply');
    const base = makeState();
    const scored = scoreBattlefieldVictoryPoints({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [scorer, ruins] },
    }, 'player');
    expect(scored.playerVictoryPoints).toBe(3);
    expect(scored.zones.graveyard.some((card) => card.instanceId === ruins.instanceId)).toBe(true);
    expect(scored.log.some((entry) => entry.suffix === 'Ruins reached 3 dig counters; you gain 2 victory points and sacrifice it.')).toBe(true);

    const pending = advanceToNextTurn({
      ...base,
      zones: { ...base.zones, supply: [supply], battlefieldLeft: [cheap, peak] },
    });
    expect(pending.pendingChoice).toMatchObject({ kind: 'solaraTarget', effect: 'peaksRetreat', resumeTurnAdvance: true });
    const retreated = resolvePendingChoice(pending, [cheap.instanceId]);
    expect('error' in retreated ? null : retreated.activePlayer).toBe('opponent');
    expect('error' in retreated ? null : retreated.zones.staging.some((card) => card.instanceId === cheap.instanceId)).toBe(true);
  });
});
