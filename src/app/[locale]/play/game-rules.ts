import type { Card } from '../create/deck-builder/types';
import { defineCard, getCardType, hasCardKeyword } from './card-definitions';
import {
  createUnimplementedAbilityMessage,
  getImplementedAbilitiesForTrigger,
  getPrintedAbilityTriggers,
  type AbilityTrigger,
} from './card-abilities';
import { resolveNoxTargetChoice } from './nox-card-ability-handlers';
import {
  applyHallowedSanctumDeath,
  applyLuxEndTurnAbilities,
  resolveLuxTargetChoice,
} from './lux-card-ability-handlers';
import {
  applyCaelumEndTurnAbilities,
  applyCaelumTurnStartAbilities,
  resolveCaelumZoneChoice,
  resolveCaelumTargetChoice,
} from './caelum-card-ability-handlers';
import {
  applySolaraEndTurnAbilities,
  revealTopCardForSolara,
  resolveSolaraTargetChoice,
} from './solara-card-ability-handlers';
import {
  applyOvergrownFactoryLeave,
  applyTerraEndTurnAbilities,
  resolveTerraTargetChoice,
  resolveTerraZoneChoice,
} from './terra-card-ability-handlers';
import { drawTopUnitForWarBanner, resolveNeutralTargetChoice } from './neutral-card-ability-handlers';
import { addLogEntry, createLogEntry } from './game-log';
import type {
  ActivateCardAbilityResult,
  BattlefieldAttackResult,
  CounterPriorityPassResult,
  DeclareBattlefieldAttackResult,
  GameCardInstance,
  GamePhase,
  GameSessionMode,
  GameState,
  LogEntry,
  Owner,
  PendingChoice,
  PendingCombat,
  PlayCounterCardResult,
  PrivateZones,
  SavedDeck,
  TriggerAbilitiesInput,
  ZoneId,
} from './game-types';

export { addLogEntry, createLogEntry } from './game-log';
export {
  buildDeckInstances,
  buildInitialGameState,
  createPrivateZones,
  placeAutomaticStartingSupply,
  placeCardIntoSupply,
  placeStartingSupply,
  resolveOpeningHand,
  shuffleCards,
} from './game-setup';

export type {
  ActivateCardAbilityResult,
  BattlefieldAttackResult,
  CounterPriorityPassResult,
  DeclareBattlefieldAttackResult,
  GameCardInstance,
  GamePhase,
  GameSessionMode,
  GameState,
  LogEntry,
  Owner,
  PendingChoice,
  PendingCombat,
  PlayCounterCardResult,
  PrivateZones,
  SavedDeck,
  TriggerAbilitiesInput,
  ZoneId,
} from './game-types';

export const BATTLEFIELD_ZONE_IDS = ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'] as const satisfies ZoneId[];
export const BATTLEFIELD_ZONES = new Set<ZoneId>(BATTLEFIELD_ZONE_IDS);
export const VICTORY_POINT_TARGET = 20;
const COUNTER_ACTIVATABLE_CARD_IDS = new Set(['IMP001', 'IMP016', 'IMP066', 'IMP073', 'IMP139', 'IMP160']);
const ZONE_LOG_LABELS: Record<ZoneId, string> = {
  deck: 'Deck',
  hand: 'Hand',
  staging: 'Staging',
  supply: 'Supply',
  graveyard: 'Graveyard',
  banish: 'Banish',
  battlefieldLeft: 'Battlefield 1',
  battlefieldCenter: 'Battlefield 2',
  battlefieldRight: 'Battlefield 3',
};

export function getZoneLogLabel(zone: ZoneId): string {
  return ZONE_LOG_LABELS[zone];
}

export function isTerritoryCard(card: Card): boolean {
  return getCardType(card) === 'territory';
}

export function isUnitCard(card: Card): boolean {
  const type = getCardType(card);
  return type === 'unit' || type === 'token';
}

export function isTokenCard(card: Card): boolean {
  return getCardType(card) === 'token';
}

export function canCardExistInZone(card: Card, zone: ZoneId): boolean {
  return !isTokenCard(card) || zone === 'staging' || BATTLEFIELD_ZONES.has(zone);
}

export function shouldCardCeaseInZone(instance: GameCardInstance, zone: ZoneId): boolean {
  return !canCardExistInZone(instance.card, zone);
}

export function isItemCard(card: Card): boolean {
  return getCardType(card) === 'item';
}

export function isTacticCard(card: Card): boolean {
  return getCardType(card) === 'tactic';
}

export function isCounterCard(card: Card): boolean {
  return card.subtype.trim().toLowerCase() === 'counter' || hasCardKeyword(card, 'swift');
}

function revealsTopAfterDestroyingDefenderInCombat(instance: GameCardInstance): boolean {
  return (
    instance.card.id === 'IMP109' ||
    /whenever this unit destroys a defending unit in combat[\s\S]+reveal the top card of your deck/i.test(instance.card.rulesText)
  );
}

function revealsTopWhenTakingControlOfCombatZone(instance: GameCardInstance): boolean {
  return (
    instance.card.id === 'IMP102' ||
    /when this unit takes control of a combat zone[\s\S]+reveal the top card of your deck/i.test(instance.card.rulesText)
  );
}

export function hasSuppliedThisTurn(state: GameState, owner: Owner): boolean {
  return owner === 'player' ? state.playerSuppliedThisTurn : state.opponentSuppliedThisTurn;
}

export function canManuallySupplyFromHand(state: GameState, owner: Owner): boolean {
  return !state.winner && !state.pendingCombat && !state.pendingChoice && state.phase === 'main' && state.activePlayer === owner && !hasSuppliedThisTurn(state, owner);
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
  const temporarySupply = owner === 'player' ? state.playerTemporarySupply : state.opponentTemporarySupply;
  return supplyCards.filter((instance) => instance.ready).length + temporarySupply;
}

export function getPlayCost(card: Card): number {
  return Math.max(0, card.cost);
}

function getStaticCostReduction(state: GameState, owner: Owner, card: Card): number {
  let reduction = 0;

  if (card.type.toLowerCase().includes('tactic')) {
    const friendlyUnits = getFriendlyUnitsInPlay(state, owner);
    reduction += friendlyUnits.some((instance) => instance.card.id === 'IMP003') ? 1 : 0;
  }

  if (isUnitCard(card) && card.affinity === 'Caelum') {
    const friendlyUnits = getFriendlyUnitsInPlay(state, owner);
    reduction += friendlyUnits.some(
      (instance) =>
        instance.card.id === 'IMP066' &&
        !isUnitInQuarantineZone(state, instance.instanceId) &&
        !(instance.abilitiesSuppressedUntilTurn && state.turn <= instance.abilitiesSuppressedUntilTurn)
    ) ? 1 : 0;
  }

  return reduction;
}

export function getModifiedPlayCost(state: GameState, owner: Owner, card: Card): number {
  return Math.max(0, getPlayCost(card) - getStaticCostReduction(state, owner, card));
}

export function getManualPlayCost(card: Card, toZone: ZoneId, options: { faceDown?: boolean } = {}): number {
  if (isTerritoryCard(card) && BATTLEFIELD_ZONES.has(toZone)) {
    return options.faceDown ? 0 : getPlayCost(card);
  }

  return getPlayCost(card);
}

export function getModifiedManualPlayCost(
  state: GameState,
  owner: Owner,
  card: Card,
  toZone: ZoneId,
  options: { faceDown?: boolean } = {}
): number {
  if (isTerritoryCard(card) && BATTLEFIELD_ZONES.has(toZone)) {
    return options.faceDown ? 0 : getModifiedPlayCost(state, owner, card);
  }

  if (isUnitCard(card) || isTacticCard(card)) {
    return getModifiedPlayCost(state, owner, card);
  }

  return getManualPlayCost(card, toZone, options);
}

export function getPlayCostError(state: GameState, owner: Owner, card: Card): string | null {
  const cost = getModifiedPlayCost(state, owner, card);
  const readySupplyCount = getReadySupplyCount(state, owner);

  return readySupplyCount >= cost ? null : `Not enough ready supply. ${card.name} costs ${cost}, but you have ${readySupplyCount}.`;
}

export function exhaustSupplyForCost(state: GameState, owner: Owner, cost: number): GameState {
  if (cost <= 0) {
    return state;
  }

  if (owner === 'player') {
    const temporarySupplySpent = Math.min(state.playerTemporarySupply, cost);
    let remainingCost = cost - temporarySupplySpent;

    return {
      ...state,
      playerTemporarySupply: state.playerTemporarySupply - temporarySupplySpent,
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

  const temporarySupplySpent = Math.min(state.opponentTemporarySupply, cost);
  let remainingCost = cost - temporarySupplySpent;

  return {
    ...state,
    opponentTemporarySupply: state.opponentTemporarySupply - temporarySupplySpent,
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
  return cards.filter((instance) => getCardController(instance) === owner && isUnitCard(instance.card));
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
    (instance) => instance.instanceId === attachToInstanceId && getCardController(instance) === owner && isUnitCard(instance.card)
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
      if (!isItemCard(instance.card) || !instance.attachedToInstanceId || (owner && getCardController(instance) !== owner)) {
        nextZoneCards.push(instance);
        continue;
      }

      const host = getEquipmentHost(zoneCards, instance);
      const hasValidHost = Boolean(host && getCardController(host) === getCardController(instance) && isUnitCard(host.card));

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
  options: { faceDown?: boolean; faceDownEnteredTurn?: number; enterExhausted?: boolean; enterReady?: boolean; attachToInstanceId?: string | null } = {}
): GameCardInstance {
  if (toZone === 'staging' && isUnitCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterReady ?? (options.enterExhausted ? false : hasBlitz(instance.card)),
      faceDown: false,
      attachedToInstanceId: null,
      damage: 0,
      retreatLockedUntilNextTurn: false,
    };
  }

  if (toZone === 'staging' && isItemCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterReady ?? instance.ready,
      faceDown: false,
      attachedToInstanceId: options.attachToInstanceId ?? instance.attachedToInstanceId,
      damage: instance.damage,
      retreatLockedUntilNextTurn: false,
    };
  }

  if (BATTLEFIELD_ZONES.has(toZone) && isItemCard(instance.card)) {
    return {
      ...instance,
      ready: options.enterReady ?? instance.ready,
      faceDown: false,
      attachedToInstanceId: options.attachToInstanceId ?? instance.attachedToInstanceId,
      damage: instance.damage,
      retreatLockedUntilNextTurn: false,
    };
  }

  if (BATTLEFIELD_ZONES.has(toZone)) {
    return {
      ...instance,
      ready: true,
      faceDown: options.faceDown ?? false,
      faceDownEnteredTurn: options.faceDown ? options.faceDownEnteredTurn : undefined,
      attachedToInstanceId: null,
      damage: isUnitCard(instance.card) ? instance.damage : 0,
      retreatLockedUntilNextTurn: false,
    };
  }

  return {
    ...instance,
    controller: undefined,
    faceDown: options.faceDown ?? false,
    faceDownEnteredTurn: undefined,
    attachedToInstanceId: null,
    damage: 0,
    retreatLockedUntilNextTurn: false,
  };
}

export function triggerCardAbilities(state: GameState, trigger: AbilityTrigger, input: TriggerAbilitiesInput): GameState {
  const controller = input.controller ?? getCardController(input.source);
  const sourceZoneIsQuarantined =
    input.zone &&
    BATTLEFIELD_ZONES.has(input.zone) &&
    state.zones[input.zone].some((instance) => instance.card.id === 'IMP063' && !instance.faceDown);
  if (
    isUnitCard(input.source.card) &&
    (
      isUnitInQuarantineZone(state, input.source.instanceId) ||
      sourceZoneIsQuarantined ||
      Boolean(input.source.abilitiesSuppressedUntilTurn && state.turn <= input.source.abilitiesSuppressedUntilTurn)
    )
  ) {
    return state;
  }
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
        costsPaid: input.costsPaid,
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

      for (const followUpEvent of resolution.followUpEvents ?? []) {
        nextState = triggerCardAbilities(nextState, followUpEvent.trigger, {
          source: followUpEvent.source,
          controller: followUpEvent.controller,
          zone: followUpEvent.zone,
          targets: followUpEvent.targets,
        });
      }
    }
  }

  if (
    trigger === 'onDeath' &&
    input.source.gainVictoryPointOnDeathUntilTurn === state.turn &&
    input.source.gainVictoryPointOnDeathOwner
  ) {
    nextState = adjustVictoryPoints(nextState, input.source.gainVictoryPointOnDeathOwner, 1);
  }

  if (nextState.pendingChoice) {
    return nextState;
  }

  if (trigger === 'onDeath' && (input.source.loseVictoryPointOnDeathThisTurnCount ?? 0) > 0) {
    const lossAmount = Math.max(0, input.source.loseVictoryPointOnDeathThisTurnCount ?? 0);

    if (lossAmount > 0) {
      nextState = {
        ...adjustVictoryPoints(nextState, getCardController(input.source), -lossAmount),
        log: addLogEntry(nextState, {
          suffix: `${input.source.card.name} died this turn, so ${getCardController(input.source) === 'player' ? 'you lose' : 'Bot loses'} ${lossAmount} ${lossAmount === 1 ? 'victory point' : 'victory points'}.`,
        }),
      };
    }
  }

  if (trigger === 'onDeath' && (input.source.discardCardOnDeathThisTurnCount ?? 0) > 0) {
    const discardAmount = Math.max(0, input.source.discardCardOnDeathThisTurnCount ?? 0);
    const controller = getCardController(input.source);
    const ownerHand = controller === 'player' ? nextState.zones.hand : nextState.opponentZones.hand;

    if (discardAmount > 0 && ownerHand.length > 0) {
      if (controller === 'player') {
        return {
          ...nextState,
          pendingChoice: {
            kind: 'forcedDiscard',
            owner: 'player',
            sourceInstanceId: input.source.instanceId,
            availableCardInstanceIds: ownerHand.map((instance) => instance.instanceId),
            sourceName: input.source.card.name,
          },
        };
      }

      const discardedCard = ownerHand[0]!;
      nextState = {
        ...nextState,
        opponentZones: {
          ...nextState.opponentZones,
          hand: nextState.opponentZones.hand.filter((instance) => instance.instanceId !== discardedCard.instanceId),
          graveyard: [prepareCardForZone(discardedCard, 'graveyard'), ...nextState.opponentZones.graveyard],
        },
        log: addLogEntry(nextState, {
          suffix: `${input.source.card.name} died this turn, so Bot discarded ${discardedCard.card.name}.`,
        }),
      };
    }
  }

  const isGeneratedGuineaPigBanishTrigger =
    trigger === 'onDeath' &&
    input.source.card.id === 'IMP007' &&
    input.source.banishOnDeath;

  if (
    implementedAbilities.length === 0 &&
    !isGeneratedGuineaPigBanishTrigger &&
    getPrintedAbilityTriggers(input.source.card).includes(trigger)
  ) {
    return {
      ...nextState,
      log: addLogEntry(nextState, {
        suffix: createUnimplementedAbilityMessage(input.source.card, trigger),
      }),
    };
  }

  return nextState;
}

export function getFriendlyUnitsInPlay(state: GameState, owner: Owner): GameCardInstance[] {
  const staging = owner === 'player' ? state.zones.staging : state.opponentZones.staging;

  return [
    ...staging,
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
  ].filter((instance) => getCardController(instance) === owner && isUnitCard(instance.card));
}

export function getCardController(instance: GameCardInstance): Owner {
  return instance.controller ?? instance.owner;
}

export function isRenownedUnitCard(card: Card): boolean {
  return isUnitCard(card) && card.type.toLowerCase().includes('renowned');
}

export function getRenownedUnitsInPlay(state: GameState, owner: Owner): GameCardInstance[] {
  return getFriendlyUnitsInPlay(state, owner).filter((instance) => isRenownedUnitCard(instance.card));
}

export function getRenownedUnitLimitError(
  state: GameState,
  owner: Owner,
  enteringUnit: GameCardInstance,
  ignoreInstanceId: string | null = null
): string | null {
  if (!isRenownedUnitCard(enteringUnit.card)) {
    return null;
  }

  const enteringName = enteringUnit.card.name.trim().toLowerCase();
  const existingRenowned = getRenownedUnitsInPlay(state, owner).find(
    (instance) =>
      instance.instanceId !== ignoreInstanceId &&
      instance.card.name.trim().toLowerCase() === enteringName
  );

  return existingRenowned
    ? `${owner === 'player' ? 'You can' : 'Bot can'} only have one Renowned unit named ${enteringUnit.card.name} in play.`
    : null;
}

export function getUnitsInPlay(state: GameState): GameCardInstance[] {
  return [
    ...state.zones.staging,
    ...state.opponentZones.staging,
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
  ].filter((instance) => isUnitCard(instance.card));
}

export function isUnitInQuarantineZone(state: GameState, instanceId: string): boolean {
  return BATTLEFIELD_ZONE_IDS.some((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === instanceId) &&
    state.zones[zone].some((instance) => instance.card.id === 'IMP063' && !instance.faceDown)
  );
}

