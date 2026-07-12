import { buildInitialGameState, startGameAfterSetup, type GameCardInstance, type GameState, type LogEntry, type Owner, type PendingChoice, type PrivateZones, type SavedDeck } from '@/app/[locale]/play/game-rules';

import type { MatchDeckSnapshot, PlayerSetupState, SetupCard } from './match-setup';
import type { Card } from '@/app/[locale]/create/deck-builder/types';

const HIDDEN_CARD: Card = {
  id: 'hidden-card', name: 'Hidden card', type: '', affinity: '', number: null, cost: 0, attack: 0, health: 0,
  subtype: '', rarity: '', artist: '', influence: null, rulesText: '', description: '', imageSrc: '', searchContent: '', detailLabel: '',
};

function swapOwner(owner: Owner): Owner {
  return owner === 'player' ? 'opponent' : 'player';
}

function orientInstance(instance: GameCardInstance, swap: boolean, hideCard = false): GameCardInstance {
  return {
    ...instance,
    owner: swap ? swapOwner(instance.owner) : instance.owner,
    controller: instance.controller ? (swap ? swapOwner(instance.controller) : instance.controller) : undefined,
    card: hideCard ? HIDDEN_CARD : instance.card,
  };
}

function orientPrivateZones(zones: PrivateZones, swap: boolean, redactPrivate: boolean): PrivateZones {
  return {
    deck: zones.deck.map((card) => orientInstance(card, swap, redactPrivate)),
    hand: zones.hand.map((card) => orientInstance(card, swap, redactPrivate)),
    staging: zones.staging.map((card) => orientInstance(card, swap)),
    supply: zones.supply.map((card) => orientInstance(card, swap, redactPrivate && card.faceDown)),
    graveyard: zones.graveyard.map((card) => orientInstance(card, swap)),
    banish: zones.banish.map((card) => orientInstance(card, swap)),
  };
}

