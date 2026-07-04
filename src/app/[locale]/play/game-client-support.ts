import type { Card, DeckEntry } from '../create/deck-builder/types';
import type { MoveCardOptions } from './game-actions';
import {
  getModifiedManualPlayCost,
  isItemCard,
  isTerritoryCard,
  isTacticCard,
  isUnitCard,
  type GameCardInstance,
  type GameState,
  type PendingChoice,
  type SavedDeck,
  type ZoneId,
} from './game-rules';

export type DeckCardRow = {
  quantity?: number | null;
  card_id?: string | null;
  card_id_astra?: string | null;
};

export type DeckRow = {
  id: string | number;
  title?: string | null;
  created_at?: string | null;
  deck_cards?: DeckCardRow[] | null;
};

export type { MoveCardOptions } from './game-actions';

export type MoveCardHandler = (instanceId: string, fromZone: ZoneId, toZone: ZoneId, options?: MoveCardOptions) => void;

export type HandAction = {
  key: string;
  label: string;
  target: ZoneId;
  options?: MoveCardOptions;
  disabled?: boolean;
};

export type BattlefieldAction = {
  key: string;
  label: string;
  target: ZoneId;
  options?: MoveCardOptions;
  disabled?: boolean;
};

export function getPendingChoiceTargetCards(gameState: GameState, pendingChoice: PendingChoice | null): GameCardInstance[] {
  if (!pendingChoice) {
    return [];
  }

  if (pendingChoice.kind === 'lucilleScore') {
    return gameState.zones.staging.filter((instance) => pendingChoice.availableUnitInstanceIds.includes(instance.instanceId));
  }

  if (pendingChoice.kind === 'nerezzaSacrifice') {
    return [
      ...gameState.zones.staging,
      ...gameState.zones.battlefieldLeft,
      ...gameState.zones.battlefieldCenter,
      ...gameState.zones.battlefieldRight,
    ].filter((instance) => pendingChoice.availableUnitInstanceIds.includes(instance.instanceId));
  }

  if (pendingChoice.kind === 'nerezzaSteal' || pendingChoice.kind === 'nocturneMark') {
    return ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'].flatMap((zone) =>
      gameState.zones[zone as ZoneId].filter((instance) => pendingChoice.availableUnitInstanceIds.includes(instance.instanceId))
    );
  }

  if (pendingChoice.kind === 'forcedDiscard') {
    return gameState.zones.hand.filter((instance) => pendingChoice.availableCardInstanceIds.includes(instance.instanceId));
  }

  if (pendingChoice.kind === 'noxTarget' || pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'caelumTarget') {
    return [
      ...gameState.zones.deck,
      ...gameState.zones.hand,
      ...gameState.zones.staging,
      ...gameState.zones.supply,
      ...gameState.zones.graveyard,
      ...gameState.opponentZones.staging,
      ...gameState.opponentZones.supply,
      ...gameState.opponentZones.graveyard,
      ...gameState.zones.battlefieldLeft,
      ...gameState.zones.battlefieldCenter,
      ...gameState.zones.battlefieldRight,
    ].filter((instance) => pendingChoice.availableInstanceIds.includes(instance.instanceId));
  }

  return [];
}

