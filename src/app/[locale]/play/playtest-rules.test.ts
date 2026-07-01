import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  applyBotTurnStep,
  buildDeckInstances,
  buildInitialGameState,
  createPrivateZones,
  advanceToNextTurn,
  getBattlefieldPlacementError,
  placeCardIntoSupply,
  placeAutomaticStartingSupply,
  placeStartingSupply,
  prepareCardForZone,
  resolveAutomaticBotTurn,
  rollFirstPlayer,
  runBotTurn,
  runTurnStart,
  startGameAfterSetup,
  splitBattlefieldReplacement,
  triggerCardAbilities,
  type GameCardInstance,
  type SavedDeck,
} from './playtest-rules';

function makeDeck(cardCount: number): SavedDeck {
  return {
    id: 'deck-1',
    title: 'Rules Deck',
    cardCount,
    entries: Array.from({ length: cardCount }, (_, index) => ({
      card: createTestCard({ id: `card-${index}`, name: `Card ${index}` }),
      count: 1,
    })),
  };
}

function makeInstance(overrides: Partial<GameCardInstance> = {}): GameCardInstance {
  const card = overrides.card ?? createTestCard({ id: 'unit-1', name: 'Unit', type: 'Unit' });

  return {
    instanceId: overrides.instanceId ?? `${overrides.owner ?? 'player'}-${card.id}`,
    owner: overrides.owner ?? 'player',
    card,
    ready: overrides.ready ?? false,
    faceDown: overrides.faceDown ?? false,
  };
}