function getUnitZone(state: GameState, instanceId: string): ZoneId | null {
  if (state.zones.staging.some((instance) => instance.instanceId === instanceId)) return 'staging';
  if (state.opponentZones.staging.some((instance) => instance.instanceId === instanceId)) return 'staging';
  return BATTLEFIELD_ZONE_IDS.find((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === instanceId)
  ) ?? null;
}

export function getCardInstanceById(state: GameState, instanceId: string): GameCardInstance | null {
  return [
    ...Object.values(state.zones).flat(),
    ...Object.values(state.opponentZones).flat(),
  ].find((instance) => instance.instanceId === instanceId) ?? null;
}

export function readyUnitInPlay(state: GameState, instanceId: string): GameState {
  const source = getCardInstanceById(state, instanceId);
  if (!source || !isUnitCard(source.card) || source.ready) return state;
  const readyCards = (cards: GameCardInstance[]) =>
    cards.map((card) => card.instanceId === instanceId ? { ...card, ready: true } : card);
  let nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      staging: readyCards(state.zones.staging),
      battlefieldLeft: readyCards(state.zones.battlefieldLeft),
      battlefieldCenter: readyCards(state.zones.battlefieldCenter),
      battlefieldRight: readyCards(state.zones.battlefieldRight),
    },
    opponentZones: {
      ...state.opponentZones,
      staging: readyCards(state.opponentZones.staging),
    },
  };
  const readiedSource = getCardInstanceById(nextState, instanceId);
  if (readiedSource) {
    nextState = triggerCardAbilities(nextState, 'onReady', {
      source: readiedSource,
      controller: getCardController(readiedSource),
      zone: getUnitZone(nextState, instanceId),
    });
  }
  return nextState;
}

export function getCounterTargetOptions(state: GameState, counter: GameCardInstance): GameCardInstance[] {
  const battlefieldUnits = BATTLEFIELD_ZONE_IDS
    .flatMap((zone) => state.zones[zone])
    .filter((instance) => isUnitCard(instance.card));
  const attacker = state.pendingCombat
    ? getUnitsInPlay(state).find((unit) => unit.instanceId === state.pendingCombat?.attackerInstanceId) ?? null
    : null;
  const combatUnits = attacker ? [...battlefieldUnits, attacker] : battlefieldUnits;
  const counterController = getCardController(counter);
  const legalCombatTargets = combatUnits.filter(
    (unit) =>
      !(
        unit.card.id === 'IMP035' &&
        state.pendingCombat &&
        getCardController(unit) !== counterController &&
        !isUnitInQuarantineZone(state, unit.instanceId)
      )
  );

  if (counter.card.id === 'IMP026') {
    return legalCombatTargets;
  }

  if (counter.card.id === 'IMP027') {
    return legalCombatTargets.filter((unit) => unit.card.cost <= 2);
  }

  if (counter.card.id === 'IMP045') {
    const defender = state.pendingCombat?.defenderInstanceId
      ? getCardInstanceById(state, state.pendingCombat.defenderInstanceId)
      : null;
    return defender && getCardController(defender) === counterController ? [defender] : [];
  }

  if (counter.card.id === 'IMP057') {
    const staging = counterController === 'player' ? state.zones.staging : state.opponentZones.staging;
    return [
      ...staging,
      ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
    ].filter(
      (card) =>
        getCardController(card) === counterController &&
        (isUnitCard(card.card) || isItemCard(card.card))
    );
  }

  if (counter.card.id === 'IMP058') {
    return getFriendlyUnitsInPlay(state, counterController).filter((unit) => !unit.ready);
  }

  if (counter.card.id === 'IMP087') {
    return getFriendlyUnitsInPlay(state, counterController);
  }

  if (counter.card.id === 'IMP121') {
    return getFriendlyUnitsInPlay(state, counterController);
  }

  if (counter.card.id === 'IMP150' || counter.card.id === 'IMP151') {
    return combatUnits.filter(
      (unit) => isUnitCard(unit.card) && getCardController(unit) === counterController
    );
  }

  if (counter.card.id === 'IMP163') {
    return combatUnits.filter(
      (unit) => isUnitCard(unit.card) && getCardController(unit) !== counterController
    );
  }

  if (counter.card.id === 'IMP088') {
    return legalCombatTargets.filter(
      (unit) =>
        !(
          unit.protectedFromEnemyTacticsUntilTurn === state.turn &&
          getCardController(unit) !== counterController
        )
    );
  }

  return [];
}

function getFortifyDiscardOptions(state: GameState, defender: GameCardInstance): GameCardInstance[] {
  const affinity = defender.card.affinity.trim().toLowerCase();
  if (!affinity) {
    return [];
  }
  const controller = getCardController(defender);
  const hand = controller === 'player' ? state.zones.hand : state.opponentZones.hand;
  return hand.filter((card) => card.card.affinity.trim().toLowerCase() === affinity);
}

function applyFortifyDiscard(state: GameState, defenderInstanceId: string, discardedCard: GameCardInstance): GameState {
  const defender = getCardInstanceById(state, defenderInstanceId);
  if (!defender || !isUnitCard(defender.card)) {
    return state;
  }
  const owner = discardedCard.owner;
  const nextState = owner === 'player'
    ? {
        ...state,
        zones: {
          ...state.zones,
          hand: state.zones.hand.filter((card) => card.instanceId !== discardedCard.instanceId),
          graveyard: [prepareCardForZone(discardedCard, 'graveyard'), ...state.zones.graveyard],
        },
      }
    : {
        ...state,
        opponentZones: {
          ...state.opponentZones,
          hand: state.opponentZones.hand.filter((card) => card.instanceId !== discardedCard.instanceId),
          graveyard: [prepareCardForZone(discardedCard, 'graveyard'), ...state.opponentZones.graveyard],
        },
      };
  return {
    ...readyUnitInPlay(nextState, defenderInstanceId),
    log: addLogEntry(nextState, {
      suffix: `${defender.card.name} used Fortify by discarding ${discardedCard.card.name} and readied.`,
    }),
  };
}

export function removeUnitFromPlay(
  state: GameState,
  instanceId: string,
  options: {
    beforeOnDeath?: (stateAfterMove: GameState, unit: GameCardInstance) => GameState;
  } = {}
): { state: GameState; unit: GameCardInstance } | { error: string } {
  const unit = getUnitsInPlay(state).find((instance) => instance.instanceId === instanceId) ?? null;
  if (!unit) {
    return { error: 'That unit is no longer in play.' };
  }

  const controller = getCardController(unit);
  const staging = controller === 'player' ? state.zones.staging : state.opponentZones.staging;
  const battlefieldZone = BATTLEFIELD_ZONE_IDS.find((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === unit.instanceId)
  );
  const sourceCards = battlefieldZone ? state.zones[battlefieldZone] : staging;
  const removedIds = new Set([
    unit.instanceId,
    ...sourceCards
      .filter((instance) => instance.attachedToInstanceId === unit.instanceId)
      .map((instance) => instance.instanceId),
  ]);
  const removedCards = sourceCards.filter((instance) => removedIds.has(instance.instanceId));
  const remainingCards = sourceCards.filter((instance) => !removedIds.has(instance.instanceId));
  const removedState = battlefieldZone
    ? {
        ...state,
        zones: {
          ...state.zones,
          [battlefieldZone]: remainingCards,
        },
      }
    : controller === 'player'
      ? {
          ...state,
          zones: {
            ...state.zones,
            staging: remainingCards,
          },
        }
      : {
          ...state,
          opponentZones: {
            ...state.opponentZones,
            staging: remainingCards,
          },
        };
  let nextState = moveCardsToOwnerGraveyards(removedState, removedCards);
  nextState = options.beforeOnDeath?.(nextState, unit) ?? nextState;
  nextState = applyDisruptionStaffDiscards(nextState, unit, removedCards);
  if (nextState.pendingChoice) {
    return { state: nextState, unit };
  }
  nextState = triggerCardAbilities(nextState, 'onDeath', {
    source: unit,
    controller,
    zone: battlefieldZone ?? 'staging',
  });
  if (
    battlefieldZone &&
    getOwnerZoneMap(nextState, unit.owner).graveyard.some((card) => card.instanceId === unit.instanceId)
  ) {
    nextState = applyHallowedSanctumDeath(nextState, unit, battlefieldZone);
  }

  const explosiveAugmentCount = battlefieldZone
    ? removedCards.filter((instance) => instance.card.id === 'IMP029').length
    : 0;
  if (battlefieldZone && explosiveAugmentCount > 0) {
    const explosionDamage = explosiveAugmentCount * 3;
    nextState = {
      ...nextState,
      zones: {
        ...nextState.zones,
        [battlefieldZone]: nextState.zones[battlefieldZone].map((instance) =>
          isUnitCard(instance.card)
            ? { ...instance, damage: instance.damage + explosionDamage }
            : instance
        ),
      },
      log: addLogEntry(nextState, {
        suffix: `Explosive Augment dealt ${explosionDamage} damage to units in ${getZoneLogLabel(battlefieldZone)}.`,
      }),
    };

    const casualties = nextState.zones[battlefieldZone].filter(
      (instance) =>
        isUnitCard(instance.card) &&
        (
          instance.damage >= getCurrentUnitHealth(nextState, instance) ||
          instance.destroyOnNextDamageUntilTurn === state.turn
        )
    );
    for (const casualty of casualties) {
      const casualtyResult = removeUnitFromPlay(nextState, casualty.instanceId);
      if (!('error' in casualtyResult)) {
        nextState = casualtyResult.state;
      }
    }
  }

  return { state: nextState, unit };
}

export function activateCardAbility(
  state: GameState,
  owner: Owner,
  sourceInstanceId: string,
  targetInstanceId: string
): ActivateCardAbilityResult {
  const activationError = getCardAbilityActivationError(state, owner, sourceInstanceId);
  if (activationError) {
    return { error: activationError };
  }

  const source = getFriendlyUnitsInPlay(state, owner).find((instance) => instance.instanceId === sourceInstanceId)!;
  const target = getCardAbilityTargetOptions(state, owner, sourceInstanceId)
    .find((instance) => instance.instanceId === targetInstanceId) ?? null;

  if (!target) {
    if (source.card.id === 'IMP160') return { error: 'Choose Supply Carrier.' };
    if (source.card.id === 'IMP066' || source.card.id === 'IMP139') return { error: 'Choose a friendly unit.' };
    if (source.card.id === 'IMP073') return { error: 'Choose a friendly Drone or Vehicle.' };
    if (source.card.id === 'IMP079') return { error: 'Choose a unit in play.' };
    return { error: 'Choose another friendly unit to sacrifice.' };
  }

  if (state.pendingCombat) {
    const paidState = payActivatedAbilityCosts(state, owner, source, target);
    if ('error' in paidState) return paidState;
    const pendingCombat = paidState.state.pendingCombat!;
    const stackedAbility: GameCardInstance = {
      ...source,
      counterStackEntryKind: 'activatedAbility',
      selectedAbilityTargetInstanceIds: [target.instanceId],
    };
    const nextState: GameState = {
      ...paidState.state,
      pendingCombat: {
        ...pendingCombat,
        priorityOwner: owner === 'player' ? 'opponent' : 'player',
        lastPassedOwner: null,
        lastCounterActionOwner: owner,
        counterStack: [...pendingCombat.counterStack, stackedAbility],
      },
      log: addLogEntry(paidState.state, {
        prefix: `${owner === 'player' ? 'You activated ' : 'Bot activated '}`,
        cardName: source.card.name,
        suffix: ` as a counter, targeting ${target.card.name}.`,
      }),
    };
    return { state: nextState, source, target };
  }

  const nextState = triggerCardAbilities(state, 'activated', {
    source,
    controller: owner,
    targets: [{ type: 'card', instanceId: target.instanceId }],
  });

  return { state: nextState, source, target };
}

function exhaustUnitInPlay(state: GameState, instanceId: string): GameState {
  const exhaustCards = (cards: GameCardInstance[]) =>
    cards.map((card) => card.instanceId === instanceId ? { ...card, ready: false } : card);
  return {
    ...state,
    zones: {
      ...state.zones,
      staging: exhaustCards(state.zones.staging),
      battlefieldLeft: exhaustCards(state.zones.battlefieldLeft),
      battlefieldCenter: exhaustCards(state.zones.battlefieldCenter),
      battlefieldRight: exhaustCards(state.zones.battlefieldRight),
    },
    opponentZones: {
      ...state.opponentZones,
      staging: exhaustCards(state.opponentZones.staging),
    },
  };
}

function payActivatedAbilityCosts(
  state: GameState,
  owner: Owner,
  source: GameCardInstance,
  target: GameCardInstance
): { state: GameState } | { error: string } {
  let nextState = state;

  if (source.card.id === 'IMP001' || source.card.id === 'IMP016') {
    const removed = removeUnitFromPlay(nextState, target.instanceId);
    if ('error' in removed) return removed;
    nextState = removed.state;
  }

  const supplyCost = source.card.id === 'IMP073' ? 2 : source.card.id === 'IMP139' ? 1 : 0;
  if (supplyCost > 0) {
    nextState = exhaustSupplyForCost(nextState, owner, supplyCost);
  }

  if (source.card.id !== 'IMP001') {
    nextState = exhaustUnitInPlay(nextState, source.instanceId);
  }

  return { state: nextState };
}

export function getCardAbilityActivationError(
  state: GameState,
  owner: Owner,
  sourceInstanceId: string
): string | null {
  if (state.winner) {
    return 'The game is over.';
  }

  if (state.pendingChoice) {
    return 'Resolve the pending ability choice before activating an ability.';
  }

  if (state.pendingCombat) {
    if (state.pendingCombat.priorityOwner !== owner) {
      return owner === 'player' ? 'Waiting for the bot to pass counter priority.' : 'Waiting for you to pass counter priority.';
    }
  } else if (state.phase !== 'main' || state.activePlayer !== owner) {
    return `${owner === 'player' ? 'You can' : 'Bot can'} only activate abilities during ${owner === 'player' ? 'your' : 'its'} main turn.`;
  }

  const friendlyUnits = getFriendlyUnitsInPlay(state, owner);
  const source = friendlyUnits.find((instance) => instance.instanceId === sourceInstanceId) ?? null;

  if (!source || getImplementedAbilitiesForTrigger(source.card.id, 'activated').length === 0) {
    return 'That card has no implemented activated ability.';
  }

  if (state.pendingCombat && source.card.id === 'IMP079') {
    return `${source.card.name} can only activate its ability outside combat.`;
  }

  if (state.pendingCombat && !COUNTER_ACTIVATABLE_CARD_IDS.has(source.card.id)) {
    return `${source.card.name} cannot use its ability during a counter step.`;
  }

  if (source.card.id === 'IMP001' && source.ready) {
    return `${source.card.name} is already ready.`;
  }

  if (source.card.id === 'IMP016' && !source.ready) {
    return `${source.card.name} must be ready to activate its ability.`;
  }

  if (['IMP066', 'IMP073', 'IMP079', 'IMP139', 'IMP160'].includes(source.card.id) && !source.ready) {
    return `${source.card.name} must be ready to activate its ability.`;
  }

  if (source.card.id === 'IMP073' && getReadySupplyCount(state, owner) < 2) {
    return `Not enough ready supply. ${source.card.name} costs 2 to activate, but you have ${getReadySupplyCount(state, owner)}.`;
  }

  if (source.card.id === 'IMP139' && getReadySupplyCount(state, owner) < 1) {
    return `Not enough ready supply. ${source.card.name} costs 1 to activate, but you have ${getReadySupplyCount(state, owner)}.`;
  }

  if (source.card.id === 'IMP079') {
    if (getUnitZone(state, source.instanceId) === 'staging') {
      return `${source.card.name} must be in a combat zone to activate its ability.`;
    }
    if (getReadySupplyCount(state, owner) < 3) {
      return `Not enough ready supply. ${source.card.name} costs 3 to activate, but you have ${getReadySupplyCount(state, owner)}.`;
    }
  }

  return null;
}

export function getCardAbilityTargetOptions(
  state: GameState,
  owner: Owner,
  sourceInstanceId: string
): GameCardInstance[] {
  const friendlyUnits = getFriendlyUnitsInPlay(state, owner);
  const source = friendlyUnits.find((instance) => instance.instanceId === sourceInstanceId) ?? null;
  if (!source) return [];

  return source.card.id === 'IMP160'
    ? [source]
    : source.card.id === 'IMP066' || source.card.id === 'IMP139'
    ? friendlyUnits
    : source.card.id === 'IMP073'
      ? friendlyUnits.filter((instance) => ['drone', 'vehicle'].includes(instance.card.subtype.trim().toLowerCase()))
      : source.card.id === 'IMP079'
        ? getUnitsInPlay(state)
        : friendlyUnits.filter((instance) => instance.instanceId !== source.instanceId);
}

