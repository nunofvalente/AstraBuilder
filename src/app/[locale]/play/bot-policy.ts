import {
  BATTLEFIELD_ZONE_IDS,
  canManuallySupplyFromHand,
  getBattlefieldAttackError,
  getCounterPlayError,
  getEquipmentAttachmentError,
  getPlayCostError,
  isCounterCard,
  isItemCard,
  isUnitCard,
  type GameState,
  type ZoneId,
} from './game-rules';
import type { CardAction } from './game-actions';

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

export function getBotBattlefieldAttackChoice(state: GameState): BotBattlefieldAttackChoice | null {
  if (state.winner || state.pendingCombat || state.phase !== 'main' || state.activePlayer !== 'opponent') {
    return null;
  }

  const readyAttackers = state.opponentZones.staging.filter((instance) => instance.ready && isUnitCard(instance.card));
  const targetZones = [
    ...BATTLEFIELD_ZONE_IDS.filter((zone) =>
      state.zones[zone].some((instance) => instance.owner === 'player' && isUnitCard(instance.card))
    ),
    ...BATTLEFIELD_ZONE_IDS.filter((zone) =>
      !state.zones[zone].some((instance) => isUnitCard(instance.card))
    ),
  ];

  for (const attacker of readyAttackers) {
    for (const targetZone of targetZones) {
      if (!getBattlefieldAttackError(state, 'opponent', attacker.instanceId, targetZone)) {
        return {
          attackerInstanceId: attacker.instanceId,
          targetZone,
        };
      }
    }
  }

  return null;
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
    const selectedCard = canManuallySupplyFromHand(state, 'opponent')
      ? state.opponentZones.hand[0] ?? null
      : null;

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
    const selectedUnit = state.opponentZones.hand.find(
      (instance) => isUnitCard(instance.card) && !getPlayCostError(state, 'opponent', instance.card)
    );

    if (selectedUnit) {
      return {
        type: 'card',
        action: {
          owner: 'opponent',
          instanceId: selectedUnit.instanceId,
          fromZone: 'hand',
          toZone: 'staging',
        },
      };
    }

    const hostUnit = state.opponentZones.staging.find((instance) => isUnitCard(instance.card)) ?? null;
    const selectedEquipment = hostUnit
      ? state.opponentZones.hand.find(
          (instance) =>
            isItemCard(instance.card) &&
            !getPlayCostError(state, 'opponent', instance.card) &&
            !getEquipmentAttachmentError(state.opponentZones.staging, 'opponent', hostUnit.instanceId)
        ) ?? null
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

  const attack = getBotBattlefieldAttackChoice(state);
  return attack
    ? {
        type: 'attack',
        ...attack,
      }
    : null;
}
