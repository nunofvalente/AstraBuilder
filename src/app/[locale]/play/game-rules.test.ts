import { describe, expect, it } from 'vitest';

import { createTestCard } from '../create/deck-builder/test-utils';
import {
  applyBotTurnStep,
  playFirstBotCounter,
  resolveAutomaticBotTurn,
  runBotTurn,
} from './game-bot';
import {
  addLogEntry,
  adjustVictoryPoints,
  buildDeckInstances,
  buildInitialGameState,
  canManuallySupplyFromHand,
  createPrivateZones,
  declareBattlefieldAttack,
  advanceToNextTurn,
  exhaustSupplyForCost,
  getBattlefieldPlacementError,
  getCounterPlayError,
  getEquipmentAttachmentError,
  getEquipmentHost,
  getAttachedCards,
  getManualPlayCost,
  getModifiedPlayCost,
  getCounterTargetOptions,
  getPlayCostError,
  getReadySupplyCount,
  getStagingUnitCards,
  getStagingPlacementError,
  getBattlefieldAttackError,
  isItemCard,
  isCounterCard,
  placeCardIntoSupply,
  placeAutomaticStartingSupply,
  placeStartingSupply,
  prepareCardForZone,
  passCounterPriority,
  playCounterCard,
  resolvePendingChoice,
  resolveBattlefieldAttack,
  rollFirstPlayer,
  runTurnStart,
  clearEndOfTurnDamage,
  scoreBattlefieldVictoryPoints,
  startGameAfterSetup,
  stabilizeAttachmentState,
  splitBattlefieldReplacement,
  triggerCardAbilities,
  VICTORY_POINT_TARGET,
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
    damage: overrides.damage ?? 0,
    retreatLockedUntilNextTurn: overrides.retreatLockedUntilNextTurn ?? false,
    banishOnDeath: overrides.banishOnDeath ?? false,
    loseVictoryPointOnDeathThisTurnCount: overrides.loseVictoryPointOnDeathThisTurnCount ?? 0,
    discardCardOnDeathThisTurnCount: overrides.discardCardOnDeathThisTurnCount ?? 0,
  };
}