describe('playtest rules', () => {
  it('sets up each player with 6 cards in hand and no automatic starting supply', () => {
    const deckCards = buildDeckInstances(makeDeck(10), 'player');
    const zones = createPrivateZones(deckCards);

    expect(zones.hand).toHaveLength(6);
    expect(zones.supply).toHaveLength(0);
    expect(zones.deck).toHaveLength(4);
  });

  it('places a chosen hand card as facedown starting supply and draws a replacement', () => {
    const deckCards = buildDeckInstances(makeDeck(10), 'player');
    const zones = createPrivateZones(deckCards);
    const selectedCard = zones.hand[2]!;
    const replacementCard = zones.deck[0]!;

    const result = placeStartingSupply(zones, selectedCard.instanceId);

    expect(result?.selectedCard).toBe(selectedCard);
    expect(result?.replacementDraw).toEqual([replacementCard]);
    expect(result?.zones.supply).toHaveLength(1);
    expect(result?.zones.supply[0]).toMatchObject({
      instanceId: selectedCard.instanceId,
      faceDown: true,
      ready: true,
    });
    expect(result?.zones.hand).toHaveLength(6);
    expect(result?.zones.hand).not.toContain(selectedCard);
    expect(result?.zones.hand).toContain(replacementCard);
    expect(result?.zones.deck).toHaveLength(3);
  });

  it('places any supplied hand card facedown and draws a card', () => {
    const deckCards = buildDeckInstances(makeDeck(10), 'player');
    const zones = createPrivateZones(deckCards);
    const selectedCard = zones.hand[1]!;
    const replacementCard = zones.deck[0]!;

    const result = placeCardIntoSupply(zones, selectedCard.instanceId);

    expect(result?.zones.supply[0]).toMatchObject({
      instanceId: selectedCard.instanceId,
      faceDown: true,
      ready: true,
    });
    expect(result?.zones.hand).toHaveLength(6);
    expect(result?.zones.hand).toContain(replacementCard);
  });

  it('exhausts non-Blitz units that enter staging', () => {
    const unit = makeInstance({
      ready: true,
      card: createTestCard({ id: 'slow-unit', type: 'Unit', rulesText: '' }),
    });

    expect(prepareCardForZone(unit, 'staging')).toMatchObject({
      ready: false,
      faceDown: false,
    });
  });

  it('keeps Blitz units ready when they enter staging', () => {
    const unit = makeInstance({
      ready: false,
      card: createTestCard({ id: 'fast-unit', type: 'Unit', rulesText: 'Blitz (This unit enters ready.)' }),
    });

    expect(prepareCardForZone(unit, 'staging')).toMatchObject({
      ready: true,
      faceDown: false,
    });
  });

  it('can automatically choose bot starting supply during setup', () => {
    const deckCards = buildDeckInstances(makeDeck(10), 'opponent');
    const zones = createPrivateZones(deckCards);
    const selectedCard = zones.hand[0]!;

    const result = placeAutomaticStartingSupply(zones);

    expect(result?.selectedCard).toBe(selectedCard);
    expect(result?.zones.supply[0]).toMatchObject({
      instanceId: selectedCard.instanceId,
      owner: 'opponent',
      faceDown: true,
    });
    expect(result?.zones.hand).toHaveLength(6);
  });

  it('initializes practice games in turn 0 setup with bot supply placed automatically', () => {
    const state = buildInitialGameState(makeDeck(10), makeDeck(10));

    expect(state.turn).toBe(0);
    expect(state.phase).toBe('setup');
    expect(state.sessionMode).toBe('practice');
    expect(state.firstPlayer).toBeNull();
    expect(state.activePlayer).toBeNull();
    expect(state.playerInfluence).toBe(0);
    expect(state.opponentInfluence).toBe(0);
    expect(state.playerStartingSupplyPlaced).toBe(false);
    expect(state.opponentStartingSupplyPlaced).toBe(true);
    expect(state.zones.hand).toHaveLength(6);
    expect(state.zones.supply).toHaveLength(0);
    expect(state.opponentZones.hand).toHaveLength(6);
    expect(state.opponentZones.supply).toHaveLength(1);
  });

  it('starts turn 1 with the selected first player', () => {
    const state = buildInitialGameState(makeDeck(10), makeDeck(10));
    const started = startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent');

    expect(started.turn).toBe(1);
    expect(started.phase).toBe('main');
    expect(started.firstPlayer).toBe('opponent');
    expect(started.activePlayer).toBe('opponent');
  });

  it('rolls a valid first player', () => {
    expect(['player', 'opponent']).toContain(rollFirstPlayer());
  });

  it('only increments the turn after both players have acted', () => {
    const state = buildInitialGameState(makeDeck(10), makeDeck(10));
    const turnOne = startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'player');
    const opponentHalf = advanceToNextTurn(turnOne);
    const turnTwo = advanceToNextTurn(opponentHalf);

    expect(opponentHalf.turn).toBe(1);
    expect(opponentHalf.activePlayer).toBe('opponent');
    expect(turnTwo.turn).toBe(2);
    expect(turnTwo.activePlayer).toBe('player');
  });

  it('skips the first player first draw when turn 1 starts', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const started = startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'player');

    expect(started.hasFirstPlayerSkippedDraw).toBe(true);
    expect(started.zones.hand).toHaveLength(6);
  });

  it('draws for the second player on their first turn', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const turnOne = startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'player');
    const opponentHalf = advanceToNextTurn(turnOne);

    expect(opponentHalf.turn).toBe(1);
    expect(opponentHalf.activePlayer).toBe('opponent');
    expect(opponentHalf.opponentZones.hand).toHaveLength(7);
  });

  it('draws for first player from turn 2 onward', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const turnOne = startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'player');
    const opponentHalf = advanceToNextTurn(turnOne);
    const turnTwo = advanceToNextTurn(opponentHalf);

    expect(turnTwo.turn).toBe(2);
    expect(turnTwo.activePlayer).toBe('player');
    expect(turnTwo.zones.hand).toHaveLength(7);
  });

  it('lets the bot supply, draw, and stage its first unit during its turn', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const botSupply = makeInstance({
      instanceId: 'opponent-supply-choice',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-supply', name: 'Bot Supply', type: 'Action' }),
    });
    const botUnit = makeInstance({
      instanceId: 'opponent-unit-choice',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'bot-unit', name: 'Bot Unit', type: 'Unit', rulesText: '' }),
    });
    const botDraw = makeInstance({
      instanceId: 'opponent-draw-choice',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-draw', name: 'Bot Draw', type: 'Action' }),
    });
    const botTurn = {
      ...startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent'),
      opponentZones: {
        ...state.opponentZones,
        deck: [botDraw],
        hand: [botSupply, botUnit],
        staging: [],
        supply: [],
      },
    };

    const afterBot = runBotTurn(botTurn);

    expect(afterBot.opponentZones.supply[0]).toMatchObject({
      instanceId: botSupply.instanceId,
      faceDown: true,
      ready: true,
    });
    expect(afterBot.opponentZones.hand).toEqual([botDraw]);
    expect(afterBot.opponentZones.staging[0]).toMatchObject({
      instanceId: botUnit.instanceId,
      ready: false,
      faceDown: false,
    });
  });

  it('can apply bot turn decisions one step at a time', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const botSupply = makeInstance({
      instanceId: 'opponent-supply-choice',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-supply', name: 'Bot Supply', type: 'Action' }),
    });
    const botUnit = makeInstance({
      instanceId: 'opponent-unit-choice',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-unit', name: 'Bot Unit', type: 'Unit', rulesText: '' }),
    });
    const botDraw = makeInstance({
      instanceId: 'opponent-draw-choice',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-draw', name: 'Bot Draw', type: 'Action' }),
    });
    const botTurn = {
      ...startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent'),
      opponentZones: {
        ...state.opponentZones,
        deck: [botDraw],
        hand: [botSupply, botUnit],
        staging: [],
        supply: [],
      },
    };

    const afterSupply = applyBotTurnStep(botTurn, 'supply');
    const afterStage = applyBotTurnStep(afterSupply, 'stageUnit');

    expect(afterSupply.opponentZones.supply[0]?.instanceId).toBe(botSupply.instanceId);
    expect(afterSupply.opponentZones.staging).toHaveLength(0);
    expect(afterStage.opponentZones.staging[0]?.instanceId).toBe(botUnit.instanceId);
  });

  it('does not run bot decisions outside the bot main turn', () => {
    const state = startGameAfterSetup({ ...buildInitialGameState(makeDeck(12), makeDeck(12)), playerStartingSupplyPlaced: true }, 'player');

    expect(runBotTurn(state)).toBe(state);
  });

  it('logs detected but unimplemented card triggers', () => {
    const state = startGameAfterSetup({ ...buildInitialGameState(makeDeck(12), makeDeck(12)), playerStartingSupplyPlaced: true }, 'player');
    const source = makeInstance({
      card: createTestCard({ name: 'Trigger Source', rulesText: 'On Enter: Draw a card.' }),
    });

    const nextState = triggerCardAbilities(state, 'onEnter', { source, zone: 'staging' });

    expect(nextState.log[0]?.suffix).toBe('On Enter is detected on Trigger Source, but this ability is not implemented yet.');
  });

  it('resolves the bot turn and advances back to the player', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const botTurn = startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent');

    const playerTurn = resolveAutomaticBotTurn(botTurn);

    expect(playerTurn.activePlayer).toBe('player');
    expect(playerTurn.turn).toBe(1);
  });

  it('does nothing at turn start without an active player', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));

    expect(runTurnStart(state)).toBe(state);
  });

  it('allows one unit in a battlefield zone', () => {
    const unit = makeInstance({ card: createTestCard({ id: 'unit-1', type: 'Unit' }) });
    const otherUnit = makeInstance({ instanceId: 'player-unit-2', card: createTestCard({ id: 'unit-2', type: 'Unit' }) });

    expect(getBattlefieldPlacementError(unit, [])).toBeNull();
    expect(getBattlefieldPlacementError(otherUnit, [unit])).toBe('already has a unit.');
  });

  it('replaces an existing territory from the same owner', () => {
    const oldTerritory = makeInstance({ card: createTestCard({ id: 'territory-1', type: 'Territory' }) });
    const newTerritory = makeInstance({ instanceId: 'player-territory-2', card: createTestCard({ id: 'territory-2', type: 'Territory' }) });
    const opponentTerritory = makeInstance({
      instanceId: 'opponent-territory-1',
      owner: 'opponent',
      card: createTestCard({ id: 'enemy-territory', type: 'Territory' }),
    });

    const placement = splitBattlefieldReplacement(newTerritory, [oldTerritory, opponentTerritory]);

    expect(placement.replacedTerritory).toBe(oldTerritory);
    expect(placement.destinationCards).toEqual([opponentTerritory]);
  });
});
