import {
  BATTLEFIELD_ZONE_IDS,
  BATTLEFIELD_ZONES,
  canManuallySupplyFromHand,
  getBattlefieldAttackError,
  getBattlefieldPlacementError,
  getCardController,
  getCounterPlayError,
  getEquipmentAttachmentError,
  getFriendlyUnitsInPlay,
  getModifiedManualPlayCost,
  getPlayCostError,
  getReadySupplyCount,
  isCounterCard,
  isItemCard,
  isTacticCard,
  isTerritoryCard,
  isUnitCard,
  type GameCardInstance,
  type GameState,
  type ZoneId,
} from './game-rules';
import type { CardAction } from './game-actions';
import { hasCardKeyword } from './card-definitions';

export type BotTurnStep = 'supply' | 'stageUnit' | 'attackBattlefield';

export type BotBattlefieldAttackChoice = {
  attackerInstanceId: string;
  targetZone: ZoneId;
};

export type BotCommand =
  | {
      type: 'card';
      action: CardAction;
    }
  | {
      type: 'attack';
      attackerInstanceId: string;
      targetZone: ZoneId;
    };

const HIGH_IMPACT_TACTIC_IDS = new Set(['IMP021', 'IMP022', 'IMP026', 'IMP027']);

function getCardPlayValue(instance: GameCardInstance): number {
  const influence = instance.card.influence ?? 0;
  const combatStats = Math.max(0, instance.card.attack) + Math.max(0, instance.card.health);
  const typeBonus = isUnitCard(instance.card) ? 8 : isItemCard(instance.card) ? 4 : isTacticCard(instance.card) ? 3 : 2;

  return instance.card.cost * 2 + influence * 3 + combatStats + typeBonus;
}

function sortByHighestPlayValue(cards: GameCardInstance[]): GameCardInstance[] {
  return [...cards].sort((left, right) => getCardPlayValue(right) - getCardPlayValue(left));
}

function getPlayableCost(state: GameState, instance: GameCardInstance, toZone: ZoneId, faceDown = false): number {
  return getModifiedManualPlayCost(state, 'opponent', instance.card, toZone, { faceDown });
}

function hasReadySupplyFor(state: GameState, instance: GameCardInstance, toZone: ZoneId, faceDown = false): boolean {
  const readySupply = getReadySupplyCount(state, 'opponent');

  return readySupply >= getPlayableCost(state, instance, toZone, faceDown);
}

function getBotSacrificeTarget(state: GameState, excludeInstanceId?: string): GameCardInstance | null {
  const candidates = getFriendlyUnitsInPlay(state, 'opponent').filter(
    (instance) => instance.instanceId !== excludeInstanceId
  );

  return [...candidates].sort((left, right) => getCardPlayValue(left) - getCardPlayValue(right))[0] ?? null;
}

function getBotDiscardTarget(state: GameState, excludeInstanceId: string): GameCardInstance | null {
  const candidates = state.opponentZones.hand.filter((instance) => instance.instanceId !== excludeInstanceId);

  return [...candidates].sort((left, right) => getCardPlayValue(left) - getCardPlayValue(right))[0] ?? null;
}

function getBotReanimateTarget(state: GameState): GameCardInstance | null {
  const candidates = state.opponentZones.graveyard.filter(
    (instance) => isUnitCard(instance.card) && !instance.card.type.toLowerCase().includes('renowned')
  );

  return sortByHighestPlayValue(candidates)[0] ?? null;
}

function getCardActionOptions(state: GameState, instance: GameCardInstance): CardAction['options'] | null {
  if (instance.card.id === 'IMP004') {
    const sacrificeTarget = getBotSacrificeTarget(state, instance.instanceId);

    return sacrificeTarget ? { sacrificeUnitInstanceId: sacrificeTarget.instanceId } : null;
  }

  if (instance.card.id === 'IMP005') {
    const discardTarget = getBotDiscardTarget(state, instance.instanceId);

    return discardTarget ? { discardCardInstanceId: discardTarget.instanceId } : null;
  }

  if (instance.card.id === 'IMP006') {
    const reanimateTarget = getBotReanimateTarget(state);

    return reanimateTarget ? { reanimateTargetInstanceId: reanimateTarget.instanceId } : null;
  }

  return {};
}

function canBotPlayCardToZone(state: GameState, instance: GameCardInstance, toZone: ZoneId, faceDown = false): boolean {
  if (!hasReadySupplyFor(state, instance, toZone, faceDown)) {
    return false;
  }

  if (isUnitCard(instance.card) && toZone === 'staging') {
    if (instance.card.id === 'IMP004' || instance.card.id === 'IMP005' || instance.card.id === 'IMP006') {
      return getCardActionOptions(state, instance) !== null;
    }

    return !getPlayCostError(state, 'opponent', instance.card);
  }

  if (isUnitCard(instance.card) && BATTLEFIELD_ZONES.has(toZone)) {
    return state.opponentDemonicAdvanceActive && !getBattlefieldPlacementError({ ...instance, ready: true }, state.zones[toZone]);
  }

  if (isTerritoryCard(instance.card) && BATTLEFIELD_ZONES.has(toZone)) {
    return !getBattlefieldPlacementError(instance, state.zones[toZone]);
  }

  if (isTacticCard(instance.card) && toZone === 'graveyard') {
    return !getPlayCostError(state, 'opponent', instance.card);
  }

  return false;
}

