import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  applyBotTurnStep,
  buildDeckInstances,
  buildInitialGameState,
  canManuallySupplyFromHand,
  createPrivateZones,
  advanceToNextTurn,
  exhaustSupplyForCost,
  getBattlefieldPlacementError,
  getEquipmentAttachmentError,
  getEquipmentHost,
  getAttachedCards,
  getManualPlayCost,
  getPlayCostError,
  getReadySupplyCount,
  getStagingUnitCards,
  getStagingPlacementError,
  isItemCard,
  placeCardIntoSupply,
  placeAutomaticStartingSupply,
  placeStartingSupply,
  prepareCardForZone,
  resolveAutomaticBotTurn,
  rollFirstPlayer,
  runBotTurn,
  runTurnStart,
  startGameAfterSetup,
  stabilizeAttachmentState,
  splitBattlefieldReplacement,
  triggerCardAbilities,
  markSuppliedThisTurn,
  type GameCardInstance,
  type SavedDeck,
} from './game-rules';

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
    attachedToInstanceId: overrides.attachedToInstanceId ?? null,
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

  it('can force units to return to staging exhausted', () => {
    const unit = makeInstance({
      ready: true,
      card: createTestCard({ id: 'retreating-unit', type: 'Unit', rulesText: 'Blitz (This unit enters ready.)' }),
    });

    expect(prepareCardForZone(unit, 'staging', { enterExhausted: true })).toMatchObject({
      ready: false,
      faceDown: false,
    });
  });

  it('can prepare territories face up or face down for battlefield zones', () => {
    const territory = makeInstance({
      ready: false,
      card: createTestCard({ id: 'territory-1', type: 'Territory' }),
    });

    expect(prepareCardForZone(territory, 'battlefieldLeft')).toMatchObject({
      ready: true,
      faceDown: false,
    });
    expect(prepareCardForZone(territory, 'battlefieldLeft', { faceDown: true })).toMatchObject({
      ready: true,
      faceDown: true,
    });
  });

  it('keeps units ready when they enter a battlefield zone', () => {
    const unit = makeInstance({
      ready: false,
      card: createTestCard({ id: 'unit-1', type: 'Unit' }),
    });

    expect(prepareCardForZone(unit, 'battlefieldLeft')).toMatchObject({
      ready: true,
      faceDown: false,
    });
  });

  it('identifies item cards and equipment attachment targets', () => {
    const unit = makeInstance({ instanceId: 'unit-a', card: createTestCard({ id: 'unit-a', type: 'Unit' }) });
    const item = makeInstance({
      instanceId: 'item-a',
      card: createTestCard({ id: 'item-a', type: 'Item Equipment' }),
      attachedToInstanceId: 'unit-a',
    });
    const opponentUnit = makeInstance({
      instanceId: 'unit-b',
      owner: 'opponent',
      card: createTestCard({ id: 'unit-b', type: 'Unit' }),
    });
    const stagingCards = [unit, item, opponentUnit];

    expect(isItemCard(item.card)).toBe(true);
    expect(getStagingUnitCards(stagingCards, 'player')).toEqual([unit]);
    expect(getAttachedCards(stagingCards, unit.instanceId)).toEqual([item]);
    expect(getEquipmentAttachmentError(stagingCards, 'player', unit.instanceId)).toBeNull();
    expect(getEquipmentAttachmentError(stagingCards, 'player', opponentUnit.instanceId)).toBe(
      'Equipment must be attached to one of your units in the staging area.'
    );
    expect(getEquipmentAttachmentError(stagingCards, 'player', null)).toBe(
      'Equipment must be attached to a unit in your staging area.'
    );
  });

  it('prepares equipment attached to a staging unit', () => {
    const item = makeInstance({
      ready: false,
      card: createTestCard({ id: 'item-1', type: 'Item Equipment' }),
    });

    expect(prepareCardForZone(item, 'staging', { enterReady: true, attachToInstanceId: 'unit-1' })).toMatchObject({
      ready: true,
      faceDown: false,
      attachedToInstanceId: 'unit-1',
    });
  });

  it('finds the current host for attached equipment in a zone', () => {
    const unit = makeInstance({ instanceId: 'unit-1', card: createTestCard({ id: 'unit-1', type: 'Unit' }) });
    const equipment = makeInstance({
      instanceId: 'item-1',
      card: createTestCard({ id: 'item-1', type: 'Item Equipment' }),
      attachedToInstanceId: unit.instanceId,
    });

    expect(getEquipmentHost([unit, equipment], equipment)).toBe(unit);
    expect(getEquipmentHost([equipment], equipment)).toBeNull();
  });

  it('sends orphaned equipment from staging to graveyard', () => {
    const orphanedEquipment = makeInstance({
      instanceId: 'item-1',
      card: createTestCard({ id: 'item-1', type: 'Item Equipment' }),
      attachedToInstanceId: 'missing-unit',
    });
    const zones = {
      deck: [],
      hand: [],
      staging: [orphanedEquipment],
      supply: [],
      graveyard: [],
      banish: [],
      battlefieldLeft: [],
      battlefieldCenter: [],
      battlefieldRight: [],
    };

    const result = stabilizeAttachmentState(zones);

    expect(result.zones.staging).toHaveLength(0);
    expect(result.orphanedAttachments).toHaveLength(1);
    expect(result.zones.graveyard[0]).toMatchObject({
      instanceId: orphanedEquipment.instanceId,
      attachedToInstanceId: null,
    });
  });

  it('keeps battlefield equipment attached to a valid friendly unit host', () => {
    const unit = makeInstance({ instanceId: 'unit-1', card: createTestCard({ id: 'unit-1', type: 'Unit' }) });
    const equipment = makeInstance({
      instanceId: 'item-1',
      card: createTestCard({ id: 'item-1', type: 'Item Equipment' }),
      attachedToInstanceId: unit.instanceId,
    });
    const zones = {
      deck: [],
      hand: [],
      staging: [],
      supply: [],
      graveyard: [],
      banish: [],
      battlefieldLeft: [unit, equipment],
      battlefieldCenter: [],
      battlefieldRight: [],
    };

    const result = stabilizeAttachmentState(zones);

    expect(result.orphanedAttachments).toHaveLength(0);
    expect(result.zones.battlefieldLeft).toEqual([unit, equipment]);
    expect(result.zones.graveyard).toEqual([]);
  });

  it('only allows units in staging', () => {
    const unit = makeInstance({ card: createTestCard({ id: 'unit-1', type: 'Unit' }) });
    const territory = makeInstance({ card: createTestCard({ id: 'territory-1', type: 'Territory' }) });
    const tactic = makeInstance({ card: createTestCard({ id: 'tactic-1', type: 'Tactic' }) });

    expect(getStagingPlacementError(unit)).toBeNull();
    expect(getStagingPlacementError(territory)).toBe('Staging can only hold units.');
    expect(getStagingPlacementError(tactic)).toBe('Staging can only hold units.');
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
    expect(state.playerSuppliedThisTurn).toBe(false);
    expect(state.opponentSuppliedThisTurn).toBe(false);
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

  it('allows one manual supply from hand during the active player main turn', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const playerTurn = startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'player');
    const afterSupply = markSuppliedThisTurn(playerTurn, 'player');
    const opponentTurn = advanceToNextTurn(afterSupply);
    const nextPlayerTurn = advanceToNextTurn(opponentTurn);

    expect(canManuallySupplyFromHand(state, 'player')).toBe(false);
    expect(canManuallySupplyFromHand(playerTurn, 'player')).toBe(true);
    expect(canManuallySupplyFromHand(afterSupply, 'player')).toBe(false);
    expect(canManuallySupplyFromHand(opponentTurn, 'player')).toBe(false);
    expect(canManuallySupplyFromHand(nextPlayerTurn, 'player')).toBe(true);
  });

  it('counts ready supply and exhausts supply cards for a play cost', () => {
    const state = startGameAfterSetup({ ...buildInitialGameState(makeDeck(12), makeDeck(12)), playerStartingSupplyPlaced: true }, 'player');
    const readySupplyA = makeInstance({ instanceId: 'supply-a', ready: true });
    const readySupplyB = makeInstance({ instanceId: 'supply-b', ready: true });
    const exhaustedSupply = makeInstance({ instanceId: 'supply-c', ready: false });
    const stateWithSupply = {
      ...state,
      zones: {
        ...state.zones,
        supply: [readySupplyA, exhaustedSupply, readySupplyB],
      },
    };

    const paidState = exhaustSupplyForCost(stateWithSupply, 'player', 2);

    expect(getReadySupplyCount(stateWithSupply, 'player')).toBe(2);
    expect(getPlayCostError(stateWithSupply, 'player', createTestCard({ name: 'Affordable Unit', cost: 2 }))).toBeNull();
    expect(getPlayCostError(stateWithSupply, 'player', createTestCard({ name: 'Expensive Unit', cost: 3 }))).toBe(
      'Not enough ready supply. Expensive Unit costs 3, but you have 2.'
    );
    expect(paidState.zones.supply.map((instance) => [instance.instanceId, instance.ready])).toEqual([
      ['supply-a', false],
      ['supply-c', false],
      ['supply-b', false],
    ]);
  });

  it('treats face-down territory plays as free and face-up plays at printed cost', () => {
    const territory = createTestCard({ id: 'territory-1', name: 'Frontier Bastion', type: 'Territory', cost: 3 });
    const unit = createTestCard({ id: 'unit-1', name: 'Field Unit', type: 'Unit', cost: 2 });

    expect(getManualPlayCost(territory, 'battlefieldLeft', { faceDown: true })).toBe(0);
    expect(getManualPlayCost(territory, 'battlefieldLeft', { faceDown: false })).toBe(3);
    expect(getManualPlayCost(unit, 'staging')).toBe(2);
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
      ready: false,
    });
    expect(afterBot.opponentSuppliedThisTurn).toBe(true);
    expect(afterBot.opponentZones.hand).toEqual([botDraw]);
    expect(afterBot.opponentZones.staging[0]).toMatchObject({
      instanceId: botUnit.instanceId,
      ready: false,
      faceDown: false,
    });
  });

  it('does not let the bot stage a unit it cannot afford', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const expensiveUnit = makeInstance({
      instanceId: 'opponent-expensive-unit',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-expensive-unit', name: 'Bot Expensive Unit', type: 'Unit', cost: 3 }),
    });
    const botTurn = {
      ...startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent'),
      opponentZones: {
        ...state.opponentZones,
        deck: [],
        hand: [expensiveUnit],
        staging: [],
        supply: [makeInstance({ instanceId: 'opponent-supply-1', owner: 'opponent', ready: true })],
      },
    };

    const afterStage = applyBotTurnStep(botTurn, 'stageUnit');

    expect(afterStage.opponentZones.hand).toEqual([expensiveUnit]);
    expect(afterStage.opponentZones.staging).toHaveLength(0);
    expect(afterStage.opponentZones.supply[0]?.ready).toBe(true);
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

  it('does not let the bot supply more than once in the same turn', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const firstSupply = makeInstance({
      instanceId: 'opponent-supply-choice-1',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-supply-1', name: 'Bot Supply 1', type: 'Action' }),
    });
    const secondSupply = makeInstance({
      instanceId: 'opponent-supply-choice-2',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-supply-2', name: 'Bot Supply 2', type: 'Action' }),
    });
    const botTurn = {
      ...startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent'),
      opponentZones: {
        ...state.opponentZones,
        deck: [],
        hand: [firstSupply, secondSupply],
        supply: [],
      },
    };

    const afterFirstSupply = applyBotTurnStep(botTurn, 'supply');
    const afterSecondSupply = applyBotTurnStep(afterFirstSupply, 'supply');

    expect(afterFirstSupply.opponentZones.supply).toHaveLength(1);
    expect(afterSecondSupply.opponentZones.supply).toHaveLength(1);
    expect(afterSecondSupply.opponentZones.hand).toEqual([secondSupply]);
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

  it('resolves implemented card triggers through the ability registry', () => {
    const state = startGameAfterSetup({ ...buildInitialGameState(makeDeck(12), makeDeck(12)), playerStartingSupplyPlaced: true }, 'player');
    const source = makeInstance({
      card: createTestCard({
        id: 'IMP066',
        name: 'Courier Drone',
        rulesText: 'On Death: Draw a card.',
      }),
    });
    const deckCard = makeInstance({
      instanceId: 'player-draw-card',
      card: createTestCard({ id: 'draw-card', name: 'Drawn Card' }),
    });
    const stateWithKnownDeck = {
      ...state,
      zones: {
        ...state.zones,
        deck: [deckCard],
        hand: [],
      },
      log: [],
    };

    const nextState = triggerCardAbilities(stateWithKnownDeck, 'onDeath', { source, zone: 'graveyard' });

    expect(nextState.zones.deck).toHaveLength(0);
    expect(nextState.zones.hand).toEqual([deckCard]);
    expect(nextState.log[0]?.suffix).toBe('Courier Drone drew 1 card.');
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
    const unit = makeInstance({ ready: true, card: createTestCard({ id: 'unit-1', type: 'Unit' }) });
    const otherUnit = makeInstance({ instanceId: 'player-unit-2', ready: true, card: createTestCard({ id: 'unit-2', type: 'Unit' }) });
    const attachedItem = makeInstance({
      instanceId: 'item-1',
      card: createTestCard({ id: 'item-1', type: 'Item Equipment' }),
      attachedToInstanceId: unit.instanceId,
    });

    expect(getBattlefieldPlacementError(unit, [])).toBeNull();
    expect(getBattlefieldPlacementError(otherUnit, [unit])).toBe('already has a unit.');
    expect(getBattlefieldPlacementError(otherUnit, [attachedItem])).toBeNull();
  });

  it('requires units to be ready before entering a battlefield zone', () => {
    const exhaustedUnit = makeInstance({
      ready: false,
      card: createTestCard({ id: 'unit-1', type: 'Unit' }),
    });

    expect(getBattlefieldPlacementError(exhaustedUnit, [])).toBe('requires a ready unit.');
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
