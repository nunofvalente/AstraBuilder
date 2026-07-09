import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { getRegisteredCardAbilities } from './card-abilities';
import {
  activateCardAbility,
  adjustVictoryPoints,
  advanceToNextTurn,
  buildInitialGameState,
  resolveBattlefieldAttack,
  resolvePendingChoice,
  removeUnitFromPlay,
  scoreBattlefieldVictoryPoints,
  triggerCardAbilities,
  type GameCardInstance,
  type GameState,
  type SavedDeck,
} from './game-rules';

function makeDeck(): SavedDeck {
  return { id: 'nox-test', title: 'Nox Test', cardCount: 0, entries: [] };
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
  const card = overrides.card ?? createTestCard({
    id,
    name: id,
    type: 'Unit',
    cost: 2,
    attack: 2,
    health: 2,
    influence: 1,
  });
  return {
    instanceId: `${owner}-${id}`,
    owner,
    card,
    ready: overrides.ready ?? true,
    faceDown: overrides.faceDown ?? false,
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
    ...overrides,
  };
}

function makeCard(id: string, name: string, rulesText: string, type = 'Tactic'): GameCardInstance {
  return makeUnit(id, 'player', {
    card: createTestCard({ id, name, type, rulesText }),
  });
}

describe('Nox card abilities', () => {
  it('registers every Nox card from IMP001 through IMP032', () => {
    for (let number = 1; number <= 32; number += 1) {
      const id = `IMP${String(number).padStart(3, '0')}`;
      expect(getRegisteredCardAbilities(id), id).not.toBeNull();
    }
  });

  it('implements Tenebrosa readying and victory-point prevention', () => {
    const tenebrosa = makeUnit('IMP015', 'opponent', {
      ready: false,
      card: createTestCard({
        id: 'IMP015',
        name: 'Tenebrosa, Destroyer of Hope',
        type: 'Renowned Unit',
        rulesText: "On Defend: Ready this unit.\n\nWhile this unit controls a combat zone, opponents can't gain victory points.",
      }),
    });
    const state = makeState();
    const controlled = {
      ...state,
      zones: { ...state.zones, battlefieldLeft: [tenebrosa] },
    };

    expect(adjustVictoryPoints(controlled, 'player', 3).playerVictoryPoints).toBe(0);
    const defended = triggerCardAbilities(controlled, 'onDefend', {
      source: tenebrosa,
      controller: 'opponent',
      zone: 'battlefieldLeft',
    });
    expect(defended.zones.battlefieldLeft[0]?.ready).toBe(true);
  });

  it('implements Valrathian Commissar and triggers the sacrifice death', () => {
    const commissar = makeUnit('IMP016', 'player', {
      card: createTestCard({
        id: 'IMP016',
        name: 'Valrathian Commissar',
        type: 'Unit',
        rulesText: '{Exhaust}, Sacrifice a unit: Target opponent loses 1 victory point.',
      }),
    });
    const supplier = makeUnit('IMP002', 'player', {
      card: createTestCard({
        id: 'IMP002',
        name: 'Cadaver Supplier',
        type: 'Unit',
        rulesText: 'On Death: Create a 2/2 Experiment unit token with 0 influence.',
      }),
    });
    const state = makeState();
    const active = {
      ...state,
      opponentVictoryPoints: 3,
      zones: { ...state.zones, staging: [commissar, supplier] },
    };

    const result = activateCardAbility(active, 'player', commissar.instanceId, supplier.instanceId);
    expect(result).not.toHaveProperty('error');
    if ('state' in result) {
      expect(result.state.opponentVictoryPoints).toBe(2);
      expect(result.state.zones.staging).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ instanceId: commissar.instanceId, ready: false }),
          expect.objectContaining({ card: expect.objectContaining({ id: 'IMP000' }) }),
        ])
      );
    }
  });

  it('implements Zealot discard and Retainer temporary influence', () => {
    const zealot = makeCard('IMP017', 'Valrathian Zealot', 'On Death: Target opponent discards a card.', 'Unit');
    const retainer = makeCard('IMP018', 'Vampire Retainer', 'On Death: Target friendly unit gets +1 influence until the end of your next turn.', 'Unit');
    const ally = makeUnit('ally');
    const botCard = makeCard('bot-card', 'Bot Card', '', 'Unit');
    botCard.owner = 'opponent';
    const state = makeState();
    const active = {
      ...state,
      zones: { ...state.zones, staging: [ally] },
      opponentZones: { ...state.opponentZones, hand: [botCard] },
    };

    const discarded = triggerCardAbilities(active, 'onDeath', { source: zealot, controller: 'player', zone: 'graveyard' });
    expect(discarded.opponentZones.hand).toEqual([]);

    const playerCard = makeCard('player-card', 'Player Card', '', 'Unit');
    const opponentZealot = makeCard('IMP017', 'Valrathian Zealot', 'On Death: Target opponent discards a card.', 'Unit');
    opponentZealot.owner = 'opponent';
    const playerDiscardPending = triggerCardAbilities({
      ...state,
      zones: { ...state.zones, hand: [playerCard] },
    }, 'onDeath', { source: opponentZealot, controller: 'opponent', zone: 'graveyard' });
    expect(playerDiscardPending.pendingChoice).toMatchObject({
      kind: 'forcedDiscard',
      availableCardInstanceIds: [playerCard.instanceId],
      sourceName: 'Valrathian Zealot',
    });
    const playerDiscarded = resolvePendingChoice(playerDiscardPending, [playerCard.instanceId]);
    expect('error' in playerDiscarded ? null : playerDiscarded.zones.graveyard[0]?.instanceId).toBe(playerCard.instanceId);

    const pending = triggerCardAbilities(discarded, 'onDeath', { source: retainer, controller: 'player', zone: 'graveyard' });
    expect(pending.pendingChoice).toMatchObject({ kind: 'noxTarget', effect: 'retainerBuff' });
    const resolved = resolvePendingChoice(pending, [ally.instanceId]);
    expect('error' in resolved ? null : resolved.zones.staging[0]?.temporaryInfluenceBonus).toBe(1);
  });

  it('opens a discard choice when the player destroys an opponent Valrathian Zealot in combat', () => {
    const attacker = makeUnit('attacker', 'player', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 5, influence: 1 }),
    });
    const zealot = makeUnit('IMP017', 'opponent', {
      card: createTestCard({
        id: 'IMP017',
        name: 'Valrathian Zealot',
        type: 'Unit Demon',
        attack: 0,
        health: 2,
        rulesText: 'On Death: Target opponent discards a card.',
      }),
    });
    const discard = makeCard('discard', 'Discard Me', '', 'Tactic');
    const state = makeState();

    const result = resolveBattlefieldAttack({
      ...state,
      zones: {
        ...state.zones,
        hand: [discard],
        staging: [attacker],
        battlefieldLeft: [zealot],
      },
    }, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.state.pendingChoice).toMatchObject({
      kind: 'forcedDiscard',
      availableCardInstanceIds: [discard.instanceId],
      sourceName: 'Valrathian Zealot',
    });

    const resolved = resolvePendingChoice(result.state, [discard.instanceId]);
    expect('error' in resolved ? null : resolved.zones.graveyard[0]?.instanceId).toBe(discard.instanceId);
  });

  it('uses cards drawn this turn as Vermillion base influence', () => {
    const vermillion = makeUnit('IMP019', 'player', {
      card: createTestCard({
        id: 'IMP019',
        name: 'Vermillion, Ghastly Researcher',
        type: 'Renowned Unit',
        influence: null,
        rulesText: "This unit has base influence equal to the number of cards you've drawn this turn.",
      }),
    });
    const state = makeState();
    const scored = scoreBattlefieldVictoryPoints({
      ...state,
      playerCardsDrawnThisTurn: 2,
      zones: { ...state.zones, battlefieldLeft: [vermillion] },
    }, 'player');
    expect(scored.playerVictoryPoints).toBe(2);
  });

  it('resolves Contagious Disposal in player order', () => {
    const disposal = makeCard('IMP020', 'Contagious Disposal', 'Each player discards a card and creates an Experiment.');
    const playerCard = makeCard('player-card', 'Player Card', '', 'Unit');
    const botCard = makeCard('bot-card', 'Bot Card', '', 'Unit');
    botCard.owner = 'opponent';
    const state = makeState();
    const active = {
      ...state,
      zones: { ...state.zones, hand: [playerCard], graveyard: [disposal] },
      opponentZones: { ...state.opponentZones, hand: [botCard] },
    };

    const pending = triggerCardAbilities(active, 'onPlay', { source: disposal, controller: 'player', zone: 'graveyard' });
    expect(pending.opponentZones.staging[0]?.card.id).toBe('IMP000');
    const resolved = resolvePendingChoice(pending, [playerCard.instanceId]);
    expect('error' in resolved ? null : resolved.zones.staging[0]?.card.id).toBe('IMP000');
  });

  it('implements Demonic Advance, Exterminate, Eye for an Eye, and Unethical Research', () => {
    const state = makeState();
    const advance = makeCard('IMP021', 'Demonic Advance', 'The next unit may enter a combat zone.');
    const advanced = triggerCardAbilities(state, 'onPlay', { source: advance, controller: 'player', zone: 'graveyard' });
    expect(advanced.playerDemonicAdvanceActive).toBe(true);

    const playerUnit = makeUnit('player-unit');
    const botUnit = makeUnit('bot-unit', 'opponent', {
      card: createTestCard({ id: 'bot-unit', name: 'Bot Unit', type: 'Unit', cost: 4 }),
    });
    const occupied = {
      ...state,
      zones: { ...state.zones, staging: [playerUnit], battlefieldLeft: [botUnit] },
    };
    const exterminate = makeCard('IMP022', 'Exterminate', 'Destroy all units.');
    const exterminated = triggerCardAbilities(occupied, 'onPlay', { source: exterminate, controller: 'player', zone: 'graveyard' });
    expect(exterminated.zones.staging).toEqual([]);
    expect(exterminated.zones.battlefieldLeft).toEqual([]);

    const eye = makeCard('IMP023', 'Eye for an Eye', 'Sacrifice a unit, then the opponent sacrifices their highest-cost unit.');
    const eyePending = triggerCardAbilities(occupied, 'onPlay', { source: eye, controller: 'player', zone: 'graveyard' });
    const eyeResolved = resolvePendingChoice(eyePending, [playerUnit.instanceId]);
    expect('error' in eyeResolved ? null : eyeResolved.zones.battlefieldLeft).toEqual([]);

    const drawOne = makeCard('draw-1', 'Draw One', '', 'Unit');
    const drawTwo = makeCard('draw-2', 'Draw Two', '', 'Unit');
    const researchVictim = makeUnit('research-victim', 'player', {
      discardCardOnDeathThisTurnCount: 1,
    });
    const research = makeCard('IMP024', 'Unethical Research', 'Sacrifice target unit. Draw 2 cards.');
    const researchState = {
      ...occupied,
      zones: {
        ...occupied.zones,
        deck: [drawOne, drawTwo],
        graveyard: [research],
        staging: [researchVictim],
      },
    };
    const researchPending = triggerCardAbilities(researchState, 'onPlay', { source: research, controller: 'player', zone: 'graveyard' });
    expect(researchPending.pendingChoice).toMatchObject({
      kind: 'noxTarget',
      availableInstanceIds: [researchVictim.instanceId],
    });
    const researchResolved = resolvePendingChoice(researchPending, [researchVictim.instanceId]);
    expect('error' in researchResolved ? null : researchResolved.zones.hand).toHaveLength(2);
    expect('error' in researchResolved ? null : researchResolved.pendingChoice).toMatchObject({
      kind: 'forcedDiscard',
      availableCardInstanceIds: [drawOne.instanceId, drawTwo.instanceId],
    });
  });

  it('implements Blinding Mist and filters Killing Blow and Quash targets', () => {
    const attacker = makeUnit('attacker', 'player', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', cost: 1 }),
    });
    const defender = makeUnit('defender', 'opponent');
    const costly = makeUnit('costly', 'opponent', {
      card: createTestCard({ id: 'costly', name: 'Costly', type: 'Unit', cost: 4 }),
    });
    const state = makeState();
    const combatState = {
      ...state,
      pendingCombat: {
        attackerOwner: 'player' as const,
        attackerInstanceId: attacker.instanceId,
        targetZone: 'battlefieldLeft' as const,
        defenderInstanceId: defender.instanceId,
        priorityOwner: 'player' as const,
        lastPassedOwner: null,
        counterStack: [],
      },
      zones: { ...state.zones, staging: [attacker], battlefieldLeft: [defender, costly] },
    };
    const mist = makeCard('IMP025', 'Blinding Mist', 'Prevent combat damage.');
    const prevented = triggerCardAbilities(combatState, 'onPlay', { source: mist, controller: 'player', zone: null });
    expect(prevented.zones.battlefieldLeft[0]?.preventNextCombatDamageThisTurn).toBe(true);
    expect(prevented.log[0]?.suffix).toBe('Blinding Mist will prevent the next combat damage dealt to defender.');

    const killing = makeCard('IMP026', 'Killing Blow', 'Destroy target combat unit.');
    const killingPending = triggerCardAbilities(combatState, 'onPlay', { source: killing, controller: 'player', zone: 'graveyard' });
    expect(killingPending.pendingChoice).toMatchObject({
      kind: 'noxTarget',
      availableInstanceIds: expect.arrayContaining([defender.instanceId, costly.instanceId, attacker.instanceId]),
    });

    const quash = makeCard('IMP027', 'Quash Insurrection', 'Destroy target combat unit costing 2 or less.');
    const quashPending = triggerCardAbilities(combatState, 'onPlay', { source: quash, controller: 'player', zone: 'graveyard' });
    expect(quashPending.pendingChoice).toMatchObject({
      availableInstanceIds: [defender.instanceId, attacker.instanceId],
    });
  });

  it('implements Nox equipment and territory effects', () => {
    const attacker = makeUnit('attacker', 'player', {
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 5, influence: 2 }),
    });
    const defender = makeUnit('defender', 'opponent', {
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 0, health: 2 }),
    });
    const explosive = makeCard('IMP029', 'Explosive Augment', 'Deal 3 damage when equipped unit dies.', 'Item');
    explosive.owner = 'opponent';
    explosive.attachedToInstanceId = defender.instanceId;
    const state = makeState();
    const combat = resolveBattlefieldAttack({
      ...state,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender, explosive],
      },
    }, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in combat ? null : combat.state.zones.battlefieldLeft.find((card) => card.instanceId === attacker.instanceId)?.damage).toBe(4);

    const bystander = makeUnit('bystander', 'player', {
      card: createTestCard({ id: 'bystander', name: 'Bystander', type: 'Unit', health: 5 }),
    });
    const tacticExplosion = removeUnitFromPlay({
      ...state,
      zones: { ...state.zones, battlefieldLeft: [defender, explosive, bystander] },
    }, defender.instanceId);
    expect('error' in tacticExplosion ? null : tacticExplosion.state.zones.battlefieldLeft[0]?.damage).toBe(3);

    const augment = makeCard('IMP028', 'Experimental Augment', "Equipped unit can't score.", 'Item');
    augment.attachedToInstanceId = attacker.instanceId;
    const noScore = scoreBattlefieldVictoryPoints({
      ...state,
      zones: { ...state.zones, battlefieldLeft: [attacker, augment] },
    }, 'player');
    expect(noScore.playerVictoryPoints).toBe(0);

    const ruins = makeCard('IMP030', 'Blighted Ruins', 'Lose 1 victory point and draw a card.', 'Territory');
    const draw = makeCard('draw', 'Draw', '', 'Unit');
    const ruinsScore = scoreBattlefieldVictoryPoints({
      ...state,
      zones: { ...state.zones, deck: [draw], battlefieldLeft: [attacker, ruins] },
    }, 'player');
    expect(ruinsScore.playerVictoryPoints).toBe(1);
    expect(ruinsScore.zones.hand).toHaveLength(1);
  });

  it('implements Noxhaven Laboratory and The Hideout', () => {
    const attacker = makeUnit('attacker');
    const laboratory = makeCard('IMP031', 'Noxhaven Laboratory', 'Whenever a unit takes control, you may draw then discard.', 'Territory');
    const state = makeState();
    const captured = resolveBattlefieldAttack({
      ...state,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [laboratory],
      },
    }, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in captured ? null : captured.state.pendingChoice).toMatchObject({
      kind: 'noxTarget',
      effect: 'laboratoryUse',
      optional: true,
    });

    const hideout = makeCard('IMP032', 'The Hideout', 'Units cannot be targeted by enemy tactics.', 'Territory');
    const protectedUnit = makeUnit('protected');
    const killing = makeCard('IMP026', 'Killing Blow', 'Destroy target combat unit.');
    killing.owner = 'opponent';
    const protectedState = {
      ...state,
      zones: { ...state.zones, battlefieldLeft: [protectedUnit, hideout] },
    };
    const noTarget = triggerCardAbilities(protectedState, 'onPlay', {
      source: killing,
      controller: 'opponent',
      zone: 'graveyard',
    });
    expect(noTarget.zones.battlefieldLeft).toHaveLength(2);

    const endTurn = advanceToNextTurn(protectedState);
    expect(endTurn.pendingChoice).toMatchObject({
      kind: 'noxTarget',
      effect: 'hideoutSacrifice',
      resumeTurnAdvance: true,
    });
  });
});