function chooseBotSupplyCard(state: GameState): GameCardInstance | null {
  if (!canManuallySupplyFromHand(state, 'opponent')) {
    return null;
  }

  const immediatelyPlayable = new Set(
    state.opponentZones.hand
      .filter((instance) => {
        if (isUnitCard(instance.card)) {
          return canBotPlayCardToZone(state, instance, 'staging');
        }

        if (isTacticCard(instance.card)) {
          return HIGH_IMPACT_TACTIC_IDS.has(instance.card.id) && canBotPlayCardToZone(state, instance, 'graveyard');
        }

        return false;
      })
      .map((instance) => instance.instanceId)
  );
  const candidates = state.opponentZones.hand.filter((instance) => !immediatelyPlayable.has(instance.instanceId));
  const supplyCandidates = candidates.length > 0 ? candidates : state.opponentZones.hand;

  return [...supplyCandidates].sort((left, right) => getCardPlayValue(left) - getCardPlayValue(right))[0] ?? null;
}

function chooseBotTacticPlay(state: GameState): BotCommand | null {
  const ownUnits = getFriendlyUnitsInPlay(state, 'opponent').length;
  const playerUnits = getFriendlyUnitsInPlay(state, 'player').length;
  const selectedTactic = sortByHighestPlayValue(
    state.opponentZones.hand.filter(
      (instance) =>
        isTacticCard(instance.card) &&
        HIGH_IMPACT_TACTIC_IDS.has(instance.card.id) &&
        canBotPlayCardToZone(state, instance, 'graveyard') &&
        (instance.card.id !== 'IMP022' || playerUnits > ownUnits)
    )
  )[0] ?? null;

  return selectedTactic
    ? {
        type: 'card',
        action: {
          owner: 'opponent',
          instanceId: selectedTactic.instanceId,
          fromZone: 'hand',
          toZone: 'graveyard',
        },
      }
    : null;
}

function chooseBotDemonicAdvanceUnitPlay(state: GameState): BotCommand | null {
  if (!state.opponentDemonicAdvanceActive) {
    return null;
  }

  const selectedUnit = sortByHighestPlayValue(
    state.opponentZones.hand.filter((instance) => isUnitCard(instance.card))
  )[0] ?? null;
  const targetZone = selectedUnit
    ? BATTLEFIELD_ZONE_IDS.find(
        (zone) =>
          !state.zones[zone].some((instance) => isUnitCard(instance.card)) &&
          canBotPlayCardToZone(state, selectedUnit, zone)
      )
    : null;

  return selectedUnit && targetZone
    ? {
        type: 'card',
        action: {
          owner: 'opponent',
          instanceId: selectedUnit.instanceId,
          fromZone: 'hand',
          toZone: targetZone,
        },
      }
    : null;
}

function chooseBotUnitPlay(state: GameState): BotCommand | null {
  const selectedUnit = sortByHighestPlayValue(
    [
      ...state.opponentZones.hand,
      ...state.opponentZones.banish.filter((instance) => instance.lingyiPlayableFromBanishOnce),
    ].filter((instance) => isUnitCard(instance.card) && canBotPlayCardToZone(state, instance, 'staging'))
  )[0] ?? null;

  return selectedUnit
    ? {
        type: 'card',
        action: {
          owner: 'opponent',
          instanceId: selectedUnit.instanceId,
          fromZone: state.opponentZones.banish.some((card) => card.instanceId === selectedUnit.instanceId)
            ? 'banish'
            : 'hand',
          toZone: 'staging',
          options: getCardActionOptions(state, selectedUnit) ?? {},
        },
      }
    : null;
}

function chooseBotEquipmentPlay(state: GameState): BotCommand | null {
  const hosts = sortByHighestPlayValue(state.opponentZones.staging.filter((instance) => isUnitCard(instance.card)));
  const selectedEquipment = sortByHighestPlayValue(
    state.opponentZones.hand.filter((instance) => isItemCard(instance.card) && !getPlayCostError(state, 'opponent', instance.card))
  )[0] ?? null;
  const hostUnit = selectedEquipment
    ? hosts.find((host) => !getEquipmentAttachmentError(state.opponentZones.staging, 'opponent', host.instanceId))
    : null;

  return selectedEquipment && hostUnit
    ? {
        type: 'card',
        action: {
          owner: 'opponent',
          instanceId: selectedEquipment.instanceId,
          fromZone: 'hand',
          toZone: 'staging',
          options: {
            attachToInstanceId: hostUnit.instanceId,
          },
        },
      }
    : null;
}

