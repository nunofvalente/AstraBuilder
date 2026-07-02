import type { Card, DeckEntry } from '../create/deck-builder/types';
import { getPlaytestCardType, hasPlaytestKeyword } from './playtest-card-definitions';
import {
  createUnimplementedAbilityMessage,
  getImplementedAbilitiesForTrigger,
  getPrintedAbilityTriggers,
  type AbilityTarget,
  type AbilityTrigger,
} from './playtest-abilities';

export type Owner = 'player' | 'opponent';
export type GamePhase = 'setup' | 'main';
export type GameSessionMode = 'practice' | 'multiplayer';

export type ZoneId =
  | 'deck'
  | 'hand'
  | 'staging'
  | 'supply'
  | 'graveyard'
  | 'banish'
  | 'battlefieldLeft'
  | 'battlefieldCenter'
  | 'battlefieldRight';

export type PrivateZones = Pick<Record<ZoneId, GameCardInstance[]>, 'deck' | 'hand' | 'staging' | 'supply' | 'graveyard' | 'banish'>;

export type SavedDeck = {
  id: string;
  title: string | null;
  cardCount: number;
  entries: DeckEntry[];
};

export type GameCardInstance = {
  instanceId: string;
  owner: Owner;
  card: Card;
  ready: boolean;
  faceDown: boolean;
  attachedToInstanceId: string | null;
};

export type LogEntry = {
  id: string;
  turn: number | null;
  phase: GamePhase | null;
  activePlayer: Owner | null;
  prefix?: string;
  cardName?: string;
  suffix: string;
};

type LogEntryInput = Omit<LogEntry, 'id' | 'turn' | 'phase' | 'activePlayer'> & Partial<Pick<LogEntry, 'turn' | 'phase' | 'activePlayer'>>;

export type GameState = {
  deckId: string;
  deckTitle: string;
  botDeckId: string | null;
  botDeckTitle: string | null;
  sessionMode: GameSessionMode;
  turn: number;
  phase: GamePhase;
  activePlayer: Owner | null;
  firstPlayer: Owner | null;
  hasFirstPlayerSkippedDraw: boolean;
  playerStartingSupplyPlaced: boolean;
  opponentStartingSupplyPlaced: boolean;
  playerSuppliedThisTurn: boolean;
  opponentSuppliedThisTurn: boolean;
  playerInfluence: number;
  opponentInfluence: number;
  zones: Record<ZoneId, GameCardInstance[]>;
  opponentZones: PrivateZones;
  log: LogEntry[];
};

export type BotTurnStep = 'supply' | 'stageUnit';

export type TriggerAbilitiesInput = {
  source: GameCardInstance;
  controller?: Owner;
  zone?: ZoneId | null;
  targets?: AbilityTarget[];
};

export const BATTLEFIELD_ZONE_IDS = ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'] as const satisfies ZoneId[];
export const BATTLEFIELD_ZONES = new Set<ZoneId>(BATTLEFIELD_ZONE_IDS);
export const BOT_TURN_STEPS = ['supply', 'stageUnit'] as const satisfies BotTurnStep[];

export function isTerritoryCard(card: Card): boolean {
  return getPlaytestCardType(card) === 'territory';
}

export function isUnitCard(card: Card): boolean {
  const type = getPlaytestCardType(card);
  return type === 'unit' || type === 'token';
}

export function isItemCard(card: Card): boolean {
  return getPlaytestCardType(card) === 'item';
}

export function hasSuppliedThisTurn(state: GameState, owner: Owner): boolean {
  return owner === 'player' ? state.playerSuppliedThisTurn : state.opponentSuppliedThisTurn;
}

export function canManuallySupplyFromHand(state: GameState, owner: Owner): boolean {
  return state.phase === 'main' && state.activePlayer === owner && !hasSuppliedThisTurn(state, owner);
}

export function markSuppliedThisTurn(state: GameState, owner: Owner): GameState {
  return owner === 'player'
    ? {
        ...state,
        playerSuppliedThisTurn: true,
      }
    : {
        ...state,
        opponentSuppliedThisTurn: true,
      };
}

