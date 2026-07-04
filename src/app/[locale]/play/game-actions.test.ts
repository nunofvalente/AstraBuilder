import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { applyCardAction, applyPlayerCardAction } from './game-actions';
import {
  advanceToNextTurn,
  buildInitialGameState,
  declareBattlefieldAttack,
  resolveBattlefieldAttack,
  type GameCardInstance,
  type GameState,
  type SavedDeck,
} from './game-rules';

function makeDeck(cardCount: number): SavedDeck {
  return {
    id: 'deck-1',
    title: 'Action Test Deck',
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
    instanceId: overrides.instanceId ?? `player-${card.id}`,
    owner: overrides.owner ?? 'player',
    card,
    ready: overrides.ready ?? false,
    faceDown: overrides.faceDown ?? false,
    faceDownEnteredTurn: overrides.faceDownEnteredTurn,
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
    banishOnDeath: overrides.banishOnDeath ?? false,
    discardCardOnDeathThisTurnCount: overrides.discardCardOnDeathThisTurnCount ?? 0,
  };
}

function makePlayerTurn(overrides: Partial<GameState> = {}): GameState {
  return {
    ...buildInitialGameState(makeDeck(12), makeDeck(12)),
    phase: 'main',
    activePlayer: 'player',
    playerStartingSupplyPlaced: true,
    ...overrides,
  };
}