export function getCounterActivatableUnits(state: GameState, owner: Owner): GameCardInstance[] {
  if (state.pendingCombat?.priorityOwner !== owner) return [];
  return getFriendlyUnitsInPlay(state, owner).filter(
    (instance) =>
      !getCardAbilityActivationError(state, owner, instance.instanceId) &&
      getCardAbilityTargetOptions(state, owner, instance.instanceId).length > 0
  );
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

export function recordCardsDrawn(state: GameState, owner: Owner, count: number): GameState {
  if (count <= 0) {
    return state;
  }

  return {
    ...state,
    ...(owner === 'player'
      ? { playerCardsDrawnThisTurn: state.playerCardsDrawnThisTurn + count }
      : { opponentCardsDrawnThisTurn: state.opponentCardsDrawnThisTurn + count }),
  };
}

export function adjustVictoryPoints(state: GameState, owner: Owner, change: number): GameState {
  if (state.winner || change === 0) {
    return state;
  }

  if (
    change > 0 &&
    BATTLEFIELD_ZONE_IDS.some((zone) =>
      state.zones[zone].some(
        (instance) => instance.card.id === 'IMP015' && getCardController(instance) !== owner && isUnitCard(instance.card)
      )
    )
  ) {
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

export function getCurrentUnitInfluence(
  instance: GameCardInstance,
  attachedCards: GameCardInstance[],
  cardsDrawnThisTurn: number
): number {
  const baseInfluence = instance.card.id === 'IMP019'
    ? Math.min(3, cardsDrawnThisTurn)
    : instance.card.influence ?? 0;
  const equipmentInfluence = attachedCards.reduce((sum, equipment) => sum + (equipment.card.influence ?? 0), 0);

  return Math.max(0, baseInfluence + equipmentInfluence + (instance.temporaryInfluenceBonus ?? 0));
}

function getUnitAttachmentsInPlay(state: GameState, instanceId: string): GameCardInstance[] {
  return [
    ...state.zones.staging,
    ...state.opponentZones.staging,
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
  ].filter((card) => card.attachedToInstanceId === instanceId);
}

export function getCurrentUnitAttack(
  state: GameState,
  instance: GameCardInstance,
  attackingZone?: ZoneId
): number {
  const attachments = getUnitAttachmentsInPlay(state, instance.instanceId);
  const selena = getFriendlyUnitsInPlay(state, getCardController(instance)).find(
    (unit) =>
      unit.card.id === 'IMP046' &&
      unit.instanceId !== instance.instanceId &&
      !isUnitInQuarantineZone(state, unit.instanceId)
  );
  const selenaBonus = selena?.ready ? 1 : 0;
  const hasRallyPoint = BATTLEFIELD_ZONE_IDS.some((zone) =>
    (
      state.zones[zone].some((card) => card.instanceId === instance.instanceId) ||
      (
        state.pendingCombat?.attackerInstanceId === instance.instanceId &&
        state.pendingCombat.targetZone === zone
      )
    ) &&
    state.zones[zone].some((card) => card.card.id === 'IMP124' && !card.faceDown)
  );
  const escapeRouteZone =
    attackingZone ??
    (
      state.pendingCombat?.attackerInstanceId === instance.instanceId
        ? state.pendingCombat.targetZone
        : undefined
    );
  const escapeRoutePenalty =
    escapeRouteZone &&
    state.zones[escapeRouteZone].some(
      (card) =>
        card.card.id === 'IMP157' &&
        !card.faceDown &&
        getCardController(card) !== getCardController(instance)
    )
      ? 2
      : 0;
  return Math.max(
    0,
    (hasRallyPoint ? 3 : instance.card.attack) +
      attachments.reduce((total, attachment) => total + attachment.card.attack, 0) +
      (instance.temporaryAttackBonus ?? 0) +
      (instance.terraLastStandAttackBonus ?? 0) +
      (instance.combatAttackBonus ?? 0) +
      selenaBonus -
      escapeRoutePenalty
  );
}

export function getCurrentUnitHealth(state: GameState, instance: GameCardInstance): number {
  const attachments = getUnitAttachmentsInPlay(state, instance.instanceId);
  const selena = getFriendlyUnitsInPlay(state, getCardController(instance)).find(
    (unit) =>
      unit.card.id === 'IMP046' &&
      unit.instanceId !== instance.instanceId &&
      !isUnitInQuarantineZone(state, unit.instanceId)
  );
  const selenaBonus = selena && !selena.ready ? 1 : 0;
  const hasRallyPoint = BATTLEFIELD_ZONE_IDS.some((zone) =>
    (
      state.zones[zone].some((card) => card.instanceId === instance.instanceId) ||
      (
        state.pendingCombat?.attackerInstanceId === instance.instanceId &&
        state.pendingCombat.targetZone === zone
      )
    ) &&
    state.zones[zone].some((card) => card.card.id === 'IMP124' && !card.faceDown)
  );
  const pillboxBonus = BATTLEFIELD_ZONE_IDS.some((zone) =>
    state.zones[zone].some((card) => card.instanceId === instance.instanceId) &&
    state.zones[zone].some(
      (card) =>
        card.card.id === 'IMP161' &&
        !card.faceDown &&
        getCardController(card) === getCardController(instance)
    )
  )
    ? 2
    : 0;
  return Math.max(
    0,
    (hasRallyPoint ? 3 : instance.card.health) +
      attachments.reduce((total, attachment) => total + attachment.card.health, 0) +
      (instance.temporaryHealthBonus ?? 0) +
      (instance.terraLastStandHealthBonus ?? 0) +
      selenaBonus +
      pillboxBonus
  );
}

function forceOwnerDiscard(
  state: GameState,
  owner: Owner,
  source: GameCardInstance,
  options: { resumeTurnAdvance?: boolean } = {}
): GameState {
  const hand = owner === 'player' ? state.zones.hand : state.opponentZones.hand;
  if (hand.length === 0) {
    return state;
  }

  if (owner === 'player') {
    return {
      ...state,
      pendingChoice: {
        kind: 'forcedDiscard',
        owner: 'player',
        sourceInstanceId: source.instanceId,
        availableCardInstanceIds: hand.map((instance) => instance.instanceId),
        sourceName: source.card.name,
        resumeTurnAdvance: options.resumeTurnAdvance,
      },
    };
  }

  const discardedCard = hand[0]!;
  return {
    ...state,
    opponentZones: {
      ...state.opponentZones,
      hand: state.opponentZones.hand.filter((instance) => instance.instanceId !== discardedCard.instanceId),
      graveyard: [prepareCardForZone(discardedCard, 'graveyard'), ...state.opponentZones.graveyard],
    },
    log: addLogEntry(state, {
      suffix: `${source.card.name} caused Bot to discard ${discardedCard.card.name}.`,
    }),
  };
}

function applyDisruptionStaffDiscards(
  state: GameState,
  destroyedUnit: GameCardInstance,
  attachments: GameCardInstance[]
): GameState {
  let nextState = state;
  const disruptionStaffs = attachments.filter(
    (instance) => instance.card.id === 'IMP089' && instance.attachedToInstanceId === destroyedUnit.instanceId
  );
  for (const disruptionStaff of disruptionStaffs) {
    nextState = forceOwnerDiscard(
      nextState,
      getCardController(destroyedUnit) === 'player' ? 'opponent' : 'player',
      disruptionStaff
    );
    if (nextState.pendingChoice) {
      return nextState;
    }
  }
  return nextState;
}

function placeFreightModuleIntoSupplyFromScore(state: GameState, freightModule: GameCardInstance, zone: ZoneId): GameState {
  const prepared = { ...prepareCardForZone(freightModule, 'supply'), ready: false };
  return freightModule.owner === 'player'
    ? {
        ...state,
        zones: {
          ...state.zones,
          [zone]: state.zones[zone].filter((card) => card.instanceId !== freightModule.instanceId),
          supply: [prepared, ...state.zones.supply],
        },
        log: addLogEntry(state, {
          suffix: `${freightModule.card.name} moved to supply exhausted.`,
        }),
      }
    : {
        ...state,
        zones: {
          ...state.zones,
          [zone]: state.zones[zone].filter((card) => card.instanceId !== freightModule.instanceId),
        },
        opponentZones: {
          ...state.opponentZones,
          supply: [prepared, ...state.opponentZones.supply],
        },
        log: addLogEntry(state, {
          suffix: `Bot moved ${freightModule.card.name} to supply exhausted.`,
        }),
      };
}

function returnTacticWithArchiveRuins(state: GameState, owner: Owner, archiveRuins: GameCardInstance, tactic: GameCardInstance): GameState {
  const zone = BATTLEFIELD_ZONE_IDS.find((candidate) =>
    state.zones[candidate].some((card) => card.instanceId === archiveRuins.instanceId)
  );
  if (!zone) {
    return state;
  }

  const ownerZones = getOwnerZoneMap(state, owner);
  const tacticOwnerZones = getOwnerZoneMap(state, tactic.owner);
  const archiveOwnerZones = getOwnerZoneMap(state, archiveRuins.owner);
  const archiveGraveyard =
    archiveRuins.owner === tactic.owner
      ? [prepareCardForZone(archiveRuins, 'graveyard'), ...tacticOwnerZones.graveyard.filter((card) => card.instanceId !== tactic.instanceId)]
      : [prepareCardForZone(archiveRuins, 'graveyard'), ...archiveOwnerZones.graveyard];
  const tacticGraveyard =
    archiveRuins.owner === tactic.owner
      ? archiveGraveyard
      : tacticOwnerZones.graveyard.filter((card) => card.instanceId !== tactic.instanceId);
  const nextZones = {
    ...state.zones,
    [zone]: state.zones[zone].filter((card) => card.instanceId !== archiveRuins.instanceId),
  };

  const nextState: GameState = {
    ...state,
    zones: owner === 'player'
      ? {
          ...nextZones,
          graveyard: tacticGraveyard,
          hand: [prepareCardForZone(tactic, 'hand'), ...ownerZones.hand],
        }
      : archiveRuins.owner === 'player'
        ? {
            ...nextZones,
            graveyard: archiveGraveyard,
          }
        : nextZones,
    opponentZones: owner === 'opponent'
      ? {
          ...state.opponentZones,
          graveyard: tacticGraveyard,
          hand: [prepareCardForZone(tactic, 'hand'), ...ownerZones.hand],
        }
      : archiveRuins.owner === 'opponent'
        ? {
            ...state.opponentZones,
            graveyard: archiveGraveyard,
          }
        : state.opponentZones,
  };

  return {
    ...nextState,
    log: addLogEntry(nextState, {
      suffix: `${archiveRuins.card.name} returned ${tactic.card.name} from graveyard to hand, then was sacrificed.`,
    }),
  };
}

function applyArchiveRuinsControlTrigger(
  state: GameState,
  owner: Owner,
  zone: ZoneId,
  options: { resumeTurnAdvance?: boolean } = {}
): GameState {
  const archiveRuins = state.zones[zone].find(
    (card) => card.card.id === 'IMP092' && !card.faceDown && getCardController(card) === owner
  );
  const archiveTactics = getOwnerZoneMap(state, owner).graveyard.filter((card) => isTacticCard(card.card));
  if (!archiveRuins || archiveTactics.length === 0) {
    return state;
  }

  if (owner === 'player') {
    return {
      ...state,
      pendingChoice: {
        kind: 'caelumTarget',
        owner: 'player',
        sourceInstanceId: archiveRuins.instanceId,
        sourceName: archiveRuins.card.name,
        prompt: 'Return a tactic card from your graveyard to your hand, then sacrifice Archive Ruins?',
        effect: 'archiveReturn',
        availableInstanceIds: archiveTactics.map((card) => card.instanceId),
        optional: true,
        resumeTurnAdvance: options.resumeTurnAdvance,
      },
    };
  }

  return returnTacticWithArchiveRuins(state, owner, archiveRuins, archiveTactics[0]!);
}

function continueScoreItemTriggers(state: GameState, owner: Owner, zone: ZoneId, triggerIds: string[]): GameState {
  let nextState = state;
  for (let index = 0; index < triggerIds.length; index += 1) {
    const triggerId = triggerIds[index]!;
    const trigger = nextState.zones[zone].find((card) => card.instanceId === triggerId);
    if (!trigger) continue;
    const remainingIds = triggerIds.slice(index + 1);

    if (trigger.card.id === 'IMP092') {
      nextState = applyArchiveRuinsControlTrigger(nextState, owner, zone);
    } else if (trigger.card.id === 'IMP091') {
      nextState = owner === 'player'
        ? {
            ...nextState,
            pendingChoice: {
              kind: 'caelumTarget', owner: 'player', sourceInstanceId: trigger.instanceId,
              sourceName: trigger.card.name, prompt: 'Move Freight Module to your supply area exhausted?',
              effect: 'freightModuleSupply', availableInstanceIds: [trigger.instanceId], optional: true,
            },
          }
        : placeFreightModuleIntoSupplyFromScore(nextState, trigger, zone);
    } else if (trigger.card.id === 'IMP164') {
      if (!getOwnerZoneMap(nextState, owner).deck[0]) continue;
      nextState = owner === 'player'
        ? {
            ...nextState,
            pendingChoice: {
              kind: 'neutralTarget', owner: 'player', sourceInstanceId: trigger.instanceId,
              sourceName: trigger.card.name, prompt: 'Reveal the top card of your deck for War Banner?',
              effect: 'warBannerReveal', availableInstanceIds: [trigger.instanceId], optional: true,
            },
          }
        : drawTopUnitForWarBanner(nextState, owner, trigger.card.name);
    } else if (trigger.card.id === 'IMP093') {
      nextState = forceOwnerDiscard(nextState, owner, trigger);
    }

    if (nextState.pendingChoice) {
      return {
        ...nextState,
        pendingChoice: {
          ...nextState.pendingChoice,
          remainingScoreItemTriggerIds: remainingIds,
          scoreTriggerOwner: owner,
          scoreTriggerZone: zone,
          resumeTurnAdvance: true,
        },
      };
    }
  }
  return nextState;
}

export function scoreBattlefieldVictoryPoints(state: GameState, owner: Owner): GameState {
  if (state.winner) {
    return state;
  }

  const skyfortressZones = BATTLEFIELD_ZONE_IDS.filter((zone) =>
    state.zones[zone].some(
      (instance) =>
        instance.card.id === 'IMP067' &&
        !isUnitInQuarantineZone(state, instance.instanceId) &&
        !(instance.abilitiesSuppressedUntilTurn && state.turn <= instance.abilitiesSuppressedUntilTurn)
    )
  );
  const terraProtectedZones = BATTLEFIELD_ZONE_IDS.some((zone) =>
    state.zones[zone].some(
      (instance) =>
        instance.card.id === 'IMP141' &&
        isUnitCard(instance.card) &&
        getCardController(instance) !== owner
    )
  )
    ? BATTLEFIELD_ZONE_IDS.filter((zone) =>
        state.zones[zone].some(
          (card) =>
            isTerritoryCard(card.card) &&
            !card.faceDown &&
            getCardController(card) !== owner
        )
      )
    : [];
  const scoringUnits = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone].some((instance) => instance.card.id === 'IMP063' && !instance.faceDown) ||
    (skyfortressZones.length > 0 && !skyfortressZones.includes(zone)) ||
    (state.scoreLocks ?? []).some((lock) => lock.zone === zone && lock.blockedOwner === owner) ||
    terraProtectedZones.includes(zone)
      ? []
      :
    state.zones[zone]
      .filter((instance) => {
        if (getCardController(instance) !== owner || !isUnitCard(instance.card)) {
          return false;
        }

        const blockedByAugment = state.zones[zone].some(
          (equipment) => equipment.card.id === 'IMP028' && equipment.attachedToInstanceId === instance.instanceId
        );
        return !blockedByAugment && (defineCard(instance.card).canScore || instance.card.id === 'IMP019');
      })
      .map((instance) => ({ instance, zone }))
  );
  const scoredVictoryPoints = scoringUnits.reduce((total, { instance }) => {
    const attachedCards = BATTLEFIELD_ZONE_IDS
      .flatMap((zone) => state.zones[zone])
      .filter((equipment) => equipment.attachedToInstanceId === instance.instanceId);
    return total + getCurrentUnitInfluence(
      instance,
      attachedCards,
      owner === 'player' ? state.playerCardsDrawnThisTurn : state.opponentCardsDrawnThisTurn
    );
  }, 0);

  const victoryPointsBlocked = BATTLEFIELD_ZONE_IDS.some((zone) =>
    state.zones[zone].some(
      (instance) => instance.card.id === 'IMP015' && getCardController(instance) !== owner
    )
  );
  let nextState =
    scoredVictoryPoints > 0 && !victoryPointsBlocked
      ? {
          ...adjustVictoryPoints(state, owner, scoredVictoryPoints),
          log: addLogEntry(state, {
            suffix: `${owner === 'player' ? 'You score' : 'Bot scores'} ${scoredVictoryPoints} ${scoredVictoryPoints === 1 ? 'victory point' : 'victory points'} from battlefield control.`,
          }),
        }
      : state;

  for (let index = 0; index < scoringUnits.length; index += 1) {
    const { instance, zone } = scoringUnits[index]!;
    nextState = triggerCardAbilities(nextState, 'onScore', {
      source: instance,
      controller: owner,
      zone,
    });

    const ruins = nextState.zones[zone].find(
      (card) => card.card.id === 'IMP125' && !card.faceDown && getCardController(card) === owner
    );
    if (ruins) {
      const counters = (ruins.progressCounters ?? 0) + 1;
      if (counters >= 3) {
        nextState = {
          ...adjustVictoryPoints(nextState, owner, 2),
          zones: {
            ...nextState.zones,
            [zone]: nextState.zones[zone].filter((card) => card.instanceId !== ruins.instanceId),
          },
          log: addLogEntry(nextState, {
            suffix: `${ruins.card.name} reached 3 dig counters; ${owner === 'player' ? 'you gain' : 'Bot gains'} 2 victory points and sacrifice it.`,
          }),
        };
        nextState = moveCardsToOwnerGraveyards(nextState, [ruins]);
      } else {
        nextState = {
          ...nextState,
          zones: {
            ...nextState.zones,
            [zone]: nextState.zones[zone].map((card) =>
              card.instanceId === ruins.instanceId ? { ...card, progressCounters: counters } : card
            ),
          },
        };
      }
    }

    const blightedRuins = nextState.zones[zone].find(
      (card) => card.card.id === 'IMP030' && getCardController(card) === owner && !card.faceDown
    );
    const currentVictoryPoints = owner === 'player'
      ? nextState.playerVictoryPoints
      : nextState.opponentVictoryPoints;
    if (blightedRuins && currentVictoryPoints > 0) {
      nextState = drawForOwner(adjustVictoryPoints(nextState, owner, -1), owner, 1);
    }

    if (nextState.pendingChoice?.kind === 'lucilleScore') {
      nextState = {
        ...nextState,
        pendingChoice: {
          ...nextState.pendingChoice,
          remainingScoreTriggers: scoringUnits
            .slice(index + 1)
            .map(({ instance: remainingInstance, zone: remainingZone }) => ({
              sourceInstanceId: remainingInstance.instanceId,
              controller: owner,
              zone: remainingZone,
            })),
        },
      };
      return nextState;
    }
    if (nextState.pendingChoice) {
      return nextState;
    }

    const archiveRuins = nextState.zones[zone].find(
      (card) => card.card.id === 'IMP092' && !card.faceDown && getCardController(card) === owner &&
        getOwnerZoneMap(nextState, owner).graveyard.some((graveyardCard) => isTacticCard(graveyardCard.card))
    );
    const freightModules = nextState.zones[zone].filter(
      (card) =>
        card.card.id === 'IMP091' &&
        card.attachedToInstanceId === instance.instanceId &&
        getCardController(card) === owner
    );
    const warBanners = nextState.zones[zone].filter(
      (card) =>
        card.card.id === 'IMP164' &&
        card.attachedToInstanceId === instance.instanceId &&
        getCardController(card) === owner
    );
    const jammingTowers = nextState.zones[zone].filter(
      (card) => card.card.id === 'IMP093' && !card.faceDown && getCardController(card) !== owner
    );
    nextState = continueScoreItemTriggers(nextState, owner, zone, [
      ...(archiveRuins ? [archiveRuins.instanceId] : []),
      ...freightModules.map((card) => card.instanceId),
      ...warBanners.map((card) => card.instanceId),
      ...jammingTowers.map((card) => card.instanceId),
    ]);
    if (nextState.pendingChoice) return nextState;
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

function finishAdvanceToNextTurnAfterScoring(state: GameState): GameState {
  if (state.pendingChoice) {
    return state;
  }

  const cleanedState = clearEndOfTurnDamage(state);

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
    ...(nextActivePlayer === 'player'
      ? { playerCardsDrawnThisTurn: 0, playerDemonicAdvanceActive: false }
      : { opponentCardsDrawnThisTurn: 0, opponentDemonicAdvanceActive: false }),
    log: addLogEntry(cleanedState, {
      suffix: `${nextActivePlayer === 'player' ? 'Your' : 'Bot'} turn ${nextTurn}.`,
    }),
  }, nextActivePlayer);

  return runTurnStart(readyCardsForOwner(advancedState, nextActivePlayer));
}

function getOwnerZoneMap(state: GameState, owner: Owner): Record<ZoneId, GameCardInstance[]> {
  return owner === 'player'
    ? state.zones
    : {
        ...state.opponentZones,
        battlefieldLeft: state.zones.battlefieldLeft,
        battlefieldCenter: state.zones.battlefieldCenter,
        battlefieldRight: state.zones.battlefieldRight,
      };
}

export function resolvePendingChoice(state: GameState, selectedInstanceIds: string[]): GameState | { error: string } {
  const pendingChoice = state.pendingChoice;

  if (!pendingChoice) {
    return { error: 'No pending ability choice is waiting to resolve.' };
  }

  const selectedIdSet = new Set(selectedInstanceIds);
  const ownerZones = getOwnerZoneMap(state, pendingChoice.owner);
  const continueCombatIfNeeded = (resolved: GameState | { error: string }): GameState | { error: string } => {
    if (!pendingChoice.resumeCombat || 'error' in resolved) return resolved;
    if (resolved.pendingChoice) {
      return {
        ...resolved,
        pendingChoice: {
          ...resolved.pendingChoice,
          resumeCombat: true,
        },
      };
    }
    const continued = resolveCounterStackAndCombat(resolved);
    return 'error' in continued ? continued : continued.state;
  };
  const continueQueuedScoreItems = (resolved: GameState): GameState => {
    const remainingIds = pendingChoice.remainingScoreItemTriggerIds;
    const owner = pendingChoice.scoreTriggerOwner;
    const zone = pendingChoice.scoreTriggerZone;
    if (!remainingIds || !owner || !zone) return resolved;
    if (resolved.pendingChoice) {
      return {
        ...resolved,
        pendingChoice: {
          ...resolved.pendingChoice,
          remainingScoreItemTriggerIds: remainingIds,
          scoreTriggerOwner: owner,
          scoreTriggerZone: zone,
          resumeTurnAdvance: true,
        },
      };
    }
    return continueScoreItemTriggers(resolved, owner, zone, remainingIds);
  };

  if (pendingChoice.kind === 'luxTarget') {
    const resolved = resolveLuxTargetChoice(state, pendingChoice, selectedInstanceIds);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(resolved);
    if (!('error' in resolved) && pendingChoice.resumeTurnStart && !resolved.pendingChoice) {
      return runTurnStart(resolved);
    }
    if (
      !('error' in resolved) &&
      pendingChoice.resumeTurnAdvance &&
      !resolved.pendingChoice
    ) {
      return pendingChoice.effect === 'seraphielReturn'
        ? finishAdvanceToNextTurnAfterScoring(resolved)
        : advanceToNextTurn(resolved);
    }
    return resolved;
  }

  if (pendingChoice.kind === 'solaraTarget') {
    const resolved = resolveSolaraTargetChoice(state, pendingChoice, selectedInstanceIds);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(resolved);
    if (!('error' in resolved) && pendingChoice.resumeTurnStart && !resolved.pendingChoice) {
      return runTurnStart(resolved);
    }
    if (!('error' in resolved) && pendingChoice.resumeTurnAdvance && !resolved.pendingChoice) {
      return advanceToNextTurn(resolved);
    }
    return resolved;
  }

  if (pendingChoice.kind === 'terraTarget') {
    const resolved = resolveTerraTargetChoice(state, pendingChoice, selectedInstanceIds);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(resolved);
    if (!('error' in resolved) && pendingChoice.resumeTurnAdvance && !resolved.pendingChoice) {
      return pendingChoice.effect === 'ravenRetreat'
        ? finishAdvanceToNextTurnAfterScoring(resolved)
        : advanceToNextTurn(resolved);
    }
    return resolved;
  }

  if (pendingChoice.kind === 'terraZone') {
    return continueCombatIfNeeded(resolveTerraZoneChoice(state, pendingChoice, selectedInstanceIds));
  }

  if (pendingChoice.kind === 'neutralTarget') {
    const resolved = resolveNeutralTargetChoice(state, pendingChoice, selectedInstanceIds);
    if ('error' in resolved) return resolved;
    const continued = continueQueuedScoreItems(resolved);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(continued);
    if (pendingChoice.resumeTurnAdvance && !continued.pendingChoice) {
      return finishAdvanceToNextTurnAfterScoring(continued);
    }
    return continued;
  }

  if (pendingChoice.kind === 'caelumTarget') {
    const resolved = resolveCaelumTargetChoice(state, pendingChoice, selectedInstanceIds);
    if ('error' in resolved) return resolved;
    const continued = continueQueuedScoreItems(resolved);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(continued);
    if (pendingChoice.resumeTurnAdvance && !continued.pendingChoice) {
      return pendingChoice.effect === 'unyieldingStormSweep'
        ? advanceToNextTurn(continued)
        : finishAdvanceToNextTurnAfterScoring(continued);
    }
    return continued;
  }

  if (pendingChoice.kind === 'caelumZone') {
    const resolved = resolveCaelumZoneChoice(state, pendingChoice, selectedInstanceIds);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(resolved);
    if (
      !('error' in resolved) &&
      pendingChoice.resumeTurnStart &&
      !resolved.pendingChoice
    ) {
      return runTurnStart(resolved);
    }
    return resolved;
  }

  if (pendingChoice.kind === 'noxTarget') {
    const resolved = resolveNoxTargetChoice(state, pendingChoice, selectedInstanceIds);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(resolved);
    if (
      !('error' in resolved) &&
      pendingChoice.resumeTurnAdvance &&
      !resolved.pendingChoice
    ) {
      return finishAdvanceToNextTurnAfterScoring(resolved);
    }
    return resolved;
  }

  const sacrificeChosenUnitsInZone = (
    currentState: GameState,
    owner: Owner,
    zone: ZoneId,
    chosenIds: Set<string>
  ): { state: GameState; sacrificedUnits: GameCardInstance[] } | { error: string } => {
    const zoneCards = zone === 'staging'
      ? owner === 'player'
        ? currentState.zones.staging
        : currentState.opponentZones.staging
      : currentState.zones[zone];
    const selectedUnits = zoneCards.filter(
      (instance) => getCardController(instance) === owner && isUnitCard(instance.card) && chosenIds.has(instance.instanceId)
    );

    if (selectedUnits.length !== chosenIds.size) {
      return { error: 'One or more selected units are no longer valid choices.' };
    }

    const sacrificedIds = new Set<string>();
    for (const unit of selectedUnits) {
      sacrificedIds.add(unit.instanceId);
      for (const attachment of zoneCards.filter((instance) => instance.attachedToInstanceId === unit.instanceId)) {
        sacrificedIds.add(attachment.instanceId);
      }
    }

    const sacrificedCards = zoneCards.filter((instance) => sacrificedIds.has(instance.instanceId));
    const remainingZoneCards = zoneCards.filter((instance) => !sacrificedIds.has(instance.instanceId));
    const removedState = zone === 'staging'
      ? owner === 'player'
        ? {
            ...currentState,
            pendingChoice: null,
            zones: {
              ...currentState.zones,
              staging: remainingZoneCards,
            },
          }
        : {
            ...currentState,
            pendingChoice: null,
            opponentZones: {
              ...currentState.opponentZones,
              staging: remainingZoneCards,
            },
          }
      : {
          ...currentState,
          pendingChoice: null,
          zones: {
            ...currentState.zones,
            [zone]: remainingZoneCards,
          },
        };

    return {
      state: moveCardsToOwnerGraveyards(removedState, sacrificedCards),
      sacrificedUnits: selectedUnits,
    };
  };

  if (pendingChoice.kind === 'lucilleScore') {
    const validIdSet = new Set(pendingChoice.availableUnitInstanceIds);
    for (const selectedId of selectedIdSet) {
      if (!validIdSet.has(selectedId)) {
        return { error: 'One or more selected units are no longer valid choices.' };
      }
    }

    const sacrificeResult = sacrificeChosenUnitsInZone(state, pendingChoice.owner, 'staging', selectedIdSet);

    if ('error' in sacrificeResult) {
      return sacrificeResult;
    }

    let nextState = sacrificeResult.state;
    const selectedUnits = sacrificeResult.sacrificedUnits;

    if (selectedUnits.length > 0) {
      nextState = {
        ...adjustVictoryPoints(nextState, pendingChoice.owner, selectedUnits.length),
        log: addLogEntry(nextState, {
          suffix: `${pendingChoice.owner === 'player' ? 'You sacrifice' : 'Bot sacrifices'} ${selectedUnits.length} ${selectedUnits.length === 1 ? 'staging unit' : 'staging units'} with Lucille, Blood Baroness and ${pendingChoice.owner === 'player' ? 'gain' : 'gains'} ${selectedUnits.length} ${selectedUnits.length === 1 ? 'victory point' : 'victory points'}.`,
        }),
      };

      for (const unit of selectedUnits) {
        nextState = triggerCardAbilities(nextState, 'onDeath', {
          source: unit,
          controller: pendingChoice.owner,
          zone: 'graveyard',
        });
        if (nextState.pendingChoice) {
          return pendingChoice.resumeTurnAdvance
            ? {
                ...nextState,
                pendingChoice: {
                  ...nextState.pendingChoice,
                  resumeTurnAdvance: true,
                } as PendingChoice,
              }
            : nextState;
        }
      }
    } else {
      nextState = {
        ...nextState,
        log: addLogEntry(nextState, {
          suffix: `${pendingChoice.owner === 'player' ? 'You choose' : 'Bot chooses'} not to sacrifice any staging units for Lucille, Blood Baroness.`,
        }),
      };
    }

    for (let index = 0; index < pendingChoice.remainingScoreTriggers.length; index += 1) {
      const remainingTrigger = pendingChoice.remainingScoreTriggers[index]!;
      const zoneCards = nextState.zones[remainingTrigger.zone];
      const source = zoneCards.find((instance) => instance.instanceId === remainingTrigger.sourceInstanceId) ?? null;

      if (!source) {
        continue;
      }

      nextState = triggerCardAbilities(nextState, 'onScore', {
        source,
        controller: remainingTrigger.controller,
        zone: remainingTrigger.zone,
      });

      if (nextState.pendingChoice) {
        nextState = {
          ...nextState,
          pendingChoice: {
            ...nextState.pendingChoice,
            remainingScoreTriggers: pendingChoice.remainingScoreTriggers.slice(index + 1),
          } as PendingChoice,
        };
        return nextState;
      }
    }

    return pendingChoice.resumeTurnAdvance ? finishAdvanceToNextTurnAfterScoring(nextState) : nextState;
  }

  if (pendingChoice.kind === 'nerezzaSacrifice') {
    const validIdSet = new Set(pendingChoice.availableUnitInstanceIds);
    for (const selectedId of selectedIdSet) {
      if (!validIdSet.has(selectedId)) {
        return { error: 'One or more selected units are no longer valid choices.' };
      }
    }

    if (selectedIdSet.size === 0) {
      return {
        ...state,
        pendingChoice: null,
        log: addLogEntry(state, {
          suffix: `${pendingChoice.owner === 'player' ? 'You choose' : 'Bot chooses'} not to sacrifice a unit for Nerezza, Umbrasco Scion.`,
        }),
      };
    }

    if (selectedIdSet.size > 1) {
      return { error: 'Choose only one unit to sacrifice for Nerezza, Umbrasco Scion.' };
    }

    const source = getFriendlyUnitsInPlay(state, pendingChoice.owner).find((instance) => instance.instanceId === pendingChoice.sourceInstanceId) ?? null;
    if (!source) {
      return { error: 'Nerezza, Umbrasco Scion is no longer in play.' };
    }

    let sourceZone: ZoneId = 'staging';
    for (const zone of ['staging', ...BATTLEFIELD_ZONE_IDS] satisfies ZoneId[]) {
      const cards = zone === 'staging' ? ownerZones.staging : state.zones[zone];
      if (cards.some((instance) => instance.instanceId === Array.from(selectedIdSet)[0])) {
        sourceZone = zone;
        break;
      }
    }

    const sacrificeResult = sacrificeChosenUnitsInZone(state, pendingChoice.owner, sourceZone, selectedIdSet);
    if ('error' in sacrificeResult) {
      return sacrificeResult;
    }

    let nextState = {
      ...sacrificeResult.state,
      log: addLogEntry(sacrificeResult.state, {
        suffix: `${pendingChoice.owner === 'player' ? 'You sacrifice' : 'Bot sacrifices'} ${sacrificeResult.sacrificedUnits[0]?.card.name ?? 'a unit'} for Nerezza, Umbrasco Scion.`,
      }),
    };

    for (const unit of sacrificeResult.sacrificedUnits) {
      nextState = triggerCardAbilities(nextState, 'onDeath', {
        source: unit,
        controller: pendingChoice.owner,
        zone: 'graveyard',
      });
    }

    const enemyCombatUnits = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
      nextState.zones[zone].filter((instance) => isUnitCard(instance.card) && getCardController(instance) !== pendingChoice.owner)
    ).filter((instance) => !getRenownedUnitLimitError(nextState, pendingChoice.owner, instance));

    if (enemyCombatUnits.length === 0) {
      return nextState;
    }

    return {
      ...nextState,
      pendingChoice: {
        kind: 'nerezzaSteal',
        owner: pendingChoice.owner,
        sourceInstanceId: pendingChoice.sourceInstanceId,
        availableUnitInstanceIds: enemyCombatUnits.map((instance) => instance.instanceId),
      },
    };
  }

  if (pendingChoice.kind === 'nerezzaSteal') {
    const validIdSet = new Set(pendingChoice.availableUnitInstanceIds);
    if (selectedIdSet.size !== 1 || !validIdSet.has(selectedInstanceIds[0] ?? '')) {
      return { error: 'Choose exactly one enemy combat-zone unit for Nerezza, Umbrasco Scion.' };
    }

    const targetId = selectedInstanceIds[0]!;
    const targetZone = BATTLEFIELD_ZONE_IDS.find((zone) => state.zones[zone].some((instance) => instance.instanceId === targetId)) ?? null;
    if (!targetZone) {
      return { error: 'That unit is no longer in a combat zone.' };
    }

    const targetUnit = state.zones[targetZone].find((instance) => instance.instanceId === targetId && isUnitCard(instance.card)) ?? null;
    if (!targetUnit) {
      return { error: 'That unit is no longer valid.' };
    }

    const renownedLimitError = getRenownedUnitLimitError(state, pendingChoice.owner, targetUnit);
    if (renownedLimitError) {
      return { error: renownedLimitError };
    }

    const targetAttachments = state.zones[targetZone].filter((instance) => instance.attachedToInstanceId === targetUnit.instanceId);
    const removedIds = new Set([targetUnit.instanceId, ...targetAttachments.map((instance) => instance.instanceId)]);
    const remainingBattlefield = state.zones[targetZone].filter((instance) => !removedIds.has(instance.instanceId));
    const stolenUnit = prepareCardForZone(
      {
        ...targetUnit,
        controller: pendingChoice.owner,
      },
      'staging',
      { enterExhausted: true }
    );
    const movedAttachments = targetAttachments.map((instance) =>
      prepareCardForZone(
        {
          ...instance,
          controller: pendingChoice.owner,
        },
        'staging',
        { attachToInstanceId: stolenUnit.instanceId }
      )
    );

    return pendingChoice.owner === 'player'
      ? {
          ...state,
          pendingChoice: null,
          zones: {
            ...state.zones,
            [targetZone]: remainingBattlefield,
            staging: [stolenUnit, ...movedAttachments, ...state.zones.staging],
          },
          log: addLogEntry(state, {
            suffix: `Nerezza, Umbrasco Scion took control of ${targetUnit.card.name} and moved it to your staging area exhausted.`,
          }),
        }
      : {
          ...state,
          pendingChoice: null,
          zones: {
            ...state.zones,
            [targetZone]: remainingBattlefield,
          },
          opponentZones: {
            ...state.opponentZones,
            staging: [stolenUnit, ...movedAttachments, ...state.opponentZones.staging],
          },
          log: addLogEntry(state, {
            suffix: `Nerezza, Umbrasco Scion took control of ${targetUnit.card.name} and moved it to Bot staging exhausted.`,
          }),
        };
  }

  if (pendingChoice.kind === 'nocturneMark') {
    const validIdSet = new Set(pendingChoice.availableUnitInstanceIds);
    if (selectedIdSet.size !== 1 || !validIdSet.has(selectedInstanceIds[0] ?? '')) {
      return { error: 'Choose exactly one enemy combat-zone unit for Nocturne Agent.' };
    }

    return {
      ...markUnitToDiscardCardOnDeathThisTurn(
        {
          ...state,
          pendingChoice: null,
        },
        selectedInstanceIds[0]!
      ),
      log: addLogEntry(state, {
        suffix: `${pendingChoice.owner === 'player' ? 'You marked' : 'Bot marked'} a unit with Nocturne Agent; if it dies this turn, its controller discards a card.`,
      }),
    };
  }

  if (pendingChoice.kind === 'forcedDiscard') {
    const validIdSet = new Set(pendingChoice.availableCardInstanceIds);
    if (selectedIdSet.size !== 1 || !validIdSet.has(selectedInstanceIds[0] ?? '')) {
      return { error: 'Choose exactly one card to discard.' };
    }

    const discardId = selectedInstanceIds[0]!;
    const discardedCard = state.zones.hand.find((instance) => instance.instanceId === discardId) ?? null;
    if (!discardedCard) {
      return { error: 'That card is no longer in your hand.' };
    }

    const resolvedState = {
      ...state,
      pendingChoice: null,
      zones: {
        ...state.zones,
        hand: state.zones.hand.filter((instance) => instance.instanceId !== discardId),
        graveyard: [prepareCardForZone(discardedCard, 'graveyard'), ...state.zones.graveyard],
      },
      log: addLogEntry(state, {
        suffix: `${pendingChoice.sourceName} caused you to discard ${discardedCard.card.name}.`,
      }),
    };
    const continued = continueQueuedScoreItems(resolvedState);
    if (pendingChoice.resumeCombat) return continueCombatIfNeeded(continued);
    return pendingChoice.resumeTurnAdvance && !continued.pendingChoice ? finishAdvanceToNextTurnAfterScoring(continued) : continued;
  }

  return { error: 'That pending choice is not supported.' };
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
  const clearTurnOnlyFlags = (instance: GameCardInstance): GameCardInstance =>
    instance.loseVictoryPointOnDeathThisTurnCount ||
    instance.discardCardOnDeathThisTurnCount ||
    instance.preventNextCombatDamageThisTurn ||
    (
      instance.abilitiesSuppressedUntilTurn &&
      state.turn >= instance.abilitiesSuppressedUntilTurn
    ) ||
    (
      instance.protectedFromEnemyTacticsUntilTurn &&
      state.turn >= instance.protectedFromEnemyTacticsUntilTurn
    ) ||
    (
      (instance.temporaryAttackBonus || instance.temporaryHealthBonus) &&
      state.turn >= (instance.temporaryStatsExpireAfterTurn ?? Number.POSITIVE_INFINITY)
    ) ||
    (
      instance.temporaryInfluenceBonus &&
      getCardController(instance) === state.activePlayer &&
      state.turn >= (instance.temporaryInfluenceExpiresAfterTurn ?? Number.POSITIVE_INFINITY)
    ) ||
    (
      instance.temporaryGloryBonus &&
      state.turn >= (instance.temporaryGloryExpiresAfterTurn ?? Number.POSITIVE_INFINITY)
    ) ||
    instance.destroyOnNextDamageUntilTurn === state.turn ||
    instance.gainVictoryPointOnDeathUntilTurn === state.turn ||
    instance.solaraRevealedFromDeckUntilTurn === state.turn
      ? {
          ...instance,
          loseVictoryPointOnDeathThisTurnCount: 0,
          discardCardOnDeathThisTurnCount: 0,
          preventNextCombatDamageThisTurn: false,
          ...(
            state.turn >= (instance.abilitiesSuppressedUntilTurn ?? Number.POSITIVE_INFINITY)
              ? { abilitiesSuppressedUntilTurn: undefined }
              : null
          ),
          ...(
            state.turn >= (instance.protectedFromEnemyTacticsUntilTurn ?? Number.POSITIVE_INFINITY)
              ? { protectedFromEnemyTacticsUntilTurn: undefined }
              : null
          ),
          ...(
            state.turn >= (instance.temporaryStatsExpireAfterTurn ?? Number.POSITIVE_INFINITY)
              ? {
                  temporaryAttackBonus: 0,
                  temporaryHealthBonus: 0,
                  temporaryStatsExpireAfterTurn: undefined,
                }
              : null
          ),
          ...(
            getCardController(instance) === state.activePlayer &&
            state.turn >= (instance.temporaryInfluenceExpiresAfterTurn ?? Number.POSITIVE_INFINITY)
              ? { temporaryInfluenceBonus: 0, temporaryInfluenceExpiresAfterTurn: undefined }
              : null
          ),
          ...(
            instance.solaraRevealedFromDeckUntilTurn === state.turn
              ? { solaraRevealedFromDeckUntilTurn: undefined }
              : null
          ),
          ...(
            state.turn >= (instance.temporaryGloryExpiresAfterTurn ?? Number.POSITIVE_INFINITY)
              ? { temporaryGloryBonus: 0, temporaryGloryExpiresAfterTurn: undefined }
              : null
          ),
          ...(
            instance.destroyOnNextDamageUntilTurn === state.turn
              ? { destroyOnNextDamageUntilTurn: undefined }
              : null
          ),
          ...(
            instance.gainVictoryPointOnDeathUntilTurn === state.turn
              ? { gainVictoryPointOnDeathUntilTurn: undefined, gainVictoryPointOnDeathOwner: undefined }
              : null
          ),
        }
      : instance;
  const clearEndOfTurnCardState = (cards: GameCardInstance[]): GameCardInstance[] =>
    clearDamage(cards).map(clearTurnOnlyFlags);
  const battlefieldZones = Object.fromEntries(
    BATTLEFIELD_ZONE_IDS.map((zone) => [zone, clearEndOfTurnCardState(state.zones[zone])])
  ) as Pick<Record<ZoneId, GameCardInstance[]>, (typeof BATTLEFIELD_ZONE_IDS)[number]>;
  const playerRevealed = state.zones.hand.filter(
    (card) => card.solaraRevealedFromDeckUntilTurn === state.turn
  );
  const opponentRevealed = state.opponentZones.hand.filter(
    (card) => card.solaraRevealedFromDeckUntilTurn === state.turn
  );

  return {
    ...state,
    playerTemporarySupply: 0,
    opponentTemporarySupply: 0,
    zones: {
      ...state.zones,
      deck: [...clearEndOfTurnCardState(playerRevealed), ...clearEndOfTurnCardState(state.zones.deck)],
      hand: clearEndOfTurnCardState(
        state.zones.hand.filter((card) => card.solaraRevealedFromDeckUntilTurn !== state.turn)
      ),
      staging: clearEndOfTurnCardState(state.zones.staging),
      supply: clearEndOfTurnCardState(state.zones.supply),
      graveyard: clearEndOfTurnCardState(state.zones.graveyard),
      banish: clearEndOfTurnCardState(state.zones.banish),
      ...battlefieldZones,
    },
    opponentZones: {
      ...state.opponentZones,
      deck: [...clearEndOfTurnCardState(opponentRevealed), ...clearEndOfTurnCardState(state.opponentZones.deck)],
      hand: clearEndOfTurnCardState(
        state.opponentZones.hand.filter((card) => card.solaraRevealedFromDeckUntilTurn !== state.turn)
      ),
      staging: clearEndOfTurnCardState(state.opponentZones.staging),
      supply: clearEndOfTurnCardState(state.opponentZones.supply),
      graveyard: clearEndOfTurnCardState(state.opponentZones.graveyard),
      banish: clearEndOfTurnCardState(state.opponentZones.banish),
    },
  };
}

