import type { Card, DeckEntry } from '../create/deck-builder/types';
import { defineCard, getCardType, hasCardKeyword } from './card-definitions';
import {
  createUnimplementedAbilityMessage,
  getImplementedAbilitiesForTrigger,
  getPrintedAbilityTriggers,
  type AbilityTarget,
  type AbilityTrigger,
} from './card-abilities';

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
  damage: number;
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

export type PendingCombat = {
  attackerOwner: Owner;
  attackerInstanceId: string;
  targetZone: ZoneId;
  defenderInstanceId: string | null;
  priorityOwner: Owner;
  lastPassedOwner: Owner | null;
  counterStack: GameCardInstance[];
};

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
  playerVictoryPoints: number;
  opponentVictoryPoints: number;
  winner: Owner | null;
  pendingCombat: PendingCombat | null;
  zones: Record<ZoneId, GameCardInstance[]>;
  opponentZones: PrivateZones;
  log: LogEntry[];
};

export type TriggerAbilitiesInput = {
  source: GameCardInstance;
  controller?: Owner;
  zone?: ZoneId | null;
  targets?: AbilityTarget[];
};

export type BattlefieldAttackResult = {
  state: GameState;
  attacker: GameCardInstance;
  defender: GameCardInstance | null;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  captured: boolean;
  scoredVictoryPoints: number;
};

export type DeclareBattlefieldAttackResult = {
  state: GameState;
  pendingCombat: PendingCombat;
  attacker: GameCardInstance;
  defender: GameCardInstance | null;
};

export type CounterPriorityPassResult = {
  state: GameState;
  resolvedCombat: BattlefieldAttackResult | null;
  resolvedCounters: GameCardInstance[];
};

export type PlayCounterCardResult = {
  state: GameState;
  counter: GameCardInstance;
};

export const BATTLEFIELD_ZONE_IDS = ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'] as const satisfies ZoneId[];
export const BATTLEFIELD_ZONES = new Set<ZoneId>(BATTLEFIELD_ZONE_IDS);
export const VICTORY_POINT_TARGET = 20;

export function isTerritoryCard(card: Card): boolean {
  return getCardType(card) === 'territory';
}

export function isUnitCard(card: Card): boolean {
  const type = getCardType(card);
  return type === 'unit' || type === 'token';
}

export function isItemCard(card: Card): boolean {
  return getCardType(card) === 'item';
}

export function isCounterCard(card: Card): boolean {
  return card.subtype.trim().toLowerCase() === 'counter' || hasCardKeyword(card, 'swift');
}

export function hasSuppliedThisTurn(state: GameState, owner: Owner): boolean {
  return owner === 'player' ? state.playerSuppliedThisTurn : state.opponentSuppliedThisTurn;
}

