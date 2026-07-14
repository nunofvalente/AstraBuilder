import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getRegisteredCardAbilities } from './card-abilities';
import { applyCardAction } from './game-actions';
import {
  activateCardAbility,
  advanceToNextTurn,
  buildInitialGameState,
  declareBattlefieldAttack,
  getModifiedPlayCost,
  getCounterTargetOptions,
  passCounterPriority,
  playCounterCard,
  readyCardsForOwner,
  removeUnitFromPlay,
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
  return { id: 'caelum-test', title: 'Caelum Test', cardCount: 0, entries: [] };
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
      affinity: 'Caelum',
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
    card: createTestCard({ id, name, type, rulesText, affinity: 'Caelum' }),
  });
}

describe('Caelum card abilities', () => {
  it('registers every Caelum card from IMP064 through IMP095', () => {
    for (let number = 64; number <= 95; number += 1) {
      const id = `IMP${String(number).padStart(3, '0')}`;
      expect(getRegisteredCardAbilities(id), id).not.toBeNull();
    }
  });

  it('gives Synthal Vampire +1/+1 until end of turn when you play a tactic', () => {
    const synthal = makeUnit('IMP077', 'player', {
      card: createTestCard({
        id: 'IMP077',
        name: 'Synthal Vampire',
        type: 'Unit',
        attack: 2,
        health: 3,
        affinity: 'Caelum',
      }),
    });
    const tactic = makeUnit('tactic', 'player', {
      card: createTestCard({
        id: 'test-tactic',
        name: 'Test Tactic',
        type: 'Tactic',
        cost: 0,
        affinity: 'Caelum',
      }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        hand: [tactic],
        staging: [synthal],
      },
    };

    const result = applyCardAction(state, {
      owner: 'player',
      instanceId: tactic.instanceId,
      fromZone: 'hand',
      toZone: 'graveyard',
    });

    expect(result.applied).toBe(true);
    const buffed = result.state.zones.staging.find((card) => card.instanceId === synthal.instanceId);
    expect(buffed).toMatchObject({
      temporaryAttackBonus: 1,
      temporaryHealthBonus: 1,
      temporaryStatsExpireAfterTurn: state.turn,
    });
  });

  it('draws for Courier Drone and Complex Stratagem', () => {
    const courier = makeCard('IMP065', 'Courier Drone', 'Unit', 'On Death: Draw a card.');
    const stratagem = makeCard('IMP084', 'Complex Stratagem', 'Tactic', 'Draw two cards.');
    const drawOne = makeUnit('draw-one');
    const drawTwo = makeUnit('draw-two');
    const drawThree = makeUnit('draw-three');
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, deck: [drawOne, drawTwo, drawThree] },
    };

    const afterCourier = triggerCardAbilities(state, 'onDeath', {
      source: courier,
      controller: 'player',
      zone: 'graveyard',
    });
    expect(afterCourier.zones.hand.map((card) => card.instanceId)).toEqual([drawOne.instanceId]);

    const afterStratagem = triggerCardAbilities(afterCourier, 'onPlay', {
      source: stratagem,
      controller: 'player',
      zone: 'graveyard',
    });
    expect(afterStratagem.zones.hand.map((card) => card.instanceId)).toEqual([
      drawOne.instanceId,
      drawTwo.instanceId,
      drawThree.instanceId,
    ]);
  });

  it('reduces Caelum unit costs and activates Genesis influence', () => {
    const genesis = makeUnit('IMP066', 'player', {
      card: createTestCard({ id: 'IMP066', name: 'Genesis III', type: 'Renowned Unit', affinity: 'Caelum' }),
    });
    const ally = makeUnit('ally', 'player', {
      card: createTestCard({ id: 'ally', name: 'Ally', type: 'Unit', cost: 4, influence: 1, affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, staging: [genesis, ally] },
    };

    expect(getModifiedPlayCost(state, 'player', ally.card)).toBe(3);

    const supply = [0, 1, 2].map((index) => makeUnit(`supply-${index}`));
    const playState = {
      ...makeState(),
      zones: { ...makeState().zones, hand: [ally], staging: [genesis], supply },
    };
    const played = applyCardAction(playState, {
      owner: 'player',
      instanceId: ally.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
    });
    expect(played.applied).toBe(true);
    expect(played.state.zones.staging.some((card) => card.instanceId === ally.instanceId)).toBe(true);
    expect(played.state.zones.supply.filter((card) => card.ready)).toHaveLength(0);

    const activated = activateCardAbility(state, 'player', genesis.instanceId, ally.instanceId);
    expect(activated).not.toHaveProperty('error');
    if ('state' in activated) {
      expect(activated.state.zones.staging.find((card) => card.instanceId === genesis.instanceId)?.ready).toBe(false);
      expect(activated.state.zones.staging.find((card) => card.instanceId === ally.instanceId)?.temporaryInfluenceBonus).toBe(1);
    }
  });

  it('handles Caelum target choices for bounce, lockdown, and tactic damage', () => {
    const leviathan = makeCard('IMP064', 'Cloudbreach Leviathan', 'Unit', "On Enter: Return target unit to owner's hand.");
    const enforcer = makeCard('IMP071', 'Lockdown Enforcer', 'Unit', 'On Enter: exhaust target enemy unit.');
    const confession = makeCard('IMP085', 'Forced Confession', 'Tactic', 'Deal 1 damage to target enemy unit. Draw a card.');
    const enemy = makeUnit('enemy', 'opponent', { ready: true });
    const draw = makeUnit('draw');
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, deck: [draw] },
      opponentZones: { ...makeState().opponentZones, staging: [enemy] },
    };

    const bouncePending = triggerCardAbilities(state, 'onEnter', {
      source: leviathan,
      controller: 'player',
      zone: 'staging',
    });
    expect(bouncePending.pendingChoice).toMatchObject({ kind: 'caelumTarget', effect: 'leviathanReturn' });
    const bounced = resolvePendingChoice(bouncePending, [enemy.instanceId]);
    expect('error' in bounced ? null : bounced.opponentZones.hand[0]?.instanceId).toBe(enemy.instanceId);
    expect('error' in bounced ? [] : bounced.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suffix: "Cloudbreach Leviathan: returned enemy to its owner's hand.",
        }),
      ])
    );

    const token = makeUnit('token', 'opponent', {
      card: createTestCard({ id: 'token', name: 'Drone', type: 'Unit', subtype: 'Drone Token', rarity: 'Token', affinity: 'Neutral' }),
    });
    const tokenState = {
      ...makeState(),
      opponentZones: { ...makeState().opponentZones, staging: [token] },
    };
    const tokenBouncePending = triggerCardAbilities(tokenState, 'onEnter', {
      source: leviathan,
      controller: 'player',
      zone: 'staging',
    });
    const bouncedToken = resolvePendingChoice(tokenBouncePending, [token.instanceId]);
    expect('error' in bouncedToken ? null : bouncedToken.opponentZones.staging).toEqual([]);
    expect('error' in bouncedToken ? null : bouncedToken.opponentZones.hand).toEqual([]);

    const lockdownPending = triggerCardAbilities(state, 'onEnter', {
      source: enforcer,
      controller: 'player',
      zone: 'staging',
    });
    const locked = resolvePendingChoice(lockdownPending, [enemy.instanceId]);
    const afterReady = 'error' in locked ? locked : readyCardsForOwner(locked, 'opponent');
    expect('error' in afterReady ? null : afterReady.opponentZones.staging[0]?.ready).toBe(false);
    expect('error' in afterReady ? null : afterReady.opponentZones.staging[0]?.skipNextReady).toBe(false);

    const confessionPending = triggerCardAbilities(state, 'onPlay', {
      source: confession,
      controller: 'player',
      zone: 'graveyard',
    });
    const confessed = resolvePendingChoice(confessionPending, [enemy.instanceId]);
    expect('error' in confessed ? null : confessed.opponentZones.staging[0]?.damage).toBe(1);
    expect('error' in confessed ? null : confessed.zones.hand[0]?.instanceId).toBe(draw.instanceId);
    expect('error' in confessed ? null : confessed.log[0]?.suffix).toBe('Forced Confession: dealt 1 damage to enemy and drew a card.');
  });

  it('handles Airdrop, Wingshield Transport, and Inquisition Drone choices', () => {
    const airdrop = makeCard('IMP082', 'Airdrop', 'Tactic', 'Look at the top card of your deck.');
    const transport = makeCard('IMP081', 'Wingshield Transport', 'Unit', 'On Enter: return supply to hand.');
    const drone = makeCard('IMP068', 'Inquisition Drone', 'Unit Drone', 'On Enter: reveal facedown territory.');
    const top = makeUnit('top-card');
    const supply = makeUnit('supply-card', 'player', { ready: false });
    const facedownFortuna = makeUnit('IMP061', 'opponent', {
      faceDown: true,
      card: createTestCard({ id: 'IMP061', name: 'Fortuna Bank', type: 'Territory', affinity: 'Lux' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        deck: [top],
        supply: [supply],
        battlefieldLeft: [facedownFortuna],
      },
    };

    const airdropPending = triggerCardAbilities(state, 'onPlay', { source: airdrop, controller: 'player', zone: 'graveyard' });
    const airdropped = resolvePendingChoice(airdropPending, [top.instanceId]);
    expect('error' in airdropped ? null : airdropped.zones.hand[0]?.instanceId).toBe(top.instanceId);
    expect('error' in airdropped ? null : airdropped.log[0]).toMatchObject({
      privateToOwner: 'player',
      redactedSuffix: 'Airdrop: put the top card into hand.',
    });

    const handAirdrop = makeUnit('IMP082', 'player', {
      card: createTestCard({ id: 'IMP082', name: 'Airdrop', type: 'Tactic', cost: 0, affinity: 'Caelum' }),
    });
    const playedAirdrop = applyCardAction({
      ...state,
      zones: { ...state.zones, hand: [handAirdrop], deck: [top] },
    }, {
      owner: 'player',
      instanceId: handAirdrop.instanceId,
      fromZone: 'hand',
      toZone: 'graveyard',
    });
    expect(playedAirdrop.applied).toBe(true);
    expect(playedAirdrop.state.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'airdrop',
      availableInstanceIds: [top.instanceId],
    });

    const supplyTop = makeUnit('supply-top', 'player', { ready: true });
    const supplyPending = triggerCardAbilities({
      ...state,
      zones: { ...state.zones, deck: [supplyTop], supply: [] },
    }, 'onPlay', { source: airdrop, controller: 'player', zone: 'graveyard' });
    const suppliedByAirdrop = resolvePendingChoice(supplyPending, []);
    expect('error' in suppliedByAirdrop ? null : suppliedByAirdrop.zones.supply[0]).toMatchObject({
      instanceId: supplyTop.instanceId,
      ready: false,
    });
    expect('error' in suppliedByAirdrop ? null : suppliedByAirdrop.log[0]).toMatchObject({
      privateToOwner: 'player',
      redactedSuffix: 'Airdrop: moved the top card to supply exhausted.',
    });

    const transportPending = triggerCardAbilities(state, 'onEnter', { source: transport, controller: 'player', zone: 'staging' });
    const supplied = resolvePendingChoice(transportPending, [supply.instanceId]);
    expect('error' in supplied ? null : supplied.zones.hand[0]?.instanceId).toBe(supply.instanceId);

    const revealPending = triggerCardAbilities(state, 'onEnter', { source: drone, controller: 'player', zone: 'staging' });
    const revealed = resolvePendingChoice(revealPending, [facedownFortuna.instanceId]);
    expect('error' in revealed ? null : revealed.zones.battlefieldLeft).toEqual([]);
    expect('error' in revealed ? null : revealed.opponentZones.hand[0]?.instanceId).toBe(facedownFortuna.instanceId);
    expect('error' in revealed ? null : revealed.opponentTemporarySupply).toBe(3);
    expect('error' in revealed ? null : advanceToNextTurn(revealed).opponentTemporarySupply).toBe(0);
  });

  it('lets Abandon the Lab choose a friendly unit and return it after it dies', () => {
    const abandon = makeUnit('IMP087', 'player', {
      card: createTestCard({ id: 'IMP087', name: 'Abandon the Lab', type: 'Tactic', cost: 0, affinity: 'Caelum' }),
    });
    const target = makeUnit('target', 'player', {
      card: createTestCard({ id: 'target', name: 'Target Unit', type: 'Unit', attack: 2, health: 2, affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        hand: [abandon],
        staging: [target],
      },
    };

    const played = applyCardAction(state, {
      owner: 'player',
      instanceId: abandon.instanceId,
      fromZone: 'hand',
      toZone: 'graveyard',
    });

    expect(played.applied).toBe(true);
    expect(played.state.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'abandonLab',
      availableInstanceIds: [target.instanceId],
    });

    const marked = resolvePendingChoice(played.state, [target.instanceId]);
    expect(marked).not.toHaveProperty('error');
    if ('error' in marked) return;
    expect(marked.zones.staging[0]).toMatchObject({
      instanceId: target.instanceId,
      abandonLabBanishOnDeathUntilTurn: state.turn,
      abandonLabReturnController: 'player',
      abandonLabReturnAfterTurn: state.turn + 1,
    });

    const removed = removeUnitFromPlay(marked, target.instanceId);
    expect(removed).not.toHaveProperty('error');
    if ('error' in removed) return;
    expect(removed.state.zones.banish[0]?.instanceId).toBe(target.instanceId);
    expect(removed.state.zones.graveyard.some((card) => card.instanceId === target.instanceId)).toBe(false);

    const returned = runTurnStart({
      ...removed.state,
      activePlayer: 'player',
      turn: state.turn + 2,
      hasFirstPlayerSkippedDraw: true,
    });
    expect(returned.zones.banish.some((card) => card.instanceId === target.instanceId)).toBe(false);
    expect(returned.zones.staging[0]).toMatchObject({
      instanceId: target.instanceId,
      ready: false,
      skipNextReady: false,
      abandonLabBanishOnDeathUntilTurn: undefined,
      abandonLabReturnController: undefined,
      abandonLabReturnAfterTurn: undefined,
    });
  });

  it('targets and saves a battlefield unit when Abandon the Lab is played as a counter', () => {
    const abandon = makeUnit('IMP087', 'player', {
      card: createTestCard({
        id: 'IMP087',
        name: 'Abandon the Lab',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        affinity: 'Caelum',
      }),
    });
    const defender = makeUnit('counter-target', 'player', {
      card: createTestCard({ id: 'counter-target', name: 'Counter Target', type: 'Unit', attack: 0, health: 1 }),
    });
    const attacker = makeUnit('attacker', 'opponent', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3 }),
    });
    const baseState = makeState();
    const combatState = {
      ...baseState,
      activePlayer: 'opponent' as const,
      zones: {
        ...baseState.zones,
        hand: [abandon],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...baseState.opponentZones,
        staging: [attacker],
      },
    };

    const declared = declareBattlefieldAttack(combatState, 'opponent', attacker.instanceId, 'battlefieldLeft');
    expect(declared).not.toHaveProperty('error');
    if ('error' in declared) return;
    expect(getCounterTargetOptions(declared.state, abandon).map((target) => target.instanceId)).toEqual([defender.instanceId]);
    expect(playCounterCard(declared.state, 'player', abandon.instanceId)).toEqual({
      error: 'Choose a target for Abandon the Lab.',
    });

    const played = playCounterCard(declared.state, 'player', abandon.instanceId, {
      targetInstanceId: defender.instanceId,
    });
    expect(played).not.toHaveProperty('error');
    if ('error' in played) return;
    expect(played.state.pendingCombat?.counterStack).toEqual([
      expect.objectContaining({
        instanceId: abandon.instanceId,
        selectedAbilityTargetInstanceIds: [defender.instanceId],
      }),
    ]);
    expect(played.state.zones.battlefieldLeft[0]).not.toHaveProperty('abandonLabBanishOnDeathUntilTurn');
    const opponentPassed = passCounterPriority(played.state, 'opponent');
    expect(opponentPassed).not.toHaveProperty('error');
    if ('error' in opponentPassed) return;

    expect(opponentPassed.state.pendingChoice).toBeNull();
    expect(opponentPassed.state.zones.banish.find((card) => card.instanceId === defender.instanceId)).toMatchObject({
      abandonLabReturnController: 'player',
      abandonLabReturnAfterTurn: combatState.turn + 1,
    });
    expect(opponentPassed.state.zones.graveyard.some((card) => card.instanceId === defender.instanceId)).toBe(false);

    const returned = runTurnStart({
      ...opponentPassed.state,
      activePlayer: 'player',
      turn: combatState.turn + 1,
    });
    expect(returned.zones.banish.some((card) => card.instanceId === defender.instanceId)).toBe(false);
    expect(returned.zones.staging.find((card) => card.instanceId === defender.instanceId)).toMatchObject({
      ready: false,
      abandonLabReturnController: undefined,
      abandonLabReturnAfterTurn: undefined,
    });
  });

  it('returns an Abandon the Lab unit on the same numbered turn when its controller is second player', () => {
    const abandon = makeUnit('IMP087', 'player', {
      card: createTestCard({ id: 'IMP087', name: 'Abandon the Lab', type: 'Tactic', cost: 0, affinity: 'Caelum' }),
    });
    const target = makeUnit('target-second-player', 'player', {
      card: createTestCard({ id: 'target-second-player', name: 'Second Player Target', type: 'Unit', attack: 2, health: 2, affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      activePlayer: 'opponent' as const,
      firstPlayer: 'opponent' as const,
      turn: 2,
      zones: {
        ...makeState().zones,
        staging: [target],
      },
    };

    const pending = triggerCardAbilities(state, 'onPlay', {
      source: abandon,
      controller: 'player',
      zone: null,
    });
    expect(pending.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'abandonLab',
      availableInstanceIds: [target.instanceId],
    });

    const marked = resolvePendingChoice(pending, [target.instanceId]);
    expect(marked).not.toHaveProperty('error');
    if ('error' in marked) return;
    expect(marked.zones.staging[0]).toMatchObject({
      instanceId: target.instanceId,
      abandonLabBanishOnDeathUntilTurn: 2,
      abandonLabReturnController: 'player',
      abandonLabReturnAfterTurn: 2,
    });

    const removed = removeUnitFromPlay(marked, target.instanceId);
    expect(removed).not.toHaveProperty('error');
    if ('error' in removed) return;
    expect(removed.state.zones.banish[0]?.instanceId).toBe(target.instanceId);

    const returned = runTurnStart({
      ...removed.state,
      activePlayer: 'player',
      firstPlayer: 'opponent',
      turn: 2,
      hasFirstPlayerSkippedDraw: true,
    });
    expect(returned.zones.banish.some((card) => card.instanceId === target.instanceId)).toBe(false);
    expect(returned.zones.staging.find((card) => card.instanceId === target.instanceId)).toMatchObject({
      instanceId: target.instanceId,
      ready: false,
    });
  });

  it('returns an Abandon the Lab unit exhausted through full turn advance', () => {
    const target = makeUnit('advance-target', 'player', {
      ready: true,
      card: createTestCard({ id: 'advance-target', name: 'Advance Target', type: 'Unit', attack: 2, health: 2, affinity: 'Caelum' }),
    });
    const removed = {
      ...makeState(),
      activePlayer: 'opponent' as const,
      firstPlayer: 'player' as const,
      turn: 3,
      hasFirstPlayerSkippedDraw: true,
      zones: {
        ...makeState().zones,
      },
      opponentZones: {
        ...makeState().opponentZones,
      },
    };
    const banishedState = {
      ...removed,
      zones: {
        ...removed.zones,
        banish: [{
          ...target,
          ready: true,
          abandonLabReturnController: 'player' as const,
          abandonLabReturnAfterTurn: 4,
        }],
      },
    };

    const advanced = advanceToNextTurn(banishedState);
    expect(advanced.activePlayer).toBe('player');
    expect(advanced.zones.banish.some((card) => card.instanceId === target.instanceId)).toBe(false);
    expect(advanced.zones.staging.find((card) => card.instanceId === target.instanceId)).toMatchObject({
      instanceId: target.instanceId,
      ready: false,
    });
  });

  it('handles Master Strategist draw-discard and Renata protection and activation', () => {
    const strategist = makeCard('IMP072', 'Master Strategist', 'Unit', 'On Enter: draw then discard.');
    const renata = makeUnit('IMP073', 'player', {
      card: createTestCard({ id: 'IMP073', name: 'Renata', type: 'Renowned Unit', affinity: 'Caelum' }),
    });
    const drone = makeUnit('drone', 'player', {
      ready: false,
      card: createTestCard({ id: 'drone', name: 'Drone', type: 'Unit Drone', subtype: 'Drone', attack: 1, health: 1, affinity: 'Caelum' }),
    });
    const supplyOne = makeUnit('supply-one');
    const supplyTwo = makeUnit('supply-two');
    const draw = makeUnit('draw');
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        deck: [draw],
        staging: [renata, drone],
        supply: [supplyOne, supplyTwo],
      },
    };

    const strategistPending = triggerCardAbilities(state, 'onEnter', {
      source: strategist,
      controller: 'player',
      zone: 'staging',
    });
    expect(strategistPending.pendingChoice).toMatchObject({ kind: 'caelumTarget', effect: 'strategistDiscard' });
    const discarded = resolvePendingChoice(strategistPending, [draw.instanceId]);
    expect('error' in discarded ? null : discarded.zones.graveyard[0]?.instanceId).toBe(draw.instanceId);

    const protectedState = triggerCardAbilities(state, 'onEnter', {
      source: renata,
      controller: 'player',
      zone: 'staging',
    });
    const protectedDrone = resolvePendingChoice(protectedState, [drone.instanceId]);
    expect('error' in protectedDrone ? null : protectedDrone.zones.staging.find((card) => card.instanceId === drone.instanceId)?.protectedFromEnemyTacticsUntilTurn).toBe(state.turn);

    const activated = activateCardAbility(state, 'player', renata.instanceId, drone.instanceId);
    expect(activated).not.toHaveProperty('error');
    if ('state' in activated) {
      const buffed = activated.state.zones.staging.find((card) => card.instanceId === drone.instanceId);
      expect(buffed).toMatchObject({ ready: true, temporaryAttackBonus: 2, temporaryHealthBonus: 2 });
      expect(activated.state.zones.supply.every((card) => !card.ready)).toBe(true);
    }
  });

  it('handles Valeria, Void Warp, Rebound, and Valrathian Dreadnought movement and removal', () => {
    const valeria = makeCard('IMP078', 'Valeria', 'Renowned Unit', 'On Enter: force retreat. On Attack: exhaust.');
    const rebound = makeCard('IMP086', 'Rebound', 'Tactic', 'Return target unit.');
    const voidWarp = makeCard('IMP088', 'Void Warp', 'Tactic', 'Put target combat unit on top of deck.');
    const dreadnought = makeUnit('IMP079', 'player', {
      card: createTestCard({ id: 'IMP079', name: 'Valrathian Dreadnought', type: 'Unit Vehicle', affinity: 'Caelum' }),
    });
    const target = makeUnit('target', 'opponent');
    const supplyOne = makeUnit('supply-one');
    const supplyTwo = makeUnit('supply-two');
    const supplyThree = makeUnit('supply-three');
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [target],
        battlefieldCenter: [dreadnought],
        supply: [supplyOne, supplyTwo, supplyThree],
      },
    };

    const valeriaPending = triggerCardAbilities(state, 'onEnter', { source: valeria, controller: 'player', zone: 'staging' });
    const retreated = resolvePendingChoice(valeriaPending, [target.instanceId]);
    expect('error' in retreated ? null : retreated.opponentZones.staging[0]?.instanceId).toBe(target.instanceId);

    const valeriaAttackPending = triggerCardAbilities(state, 'onAttack', { source: valeria, controller: 'player', zone: 'battlefieldLeft' });
    const exhausted = resolvePendingChoice(valeriaAttackPending, [target.instanceId]);
    expect('error' in exhausted ? null : exhausted.zones.battlefieldLeft[0]?.ready).toBe(false);
    expect('error' in exhausted ? [] : exhausted.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suffix: 'Valeria: exhausted target on attack.',
        }),
      ])
    );

    const reboundPending = triggerCardAbilities(state, 'onPlay', { source: rebound, controller: 'player', zone: 'graveyard' });
    const rebounded = resolvePendingChoice(reboundPending, [target.instanceId]);
    expect('error' in rebounded ? null : rebounded.opponentZones.hand[0]?.instanceId).toBe(target.instanceId);

    const warpedPending = triggerCardAbilities(state, 'onPlay', { source: voidWarp, controller: 'player', zone: 'graveyard' });
    const warped = resolvePendingChoice(warpedPending, [target.instanceId]);
    expect('error' in warped ? null : warped.opponentZones.deck[0]?.instanceId).toBe(target.instanceId);

    const token = makeUnit('token', 'opponent', {
      card: createTestCard({ id: 'token', name: 'Drone', type: 'Unit', subtype: 'Drone Token', rarity: 'Token', affinity: 'Neutral' }),
    });
    const tokenState = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [token],
      },
    };
    const tokenWarpPending = triggerCardAbilities(tokenState, 'onPlay', { source: voidWarp, controller: 'player', zone: 'graveyard' });
    const tokenWarped = resolvePendingChoice(tokenWarpPending, [token.instanceId]);
    expect('error' in tokenWarped ? null : tokenWarped.zones.battlefieldLeft).toEqual([]);
    expect('error' in tokenWarped ? null : tokenWarped.opponentZones.deck.some((card) => card.instanceId === token.instanceId)).toBe(false);

    const destroyed = activateCardAbility(state, 'player', dreadnought.instanceId, target.instanceId);
    expect(destroyed).not.toHaveProperty('error');
    if ('state' in destroyed) {
      expect(destroyed.state.zones.battlefieldLeft).toEqual([]);
      expect(destroyed.state.opponentZones.graveyard[0]?.instanceId).toBe(target.instanceId);
    }
  });

  it('handles Breach the Dam board reset behavior', () => {
    const breach = makeCard('IMP083', 'Breach the Dam', 'Tactic', 'Destroy all territories and bounce combat cards.');
    const unit = makeUnit('unit');
    const item = makeUnit('item', 'player', {
      attachedToInstanceId: unit.instanceId,
      card: createTestCard({ id: 'item', name: 'Item', type: 'Item Equipment' }),
    });
    const territory = makeUnit('territory', 'opponent', {
      card: createTestCard({ id: 'territory', name: 'Territory', type: 'Territory' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [unit, item, territory],
      },
    };

    const breached = triggerCardAbilities(state, 'onPlay', {
      source: breach,
      controller: 'player',
      zone: 'graveyard',
    });
    expect(breached.zones.battlefieldLeft).toEqual([]);
    expect(breached.zones.hand[0]?.instanceId).toBe(unit.instanceId);
    expect(breached.zones.graveyard.some((card) => card.instanceId === item.instanceId)).toBe(true);
    expect(breached.opponentZones.graveyard[0]?.instanceId).toBe(territory.instanceId);
  });

  it('applies score locks from Skyfortress and Repulsive Experiment', () => {
    const skyfortress = makeUnit('IMP067', 'player', {
      card: createTestCard({ id: 'IMP067', name: 'Imperial Skyfortress', type: 'Unit Vehicle', influence: 2, affinity: 'Caelum' }),
    });
    const other = makeUnit('other', 'player', {
      card: createTestCard({ id: 'other', name: 'Other', type: 'Unit', influence: 3 }),
    });
    const experiment = makeUnit('IMP074', 'player', {
      card: createTestCard({ id: 'IMP074', name: 'Repulsive Experiment', type: 'Unit', influence: 1, affinity: 'Caelum' }),
    });
    const enemy = makeUnit('enemy', 'opponent', { card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', influence: 4 }) });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [skyfortress],
        battlefieldCenter: [other],
      },
    };

    expect(scoreBattlefieldVictoryPoints(state, 'player').playerVictoryPoints).toBe(2);
    expect(scoreBattlefieldVictoryPoints({
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [skyfortress],
        battlefieldRight: [enemy],
      },
    }, 'opponent').opponentVictoryPoints).toBe(0);

    const locked = triggerCardAbilities({
      ...makeState(),
      zones: { ...makeState().zones, battlefieldRight: [enemy] },
    }, 'onDeath', {
      source: experiment,
      controller: 'player',
      zone: 'battlefieldRight',
    });
    expect(scoreBattlefieldVictoryPoints(locked, 'opponent').opponentVictoryPoints).toBe(0);
    expect(runTurnStart({ ...locked, activePlayer: 'player' }).scoreLocks).toEqual([]);
  });

  it('offers to put Freight Module into supply exhausted when equipped unit scores', () => {
    const scoringUnit = makeUnit('scoring-unit', 'player', {
      card: createTestCard({ id: 'scoring-unit', name: 'Scoring Unit', type: 'Unit', influence: 1 }),
    });
    const freightModule = makeUnit('IMP091', 'player', {
      attachedToInstanceId: scoringUnit.instanceId,
      card: createTestCard({ id: 'IMP091', name: 'Freight Module', type: 'Item Equipment', influence: 1, affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [scoringUnit, freightModule],
      },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'player');
    expect(scored.playerVictoryPoints).toBe(2);
    expect(scored.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'freightModuleSupply',
      availableInstanceIds: [freightModule.instanceId],
    });

    const supplied = resolvePendingChoice(scored, [freightModule.instanceId]);
    expect('error' in supplied ? supplied.error : null).toBeNull();
    if ('error' in supplied) return;
    expect(supplied.zones.battlefieldLeft.some((card) => card.instanceId === freightModule.instanceId)).toBe(false);
    expect(supplied.zones.supply[0]).toMatchObject({
      instanceId: freightModule.instanceId,
      ready: false,
      attachedToInstanceId: null,
    });
  });

  it('offers each Freight Module trigger before finishing score advancement', () => {
    const scoringUnit = makeUnit('scorer', 'player');
    const firstModule = makeUnit('IMP091', 'player', {
      instanceId: 'freight-one',
      attachedToInstanceId: scoringUnit.instanceId,
      card: createTestCard({ id: 'IMP091', name: 'Freight Module', type: 'Item Equipment', influence: 1, affinity: 'Caelum' }),
    });
    const secondModule = makeUnit('IMP091', 'player', {
      instanceId: 'freight-two',
      attachedToInstanceId: scoringUnit.instanceId,
      card: createTestCard({ id: 'IMP091', name: 'Freight Module', type: 'Item Equipment', influence: 1, affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [scoringUnit, firstModule, secondModule],
      },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'player');
    expect(scored.pendingChoice).toMatchObject({
      effect: 'freightModuleSupply',
      availableInstanceIds: ['freight-one'],
      remainingScoreItemTriggerIds: ['freight-two'],
    });

    const firstResolved = resolvePendingChoice(scored, ['freight-one']);
    expect('error' in firstResolved ? null : firstResolved.pendingChoice).toMatchObject({
      effect: 'freightModuleSupply',
      availableInstanceIds: ['freight-two'],
      remainingScoreItemTriggerIds: [],
    });

    const secondResolved = 'error' in firstResolved ? firstResolved : resolvePendingChoice(firstResolved, ['freight-two']);
    expect('error' in secondResolved ? null : secondResolved.pendingChoice).toBeNull();
    expect('error' in secondResolved ? [] : secondResolved.zones.supply.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(['freight-one', 'freight-two'])
    );
  });

  it('queues a different item on-score trigger after Freight Module', () => {
    const scoringUnit = makeUnit('mixed-item-scorer');
    const freightModule = makeUnit('IMP091', 'player', {
      attachedToInstanceId: scoringUnit.instanceId,
      card: createTestCard({ id: 'IMP091', name: 'Freight Module', type: 'Item Equipment', affinity: 'Caelum' }),
    });
    const warBanner = makeUnit('IMP164', 'player', {
      attachedToInstanceId: scoringUnit.instanceId,
      card: createTestCard({ id: 'IMP164', name: 'War Banner', type: 'Item Equipment' }),
    });
    const topCard = makeUnit('top-unit');
    const base = makeState();
    const state = {
      ...base,
      zones: {
        ...base.zones,
        deck: [topCard],
        battlefieldLeft: [scoringUnit, freightModule, warBanner],
      },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'player');
    expect(scored.pendingChoice).toMatchObject({ effect: 'freightModuleSupply' });

    const freightResolved = resolvePendingChoice(scored, [freightModule.instanceId]);
    expect('error' in freightResolved ? null : freightResolved.pendingChoice).toMatchObject({
      effect: 'warBannerReveal',
      sourceInstanceId: warBanner.instanceId,
    });
  });

  it('returns a tactic and sacrifices Archive Ruins when your unit scores its zone', () => {
    const scoringUnit = makeUnit('archive-scorer', 'player', {
      card: createTestCard({ id: 'archive-scorer', name: 'Archive Scorer', type: 'Unit', influence: 1 }),
    });
    const archiveRuins = makeUnit('IMP092', 'player', {
      card: createTestCard({ id: 'IMP092', name: 'Archive Ruins', type: 'Territory', affinity: 'Caelum' }),
    });
    const tactic = makeUnit('archive-tactic', 'player', {
      card: createTestCard({ id: 'archive-tactic', name: 'Archived Tactic', type: 'Tactic', affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [scoringUnit, archiveRuins],
        graveyard: [tactic],
      },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'player');
    expect(scored.playerVictoryPoints).toBe(1);
    expect(scored.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'archiveReturn',
      availableInstanceIds: [tactic.instanceId],
    });

    const returned = resolvePendingChoice(scored, [tactic.instanceId]);
    expect('error' in returned ? returned.error : null).toBeNull();
    if ('error' in returned) return;
    expect(returned.zones.hand[0]?.instanceId).toBe(tactic.instanceId);
    expect(returned.zones.graveyard.some((card) => card.instanceId === archiveRuins.instanceId)).toBe(true);
    expect(returned.zones.battlefieldLeft.some((card) => card.instanceId === archiveRuins.instanceId)).toBe(false);
  });

  it('uses Archive Ruins automatically for the bot when its unit scores', () => {
    const scoringUnit = makeUnit('bot-archive-scorer', 'opponent', {
      card: createTestCard({ id: 'bot-archive-scorer', name: 'Bot Archive Scorer', type: 'Unit', influence: 1 }),
    });
    const archiveRuins = makeUnit('IMP092', 'opponent', {
      card: createTestCard({ id: 'IMP092', name: 'Archive Ruins', type: 'Territory', affinity: 'Caelum' }),
    });
    const tactic = makeUnit('bot-archive-tactic', 'opponent', {
      card: createTestCard({ id: 'bot-archive-tactic', name: 'Bot Archived Tactic', type: 'Tactic', affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [scoringUnit, archiveRuins],
      },
      opponentZones: {
        ...makeState().opponentZones,
        graveyard: [tactic],
      },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'opponent');

    expect(scored.opponentVictoryPoints).toBe(1);
    expect(scored.pendingChoice).toBeNull();
    expect(scored.opponentZones.hand[0]?.instanceId).toBe(tactic.instanceId);
    expect(scored.opponentZones.graveyard.some((card) => card.instanceId === archiveRuins.instanceId)).toBe(true);
    expect(scored.zones.battlefieldLeft.some((card) => card.instanceId === archiveRuins.instanceId)).toBe(false);
  });

  it('handles combat hooks for Radar Beacon and Levitar Cavalry', () => {
    const attacker = makeUnit('IMP069', 'player', {
      card: createTestCard({ id: 'IMP069', name: 'Levitar Cavalry', type: 'Unit', attack: 5, health: 3, affinity: 'Caelum' }),
    });
    const defender = makeUnit('defender', 'opponent', {
      ready: false,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2 }),
    });
    const beacon = makeUnit('IMP094', 'opponent', {
      card: createTestCard({ id: 'IMP094', name: 'Radar Beacon', type: 'Territory', affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [attacker],
        battlefieldLeft: [defender, beacon],
      },
    };

    const declared = declareBattlefieldAttack(state, 'player', attacker.instanceId, 'battlefieldLeft');
    expect(declared).not.toHaveProperty('error');
    if ('state' in declared) {
      expect(declared.state.zones.battlefieldLeft.find((card) => card.instanceId === defender.instanceId)?.ready).toBe(true);
      const resolved = resolveBattlefieldAttack(declared.state, 'player', attacker.instanceId, 'battlefieldLeft');
      expect(resolved).not.toHaveProperty('error');
      if ('state' in resolved) {
        expect(resolved.state.zones.staging.some((card) => card.instanceId === attacker.instanceId)).toBe(true);
        expect(resolved.state.zones.battlefieldLeft.some((card) => card.instanceId === attacker.instanceId)).toBe(false);
      }
    }
  });

  it("returns Drifter's Necklace and gains a victory point after taking an unoccupied zone", () => {
    const strategist = makeUnit('IMP072', 'player', {
      card: createTestCard({ id: 'IMP072', name: 'Master Strategist', type: 'Unit', attack: 2, health: 2, affinity: 'Caelum' }),
    });
    const necklace = makeUnit('IMP090', 'player', {
      attachedToInstanceId: strategist.instanceId,
      card: createTestCard({ id: 'IMP090', name: "Drifter's Necklace", type: 'Item Equipment', attack: 1, health: 1, influence: 0, affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [strategist, necklace],
        battlefieldLeft: [],
      },
    };

    const resolved = resolveBattlefieldAttack(state, 'player', strategist.instanceId, 'battlefieldLeft');
    expect(resolved).not.toHaveProperty('error');
    if ('state' in resolved) {
      expect(resolved.captured).toBe(true);
      expect(resolved.state.playerVictoryPoints).toBe(1);
      expect(resolved.state.zones.hand[0]?.instanceId).toBe(necklace.instanceId);
      expect(resolved.state.zones.battlefieldLeft.some((card) => card.instanceId === necklace.instanceId)).toBe(false);
      expect(resolved.state.zones.battlefieldLeft.some((card) => card.instanceId === strategist.instanceId)).toBe(true);
    }
  });

  it('triggers Archive Ruins when Wingshield Transport captures its zone', () => {
    const transport = makeUnit('IMP081', 'player', {
      card: createTestCard({ id: 'IMP081', name: 'Wingshield Transport', type: 'Unit Vehicle', attack: 1, health: 3, influence: 1, affinity: 'Caelum' }),
    });
    const archiveRuins = makeUnit('IMP092', 'player', {
      card: createTestCard({ id: 'IMP092', name: 'Archive Ruins', type: 'Territory', affinity: 'Caelum' }),
    });
    const tactic = makeUnit('grave-tactic', 'player', {
      card: createTestCard({ id: 'grave-tactic', name: 'Grave Tactic', type: 'Tactic', affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        staging: [transport],
        graveyard: [tactic],
        battlefieldLeft: [archiveRuins],
      },
    };

    const resolved = resolveBattlefieldAttack(state, 'player', transport.instanceId, 'battlefieldLeft');

    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) return;
    expect(resolved.captured).toBe(true);
    expect(resolved.state.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'archiveReturn',
      availableInstanceIds: [tactic.instanceId],
    });

    const returned = resolvePendingChoice(resolved.state, [tactic.instanceId]);
    expect(returned).not.toHaveProperty('error');
    if ('error' in returned) return;
    expect(returned.zones.hand[0]?.instanceId).toBe(tactic.instanceId);
    expect(returned.zones.graveyard.some((card) => card.instanceId === archiveRuins.instanceId)).toBe(true);
    expect(returned.zones.battlefieldLeft.some((card) => card.instanceId === archiveRuins.instanceId)).toBe(false);
  });

  it('makes the opponent discard when they kill a unit equipped with Disruption Staff', () => {
    const defender = makeUnit('defender', 'player', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2, influence: 1 }),
    });
    const staff = makeUnit('IMP089', 'player', {
      attachedToInstanceId: defender.instanceId,
      card: createTestCard({ id: 'IMP089', name: 'Disruption Staff', type: 'Item Equipment', attack: 1, health: 1, influence: 1, affinity: 'Caelum' }),
    });
    const attacker = makeUnit('attacker', 'opponent', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 6, health: 3, influence: 1 }),
    });
    const botHandCard = makeUnit('bot-hand-card', 'opponent');
    const state = {
      ...makeState(),
      activePlayer: 'opponent' as const,
      zones: { ...makeState().zones, battlefieldLeft: [defender, staff] },
      opponentZones: { ...makeState().opponentZones, staging: [attacker], hand: [botHandCard] },
    };

    const result = resolveBattlefieldAttack(state, 'opponent', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) return;
    expect(result.state.opponentZones.hand).toEqual([]);
    expect(result.state.opponentZones.graveyard.some((card) => card.instanceId === botHandCard.instanceId)).toBe(true);
  });

  it('makes an enemy discard when they score a Jamming Tower zone', () => {
    const scoringUnit = makeUnit('scoring-unit', 'opponent', {
      card: createTestCard({ id: 'scoring-unit', name: 'Scoring Unit', type: 'Unit', influence: 1 }),
    });
    const jammingTower = makeUnit('IMP093', 'player', {
      card: createTestCard({ id: 'IMP093', name: 'Jamming Tower', type: 'Territory', affinity: 'Caelum' }),
    });
    const botHandCard = makeUnit('bot-score-discard', 'opponent');
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, battlefieldLeft: [scoringUnit, jammingTower] },
      opponentZones: { ...makeState().opponentZones, hand: [botHandCard] },
    };

    const scored = scoreBattlefieldVictoryPoints(state, 'opponent');

    expect(scored.opponentVictoryPoints).toBe(1);
    expect(scored.opponentZones.hand).toEqual([]);
    expect(scored.opponentZones.graveyard.some((card) => card.instanceId === botHandCard.instanceId)).toBe(true);
  });

  it('fires Skybreaker Gunship on retreat', () => {
    const gunship = makeUnit('IMP076', 'player', {
      card: createTestCard({ id: 'IMP076', name: 'Skybreaker Gunship', type: 'Unit', affinity: 'Caelum' }),
    });
    const enemy = makeUnit('enemy', 'opponent', { card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', health: 3 }) });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, battlefieldLeft: [gunship] },
      opponentZones: { ...makeState().opponentZones, staging: [enemy] },
    };

    const retreated = applyCardAction(state, {
      owner: 'player',
      instanceId: gunship.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'staging',
    });
    expect(retreated.state.pendingChoice).toMatchObject({ kind: 'caelumTarget', effect: 'skybreakerDamage' });
    const resolved = resolvePendingChoice(retreated.state, [enemy.instanceId]);
    expect('error' in resolved ? null : resolved.opponentZones.staging[0]?.damage).toBe(2);
  });

  it('fires Skybreaker Gunship when Valeria forces it to retreat', () => {
    const valeria = makeCard('IMP078', 'Valeria, Dragoon Knight', 'Renowned Unit', 'On Enter: force retreat target unit.');
    const gunship = makeUnit('IMP076', 'player', {
      card: createTestCard({ id: 'IMP076', name: 'Skybreaker Gunship', type: 'Unit', affinity: 'Caelum' }),
    });
    const enemy = makeUnit('enemy', 'opponent', {
      card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', health: 3 }),
    });
    const state = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        battlefieldLeft: [gunship],
      },
      opponentZones: {
        ...makeState().opponentZones,
        staging: [enemy],
      },
    };

    const valeriaPending = triggerCardAbilities(state, 'onEnter', {
      source: valeria,
      controller: 'player',
      zone: 'staging',
    });
    const retreated = resolvePendingChoice(valeriaPending, [gunship.instanceId]);
    expect('error' in retreated ? null : retreated.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'skybreakerDamage',
      sourceInstanceId: gunship.instanceId,
    });
    const resolved = 'error' in retreated ? retreated : resolvePendingChoice(retreated, [enemy.instanceId]);
    expect('error' in resolved ? null : resolved.opponentZones.staging[0]?.damage).toBe(2);
  });

  it('draws an extra card for each player while Wandering Sky Merchant is in play', () => {
    const merchant = makeUnit('IMP080', 'player', {
      card: createTestCard({ id: 'IMP080', name: 'Wandering Sky Merchant', type: 'Unit', affinity: 'Caelum' }),
    });
    const drawOne = makeUnit('draw-one');
    const drawTwo = makeUnit('draw-two');
    const state = {
      ...makeState(),
      activePlayer: 'player' as const,
      firstPlayer: 'opponent' as const,
      zones: { ...makeState().zones, deck: [drawOne, drawTwo], staging: [merchant] },
    };

    expect(runTurnStart(state).zones.hand.map((card) => card.instanceId)).toEqual([
      drawOne.instanceId,
      drawTwo.instanceId,
    ]);
  });

  it('lets the player choose where Unyielding Storm moves at turn start and sweeps its zone at end of turn', () => {
    const storm = makeUnit('IMP095', 'player', {
      card: createTestCard({ id: 'IMP095', name: 'Unyielding Storm', type: 'Territory', affinity: 'Caelum' }),
    });
    const friendlyUnit = makeUnit('friendly');
    const enemyTerritory = makeUnit('enemy-territory', 'opponent', {
      card: createTestCard({ id: 'enemy-territory', name: 'Enemy Territory', type: 'Territory' }),
    });
    const base = makeState();
    const startPending = runTurnStart({
      ...base,
      activePlayer: 'player',
      firstPlayer: 'opponent',
      zones: {
        ...base.zones,
        battlefieldLeft: [storm],
      },
    });
    expect(startPending.pendingChoice).toMatchObject({
      kind: 'caelumZone',
      effect: 'unyieldingStormMove',
      availableZoneIds: ['battlefieldCenter', 'battlefieldRight'],
    });
    const startMoved = resolvePendingChoice(startPending, ['battlefieldRight']);
    if ('error' in startMoved) {
      throw new Error(startMoved.error);
    }
    expect(startMoved.zones.battlefieldLeft.some((card) => card.instanceId === storm.instanceId)).toBe(false);
    expect(startMoved.zones.battlefieldRight.some((card) => card.instanceId === storm.instanceId)).toBe(true);
    expect(startMoved.pendingChoice).toBeNull();

    const endPending = advanceToNextTurn({
      ...base,
      zones: {
        ...base.zones,
        battlefieldLeft: [storm, friendlyUnit, enemyTerritory],
      },
    });
    expect(endPending.pendingChoice).toMatchObject({ kind: 'caelumTarget', effect: 'unyieldingStormSweep' });
    const swept = resolvePendingChoice(endPending, [storm.instanceId]);
    expect('error' in swept ? null : swept.zones.hand.some((card) => card.instanceId === friendlyUnit.instanceId)).toBe(true);
    expect('error' in swept ? null : swept.opponentZones.hand.some((card) => card.instanceId === enemyTerritory.instanceId)).toBe(true);
    expect('error' in swept ? null : swept.zones.graveyard.some((card) => card.instanceId === storm.instanceId)).toBe(true);
  });

  it('can decline Unyielding Storm without reopening the end-turn prompt', () => {
    const storm = makeUnit('IMP095', 'player', {
      card: createTestCard({ id: 'IMP095', name: 'Unyielding Storm', type: 'Territory', affinity: 'Caelum' }),
    });
    const unit = makeUnit('unit');
    const base = makeState();
    const pending = advanceToNextTurn({
      ...base,
      zones: {
        ...base.zones,
        battlefieldLeft: [storm, unit],
      },
    });
    const declined = resolvePendingChoice(pending, []);
    expect('error' in declined ? null : declined.pendingChoice).toBeNull();
    expect('error' in declined ? null : declined.activePlayer).toBe('opponent');
  });

  it('keeps Caelum scoring choices resumable during turn advance', () => {
    const experiment = makeUnit('IMP074', 'player', {
      card: createTestCard({ id: 'IMP074', name: 'Repulsive Experiment', type: 'Unit', influence: 1, affinity: 'Caelum' }),
    });
    const state = {
      ...makeState(),
      zones: { ...makeState().zones, battlefieldLeft: [experiment] },
    };

    expect(advanceToNextTurn(state).activePlayer).toBe('opponent');
  });
});
