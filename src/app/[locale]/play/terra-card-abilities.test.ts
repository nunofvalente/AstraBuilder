import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getRegisteredCardAbilities } from './card-abilities';
import { applyCardAction } from './game-actions';
import { applyTerraEndTurnAbilities } from './terra-card-ability-handlers';
import {
  activateCardAbility,
  advanceToNextTurn,
  buildInitialGameState,
  declareBattlefieldAttack,
  getBattlefieldAttackError,
  getCounterTargetOptions,
  getCurrentUnitAttack,
  getCurrentUnitHealth,
  passCounterPriority,
  playCounterCard,
  resolveBattlefieldAttack,
  resolvePendingChoice,
  scoreBattlefieldVictoryPoints,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type SavedDeck,
} from './game-rules';

function deck(): SavedDeck {
  return { id: 'terra-test', title: 'Terra Test', cardCount: 0, entries: [] };
}

function state(): GameState {
  return {
    ...buildInitialGameState(deck(), deck()),
    phase: 'main',
    activePlayer: 'player',
    firstPlayer: 'player',
    hasFirstPlayerSkippedDraw: true,
    log: [],
  };
}

function card(id: string, owner: 'player' | 'opponent' = 'player', overrides: Partial<GameCardInstance> = {}): GameCardInstance {
  return {
    instanceId: `${owner}-${id}`,
    owner,
    card: overrides.card ?? createTestCard({ id, name: id, type: 'Unit', cost: 2, attack: 2, health: 3, influence: 1, affinity: 'Terra' }),
    ready: overrides.ready ?? true,
    faceDown: overrides.faceDown ?? false,
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
    ...overrides,
  };
}

function source(id: string, name: string, type: string): GameCardInstance {
  return card(id, 'player', { card: createTestCard({ id, name, type, cost: 0, affinity: 'Terra' }) });
}