export function getReadySupplyCount(state: GameState, owner: Owner): number {
  const supplyCards = owner === 'player' ? state.zones.supply : state.opponentZones.supply;
  return supplyCards.filter((instance) => instance.ready).length;
}

export function getPlayCost(card: Card): number {
  return Math.max(0, card.cost);
}

export function getManualPlayCost(card: Card, toZone: ZoneId, options: { faceDown?: boolean } = {}): number {
  if (isTerritoryCard(card) && BATTLEFIELD_ZONES.has(toZone)) {
    return options.faceDown ? 0 : getPlayCost(card);
  }

  return getPlayCost(card);
}

export function getPlayCostError(state: GameState, owner: Owner, card: Card): string | null {
  const cost = getPlayCost(card);
  const readySupplyCount = getReadySupplyCount(state, owner);

  return readySupplyCount >= cost ? null : `Not enough ready supply. ${card.name} costs ${cost}, but you have ${readySupplyCount}.`;
}

export function exhaustSupplyForCost(state: GameState, owner: Owner, cost: number): GameState {
  if (cost <= 0) {
    return state;
  }

  if (owner === 'player') {
    let remainingCost = cost;

    return {
      ...state,
      zones: {
        ...state.zones,
        supply: state.zones.supply.map((instance) => {
          if (remainingCost <= 0 || !instance.ready) {
            return instance;
          }

          remainingCost -= 1;
          return {
            ...instance,
            ready: false,
          };
        }),
      },
    };
  }

  let remainingCost = cost;

  return {
    ...state,
    opponentZones: {
      ...state.opponentZones,
      supply: state.opponentZones.supply.map((instance) => {
        if (remainingCost <= 0 || !instance.ready) {
          return instance;
        }

        remainingCost -= 1;
        return {
          ...instance,
          ready: false,
        };
      }),
    },
  };
}

function resetSuppliedThisTurn(state: GameState, owner: Owner): GameState {
  return owner === 'player'
    ? {
        ...state,
        playerSuppliedThisTurn: false,
      }
    : {
        ...state,
        opponentSuppliedThisTurn: false,
      };
}

export function hasBlitz(card: Card): boolean {
  return hasPlaytestKeyword(card, 'blitz');
}

export function getStagingPlacementError(card: GameCardInstance): string | null {
  return isUnitCard(card.card) ? null : 'Staging can only hold units.';
}

export function getStagingUnitCards(cards: GameCardInstance[], owner: Owner): GameCardInstance[] {
  return cards.filter((instance) => instance.owner === owner && isUnitCard(instance.card));
}

export function getAttachedCards(cards: GameCardInstance[], hostInstanceId: string): GameCardInstance[] {
  return cards.filter((instance) => instance.attachedToInstanceId === hostInstanceId);
}

export function getEquipmentHost(cards: GameCardInstance[], equipment: GameCardInstance): GameCardInstance | null {
  if (!equipment.attachedToInstanceId) {
    return null;
  }

  return cards.find((instance) => instance.instanceId === equipment.attachedToInstanceId) ?? null;
}

export function getEquipmentAttachmentError(
  stagingCards: GameCardInstance[],
  owner: Owner,
  attachToInstanceId: string | null | undefined
): string | null {
  if (!attachToInstanceId) {
    return 'Equipment must be attached to a unit in your staging area.';
  }

  const targetUnit = stagingCards.find(
    (instance) => instance.instanceId === attachToInstanceId && instance.owner === owner && isUnitCard(instance.card)
  );

  return targetUnit ? null : 'Equipment must be attached to one of your units in the staging area.';
}

