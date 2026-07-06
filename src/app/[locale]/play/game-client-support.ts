import type { Locale } from '@/i18n/config';
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

  if (pendingChoice.kind === 'noxTarget' || pendingChoice.kind === 'luxTarget' || pendingChoice.kind === 'caelumTarget' || pendingChoice.kind === 'solaraTarget' || pendingChoice.kind === 'terraTarget' || pendingChoice.kind === 'neutralTarget') {
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

export function getDefaultPendingChoiceSelectionIds(pendingChoice: PendingChoice | null): string[] {
  if (pendingChoice?.kind === 'terraTarget' && pendingChoice.effect === 'ravenRetreat') {
    return pendingChoice.availableInstanceIds.slice(0, 1);
  }

  return [];
}

export function isPrivateOpponentSupplyChoiceTarget(
  gameState: GameState,
  pendingChoice: PendingChoice | null,
  target: GameCardInstance,
): boolean {
  return Boolean(
    pendingChoice?.owner === 'player' &&
      gameState.opponentZones.supply.some((instance) => instance.instanceId === target.instanceId),
  );
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

type CardActionCopy = {
  battlefield: [string, string, string];
  equip: (name: string) => string;
  equipNoTarget: string;
  faceDown: (zone: string) => string;
  faceUp: (zone: string) => string;
  flipFaceUp: string;
  playReady: (zone: string) => string;
  playTactic: string;
  playToStaging: string;
  retreatToStaging: string;
  supply: string;
};

const CARD_ACTION_COPY: Record<Locale, CardActionCopy> = {
  en: {
    battlefield: ['Battlefield 1', 'Battlefield 2', 'Battlefield 3'],
    equip: (name) => `Equip to ${name}`,
    equipNoTarget: 'No staging unit to equip',
    faceDown: (zone) => `${zone} face down`,
    faceUp: (zone) => `${zone} face up`,
    flipFaceUp: 'Flip face up',
    playReady: (zone) => `Play ready to ${zone}`,
    playTactic: 'Play tactic',
    playToStaging: 'Play to Staging',
    retreatToStaging: 'Retreat to Staging',
    supply: 'Supply',
  },
  fr: {
    battlefield: ['Champ de bataille 1', 'Champ de bataille 2', 'Champ de bataille 3'],
    equip: (name) => `Équiper ${name}`,
    equipNoTarget: 'Aucune unité à équiper dans la zone de préparation',
    faceDown: (zone) => `${zone} face cachée`,
    faceUp: (zone) => `${zone} face visible`,
    flipFaceUp: 'Retourner face visible',
    playReady: (zone) => `Jouer redressé sur ${zone}`,
    playTactic: 'Jouer la tactique',
    playToStaging: 'Jouer dans la zone de préparation',
    retreatToStaging: 'Battre en retraite vers la zone de préparation',
    supply: 'Mettre en ravitaillement',
  },
  de: {
    battlefield: ['Schlachtfeld 1', 'Schlachtfeld 2', 'Schlachtfeld 3'],
    equip: (name) => `${name} ausrüsten`,
    equipNoTarget: 'Keine Einheit im Vorbereitungsbereich zum Ausrüsten',
    faceDown: (zone) => `${zone} verdeckt`,
    faceUp: (zone) => `${zone} offen`,
    flipFaceUp: 'Aufdecken',
    playReady: (zone) => `Bereit auf ${zone} ausspielen`,
    playTactic: 'Taktik ausspielen',
    playToStaging: 'In den Vorbereitungsbereich ausspielen',
    retreatToStaging: 'In den Vorbereitungsbereich zurückziehen',
    supply: 'Als Versorgung ablegen',
  },
  ms: {
    battlefield: ['Medan Tempur 1', 'Medan Tempur 2', 'Medan Tempur 3'],
    equip: (name) => `Lengkapkan kepada ${name}`,
    equipNoTarget: 'Tiada unit di kawasan persediaan untuk dilengkapkan',
    faceDown: (zone) => `${zone} menghadap ke bawah`,
    faceUp: (zone) => `${zone} menghadap ke atas`,
    flipFaceUp: 'Terbalikkan menghadap ke atas',
    playReady: (zone) => `Main dalam keadaan bersedia ke ${zone}`,
    playTactic: 'Main kad taktik',
    playToStaging: 'Main ke kawasan persediaan',
    retreatToStaging: 'Berundur ke kawasan persediaan',
    supply: 'Jadikan bekalan',
  },
  'zh-CN': {
    battlefield: ['战场 1', '战场 2', '战场 3'],
    equip: (name) => `装备给 ${name}`,
    equipNoTarget: '集结区没有可装备的单位',
    faceDown: (zone) => `${zone}（背面）`,
    faceUp: (zone) => `${zone}（正面）`,
    flipFaceUp: '翻至正面',
    playReady: (zone) => `以准备状态打出至${zone}`,
    playTactic: '打出战术牌',
    playToStaging: '打出至集结区',
    retreatToStaging: '撤退至集结区',
    supply: '充作补给',
  },
  ja: {
    battlefield: ['戦場 1', '戦場 2', '戦場 3'],
    equip: (name) => `${name}に装備`,
    equipNoTarget: '装備できるステージングのユニットがありません',
    faceDown: (zone) => `${zone}（裏向き）`,
    faceUp: (zone) => `${zone}（表向き）`,
    flipFaceUp: '表向きにする',
    playReady: (zone) => `準備状態で${zone}にプレイ`,
    playTactic: '戦術カードをプレイ',
    playToStaging: 'ステージングにプレイ',
    retreatToStaging: 'ステージングへ撤退',
    supply: 'サプライに置く',
  },
};

function getCardActionCopy(locale: Locale): CardActionCopy {
  return CARD_ACTION_COPY[locale];
}

function getLocalizedBattlefieldLabel(zone: ZoneId, copy: CardActionCopy): string {
  const index = ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'].indexOf(zone);
  return index >= 0 ? copy.battlefield[index]! : ZONE_LABELS[zone];
}

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
    locale = 'en',
  }: {
    canFlipFaceUp: boolean;
    locale?: Locale;
  }
): BattlefieldAction[] {
  const copy = getCardActionCopy(locale);
  if (isTerritoryCard(instance.card)) {
    if (instance.owner !== 'player' || !instance.faceDown) {
      return [];
    }

    return [
      {
        key: 'flip-face-up',
        label: copy.flipFaceUp,
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
      label: copy.retreatToStaging,
      target: 'staging',
      options: { enterExhausted: true },
      disabled: instance.retreatLockedUntilNextTurn,
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
    locale = 'en',
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
    locale?: Locale;
  }
): HandAction[] {
  const copy = getCardActionCopy(locale);
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
      label: copy.playToStaging,
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
          label: copy.playReady(getLocalizedBattlefieldLabel(zone, copy)),
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
          label: copy.faceUp(getLocalizedBattlefieldLabel(zone, copy)),
          target: zone,
          options: { faceDown: false },
          disabled:
            !canPlayFromHand ||
            readySupplyCount < getModifiedManualPlayCost(gameState, 'player', instance.card, zone, { faceDown: false }),
        },
        {
          key: `${zone}-face-down`,
          label: copy.faceDown(getLocalizedBattlefieldLabel(zone, copy)),
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
        label: copy.equipNoTarget,
        target: 'staging',
        disabled: true,
      });
    } else {
      for (const unit of stagingUnits) {
        actions.push({
          key: `equip-${unit.instanceId}`,
          label: copy.equip(unit.card.name),
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
      label: copy.playTactic,
      target: 'graveyard',
      disabled: !canPlayFromHand || readySupplyCount < tacticPlayCost,
    });
  }

  actions.push({
    key: 'supply',
    label: copy.supply,
    target: 'supply',
    disabled: !canSupplyFromHand,
  });

  return actions;
}