export function canManuallySupplyFromHand(state: GameState, owner: Owner): boolean {
  return !state.winner && !state.pendingCombat && state.phase === 'main' && state.activePlayer === owner && !hasSuppliedThisTurn(state, owner);
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
  return hasCardKeyword(card, 'blitz');
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
  zones: Record<ZoneId, GameCardInstance[]>,
  owner?: Owner
): { zones: Record<ZoneId, GameCardInstance[]>; orphanedAttachments: GameCardInstance[] } {
  const nextZones = { ...zones };
  const orphanedAttachments: GameCardInstance[] = [];

  for (const zoneId of ['staging', ...BATTLEFIELD_ZONE_IDS] satisfies ZoneId[]) {
    const zoneCards = nextZones[zoneId];
    const nextZoneCards: GameCardInstance[] = [];

    for (const instance of zoneCards) {
      if (!isItemCard(instance.card) || !instance.attachedToInstanceId || (owner && instance.owner !== owner)) {
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
      damage: 0,
    };
  }

  if (toZone === 'staging' && isItemCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterReady ?? instance.ready,
      faceDown: false,
      attachedToInstanceId: options.attachToInstanceId ?? instance.attachedToInstanceId,
      damage: instance.damage,
    };
  }

  if (BATTLEFIELD_ZONES.has(toZone) && isItemCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterReady ?? instance.ready,
      faceDown: false,
      attachedToInstanceId: options.attachToInstanceId ?? instance.attachedToInstanceId,
      damage: instance.damage,
    };
  }

  if (BATTLEFIELD_ZONES.has(toZone)) {
    return {
      ...instance,
      ready: true,
      faceDown: options.faceDown ?? false,
      attachedToInstanceId: null,
      damage: isUnitCard(instance.card) ? instance.damage : 0,
    };
  }

  return {
    ...instance,
    faceDown: options.faceDown ?? false,
    attachedToInstanceId: null,
    damage: 0,
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
      damage: 0,
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
    winner: null,
    pendingCombat: null,
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

function getOwnerStagingCards(state: GameState, owner: Owner): GameCardInstance[] {
  return owner === 'player' ? state.zones.staging : state.opponentZones.staging;
}

export function adjustVictoryPoints(state: GameState, owner: Owner, change: number): GameState {
  if (state.winner || change === 0) {
    return state;
  }

  const currentVictoryPoints = owner === 'player' ? state.playerVictoryPoints : state.opponentVictoryPoints;
  const nextVictoryPoints = Math.max(0, currentVictoryPoints + change);
  const winner = nextVictoryPoints >= VICTORY_POINT_TARGET ? owner : null;

  return {
    ...state,
    ...(owner === 'player'
      ? { playerVictoryPoints: nextVictoryPoints }
      : { opponentVictoryPoints: nextVictoryPoints }),
    winner,
  };
}

export function scoreBattlefieldVictoryPoints(state: GameState, owner: Owner): GameState {
  if (state.winner) {
    return state;
  }

  const scoringUnits = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone]
      .filter((instance) => instance.owner === owner && isUnitCard(instance.card) && defineCard(instance.card).canScore)
      .map((instance) => ({ instance, zone }))
  );
  const scoredVictoryPoints = scoringUnits.reduce((total, { instance }) => total + Math.max(0, instance.card.influence ?? 0), 0);

  if (scoredVictoryPoints <= 0) {
    return state;
  }

  let nextState = {
    ...adjustVictoryPoints(state, owner, scoredVictoryPoints),
    log: addLogEntry(state, {
      suffix: `${owner === 'player' ? 'You score' : 'Bot scores'} ${scoredVictoryPoints} ${scoredVictoryPoints === 1 ? 'victory point' : 'victory points'} from battlefield control.`,
    }),
  };

  for (const { instance, zone } of scoringUnits) {
    nextState = triggerCardAbilities(nextState, 'onScore', {
      source: instance,
      controller: owner,
      zone,
    });
  }

  if (nextState.winner === owner) {
    nextState = {
      ...nextState,
      log: addLogEntry(nextState, {
        suffix: `${owner === 'player' ? 'You reach' : 'Bot reaches'} ${VICTORY_POINT_TARGET} victory points and ${owner === 'player' ? 'win' : 'wins'} the game.`,
      }),
    };
  }

  return nextState;
}

function clearDamage(cards: GameCardInstance[]): GameCardInstance[] {
  return cards.map((instance) =>
    instance.damage > 0
      ? {
          ...instance,
          damage: 0,
        }
      : instance
  );
}

export function clearEndOfTurnDamage(state: GameState): GameState {
  const battlefieldZones = Object.fromEntries(
    BATTLEFIELD_ZONE_IDS.map((zone) => [zone, clearDamage(state.zones[zone])])
  ) as Pick<Record<ZoneId, GameCardInstance[]>, (typeof BATTLEFIELD_ZONE_IDS)[number]>;

  return {
    ...state,
    zones: {
      ...state.zones,
      hand: clearDamage(state.zones.hand),
      staging: clearDamage(state.zones.staging),
      supply: clearDamage(state.zones.supply),
      graveyard: clearDamage(state.zones.graveyard),
      banish: clearDamage(state.zones.banish),
      ...battlefieldZones,
    },
    opponentZones: {
      ...state.opponentZones,
      hand: clearDamage(state.opponentZones.hand),
      staging: clearDamage(state.opponentZones.staging),
      supply: clearDamage(state.opponentZones.supply),
      graveyard: clearDamage(state.opponentZones.graveyard),
      banish: clearDamage(state.opponentZones.banish),
    },
  };
}