describe('game rules', () => {
  it('records every card name contained in a log message', () => {
    const state = buildInitialGameState(makeDeck(10), null);
    const firstName = state.zones.hand[0]!.card.name;
    const secondName = state.zones.deck[0]!.card.name;

    const log = addLogEntry(state, {
      suffix: `${firstName} fought ${secondName}, then ${firstName} readied.`,
    });

    expect(log[0]?.cardNames?.sort()).toEqual([firstName, secondName].sort());
  });

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
    expect(state.playerVictoryPoints).toBe(0);
    expect(state.opponentVictoryPoints).toBe(0);
    expect(state.winner).toBeNull();
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

  it('reduces tactic costs by 1 while IMP003 is in play for its controller', () => {
    const calico = makeInstance({
      instanceId: 'calico',
      ready: true,
      card: createTestCard({ id: 'IMP003', name: 'Calico, the Blood Witch', type: 'Renowned Unit', rulesText: 'Your tactics cost {1} less to play.' }),
    });
    const tactic = createTestCard({ id: 'tactic-1', name: 'Test Tactic', type: 'Tactic', cost: 2 });
    const unit = createTestCard({ id: 'unit-1', name: 'Test Unit', type: 'Unit', cost: 2 });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const state = {
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [calico],
      },
    };

    expect(getModifiedPlayCost(state, 'player', tactic)).toBe(1);
    expect(getModifiedPlayCost(state, 'player', unit)).toBe(2);
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

  it('lets the bot attack from staging to capture an empty battlefield', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const botUnit = makeInstance({
      instanceId: 'opponent-ready-unit',
      owner: 'opponent',
      ready: true,
      card: createTestCard({
        id: 'bot-ready-unit',
        name: 'Bot Ready Unit',
        type: 'Unit',
        attack: 2,
        health: 2,
        influence: 1,
      }),
    });
    const botTurn = {
      ...startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent'),
      opponentZones: {
        ...state.opponentZones,
        hand: [],
        staging: [botUnit],
      },
    };

    const afterAttack = applyBotTurnStep(botTurn, 'attackBattlefield');

    expect(afterAttack.opponentZones.staging).toEqual([]);
    expect(afterAttack.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: botUnit.instanceId,
      owner: 'opponent',
      ready: true,
    });
    expect(afterAttack.pendingCombat).toBeNull();
    expect(afterAttack.log.some((entry) => entry.suffix.includes('counter priority'))).toBe(false);
    expect(afterAttack.opponentVictoryPoints).toBe(0);
  });

  it('lets the bot attack player-occupied battlefields before open ones', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const botUnit = makeInstance({
      instanceId: 'opponent-ready-unit',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'bot-ready-unit', name: 'Bot Ready Unit', type: 'Unit', attack: 3, health: 3 }),
    });
    const playerUnit = makeInstance({
      instanceId: 'player-battlefield-unit',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'player-battlefield-unit', name: 'Player Unit', type: 'Unit', attack: 1, health: 2 }),
    });
    const botTurn = {
      ...startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent'),
      opponentZones: {
        ...state.opponentZones,
        hand: [],
        staging: [botUnit],
      },
      zones: {
        ...state.zones,
        battlefieldCenter: [playerUnit],
      },
    };

    const afterAttack = applyBotTurnStep(botTurn, 'attackBattlefield');

    expect(afterAttack.pendingCombat).toMatchObject({
      attackerOwner: 'opponent',
      priorityOwner: 'player',
      counterStack: [],
    });
    expect(afterAttack.opponentZones.staging[0]?.instanceId).toBe(botUnit.instanceId);
    expect(afterAttack.zones.battlefieldCenter[0]?.instanceId).toBe(playerUnit.instanceId);

    const playerPassed = passCounterPriority(afterAttack, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    const botPassed = passCounterPriority(playerPassed.state, 'opponent');
    expect('error' in botPassed ? botPassed.error : null).toBeNull();
    if ('error' in botPassed) {
      return;
    }

    expect(botPassed.state.pendingCombat).toBeNull();
    expect(botPassed.state.zones.battlefieldCenter[0]?.instanceId).toBe(botUnit.instanceId);
    expect(botPassed.state.zones.graveyard[0]?.instanceId).toBe(playerUnit.instanceId);
  });

  it('does not continue bot turn actions while counter priority is pending', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const botUnit = makeInstance({
      instanceId: 'opponent-ready-unit',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'bot-ready-unit', name: 'Bot Ready Unit', type: 'Unit', attack: 2, health: 2 }),
    });
    const playerUnit = makeInstance({
      instanceId: 'player-battlefield-unit',
      owner: 'player',
      ready: true,
      card: createTestCard({ id: 'player-battlefield-unit', name: 'Player Unit', type: 'Unit', attack: 1, health: 2 }),
    });
    const botHandCard = makeInstance({
      instanceId: 'opponent-hand-card',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-hand-card', name: 'Bot Hand Card', type: 'Action' }),
    });
    const botTurn = {
      ...startGameAfterSetup({ ...state, playerStartingSupplyPlaced: true }, 'opponent'),
      opponentZones: {
        ...state.opponentZones,
        hand: [botHandCard],
        staging: [botUnit],
      },
      zones: {
        ...state.zones,
        battlefieldLeft: [playerUnit],
      },
    };
    const declared = declareBattlefieldAttack(botTurn, 'opponent', botUnit.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    expect(canManuallySupplyFromHand(declared.state, 'opponent')).toBe(false);
    expect(applyBotTurnStep(declared.state, 'supply')).toBe(declared.state);
    expect(runBotTurn(declared.state)).toBe(declared.state);
    expect(resolveAutomaticBotTurn(declared.state)).toBe(declared.state);
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
        id: 'IMP065',
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

  it('only allows ready staging units to attack battlefields', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit' }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit' }),
    });
    const battlefieldUnit = makeInstance({
      instanceId: 'occupant',
      ready: true,
      card: createTestCard({ id: 'occupant', name: 'Occupant', type: 'Unit' }),
    });
    const state = {
      ...buildInitialGameState(makeDeck(12), makeDeck(12)),
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...buildInitialGameState(makeDeck(12), makeDeck(12)).zones,
        staging: [attacker],
        battlefieldLeft: [battlefieldUnit],
      },
    };

    expect(getBattlefieldAttackError(state, 'player', attacker.instanceId, 'battlefieldCenter')).toBeNull();
    expect(getBattlefieldAttackError(state, 'player', battlefieldUnit.instanceId, 'battlefieldCenter')).toBe(
      'Only units in your staging area can attack.'
    );
    expect(getBattlefieldAttackError(state, 'player', attacker.instanceId, 'battlefieldLeft')).toBe(
      'Battlefield 1 is already occupied by your unit.'
    );
  });

  it('captures an empty battlefield with a staging attacker without scoring victory points', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({
        id: 'attacker',
        name: 'Attacker',
        type: 'Unit',
        attack: 2,
        health: 2,
        influence: 2,
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.captured).toBe(true);
    expect(result.scoredVictoryPoints).toBe(0);
    expect(result.state.playerVictoryPoints).toBe(0);
    expect(result.state.log[1]).toMatchObject({
      prefix: 'Attacked ',
      cardName: 'Attacker',
      suffix: ' into Battlefield 1.',
    });
    expect(result.state.log[0]).toMatchObject({
      prefix: 'Captured ',
      cardName: 'Attacker',
      suffix: ' took Battlefield 1.',
    });
    expect(result.state.zones.staging).toEqual([]);
    expect(result.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: attacker.instanceId,
      ready: true,
    });
  });

  it('declares a battlefield attack into a pending counter window before combat resolves', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 2 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    expect(declared.state.pendingCombat).toMatchObject({
      attackerOwner: 'player',
      attackerInstanceId: attacker.instanceId,
      targetZone: 'battlefieldLeft',
      defenderInstanceId: defender.instanceId,
      priorityOwner: 'opponent',
      lastPassedOwner: null,
    });
    expect(declared.state.zones.staging[0]?.instanceId).toBe(attacker.instanceId);
    expect(declared.state.zones.battlefieldLeft[0]?.instanceId).toBe(defender.instanceId);
    expect(getBattlefieldAttackError(declared.state, 'player', attacker.instanceId, 'battlefieldCenter')).toBe(
      'Resolve the pending combat before declaring another attack.'
    );
  });

  it('offers Fortify for an exhausted Caelum defender by discarding a same-affinity card', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 2 }),
    });
    const defender = makeInstance({
      instanceId: 'skyfortress',
      owner: 'player',
      ready: false,
      card: createTestCard({ id: 'IMP067', name: 'Imperial Skyfortress', type: 'Unit', attack: 4, health: 7, affinity: 'Caelum' }),
    });
    const matchingDiscard = makeInstance({
      instanceId: 'matching-discard',
      card: createTestCard({ id: 'matching-discard', name: 'Matching Discard', type: 'Tactic', affinity: 'Caelum' }),
    });
    const offAffinity = makeInstance({
      instanceId: 'off-affinity',
      card: createTestCard({ id: 'off-affinity', name: 'Off Affinity', type: 'Tactic', affinity: 'Lux' }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      zones: {
        ...state.zones,
        hand: [matchingDiscard, offAffinity],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        staging: [attacker],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'opponent', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    expect(declared.state.pendingChoice).toMatchObject({
      kind: 'caelumTarget',
      effect: 'fortifyDiscard',
      sourceInstanceId: defender.instanceId,
      availableInstanceIds: [matchingDiscard.instanceId],
    });

    const resolved = resolvePendingChoice(declared.state, [matchingDiscard.instanceId]);
    expect('error' in resolved ? resolved.error : null).toBeNull();
    if ('error' in resolved) {
      return;
    }

    expect(resolved.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: defender.instanceId,
      ready: true,
    });
    expect(resolved.zones.graveyard[0]?.instanceId).toBe(matchingDiscard.instanceId);
    expect(resolved.zones.hand.some((card) => card.instanceId === matchingDiscard.instanceId)).toBe(false);
  });

  it('has the bot use Fortify automatically for exhausted Caelum defenders', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 2 }),
    });
    const defender = makeInstance({
      instanceId: 'dreadnought',
      owner: 'opponent',
      ready: false,
      card: createTestCard({ id: 'IMP079', name: 'Valrathian Dreadnought', type: 'Unit', attack: 7, health: 9, affinity: 'Caelum' }),
    });
    const matchingDiscard = makeInstance({
      instanceId: 'bot-matching-discard',
      owner: 'opponent',
      card: createTestCard({ id: 'bot-matching-discard', name: 'Bot Matching Discard', type: 'Tactic', affinity: 'Caelum' }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        hand: [matchingDiscard],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    expect(declared.state.pendingChoice).toBeNull();
    expect(declared.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: defender.instanceId,
      ready: true,
    });
    expect(declared.state.opponentZones.graveyard[0]?.instanceId).toBe(matchingDiscard.instanceId);
    expect(declared.state.opponentZones.hand).toEqual([]);
  });

  it('triggers Hellfire Ravager on attack declaration by marking the defending unit immediately', () => {
    const attacker = makeInstance({
      instanceId: 'hellfire-ravager',
      ready: true,
      card: createTestCard({
        id: 'IMP008',
        name: 'Hellfire Ravager',
        type: 'Unit Demon',
        attack: 5,
        health: 5,
        rulesText: 'On Attack: When target defending unit dies this turn, its controller loses 1 victory point.',
      }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 6 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    expect(declared.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: defender.instanceId,
      loseVictoryPointOnDeathThisTurnCount: 1,
    });
  });

  it('makes the defending unit controller lose 1 victory point when a Hellfire Ravager target dies in combat that turn', () => {
    const attacker = makeInstance({
      instanceId: 'hellfire-ravager',
      ready: true,
      card: createTestCard({
        id: 'IMP008',
        name: 'Hellfire Ravager',
        type: 'Unit Demon',
        attack: 5,
        health: 5,
        rulesText: 'On Attack: When target defending unit dies this turn, its controller loses 1 victory point.',
      }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 4 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      opponentVictoryPoints: 3,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    const opponentPassed = passCounterPriority(declared.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }

    const playerPassed = passCounterPriority(opponentPassed.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed || !playerPassed.resolvedCombat) {
      return;
    }

    expect(playerPassed.state.opponentVictoryPoints).toBe(2);
  });

  it('does not open counter priority when attacking an empty battlefield', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 2 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');
    const resolved = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBe('Counter priority only opens when attacking an opposing unit.');
    expect('error' in resolved ? resolved.error : null).toBeNull();
    if ('error' in resolved) {
      return;
    }

    expect(resolved.captured).toBe(true);
    expect(resolved.state.pendingCombat).toBeNull();
    expect(resolved.state.zones.battlefieldLeft[0]?.instanceId).toBe(attacker.instanceId);
  });

  it('resolves pending combat after both players pass counter priority', () => {
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
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    const opponentPassed = passCounterPriority(declared.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }

    expect(opponentPassed.resolvedCombat).toBeNull();
    expect(opponentPassed.state.pendingCombat).toMatchObject({
      priorityOwner: 'player',
      lastPassedOwner: 'opponent',
    });

    const playerPassed = passCounterPriority(opponentPassed.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    expect(playerPassed.resolvedCombat?.captured).toBe(true);
    expect(playerPassed.state.pendingCombat).toBeNull();
    expect(playerPassed.state.zones.staging).toEqual([]);
    expect(playerPassed.state.zones.battlefieldLeft[0]?.instanceId).toBe(attacker.instanceId);
    expect(playerPassed.state.opponentZones.graveyard[0]?.instanceId).toBe(defender.instanceId);
  });

  it('recognizes Counter tactics and Swift cards as counters', () => {
    const counterTactic = createTestCard({ type: 'Tactic', subtype: 'Counter', rulesText: 'Prevent combat damage.' });
    const swiftUnit = createTestCard({ type: 'Unit', subtype: 'Medic', rulesText: 'Swift (You can play this as a counter.)' });
    const normalTactic = createTestCard({ type: 'Tactic', subtype: 'Action', rulesText: 'Draw a card.' });

    expect(isCounterCard(counterTactic)).toBe(true);
    expect(isCounterCard(swiftUnit)).toBe(true);
    expect(isCounterCard(normalTactic)).toBe(false);
  });

  it('pays for a counter, removes it from hand, and resets consecutive passes', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 2 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2 }),
    });
    const counter = makeInstance({
      instanceId: 'opponent-counter',
      owner: 'opponent',
      card: createTestCard({ id: 'counter', name: 'Blinding Mist', type: 'Tactic', subtype: 'Counter', cost: 1 }),
    });
    const supply = makeInstance({ instanceId: 'opponent-supply', owner: 'opponent', ready: true });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        hand: [counter],
        supply: [supply],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    const played = playCounterCard(declared.state, 'opponent', counter.instanceId);
    expect('error' in played ? played.error : null).toBeNull();
    if ('error' in played) {
      return;
    }

    expect(played.state.opponentZones.hand).toEqual([]);
    expect(played.state.opponentZones.supply[0]?.ready).toBe(false);
    expect(played.state.pendingCombat).toMatchObject({
      priorityOwner: 'player',
      lastPassedOwner: null,
      counterStack: [counter],
    });
    expect(getCounterPlayError(played.state, 'opponent', counter.instanceId)).toBe(
      'Waiting for you to pass counter priority.'
    );
  });

  it('lets Blinding Mist prevent damage while an exhausted defender deals no combat damage', () => {
    const attacker = makeInstance({
      instanceId: 'selena',
      ready: true,
      card: createTestCard({ id: 'selena', name: 'Selena, Voice of Unity', type: 'Unit', attack: 3, health: 3 }),
    });
    const defender = makeInstance({
      instanceId: 'myrmidon',
      owner: 'opponent',
      ready: false,
      card: createTestCard({ id: 'IMP005', name: 'Dreadscythe Myrmidon', type: 'Unit', attack: 3, health: 3 }),
    });
    const mist = makeInstance({
      instanceId: 'mist',
      owner: 'opponent',
      card: createTestCard({
        id: 'IMP025',
        name: 'Blinding Mist',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'The next time target defending unit would be dealt combat damage this turn, prevent that damage.',
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        hand: [mist],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }
    const played = playCounterCard(declared.state, 'opponent', mist.instanceId);
    expect('error' in played ? played.error : null).toBeNull();
    if ('error' in played) {
      return;
    }
    const playerPassed = passCounterPriority(played.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }
    const opponentPassed = passCounterPriority(playerPassed.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }

    expect(opponentPassed.state.zones.battlefieldLeft[0]?.instanceId).toBe(defender.instanceId);
    expect(opponentPassed.state.zones.battlefieldLeft[0]?.damage).toBe(0);
    expect(opponentPassed.state.zones.staging[0]).toMatchObject({
      instanceId: attacker.instanceId,
      ready: false,
      damage: 0,
    });
    expect(opponentPassed.state.log.some((entry) =>
      entry.suffix === 'Selena, Voice of Unity dealt 0 damage to Dreadscythe Myrmidon. Dreadscythe Myrmidon dealt 0 damage to Selena, Voice of Unity.'
    )).toBe(true);
  });

  it('requires Quash Insurrection to choose and resolve a valid cheap combat unit target', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3, cost: 2 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2, cost: 2 }),
    });
    const quash = makeInstance({
      instanceId: 'quash',
      card: createTestCard({
        id: 'IMP027',
        name: 'Quash Insurrection',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'Destroy target unit in a combat zone with cost 2 or less.',
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        hand: [quash],
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    const opponentPassedFirst = passCounterPriority(declared.state, 'opponent');
    expect('error' in opponentPassedFirst ? opponentPassedFirst.error : null).toBeNull();
    if ('error' in opponentPassedFirst) {
      return;
    }

    const missingTarget = playCounterCard(opponentPassedFirst.state, 'player', quash.instanceId);
    expect('error' in missingTarget ? missingTarget.error : null).toBe('Choose a target for Quash Insurrection.');

    const played = playCounterCard(opponentPassedFirst.state, 'player', quash.instanceId, {
      targetInstanceId: defender.instanceId,
    });
    expect('error' in played ? played.error : null).toBeNull();
    if ('error' in played) {
      return;
    }
    expect(played.state.pendingCombat?.counterStack[0]?.selectedAbilityTargetInstanceIds).toEqual([defender.instanceId]);

    const opponentPassed = passCounterPriority(played.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }
    const playerPassed = passCounterPriority(opponentPassed.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    expect(playerPassed.state.opponentZones.graveyard.some((card) => card.instanceId === defender.instanceId)).toBe(true);
    expect(playerPassed.state.zones.battlefieldLeft[0]?.instanceId).toBe(attacker.instanceId);
    expect(playerPassed.state.zones.graveyard[0]?.instanceId).toBe(quash.instanceId);
  });

  it('captures the battlefield uncontested when a later counter removes the defender before combat damage', () => {
    const attacker = makeInstance({
      instanceId: 'imperial-fortress',
      ready: true,
      card: createTestCard({ id: 'imperial-fortress', name: 'Imperial Fortress', type: 'Unit', attack: 4, health: 5 }),
    });
    const defender = makeInstance({
      instanceId: 'drone',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'drone', name: 'Drone', type: 'Unit', attack: 1, health: 1 }),
    });
    const medic = makeInstance({
      instanceId: 'medic',
      owner: 'opponent',
      card: createTestCard({
        id: 'IMP045',
        name: 'Nekora Medic',
        type: 'Unit',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'Swift. On Enter: Prevent combat damage.',
      }),
    });
    const voidWarp = makeInstance({
      instanceId: 'void-warp',
      owner: 'player',
      card: createTestCard({
        id: 'IMP088',
        name: 'Void Warp',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: "Put target unit in a combat zone on top of its owner's deck.",
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        hand: [voidWarp],
        staging: [attacker],
        battlefieldCenter: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        hand: [medic],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldCenter');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    const medicPlayed = playCounterCard(declared.state, 'opponent', medic.instanceId, {
      targetInstanceId: defender.instanceId,
    });
    expect('error' in medicPlayed ? medicPlayed.error : null).toBeNull();
    if ('error' in medicPlayed) {
      return;
    }

    const warpPlayed = playCounterCard(medicPlayed.state, 'player', voidWarp.instanceId, {
      targetInstanceId: defender.instanceId,
    });
    expect('error' in warpPlayed ? warpPlayed.error : null).toBeNull();
    if ('error' in warpPlayed) {
      return;
    }

    const opponentPassed = passCounterPriority(warpPlayed.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }

    const playerPassed = passCounterPriority(opponentPassed.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    expect(playerPassed.state.pendingCombat).toBeNull();
    expect(playerPassed.state.zones.staging.some((card) => card.instanceId === attacker.instanceId)).toBe(false);
    expect(playerPassed.state.zones.battlefieldCenter[0]).toMatchObject({
      instanceId: attacker.instanceId,
      damage: 0,
    });
    expect(playerPassed.state.opponentZones.deck[0]?.instanceId).toBe(defender.instanceId);
    expect(playerPassed.state.opponentZones.staging.some((card) => card.instanceId === medic.instanceId)).toBe(true);
    expect(playerPassed.state.log.some((entry) => entry.cardName === 'Imperial Fortress' && entry.prefix === 'Attacked ')).toBe(true);
  });

  it('lets Quash Insurrection target a cheap attacking unit', () => {
    const attacker = makeInstance({
      instanceId: 'cheap-attacker',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'cheap-attacker', name: 'Cheap Attacker', type: 'Unit', attack: 2, health: 2, cost: 2 }),
    });
    const defender = makeInstance({
      instanceId: 'player-defender',
      ready: true,
      card: createTestCard({ id: 'player-defender', name: 'Player Defender', type: 'Unit', attack: 1, health: 3, cost: 3 }),
    });
    const quash = makeInstance({
      instanceId: 'quash',
      card: createTestCard({
        id: 'IMP027',
        name: 'Quash Insurrection',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'Destroy target unit in a combat zone with cost 2 or less.',
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      zones: {
        ...state.zones,
        hand: [quash],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        staging: [attacker],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'opponent', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    expect(getCounterTargetOptions(declared.state, quash).map((target) => target.instanceId)).toEqual([
      attacker.instanceId,
    ]);

    const played = playCounterCard(declared.state, 'player', quash.instanceId, {
      targetInstanceId: attacker.instanceId,
    });
    expect('error' in played ? played.error : null).toBeNull();
    if ('error' in played) {
      return;
    }

    const opponentPassed = passCounterPriority(played.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }
    const playerPassed = passCounterPriority(opponentPassed.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    expect(playerPassed.state.opponentZones.graveyard.some((card) => card.instanceId === attacker.instanceId)).toBe(true);
    expect(playerPassed.state.zones.battlefieldLeft[0]).toMatchObject({ instanceId: defender.instanceId, damage: 0 });
  });

  it('lets Killing Blow destroy the attacking unit before combat damage resolves', () => {
    const attacker = makeInstance({
      instanceId: 'enemy-attacker',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'enemy-attacker', name: 'Enemy Attacker', type: 'Unit', attack: 5, health: 5 }),
    });
    const defender = makeInstance({
      instanceId: 'player-defender',
      ready: true,
      card: createTestCard({ id: 'player-defender', name: 'Player Defender', type: 'Unit', attack: 1, health: 5 }),
    });
    const killingBlow = makeInstance({
      instanceId: 'killing-blow',
      card: createTestCard({
        id: 'IMP026',
        name: 'Killing Blow',
        type: 'Tactic',
        subtype: 'Counter',
        cost: 0,
        rulesText: 'Destroy target unit in a combat zone.',
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      zones: {
        ...state.zones,
        hand: [killingBlow],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        staging: [attacker],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'opponent', attacker.instanceId, 'battlefieldLeft');
    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    expect(getCounterTargetOptions(declared.state, killingBlow).map((target) => target.instanceId)).toContain(attacker.instanceId);

    const played = playCounterCard(declared.state, 'player', killingBlow.instanceId, {
      targetInstanceId: attacker.instanceId,
    });
    expect('error' in played ? played.error : null).toBeNull();
    if ('error' in played) {
      return;
    }

    const opponentPassed = passCounterPriority(played.state, 'opponent');
    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }
    const playerPassed = passCounterPriority(opponentPassed.state, 'player');
    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    expect(playerPassed.state.pendingCombat).toBeNull();
    expect(playerPassed.state.zones.battlefieldLeft[0]).toMatchObject({ instanceId: defender.instanceId, damage: 0 });
    expect(playerPassed.state.opponentZones.graveyard.some((card) => card.instanceId === attacker.instanceId)).toBe(true);
    expect(playerPassed.state.log.some((entry) =>
      entry.suffix === 'Enemy Attacker was removed before combat damage, so combat ends without damage.'
    )).toBe(true);
    expect(playerPassed.resolvedCombat).toMatchObject({
      attackerDestroyed: true,
      defenderDestroyed: false,
      captured: false,
    });
  });

  it('reduces tactic counter costs by 1 while IMP003 is in play', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 2, health: 2 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2 }),
    });
    const calico = makeInstance({
      instanceId: 'calico',
      ready: true,
      card: createTestCard({ id: 'IMP003', name: 'Calico, the Blood Witch', type: 'Renowned Unit', rulesText: 'Your tactics cost {1} less to play.' }),
    });
    const counter = makeInstance({
      instanceId: 'counter',
      card: createTestCard({ id: 'counter-1', name: 'Cheap Counter', type: 'Tactic', subtype: 'Counter', cost: 1 }),
    });
    const supply = makeInstance({ instanceId: 'player-supply', ready: true });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        hand: [counter],
        staging: [attacker, calico],
        supply: [supply],
        battlefieldLeft: [defender],
      },
    };

    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    const playerPriorityState = {
      ...declared.state,
      pendingCombat: declared.state.pendingCombat
        ? {
            ...declared.state.pendingCombat,
            priorityOwner: 'player' as const,
          }
        : null,
    };

    expect(getCounterPlayError(playerPriorityState, 'player', counter.instanceId)).toBeNull();
    const played = playCounterCard(playerPriorityState, 'player', counter.instanceId);

    expect('error' in played ? played.error : null).toBeNull();
    if ('error' in played) {
      return;
    }

    expect(played.state.zones.supply[0]?.ready).toBe(true);
    expect(played.state.pendingCombat?.counterStack.map((entry) => entry.instanceId)).toEqual([counter.instanceId]);
  });

  it('resolves counters top-first before combat and moves them to their owner graveyards', () => {
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
    const opponentCounter = makeInstance({
      instanceId: 'opponent-counter',
      owner: 'opponent',
      card: createTestCard({ id: 'opponent-counter', name: 'First Counter', type: 'Tactic', subtype: 'Counter', cost: 1 }),
    });
    const playerCounter = makeInstance({
      instanceId: 'player-counter',
      owner: 'player',
      card: createTestCard({ id: 'player-counter', name: 'Top Counter', type: 'Tactic', subtype: 'Counter', cost: 1 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        hand: [playerCounter],
        staging: [attacker],
        supply: [makeInstance({ instanceId: 'player-supply', ready: true })],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        hand: [opponentCounter],
        supply: [makeInstance({ instanceId: 'opponent-supply', owner: 'opponent', ready: true })],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');
    if ('error' in declared) {
      throw new Error(declared.error);
    }
    const firstPlayed = playCounterCard(declared.state, 'opponent', opponentCounter.instanceId);
    if ('error' in firstPlayed) {
      throw new Error(firstPlayed.error);
    }
    const topPlayed = playCounterCard(firstPlayed.state, 'player', playerCounter.instanceId);
    if ('error' in topPlayed) {
      throw new Error(topPlayed.error);
    }
    const opponentPassed = passCounterPriority(topPlayed.state, 'opponent');
    if ('error' in opponentPassed) {
      throw new Error(opponentPassed.error);
    }
    const playerPassed = passCounterPriority(opponentPassed.state, 'player');

    expect('error' in playerPassed ? playerPassed.error : null).toBeNull();
    if ('error' in playerPassed) {
      return;
    }

    expect(playerPassed.resolvedCounters.map((counter) => counter.instanceId)).toEqual([
      playerCounter.instanceId,
      opponentCounter.instanceId,
    ]);
    expect(playerPassed.state.zones.graveyard[0]?.instanceId).toBe(playerCounter.instanceId);
    expect(playerPassed.state.opponentZones.graveyard[0]?.instanceId).toBe(defender.instanceId);
    expect(playerPassed.state.opponentZones.graveyard[1]?.instanceId).toBe(opponentCounter.instanceId);
    expect(playerPassed.state.zones.battlefieldLeft[0]?.instanceId).toBe(attacker.instanceId);
    expect(playerPassed.state.log.map((entry) => entry.cardName).filter(Boolean)).toEqual(
      expect.arrayContaining([playerCounter.card.name, opponentCounter.card.name])
    );
    expect(
      playerPassed.state.log.filter((entry) => entry.prefix === 'Resolved counter ').every(
        (entry) => entry.suffix === ', but its printed effect is not implemented yet.'
      )
    ).toBe(true);
  });

  it('puts a Swift unit into staging when it resolves as a counter', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 3 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 3 }),
    });
    const swiftCounter = makeInstance({
      instanceId: 'swift-counter',
      owner: 'opponent',
      card: createTestCard({
        id: 'swift-counter',
        name: 'Nekora Medic',
        type: 'Unit',
        subtype: 'Medic',
        cost: 1,
        rulesText: 'Swift (You can play this as a counter.)',
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        hand: [swiftCounter],
        supply: [makeInstance({ instanceId: 'opponent-supply', owner: 'opponent', ready: true })],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');
    if ('error' in declared) {
      throw new Error(declared.error);
    }
    const played = playCounterCard(declared.state, 'opponent', swiftCounter.instanceId);
    if ('error' in played) {
      throw new Error(played.error);
    }
    const playerPassed = passCounterPriority(played.state, 'player');
    if ('error' in playerPassed) {
      throw new Error(playerPassed.error);
    }
    const opponentPassed = passCounterPriority(playerPassed.state, 'opponent');

    expect('error' in opponentPassed ? opponentPassed.error : null).toBeNull();
    if ('error' in opponentPassed) {
      return;
    }

    expect(opponentPassed.state.opponentZones.staging[0]).toMatchObject({
      instanceId: swiftCounter.instanceId,
      ready: false,
    });
  });

  it('lets the bot play its first affordable counter', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit' }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit' }),
    });
    const expensiveCounter = makeInstance({
      instanceId: 'expensive-counter',
      owner: 'opponent',
      card: createTestCard({ name: 'Expensive Counter', type: 'Tactic', subtype: 'Counter', cost: 2 }),
    });
    const affordableCounter = makeInstance({
      instanceId: 'affordable-counter',
      owner: 'opponent',
      card: createTestCard({ name: 'Affordable Counter', type: 'Tactic', subtype: 'Counter', cost: 1 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
      opponentZones: {
        ...state.opponentZones,
        hand: [expensiveCounter, affordableCounter],
        supply: [makeInstance({ instanceId: 'opponent-supply', owner: 'opponent', ready: true })],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');
    if ('error' in declared) {
      throw new Error(declared.error);
    }

    const counterState = playFirstBotCounter(declared.state);

    expect(counterState?.pendingCombat?.counterStack.map((counter) => counter.instanceId)).toEqual([
      affordableCounter.instanceId,
    ]);
    expect(counterState?.pendingCombat?.priorityOwner).toBe('player');
  });

  it('does not advance the turn while combat is pending', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit' }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit' }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      firstPlayer: 'player' as const,
      hasFirstPlayerSkippedDraw: true,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };
    const declared = declareBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in declared ? declared.error : null).toBeNull();
    if ('error' in declared) {
      return;
    }

    const nextState = advanceToNextTurn(declared.state);

    expect(nextState.activePlayer).toBe('player');
    expect(nextState.pendingCombat).toEqual(declared.state.pendingCombat);
    expect(nextState.log[0]?.suffix).toBe('Resolve the pending combat before ending the turn.');
  });

  it('scores victory points from controlled battlefields at end of turn', () => {
    const scoringUnit = makeInstance({
      instanceId: 'scoring-unit',
      ready: true,
      card: createTestCard({
        id: 'scoring-unit',
        name: 'Scoring Unit',
        type: 'Unit',
        influence: 2,
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        battlefieldLeft: [scoringUnit],
      },
    };

    const scoredState = scoreBattlefieldVictoryPoints(activeState, 'player');

    expect(scoredState.playerVictoryPoints).toBe(2);
    expect(scoredState.log[0]?.suffix).toBe('You score 2 victory points from battlefield control.');
  });

  it('scores active player battlefield control before advancing the turn', () => {
    const scoringUnit = makeInstance({
      instanceId: 'scoring-unit',
      ready: true,
      card: createTestCard({
        id: 'scoring-unit',
        name: 'Scoring Unit',
        type: 'Unit',
        influence: 1,
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      firstPlayer: 'player' as const,
      hasFirstPlayerSkippedDraw: true,
      zones: {
        ...state.zones,
        battlefieldLeft: [scoringUnit],
      },
    };

    const nextState = advanceToNextTurn(activeState);

    expect(nextState.playerVictoryPoints).toBe(1);
    expect(nextState.activePlayer).toBe('opponent');
  });

  it('still treats zero-influence units as scoring for Blighted Ruins', () => {
    const token = makeInstance({
      instanceId: 'experiment-token',
      ready: true,
      card: createTestCard({
        id: 'IMP000',
        name: 'Experiment',
        type: 'Unit Token',
        influence: 0,
      }),
    });
    const ruins = makeInstance({
      instanceId: 'blighted-ruins',
      card: createTestCard({
        id: 'IMP030',
        name: 'Blighted Ruins',
        type: 'Territory',
        rulesText: 'Whenever a friendly unit scores this zone, lose 1 victory point. If you do, draw a card.',
      }),
    });
    const drawCard = makeInstance({ instanceId: 'draw-card' });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      playerVictoryPoints: 1,
      zones: {
        ...state.zones,
        deck: [drawCard],
        hand: [],
        battlefieldLeft: [token, ruins],
      },
    };

    const scoredState = scoreBattlefieldVictoryPoints(activeState, 'player');

    expect(scoredState.playerVictoryPoints).toBe(0);
    expect(scoredState.zones.hand[0]?.instanceId).toBe(drawCard.instanceId);
  });

  it('pauses turn advancement for a Lucille score choice instead of sacrificing automatically', () => {
    const lucille = makeInstance({
      instanceId: 'lucille',
      ready: true,
      card: createTestCard({
        id: 'IMP010',
        name: 'Lucille, Blood Baroness',
        type: 'Renowned Unit Vampire',
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.\n\nOn Score: You may sacrifice any number of units in your staging area to gain that many victory points.',
      }),
    });
    const unitOne = makeInstance({ instanceId: 'unit-one', ready: true });
    const unitTwo = makeInstance({ instanceId: 'unit-two', ready: true });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      firstPlayer: 'player' as const,
      hasFirstPlayerSkippedDraw: true,
      zones: {
        ...state.zones,
        battlefieldLeft: [lucille],
        staging: [unitOne, unitTwo],
      },
    };

    const nextState = advanceToNextTurn(activeState);

    expect(nextState.playerVictoryPoints).toBe(1);
    expect(nextState.activePlayer).toBe('player');
    expect(nextState.pendingChoice).toMatchObject({
      kind: 'lucilleScore',
      sourceInstanceId: lucille.instanceId,
      availableUnitInstanceIds: [unitOne.instanceId, unitTwo.instanceId],
      resumeTurnAdvance: true,
    });
    expect(nextState.zones.staging.map((instance) => instance.instanceId)).toEqual([unitOne.instanceId, unitTwo.instanceId]);
  });

  it('lets the player choose zero units for Lucille and then finishes advancing the turn', () => {
    const lucille = makeInstance({
      instanceId: 'lucille',
      ready: true,
      card: createTestCard({
        id: 'IMP010',
        name: 'Lucille, Blood Baroness',
        type: 'Renowned Unit Vampire',
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.\n\nOn Score: You may sacrifice any number of units in your staging area to gain that many victory points.',
      }),
    });
    const unitOne = makeInstance({ instanceId: 'unit-one', ready: true });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      firstPlayer: 'player' as const,
      hasFirstPlayerSkippedDraw: true,
      zones: {
        ...state.zones,
        battlefieldLeft: [lucille],
        staging: [unitOne],
      },
    };

    const pendingState = advanceToNextTurn(activeState);
    const resolvedState = resolvePendingChoice(pendingState, []);

    expect('error' in resolvedState ? resolvedState.error : null).toBeNull();
    if ('error' in resolvedState) {
      return;
    }

    expect(resolvedState.playerVictoryPoints).toBe(1);
    expect(resolvedState.activePlayer).toBe('opponent');
    expect(resolvedState.pendingChoice).toBeNull();
    expect(resolvedState.zones.staging[0]?.instanceId).toBe(unitOne.instanceId);
  });

  it('lets the player choose specific Lucille sacrifices and gains only that many victory points', () => {
    const lucille = makeInstance({
      instanceId: 'lucille',
      ready: true,
      card: createTestCard({
        id: 'IMP010',
        name: 'Lucille, Blood Baroness',
        type: 'Renowned Unit Vampire',
        influence: 1,
        rulesText: 'On Enter: Create a 2/2 Experiment unit token with 0 influence.\n\nOn Score: You may sacrifice any number of units in your staging area to gain that many victory points.',
      }),
    });
    const unitOne = makeInstance({ instanceId: 'unit-one', ready: true });
    const unitTwo = makeInstance({ instanceId: 'unit-two', ready: true });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      firstPlayer: 'player' as const,
      hasFirstPlayerSkippedDraw: true,
      zones: {
        ...state.zones,
        battlefieldLeft: [lucille],
        staging: [unitOne, unitTwo],
      },
    };

    const pendingState = advanceToNextTurn(activeState);
    const resolvedState = resolvePendingChoice(pendingState, [unitTwo.instanceId]);

    expect('error' in resolvedState ? resolvedState.error : null).toBeNull();
    if ('error' in resolvedState) {
      return;
    }

    expect(resolvedState.playerVictoryPoints).toBe(2);
    expect(resolvedState.activePlayer).toBe('opponent');
    expect(resolvedState.pendingChoice).toBeNull();
    expect(resolvedState.zones.staging.map((instance) => instance.instanceId)).toEqual([unitOne.instanceId]);
    expect(resolvedState.zones.graveyard[0]?.instanceId).toBe(unitTwo.instanceId);
  });

  it('resolves Nerezza by sacrificing a chosen unit and then stealing a chosen enemy combat-zone unit', () => {
    const nerezza = makeInstance({
      instanceId: 'nerezza',
      ready: false,
      card: createTestCard({
        id: 'IMP011',
        name: 'Nerezza, Umbrasco Scion',
        type: 'Renowned Unit Vampire',
        rulesText: 'On Play: You may sacrifice another unit. If you do, take control of target enemy unit in a combat zone and move it into your staging area exhausted.',
      }),
    });
    const ally = makeInstance({ instanceId: 'ally', ready: true });
    const enemy = makeInstance({ instanceId: 'enemy', owner: 'opponent', ready: true });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const stagedState = triggerCardAbilities({
      ...baseState,
      zones: {
        ...baseState.zones,
        staging: [nerezza, ally],
        battlefieldLeft: [enemy],
      },
      log: [],
    }, 'onPlay', {
      source: nerezza,
      controller: 'player',
      zone: 'staging',
    });

    const afterSacrifice = resolvePendingChoice(stagedState, [ally.instanceId]);
    expect('error' in afterSacrifice ? afterSacrifice.error : null).toBeNull();
    if ('error' in afterSacrifice) {
      return;
    }

    expect(afterSacrifice.pendingChoice).toMatchObject({
      kind: 'nerezzaSteal',
      availableUnitInstanceIds: [enemy.instanceId],
    });

    const afterSteal = resolvePendingChoice(afterSacrifice, [enemy.instanceId]);
    expect('error' in afterSteal ? afterSteal.error : null).toBeNull();
    if ('error' in afterSteal) {
      return;
    }

    expect(afterSteal.zones.battlefieldLeft).toEqual([]);
    expect(afterSteal.zones.staging).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: nerezza.instanceId }),
        expect.objectContaining({ instanceId: enemy.instanceId, owner: 'opponent', controller: 'player', ready: false }),
      ])
    );
    expect(afterSteal.zones.graveyard[0]?.instanceId).toBe(ally.instanceId);
  });

  it('sends a Nerezza-stolen unit to its original owner graveyard when it dies', () => {
    const stolenUnit = makeInstance({
      instanceId: 'stolen-unit',
      owner: 'opponent',
      controller: 'player',
      ready: true,
      card: createTestCard({ id: 'stolen-unit', name: 'Stolen Unit', type: 'Unit', attack: 1, health: 1 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 3 }),
    });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...baseState.zones,
        staging: [stolenUnit],
        battlefieldLeft: [defender],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', stolenUnit.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.attackerDestroyed).toBe(true);
    expect(result.state.zones.graveyard.some((card) => card.instanceId === stolenUnit.instanceId)).toBe(false);
    expect(result.state.opponentZones.graveyard[0]).toMatchObject({
      instanceId: stolenUnit.instanceId,
      owner: 'opponent',
      controller: undefined,
    });
  });

  it('resolves Nocturne Agent by marking a unit, then forcing its controller to discard when it dies this turn', () => {
    const agent = makeInstance({
      instanceId: 'agent',
      ready: false,
      card: createTestCard({
        id: 'IMP012',
        name: 'Nocturne Agent',
        type: 'Unit Human',
        rulesText: 'On Enter: If target enemy unit dies this turn, its controller discards a card.',
      }),
    });
    const playerUnit = makeInstance({ instanceId: 'player-unit', ready: true });
    const discardCard = makeInstance({ instanceId: 'discard-card', card: createTestCard({ id: 'discard', name: 'Discard Me', type: 'Tactic' }) });
    const enemyAttacker = makeInstance({ instanceId: 'enemy-attacker', owner: 'opponent', ready: true, card: createTestCard({ id: 'enemy-attacker', name: 'Enemy Attacker', type: 'Unit', attack: 3, health: 3 }) });
    const baseState = buildInitialGameState(makeDeck(12), makeDeck(12));
    const markedState = triggerCardAbilities({
      ...baseState,
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      zones: {
        ...baseState.zones,
        hand: [discardCard],
        battlefieldLeft: [playerUnit],
      },
      opponentZones: {
        ...baseState.opponentZones,
        staging: [agent, enemyAttacker],
      },
      log: [],
    }, 'onEnter', {
      source: agent,
      controller: 'opponent',
      zone: 'staging',
    });

    expect(markedState.zones.battlefieldLeft[0]?.discardCardOnDeathThisTurnCount).toBe(1);

    const combatResult = resolveBattlefieldAttack(markedState, 'opponent', enemyAttacker.instanceId, 'battlefieldLeft');
    expect('error' in combatResult ? combatResult.error : null).toBeNull();
    if ('error' in combatResult) {
      return;
    }

    expect(combatResult.state.pendingChoice).toMatchObject({
      kind: 'forcedDiscard',
      availableCardInstanceIds: [discardCard.instanceId],
    });

    const discardedState = resolvePendingChoice(combatResult.state, [discardCard.instanceId]);
    expect('error' in discardedState ? discardedState.error : null).toBeNull();
    if ('error' in discardedState) {
      return;
    }

    expect(discardedState.zones.hand).toEqual([]);
    expect(discardedState.zones.graveyard.map((instance) => instance.instanceId)).toContain(discardCard.instanceId);
  });

  it('never lets victory points fall below zero', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const gainedState = adjustVictoryPoints(state, 'player', 3);
    const reducedState = adjustVictoryPoints(gainedState, 'player', -5);

    expect(reducedState.playerVictoryPoints).toBe(0);
    expect(reducedState.winner).toBeNull();
  });

  it('declares the first player to reach 20 victory points as the winner', () => {
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const nearVictory = adjustVictoryPoints(state, 'player', VICTORY_POINT_TARGET - 1);
    const winningState = adjustVictoryPoints(nearVictory, 'player', 3);

    expect(winningState.playerVictoryPoints).toBe(22);
    expect(winningState.winner).toBe('player');
    expect(adjustVictoryPoints(winningState, 'opponent', VICTORY_POINT_TARGET)).toBe(winningState);
  });

  it('ends the game after scoring and damage cleanup without advancing the turn', () => {
    const scoringUnit = makeInstance({
      instanceId: 'winning-unit',
      ready: true,
      damage: 1,
      card: createTestCard({
        id: 'winning-unit',
        name: 'Winning Unit',
        type: 'Unit',
        health: 3,
        influence: 1,
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      firstPlayer: 'player' as const,
      playerVictoryPoints: VICTORY_POINT_TARGET - 1,
      zones: {
        ...state.zones,
        battlefieldLeft: [scoringUnit],
      },
    };

    const winningState = advanceToNextTurn(activeState);

    expect(winningState.playerVictoryPoints).toBe(VICTORY_POINT_TARGET);
    expect(winningState.winner).toBe('player');
    expect(winningState.activePlayer).toBe('player');
    expect(winningState.zones.battlefieldLeft[0]?.damage).toBe(0);
    expect(winningState.log[0]?.suffix).toBe('You reach 20 victory points and win the game.');
    expect(advanceToNextTurn(winningState)).toBe(winningState);
  });

  it('blocks rule-driven actions after the game has a winner', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit' }),
    });
    const state = {
      ...buildInitialGameState(makeDeck(12), makeDeck(12)),
      phase: 'main' as const,
      activePlayer: 'opponent' as const,
      winner: 'player' as const,
      zones: {
        ...buildInitialGameState(makeDeck(12), makeDeck(12)).zones,
        staging: [attacker],
      },
    };

    expect(canManuallySupplyFromHand(state, 'opponent')).toBe(false);
    expect(getBattlefieldAttackError(state, 'player', attacker.instanceId, 'battlefieldLeft')).toBe('The game is over.');
    expect(applyBotTurnStep(state, 'supply')).toBe(state);
    expect(runBotTurn(state)).toBe(state);
    expect(scoreBattlefieldVictoryPoints(state, 'player')).toBe(state);
  });

  it('destroys defenders and captures when the staging attacker survives combat', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3, influence: 1 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 2 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.defenderDestroyed).toBe(true);
    expect(result.attackerDestroyed).toBe(false);
    expect(result.captured).toBe(true);
    expect(result.state.zones.battlefieldLeft[0]?.instanceId).toBe(attacker.instanceId);
    expect(result.state.zones.battlefieldLeft[0]?.ready).toBe(false);
    expect(result.state.zones.battlefieldLeft[0]?.retreatLockedUntilNextTurn).toBe(true);
    expect(result.state.opponentZones.graveyard[0]?.instanceId).toBe(defender.instanceId);
  });

  it('fires IMP002 on death when destroyed in combat', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 3, health: 3 }),
    });
    const cadaverSupplier = makeInstance({
      instanceId: 'cadaver-supplier',
      owner: 'opponent',
      ready: true,
      card: createTestCard({
        id: 'IMP002',
        name: 'Cadaver Supplier',
        type: 'Unit',
        attack: 1,
        health: 2,
        influence: 1,
        rulesText: 'On Death: Create a 2/2 Experiment unit token with 0 influence.',
      }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [cadaverSupplier],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.state.opponentZones.staging[0]).toMatchObject({
      owner: 'opponent',
      card: expect.objectContaining({ id: 'IMP000', name: 'Experiment' }),
      ready: false,
    });
    expect(result.state.opponentZones.graveyard[0]?.instanceId).toBe(cadaverSupplier.instanceId);
  });

  it('banishes IMP007 instead of sending it to graveyard when it dies after being played from graveyard', () => {
    const attacker = makeInstance({
      instanceId: 'guinea-pig',
      ready: true,
      banishOnDeath: true,
      card: createTestCard({
        id: 'IMP007',
        name: 'Guinea Pig',
        type: 'Unit',
        attack: 1,
        health: 1,
        rulesText: 'You may play this card from your graveyard. If you do, it gains "On Death: Banish this instead."',
      }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 2 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.state.zones.graveyard).toEqual([]);
    expect(result.state.zones.banish[0]?.instanceId).toBe(attacker.instanceId);
    expect(result.state.log.some((entry) =>
      entry.suffix === 'On Death is detected on Guinea Pig, but this ability is not implemented yet.'
    )).toBe(false);
  });

  it('leaves a surviving defender occupying the battlefield when the attacker dies', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 1 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 2, health: 3 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.attackerDestroyed).toBe(true);
    expect(result.defenderDestroyed).toBe(false);
    expect(result.captured).toBe(false);
    expect(result.state.zones.staging).toEqual([]);
    expect(result.state.zones.battlefieldLeft[0]?.instanceId).toBe(defender.instanceId);
    expect(result.state.zones.battlefieldLeft[0]?.ready).toBe(false);
    expect(result.state.zones.graveyard[0]?.instanceId).toBe(attacker.instanceId);
  });

  it('exhausts a surviving ready defender after it deals combat damage', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 3 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 1, health: 3 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.attackerDestroyed).toBe(false);
    expect(result.defenderDestroyed).toBe(false);
    expect(result.state.zones.staging[0]).toMatchObject({
      instanceId: attacker.instanceId,
      ready: false,
    });
    expect(result.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: defender.instanceId,
      ready: false,
      damage: 1,
    });
  });

  it('prevents exhausted defenders from dealing combat damage', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 1 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: false,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 5, health: 3 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.attackerDestroyed).toBe(false);
    expect(result.defenderDestroyed).toBe(false);
    expect(result.captured).toBe(false);
    expect(result.state.zones.battlefieldLeft[0]).toMatchObject({
      instanceId: defender.instanceId,
      damage: 1,
    });
    expect(result.state.zones.staging[0]).toMatchObject({
      instanceId: attacker.instanceId,
      ready: false,
      damage: 0,
    });
  });

  it('destroys units when new combat damage plus marked damage reaches health', () => {
    const attacker = makeInstance({
      instanceId: 'attacker',
      ready: true,
      card: createTestCard({ id: 'attacker', name: 'Attacker', type: 'Unit', attack: 1, health: 3 }),
    });
    const defender = makeInstance({
      instanceId: 'defender',
      owner: 'opponent',
      ready: true,
      damage: 2,
      card: createTestCard({ id: 'defender', name: 'Defender', type: 'Unit', attack: 5, health: 3 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const activeState = {
      ...state,
      phase: 'main' as const,
      activePlayer: 'player' as const,
      zones: {
        ...state.zones,
        staging: [attacker],
        battlefieldLeft: [defender],
      },
    };

    const result = resolveBattlefieldAttack(activeState, 'player', attacker.instanceId, 'battlefieldLeft');

    expect('error' in result ? result.error : null).toBeNull();
    if ('error' in result) {
      return;
    }

    expect(result.defenderDestroyed).toBe(true);
    expect(result.attackerDestroyed).toBe(true);
    expect(result.captured).toBe(false);
    expect(result.state.opponentZones.graveyard[0]?.instanceId).toBe(defender.instanceId);
    expect(result.state.zones.graveyard[0]?.instanceId).toBe(attacker.instanceId);
    expect(result.state.zones.battlefieldLeft).toEqual([]);
  });

  it('clears marked damage at end of turn before the next player starts', () => {
    const damagedStagingUnit = makeInstance({
      instanceId: 'damaged-staging-unit',
      damage: 2,
      card: createTestCard({ id: 'damaged-staging-unit', name: 'Damaged Unit', type: 'Unit', health: 3 }),
    });
    const damagedBattlefieldUnit = makeInstance({
      instanceId: 'damaged-battlefield-unit',
      owner: 'opponent',
      damage: 1,
      card: createTestCard({ id: 'damaged-battlefield-unit', name: 'Damaged Defender', type: 'Unit', health: 3 }),
    });
    const state = buildInitialGameState(makeDeck(12), makeDeck(12));
    const damagedState = {
      ...state,
      zones: {
        ...state.zones,
        staging: [damagedStagingUnit],
        battlefieldLeft: [damagedBattlefieldUnit],
      },
    };

    const cleanedState = clearEndOfTurnDamage(damagedState);

    expect(cleanedState.zones.staging[0]?.damage).toBe(0);
    expect(cleanedState.zones.battlefieldLeft[0]?.damage).toBe(0);
  });
});
