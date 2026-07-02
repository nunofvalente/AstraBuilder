import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import { applyCardAction, applyPlayerCardAction } from './game-actions';
import {
  buildInitialGameState,
  declareBattlefieldAttack,
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
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
    damage: overrides.damage ?? 0,
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
    });
    expect(faceDownPlay.state.zones.supply[0]?.ready).toBe(true);
    expect(faceUpPlay.state.zones.battlefieldCenter[0]?.faceDown).toBe(false);
    expect(faceUpPlay.state.zones.supply[0]?.ready).toBe(false);
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
    const unit = makeInstance({ instanceId: 'retreating-unit', ready: true, damage: 1 });
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