function markUnitToLoseVictoryPointOnDeathThisTurn(state: GameState, instanceId: string): GameState {
  const markCard = (instance: GameCardInstance): GameCardInstance =>
    instance.instanceId === instanceId
      ? {
          ...instance,
          loseVictoryPointOnDeathThisTurnCount: (instance.loseVictoryPointOnDeathThisTurnCount ?? 0) + 1,
        }
      : instance;

  return {
    ...state,
    zones: {
      ...state.zones,
      hand: state.zones.hand.map(markCard),
      staging: state.zones.staging.map(markCard),
      supply: state.zones.supply.map(markCard),
      graveyard: state.zones.graveyard.map(markCard),
      banish: state.zones.banish.map(markCard),
      battlefieldLeft: state.zones.battlefieldLeft.map(markCard),
      battlefieldCenter: state.zones.battlefieldCenter.map(markCard),
      battlefieldRight: state.zones.battlefieldRight.map(markCard),
    },
    opponentZones: {
      ...state.opponentZones,
      hand: state.opponentZones.hand.map(markCard),
      staging: state.opponentZones.staging.map(markCard),
      supply: state.opponentZones.supply.map(markCard),
      graveyard: state.opponentZones.graveyard.map(markCard),
      banish: state.opponentZones.banish.map(markCard),
    },
  };
}