export const ZONE_LABELS: Record<ZoneId, string> = {
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

export const MATCH_SESSION_STORAGE_KEY = 'astrabuilder-simulator-match';
export const CARD_BACK_IMAGE_SRC = '/images/card-back.png';
export const BOT_TURN_STEP_DELAY_MS = 500;
export const BOT_POST_COMBAT_REVIEW_DELAY_MS = 2200;

const DEFAULT_MOVE_TARGETS: ZoneId[] = [
  'hand',
  'staging',
  'supply',
  'battlefieldLeft',
  'battlefieldCenter',
  'battlefieldRight',
];

export function getVisibleMoveTargets(zone: ZoneId): ZoneId[] {
  return DEFAULT_MOVE_TARGETS.filter((target) => target !== zone);
}

export function resolveDeckCardId(entry: DeckCardRow | null | undefined): string | null {
  if (!entry) {
    return null;
  }

  if (typeof entry.card_id_astra === 'string' && entry.card_id_astra.trim().length > 0) {
    return entry.card_id_astra.trim();
  }

  if (typeof entry.card_id === 'string' && entry.card_id.trim().length > 0) {
    return entry.card_id.trim();
  }

  return null;
}

export function mapDeckRows(rows: DeckRow[], cardMap: Map<string, Card>): SavedDeck[] {
  return rows.map((row) => {
    const cardTotals = new Map<string, number>();

    for (const deckCard of row.deck_cards ?? []) {
      const cardId = resolveDeckCardId(deckCard);
      const quantity = Math.max(0, Number(deckCard?.quantity ?? 0));

      if (!cardId || quantity <= 0 || !cardMap.has(cardId)) {
        continue;
      }

      cardTotals.set(cardId, (cardTotals.get(cardId) ?? 0) + quantity);
    }

    const entries = Array.from(cardTotals.entries())
      .map(([cardId, count]) => {
        const card = cardMap.get(cardId);
        return card ? { card, count } : null;
      })
      .filter((entry): entry is DeckEntry => Boolean(entry))
      .sort((a, b) => {
        if (a.card.cost !== b.card.cost) {
          return a.card.cost - b.card.cost;
        }

        return a.card.name.localeCompare(b.card.name);
      });

    return {
      id: String(row.id),
      title: row.title ?? null,
      cardCount: entries.reduce((sum, entry) => sum + entry.count, 0),
      entries,
    };
  });
}

export function getBattlefieldActions(
  zone: ZoneId,
  instance: GameCardInstance,
  {
    canFlipFaceUp,
  }: {
    canFlipFaceUp: boolean;
  }
): BattlefieldAction[] {
  if (isTerritoryCard(instance.card)) {
    if (instance.owner !== 'player' || !instance.faceDown) {
      return [];
    }

    return [
      {
        key: 'flip-face-up',
        label: 'Flip face up',
        target: zone,
        options: { faceDown: false },
        disabled: !canFlipFaceUp,
      },
    ];
  }

  if (!isUnitCard(instance.card)) {
    return [];
  }

  return [
    {
      key: 'retreat-staging',
      label: 'Retreat to Staging',
      target: 'staging',
      options: { enterExhausted: true },
    },
  ];
}

export function getHandActions(
  instance: GameCardInstance,
  {
    canSupplyFromHand,
    canPlayFromHand,
    gameState,
    graveyardCards,
    handCards,
    friendlyUnitsInPlay,
    readySupplyCount,
    stagingUnits,
    demonicAdvanceActive = false,
    battlefieldCardsByZone,
  }: {
    canSupplyFromHand: boolean;
    canPlayFromHand: boolean;
    gameState: GameState;
    graveyardCards: GameCardInstance[];
    handCards: GameCardInstance[];
    friendlyUnitsInPlay: GameCardInstance[];
    readySupplyCount: number;
    stagingUnits: GameCardInstance[];
    demonicAdvanceActive?: boolean;
    battlefieldCardsByZone?: Partial<Record<ZoneId, GameCardInstance[]>>;
  }
): HandAction[] {
  const actions: HandAction[] = [];
  const canPayForStagingPlay =
    readySupplyCount >= getModifiedManualPlayCost(gameState, 'player', instance.card, 'staging');
  const hasSacrificeTarget = friendlyUnitsInPlay.length > 0;
  const hasDiscardTarget = handCards.some((candidate) => candidate.instanceId !== instance.instanceId);
  const hasReanimateTarget = graveyardCards.some(
    (candidate) => isUnitCard(candidate.card) && !candidate.card.type.toLowerCase().includes('renowned')
  );
  const tacticPlayCost = Math.max(
    0,
    getModifiedManualPlayCost(gameState, 'player', instance.card, 'graveyard')
  );

  if (isUnitCard(instance.card)) {
    actions.push({
      key: 'play-unit-staging',
      label: 'Play to Staging',
      target: 'staging',
      disabled:
        !canPlayFromHand ||
        !canPayForStagingPlay ||
        (instance.card.id === 'IMP004' && !hasSacrificeTarget) ||
        (instance.card.id === 'IMP005' && !hasDiscardTarget) ||
        (instance.card.id === 'IMP006' && !hasReanimateTarget),
    });

    if (demonicAdvanceActive) {
      for (const zone of ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'] satisfies ZoneId[]) {
        actions.push({
          key: `demonic-advance-${zone}`,
          label: `Play ready to ${ZONE_LABELS[zone]}`,
          target: zone,
          disabled:
            !canPlayFromHand ||
            !canPayForStagingPlay ||
            Boolean(battlefieldCardsByZone?.[zone]?.some((card) => isUnitCard(card.card))),
        });
      }
    }
  }

  if (isTerritoryCard(instance.card)) {
    const territoryZones: ZoneId[] = ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'];

    for (const zone of territoryZones) {
      actions.push(
        {
          key: `${zone}-face-up`,
          label: `${ZONE_LABELS[zone]} face up`,
          target: zone,
          options: { faceDown: false },
          disabled:
            !canPlayFromHand ||
            readySupplyCount < getModifiedManualPlayCost(gameState, 'player', instance.card, zone, { faceDown: false }),
        },
        {
          key: `${zone}-face-down`,
          label: `${ZONE_LABELS[zone]} face down`,
          target: zone,
          options: { faceDown: true },
          disabled: !canPlayFromHand,
        }
      );
    }
  }

  if (isItemCard(instance.card)) {
    if (stagingUnits.length === 0) {
      actions.push({
        key: 'equip-no-target',
        label: 'No staging unit to equip',
        target: 'staging',
        disabled: true,
      });
    } else {
      for (const unit of stagingUnits) {
        actions.push({
          key: `equip-${unit.instanceId}`,
          label: `Equip to ${unit.card.name}`,
          target: 'staging',
          options: { attachToInstanceId: unit.instanceId },
          disabled: !canPlayFromHand || !canPayForStagingPlay,
        });
      }
    }
  }

  if (isTacticCard(instance.card)) {
    actions.push({
      key: 'play-tactic',
      label: 'Play tactic',
      target: 'graveyard',
      disabled: !canPlayFromHand || readySupplyCount < tacticPlayCost,
    });
  }

  actions.push({
    key: 'supply',
    label: 'Supply',
    target: 'supply',
    disabled: !canSupplyFromHand,
  });

  return actions;
}