function moveCardsToOwnerGraveyards(
  state: GameState,
  destroyedCards: GameCardInstance[]
): GameState {
  if (destroyedCards.length === 0) {
    return state;
  }

  const playerDestroyed = destroyedCards
    .filter((instance) => instance.owner === 'player')
    .map((instance) => prepareCardForZone(instance, 'graveyard'));
  const opponentDestroyed = destroyedCards
    .filter((instance) => instance.owner === 'opponent')
    .map((instance) => prepareCardForZone(instance, 'graveyard'));

  return {
    ...state,
    zones: {
      ...state.zones,
      graveyard: [...playerDestroyed, ...state.zones.graveyard],
    },
    opponentZones: {
      ...state.opponentZones,
      graveyard: [...opponentDestroyed, ...state.opponentZones.graveyard],
    },
  };
}

export function getBattlefieldAttackError(
  state: GameState,
  owner: Owner,
  attackerInstanceId: string,
  targetZone: ZoneId
): string | null {
  if (state.winner) {
    return 'The game is over.';
  }

  if (state.pendingCombat) {
    return 'Resolve the pending combat before declaring another attack.';
  }

  if (state.phase !== 'main' || state.activePlayer !== owner) {
    return 'You can only attack during your main turn.';
  }

  if (!BATTLEFIELD_ZONES.has(targetZone)) {
    return 'Attacks must target a battlefield.';
  }

  const attacker = getOwnerStagingCards(state, owner).find((instance) => instance.instanceId === attackerInstanceId) ?? null;

  if (!attacker) {
    return 'Only units in your staging area can attack.';
  }

  if (!isUnitCard(attacker.card)) {
    return 'Only units can attack.';
  }

  if (!attacker.ready) {
    return 'Only ready units can attack.';
  }

  const occupyingUnit = state.zones[targetZone].find((instance) => isUnitCard(instance.card)) ?? null;

  if (occupyingUnit?.owner === owner) {
    return `${targetZone} is already occupied by your unit.`;
  }

  return null;
}

export function declareBattlefieldAttack(
  state: GameState,
  owner: Owner,
  attackerInstanceId: string,
  targetZone: ZoneId
): DeclareBattlefieldAttackResult | { error: string } {
  const attackError = getBattlefieldAttackError(state, owner, attackerInstanceId, targetZone);

  if (attackError) {
    return { error: attackError };
  }

  const attacker = getOwnerStagingCards(state, owner).find((instance) => instance.instanceId === attackerInstanceId) ?? null;

  if (!attacker) {
    return { error: 'Only units in your staging area can attack.' };
  }

  const defender = state.zones[targetZone].find((instance) => isUnitCard(instance.card) && instance.owner !== owner) ?? null;

  if (!defender) {
    return { error: 'Counter priority only opens when attacking an opposing unit.' };
  }

  const defendingOwner: Owner = owner === 'player' ? 'opponent' : 'player';
  const pendingCombat: PendingCombat = {
    attackerOwner: owner,
    attackerInstanceId,
    targetZone,
    defenderInstanceId: defender?.instanceId ?? null,
    priorityOwner: defendingOwner,
    lastPassedOwner: null,
    counterStack: [],
  };

  return {
    state: {
      ...state,
      pendingCombat,
      log: addLogEntry(state, {
        prefix: 'Declared attack ',
        cardName: attacker.card.name,
        suffix: ` into ${targetZone}, targeting ${defender.card.name}. Counter priority opened.`,
      }),
    },
    pendingCombat,
    attacker,
    defender,
  };
}

export function getCounterPlayError(state: GameState, owner: Owner, instanceId: string): string | null {
  if (state.winner) {
    return 'The game is over.';
  }

  const pendingCombat = state.pendingCombat;

  if (!pendingCombat) {
    return 'Counter cards can only be played during a counter window.';
  }

  if (pendingCombat.priorityOwner !== owner) {
    return owner === 'player' ? 'Waiting for the bot to pass counter priority.' : 'Waiting for you to pass counter priority.';
  }

  const hand = owner === 'player' ? state.zones.hand : state.opponentZones.hand;
  const counter = hand.find((instance) => instance.instanceId === instanceId) ?? null;

  if (!counter) {
    return 'That counter card is not in your hand.';
  }

  if (!isCounterCard(counter.card)) {
    return `${counter.card.name} cannot be played as a counter.`;
  }

  return getPlayCostError(state, owner, counter.card);
}