export function markUnitToDiscardCardOnDeathThisTurn(state: GameState, instanceId: string): GameState {
  const markCard = (instance: GameCardInstance): GameCardInstance =>
    instance.instanceId === instanceId
      ? {
          ...instance,
          discardCardOnDeathThisTurnCount: (instance.discardCardOnDeathThisTurnCount ?? 0) + 1,
        }
      : instance;

  return {
    ...state,
    zones: {
      ...state.zones,
      hand: state.zones.hand.map(markCard),
      staging: state.zones.staging.map(markCard),
      supply: state.zones.supply.map(markCard),
      graveyard: state.zones.graveyard.map(markCard),
      banish: state.zones.banish.map(markCard),
      battlefieldLeft: state.zones.battlefieldLeft.map(markCard),
      battlefieldCenter: state.zones.battlefieldCenter.map(markCard),
      battlefieldRight: state.zones.battlefieldRight.map(markCard),
    },
    opponentZones: {
      ...state.opponentZones,
      hand: state.opponentZones.hand.map(markCard),
      staging: state.opponentZones.staging.map(markCard),
      supply: state.opponentZones.supply.map(markCard),
      graveyard: state.opponentZones.graveyard.map(markCard),
      banish: state.opponentZones.banish.map(markCard),
    },
  };
}

export function moveCardsToOwnerGraveyards(
  state: GameState,
  destroyedCards: GameCardInstance[]
): GameState {
  if (destroyedCards.length === 0) {
    return state;
  }

  const shouldBanishOnDeath = (instance: GameCardInstance): boolean =>
    Boolean(instance.banishOnDeath) ||
    (
      instance.abandonLabBanishOnDeathUntilTurn !== undefined &&
      state.turn <= instance.abandonLabBanishOnDeathUntilTurn
    );
  const playerDestroyed = destroyedCards
    .filter((instance) => instance.owner === 'player' && !shouldBanishOnDeath(instance) && !shouldCardCeaseInZone(instance, 'graveyard'))
    .map((instance) => prepareCardForZone(instance, 'graveyard'));
  const playerBanished = destroyedCards
    .filter((instance) => instance.owner === 'player' && shouldBanishOnDeath(instance) && !shouldCardCeaseInZone(instance, 'banish'))
    .map((instance) => prepareCardForZone(instance, 'banish'));
  const opponentDestroyed = destroyedCards
    .filter((instance) => instance.owner === 'opponent' && !shouldBanishOnDeath(instance) && !shouldCardCeaseInZone(instance, 'graveyard'))
    .map((instance) => prepareCardForZone(instance, 'graveyard'));
  const opponentBanished = destroyedCards
    .filter((instance) => instance.owner === 'opponent' && shouldBanishOnDeath(instance) && !shouldCardCeaseInZone(instance, 'banish'))
    .map((instance) => prepareCardForZone(instance, 'banish'));

  return {
    ...state,
    zones: {
      ...state.zones,
      graveyard: [...playerDestroyed, ...state.zones.graveyard],
      banish: [...playerBanished, ...state.zones.banish],
    },
    opponentZones: {
      ...state.opponentZones,
      graveyard: [...opponentDestroyed, ...state.opponentZones.graveyard],
      banish: [...opponentBanished, ...state.opponentZones.banish],
    },
  };
}