describe('deterministic player card actions', () => {
  it('uses an explicit first-player input when setup supply starts multiplayer', () => {
    const supplyCard = makeInstance({ instanceId: 'starting-supply' });
    const replacement = makeInstance({ instanceId: 'replacement' });
    const state = {
      ...buildInitialGameState(makeDeck(12), makeDeck(12), 'multiplayer'),
      zones: {
        ...buildInitialGameState(makeDeck(12), makeDeck(12), 'multiplayer').zones,
        hand: [supplyCard],
        deck: [replacement],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: supplyCard.instanceId,
      fromZone: 'hand',
      toZone: 'supply',
      options: { setupFirstPlayer: 'opponent' },
    });

    expect(result.applied).toBe(true);
    expect(result.state.playerStartingSupplyPlaced).toBe(true);
    expect(result.state.activePlayer).toBe('opponent');
    expect(result.state.zones.supply[0]?.instanceId).toBe(supplyCard.instanceId);
    expect(result.state.zones.hand[0]?.instanceId).toBe(replacement.instanceId);
  });

  it('does not mutate multiplayer setup without an explicit first player', () => {
    const supplyCard = makeInstance({ instanceId: 'starting-supply' });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12), 'multiplayer');
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [supplyCard],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: supplyCard.instanceId,
      fromZone: 'hand',
      toZone: 'supply',
    });

    expect(result.applied).toBe(false);
    expect(result.error).toBe('A first player is required to start a multiplayer game.');
    expect(result.state.zones.hand).toEqual([supplyCard]);
    expect(result.state.zones.supply).toEqual([]);
  });

  it('supplies once per turn and draws a replacement', () => {
    const firstSupply = makeInstance({ instanceId: 'first-supply' });
    const secondSupply = makeInstance({ instanceId: 'second-supply' });
    const replacement = makeInstance({ instanceId: 'replacement' });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [firstSupply, secondSupply],
        deck: [replacement],
        supply: [],
      },
    };

    const supplied = applyPlayerCardAction(state, {
      instanceId: firstSupply.instanceId,
      fromZone: 'hand',
      toZone: 'supply',
    });
    const suppliedAgain = applyPlayerCardAction(supplied.state, {
      instanceId: secondSupply.instanceId,
      fromZone: 'hand',
      toZone: 'supply',
    });

    expect(supplied.state.playerSuppliedThisTurn).toBe(true);
    expect(supplied.state.zones.supply[0]?.instanceId).toBe(firstSupply.instanceId);
    expect(supplied.state.zones.hand.map((instance) => instance.instanceId)).toEqual([
      secondSupply.instanceId,
      replacement.instanceId,
    ]);
    expect(suppliedAgain.applied).toBe(false);
    expect(suppliedAgain.error).toBe('You have already supplied a card this turn.');
  });

  it('does not reveal the card name when the bot supplies a card', () => {
    const secretSupply = makeInstance({
      instanceId: 'bot-secret-supply',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-secret-supply', name: 'Secret Bot Card' }),
    });
    const replacement = makeInstance({ instanceId: 'bot-replacement', owner: 'opponent' });
    const baseState = makePlayerTurn({
      activePlayer: 'opponent',
      opponentSuppliedThisTurn: false,
    });
    const state = {
      ...baseState,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [secretSupply],
        deck: [replacement],
        supply: [],
      },
    };

    const supplied = applyCardAction(state, {
      owner: 'opponent',
      instanceId: secretSupply.instanceId,
      fromZone: 'hand',
      toZone: 'supply',
    });

    expect(supplied.applied).toBe(true);
    expect(supplied.state.opponentZones.supply[0]?.instanceId).toBe(secretSupply.instanceId);
    expect(supplied.state.log[0]?.suffix).toBe('Bot supplied a card and drew 1 card.');
    expect(JSON.stringify(supplied.state.log[0])).not.toContain('Secret Bot Card');
  });

  it('plays a territory face down for free and face up by paying its cost', () => {
    const faceDownTerritory = makeInstance({
      instanceId: 'face-down-territory',
      card: createTestCard({ id: 'face-down-territory', name: 'Hidden Territory', type: 'Territory', cost: 3 }),
    });
    const faceUpTerritory = makeInstance({
      instanceId: 'face-up-territory',
      card: createTestCard({ id: 'face-up-territory', name: 'Open Territory', type: 'Territory', cost: 1 }),
    });
    const readySupply = makeInstance({ instanceId: 'ready-supply', ready: true });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [faceDownTerritory, faceUpTerritory],
        supply: [readySupply],
      },
    };

    const faceDownPlay = applyPlayerCardAction(state, {
      instanceId: faceDownTerritory.instanceId,
      fromZone: 'hand',
      toZone: 'battlefieldLeft',
      options: { faceDown: true },
    });
    const faceUpPlay = applyPlayerCardAction(faceDownPlay.state, {
      instanceId: faceUpTerritory.instanceId,
      fromZone: 'hand',
      toZone: 'battlefieldCenter',
      options: { faceDown: false },
    });

    expect(faceDownPlay.applied).toBe(true);
    expect(faceDownPlay.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: faceDownTerritory.instanceId,
      faceDown: true,
      faceDownEnteredTurn: faceDownPlay.state.turn,
    });
    expect(faceDownPlay.state.zones.supply[0]?.ready).toBe(true);
    expect(faceUpPlay.state.zones.battlefieldCenter[0]?.faceDown).toBe(false);
    expect(faceUpPlay.state.zones.supply[0]?.ready).toBe(false);
  });

  it('does not let a face-down territory flip on the same turn it was played', () => {
    const territory = makeInstance({
      instanceId: 'hidden-territory',
      card: createTestCard({ id: 'hidden-territory', name: 'Hidden Territory', type: 'Territory', cost: 1 }),
    });
    const supply = makeInstance({ instanceId: 'supply', ready: true });
    const baseState = makePlayerTurn({ turn: 3 });
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [territory],
        supply: [supply],
      },
    };

    const played = applyPlayerCardAction(state, {
      instanceId: territory.instanceId,
      fromZone: 'hand',
      toZone: 'battlefieldLeft',
      options: { faceDown: true },
    });

    expect(played.applied).toBe(true);
    expect(played.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: territory.instanceId,
      faceDown: true,
      faceDownEnteredTurn: 3,
    });

    const sameTurnFlip = applyPlayerCardAction(played.state, {
      instanceId: territory.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'battlefieldLeft',
      options: { faceDown: false },
    });

    expect(sameTurnFlip.applied).toBe(false);
    expect(sameTurnFlip.error).toBe('Territories can only be flipped face up on a later turn after they are played face down.');
    expect(sameTurnFlip.state.zones.battlefieldLeft[0]?.faceDown).toBe(true);

    const laterTurnFlip = applyPlayerCardAction({ ...played.state, turn: 4 }, {
      instanceId: territory.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'battlefieldLeft',
      options: { faceDown: false },
    });

    expect(laterTurnFlip.applied).toBe(true);
    expect(laterTurnFlip.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: territory.instanceId,
      faceDown: false,
    });
    expect(laterTurnFlip.state.zones.battlefieldLeft[0]?.faceDownEnteredTurn).toBeUndefined();
    expect(laterTurnFlip.state.zones.supply[0]?.ready).toBe(false);
  });

  it('plays a unit to staging exhausted and pays its cost', () => {
    const unit = makeInstance({
      instanceId: 'staging-unit',
      card: createTestCard({ id: 'staging-unit', name: 'Staging Unit', type: 'Unit', cost: 1, rulesText: '' }),
    });
    const supply = makeInstance({ instanceId: 'supply', ready: true });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [unit],
        supply: [supply],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: unit.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.hand).toEqual([]);
    expect(result.state.zones.staging[0]).toMatchObject({
      instanceId: unit.instanceId,
      ready: false,
    });
    expect(result.state.zones.supply[0]?.ready).toBe(false);
  });

  it('plays IMP014 and creates an Experiment token on enter', () => {
    const researcher = makeInstance({
      instanceId: 'noxhaven-researcher',
      card: createTestCard({
        id: 'IMP014',
        name: 'Noxhaven Researcher',
        type: 'Unit Vampire',
        cost: 2,
        attack: 0,
        health: 1,
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.',
      }),
    });
    const supplies = [
      makeInstance({ instanceId: 'supply-1', ready: true }),
      makeInstance({ instanceId: 'supply-2', ready: true }),
    ];
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [researcher],
        staging: [],
        supply: supplies,
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: researcher.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: researcher.instanceId, ready: false }),
        expect.objectContaining({
          owner: 'player',
          ready: false,
          card: expect.objectContaining({ id: 'IMP000', name: 'Experiment', attack: 2, health: 2, influence: 0 }),
        }),
      ])
    );
    expect(result.state.zones.supply.every((instance) => !instance.ready)).toBe(true);
    expect(result.state.log[0]?.suffix).toBe('Noxhaven Researcher created Experiment in staging.');
  });

  it('does not fire Noxhaven Researcher on-enter when it attacks into a battlefield', () => {
    const researcher = makeInstance({
      instanceId: 'noxhaven-researcher',
      ready: true,
      card: createTestCard({
        id: 'IMP014',
        name: 'Noxhaven Researcher',
        type: 'Unit Vampire',
        cost: 2,
        attack: 0,
        health: 1,
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.',
      }),
    });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [researcher],
        battlefieldLeft: [],
      },
    };

    const result = resolveBattlefieldAttack(state, 'player', researcher.instanceId, 'battlefieldLeft');

    expect('error' in result).toBe(false);
    if ('error' in result) {
      return;
    }
    expect(result.state.zones.battlefieldLeft[0]?.instanceId).toBe(researcher.instanceId);
    expect(result.state.zones.staging).toEqual([]);
    expect(result.state.log.some((entry) => entry.suffix.includes('created Experiment'))).toBe(false);
  });

  it('does not fire Noxhaven Researcher on-enter when it retreats to staging', () => {
    const researcher = makeInstance({
      instanceId: 'noxhaven-researcher',
      ready: true,
      card: createTestCard({
        id: 'IMP014',
        name: 'Noxhaven Researcher',
        type: 'Unit Vampire',
        cost: 2,
        attack: 0,
        health: 1,
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.',
      }),
    });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        battlefieldLeft: [researcher],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: researcher.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'staging',
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.battlefieldLeft).toEqual([]);
    expect(result.state.zones.staging).toEqual([
      expect.objectContaining({ instanceId: researcher.instanceId, ready: false }),
    ]);
    expect(result.state.log.some((entry) => entry.suffix.includes('created Experiment'))).toBe(false);
  });

  it('plays a Nox tactic and uses Demonic Advance for the next unit', () => {
    const advance = makeInstance({
      instanceId: 'demonic-advance',
      card: createTestCard({
        id: 'IMP021',
        name: 'Demonic Advance',
        type: 'Tactic',
        cost: 1,
        rulesText: 'The next unit you play this turn can be played directly into an unoccupied combat zone. If you do, it enters ready.',
      }),
    });
    const unit = makeInstance({
      instanceId: 'advanced-unit',
      card: createTestCard({ id: 'advanced-unit', name: 'Advanced Unit', type: 'Unit', cost: 2 }),
    });
    const supplies = [
      makeInstance({ instanceId: 'supply-1', ready: true }),
      makeInstance({ instanceId: 'supply-2', ready: true }),
      makeInstance({ instanceId: 'supply-3', ready: true }),
    ];
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [advance, unit],
        supply: supplies,
      },
    };

    const tacticResult = applyPlayerCardAction(state, {
      instanceId: advance.instanceId,
      fromZone: 'hand',
      toZone: 'graveyard',
    });
    expect(tacticResult.applied).toBe(true);
    expect(tacticResult.state.playerDemonicAdvanceActive).toBe(true);
    expect(tacticResult.state.log.some((entry) =>
      entry.prefix === 'Played ' &&
      entry.cardName === 'Demonic Advance' &&
      entry.suffix === '.'
    )).toBe(true);

    const unitResult = applyPlayerCardAction(tacticResult.state, {
      instanceId: unit.instanceId,
      fromZone: 'hand',
      toZone: 'battlefieldLeft',
    });
    expect(unitResult.applied).toBe(true);
    expect(unitResult.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: unit.instanceId,
      ready: true,
    });
    expect(unitResult.state.playerDemonicAdvanceActive).toBe(false);
    expect(unitResult.state.zones.supply.every((card) => !card.ready)).toBe(true);
  });

  it('plays IMP004 and resolves the sacrificed unit on-death ability', () => {
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
    const sacrifice = makeInstance({
      instanceId: 'cadaver-supplier',
      ready: true,
      card: createTestCard({
        id: 'IMP002',
        name: 'Cadaver Supplier',
        type: 'Unit',
        attack: 3,
        health: 2,
        influence: 1,
        rulesText: 'On Death: Create a 2/2 Experiment unit token with 0 influence.',
      }),
    });
    const supplies = [
      makeInstance({ instanceId: 'supply-1', ready: true }),
      makeInstance({ instanceId: 'supply-2', ready: true }),
      makeInstance({ instanceId: 'supply-3', ready: true }),
    ];
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [berserker],
        staging: [sacrifice],
        supply: supplies,
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: berserker.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
      options: { sacrificeUnitInstanceId: sacrifice.instanceId },
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.hand).toEqual([]);
    expect(result.state.zones.staging).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: berserker.instanceId, ready: false })])
    );
    expect(result.state.zones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'player',
          ready: false,
          card: expect.objectContaining({ id: 'IMP000', name: 'Experiment' }),
        }),
      ])
    );
    expect(result.state.zones.graveyard[0]?.instanceId).toBe(sacrifice.instanceId);
    expect(result.state.zones.supply.every((instance) => !instance.ready)).toBe(true);
  });

  it('plays IMP005 by discarding another card as an additional cost', () => {
    const myrmidon = makeInstance({
      instanceId: 'myrmidon',
      card: createTestCard({
        id: 'IMP005',
        name: 'Dreadscythe Myrmidon',
        type: 'Unit',
        cost: 4,
        attack: 5,
        health: 4,
        rulesText: 'As an additional cost to play this unit, discard a card.',
      }),
    });
    const discard = makeInstance({ instanceId: 'discard', card: createTestCard({ id: 'discard', name: 'Spare Card', type: 'Tactic' }) });
    const supplies = [
      makeInstance({ instanceId: 'supply-1', ready: true }),
      makeInstance({ instanceId: 'supply-2', ready: true }),
      makeInstance({ instanceId: 'supply-3', ready: true }),
      makeInstance({ instanceId: 'supply-4', ready: true }),
    ];
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [myrmidon, discard],
        supply: supplies,
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: myrmidon.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
      options: { discardCardInstanceId: discard.instanceId },
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.hand).toEqual([]);
    expect(result.state.zones.staging[0]).toMatchObject({
      instanceId: myrmidon.instanceId,
      ready: false,
    });
    expect(result.state.zones.graveyard[0]?.instanceId).toBe(discard.instanceId);
    expect(result.state.zones.supply.every((instance) => !instance.ready)).toBe(true);
  });

  it('plays IMP006 and returns a non-Renowned unit from graveyard to staging exhausted', () => {
    const invoker = makeInstance({
      instanceId: 'invoker',
      card: createTestCard({
        id: 'IMP006',
        name: 'Ebonblight Invoker',
        type: 'Unit',
        cost: 7,
        attack: 3,
        health: 3,
        rulesText: 'On Play: Return a non-Renowned unit from your graveyard to your staging area. (Units enter exhausted.)',
      }),
    });
    const revived = makeInstance({
      instanceId: 'revived',
      card: createTestCard({ id: 'revived', name: 'Revived Unit', type: 'Unit', attack: 2, health: 2 }),
    });
    const supplies = Array.from({ length: 7 }, (_, index) => makeInstance({ instanceId: `supply-${index}`, ready: true }));
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [invoker],
        graveyard: [revived],
        supply: supplies,
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: invoker.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
      options: { reanimateTargetInstanceId: revived.instanceId },
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: invoker.instanceId, ready: false }),
        expect.objectContaining({ instanceId: revived.instanceId, ready: false }),
      ])
    );
    expect(result.state.zones.graveyard).toEqual([]);
  });

  it('plays IMP007 from graveyard and marks it to be banished on death', () => {
    const guineaPig = makeInstance({
      instanceId: 'guinea-pig',
      card: createTestCard({
        id: 'IMP007',
        name: 'Guinea Pig',
        type: 'Unit',
        cost: 1,
        attack: 1,
        health: 1,
        rulesText: 'You may play this card from your graveyard. If you do, it gains "On Death: Banish this instead."',
      }),
    });
    const supply = makeInstance({ instanceId: 'supply', ready: true });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        graveyard: [guineaPig],
        supply: [supply],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: guineaPig.instanceId,
      fromZone: 'graveyard',
      toZone: 'staging',
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.graveyard).toEqual([]);
    expect(result.state.zones.staging[0]).toMatchObject({
      instanceId: guineaPig.instanceId,
      ready: false,
      banishOnDeath: true,
    });
    expect(result.state.zones.supply[0]?.ready).toBe(false);
  });

  it('does not let a player have two Renowned units in play', () => {
    const existingRenowned = makeInstance({
      instanceId: 'existing-renowned',
      card: createTestCard({ id: 'renowned-1', name: 'Existing Renowned', type: 'Renowned Unit', cost: 1 }),
    });
    const secondRenowned = makeInstance({
      instanceId: 'second-renowned',
      card: createTestCard({ id: 'renowned-2', name: 'Second Renowned', type: 'Renowned Unit', cost: 1 }),
    });
    const supply = makeInstance({ instanceId: 'supply', ready: true });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [secondRenowned],
        staging: [existingRenowned],
        supply: [supply],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: secondRenowned.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
    });

    expect(result.applied).toBe(false);
    expect(result.error).toBe('You can only have one Renowned unit in play.');
    expect(result.state.zones.hand).toEqual([secondRenowned]);
    expect(result.state.zones.staging).toEqual([existingRenowned]);
  });

  it('lets an existing Renowned unit capture a battlefield', () => {
    const renowned = makeInstance({
      instanceId: 'renowned',
      ready: true,
      card: createTestCard({ id: 'renowned', name: 'Renowned', type: 'Renowned Unit', cost: 1 }),
    });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [renowned],
      },
    };

    const result = resolveBattlefieldAttack(state, 'player', renowned.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }
    expect(result.state.zones.battlefieldLeft[0]?.instanceId).toBe(renowned.instanceId);
  });

  it('plays IMP009 from graveyard ready and marks it to be banished on death', () => {
    const jormun = makeInstance({
      instanceId: 'jormun',
      card: createTestCard({
        id: 'IMP009',
        name: 'Jormun, Feldragon of Wyrmscar',
        type: 'Renowned Unit Dragon',
        cost: 6,
        attack: 6,
        health: 6,
        rulesText: 'You may play this card from your graveyard. If you do, it enters ready and gains "On Death: Banish this instead."',
      }),
    });
    const supplies = Array.from({ length: 6 }, (_, index) => makeInstance({ instanceId: `supply-${index}`, ready: true }));
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        graveyard: [jormun],
        supply: supplies,
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: jormun.instanceId,
      fromZone: 'graveyard',
      toZone: 'staging',
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.graveyard).toEqual([]);
    expect(result.state.zones.staging[0]).toMatchObject({
      instanceId: jormun.instanceId,
      ready: true,
      banishOnDeath: true,
    });
    expect(result.state.zones.supply.every((instance) => !instance.ready)).toBe(true);
  });

  it('attaches equipment to a staging unit and pays its cost', () => {
    const unit = makeInstance({ instanceId: 'host-unit', ready: true });
    const equipment = makeInstance({
      instanceId: 'equipment',
      card: createTestCard({ id: 'equipment', name: 'Equipment', type: 'Item Equipment', cost: 1 }),
    });
    const supply = makeInstance({ instanceId: 'supply', ready: true });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [equipment],
        staging: [unit],
        supply: [supply],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: equipment.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
      options: { attachToInstanceId: unit.instanceId },
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.staging[0]).toMatchObject({
      instanceId: equipment.instanceId,
      attachedToInstanceId: unit.instanceId,
      ready: true,
    });
    expect(result.state.zones.supply[0]?.ready).toBe(false);
  });

  it('applies the same staging and equipment rules to opponent private zones', () => {
    const unit = makeInstance({
      instanceId: 'opponent-unit',
      owner: 'opponent',
      card: createTestCard({ id: 'opponent-unit', name: 'Bot Unit', type: 'Unit', cost: 1, rulesText: '' }),
    });
    const equipment = makeInstance({
      instanceId: 'opponent-equipment',
      owner: 'opponent',
      card: createTestCard({ id: 'opponent-equipment', name: 'Bot Equipment', type: 'Item Equipment', cost: 1 }),
    });
    const supplies = [
      makeInstance({ instanceId: 'opponent-supply-1', owner: 'opponent', ready: true }),
      makeInstance({ instanceId: 'opponent-supply-2', owner: 'opponent', ready: true }),
    ];
    const baseState = makePlayerTurn({
      activePlayer: 'opponent',
    });
    const state = {
      ...baseState,
      opponentZones: {
        ...baseState.opponentZones,
        hand: [unit, equipment],
        staging: [],
        supply: supplies,
      },
    };

    const unitPlay = applyCardAction(state, {
      owner: 'opponent',
      instanceId: unit.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
    });
    const equipmentPlay = applyCardAction(unitPlay.state, {
      owner: 'opponent',
      instanceId: equipment.instanceId,
      fromZone: 'hand',
      toZone: 'staging',
      options: { attachToInstanceId: unit.instanceId },
    });

    expect(equipmentPlay.applied).toBe(true);
    expect(equipmentPlay.state.zones.staging).toEqual([]);
    expect(equipmentPlay.state.opponentZones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: unit.instanceId, ready: false }),
        expect.objectContaining({
          instanceId: equipment.instanceId,
          attachedToInstanceId: unit.instanceId,
        }),
      ])
    );
    expect(equipmentPlay.state.opponentZones.supply.every((instance) => !instance.ready)).toBe(true);
  });

  it('retreats a battlefield unit exhausted with its attached equipment', () => {
    const unit = makeInstance({ instanceId: 'retreating-unit', ready: false, damage: 1 });
    const equipment = makeInstance({
      instanceId: 'attached-equipment',
      ready: true,
      attachedToInstanceId: unit.instanceId,
      card: createTestCard({ id: 'attached-equipment', name: 'Equipment', type: 'Item Equipment' }),
    });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        battlefieldLeft: [unit, equipment],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: unit.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'staging',
      options: { enterExhausted: true },
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.battlefieldLeft).toEqual([]);
    expect(result.state.zones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: unit.instanceId, ready: false, damage: 0 }),
        expect.objectContaining({ instanceId: equipment.instanceId, attachedToInstanceId: unit.instanceId }),
      ])
    );
  });

  it('lets an exhausted unit retreat on the same turn it captured through combat', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2 }),
    });
    const baseState = makePlayerTurn();
    const combatState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const combatResult = resolveBattlefieldAttack(combatState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in combatResult ? combatResult.error : null).toBeNull();
    if ('error' in combatResult) {
      return;
    }

    const retreatResult = applyPlayerCardAction(combatResult.state, {
      instanceId: attacker.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'staging',
      options: { enterExhausted: true },
    });

    expect(retreatResult.applied).toBe(true);
    expect(retreatResult.state.zones.battlefieldLeft).toEqual([]);
    expect(retreatResult.state.zones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: attacker.instanceId, ready: false, retreatLockedUntilNextTurn: false }),
      ])
    );
  });

  it('lets a captured battlefield unit retreat on a later turn', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2 }),
    });
    const baseState = makePlayerTurn();
    const combatState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const combatResult = resolveBattlefieldAttack(combatState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in combatResult ? combatResult.error : null).toBeNull();
    if ('error' in combatResult) {
      return;
    }

    const nextTurnState = advanceToNextTurn(advanceToNextTurn(combatResult.state));
    const retreatResult = applyPlayerCardAction(nextTurnState, {
      instanceId: attacker.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'staging',
    });

    expect(retreatResult.applied).toBe(true);
    expect(retreatResult.state.zones.battlefieldLeft).toEqual([]);
    expect(retreatResult.state.zones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: attacker.instanceId, ready: false, retreatLockedUntilNextTurn: false }),
      ])
    );
  });

  it('flips a face-down territory by paying its printed cost', () => {
    const territory = makeInstance({
      instanceId: 'territory',
      faceDown: true,
      card: createTestCard({ id: 'territory', name: 'Territory', type: 'Territory', cost: 1 }),
    });
    const supply = makeInstance({ instanceId: 'supply', ready: true });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        battlefieldLeft: [territory],
        supply: [supply],
      },
    };

    const result = applyPlayerCardAction(state, {
      instanceId: territory.instanceId,
      fromZone: 'battlefieldLeft',
      toZone: 'battlefieldLeft',
      options: { faceDown: false },
    });

    expect(result.applied).toBe(true);
    expect(result.state.zones.battlefieldLeft[0]?.faceDown).toBe(false);
    expect(result.state.zones.supply[0]?.ready).toBe(false);
  });

  it('rejects arbitrary zone movement and actions during pending combat', () => {
    const handCard = makeInstance({ instanceId: 'hand-card' });
    const attacker = makeInstance({ instanceId: 'attacker', ready: true });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
    });
    const baseState = makePlayerTurn();
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        hand: [handCard],
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };
    const illegalMove = applyPlayerCardAction(state, {
      instanceId: handCard.instanceId,
      fromZone: 'hand',
      toZone: 'graveyard',
    });
    const declared = declareBattlefieldAttack(state, 'player', attacker.instanceId, 'battlefieldLeft');

    expect(illegalMove.applied).toBe(false);
    expect(illegalMove.error).toBe('Cards cannot be moved to Graveyard manually.');
    if ('error' in declared) {
      throw new Error(declared.error);
    }

    const pendingMove = applyPlayerCardAction(declared.state, {
      instanceId: handCard.instanceId,
      fromZone: 'hand',
      toZone: 'supply',
    });

    expect(pendingMove.applied).toBe(false);
    expect(pendingMove.error).toBe('Resolve the pending combat before taking another action.');
  });
});