export function stabilizeAttachmentState(
  zones: Record<ZoneId, GameCardInstance[]>
): { zones: Record<ZoneId, GameCardInstance[]>; orphanedAttachments: GameCardInstance[] } {
  const nextZones = { ...zones };
  const orphanedAttachments: GameCardInstance[] = [];

  for (const zoneId of ['staging', ...BATTLEFIELD_ZONE_IDS] satisfies ZoneId[]) {
    const zoneCards = nextZones[zoneId];
    const nextZoneCards: GameCardInstance[] = [];

    for (const instance of zoneCards) {
      if (!isItemCard(instance.card) || !instance.attachedToInstanceId) {
        nextZoneCards.push(instance);
        continue;
      }

      const host = getEquipmentHost(zoneCards, instance);
      const hasValidHost = Boolean(host && host.owner === instance.owner && isUnitCard(host.card));

      if (hasValidHost) {
        nextZoneCards.push(instance);
        continue;
      }

      orphanedAttachments.push(prepareCardForZone(instance, 'graveyard'));
    }

    nextZones[zoneId] = nextZoneCards;
  }

  if (orphanedAttachments.length === 0) {
    return {
      zones,
      orphanedAttachments,
    };
  }

  return {
    zones: {
      ...nextZones,
      graveyard: [...orphanedAttachments, ...nextZones.graveyard],
    },
    orphanedAttachments,
  };
}

export function prepareCardForZone(
  instance: GameCardInstance,
  toZone: ZoneId,
  options: { faceDown?: boolean; enterExhausted?: boolean; enterReady?: boolean; attachToInstanceId?: string | null } = {}
): GameCardInstance {
  if (toZone === 'staging' && isUnitCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterExhausted ? false : hasBlitz(instance.card),
      faceDown: false,
      attachedToInstanceId: null,
    };
  }

  if (toZone === 'staging' && isItemCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterReady ?? instance.ready,
      faceDown: false,
      attachedToInstanceId: options.attachToInstanceId ?? instance.attachedToInstanceId,
    };
  }

  if (BATTLEFIELD_ZONES.has(toZone) && isItemCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterReady ?? instance.ready,
      faceDown: false,
      attachedToInstanceId: options.attachToInstanceId ?? instance.attachedToInstanceId,
    };
  }

  if (BATTLEFIELD_ZONES.has(toZone)) {
    return {
      ...instance,
      ready: true,
      faceDown: options.faceDown ?? false,
      attachedToInstanceId: null,
    };
  }

  return {
    ...instance,
    faceDown: options.faceDown ?? false,
    attachedToInstanceId: null,
  };
}

export function triggerCardAbilities(state: GameState, trigger: AbilityTrigger, input: TriggerAbilitiesInput): GameState {
  const controller = input.controller ?? input.source.owner;
  const implementedAbilities = getImplementedAbilitiesForTrigger(input.source.card.id, trigger);
  let nextState = state;

  for (const ability of implementedAbilities) {
    const resolution = ability.resolve?.({
      state: nextState,
      event: {
        trigger,
        source: input.source,
        controller,
        zone: input.zone ?? null,
        targets: input.targets,
      },
    });

    if (resolution) {
      nextState = resolution.resolved && resolution.message
        ? {
            ...resolution.state,
            log: addLogEntry(resolution.state, {
              suffix: resolution.message,
            }),
          }
        : resolution.state;
    }
  }

  if (implementedAbilities.length === 0 && getPrintedAbilityTriggers(input.source.card).includes(trigger)) {
    return {
      ...nextState,
      log: addLogEntry(nextState, {
        suffix: createUnimplementedAbilityMessage(input.source.card, trigger),
      }),
    };
  }

  return nextState;
}

export function createLogEntry({
  turn = null,
  phase = null,
  activePlayer = null,
  prefix,
  cardName,
  suffix,
}: {
  turn?: number | null;
  phase?: GamePhase | null;
  activePlayer?: Owner | null;
  prefix?: string;
  cardName?: string;
  suffix: string;
}): LogEntry {
  return {
    id: crypto.randomUUID(),
    turn,
    phase,
    activePlayer,
    prefix,
    cardName,
    suffix,
  };
}

