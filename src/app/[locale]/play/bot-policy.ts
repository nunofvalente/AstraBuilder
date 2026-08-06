import {
  BATTLEFIELD_ZONE_IDS,
  BATTLEFIELD_ZONES,
  VICTORY_POINT_TARGET,
  canManuallySupplyFromHand,
  getBattlefieldAttackError,
  getBattlefieldPlacementError,
  getCardInstanceById,
  getCardController,
  getCounterPlayError,
  getCounterTargetOptions,
  getCurrentUnitAttack,
  getCurrentUnitHealth,
  getCurrentUnitInfluence,
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

export type BotCounterChoice = {
  counterInstanceId: string;
  targetInstanceId?: string;
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

const HIGH_IMPACT_TACTIC_IDS = new Set(['IMP021', 'IMP022', 'IMP026', 'IMP027', 'IMP085', 'IMP086', 'IMP088', 'IMP148']);
const TARGETED_TACTIC_IDS = new Set(['IMP026', 'IMP027', 'IMP085', 'IMP086', 'IMP088', 'IMP148']);
const ATTACK_SCORE_THRESHOLD = 10;
const COUNTER_SCORE_THRESHOLD = 12;
const WINNING_ATTACK_BONUS = 500;
const PREVENT_WIN_BONUS = 180;

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

function getUnitBattlefieldZone(state: GameState, instanceId: string): ZoneId | null {
  return BATTLEFIELD_ZONE_IDS.find((zone) =>
    state.zones[zone].some((instance) => instance.instanceId === instanceId)
  ) ?? null;
}

function isProtectedFromBotTactic(state: GameState, unit: GameCardInstance): boolean {
  if (getCardController(unit) === 'opponent') {
    return false;
  }

  const zone = getUnitBattlefieldZone(state, unit.instanceId);

  return Boolean(
    zone &&
    state.zones[zone].some(
      (instance) => instance.card.id === 'IMP032' && getCardController(instance) === getCardController(unit)
    )
  );
}

function getBotCombatRemovalAttacker(state: GameState, target: GameCardInstance): GameCardInstance | null {
  const targetZone = getUnitBattlefieldZone(state, target.instanceId);
  if (!targetZone) {
    return null;
  }

  const remainingTargetHealth = getCurrentUnitHealth(state, target) - target.damage;

  return getReadyBotAttackers(state).find((attacker) => {
    if (getBattlefieldAttackError(state, 'opponent', attacker.instanceId, targetZone)) {
      return false;
    }

    const attackerAttack = getCurrentUnitAttack(state, attacker, targetZone);
    const defenderAttack = target.ready ? getCurrentUnitAttack(state, target) : 0;
    const attackerSurvives = getCurrentUnitHealth(state, attacker) - attacker.damage - defenderAttack > 0;

    return attackerAttack >= remainingTargetHealth && attackerSurvives;
  }) ?? null;
}

function getTacticTargetBaseScore(state: GameState, target: GameCardInstance): number {
  const influence = Math.max(1, getUnitScoreValue(state, target));
  const playerScoreBefore = estimateOwnerBattlefieldScore(state, 'player');
  const targetZone = getUnitBattlefieldZone(state, target.instanceId);
  const playerScoreAfter = targetZone
    ? estimateOwnerBattlefieldScore(state, 'player', { zone: targetZone, unit: null })
    : playerScoreBefore;
  const preventsPlayerWin = state.playerVictoryPoints + playerScoreBefore >= VICTORY_POINT_TARGET &&
    state.playerVictoryPoints + playerScoreAfter < VICTORY_POINT_TARGET;

  return (
    getCardPlayValue(target) +
    influence * 9 +
    (target.ready ? 8 : 0) +
    (preventsPlayerWin ? PREVENT_WIN_BONUS : 0)
  );
}

function getTacticTargetScore(state: GameState, tactic: GameCardInstance, target: GameCardInstance): number {
  const combatRemovalPenalty = getBotCombatRemovalAttacker(state, target) ? 32 : 0;
  const remainingHealth = getCurrentUnitHealth(state, target) - target.damage;
  const baseScore = getTacticTargetBaseScore(state, target);

  if (tactic.card.id === 'IMP085') {
    const killsTarget = remainingHealth <= 1;
    return baseScore + (killsTarget ? 28 : 6) - (killsTarget ? combatRemovalPenalty : 0) - tactic.card.cost;
  }

  if (tactic.card.id === 'IMP148') {
    return baseScore + (target.ready ? 22 : -8) - tactic.card.cost;
  }

  return baseScore - combatRemovalPenalty - tactic.card.cost;
}

function getBotTargetedTacticCandidates(state: GameState, tactic: GameCardInstance): GameCardInstance[] {
  const candidates = BATTLEFIELD_ZONE_IDS
    .flatMap((zone) => state.zones[zone])
    .filter((unit) => isUnitCard(unit.card) && getCardController(unit) === 'player')
    .filter((unit) => !isProtectedFromBotTactic(state, unit));

  if (tactic.card.id === 'IMP027') {
    return candidates.filter((unit) => unit.card.cost <= 2);
  }

  if (tactic.card.id === 'IMP088') {
    return candidates.filter((unit) => Boolean(getUnitBattlefieldZone(state, unit.instanceId)));
  }

  if (['IMP026', 'IMP085', 'IMP086', 'IMP148'].includes(tactic.card.id)) {
    return candidates;
  }

  return [];
}

function chooseBotTargetedTacticTarget(state: GameState, tactic: GameCardInstance): GameCardInstance | null {
  const candidates = getBotTargetedTacticCandidates(state, tactic);
  const scored = candidates
    .map((target) => ({ target, score: getTacticTargetScore(state, tactic, target) }))
    .sort((left, right) => right.score - left.score)[0] ?? null;

  return scored && scored.score >= 18 ? scored.target : null;
}

function chooseBotTacticPlay(state: GameState): BotCommand | null {
  const ownUnits = getFriendlyUnitsInPlay(state, 'opponent').length;
  const playerUnits = getFriendlyUnitsInPlay(state, 'player').length;
  const playableTactics = state.opponentZones.hand.filter(
    (instance) =>
      isTacticCard(instance.card) &&
      HIGH_IMPACT_TACTIC_IDS.has(instance.card.id) &&
      canBotPlayCardToZone(state, instance, 'graveyard') &&
      (instance.card.id !== 'IMP022' || playerUnits > ownUnits)
  );
  const removalTactic = playableTactics
    .map((instance) => ({ instance, target: chooseBotTargetedTacticTarget(state, instance) }))
    .filter((entry): entry is { instance: GameCardInstance; target: GameCardInstance } => Boolean(entry.target))
    .sort((left, right) => getTacticTargetScore(state, right.instance, right.target) - getTacticTargetScore(state, left.instance, left.target))[0] ?? null;
  const selectedTactic = removalTactic?.instance ?? sortByHighestPlayValue(
    playableTactics.filter((instance) => !TARGETED_TACTIC_IDS.has(instance.card.id))
  )[0] ?? null;

  return selectedTactic
    ? {
        type: 'card',
        action: {
          owner: 'opponent',
          instanceId: selectedTactic.instanceId,
          fromZone: 'hand',
          toZone: 'graveyard',
          options: removalTactic?.instance.instanceId === selectedTactic.instanceId
            ? { abilityTargetInstanceId: removalTactic.target.instanceId }
            : {},
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
    ? getBestEmptyBattlefieldZoneForUnit(state, selectedUnit)
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

function getUnitScoreValue(state: GameState, instance: GameCardInstance): number {
  const attachedCards = [
    ...state.zones.staging,
    ...state.opponentZones.staging,
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]),
  ]
    .filter((equipment) => equipment.attachedToInstanceId === instance.instanceId);
  const cardsDrawnThisTurn = getCardController(instance) === 'player'
    ? state.playerCardsDrawnThisTurn
    : state.opponentCardsDrawnThisTurn;

  return getCurrentUnitInfluence(instance, attachedCards, cardsDrawnThisTurn);
}

function getZoneControlScore(state: GameState, zone: ZoneId, attacker: GameCardInstance): number {
  const influence = Math.max(1, getUnitScoreValue(state, attacker));
  const unblockedTerritoryCount = state.zones[zone].filter((instance) => isTerritoryCard(instance.card) && !instance.faceDown).length;
  const centerBonus = zone === 'battlefieldCenter' ? 2 : 0;

  return 18 + influence * 8 + unblockedTerritoryCount * 2 + centerBonus;
}

function getBestEmptyBattlefieldZoneForUnit(state: GameState, unit: GameCardInstance): ZoneId | null {
  return BATTLEFIELD_ZONE_IDS
    .filter((zone) => !state.zones[zone].some((instance) => isUnitCard(instance.card)))
    .filter((zone) => canBotPlayCardToZone(state, unit, zone))
    .map((zone) => ({ zone, score: getZoneControlScore(state, zone, unit) }))
    .sort((left, right) => right.score - left.score)[0]?.zone ?? null;
}

function getZoneUnitControlledBy(state: GameState, zone: ZoneId, owner: 'player' | 'opponent'): GameCardInstance | null {
  return state.zones[zone].find((instance) => getCardController(instance) === owner && isUnitCard(instance.card)) ?? null;
}

function estimateOwnerBattlefieldScore(
  state: GameState,
  owner: 'player' | 'opponent',
  override?: { zone: ZoneId; unit: GameCardInstance | null }
): number {
  return BATTLEFIELD_ZONE_IDS.reduce((total, zone) => {
    const scoringUnit = override?.zone === zone
      ? override.unit
      : getZoneUnitControlledBy(state, zone, owner);

    return total + (scoringUnit ? getUnitScoreValue(state, scoringUnit) : 0);
  }, 0);
}

function getVictoryPressureBonus(
  state: GameState,
  targetZone: ZoneId,
  botScoringUnitAfterAttack: GameCardInstance | null,
  playerScoringUnitAfterAttack: GameCardInstance | null
): number {
  const botScoreAfterAttack = estimateOwnerBattlefieldScore(state, 'opponent', {
    zone: targetZone,
    unit: botScoringUnitAfterAttack,
  });
  const playerScoreBeforeAttack = estimateOwnerBattlefieldScore(state, 'player');
  const playerScoreAfterAttack = estimateOwnerBattlefieldScore(state, 'player', {
    zone: targetZone,
    unit: playerScoringUnitAfterAttack,
  });
  const winsThisTurn = state.opponentVictoryPoints + botScoreAfterAttack >= VICTORY_POINT_TARGET;
  const preventsPlayerWin = state.playerVictoryPoints + playerScoreBeforeAttack >= VICTORY_POINT_TARGET &&
    state.playerVictoryPoints + playerScoreAfterAttack < VICTORY_POINT_TARGET;

  return (winsThisTurn ? WINNING_ATTACK_BONUS : 0) + (preventsPlayerWin ? PREVENT_WIN_BONUS : 0);
}

function getReadyBotAttackers(state: GameState): GameCardInstance[] {
  return [
    ...state.opponentZones.staging,
    ...BATTLEFIELD_ZONE_IDS.flatMap((zone) => state.zones[zone]).filter(
      (instance) =>
        getCardController(instance) === 'opponent' &&
        isUnitCard(instance.card) &&
        hasCardKeyword(instance.card, 'flanking') &&
        instance.flankingAttackUsedTurn !== state.turn
    ),
  ].filter((instance) => instance.ready && isUnitCard(instance.card));
}

function getCoordinatedAttackSetupBonus(
  state: GameState,
  setupAttacker: GameCardInstance,
  defender: GameCardInstance,
  targetZone: ZoneId,
  defenderDamageTaken: number
): number {
  if (defenderDamageTaken <= 0) {
    return 0;
  }

  const damagedDefender = {
    ...defender,
    ready: false,
    damage: defender.damage + defenderDamageTaken,
  };
  const defenderHealth = getCurrentUnitHealth(state, defender);
  if (damagedDefender.damage >= defenderHealth) {
    return 0;
  }

  const followUpAttackers = getReadyBotAttackers(state)
    .filter((instance) => instance.instanceId !== setupAttacker.instanceId)
    .filter((instance) => !getBattlefieldAttackError(state, 'opponent', instance.instanceId, targetZone))
    .map((instance) => getCurrentUnitAttack(state, instance, targetZone))
    .filter((attack) => attack > 0)
    .sort((left, right) => right - left);
  const remainingDamage = defenderHealth - damagedDefender.damage;
  let combinedDamage = 0;
  let requiredFollowUps = 0;

  for (const attack of followUpAttackers) {
    combinedDamage += attack;
    requiredFollowUps += 1;
    if (combinedDamage >= remainingDamage) break;
  }

  if (combinedDamage < remainingDamage) {
    return 0;
  }

  const defenderScoreValue = Math.max(1, getUnitScoreValue(state, defender));

  return 42 + defenderScoreValue * 5 + Math.floor(getCardPlayValue(defender) / 3) - (requiredFollowUps - 1) * 6;
}

function willReadyOnDefend(state: GameState, defender: GameCardInstance, targetZone: ZoneId): boolean {
  if (defender.card.id === 'IMP039' || defender.card.id === 'IMP015' || defender.card.id === 'IMP114') {
    return true;
  }

  if (
    state.zones[targetZone].some(
      (instance) =>
        instance.card.id === 'IMP094' &&
        !instance.faceDown &&
        getCardController(instance) === getCardController(defender)
    )
  ) {
    return true;
  }

  const hasAncestralCrown = state.zones[targetZone].some(
    (instance) =>
      instance.card.id === 'IMP155' &&
      !instance.faceDown &&
      getCardController(instance) === getCardController(defender)
  );
  const defenderSubtype = defender.card.subtype.toLowerCase();

  return hasAncestralCrown && ['sylvan', 'kitsune', 'beast'].some((subtype) => defenderSubtype.includes(subtype));
}

function getDefenderAttackAfterDefendTriggers(state: GameState, defender: GameCardInstance, targetZone: ZoneId): number {
  const readied = willReadyOnDefend(state, defender, targetZone) ? { ...defender, ready: true } : defender;
  const bladewolfBonus = defender.card.id === 'IMP039' ? 2 : 0;
  const hasAncestralCrown = state.zones[targetZone].some(
    (instance) =>
      instance.card.id === 'IMP155' &&
      !instance.faceDown &&
      getCardController(instance) === getCardController(defender)
  );
  const defenderSubtype = defender.card.subtype.toLowerCase();
  const crownBonus = hasAncestralCrown && ['sylvan', 'kitsune', 'beast'].some((subtype) => defenderSubtype.includes(subtype)) ? 2 : 0;

  return readied.ready ? getCurrentUnitAttack(state, readied) + bladewolfBonus + crownBonus : 0;
}

function getAttackChoiceScore(state: GameState, attacker: GameCardInstance, targetZone: ZoneId): number {
  const defender = state.zones[targetZone].find((instance) => getCardController(instance) === 'player' && isUnitCard(instance.card)) ?? null;

  if (!defender) {
    return getZoneControlScore(state, targetZone, attacker) + getVictoryPressureBonus(state, targetZone, attacker, null);
  }

  const attackerAttack = getCurrentUnitAttack(state, attacker, targetZone);
  const defenderAttack = getDefenderAttackAfterDefendTriggers(state, defender, targetZone);
  const attackerRemainingHealth = getCurrentUnitHealth(state, attacker) - attacker.damage - defenderAttack;
  const defenderRemainingHealth = getCurrentUnitHealth(state, defender) - defender.damage - attackerAttack;
  const killsDefender = defenderRemainingHealth <= 0;
  const attackerSurvives = attackerRemainingHealth > 0;
  const tradesUp = getCardPlayValue(defender) >= getCardPlayValue(attacker);
  const defenderScoreValue = Math.max(1, getUnitScoreValue(state, defender));
  const attackerScoreValue = Math.max(1, getUnitScoreValue(state, attacker));
  const botScoringUnitAfterAttack = killsDefender && attackerSurvives ? attacker : null;
  const playerScoringUnitAfterAttack = killsDefender ? null : defender;

  return (
    (killsDefender ? 34 + defenderScoreValue * 5 : -10) +
    (attackerSurvives ? 22 + attackerScoreValue * 4 : tradesUp ? -4 : -28) +
    Math.floor(getCardPlayValue(defender) / 2) -
    (attackerSurvives ? 0 : Math.floor(getCardPlayValue(attacker) / 2)) +
    getCoordinatedAttackSetupBonus(state, attacker, defender, targetZone, attackerAttack) +
    getVictoryPressureBonus(state, targetZone, botScoringUnitAfterAttack, playerScoringUnitAfterAttack)
  );
}

type CombatProjection = {
  attacker: GameCardInstance | null;
  defender: GameCardInstance | null;
  preventDefenderDamage?: boolean;
};

function getCombatProjectionScore(state: GameState, projection: CombatProjection): number {
  const pendingCombat = state.pendingCombat;
  if (!pendingCombat) {
    return 0;
  }

  const { attacker, defender } = projection;
  const attackerController = attacker ? getCardController(attacker) : pendingCombat.attackerOwner;

  if (!attacker) {
    return pendingCombat.attackerOwner === 'player' ? 70 : -70;
  }

  if (!defender) {
    const zoneScore = getZoneControlScore(state, pendingCombat.targetZone, attacker);
    return attackerController === 'opponent' ? zoneScore : -zoneScore;
  }

  const attackerAttack = attacker.ready ? getCurrentUnitAttack(state, attacker, pendingCombat.targetZone) : 0;
  const defenderAttack = defender.ready ? getCurrentUnitAttack(state, defender) : 0;
  const attackerHealth = getCurrentUnitHealth(state, attacker);
  const defenderHealth = getCurrentUnitHealth(state, defender);
  const defenderDamageTaken = projection.preventDefenderDamage ? 0 : attackerAttack;
  const attackerDamageTaken = defenderAttack;
  const attackerDestroyed = attacker.damage + attackerDamageTaken >= attackerHealth;
  const defenderDestroyed = defender.damage + defenderDamageTaken >= defenderHealth;
  let score = 0;

  if (attackerController === 'opponent') {
    score += attackerDestroyed ? -getCardPlayValue(attacker) : 12 + Math.max(1, getUnitScoreValue(state, attacker)) * 5;
  } else {
    score += attackerDestroyed ? getCardPlayValue(attacker) : -12 - Math.max(1, getUnitScoreValue(state, attacker)) * 5;
  }

  const defenderController = getCardController(defender);
  if (defenderController === 'opponent') {
    score += defenderDestroyed ? -getCardPlayValue(defender) : 12 + Math.max(1, getUnitScoreValue(state, defender)) * 5;
  } else {
    score += defenderDestroyed ? getCardPlayValue(defender) : -12 - Math.max(1, getUnitScoreValue(state, defender)) * 5;
  }

  if (!attackerDestroyed && defenderDestroyed) {
    score += attackerController === 'opponent' ? 20 : -20;
  }

  return score;
}

function getCounterCombatProjection(
  state: GameState,
  counter: GameCardInstance,
  target: GameCardInstance | null,
  baseAttacker: GameCardInstance | null,
  baseDefender: GameCardInstance | null
): CombatProjection | null {
  const owner = getCardController(counter);
  const isFriendly = target ? getCardController(target) === owner : false;

  if (counter.card.id === 'IMP026' || counter.card.id === 'IMP027') {
    if (!target || isFriendly) return null;
    return {
      attacker: baseAttacker?.instanceId === target.instanceId ? null : baseAttacker,
      defender: baseDefender?.instanceId === target.instanceId ? null : baseDefender,
    };
  }

  if (counter.card.id === 'IMP045') {
    if (!target || target.instanceId !== baseDefender?.instanceId || !isFriendly) return null;
    return { attacker: baseAttacker, defender: baseDefender, preventDefenderDamage: true };
  }

  if (counter.card.id === 'IMP057' || counter.card.id === 'IMP151') {
    if (!target || !isFriendly) return null;
    return {
      attacker: baseAttacker?.instanceId === target.instanceId ? null : baseAttacker,
      defender: baseDefender?.instanceId === target.instanceId ? null : baseDefender,
    };
  }

  if (counter.card.id === 'IMP058') {
    if (!target || !isFriendly) return null;
    const readied = { ...target, ready: true };
    return {
      attacker: baseAttacker?.instanceId === target.instanceId ? readied : baseAttacker,
      defender: baseDefender?.instanceId === target.instanceId ? readied : baseDefender,
    };
  }

  if (counter.card.id === 'IMP121') {
    if (!target || !isFriendly) return null;
    const enraged = {
      ...target,
      ready: true,
      temporaryAttackBonus: (target.temporaryAttackBonus ?? 0) + 1,
    };
    return {
      attacker: baseAttacker?.instanceId === target.instanceId ? enraged : baseAttacker,
      defender: baseDefender?.instanceId === target.instanceId ? enraged : baseDefender,
    };
  }

  if (counter.card.id === 'IMP150') {
    if (!target || !isFriendly) return null;
    const protectedUnit = {
      ...target,
      ready: true,
      terraLastStandAttackBonus: (target.terraLastStandAttackBonus ?? 0) + 2,
      terraLastStandHealthBonus: (target.terraLastStandHealthBonus ?? 0) + 1,
    };
    return {
      attacker: baseAttacker?.instanceId === target.instanceId ? protectedUnit : baseAttacker,
      defender: baseDefender?.instanceId === target.instanceId ? protectedUnit : baseDefender,
    };
  }

  if (counter.card.id === 'IMP163') {
    if (!target || isFriendly || !isUnitCard(target.card)) return null;
    const damaged = { ...target, damage: target.damage + 1 };
    const destroyed = damaged.damage >= getCurrentUnitHealth(state, target);
    return {
      attacker: baseAttacker?.instanceId === target.instanceId ? (destroyed ? null : damaged) : baseAttacker,
      defender: baseDefender?.instanceId === target.instanceId ? (destroyed ? null : damaged) : baseDefender,
    };
  }

  return null;
}

function getCounterChoiceScore(
  state: GameState,
  counter: GameCardInstance,
  target: GameCardInstance | null,
  baseScore: number,
  baseAttacker: GameCardInstance | null,
  baseDefender: GameCardInstance | null
): number {
  const projection = getCounterCombatProjection(state, counter, target, baseAttacker, baseDefender);

  if (!projection) {
    return 0;
  }

  return getCombatProjectionScore(state, projection) - baseScore - Math.max(0, counter.card.cost);
}

export function getBotBattlefieldAttackChoice(state: GameState): BotBattlefieldAttackChoice | null {
  if (state.winner || state.pendingCombat || state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return null;
  }

  const readyAttackers = getReadyBotAttackers(state);
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

  return choice && choice.score >= ATTACK_SCORE_THRESHOLD
    ? { attackerInstanceId: choice.attackerInstanceId, targetZone: choice.targetZone }
    : null;
}

export function chooseBotCounter(state: GameState): BotCounterChoice | null {
  if (state.pendingCombat?.priorityOwner !== 'opponent') {
    return null;
  }

  const baseAttacker = getCardInstanceById(state, state.pendingCombat.attackerInstanceId);
  const baseDefender = state.pendingCombat.defenderInstanceId
    ? getCardInstanceById(state, state.pendingCombat.defenderInstanceId)
    : null;
  const baseScore = getCombatProjectionScore(state, { attacker: baseAttacker, defender: baseDefender });
  const choices = state.opponentZones.hand
    .filter((instance) => isCounterCard(instance.card) && !getCounterPlayError(state, 'opponent', instance.instanceId))
    .flatMap((counter) => {
      const targets = getCounterTargetOptions(state, counter);
      const targetOptions = targets.length > 0 ? targets.map((target) => target) : [null];

      return targetOptions.map((target) => ({
        counterInstanceId: counter.instanceId,
        targetInstanceId: target?.instanceId,
        score: getCounterChoiceScore(state, counter, target, baseScore, baseAttacker, baseDefender),
      }));
    });
  const choice = choices.sort((left, right) => right.score - left.score)[0] ?? null;

  return choice && choice.score >= COUNTER_SCORE_THRESHOLD
    ? {
        counterInstanceId: choice.counterInstanceId,
        ...(choice.targetInstanceId ? { targetInstanceId: choice.targetInstanceId } : null),
      }
    : null;
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