function chooseBotTerritoryPlay(state: GameState): BotCommand | null {
  const selectedTerritory = sortByHighestPlayValue(
    state.opponentZones.hand.filter((instance) => isTerritoryCard(instance.card))
  ).find((instance) =>
    BATTLEFIELD_ZONE_IDS.some((zone) => canBotPlayCardToZone(state, instance, zone, true))
  );
  const targetZone = selectedTerritory
    ? BATTLEFIELD_ZONE_IDS.find((zone) => canBotPlayCardToZone(state, selectedTerritory, zone, true))
    : null;

  return selectedTerritory && targetZone
    ? {
        type: 'card',
        action: {
          owner: 'opponent',
          instanceId: selectedTerritory.instanceId,
          fromZone: 'hand',
          toZone: targetZone,
          options: { faceDown: true },
        },
      }
    : null;
}

function getAttackChoiceScore(state: GameState, attacker: GameCardInstance, targetZone: ZoneId): number {
  const defender = state.zones[targetZone].find((instance) => getCardController(instance) === 'player' && isUnitCard(instance.card)) ?? null;

  if (!defender) {
    const territoryValue = state.zones[targetZone].some((instance) => isTerritoryCard(instance.card)) ? 3 : 0;

    return 20 + territoryValue + (attacker.card.influence ?? 0);
  }

  const attackerRemainingHealth = attacker.card.health - attacker.damage - Math.max(0, defender.card.attack);
  const defenderRemainingHealth = defender.card.health - defender.damage - Math.max(0, attacker.card.attack);
  const killsDefender = defenderRemainingHealth <= 0;
  const attackerSurvives = attackerRemainingHealth > 0;

  return (
    (killsDefender ? 40 : 0) +
    (attackerSurvives ? 15 : -15) +
    getCardPlayValue(defender) -
    (attackerSurvives ? 0 : Math.floor(getCardPlayValue(attacker) / 2))
  );
}

export function getBotBattlefieldAttackChoice(state: GameState): BotBattlefieldAttackChoice | null {
  if (state.winner || state.pendingCombat || state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return null;
  }

  const readyAttackers = [
    ...state.opponentZones.staging,
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter(
      (instance) =>
        getCardController(instance) === 'opponent' &&
        isUnitCard(instance.card) &&
        hasCardKeyword(instance.card, 'flanking') &&
        instance.flankingAttackUsedTurn !== state.turn
    ),
  ].filter((instance) => instance.ready && isUnitCard(instance.card));
  const targetZones = [
    ...BATTLEFIELD_ZONE_IDS.filter((zone) =>
      state.zones[zone].some((instance) => getCardController(instance) === 'player' && isUnitCard(instance.card))
    ),
    ...BATTLEFIELD_ZONE_IDS.filter((zone) =>
      !state.zones[zone].some((instance) => isUnitCard(instance.card))
    ),
  ];
  const choices = readyAttackers.flatMap((attacker) =>
    targetZones
      .filter((targetZone) => !getBattlefieldAttackError(state, 'opponent', attacker.instanceId, targetZone))
      .map((targetZone) => ({
        attackerInstanceId: attacker.instanceId,
        targetZone,
        score: getAttackChoiceScore(state, attacker, targetZone),
      }))
  );
  const choice = choices.sort((left, right) => right.score - left.score)[0] ?? null;

  return choice ? { attackerInstanceId: choice.attackerInstanceId, targetZone: choice.targetZone } : null;
}

export function chooseBotCounter(state: GameState): string | null {
  if (state.pendingCombat?.priorityOwner !== 'opponent') {
    return null;
  }

  return state.opponentZones.hand.find(
    (instance) => isCounterCard(instance.card) && !getCounterPlayError(state, 'opponent', instance.instanceId)
  )?.instanceId ?? null;
}

export function chooseBotTurnCommand(state: GameState, step: BotTurnStep): BotCommand | null {
  if (state.winner || state.pendingCombat || state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return null;
  }

  if (step === 'supply') {
    const selectedCard = chooseBotSupplyCard(state);

    return selectedCard
      ? {
          type: 'card',
          action: {
            owner: 'opponent',
            instanceId: selectedCard.instanceId,
            fromZone: 'hand',
            toZone: 'supply',
          },
        }
      : null;
  }

  if (step === 'stageUnit') {
    return (
      chooseBotTacticPlay(state) ??
      chooseBotDemonicAdvanceUnitPlay(state) ??
      chooseBotUnitPlay(state) ??
      chooseBotEquipmentPlay(state) ??
      chooseBotTerritoryPlay(state)
    );
  }

  const attack = getBotBattlefieldAttackChoice(state);

  return attack
    ? {
        type: 'attack',
        ...attack,
      }
    : null;
}