export function addLogEntry(state: GameState, entry: LogEntryInput): LogEntry[] {
  return [
    createLogEntry({
      ...entry,
      turn: state.turn,
      phase: state.phase,
      activePlayer: state.activePlayer,
    }),
    ...state.log,
  ].slice(0, 40);
}

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
    playerInfluence: 0,
    opponentInfluence: 0,
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

export function getBattlefieldPlacementError(card: GameCardInstance, destinationCards: GameCardInstance[]): string | null {
  if (isTerritoryCard(card.card)) {
    return null;
  }

  if (isUnitCard(card.card)) {
    if (!card.ready) {
      return 'requires a ready unit.';
    }

    const hasUnit = destinationCards.some((instance) => isUnitCard(instance.card));
    return hasUnit ? 'already has a unit.' : null;
  }

  return 'can only hold units and territories.';
}

export function splitBattlefieldReplacement(card: GameCardInstance, destinationCards: GameCardInstance[]) {
  if (!isTerritoryCard(card.card)) {
    return {
      destinationCards,
      replacedTerritory: null,
    };
  }

  const replacedTerritory = destinationCards.find((instance) => instance.owner === card.owner && isTerritoryCard(instance.card)) ?? null;

  return {
    destinationCards: replacedTerritory
      ? destinationCards.filter((instance) => instance.instanceId !== replacedTerritory.instanceId)
      : destinationCards,
    replacedTerritory,
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

export function startGameAfterSetup(state: GameState, firstPlayer: Owner): GameState {
  const startedState = resetSuppliedThisTurn({
    ...state,
    turn: 1,
    phase: 'main' as const,
    firstPlayer,
    activePlayer: firstPlayer,
    hasFirstPlayerSkippedDraw: false,
    log: addLogEntry(state, {
      suffix: `${firstPlayer === 'player' ? 'You go' : 'Bot goes'} first. Turn 1 begins.`,
    }),
  }, firstPlayer);

  return runTurnStart(readyCardsForOwner(startedState, firstPlayer));
}

export function rollFirstPlayer(): Owner {
  return Math.random() < 0.5 ? 'player' : 'opponent';
}

export function advanceToNextTurn(state: GameState): GameState {
  const nextActivePlayer: Owner = state.activePlayer === 'player' ? 'opponent' : 'player';
  const nextTurn = nextActivePlayer === state.firstPlayer ? state.turn + 1 : state.turn;

  const advancedState = resetSuppliedThisTurn({
    ...state,
    activePlayer: nextActivePlayer,
    turn: nextTurn,
    phase: 'main' as const,
    log: addLogEntry(state, {
      suffix: `${nextActivePlayer === 'player' ? 'Your' : 'Bot'} turn ${nextTurn}.`,
    }),
  }, nextActivePlayer);

  return runTurnStart(readyCardsForOwner(advancedState, nextActivePlayer));
}

export function runBotTurn(state: GameState): GameState {
  if (state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return state;
  }

  return BOT_TURN_STEPS.reduce((nextState, step) => applyBotTurnStep(nextState, step), state);
}

export function resolveAutomaticBotTurn(state: GameState): GameState {
  if (state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return state;
  }

  return advanceToNextTurn(runBotTurn(state));
}

export function applyBotTurnStep(state: GameState, step: BotTurnStep): GameState {
  if (state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return state;
  }

  switch (step) {
    case 'supply':
      return supplyFirstBotHandCard(state);
    case 'stageUnit':
      return stageFirstBotUnit(state);
  }
}

function supplyFirstBotHandCard(state: GameState): GameState {
  if (!canManuallySupplyFromHand(state, 'opponent')) {
    return state;
  }

  const selectedCard = state.opponentZones.hand[0];

  if (!selectedCard) {
    return state;
  }

  const suppliedCard = placeCardIntoSupply(state.opponentZones, selectedCard.instanceId);

  if (!suppliedCard) {
    return state;
  }

  return markSuppliedThisTurn({
    ...state,
    opponentZones: suppliedCard.zones,
    log: addLogEntry(state, {
      prefix: 'Bot supplied ',
      cardName: suppliedCard.selectedCard.card.name,
      suffix: ` and drew ${suppliedCard.replacementDraw.length} ${suppliedCard.replacementDraw.length === 1 ? 'card' : 'cards'}.`,
    }),
  }, 'opponent');
}

function stageFirstBotUnit(state: GameState): GameState {
  const selectedUnit = state.opponentZones.hand.find((instance) => isUnitCard(instance.card) && !getPlayCostError(state, 'opponent', instance.card));

  if (!selectedUnit) {
    return state;
  }

  const paidState = exhaustSupplyForCost(state, 'opponent', getPlayCost(selectedUnit.card));

  return {
    ...paidState,
    opponentZones: {
      ...paidState.opponentZones,
      hand: paidState.opponentZones.hand.filter((instance) => instance.instanceId !== selectedUnit.instanceId),
      staging: [prepareCardForZone(selectedUnit, 'staging'), ...paidState.opponentZones.staging],
    },
    log: addLogEntry(paidState, {
      prefix: 'Bot staged ',
      cardName: selectedUnit.card.name,
      suffix: '.',
    }),
  };
}

function drawForOwner(state: GameState, owner: Owner, count: number): GameState {
  if (count <= 0) {
    return state;
  }

  if (owner === 'player') {
    const drawn = state.zones.deck.slice(0, count);

    return {
      ...state,
      zones: {
        ...state.zones,
        deck: state.zones.deck.slice(drawn.length),
        hand: [...state.zones.hand, ...drawn],
      },
      log: addLogEntry(state, { suffix: `You drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}.` }),
    };
  }

  const drawn = state.opponentZones.deck.slice(0, count);

  return {
    ...state,
    opponentZones: {
      ...state.opponentZones,
      deck: state.opponentZones.deck.slice(drawn.length),
      hand: [...state.opponentZones.hand, ...drawn],
    },
    log: addLogEntry(state, { suffix: `Bot drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}.` }),
  };
}

export function runTurnStart(state: GameState): GameState {
  const activePlayer = state.activePlayer;

  if (!activePlayer) {
    return state;
  }

  if (activePlayer === state.firstPlayer && !state.hasFirstPlayerSkippedDraw) {
    return {
      ...state,
      hasFirstPlayerSkippedDraw: true,
      log: addLogEntry(state, {
        suffix: `${activePlayer === 'player' ? 'You skip' : 'Bot skips'} the first draw.`,
      }),
    };
  }

  return drawForOwner(state, activePlayer, 1);
}

function readyCards(cards: GameCardInstance[]): GameCardInstance[] {
  return cards.map((instance) => ({
    ...instance,
    ready: true,
  }));
}

export function readyCardsForOwner(state: GameState, owner: Owner): GameState {
  const readyBattlefields = Object.fromEntries(
    BATTLEFIELD_ZONE_IDS.map((zone) => [
      zone,
      state.zones[zone].map((instance) => (instance.owner === owner ? { ...instance, ready: true } : instance)),
    ])
  ) as Pick<Record<ZoneId, GameCardInstance[]>, (typeof BATTLEFIELD_ZONE_IDS)[number]>;

  if (owner === 'player') {
    return {
      ...state,
      zones: {
        ...state.zones,
        hand: readyCards(state.zones.hand),
        staging: readyCards(state.zones.staging),
        supply: readyCards(state.zones.supply),
        graveyard: state.zones.graveyard,
        banish: state.zones.banish,
        ...readyBattlefields,
      },
    };
  }

  return {
    ...state,
    zones: {
      ...state.zones,
      ...readyBattlefields,
    },
    opponentZones: {
      ...state.opponentZones,
      hand: readyCards(state.opponentZones.hand),
      staging: readyCards(state.opponentZones.staging),
      supply: readyCards(state.opponentZones.supply),
      graveyard: state.opponentZones.graveyard,
      banish: state.opponentZones.banish,
    },
  };
}