function swapLogText(text: string): string {
  return text
    .replace(/\bYour\b/g, '__HOST_POSSESSIVE__')
    .replace(/\bYou\b/g, '__HOST__')
    .replace(/\bBot's\b/g, 'Your')
    .replace(/\bBot\b/g, 'You')
    .replace(/__HOST_POSSESSIVE__/g, "Bot's")
    .replace(/__HOST__/g, 'Bot');
}

function redactOpponentSupplyLog(entry: LogEntry, viewerOwner: Owner): LogEntry {
  if (entry.activePlayer === viewerOwner || !entry.cardName) return entry;
  const isStartingSupply = entry.prefix === 'Placed ' && entry.suffix.startsWith(' as starting supply');
  const isManualSupply = entry.prefix === 'Supplied ' && entry.suffix.startsWith(' and drew ');
  if (!isStartingSupply && !isManualSupply) return entry;
  const actor = entry.activePlayer === 'opponent' ? 'Bot' : 'You';
  return {
    ...entry,
    prefix: undefined,
    cardName: undefined,
    cardNames: undefined,
    suffix: isStartingSupply
      ? `${actor} placed a card${entry.suffix}`
      : `${actor} supplied a card${entry.suffix}`,
  };
}

export function swapGameStatePerspective(state: GameState): GameState {
  const playerZones = orientPrivateZones(state.opponentZones, true, false);
  const opponentZones = orientPrivateZones(state.zones, true, false);
  return {
    ...state,
    deckId: state.botDeckId ?? '',
    deckTitle: state.botDeckTitle ?? '',
    botDeckId: state.deckId,
    botDeckTitle: state.deckTitle,
    activePlayer: state.activePlayer ? swapOwner(state.activePlayer) : null,
    firstPlayer: state.firstPlayer ? swapOwner(state.firstPlayer) : null,
    winner: state.winner ? swapOwner(state.winner) : null,
    playerStartingSupplyPlaced: state.opponentStartingSupplyPlaced,
    opponentStartingSupplyPlaced: state.playerStartingSupplyPlaced,
    playerSuppliedThisTurn: state.opponentSuppliedThisTurn,
    opponentSuppliedThisTurn: state.playerSuppliedThisTurn,
    playerVictoryPoints: state.opponentVictoryPoints,
    opponentVictoryPoints: state.playerVictoryPoints,
    playerCardsDrawnThisTurn: state.opponentCardsDrawnThisTurn,
    opponentCardsDrawnThisTurn: state.playerCardsDrawnThisTurn,
    playerDemonicAdvanceActive: state.opponentDemonicAdvanceActive,
    opponentDemonicAdvanceActive: state.playerDemonicAdvanceActive,
    playerTemporarySupply: state.opponentTemporarySupply,
    opponentTemporarySupply: state.playerTemporarySupply,
    zones: {
      ...playerZones,
      battlefieldLeft: state.zones.battlefieldLeft.map((card) => orientInstance(card, true)),
      battlefieldCenter: state.zones.battlefieldCenter.map((card) => orientInstance(card, true)),
      battlefieldRight: state.zones.battlefieldRight.map((card) => orientInstance(card, true)),
    },
    opponentZones,
    pendingCombat: state.pendingCombat ? {
      ...state.pendingCombat,
      attackerOwner: swapOwner(state.pendingCombat.attackerOwner),
      priorityOwner: swapOwner(state.pendingCombat.priorityOwner),
      lastPassedOwner: state.pendingCombat.lastPassedOwner ? swapOwner(state.pendingCombat.lastPassedOwner) : null,
      counterStack: state.pendingCombat.counterStack.map((card) => orientInstance(card, true)),
    } : null,
    pendingChoice: state.pendingChoice ? ({ ...state.pendingChoice, owner: swapOwner(state.pendingChoice.owner) } as PendingChoice) : null,
    scoreLocks: state.scoreLocks?.map((lock) => ({ ...lock, blockedOwner: swapOwner(lock.blockedOwner), expiresAtStartOfOwner: swapOwner(lock.expiresAtStartOfOwner) })),
    log: state.log.map((entry) => ({ ...entry, activePlayer: entry.activePlayer ? swapOwner(entry.activePlayer) : null, prefix: entry.prefix ? swapLogText(entry.prefix) : undefined, suffix: swapLogText(entry.suffix) })),
  };
}

export function projectViewerGameState(state: GameState, seat: 'host' | 'guest'): GameState {
  const swap = seat === 'guest';
  const ownSource = seat === 'host' ? state.zones : state.opponentZones;
  const opponentSource = seat === 'host' ? state.opponentZones : state.zones;
  const ownZones = orientPrivateZones(ownSource, swap, false);
  const opponentZones = orientPrivateZones(opponentSource, swap, true);
  const ownsPendingChoice = Boolean(state.pendingChoice && (state.pendingChoice.owner === (seat === 'host' ? 'player' : 'opponent')));
  const viewerOwner: Owner = seat === 'host' ? 'player' : 'opponent';
  return {
    ...state,
    deckId: seat === 'host' ? state.deckId : state.botDeckId ?? '',
    deckTitle: seat === 'host' ? state.deckTitle : state.botDeckTitle ?? '',
    botDeckId: seat === 'host' ? state.botDeckId : state.deckId,
    botDeckTitle: seat === 'host' ? state.botDeckTitle : state.deckTitle,
    activePlayer: state.activePlayer ? (swap ? swapOwner(state.activePlayer) : state.activePlayer) : null,
    firstPlayer: state.firstPlayer ? (swap ? swapOwner(state.firstPlayer) : state.firstPlayer) : null,
    winner: state.winner ? (swap ? swapOwner(state.winner) : state.winner) : null,
    playerVictoryPoints: seat === 'host' ? state.playerVictoryPoints : state.opponentVictoryPoints,
    opponentVictoryPoints: seat === 'host' ? state.opponentVictoryPoints : state.playerVictoryPoints,
    playerSuppliedThisTurn: seat === 'host' ? state.playerSuppliedThisTurn : state.opponentSuppliedThisTurn,
    opponentSuppliedThisTurn: seat === 'host' ? state.opponentSuppliedThisTurn : state.playerSuppliedThisTurn,
    playerCardsDrawnThisTurn: seat === 'host' ? state.playerCardsDrawnThisTurn : state.opponentCardsDrawnThisTurn,
    opponentCardsDrawnThisTurn: seat === 'host' ? state.opponentCardsDrawnThisTurn : state.playerCardsDrawnThisTurn,
    playerDemonicAdvanceActive: seat === 'host' ? state.playerDemonicAdvanceActive : state.opponentDemonicAdvanceActive,
    opponentDemonicAdvanceActive: seat === 'host' ? state.opponentDemonicAdvanceActive : state.playerDemonicAdvanceActive,
    playerTemporarySupply: seat === 'host' ? state.playerTemporarySupply : state.opponentTemporarySupply,
    opponentTemporarySupply: seat === 'host' ? state.opponentTemporarySupply : state.playerTemporarySupply,
    zones: {
      ...ownZones,
      battlefieldLeft: state.zones.battlefieldLeft.map((card) => orientInstance(card, swap)),
      battlefieldCenter: state.zones.battlefieldCenter.map((card) => orientInstance(card, swap)),
      battlefieldRight: state.zones.battlefieldRight.map((card) => orientInstance(card, swap)),
    },
    opponentZones,
    pendingCombat: state.pendingCombat ? {
      ...state.pendingCombat,
      attackerOwner: swap ? swapOwner(state.pendingCombat.attackerOwner) : state.pendingCombat.attackerOwner,
      priorityOwner: swap ? swapOwner(state.pendingCombat.priorityOwner) : state.pendingCombat.priorityOwner,
      lastPassedOwner: state.pendingCombat.lastPassedOwner ? (swap ? swapOwner(state.pendingCombat.lastPassedOwner) : state.pendingCombat.lastPassedOwner) : null,
      counterStack: state.pendingCombat.counterStack.map((card) => orientInstance(card, swap)),
    } : null,
    pendingChoice: ownsPendingChoice && state.pendingChoice
      ? ({ ...state.pendingChoice, owner: 'player' } as PendingChoice)
      : null,
    log: state.log.map((entry) => redactOpponentSupplyLog(entry, viewerOwner)),
  };
}

function buildInstances(snapshot: MatchDeckSnapshot, cards: SetupCard[], owner: Owner, overrides: Partial<GameCardInstance> = {}): GameCardInstance[] {
  const cardsById = new Map(snapshot.entries.map((entry) => [entry.card.id, entry.card]));
  return cards.flatMap((instance) => {
    const card = cardsById.get(instance.cardId);
    return card ? [{
      instanceId: instance.instanceId, owner, card, ready: false, faceDown: false,
      attachedToInstanceId: null, damage: 0, retreatLockedUntilNextTurn: false, ...overrides,
    }] : [];
  });
}

function buildZones(snapshot: MatchDeckSnapshot, setup: PlayerSetupState, owner: Owner): PrivateZones {
  return {
    deck: buildInstances(snapshot, setup.deck, owner),
    hand: buildInstances(snapshot, setup.hand, owner),
    supply: buildInstances(snapshot, setup.supply, owner, { ready: true, faceDown: true }),
    staging: [], graveyard: [], banish: [],
  };
}

export function buildMultiplayerBoardState(
  hostDeck: MatchDeckSnapshot,
  guestDeck: MatchDeckSnapshot,
  hostSetup: PlayerSetupState,
  guestSetup: PlayerSetupState,
  firstPlayer: 'host' | 'guest'
): GameState {
  return startGameAfterSetup(buildMultiplayerSetupState(hostDeck, guestDeck, hostSetup, guestSetup), firstPlayer === 'host' ? 'player' : 'opponent');
}

export function buildMultiplayerSetupState(
  hostDeck: MatchDeckSnapshot,
  guestDeck: MatchDeckSnapshot,
  hostSetup: PlayerSetupState,
  guestSetup: PlayerSetupState
): GameState {
  const hostSavedDeck: SavedDeck = { ...hostDeck, cardCount: hostDeck.entries.reduce((sum, entry) => sum + entry.count, 0) };
  const guestSavedDeck: SavedDeck = { ...guestDeck, cardCount: guestDeck.entries.reduce((sum, entry) => sum + entry.count, 0) };
  const base = buildInitialGameState(hostSavedDeck, guestSavedDeck, 'multiplayer');
  const hostZones = buildZones(hostDeck, hostSetup, 'player');
  const guestZones = buildZones(guestDeck, guestSetup, 'opponent');
  return {
    ...base,
    playerOpeningHandConfirmed: hostSetup.openingHandConfirmed,
    playerStartingSupplyPlaced: hostSetup.supply.length > 0,
    opponentStartingSupplyPlaced: guestSetup.supply.length > 0,
    zones: { ...hostZones, battlefieldLeft: [], battlefieldCenter: [], battlefieldRight: [] },
    opponentZones: guestZones,
    log: [],
  };
}

export function projectBoardState(state: GameState, seat: 'host' | 'guest') {
  const ownZones = seat === 'host' ? state.zones : state.opponentZones;
  const opponentZones = seat === 'host' ? state.opponentZones : state.zones;
  return {
    revisionIndependentState: {
      turn: state.turn,
      phase: state.phase,
      activeSeat: state.activePlayer === 'player' ? 'host' : state.activePlayer === 'opponent' ? 'guest' : null,
      firstSeat: state.firstPlayer === 'player' ? 'host' : state.firstPlayer === 'opponent' ? 'guest' : null,
      winnerSeat: state.winner === 'player' ? 'host' : state.winner === 'opponent' ? 'guest' : null,
      pendingChoiceSeat: state.pendingChoice?.owner === 'player' ? 'host' : state.pendingChoice?.owner === 'opponent' ? 'guest' : null,
      hostVictoryPoints: state.playerVictoryPoints,
      guestVictoryPoints: state.opponentVictoryPoints,
      battlefield: {
        left: state.zones.battlefieldLeft,
        center: state.zones.battlefieldCenter,
        right: state.zones.battlefieldRight,
      },
    },
    you: { zones: ownZones },
    opponent: {
      handCount: opponentZones.hand.length,
      deckCount: opponentZones.deck.length,
      staging: opponentZones.staging,
      supply: opponentZones.supply.map(({ card: _card, ...instance }) => instance),
      graveyard: opponentZones.graveyard,
      banish: opponentZones.banish,
    },
    viewerState: projectViewerGameState(state, seat),
  };
}