export function playCounterCard(
  state: GameState,
  owner: Owner,
  instanceId: string
): PlayCounterCardResult | { error: string } {
  const playError = getCounterPlayError(state, owner, instanceId);

  if (playError) {
    return { error: playError };
  }

  const pendingCombat = state.pendingCombat;
  const hand = owner === 'player' ? state.zones.hand : state.opponentZones.hand;
  const counter = hand.find((instance) => instance.instanceId === instanceId) ?? null;

  if (!pendingCombat || !counter) {
    return { error: 'That counter card is not available.' };
  }

  const paidState = exhaustSupplyForCost(state, owner, getPlayCost(counter.card));
  const nextPriorityOwner: Owner = owner === 'player' ? 'opponent' : 'player';
  const nextState = owner === 'player'
    ? {
        ...paidState,
        zones: {
          ...paidState.zones,
          hand: paidState.zones.hand.filter((instance) => instance.instanceId !== counter.instanceId),
        },
      }
    : {
        ...paidState,
        opponentZones: {
          ...paidState.opponentZones,
          hand: paidState.opponentZones.hand.filter((instance) => instance.instanceId !== counter.instanceId),
        },
      };

  return {
    state: {
      ...nextState,
      pendingCombat: {
        ...pendingCombat,
        priorityOwner: nextPriorityOwner,
        lastPassedOwner: null,
        counterStack: [...pendingCombat.counterStack, counter],
      },
      log: addLogEntry(nextState, {
        prefix: `${owner === 'player' ? 'You played ' : 'Bot played '}`,
        cardName: counter.card.name,
        suffix: ' as a counter.',
      }),
    },
    counter,
  };
}

function resolveCounterCard(state: GameState, counter: GameCardInstance): GameState {
  const owner = counter.owner;
  let nextState = triggerCardAbilities(state, 'onPlay', {
    source: counter,
    controller: owner,
    zone: null,
  });

  if (isUnitCard(counter.card) && hasCardKeyword(counter.card, 'swift')) {
    const stagedCounter = prepareCardForZone(counter, 'staging');
    nextState = owner === 'player'
      ? {
          ...nextState,
          zones: {
            ...nextState.zones,
            staging: [stagedCounter, ...nextState.zones.staging],
          },
        }
      : {
          ...nextState,
          opponentZones: {
            ...nextState.opponentZones,
            staging: [stagedCounter, ...nextState.opponentZones.staging],
          },
        };
    nextState = triggerCardAbilities(nextState, 'onEnter', {
      source: stagedCounter,
      controller: owner,
      zone: 'staging',
    });
  } else {
    const graveyardCounter = prepareCardForZone(counter, 'graveyard');
    nextState = owner === 'player'
      ? {
          ...nextState,
          zones: {
            ...nextState.zones,
            graveyard: [graveyardCounter, ...nextState.zones.graveyard],
          },
        }
      : {
          ...nextState,
          opponentZones: {
            ...nextState.opponentZones,
            graveyard: [graveyardCounter, ...nextState.opponentZones.graveyard],
          },
        };
  }

  return {
    ...nextState,
    log: addLogEntry(nextState, {
      prefix: 'Resolved counter ',
      cardName: counter.card.name,
      suffix: getCardType(counter.card) === 'tactic'
        ? ', but its printed effect is not implemented yet.'
        : '.',
    }),
  };
}

export function passCounterPriority(state: GameState, owner: Owner): CounterPriorityPassResult | { error: string } {
  const pendingCombat = state.pendingCombat;

  if (!pendingCombat) {
    return { error: 'No counter window is open.' };
  }

  if (pendingCombat.priorityOwner !== owner) {
    return { error: owner === 'player' ? 'Waiting for the bot to pass counter priority.' : 'Waiting for you to pass counter priority.' };
  }

  if (pendingCombat.lastPassedOwner && pendingCombat.lastPassedOwner !== owner) {
    const resolvedCounters = [...pendingCombat.counterStack].reverse();
    let resolvingState: GameState = {
      ...state,
      pendingCombat: null,
      log: addLogEntry(state, {
        suffix: `${owner === 'player' ? 'You pass' : 'Bot passes'} counter priority. Counter window closes.`,
      }),
    };

    for (const counter of resolvedCounters) {
      resolvingState = resolveCounterCard(resolvingState, counter);
    }

    const result = resolveBattlefieldAttack(
      resolvingState,
      pendingCombat.attackerOwner,
      pendingCombat.attackerInstanceId,
      pendingCombat.targetZone
    );

    if ('error' in result) {
      return {
        error: result.error,
      };
    }

    return {
      state: result.state,
      resolvedCombat: result,
      resolvedCounters,
    };
  }

  const nextPriorityOwner: Owner = owner === 'player' ? 'opponent' : 'player';
  return {
    state: {
      ...state,
      pendingCombat: {
        ...pendingCombat,
        priorityOwner: nextPriorityOwner,
        lastPassedOwner: owner,
      },
      log: addLogEntry(state, {
        suffix: `${owner === 'player' ? 'You pass' : 'Bot passes'} counter priority.`,
      }),
    },
    resolvedCombat: null,
    resolvedCounters: [],
  };
}