function returnAbandonLabUnits(state: GameState, owner: Owner): GameState {
  const returnable = [...state.zones.banish, ...state.opponentZones.banish].filter(
    (instance) =>
      instance.abandonLabReturnController === owner &&
      state.turn >= (instance.abandonLabReturnAfterTurn ?? Number.POSITIVE_INFINITY)
  );

  if (returnable.length === 0) {
    return state;
  }

  const returnableIds = new Set(returnable.map((instance) => instance.instanceId));
  const prepared = returnable.map((instance) => ({
    ...prepareCardForZone(
      {
        ...instance,
        controller: instance.owner === owner ? undefined : owner,
        abandonLabBanishOnDeathUntilTurn: undefined,
        abandonLabReturnController: undefined,
        abandonLabReturnAfterTurn: undefined,
      },
      'staging',
      { enterExhausted: true }
    ),
    ready: false,
    skipNextReady: false,
  }));
  const nextState: GameState = owner === 'player'
    ? {
        ...state,
        zones: {
          ...state.zones,
          banish: state.zones.banish.filter((instance) => !returnableIds.has(instance.instanceId)),
          staging: [...prepared, ...state.zones.staging],
        },
        opponentZones: {
          ...state.opponentZones,
          banish: state.opponentZones.banish.filter((instance) => !returnableIds.has(instance.instanceId)),
        },
      }
    : {
        ...state,
        zones: {
          ...state.zones,
          banish: state.zones.banish.filter((instance) => !returnableIds.has(instance.instanceId)),
        },
        opponentZones: {
          ...state.opponentZones,
          banish: state.opponentZones.banish.filter((instance) => !returnableIds.has(instance.instanceId)),
          staging: [...prepared, ...state.opponentZones.staging],
        },
      };

  return {
    ...nextState,
    log: addLogEntry(nextState, {
      suffix: `Abandon the Lab returned ${returnable.length === 1 ? returnable[0]!.card.name : `${returnable.length} units`} to ${owner === 'player' ? 'your' : 'Bot'} staging area exhausted.`,
    }),
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

  if (state.pendingChoice) {
    return 'Resolve the pending ability choice before declaring another attack.';
  }

  if (state.phase !== 'main' || state.activePlayer !== owner) {
    return 'You can only attack during your main turn.';
  }

  if (!BATTLEFIELD_ZONES.has(targetZone)) {
    return 'Attacks must target a battlefield.';
  }

  const stagingAttacker = getOwnerStagingCards(state, owner).find(
    (instance) => instance.instanceId === attackerInstanceId
  ) ?? null;
  const battlefieldAttacker = BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).find(
    (instance) =>
      instance.instanceId === attackerInstanceId &&
      isUnitCard(instance.card) &&
      getCardController(instance) === owner &&
      hasCardKeyword(instance.card, 'flanking')
  ) ?? null;
  const attacker = stagingAttacker ?? battlefieldAttacker;

  if (!attacker) {
    return 'Only units in your staging area can attack.';
  }

  if (!isUnitCard(attacker.card)) {
    return 'Only units can attack.';
  }

  if (!attacker.ready) {
    return 'Only ready units can attack.';
  }

  if (battlefieldAttacker?.flankingAttackUsedTurn === state.turn) {
    return `${battlefieldAttacker.card.name} has already attacked from a combat zone this turn.`;
  }

  const renownedLimitError = getRenownedUnitLimitError(state, owner, attacker, attacker.instanceId);
  if (renownedLimitError) {
    return renownedLimitError;
  }

  const occupyingUnit = state.zones[targetZone].find((instance) => isUnitCard(instance.card)) ?? null;

  if (
    attacker.card.id === 'IMP097' &&
    attacker.attackOnlyUnoccupiedUntilTurn === state.turn &&
    occupyingUnit
  ) {
    return `${attacker.card.name} can only attack an unoccupied combat zone this turn.`;
  }

  if (occupyingUnit && getCardController(occupyingUnit) === owner) {
    return `${getZoneLogLabel(targetZone)} is already occupied by your unit.`;
  }

  if (state.zones[targetZone].some((instance) => instance.card.id === 'IMP063' && !instance.faceDown)) {
    return 'Units cannot attack a Quarantine Zone.';
  }

  const hasProvoke = (unit: GameCardInstance, zoneCards: GameCardInstance[]) =>
    !isUnitInQuarantineZone(state, unit.instanceId) &&
    !(unit.abilitiesSuppressedUntilTurn !== undefined && state.turn <= unit.abilitiesSuppressedUntilTurn) &&
    (
      ['IMP034', 'IMP035', 'IMP037', 'IMP132', 'IMP142'].includes(unit.card.id) ||
      zoneCards.some(
        (card) =>
          card.card.id === 'IMP060' &&
          card.attachedToInstanceId === unit.instanceId &&
          !(card.abilitiesSuppressedUntilTurn !== undefined && state.turn <= card.abilitiesSuppressedUntilTurn)
      )
    );
  const enemyProvokeUnits = BATTLEFIELD_ZONE_IDS.flatMap((zone) =>
    state.zones[zone]
      .filter(
        (unit) =>
          isUnitCard(unit.card) &&
          getCardController(unit) !== owner &&
          hasProvoke(unit, state.zones[zone])
      )
  );
  if (
    enemyProvokeUnits.length > 0 &&
    (!occupyingUnit || !hasProvoke(occupyingUnit, state.zones[targetZone]))
  ) {
    return 'You must attack an enemy unit with Provoke.';
  }

  if (
    occupyingUnit?.card.id === 'IMP050' &&
    !isUnitInQuarantineZone(state, occupyingUnit.instanceId) &&
    getCurrentUnitAttack(state, attacker) <= 2
  ) {
    return `${attacker.card.name} needs more than 2 attack to attack ${occupyingUnit.card.name}.`;
  }

  return null;
}

export function dealDamageToUnit(state: GameState, instanceId: string, amount: number): GameState {
  if (amount <= 0) return state;
  const target = getCardInstanceById(state, instanceId);
  if (!target || !isUnitCard(target.card)) return state;
  const damageCards = (cards: GameCardInstance[]) =>
    cards.map((card) =>
      card.instanceId === instanceId ? { ...card, damage: card.damage + amount } : card
    );
  let nextState: GameState = {
    ...state,
    zones: {
      ...state.zones,
      staging: damageCards(state.zones.staging),
      battlefieldLeft: damageCards(state.zones.battlefieldLeft),
      battlefieldCenter: damageCards(state.zones.battlefieldCenter),
      battlefieldRight: damageCards(state.zones.battlefieldRight),
    },
    opponentZones: {
      ...state.opponentZones,
      staging: damageCards(state.opponentZones.staging),
    },
  };
  const damaged = getCardInstanceById(nextState, instanceId);
  if (
    damaged &&
    (
      damaged.destroyOnNextDamageUntilTurn === state.turn ||
      damaged.damage >= getCurrentUnitHealth(nextState, damaged)
    )
  ) {
    const removed = removeUnitFromPlay(nextState, instanceId);
    if (!('error' in removed)) nextState = removed.state;
  }
  return nextState;
}

function stageFlankingAttackerForCombat(
  state: GameState,
  owner: Owner,
  attackerInstanceId: string
): GameState {
  if (getOwnerStagingCards(state, owner).some((card) => card.instanceId === attackerInstanceId)) {
    return state;
  }
  const origin = BATTLEFIELD_ZONE_IDS.find((zone) =>
    state.zones[zone].some((card) => card.instanceId === attackerInstanceId)
  );
  if (!origin) return state;
  const attacker = state.zones[origin].find((card) => card.instanceId === attackerInstanceId);
  if (!attacker || !hasCardKeyword(attacker.card, 'flanking')) return state;
  const attachments = getAttachedCards(state.zones[origin], attacker.instanceId);
  const ids = new Set([attacker.instanceId, ...attachments.map((card) => card.instanceId)]);
  const stagedAttacker = {
    ...attacker,
    flankingOriginZone: origin,
    flankingAttackUsedTurn: state.turn,
  };
  return owner === 'player'
    ? {
        ...state,
        zones: {
          ...state.zones,
          [origin]: state.zones[origin].filter((card) => !ids.has(card.instanceId)),
          staging: [stagedAttacker, ...attachments, ...state.zones.staging],
        },
      }
    : {
        ...state,
        zones: {
          ...state.zones,
          [origin]: state.zones[origin].filter((card) => !ids.has(card.instanceId)),
        },
        opponentZones: {
          ...state.opponentZones,
          staging: [stagedAttacker, ...attachments, ...state.opponentZones.staging],
        },
      };
}

function restoreFlankingAttackerToOriginForDisplay(
  state: GameState,
  owner: Owner,
  attackerInstanceId: string,
  origin: ZoneId
): GameState {
  const staging = getOwnerStagingCards(state, owner);
  const attacker = staging.find((card) => card.instanceId === attackerInstanceId);
  if (!attacker) return state;

  const attachments = getAttachedCards(staging, attacker.instanceId);
  const ids = new Set([attacker.instanceId, ...attachments.map((card) => card.instanceId)]);
  const displayedAttacker = { ...attacker, flankingOriginZone: undefined };

  return owner === 'player'
    ? {
        ...state,
        zones: {
          ...state.zones,
          staging: state.zones.staging.filter((card) => !ids.has(card.instanceId)),
          [origin]: [displayedAttacker, ...attachments, ...state.zones[origin]],
        },
      }
    : {
        ...state,
        zones: {
          ...state.zones,
          [origin]: [displayedAttacker, ...attachments, ...state.zones[origin]],
        },
        opponentZones: {
          ...state.opponentZones,
          staging: state.opponentZones.staging.filter((card) => !ids.has(card.instanceId)),
        },
      };
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

  state = stageFlankingAttackerForCombat(state, owner, attackerInstanceId);
  const attacker = getOwnerStagingCards(state, owner).find((instance) => instance.instanceId === attackerInstanceId) ?? null;
  const flankingOriginZone = attacker?.flankingOriginZone;

  if (!attacker) {
    return { error: 'Only units in your staging area can attack.' };
  }

  const defender = state.zones[targetZone].find((instance) => isUnitCard(instance.card) && getCardController(instance) !== owner) ?? null;
  const defendingOwner: Owner = owner === 'player' ? 'opponent' : 'player';
  const pendingCombat: PendingCombat = {
    attackerOwner: owner,
    attackerInstanceId,
    targetZone,
    defenderInstanceId: defender?.instanceId ?? null,
    ...(flankingOriginZone ? { flankingOriginZone } : {}),
    priorityOwner: defendingOwner,
    lastPassedOwner: null,
    lastCounterActionOwner: null,
    counterStack: [],
  };

  let nextState: GameState = {
    ...state,
    pendingCombat,
    log: addLogEntry(state, {
      prefix: 'Declared attack ',
      cardName: attacker.card.name,
      suffix: flankingOriginZone
        ? defender
          ? ` from ${getZoneLogLabel(flankingOriginZone)} into ${getZoneLogLabel(targetZone)}, targeting ${defender.card.name}. Counter priority opened.`
          : ` from ${getZoneLogLabel(flankingOriginZone)} into ${getZoneLogLabel(targetZone)}. Counter priority opened.`
        : defender
          ? ` into ${getZoneLogLabel(targetZone)}, targeting ${defender.card.name}. Counter priority opened.`
          : ` into ${getZoneLogLabel(targetZone)}. Counter priority opened.`,
    }),
  };

  nextState = triggerCardAbilities(nextState, 'onAttack', {
    source: attacker,
    controller: owner,
    zone: targetZone,
    targets: defender ? [{ type: 'card', instanceId: defender.instanceId }] : undefined,
  });

  if (defender) {
    nextState = triggerCardAbilities(nextState, 'onDefend', {
      source: defender,
      controller: getCardController(defender),
      zone: targetZone,
      targets: [{ type: 'card', instanceId: attacker.instanceId }],
    });
    const ancestralCrown = state.zones[targetZone].find(
      (card) =>
        card.card.id === 'IMP155' &&
        !card.faceDown &&
        getCardController(card) === getCardController(defender)
    );
    const defenderSubtype = defender.card.subtype.toLowerCase();
    if (
      ancestralCrown &&
      ['sylvan', 'kitsune', 'beast'].some((subtype) => defenderSubtype.includes(subtype))
    ) {
      nextState = readyUnitInPlay(nextState, defender.instanceId);
      nextState = {
        ...nextState,
        zones: {
          ...nextState.zones,
          [targetZone]: nextState.zones[targetZone].map((card) =>
            card.instanceId === defender.instanceId
              ? { ...card, combatAttackBonus: (card.combatAttackBonus ?? 0) + 2 }
              : card
          ),
        },
      };
    }
    if (
      state.zones[targetZone].some(
        (instance) =>
          instance.card.id === 'IMP094' &&
          !instance.faceDown &&
          getCardController(instance) === getCardController(defender)
      )
    ) {
      nextState = readyUnitInPlay(nextState, defender.instanceId);
    }

    const currentDefender = getCardInstanceById(nextState, defender.instanceId);
    if (
      currentDefender &&
      isUnitCard(currentDefender.card) &&
      ['IMP067', 'IMP079', 'IMP111', 'IMP127', 'IMP130'].includes(currentDefender.card.id) &&
      !currentDefender.ready
    ) {
      const fortifyOptions = getFortifyDiscardOptions(nextState, currentDefender);
      if (fortifyOptions.length > 0) {
        if (getCardController(currentDefender) === 'player') {
          nextState = {
            ...nextState,
            pendingChoice: {
              kind: 'caelumTarget',
              owner: 'player',
              sourceInstanceId: currentDefender.instanceId,
              sourceName: currentDefender.card.name,
              prompt: `Discard a ${currentDefender.card.affinity} card to ready ${currentDefender.card.name}?`,
              effect: 'fortifyDiscard',
              availableInstanceIds: fortifyOptions.map((card) => card.instanceId),
              optional: true,
            },
          };
        } else {
          nextState = applyFortifyDiscard(nextState, currentDefender.instanceId, fortifyOptions[0]!);
        }
      }
    }

    if (attacker.card.id === 'IMP008') {
      nextState = {
        ...markUnitToLoseVictoryPointOnDeathThisTurn(nextState, defender.instanceId),
        log: addLogEntry(nextState, {
          suffix: `${attacker.card.name} marked ${defender.card.name}; if it dies this turn, its controller loses 1 victory point.`,
        }),
      };
    }
  }

  if (flankingOriginZone) {
    nextState = restoreFlankingAttackerToOriginForDisplay(nextState, owner, attacker.instanceId, flankingOriginZone);
  }

  return {
    state: nextState,
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

  if (isUnitCard(counter.card) && hasCardKeyword(counter.card, 'swift')) {
    const renownedLimitError = getRenownedUnitLimitError(state, owner, counter);
    if (renownedLimitError) {
      return renownedLimitError;
    }
  }

  if (
    ['IMP026', 'IMP027', 'IMP045', 'IMP057', 'IMP058', 'IMP087', 'IMP088', 'IMP121', 'IMP150', 'IMP151', 'IMP163'].includes(counter.card.id) &&
    getCounterTargetOptions(state, counter).length === 0
  ) {
    return `${counter.card.name} has no valid target.`;
  }

  return getPlayCostError(state, owner, counter.card);
}

export function playCounterCard(
  state: GameState,
  owner: Owner,
  instanceId: string,
  options: { targetInstanceId?: string } = {}
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

  const counterTargets = getCounterTargetOptions(state, counter);
  if (counterTargets.length > 0 && !options.targetInstanceId) {
    return { error: `Choose a target for ${counter.card.name}.` };
  }
  if (
    options.targetInstanceId &&
    (counterTargets.length === 0 || !counterTargets.some((target) => target.instanceId === options.targetInstanceId))
  ) {
    return { error: 'Choose a valid counter target.' };
  }

  const paidState = exhaustSupplyForCost(state, owner, getModifiedPlayCost(state, owner, counter.card));
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

  const stackedCounter: GameCardInstance = options.targetInstanceId
    ? { ...counter, selectedAbilityTargetInstanceIds: [options.targetInstanceId] }
    : counter;
  const selectedTarget = options.targetInstanceId
    ? counterTargets.find((target) => target.instanceId === options.targetInstanceId) ?? null
    : null;

  return {
    state: {
      ...nextState,
      pendingCombat: {
        ...pendingCombat,
        priorityOwner: nextPriorityOwner,
        lastPassedOwner: null,
        lastCounterActionOwner: owner,
        counterStack: [...pendingCombat.counterStack, stackedCounter],
      },
      log: addLogEntry(nextState, {
        prefix: `${owner === 'player' ? 'You played ' : 'Bot played '}`,
        cardName: counter.card.name,
        suffix: selectedTarget
          ? ` as a counter, targeting ${selectedTarget.card.name}.`
          : ' as a counter.',
      }),
    },
    counter: stackedCounter,
  };
}

function resolveCounterCard(state: GameState, counter: GameCardInstance): GameState {
  const owner = counter.owner;
  if (counter.counterStackEntryKind === 'activatedAbility') {
    const nextState = triggerCardAbilities(state, 'activated', {
      source: counter,
      controller: getCardController(counter),
      targets: counter.selectedAbilityTargetInstanceIds?.map((instanceId) => ({ type: 'card' as const, instanceId })),
      costsPaid: true,
    });
    return {
      ...nextState,
      log: addLogEntry(nextState, {
        prefix: 'Resolved activated ability of ',
        cardName: counter.card.name,
        suffix: '.',
      }),
    };
  }

  const hasImplementedEffect = getImplementedAbilitiesForTrigger(counter.card.id, 'onPlay').length > 0;
  let nextState = triggerCardAbilities(state, 'onPlay', {
    source: counter,
    controller: owner,
    zone: null,
    targets: counter.selectedAbilityTargetInstanceIds?.map((instanceId) => ({ type: 'card' as const, instanceId })),
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
      targets: counter.selectedAbilityTargetInstanceIds?.map((instanceId) => ({ type: 'card' as const, instanceId })),
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
      suffix: getCardType(counter.card) === 'tactic' && !hasImplementedEffect
        ? ', but its printed effect is not implemented yet.'
        : '.',
    }),
  };
}

