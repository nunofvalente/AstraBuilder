import type { Card, DeckEntry } from '../create/deck-builder/types';
import type { MoveCardOptions } from './game-actions';
import {
  getManualPlayCost,
  isItemCard,
  isTerritoryCard,
  isUnitCard,
  type GameCardInstance,
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
export const BOT_TURN_STEP_DELAY_MS = 1500;

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
    readySupplyCount,
    stagingUnits,
  }: {
    canSupplyFromHand: boolean;
    canPlayFromHand: boolean;
    readySupplyCount: number;
    stagingUnits: GameCardInstance[];
  }
): HandAction[] {
  const actions: HandAction[] = [];
  const canPayForStagingPlay = readySupplyCount >= getManualPlayCost(instance.card, 'staging');

  if (isUnitCard(instance.card)) {
    actions.push({
      key: 'play-unit-staging',
      label: 'Play to Staging',
      target: 'staging',
      disabled: !canPlayFromHand || !canPayForStagingPlay,
    });
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
          disabled: !canPlayFromHand || readySupplyCount < getManualPlayCost(instance.card, zone, { faceDown: false }),
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

  actions.push({
    key: 'supply',
    label: 'Supply',
    target: 'supply',
    disabled: !canSupplyFromHand,
  });

  return actions;
}