export function resolveBattlefieldAttack(
  state: GameState,
  owner: Owner,
  attackerInstanceId: string,
  targetZone: ZoneId
): BattlefieldAttackResult | { error: string } {
  const attackError = getBattlefieldAttackError(state, owner, attackerInstanceId, targetZone);

  if (attackError) {
    return { error: attackError };
  }

  const attacker = getOwnerStagingCards(state, owner).find((instance) => instance.instanceId === attackerInstanceId);

  if (!attacker) {
    return { error: 'Only units in your staging area can attack.' };
  }

  const attackerAttachments = getAttachedCards(getOwnerStagingCards(state, owner), attacker.instanceId);
  const defender = state.zones[targetZone].find((instance) => isUnitCard(instance.card) && instance.owner !== owner) ?? null;
  const defenderAttachments = defender ? getAttachedCards(state.zones[targetZone], defender.instanceId) : [];
  const defenderAttack = defender?.ready ? defender.card.attack : 0;
  const attackerDamageTaken = defender ? defenderAttack : 0;
  const defenderDamageTaken = defender ? attacker.card.attack : 0;
  const defenderDestroyed = Boolean(defender && defender.damage + defenderDamageTaken >= defender.card.health);
  const attackerDestroyed = Boolean(defender && attacker.damage + attackerDamageTaken >= attacker.card.health);
  const captured = !attackerDestroyed && (!defender || defenderDestroyed);
  const attackCardIds = new Set([attacker.instanceId, ...attackerAttachments.map((instance) => instance.instanceId)]);
  const defenderCardIds = new Set(
    defenderDestroyed && defender
      ? [defender.instanceId, ...defenderAttachments.map((instance) => instance.instanceId)]
      : []
  );
  const attackingStagingCards = getOwnerStagingCards(state, owner).filter((instance) => !attackCardIds.has(instance.instanceId));
  const remainingBattlefieldCards = state.zones[targetZone].filter((instance) => !defenderCardIds.has(instance.instanceId));
  const exhaustedAttacker = {
    ...attacker,
    ready: false,
    damage: attacker.damage + attackerDamageTaken,
  };
  const nextStagingCards = attackerDestroyed || captured
    ? attackingStagingCards
    : [exhaustedAttacker, ...attackerAttachments, ...attackingStagingCards];
  const capturedAttacker = captured
    ? prepareCardForZone(
        {
          ...attacker,
          damage: attacker.damage + attackerDamageTaken,
        },
        targetZone
      )
    : null;
  const capturedAttachments = capturedAttacker
    ? attackerAttachments.map((instance) =>
        prepareCardForZone(instance, targetZone, {
          attachToInstanceId: capturedAttacker.instanceId,
        })
      )
    : [];
  const destroyedCards = [
    ...(attackerDestroyed ? [attacker, ...attackerAttachments] : []),
    ...(defenderDestroyed && defender ? [defender, ...defenderAttachments] : []),
  ];

  const exhaustedDefenderCards = defender && !defenderDestroyed
    ? remainingBattlefieldCards.map((instance) =>
        instance.instanceId === defender.instanceId
          ? {
              ...instance,
              ready: false,
              damage: instance.damage + defenderDamageTaken,
            }
          : instance
      )
    : remainingBattlefieldCards;
  const zonesWithBattlefield = {
    ...state.zones,
    [targetZone]: capturedAttacker
      ? [capturedAttacker, ...capturedAttachments, ...exhaustedDefenderCards]
      : exhaustedDefenderCards,
    ...(owner === 'player' ? { staging: nextStagingCards } : null),
  };
  const opponentZonesWithStaging = owner === 'opponent'
    ? {
        ...state.opponentZones,
        staging: nextStagingCards,
      }
    : state.opponentZones;
  let nextState = moveCardsToOwnerGraveyards(
    {
      ...state,
      pendingCombat: null,
      zones: zonesWithBattlefield,
      opponentZones: opponentZonesWithStaging,
      log: addLogEntry(state, {
        prefix: 'Attacked ',
        cardName: attacker.card.name,
        suffix: defender
          ? ` into ${targetZone}, fighting ${defender.card.name}.`
          : ` into ${targetZone}.`,
      }),
    },
    destroyedCards
  );

  if (defender) {
    nextState = {
      ...nextState,
      log: addLogEntry(nextState, {
        suffix: `${attacker.card.name} dealt ${defenderDamageTaken} damage to ${defender.card.name}. ${defender.card.name} dealt ${attackerDamageTaken} damage to ${attacker.card.name}.`,
      }),
    };
  }

  if (capturedAttacker) {
    nextState = triggerCardAbilities(nextState, 'onEnter', {
      source: capturedAttacker,
      controller: owner,
      zone: targetZone,
    });
  }

  nextState = triggerCardAbilities(nextState, 'onAttack', {
    source: attacker,
    controller: owner,
    zone: targetZone,
    targets: defender ? [{ type: 'card', instanceId: defender.instanceId }] : undefined,
  });

  if (defender) {
    nextState = triggerCardAbilities(nextState, 'onDefend', {
    source: defender,
    controller: defender.owner,
    zone: targetZone,
    targets: [{ type: 'card', instanceId: attacker.instanceId }],
  });
  }

  for (const destroyedUnit of [attackerDestroyed ? attacker : null, defenderDestroyed ? defender : null]) {
    if (!destroyedUnit) {
      continue;
    }

    nextState = triggerCardAbilities(nextState, 'onDeath', {
      source: destroyedUnit,
      controller: destroyedUnit.owner,
      zone: 'graveyard',
    });
  }

  if (captured) {
    nextState = {
      ...nextState,
      log: addLogEntry(nextState, {
        prefix: 'Captured ',
        cardName: attacker.card.name,
        suffix: ` took ${targetZone}.`,
      }),
    };
  }

  if (destroyedCards.length > 0) {
    const destroyedNames = destroyedCards
      .filter((instance) => isUnitCard(instance.card))
      .map((instance) => instance.card.name);

    nextState = {
      ...nextState,
      log: addLogEntry(nextState, {
        suffix: `${destroyedNames.join(' and ')} ${destroyedNames.length === 1 ? 'was' : 'were'} destroyed.`,
      }),
    };
  }

  return {
    state: nextState,
    attacker,
    defender,
    attackerDestroyed,
    defenderDestroyed,
    captured,
    scoredVictoryPoints: 0,
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
  if (state.winner) {
    return state;
  }

  if (state.pendingCombat) {
    return {
      ...state,
      log: addLogEntry(state, {
        suffix: 'Resolve the pending combat before ending the turn.',
      }),
    };
  }

  const scoringOwner = state.activePlayer;
  const scoredState = scoringOwner ? scoreBattlefieldVictoryPoints(state, scoringOwner) : state;
  const cleanedState = clearEndOfTurnDamage(scoredState);

  if (cleanedState.winner) {
    return cleanedState;
  }

  const nextActivePlayer: Owner = cleanedState.activePlayer === 'player' ? 'opponent' : 'player';
  const nextTurn = nextActivePlayer === cleanedState.firstPlayer ? cleanedState.turn + 1 : cleanedState.turn;

  const advancedState = resetSuppliedThisTurn({
    ...cleanedState,
    activePlayer: nextActivePlayer,
    turn: nextTurn,
    phase: 'main' as const,
    log: addLogEntry(cleanedState, {
      suffix: `${nextActivePlayer === 'player' ? 'Your' : 'Bot'} turn ${nextTurn}.`,
    }),
  }, nextActivePlayer);

  return runTurnStart(readyCardsForOwner(advancedState, nextActivePlayer));
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
