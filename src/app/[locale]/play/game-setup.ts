import { createLogEntry } from './game-log';
import type {
  GameCardInstance,
  GameSessionMode,
  GameState,
  Owner,
  PrivateZones,
  SavedDeck,
} from './game-types';
export function shuffleCards(cards: GameCardInstance[]): GameCardInstance[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function buildDeckInstances(deck: SavedDeck, owner: Owner): GameCardInstance[] {
  return deck.entries.flatMap((entry) =>
    Array.from({ length: entry.count }, (_, index) => ({
      instanceId: `${owner}-${entry.card.id}-${index}-${crypto.randomUUID()}`,
      owner,
      card: entry.card,
      ready: false,
      faceDown: false,
      attachedToInstanceId: null,
      damage: 0,
      retreatLockedUntilNextTurn: false,
    }))
  );
}

export function createPrivateZones(deckCards: GameCardInstance[]): PrivateZones {
  const shuffledDeck = shuffleCards(deckCards);
  const openingHand = shuffledDeck.slice(0, 6);

  return {
    deck: shuffledDeck.slice(openingHand.length),
    hand: openingHand,
    staging: [],
    supply: [],
    graveyard: [],
    banish: [],
  };
}

export function buildInitialGameState(deck: SavedDeck, botDeck: SavedDeck | null, sessionMode: GameSessionMode = 'practice'): GameState {
  const instances = buildDeckInstances(deck, 'player');
  const opponentInstances = botDeck ? buildDeckInstances(botDeck, 'opponent') : [];
  const playerZones = createPrivateZones(instances);
  const opponentSetup = botDeck ? placeAutomaticStartingSupply(createPrivateZones(opponentInstances)) : null;
  const opponentZones = opponentSetup?.zones ?? createPrivateZones(opponentInstances);

  return {
    deckId: deck.id,
    deckTitle: deck.title?.trim() || 'Untitled deck',
    botDeckId: botDeck?.id ?? null,
    botDeckTitle: botDeck?.title?.trim() || null,
    sessionMode,
    turn: 0,
    phase: 'setup',
    activePlayer: null,
    firstPlayer: null,
    hasFirstPlayerSkippedDraw: false,
    playerStartingSupplyPlaced: false,
    opponentStartingSupplyPlaced: Boolean(opponentSetup),
    playerSuppliedThisTurn: false,
    opponentSuppliedThisTurn: false,
    playerVictoryPoints: 0,
    opponentVictoryPoints: 0,
    playerCardsDrawnThisTurn: 0,
    opponentCardsDrawnThisTurn: 0,
    playerDemonicAdvanceActive: false,
    opponentDemonicAdvanceActive: false,
    playerTemporarySupply: 0,
    opponentTemporarySupply: 0,
    winner: null,
    pendingCombat: null,
    pendingChoice: null,
    zones: {
      ...playerZones,
      battlefieldLeft: [],
      battlefieldCenter: [],
      battlefieldRight: [],
    },
    opponentZones,
    log: [
      createLogEntry({
        turn: 0,
        phase: 'setup',
        activePlayer: null,
        suffix: botDeck
          ? `Started setup against ${botDeck.title?.trim() || 'Untitled deck'}. Bot placed starting supply. Choose 1 card from hand as starting supply, then choose who goes first.`
          : `Started practice with ${instances.length} cards. Choose 1 card from hand as starting supply.`,
      }),
    ],
  };
}

export function placeCardIntoSupply(zones: PrivateZones, instanceId: string) {
  const selectedCard = zones.hand.find((instance) => instance.instanceId === instanceId);

  if (!selectedCard) {
    return null;
  }

  const replacementDraw = zones.deck.slice(0, 1);
  const remainingDeck = zones.deck.slice(replacementDraw.length);
  const startingSupply = {
    ...selectedCard,
    faceDown: true,
    ready: true,
  };

  return {
    zones: {
      ...zones,
      deck: remainingDeck,
      hand: [...zones.hand.filter((instance) => instance.instanceId !== instanceId), ...replacementDraw],
      supply: [startingSupply, ...zones.supply],
    },
    selectedCard,
    replacementDraw,
  };
}

export function placeStartingSupply(zones: PrivateZones, instanceId: string) {
  return placeCardIntoSupply(zones, instanceId);
}

export function placeAutomaticStartingSupply(zones: PrivateZones) {
  const selectedCard = zones.hand[0];
  return selectedCard ? placeCardIntoSupply(zones, selectedCard.instanceId) : null;
}