describe('Terra card abilities', () => {
  it('registers every Terra card from IMP127 through IMP158', () => {
    for (let number = 127; number <= 158; number += 1) {
      const id = `IMP${number}`;
      expect(getRegisteredCardAbilities(id), id).not.toBeNull();
    }
    expect(getRegisteredCardAbilities('IMP163')).not.toBeNull();
  });

  it('targets an enemy combat unit for Shadowveil Hunter and deals 1 damage on enter', () => {
    const hunter = card('IMP163', 'player', {
      card: createTestCard({
        id: 'IMP163',
        name: 'Shadowveil Hunter',
        type: 'Unit',
        rulesText: 'Swift. On Enter: Deal 1 damage to target enemy unit in a combat zone.',
      }),
    });
    const enemy = card('enemy', 'opponent', {
      card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', health: 3 }),
    });
    const ally = card('ally', 'player');
    const current = {
      ...state(),
      pendingCombat: {
        attackerInstanceId: ally.instanceId,
        attackerOwner: 'player' as const,
        defenderInstanceId: enemy.instanceId,
        targetZone: 'battlefieldLeft' as const,
        priorityOwner: 'player' as const,
        lastPassedOwner: null,
        counterStack: [],
      },
      zones: { ...state().zones, hand: [hunter], battlefieldLeft: [enemy], staging: [ally] },
    };
    expect(getCounterTargetOptions(current, hunter).map((target) => target.instanceId)).toEqual([enemy.instanceId]);

    const pending = triggerCardAbilities(current, 'onEnter', {
      source: hunter,
      controller: 'player',
      zone: 'staging',
    });
    expect(pending.pendingChoice).toMatchObject({
      kind: 'terraTarget',
      effect: 'shadowveilDamage',
      availableInstanceIds: [enemy.instanceId],
    });

    const resolved = resolvePendingChoice(pending, [enemy.instanceId]);
    expect('error' in resolved ? null : resolved.zones.battlefieldLeft[0]?.damage).toBe(1);
  });

  it('does not let Shadowveil Hunter counter an attacker entering an empty battlefield', () => {
    const attacker = card('attacker', 'opponent', {
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 3 }),
    });
    const hunter = card('IMP163', 'player', {
      card: createTestCard({
        id: 'IMP163',
        name: 'Shadowveil Hunter',
        type: 'Unit',
        cost: 0,
        rulesText: 'Swift. On Enter: Deal 1 damage to target enemy unit in a combat zone.',
      }),
    });
    const base = state();
    const declared = declareBattlefieldAttack(
      {
        ...base,
        activePlayer: 'opponent',
        zones: { ...base.zones, hand: [hunter] },
        opponentZones: { ...base.opponentZones, staging: [attacker] },
      },
      'opponent',
      attacker.instanceId,
      'battlefieldLeft'
    );
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) return;

    expect(declared.pendingCombat).toBeNull();
    expect(declared.resolvedCombat?.captured).toBe(true);
    const played = playCounterCard(declared.state, 'player', hunter.instanceId, {
      targetInstanceId: attacker.instanceId,
    });
    expect(played).toEqual({
      error: 'Counter cards can only be played during a counter window.',
    });
    expect(declared.state.zones.battlefieldLeft.find((unit) => unit.instanceId === attacker.instanceId)?.damage).toBe(0);
    expect(declared.state.zones.hand.find((unit) => unit.instanceId === hunter.instanceId)).toBeTruthy();
  });

  it('applies Impede from units, Caltrops, and Escape Route and heals surviving Akeno', () => {
    const akeno = card('IMP127', 'player', {
      damage: 2,
      card: createTestCard({ id: 'IMP127', name: 'Akeno', type: 'Renowned Unit', attack: 4, health: 5, affinity: 'Terra' }),
    });
    const defender = card('IMP128', 'opponent', {
      card: createTestCard({ id: 'IMP128', name: 'Canopy Stalker', type: 'Unit', attack: 0, health: 3, affinity: 'Terra' }),
    });
    const caltrops = card('IMP152', 'opponent', {
      attachedToInstanceId: defender.instanceId,
      card: createTestCard({ id: 'IMP152', name: 'Caltrops', type: 'Item', attack: 0, health: 0, affinity: 'Terra' }),
    });
    const route = card('IMP157', 'opponent', {
      card: createTestCard({ id: 'IMP157', name: 'Escape Route', type: 'Territory', affinity: 'Terra' }),
    });
    const base = state();
    const result = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, staging: [akeno], battlefieldLeft: [defender, caltrops, route] },
    }, 'player', akeno.instanceId, 'battlefieldLeft');
    expect('error' in result ? null : result.defenderDestroyed).toBe(false);

    const weak = { ...defender, card: createTestCard({ id: 'weak', name: 'Weak', type: 'Unit', attack: 2, health: 1 }) };
    const healed = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, staging: [akeno], battlefieldLeft: [weak] },
    }, 'player', akeno.instanceId, 'battlefieldLeft');
    expect('error' in healed ? null : healed.state.zones.battlefieldLeft.find((unit) => unit.instanceId === akeno.instanceId)?.damage).toBe(0);
  });

  it('includes Escape Route in the current attack shown during combat', () => {
    const attacker = card('attacker', 'player', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 4, health: 4 }),
    });
    const defender = card('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 4 }),
    });
    const route = card('IMP157', 'opponent', {
      card: createTestCard({ id: 'IMP157', name: 'Escape Route', type: 'Territory' }),
    });
    const base = state();
    const declared = declareBattlefieldAttack({
      ...base,
      zones: { ...base.zones, staging: [attacker], battlefieldLeft: [defender, route] },
    }, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) return;

    expect(getCurrentUnitAttack(declared.state, attacker)).toBe(2);
    const faceDownState = {
      ...declared.state,
      zones: {
        ...declared.state.zones,
        battlefieldLeft: declared.state.zones.battlefieldLeft.map((instance) =>
          instance.instanceId === route.instanceId ? { ...instance, faceDown: true } : instance
        ),
      },
    };
    expect(getCurrentUnitAttack(faceDownState, attacker)).toBe(4);
  });

  it('plays Gaia cards for free and puts Gaia on the bottom of the deck on death', () => {
    const gaia = source('IMP130', 'Gaia', 'Renowned Unit');
    const freeUnit = card('free-unit', 'player', { card: createTestCard({ id: 'free-unit', name: 'Free Unit', type: 'Unit', cost: 7, affinity: 'Terra' }) });
    const base = state();
    const pending = triggerCardAbilities({ ...base, zones: { ...base.zones, hand: [freeUnit], staging: [gaia] } }, 'onPlay', { source: gaia, controller: 'player', zone: 'staging' });
    const played = resolvePendingChoice(pending, [freeUnit.instanceId]);
    expect('error' in played ? null : played.zones.staging.some((unit) => unit.instanceId === freeUnit.instanceId)).toBe(true);

    const deathState = { ...base, zones: { ...base.zones, graveyard: [gaia] } };
    const returned = triggerCardAbilities(deathState, 'onDeath', { source: gaia, controller: 'player', zone: 'battlefieldLeft' });
    expect(returned.zones.graveyard).toEqual([]);
    expect(returned.zones.deck.at(-1)?.instanceId).toBe(gaia.instanceId);
  });

  it('resolves Grove Shaman top-three selection', () => {
    const shaman = source('IMP131', 'Grove Shaman', 'Unit');
    const nonUnit = card('tactic', 'player', { card: createTestCard({ id: 'tactic', name: 'Tactic', type: 'Tactic' }) });
    const unit = card('unit');
    const third = card('third', 'player', { card: createTestCard({ id: 'third', name: 'Third', type: 'Territory' }) });
    const base = state();
    const pending = triggerCardAbilities({ ...base, zones: { ...base.zones, deck: [nonUnit, unit, third] } }, 'onEnter', { source: shaman, controller: 'player', zone: 'staging' });
    const picked = resolvePendingChoice(pending, [unit.instanceId]);
    expect('error' in picked ? null : picked.zones.hand[0]?.instanceId).toBe(unit.instanceId);
    expect('error' in picked ? null : picked.zones.deck.map((item) => item.instanceId)).toEqual([nonUnit.instanceId, third.instanceId]);
  });

  it('enforces Terra Provoke and exhausts enemy combat units with King Beneath the Canopy', () => {
    const attacker = card('attacker');
    const provoke = card('IMP142', 'opponent');
    const normal = card('normal', 'opponent');
    const king = source('IMP133', 'King Beneath the Canopy', 'Unit');
    const base = state();
    const board = { ...base, zones: { ...base.zones, staging: [attacker], battlefieldLeft: [provoke], battlefieldCenter: [normal] } };
    expect(getBattlefieldAttackError(board, 'player', attacker.instanceId, 'battlefieldCenter')).toContain('Provoke');
    const exhausted = triggerCardAbilities(board, 'onEnter', { source: king, controller: 'player', zone: 'staging' });
    expect(exhausted.zones.battlefieldLeft[0]?.ready).toBe(false);
    expect(exhausted.zones.battlefieldCenter[0]?.ready).toBe(false);
  });

  it('retreats ready Raven after scoring and damages with Sundering Wyrm', () => {
    const raven = card('IMP136', 'player', {
      card: createTestCard({ id: 'IMP136', name: 'Raven Moonwhisper', type: 'Renowned Unit', influence: 1, affinity: 'Terra' }),
    });
    const wyrm = source('IMP137', 'Sundering Wyrm', 'Unit');
    const enemy = card('enemy', 'opponent', { card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', health: 3 }) });
    const base = state();
    const scored = scoreBattlefieldVictoryPoints({ ...base, zones: { ...base.zones, battlefieldLeft: [raven] } }, 'player');
    const retreated = resolvePendingChoice(scored, [raven.instanceId]);
    expect('error' in retreated ? null : retreated.zones.staging.some((unit) => unit.instanceId === raven.instanceId)).toBe(true);

    const damagePending = triggerCardAbilities({ ...base, zones: { ...base.zones, battlefieldLeft: [enemy] } }, 'onEnter', { source: wyrm, controller: 'player', zone: 'staging' });
    const damaged = resolvePendingChoice(damagePending, [enemy.instanceId]);
    expect('error' in damaged ? null : damaged.opponentZones.graveyard.some((unit) => unit.instanceId === enemy.instanceId)).toBe(true);
  });

  it('retreats Raven through the end-turn scoring choice before advancing', () => {
    const raven = card('IMP136', 'player', {
      card: createTestCard({ id: 'IMP136', name: 'Raven Moonwhisper', type: 'Renowned Unit', influence: 1, affinity: 'Terra' }),
    });
    const base = state();
    const pending = advanceToNextTurn({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [raven] },
    });

    expect(pending.pendingChoice).toMatchObject({
      kind: 'terraTarget',
      effect: 'ravenRetreat',
      availableInstanceIds: [raven.instanceId],
      resumeTurnAdvance: true,
    });

    const resolved = resolvePendingChoice(pending, [raven.instanceId]);
    expect('error' in resolved ? null : resolved.activePlayer).toBe('opponent');
    expect('error' in resolved ? null : resolved.zones.battlefieldLeft).toEqual([]);
    expect('error' in resolved ? null : resolved.zones.staging.some((unit) => unit.instanceId === raven.instanceId)).toBe(true);
  });

  it('activates Sylvan Rallier and applies Verdant Protector scoring locks', () => {
    const rallier = source('IMP139', 'Sylvan Rallier', 'Unit');
    const ally = card('ally');
    const supply = card('supply');
    const base = state();
    const activated = activateCardAbility({ ...base, zones: { ...base.zones, staging: [rallier, ally], supply: [supply] } }, 'player', rallier.instanceId, ally.instanceId);
    expect('state' in activated ? activated.state.zones.staging.find((unit) => unit.instanceId === ally.instanceId)?.temporaryAttackBonus : null).toBe(1);

    const protector = card('IMP141', 'player');
    const territory = card('territory', 'player', { card: createTestCard({ id: 'territory', name: 'Territory', type: 'Territory' }) });
    const enemy = card('enemy', 'opponent');
    const locked = scoreBattlefieldVictoryPoints({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [protector], battlefieldCenter: [enemy, territory] },
    }, 'opponent');
    expect(locked.opponentVictoryPoints).toBe(0);
  });

  it('forces Yako Illusionist attacks through a zone choice', () => {
    const yako = source('IMP144', 'Yako Illusionist', 'Unit');
    const enemy = card('enemy', 'opponent', { ready: false });
    const defender = card('defender');
    const base = state();
    const pending = triggerCardAbilities({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [defender] },
      opponentZones: { ...base.opponentZones, staging: [enemy] },
    }, 'onEnter', { source: yako, controller: 'player', zone: 'staging' });
    const zonePending = resolvePendingChoice(pending, [enemy.instanceId]);
    expect('error' in zonePending ? null : zonePending.pendingChoice).toMatchObject({ kind: 'terraZone', effect: 'illusionistAttack' });
    const attacked = 'error' in zonePending ? zonePending : resolvePendingChoice(zonePending, ['battlefieldLeft']);
    expect('error' in attacked ? null : attacked.pendingCombat).toMatchObject({ attackerInstanceId: enemy.instanceId });
  });

  it('resolves Coordinated Strike and Predatory Strike multi-step damage', () => {
    const coordinated = source('IMP145', 'Coordinated Strike', 'Tactic');
    const predatory = source('IMP146', 'Predatory Strike', 'Tactic');
    const one = card('one', 'player', { card: createTestCard({ id: 'one', name: 'One', type: 'Unit', attack: 2 }) });
    const two = card('two', 'player', { card: createTestCard({ id: 'two', name: 'Two', type: 'Unit', attack: 3 }) });
    const enemy = card('enemy', 'opponent', { ready: false, card: createTestCard({ id: 'enemy', name: 'Enemy', type: 'Unit', health: 5 }) });
    const base = state();
    const board = { ...base, zones: { ...base.zones, staging: [one, two], battlefieldLeft: [enemy] } };
    const first = triggerCardAbilities(board, 'onPlay', { source: coordinated, controller: 'player', zone: 'graveyard' });
    const targetPending = resolvePendingChoice(first, [one.instanceId, two.instanceId]);
    const destroyed = 'error' in targetPending ? targetPending : resolvePendingChoice(targetPending, [enemy.instanceId]);
    expect('error' in destroyed ? null : destroyed.opponentZones.graveyard.some((unit) => unit.instanceId === enemy.instanceId)).toBe(true);

    const predatoryPending = triggerCardAbilities(board, 'onPlay', { source: predatory, controller: 'player', zone: 'graveyard' });
    const damagePending = resolvePendingChoice(predatoryPending, [one.instanceId]);
    expect('error' in damagePending ? null : damagePending.pendingChoice).toMatchObject({ effect: 'predatoryDamage', effectAmount: 4 });
  });

  it('finishes Predatory Strike after the buff when no exhausted combat unit is available', () => {
    const predatory = source('IMP146', 'Predatory Strike', 'Tactic');
    const ally = card('ally', 'player', {
      card: createTestCard({ id: 'ally', name: 'Ally', type: 'Unit', attack: 2 }),
    });
    const base = state();
    const pending = triggerCardAbilities({
      ...base,
      zones: { ...base.zones, staging: [ally] },
    }, 'onPlay', { source: predatory, controller: 'player', zone: 'graveyard' });

    const resolved = resolvePendingChoice(pending, [ally.instanceId]);

    expect('error' in resolved ? resolved.error : null).toBeNull();
    if ('error' in resolved) return;
    expect(resolved.pendingChoice).toBeNull();
    expect(resolved.zones.staging[0]?.temporaryAttackBonus).toBe(2);
  });

  it('handles Primordial Howl, Spore Bloom, and Canopy Ambush', () => {
    const howl = source('IMP147', 'Primordial Howl', 'Tactic');
    const bloom = source('IMP148', 'Spore Bloom', 'Tactic');
    const ambush = source('IMP149', 'Canopy Ambush', 'Tactic');
    const ally = card('ally');
    const enemy = card('enemy', 'opponent');
    const base = state();
    const board = { ...base, zones: { ...base.zones, battlefieldLeft: [ally], battlefieldCenter: [enemy] } };
    expect(triggerCardAbilities(board, 'onPlay', { source: howl, controller: 'player', zone: 'graveyard' }).zones.battlefieldCenter[0]?.ready).toBe(false);
    const bloomPending = triggerCardAbilities(board, 'onPlay', { source: bloom, controller: 'player', zone: 'graveyard' });
    const bloomed = resolvePendingChoice(bloomPending, [enemy.instanceId]);
    expect('error' in bloomed ? null : bloomed.zones.battlefieldCenter[0]).toMatchObject({ ready: false, skipNextReady: true });
    expect(triggerCardAbilities(board, 'onPlay', { source: ambush, controller: 'player', zone: 'graveyard' }).zones.battlefieldLeft[0]?.temporaryAttackBonus).toBe(2);
  });

  it('supports Last Stand and Swift Acrobatics counter targets and effects', () => {
    const lastStand = source('IMP150', 'Last Stand', 'Tactic');
    const swift = source('IMP151', 'Swift Acrobatics', 'Tactic');
    const ally = card('ally', 'player', { ready: false });
    const base = state();
    const board = { ...base, zones: { ...base.zones, battlefieldLeft: [ally] } };
    expect(getCounterTargetOptions(board, lastStand).map((unit) => unit.instanceId)).toEqual([ally.instanceId]);
    expect(getCounterTargetOptions(board, swift).map((unit) => unit.instanceId)).toEqual([ally.instanceId]);
    const stood = triggerCardAbilities(board, 'onPlay', { source: lastStand, controller: 'player', zone: null, targets: [{ type: 'card', instanceId: ally.instanceId }] });
    expect(stood.zones.battlefieldLeft[0]).toMatchObject({ ready: true, terraLastStandAttackBonus: 2, terraLastStandHealthBonus: 1 });
    const pendingRetreat = triggerCardAbilities(board, 'onPlay', {
      source: swift,
      controller: 'player',
      zone: null,
    });
    expect(pendingRetreat.pendingChoice).toMatchObject({
      kind: 'terraTarget',
      effect: 'swiftRetreat',
      availableInstanceIds: [ally.instanceId],
    });
    const retreated = resolvePendingChoice(pendingRetreat, [ally.instanceId]);
    expect('error' in retreated ? null : retreated.zones.staging[0]?.instanceId).toBe(ally.instanceId);
    expect('error' in retreated ? null : retreated.log.at(-1)).toMatchObject({
      prefix: 'Swift Acrobatics selected ',
      cardName: ally.card.name,
      suffix: ' to retreat.',
    });
  });

  it('requires a Swift Acrobatics counter target and logs the selected unit', () => {
    const swift = card('IMP151', 'player', {
      card: createTestCard({
        id: 'IMP151',
        name: 'Swift Acrobatics',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        affinity: 'Terra',
      }),
    });
    const attacker = card('attacker', 'opponent', {
      card: createTestCard({ id: 'attacker', name: 'Enemy Attacker', type: 'Unit', attack: 2, health: 3 }),
    });
    const ally = card('ally', 'player', {
      card: createTestCard({ id: 'ally', name: 'Verdant Guard', type: 'Unit', attack: 2, health: 3 }),
    });
    const base = state();
    const combatState = {
      ...base,
      activePlayer: 'opponent' as const,
      zones: { ...base.zones, hand: [swift], battlefieldLeft: [ally] },
      opponentZones: { ...base.opponentZones, staging: [attacker] },
    };
    const declared = declareBattlefieldAttack(combatState, 'opponent', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) return;

    expect(getCounterTargetOptions(declared.state, swift).map((unit) => unit.instanceId)).toContain(ally.instanceId);
    expect(playCounterCard(declared.state, 'player', swift.instanceId)).toEqual({
      error: 'Choose a target for Swift Acrobatics.',
    });

    const played = playCounterCard(declared.state, 'player', swift.instanceId, {
      targetInstanceId: ally.instanceId,
    });
    expect('error' in played ? played.error : null).toBeNull();
    if ('error' in played) return;
    expect(played.state.log[0]).toMatchObject({
      cardName: 'Swift Acrobatics',
      suffix: ' as a counter, targeting Verdant Guard.',
    });

    const opponentPassed = passCounterPriority(played.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) return;
    const playerPassed = passCounterPriority(opponentPassed.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) return;
    expect(playerPassed.state.zones.staging.some((unit) => unit.instanceId === ally.instanceId)).toBe(true);
  });

  it('returns Lifecycle Katana defenders and draws from Elorhain', () => {
    const attacker = card('attacker', 'opponent', { card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 4, health: 4 }) });
    const defender = card('defender', 'player', { card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 0, health: 1, subtype: 'Sylvan' }) });
    const katana = card('IMP153', 'player', { attachedToInstanceId: defender.instanceId, card: createTestCard({ id: 'IMP153', name: 'Katana', type: 'Item', attack: 0, health: 0 }) });
    const crown = card('IMP155', 'player', { card: createTestCard({ id: 'IMP155', name: 'Crown', type: 'Territory' }) });
    const draw = card('draw');
    const base = { ...state(), activePlayer: 'opponent' as const };
    const result = resolveBattlefieldAttack({
      ...base,
      zones: { ...base.zones, deck: [draw], battlefieldLeft: [defender, katana, crown] },
      opponentZones: { ...base.opponentZones, staging: [attacker] },
    }, 'opponent', attacker.instanceId, 'battlefieldLeft');
    expect('error' in result ? null : result.state.zones.hand.some((item) => item.instanceId === draw.instanceId)).toBe(true);
    expect('error' in result ? null : result.state.pendingChoice).toMatchObject({ effect: 'katanaReturn' });
    if ('error' in result) return;
    const returned = resolvePendingChoice(result.state, [defender.instanceId]);
    expect('error' in returned ? null : returned.zones.deck[0]?.instanceId).toBe(defender.instanceId);
  });

  it('resolves Terra end-turn territories and Overgrown Factory', () => {
    const wilds = card('IMP156', 'player', { card: createTestCard({ id: 'IMP156', name: 'Wilds', type: 'Territory' }) });
    const route = card('IMP157', 'player', { card: createTestCard({ id: 'IMP157', name: 'Route', type: 'Territory' }) });
    const factory = card('IMP158', 'player', { card: createTestCard({ id: 'IMP158', name: 'Factory', type: 'Territory' }) });
    const enemy = card('enemy', 'opponent');
    const ally = card('ally');
    const supply = card('supply');
    const draw = card('draw');
    const base = state();
    const endApplied = applyTerraEndTurnAbilities({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [enemy, wilds], battlefieldCenter: [route] },
    }, 'player');
    expect(endApplied.zones.battlefieldLeft[0]?.ready).toBe(false);
    const advanced = advanceToNextTurn({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [enemy, wilds], battlefieldCenter: [route] },
    });
    expect(advanced.zones.graveyard.some((item) => item.instanceId === route.instanceId)).toBe(true);
    expect(advanced.log.some((entry) =>
      entry.prefix === 'You sacrificed ' &&
      entry.cardName === 'Route' &&
      entry.suffix === ' because there was not enough ready supply to pay 2.'
    )).toBe(true);

    const moved = applyCardAction({
      ...base,
      zones: { ...base.zones, deck: [draw], supply: [supply], battlefieldLeft: [ally, factory] },
    }, {
      owner: 'player',
      instanceId: ally.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'staging',
    });
    expect(moved.state.pendingChoice).toMatchObject({ effect: 'factoryDraw' });
    const paid = resolvePendingChoice(moved.state, [factory.instanceId]);
    expect('error' in paid ? null : paid.zones.hand.some((item) => item.instanceId === draw.instanceId)).toBe(true);
  });

  it('pays for or sacrifices Escape Route and logs the outcome', () => {
    const route = card('IMP157', 'player', {
      card: createTestCard({ id: 'IMP157', name: 'Escape Route', type: 'Territory' }),
    });
    const supplyA = card('supply-a');
    const supplyB = card('supply-b');
    const base = state();
    const pending = advanceToNextTurn({
      ...base,
      zones: {
        ...base.zones,
        supply: [supplyA, supplyB],
        battlefieldLeft: [route],
      },
    });
    expect(pending.pendingChoice).toMatchObject({
      kind: 'terraTarget',
      effect: 'escapeRoutePay',
      availableInstanceIds: [route.instanceId],
    });

    const paid = resolvePendingChoice(pending, [route.instanceId]);
    expect('error' in paid ? null : paid.zones.supply.every((card) => !card.ready)).toBe(true);
    expect('error' in paid ? null : paid.zones.battlefieldLeft.some((card) => card.instanceId === route.instanceId)).toBe(true);
    expect('error' in paid ? null : paid.log.some((entry) =>
      entry.prefix === 'You paid 2 supply to keep ' && entry.cardName === 'Escape Route'
    )).toBe(true);

    const declinedPending = advanceToNextTurn({
      ...base,
      zones: {
        ...base.zones,
        supply: [supplyA, supplyB],
        battlefieldLeft: [route],
      },
    });
    const declined = resolvePendingChoice(declinedPending, []);
    expect('error' in declined ? null : declined.zones.graveyard.some((card) => card.instanceId === route.instanceId)).toBe(true);
    expect('error' in declined ? null : declined.log.some((entry) =>
      entry.prefix === 'You sacrificed ' &&
      entry.cardName === 'Escape Route' &&
      entry.suffix === ' instead of paying 2 supply.'
    )).toBe(true);
  });

  it('handles face-down, bot-controlled, and multiple Escape Routes at end of turn', () => {
    const playerRouteA = card('IMP157', 'player', {
      instanceId: 'route-a',
      card: createTestCard({ id: 'IMP157', name: 'Escape Route', type: 'Territory' }),
    });
    const playerRouteB = { ...playerRouteA, instanceId: 'route-b' };
    const faceDownRoute = { ...playerRouteA, instanceId: 'route-facedown', faceDown: true };
    const supplies = [card('supply-a'), card('supply-b'), card('supply-c'), card('supply-d')];
    const base = state();

    const firstPending = advanceToNextTurn({
      ...base,
      zones: {
        ...base.zones,
        supply: supplies,
        battlefieldLeft: [playerRouteA],
        battlefieldCenter: [playerRouteB],
      },
    });
    const firstPaid = resolvePendingChoice(firstPending, [playerRouteA.instanceId]);
    expect('error' in firstPaid ? null : firstPaid.pendingChoice).toMatchObject({
      effect: 'escapeRoutePay',
      availableInstanceIds: [playerRouteB.instanceId],
    });
    if ('error' in firstPaid) return;
    const secondPaid = resolvePendingChoice(firstPaid, [playerRouteB.instanceId]);
    expect('error' in secondPaid ? null : secondPaid.zones.supply.every((card) => !card.ready)).toBe(true);
    expect('error' in secondPaid ? null : secondPaid.activePlayer).toBe('opponent');

    const ignoredFaceDown = advanceToNextTurn({
      ...base,
      zones: { ...base.zones, battlefieldLeft: [faceDownRoute] },
    });
    expect(ignoredFaceDown.pendingChoice).toBeNull();
    expect(ignoredFaceDown.zones.battlefieldLeft[0]?.instanceId).toBe(faceDownRoute.instanceId);

    const botRoute = card('IMP157', 'opponent', {
      card: createTestCard({ id: 'IMP157', name: 'Escape Route', type: 'Territory' }),
    });
    const botSupplyA = card('bot-supply-a', 'opponent');
    const botSupplyB = card('bot-supply-b', 'opponent');
    const botPaid = advanceToNextTurn({
      ...base,
      activePlayer: 'opponent',
      zones: { ...base.zones, battlefieldLeft: [botRoute] },
      opponentZones: {
        ...base.opponentZones,
        supply: [botSupplyA, botSupplyB],
      },
    });
    expect(botPaid.opponentZones.supply.every((card) => !card.ready)).toBe(true);
    expect(botPaid.zones.battlefieldLeft.some((card) => card.instanceId === botRoute.instanceId)).toBe(true);
    expect(botPaid.log.some((entry) =>
      entry.prefix === 'Bot paid 2 supply to keep ' && entry.cardName === 'Escape Route'
    )).toBe(true);

    const botSacrificed = advanceToNextTurn({
      ...base,
      activePlayer: 'opponent',
      zones: { ...base.zones, battlefieldLeft: [botRoute] },
    });
    expect(botSacrificed.opponentZones.graveyard.some((card) => card.instanceId === botRoute.instanceId)).toBe(true);
    expect(botSacrificed.log.some((entry) =>
      entry.prefix === 'Bot sacrificed ' &&
      entry.cardName === 'Escape Route' &&
      entry.suffix === ' because there was not enough ready supply to pay 2.'
    )).toBe(true);
  });
});