function resolveCounterStackAndCombat(
  state: GameState,
  resolvedCounters: GameCardInstance[] = []
): CounterPriorityPassResult | { error: string } {
  let resolvingState = state;
  const counters = [...resolvedCounters];

  while (resolvingState.pendingCombat?.counterStack.length) {
    const pendingCombat = resolvingState.pendingCombat;
    const counter = pendingCombat.counterStack[pendingCombat.counterStack.length - 1]!;
    resolvingState = {
      ...resolvingState,
      pendingCombat: {
        ...pendingCombat,
        counterStack: pendingCombat.counterStack.slice(0, -1),
      },
    };
    resolvingState = resolveCounterCard(resolvingState, counter);
    counters.push(counter);

    if (resolvingState.pendingChoice) {
      return {
        state: {
          ...resolvingState,
          pendingChoice: {
            ...resolvingState.pendingChoice,
            resumeCombat: true,
          },
        },
        resolvedCombat: null,
        resolvedCounters: counters,
      };
    }
  }

  const pendingCombat = resolvingState.pendingCombat;
  if (!pendingCombat) {
    return { error: 'No counter window is open.' };
  }

  const result = resolveBattlefieldAttack(
    resolvingState,
    pendingCombat.attackerOwner,
    pendingCombat.attackerInstanceId,
    pendingCombat.targetZone
  );

  if ('error' in result) {
    return { error: result.error };
  }

  return {
    state: result.state,
    resolvedCombat: result,
    resolvedCounters: counters,
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

  if (
    pendingCombat.counterStack.length === 0 ||
    (pendingCombat.lastCounterActionOwner && pendingCombat.lastCounterActionOwner !== owner) ||
    (pendingCombat.lastPassedOwner && pendingCombat.lastPassedOwner !== owner)
  ) {
    const resolvingState: GameState = {
      ...state,
      log: addLogEntry(state, {
        suffix: `${owner === 'player' ? 'You pass' : 'Bot passes'} counter priority. Counter window closes.`,
      }),
    };
    return resolveCounterStackAndCombat(resolvingState);
  }

  const nextPriorityOwner: Owner = owner === 'player' ? 'opponent' : 'player';
  return {
    state: {
      ...state,
      pendingCombat: {
        ...pendingCombat,
        priorityOwner: nextPriorityOwner,
        lastPassedOwner: owner,
        lastCounterActionOwner: null,
      },
      log: addLogEntry(state, {
        suffix: `${owner === 'player' ? 'You pass' : 'Bot passes'} counter priority.`,
      }),
    },
    resolvedCombat: null,
    resolvedCounters: [],
  };
}

function clearCombatAttackBonuses(state: GameState): GameState {
  const clearCards = (cards: GameCardInstance[]) =>
    cards.map((card) => card.combatAttackBonus ? { ...card, combatAttackBonus: undefined } : card);
  return {
    ...state,
    zones: {
      ...state.zones,
      staging: clearCards(state.zones.staging),
      battlefieldLeft: clearCards(state.zones.battlefieldLeft),
      battlefieldCenter: clearCards(state.zones.battlefieldCenter),
      battlefieldRight: clearCards(state.zones.battlefieldRight),
    },
    opponentZones: {
      ...state.opponentZones,
      staging: clearCards(state.opponentZones.staging),
    },
  };
}

function getPrintedGloryValue(instance: GameCardInstance): number {
  const match = instance.card.rulesText.match(/\bGlory\s+(\d+)/i);
  if (match?.[1]) {
    return Number.parseInt(match[1], 10) || 0;
  }

  if (instance.card.id === 'IMP107') return 2;
  if (instance.card.id === 'IMP110') return 1;
  return 0;
}

function getGrantedEquipmentGloryValue(attachments: GameCardInstance[]): number {
  return attachments.reduce((total, attachment) => {
    if (!attachment.attachedToInstanceId) return total;
    const match = attachment.card.rulesText.match(/\bgains Glory\s+(\d+)/i);
    if (match?.[1]) {
      return total + (Number.parseInt(match[1], 10) || 0);
    }
    return total + (attachment.card.id === 'IMP122' ? 1 : 0);
  }, 0);
}

export function resolveBattlefieldAttack(
  state: GameState,
  owner: Owner,
  attackerInstanceId: string,
  targetZone: ZoneId
): BattlefieldAttackResult | { error: string } {
  const combatBeingResolved =
    state.pendingCombat?.attackerOwner === owner &&
    state.pendingCombat.attackerInstanceId === attackerInstanceId &&
    state.pendingCombat.targetZone === targetZone;
  const attackError = combatBeingResolved
    ? null
    : getBattlefieldAttackError(state, owner, attackerInstanceId, targetZone);

  if (attackError) {
    return { error: attackError };
  }

  if (combatBeingResolved && state.pendingCombat?.flankingOriginZone) {
    state = stageFlankingAttackerForCombat(state, owner, attackerInstanceId);
  } else if (!combatBeingResolved) {
    state = stageFlankingAttackerForCombat(state, owner, attackerInstanceId);
  }
  const attacker = getOwnerStagingCards(state, owner).find((instance) => instance.instanceId === attackerInstanceId);

  if (combatBeingResolved && attacker?.skipCurrentCombat) {
    const clearSkip = (cards: GameCardInstance[]) =>
      cards.map((card) => card.instanceId === attacker.instanceId ? { ...card, skipCurrentCombat: undefined } : card);
    const nextState = clearCombatAttackBonuses({
      ...state,
      pendingCombat: null,
      zones: { ...state.zones, staging: clearSkip(state.zones.staging) },
      opponentZones: { ...state.opponentZones, staging: clearSkip(state.opponentZones.staging) },
      log: addLogEntry(state, { suffix: `${attacker.card.name} retreated before combat damage.` }),
    });
    return {
      state: nextState,
      attacker,
      defender: null,
      attackerDestroyed: false,
      defenderDestroyed: false,
      captured: false,
      scoredVictoryPoints: 0,
    };
  }

  if (!attacker) {
    if (combatBeingResolved) {
      const removedAttacker = getCardInstanceById(state, attackerInstanceId);
      const defender = state.pendingCombat?.defenderInstanceId
        ? getCardInstanceById(state, state.pendingCombat.defenderInstanceId)
        : null;

      if (!removedAttacker || !isUnitCard(removedAttacker.card)) {
        return { error: 'Only units in your staging area can attack.' };
      }

      const nextState = clearCombatAttackBonuses({
        ...state,
        pendingCombat: null,
        log: addLogEntry(state, {
          suffix: `${removedAttacker.card.name} was removed before combat damage, so combat ends without damage.`,
        }),
      });

      return {
        state: nextState,
        attacker: removedAttacker,
        defender: defender && isUnitCard(defender.card) ? defender : null,
        attackerDestroyed: true,
        defenderDestroyed: false,
        captured: false,
        scoredVictoryPoints: 0,
      };
    }

    return { error: 'Only units in your staging area can attack.' };
  }

  const attackerAttachments = getAttachedCards(getOwnerStagingCards(state, owner), attacker.instanceId);
  const defender = state.zones[targetZone].find((instance) => isUnitCard(instance.card) && getCardController(instance) !== owner) ?? null;

  if (!combatBeingResolved && !defender) {
    state = triggerCardAbilities(state, 'onAttack', {
      source: attacker,
      controller: owner,
      zone: targetZone,
    });
  }

  const defenderAttachments = defender ? getAttachedCards(state.zones[targetZone], defender.instanceId) : [];
  const impedeAmount = defender
    ? (
        (['IMP128', 'IMP132', 'IMP135', 'IMP138'].includes(defender.card.id) ? 1 : 0) +
        defenderAttachments.filter((card) => card.card.id === 'IMP152').length
      )
    : 0;
  const attackerAttack = attacker.ready
    ? Math.max(0, getCurrentUnitAttack(state, attacker, targetZone) - impedeAmount)
    : 0;
  const attackerHealth = getCurrentUnitHealth(state, attacker);
  const defenderAttack = defender?.ready ? getCurrentUnitAttack(state, defender) : 0;
  const defenderHealth = defender ? getCurrentUnitHealth(state, defender) : 0;
  const attackerDamageTaken =
    defender &&
    !(
      ['IMP040', 'IMP099'].includes(attacker.card.id) &&
      !isUnitInQuarantineZone(state, attacker.instanceId)
    )
      ? defenderAttack
      : 0;
  const defenderDamageTaken = defender
    ? defender.preventNextCombatDamageThisTurn
      ? 0
      : attackerAttack
    : 0;
  const defenderDestroyed = Boolean(
    defender &&
    (
      defender.damage + defenderDamageTaken >= defenderHealth ||
      (defenderDamageTaken > 0 && defender.destroyOnNextDamageUntilTurn === state.turn)
    )
  );
  const attackerDestroyed = Boolean(defender && attacker.damage + attackerDamageTaken >= attackerHealth);
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
    retreatLockedUntilNextTurn: false,
  };
  const nextStagingCards = attackerDestroyed || captured
    ? attackingStagingCards
    : [exhaustedAttacker, ...attackerAttachments, ...attackingStagingCards];
  const capturedAttacker = captured
    ? {
        ...prepareCardForZone(
        {
          ...attacker,
          damage: attacker.damage + attackerDamageTaken,
          flankingOriginZone: undefined,
        },
        targetZone
      ),
        ready: defender ? false : true,
        retreatLockedUntilNextTurn: false,
      }
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
              preventNextCombatDamageThisTurn: defenderDamageTaken === 0
                ? false
                : instance.preventNextCombatDamageThisTurn,
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
        prefix: attacker.flankingOriginZone ? 'Flanked ' : 'Attacked ',
        cardName: attacker.card.name,
        suffix: defender
          ? attacker.flankingOriginZone
            ? ` from ${getZoneLogLabel(attacker.flankingOriginZone)} into ${getZoneLogLabel(targetZone)}, fighting ${defender.card.name}.`
            : ` into ${getZoneLogLabel(targetZone)}, fighting ${defender.card.name}.`
          : attacker.flankingOriginZone
            ? ` from ${getZoneLogLabel(attacker.flankingOriginZone)} into ${getZoneLogLabel(targetZone)}.`
            : ` into ${getZoneLogLabel(targetZone)}.`,
      }),
    },
    destroyedCards
  );

  if (!attackerDestroyed && !captured && attacker.flankingOriginZone) {
    const origin = attacker.flankingOriginZone;
    const staging = owner === 'player' ? nextState.zones.staging : nextState.opponentZones.staging;
    const returningAttacker = staging.find((card) => card.instanceId === attacker.instanceId);
    const returningAttachments = getAttachedCards(staging, attacker.instanceId);
    if (returningAttacker) {
      const ids = new Set([returningAttacker.instanceId, ...returningAttachments.map((card) => card.instanceId)]);
      const returnedUnit = {
        ...returningAttacker,
        flankingOriginZone: undefined,
        ready: false,
      };
      nextState = owner === 'player'
        ? {
            ...nextState,
            zones: {
              ...nextState.zones,
              staging: nextState.zones.staging.filter((card) => !ids.has(card.instanceId)),
              [origin]: [returnedUnit, ...returningAttachments, ...nextState.zones[origin]],
            },
          }
        : {
            ...nextState,
            zones: {
              ...nextState.zones,
              [origin]: [returnedUnit, ...returningAttachments, ...nextState.zones[origin]],
            },
            opponentZones: {
              ...nextState.opponentZones,
              staging: nextState.opponentZones.staging.filter((card) => !ids.has(card.instanceId)),
            },
          };
    }
  }

  if (defenderDestroyed && defender) {
    const gloryEquipment = getGrantedEquipmentGloryValue(attackerAttachments);
    const printedGlory = getPrintedGloryValue(attacker);
    const glory = printedGlory + gloryEquipment + (attacker.temporaryGloryBonus ?? 0);
    if (glory > 0) {
      nextState = {
        ...adjustVictoryPoints(nextState, owner, glory),
        log: addLogEntry(nextState, {
          suffix: `${attacker.card.name} gained ${glory} victory point${glory === 1 ? '' : 's'} from Glory.`,
        }),
      };
    }
    if (revealsTopAfterDestroyingDefenderInCombat(attacker)) {
      nextState = revealTopCardForSolara(nextState, owner, attacker.card.name);
    }
  }

  if (defender) {
    nextState = {
      ...nextState,
      log: addLogEntry(nextState, {
        suffix: `${attacker.card.name} dealt ${defenderDamageTaken} damage to ${defender.card.name}. ${defender.card.name} dealt ${attackerDamageTaken} damage to ${attacker.card.name}.`,
      }),
    };
  }

  if (capturedAttacker) {
    nextState = resolveUnitTakesControlOfZone(nextState, targetZone);
  }

  if (capturedAttacker && !defender) {
    const driftersNecklaces = nextState.zones[targetZone].filter(
      (instance) =>
        instance.card.id === 'IMP090' &&
        instance.attachedToInstanceId === capturedAttacker.instanceId
    );
    for (const necklace of driftersNecklaces) {
      const necklaceController = getCardController(necklace);
      nextState = {
        ...adjustVictoryPoints(nextState, necklaceController, 1),
        zones: {
          ...nextState.zones,
          [targetZone]: nextState.zones[targetZone].filter((instance) => instance.instanceId !== necklace.instanceId),
          ...(necklace.owner === 'player'
            ? {
                hand: [
                  prepareCardForZone(necklace, 'hand'),
                  ...nextState.zones.hand,
                ],
              }
            : null),
        },
        opponentZones: necklace.owner === 'opponent'
          ? {
              ...nextState.opponentZones,
              hand: [
                prepareCardForZone(necklace, 'hand'),
                ...nextState.opponentZones.hand,
              ],
            }
          : nextState.opponentZones,
        log: addLogEntry(nextState, {
          suffix: `${necklace.card.name} returned to hand and ${necklaceController === 'player' ? 'you gain' : 'Bot gains'} 1 victory point.`,
        }),
      };
    }
  }

  if (
    capturedAttacker &&
    attacker.card.id === 'IMP069' &&
    defenderDestroyed &&
    defender
  ) {
    nextState = {
      ...nextState,
      zones: {
        ...nextState.zones,
        [targetZone]: nextState.zones[targetZone].filter(
          (instance) =>
            instance.instanceId !== capturedAttacker.instanceId &&
            !capturedAttachments.some((attachment) => attachment.instanceId === instance.instanceId)
        ),
        ...(owner === 'player'
          ? {
              staging: [
                prepareCardForZone(capturedAttacker, 'staging', { enterExhausted: true }),
                ...capturedAttachments.map((attachment) =>
                  prepareCardForZone(attachment, 'staging', { attachToInstanceId: capturedAttacker.instanceId })
                ),
                ...nextState.zones.staging,
              ],
            }
          : null),
      },
      opponentZones: owner === 'opponent'
        ? {
            ...nextState.opponentZones,
            staging: [
              prepareCardForZone(capturedAttacker, 'staging', { enterExhausted: true }),
              ...capturedAttachments.map((attachment) =>
                prepareCardForZone(attachment, 'staging', { attachToInstanceId: capturedAttacker.instanceId })
              ),
              ...nextState.opponentZones.staging,
            ],
          }
        : nextState.opponentZones,
      log: addLogEntry(nextState, {
        suffix: `${attacker.card.name} retreated after destroying ${defender.card.name}.`,
      }),
    };
  }

  for (const destroyedUnit of [attackerDestroyed ? attacker : null, defenderDestroyed ? defender : null]) {
    if (!destroyedUnit) {
      continue;
    }

    nextState = applyDisruptionStaffDiscards(
      nextState,
      destroyedUnit,
      destroyedUnit.instanceId === attacker.instanceId ? attackerAttachments : defenderAttachments
    );
    if (nextState.pendingChoice) {
      break;
    }

    nextState = triggerCardAbilities(nextState, 'onDeath', {
      source: destroyedUnit,
      controller: getCardController(destroyedUnit),
      zone: targetZone,
    });
    if (nextState.pendingChoice) {
      break;
    }
    if (getOwnerZoneMap(nextState, destroyedUnit.owner).graveyard.some(
      (card) => card.instanceId === destroyedUnit.instanceId
    )) {
      nextState = applyHallowedSanctumDeath(nextState, destroyedUnit, targetZone);
    }
  }

  if (defenderDestroyed && defender) {
    const crown = state.zones[targetZone].find(
      (card) =>
        card.card.id === 'IMP155' &&
        !card.faceDown &&
        getCardController(card) === getCardController(defender)
    );
    if (crown) {
      nextState = drawForOwner(nextState, getCardController(defender), 1);
    }
    const katana = defenderAttachments.find((card) => card.card.id === 'IMP153');
    if (katana && !nextState.pendingChoice) {
      const defenderOwner = getCardController(defender);
      if (defenderOwner === 'player') {
        nextState = {
          ...nextState,
          pendingChoice: {
            kind: 'terraTarget',
            owner: 'player',
            sourceInstanceId: katana.instanceId,
            sourceName: katana.card.name,
            prompt: `Return ${defender.card.name} to the top of your deck?`,
            effect: 'katanaReturn',
            availableInstanceIds: [defender.instanceId],
            optional: true,
          },
        };
      } else {
        const graveyard = nextState.opponentZones.graveyard;
        if (graveyard.some((card) => card.instanceId === defender.instanceId)) {
          nextState = {
            ...nextState,
            opponentZones: {
              ...nextState.opponentZones,
              graveyard: graveyard.filter((card) => card.instanceId !== defender.instanceId),
              deck: shouldCardCeaseInZone(defender, 'deck')
                ? nextState.opponentZones.deck
                : [prepareCardForZone(defender, 'deck'), ...nextState.opponentZones.deck],
            },
          };
        }
      }
    }
  }

  if (
    (defenderDestroyed && !attackerDestroyed && attacker.card.id === 'IMP127') ||
    (attackerDestroyed && defender && !defenderDestroyed && defender.card.id === 'IMP127')
  ) {
    const survivorId = defenderDestroyed ? attacker.instanceId : defender!.instanceId;
    const clearDamage = (cards: GameCardInstance[]) =>
      cards.map((card) => card.instanceId === survivorId ? { ...card, damage: 0 } : card);
    nextState = {
      ...nextState,
      zones: {
        ...nextState.zones,
        staging: clearDamage(nextState.zones.staging),
        battlefieldLeft: clearDamage(nextState.zones.battlefieldLeft),
        battlefieldCenter: clearDamage(nextState.zones.battlefieldCenter),
        battlefieldRight: clearDamage(nextState.zones.battlefieldRight),
      },
      opponentZones: {
        ...nextState.opponentZones,
        staging: clearDamage(nextState.opponentZones.staging),
      },
    };
  }

  if (attackerDestroyed) {
    const vengeanceCards = attackerAttachments.filter((card) => card.card.id === 'IMP123');
    if (vengeanceCards.length > 0 && owner === 'player' && !nextState.pendingChoice) {
      nextState = {
        ...nextState,
        pendingChoice: {
          kind: 'solaraTarget',
          owner: 'player',
          sourceInstanceId: vengeanceCards[0]!.instanceId,
          sourceName: 'Vengeance',
          prompt: 'Return any Vengeance cards from your graveyard to your hand?',
          effect: 'vengeanceReturn',
          availableInstanceIds: vengeanceCards.map((card) => card.instanceId),
          optional: true,
          maxSelections: vengeanceCards.length,
        },
      };
    } else if (vengeanceCards.length > 0 && owner === 'opponent') {
      const ids = new Set(vengeanceCards.map((card) => card.instanceId));
      nextState = {
        ...nextState,
        opponentZones: {
          ...nextState.opponentZones,
          graveyard: nextState.opponentZones.graveyard.filter((card) => !ids.has(card.instanceId)),
          hand: [...vengeanceCards.map((card) => prepareCardForZone(card, 'hand')), ...nextState.opponentZones.hand],
        },
      };
    }
  }

  const explosiveAugmentCount = [
    ...(attackerDestroyed ? attackerAttachments : []),
    ...(defenderDestroyed ? defenderAttachments : []),
  ].filter((instance) => instance.card.id === 'IMP029').length;
  if (explosiveAugmentCount > 0) {
    const explosionDamage = explosiveAugmentCount * 3;
    const damageCards = (cards: GameCardInstance[]) =>
      cards.map((instance) =>
        isUnitCard(instance.card)
          ? { ...instance, damage: instance.damage + explosionDamage }
          : instance
      );
    nextState = {
      ...nextState,
      zones: {
        ...nextState.zones,
        [targetZone]: damageCards(nextState.zones[targetZone]),
        ...(owner === 'player' && !attackerDestroyed && !captured
          ? {
              staging: nextState.zones.staging.map((instance) =>
                instance.instanceId === attacker.instanceId
                  ? { ...instance, damage: instance.damage + explosionDamage }
                  : instance
              ),
            }
          : null),
      },
      opponentZones:
        owner === 'opponent' && !attackerDestroyed && !captured
          ? {
              ...nextState.opponentZones,
              staging: nextState.opponentZones.staging.map((instance) =>
                instance.instanceId === attacker.instanceId
                  ? { ...instance, damage: instance.damage + explosionDamage }
                  : instance
              ),
            }
          : nextState.opponentZones,
      log: addLogEntry(nextState, {
        suffix: `Explosive Augment dealt ${explosionDamage} damage to units in ${getZoneLogLabel(targetZone)}.`,
      }),
    };

    const explosionCasualties = getUnitsInPlay(nextState).filter(
      (instance) =>
        instance.damage >= getCurrentUnitHealth(nextState, instance) ||
        instance.destroyOnNextDamageUntilTurn === state.turn
    );
    for (const casualty of explosionCasualties) {
      const removed = removeUnitFromPlay(nextState, casualty.instanceId);
      if (!('error' in removed)) {
        nextState = removed.state;
      }
    }
  }

  if (captured) {
    nextState = {
      ...nextState,
      log: addLogEntry(nextState, {
        prefix: 'Captured ',
        cardName: attacker.card.name,
        suffix: ` took ${getZoneLogLabel(targetZone)}.`,
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

  if (captured && attacker.flankingOriginZone && !nextState.pendingChoice) {
    nextState = applyOvergrownFactoryLeave(nextState, attacker, attacker.flankingOriginZone);
  }

  nextState = clearCombatAttackBonuses(nextState);

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

  if (state.pendingChoice) {
    return {
      ...state,
      log: addLogEntry(state, {
        suffix: 'Resolve the pending ability choice before ending the turn.',
      }),
    };
  }

  const scoringOwner = state.activePlayer;
  const luxEndTurnState = scoringOwner ? applyLuxEndTurnAbilities(state, scoringOwner) : state;
  if (luxEndTurnState.pendingChoice) {
    return luxEndTurnState;
  }
  const solaraEndTurnState = scoringOwner ? applySolaraEndTurnAbilities(luxEndTurnState, scoringOwner) : luxEndTurnState;
  if (solaraEndTurnState.pendingChoice) {
    return solaraEndTurnState;
  }
  const terraEndTurnState = scoringOwner ? applyTerraEndTurnAbilities(solaraEndTurnState, scoringOwner) : solaraEndTurnState;
  if (terraEndTurnState.pendingChoice) {
    return terraEndTurnState;
  }
  const endTurnState = scoringOwner ? applyCaelumEndTurnAbilities(terraEndTurnState, scoringOwner) : terraEndTurnState;
  if (endTurnState.pendingChoice) {
    return endTurnState;
  }
  const scoredState = scoringOwner ? scoreBattlefieldVictoryPoints(endTurnState, scoringOwner) : endTurnState;
  if (scoredState.pendingChoice) {
    return {
      ...scoredState,
      pendingChoice:
        scoredState.pendingChoice.kind === 'lucilleScore'
          ? {
              ...scoredState.pendingChoice,
              resumeTurnAdvance: true,
            }
          : scoredState.pendingChoice.kind === 'luxTarget'
            ? {
                ...scoredState.pendingChoice,
                resumeTurnAdvance: true,
              }
            : scoredState.pendingChoice.kind === 'terraTarget'
              ? {
                  ...scoredState.pendingChoice,
                  resumeTurnAdvance: true,
                }
            : scoredState.pendingChoice,
    };
  }

  const hideout = scoringOwner
    ? BATTLEFIELD_ZONE_IDS.flatMap((zone) => scoredState.zones[zone])
        .find((instance) => instance.card.id === 'IMP032' && getCardController(instance) === scoringOwner && !instance.faceDown)
    : null;
  if (hideout && scoringOwner === 'player') {
    return {
      ...scoredState,
      pendingChoice: {
        kind: 'noxTarget',
        owner: 'player',
        sourceInstanceId: hideout.instanceId,
        sourceName: hideout.card.name,
        effect: 'hideoutSacrifice',
        availableInstanceIds: [
          ...getFriendlyUnitsInPlay(scoredState, 'player').map((instance) => instance.instanceId),
          hideout.instanceId,
        ],
        resumeTurnAdvance: true,
      },
    };
  }
  if (hideout && scoringOwner === 'opponent') {
    const botUnits = getFriendlyUnitsInPlay(scoredState, 'opponent');
    if (botUnits.length > 0) {
      const removed = removeUnitFromPlay(scoredState, botUnits[0]!.instanceId);
      if ('error' in removed) {
        return finishAdvanceToNextTurnAfterScoring(scoredState);
      }
      if (removed.state.pendingChoice) {
        return {
          ...removed.state,
          pendingChoice: {
            ...removed.state.pendingChoice,
            resumeTurnAdvance: true,
          } as PendingChoice,
        };
      }
      return finishAdvanceToNextTurnAfterScoring(removed.state);
    }
    const hideoutZone = BATTLEFIELD_ZONE_IDS.find((zone) =>
      scoredState.zones[zone].some((instance) => instance.instanceId === hideout.instanceId)
    );
    if (hideoutZone) {
      return finishAdvanceToNextTurnAfterScoring({
        ...scoredState,
        zones: {
          ...scoredState.zones,
          [hideoutZone]: scoredState.zones[hideoutZone].filter(
            (instance) => instance.instanceId !== hideout.instanceId
          ),
        },
        opponentZones: {
          ...scoredState.opponentZones,
          graveyard: [prepareCardForZone(hideout, 'graveyard'), ...scoredState.opponentZones.graveyard],
        },
      });
    }
  }

  return finishAdvanceToNextTurnAfterScoring(scoredState);
}

function drawForOwner(state: GameState, owner: Owner, count: number): GameState {
  if (count <= 0) {
    return state;
  }

  if (owner === 'player') {
    const drawn = state.zones.deck.slice(0, count);

    return recordCardsDrawn({
      ...state,
      zones: {
        ...state.zones,
        deck: state.zones.deck.slice(drawn.length),
        hand: [...state.zones.hand, ...drawn],
      },
      log: addLogEntry(state, { suffix: `You drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}.` }),
    }, owner, drawn.length);
  }

  const drawn = state.opponentZones.deck.slice(0, count);

  return recordCardsDrawn({
    ...state,
    opponentZones: {
      ...state.opponentZones,
      deck: state.opponentZones.deck.slice(drawn.length),
      hand: [...state.opponentZones.hand, ...drawn],
    },
    log: addLogEntry(state, { suffix: `Bot drew ${drawn.length} ${drawn.length === 1 ? 'card' : 'cards'}.` }),
  }, owner, drawn.length);
}

export function resolveUnitTakesControlOfZone(state: GameState, zone: ZoneId): GameState {
  if (!BATTLEFIELD_ZONES.has(zone)) {
    return state;
  }

  const controllingUnit = state.zones[zone].find((instance) => isUnitCard(instance.card));
  const controllingOwner = controllingUnit ? getCardController(controllingUnit) : null;
  const revealsTopOnControl = Boolean(controllingUnit && revealsTopWhenTakingControlOfCombatZone(controllingUnit));
  let nextState =
    revealsTopOnControl && controllingUnit && controllingOwner
      ? revealTopCardForSolara(state, controllingOwner, controllingUnit.card.name)
      : state;
  nextState = controllingOwner
    ? applyArchiveRuinsControlTrigger(nextState, controllingOwner, zone)
    : nextState;
  if (nextState.pendingChoice) {
    return nextState;
  }

  const laboratory = state.zones[zone].find(
    (instance) => instance.card.id === 'IMP031' && !instance.faceDown
  );
  if (!laboratory) {
    return nextState;
  }

  if (getCardController(laboratory) === 'player') {
    return {
      ...nextState,
      pendingChoice: {
        kind: 'noxTarget',
        owner: 'player',
        sourceInstanceId: laboratory.instanceId,
        sourceName: laboratory.card.name,
        effect: 'laboratoryUse',
        availableInstanceIds: [laboratory.instanceId],
        optional: true,
      },
    };
  }

  const drawnState = drawForOwner(nextState, 'opponent', 1);
  const discarded = drawnState.opponentZones.hand[0];
  if (!discarded) {
    return drawnState;
  }
  return {
    ...drawnState,
    opponentZones: {
      ...drawnState.opponentZones,
      hand: drawnState.opponentZones.hand.slice(1),
      graveyard: [prepareCardForZone(discarded, 'graveyard'), ...drawnState.opponentZones.graveyard],
    },
  };
}

export function runTurnStart(state: GameState): GameState {
  const activePlayer = state.activePlayer;

  if (!activePlayer) {
    return state;
  }

  if (state.pendingChoice) {
    return {
      ...state,
      pendingChoice: {
        ...state.pendingChoice,
        resumeTurnStart: true,
      },
    };
  }

  let turnStartState: GameState = {
    ...state,
    scoreLocks: (state.scoreLocks ?? []).filter((lock) => lock.expiresAtStartOfOwner !== activePlayer),
  };
  turnStartState = returnAbandonLabUnits(turnStartState, activePlayer);
  turnStartState = applyCaelumTurnStartAbilities(turnStartState, activePlayer);
  if (turnStartState.pendingChoice) {
    return turnStartState;
  }
  for (const zone of BATTLEFIELD_ZONE_IDS) {
    const quarantine = turnStartState.zones[zone].find(
      (card) =>
        card.card.id === 'IMP063' &&
        !card.faceDown &&
        getCardController(card) === activePlayer
    );
    if (!quarantine) continue;
    const progressCounters = (quarantine.progressCounters ?? 0) + 1;
    if (progressCounters >= 2) {
      turnStartState = {
        ...turnStartState,
        zones: {
          ...turnStartState.zones,
          [zone]: turnStartState.zones[zone].filter((card) => card.instanceId !== quarantine.instanceId),
        },
      };
      turnStartState = moveCardsToOwnerGraveyards(turnStartState, [quarantine]);
    } else {
      turnStartState = {
        ...turnStartState,
        zones: {
          ...turnStartState.zones,
          [zone]: turnStartState.zones[zone].map((card) =>
            card.instanceId === quarantine.instanceId ? { ...card, progressCounters } : card
          ),
        },
      };
    }
  }

  if (activePlayer === turnStartState.firstPlayer && !turnStartState.hasFirstPlayerSkippedDraw) {
    return {
      ...turnStartState,
      hasFirstPlayerSkippedDraw: true,
      log: addLogEntry(turnStartState, {
        suffix: `${activePlayer === 'player' ? 'You skip' : 'Bot skips'} the first draw.`,
      }),
    };
  }

  const extraDrawCount = getUnitsInPlay(turnStartState).some(
    (unit) =>
      unit.card.id === 'IMP080' &&
      !isUnitInQuarantineZone(turnStartState, unit.instanceId) &&
      !(unit.abilitiesSuppressedUntilTurn && turnStartState.turn <= unit.abilitiesSuppressedUntilTurn)
  ) ? 1 : 0;
  return drawForOwner(turnStartState, activePlayer, 1 + extraDrawCount);
}

function readyCards(cards: GameCardInstance[]): GameCardInstance[] {
  return cards.map((instance) => ({
    ...instance,
    ready: instance.skipNextReady ? false : true,
    skipNextReady: false,
    retreatLockedUntilNextTurn: false,
  }));
}

export function readyCardsForOwner(state: GameState, owner: Owner): GameState {
  const clearLastStand = (cards: GameCardInstance[]) =>
    cards.map((card) =>
      card.terraLastStandExpiresAtStartOfOwner === owner
        ? {
            ...card,
            terraLastStandAttackBonus: undefined,
            terraLastStandHealthBonus: undefined,
            terraLastStandExpiresAtStartOfOwner: undefined,
          }
        : card
    );
  state = {
    ...state,
    zones: {
      ...state.zones,
      staging: clearLastStand(state.zones.staging),
      battlefieldLeft: clearLastStand(state.zones.battlefieldLeft),
      battlefieldCenter: clearLastStand(state.zones.battlefieldCenter),
      battlefieldRight: clearLastStand(state.zones.battlefieldRight),
    },
    opponentZones: {
      ...state.opponentZones,
      staging: clearLastStand(state.opponentZones.staging),
    },
  };
  const readyTriggerSources = getFriendlyUnitsInPlay(state, owner).filter(
    (unit) => !unit.ready && !unit.skipNextReady
  );
  const readyBattlefields = Object.fromEntries(
    BATTLEFIELD_ZONE_IDS.map((zone) => [
      zone,
      state.zones[zone].map((instance) => (
        getCardController(instance) === owner
          ? { ...instance, ready: instance.skipNextReady ? false : true, skipNextReady: false, retreatLockedUntilNextTurn: false }
          : instance
      )),
    ])
  ) as Pick<Record<ZoneId, GameCardInstance[]>, (typeof BATTLEFIELD_ZONE_IDS)[number]>;

  let nextState: GameState;
  if (owner === 'player') {
    nextState = {
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
  } else {
    nextState = {
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

  for (const source of readyTriggerSources) {
    const readiedSource = getCardInstanceById(nextState, source.instanceId);
    if (!readiedSource?.ready) continue;
    nextState = triggerCardAbilities(nextState, 'onReady', {
      source: readiedSource,
      controller: owner,
      zone: getUnitZone(nextState, readiedSource.instanceId),
    });
    if (nextState.pendingChoice) break;
  }
  return nextState;
}
