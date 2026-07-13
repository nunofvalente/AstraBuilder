'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { Locale } from '@/i18n/config';
import type { Card } from '../create/deck-builder/types';
import { hasCardKeyword } from './card-definitions';
import {
  getAttachedCards,
  getCardController,
  getCurrentUnitInfluence,
  getPlayCost,
  isItemCard,
  isTerritoryCard,
  isUnitCard,
  type GameCardInstance,
  type GameState,
  type Owner,
  type ZoneId,
} from './game-rules';
import {
  CARD_BACK_IMAGE_SRC,
  getBattlefieldActions,
  getHandActions,
  type BattlefieldAction,
  type HandAction,
  type MoveCardHandler,
} from './game-client-support';
import {
  AttachedEquipmentCards,
  CardZoomPreview,
  CompactZoneStack,
  getReadyStateClassName,
  useCloseOnOutsidePointerDown,
} from './game-client-ui';
import { getBanishOnDeathLabel, getLocalizedCardDisplay, getPlayBoardCopy } from './play-localization';

export type BattlefieldZoneId = 'battlefieldLeft' | 'battlefieldCenter' | 'battlefieldRight';
type AttackBattlefieldHandler = (attackerInstanceId: string, targetZone: ZoneId) => void;
type ActivateAbilityHandler = (source: GameCardInstance) => void;
type CardsDrawnThisTurnByOwner = Record<Owner, number>;
export type CurrentCombatStatsByInstanceId = Record<string, { attack: number; health: number }>;
export type AttackArrowState = {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

function useIsFourKViewport(): boolean {
  const [isFourKViewport, setIsFourKViewport] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const query = window.matchMedia('(min-width: 2560px)');
    const update = () => setIsFourKViewport(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isFourKViewport;
}

const READY_ACTIVATED_ABILITY_CARD_IDS = new Set(['IMP016', 'IMP066', 'IMP073', 'IMP079', 'IMP139', 'IMP160']);
const BATTLEFIELD_ZONE_ORDER: BattlefieldZoneId[] = ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'];

function getBoardBattlefieldLabel(copy: ReturnType<typeof getPlayBoardCopy>, zone: ZoneId): string {
  const index = BATTLEFIELD_ZONE_ORDER.indexOf(zone as BattlefieldZoneId);
  return index >= 0 ? copy.battlefield[index]! : zone;
}

function canShowActivatedAbilityAction(
  instance: GameCardInstance | null,
  onActivate?: ActivateAbilityHandler,
  options: { inCombatZone?: boolean } = {}
): boolean {
  return Boolean(
    instance &&
    getCardController(instance) === 'player' &&
    onActivate &&
    (instance.card.id !== 'IMP079' || options.inCombatZone) &&
    (
      (instance.card.id === 'IMP001' && !instance.ready) ||
      (READY_ACTIVATED_ABILITY_CARD_IDS.has(instance.card.id) && instance.ready)
    )
  );
}
export function DamageBadge({ instance }: { instance: GameCardInstance }) {
  const damage = Number(instance.damage);

  if (!isUnitCard(instance.card) || !Number.isFinite(damage) || damage <= 0) {
    return null;
  }

  return (
    <span className="absolute right-1 top-1 z-20 grid h-5 min-w-5 place-items-center rounded-full border border-red-200/60 bg-red-700/95 px-1 text-[0.62rem] font-black leading-none text-white shadow-md">
      {damage}
    </span>
  );
}

export function CombatStatsBadge({
  instance,
  currentStats,
}: {
  instance: GameCardInstance;
  currentStats?: { attack: number; health: number };
}) {
  if (instance.faceDown || (!isUnitCard(instance.card) && !isItemCard(instance.card))) {
    return null;
  }

  const attack = currentStats?.attack ?? instance.card.attack;
  const health = currentStats?.health ?? instance.card.health;
  const modified = attack !== instance.card.attack || health !== instance.card.health;

  return (
    <span
      className={`absolute bottom-1 right-1 z-20 inline-flex h-5 min-w-[2.8rem] items-center justify-center gap-1 rounded border bg-black/80 px-1 text-[0.58rem] font-black leading-none shadow-md ${
        modified ? 'border-amber-300/90' : 'border-white/35'
      }`}
      title={`Current stats: ${attack} attack, ${health} health${modified ? ` (printed ${instance.card.attack}/${instance.card.health})` : ''}`}
      aria-label={`${instance.card.name} has ${attack} attack and ${health} health${modified ? ', modified' : ''}`}
      data-combat-stats-modified={modified ? 'true' : 'false'}
    >
      <span className="text-red-300">{attack}</span>
      <span className="text-white/60">/</span>
      <span className="text-emerald-300">{health}</span>
    </span>
  );
}

export function QuarantineProgressBadge({ instance }: { instance: GameCardInstance }) {
  if (instance.card.id !== 'IMP063' || instance.faceDown) {
    return null;
  }

  const progress = Math.min(2, Math.max(0, Number(instance.progressCounters ?? 0)));
  const turnsLeft = Math.max(0, 2 - progress);
  const turnLabel = `${turnsLeft} ${turnsLeft === 1 ? 'turn' : 'turns'} left`;

  return (
    <>
      <span
        className="absolute left-1 top-1 z-20 grid h-6 min-w-8 place-items-center rounded border border-amber-100/70 bg-amber-700/95 px-1 text-[0.62rem] font-black leading-none text-white shadow-md"
        title={`${progress} of 2 progress counters`}
      >
        {progress}/2
      </span>
      <span
        className="absolute inset-x-1 bottom-1 z-20 rounded border border-amber-100/60 bg-black/85 px-1 py-0.5 text-center text-[0.56rem] font-black uppercase leading-none text-white shadow-md"
        aria-label={`Quarantine Zone has ${progress} of 2 progress counters and ${turnLabel}`}
      >
        {turnLabel}
      </span>
    </>
  );
}

export function RuinsProgressBadge({ instance }: { instance: GameCardInstance }) {
  if (instance.card.id !== 'IMP125' || instance.faceDown) {
    return null;
  }

  const progress = Math.min(3, Math.max(0, Number(instance.progressCounters ?? 0)));

  if (progress <= 0) {
    return null;
  }

  return (
    <span
      className="absolute left-1 top-1 z-20 grid h-6 min-w-8 place-items-center rounded border border-orange-100/70 bg-orange-700/95 px-1 text-[0.62rem] font-black leading-none text-white shadow-md"
      title={`${progress} of 3 dig counters`}
      aria-label={`${instance.card.name} has ${progress} of 3 dig counters`}
    >
      {progress}/3
    </span>
  );
}

export function EffectSourceBadges({
  instance,
  zoneCards = [],
  banishOnDeathLabel = 'Banish on death',
}: {
  instance: GameCardInstance;
  zoneCards?: GameCardInstance[];
  banishOnDeathLabel?: string;
}) {
  if (instance.faceDown || !isUnitCard(instance.card)) {
    return null;
  }

  const badges: Array<{ key: string; label: string; title: string }> = [];
  const attachedItems = getAttachedCards(zoneCards, instance.instanceId).filter((card) => !card.faceDown);

  if (instance.banishOnDeath) {
    badges.push({
      key: 'banish-on-death',
      label: banishOnDeathLabel,
      title: banishOnDeathLabel,
    });
  }

  if (instance.protectedFromEnemyTacticsUntilTurn !== undefined) {
    badges.push({
      key: 'renata',
      label: "Can't be targeted by enemy tactics",
      title: "Can't be targeted by enemy tactics until end of turn",
    });
  }

  if (instance.destroyOnNextDamageUntilTurn !== undefined) {
    badges.push({
      key: 'mark-of-death',
      label: 'Marked',
      title: 'Mark of Death: next damage destroys this unit',
    });
  }

  if ((instance.temporaryGloryBonus ?? 0) > 0) {
    badges.push({
      key: 'temporary-glory',
      label: `Glory ${instance.temporaryGloryBonus}`,
      title: `Granted Glory ${instance.temporaryGloryBonus} until end of turn`,
    });
  }

  if (instance.preventNextCombatDamageThisTurn) {
    badges.push({
      key: 'prevent-combat-damage',
      label: 'Prevent dmg',
      title: 'Next combat damage to this unit is prevented this turn',
    });
  }

  if (instance.abilitiesSuppressedUntilTurn !== undefined) {
    badges.push({
      key: 'abilities-suppressed',
      label: 'No abilities',
      title: 'Abilities are suppressed this turn',
    });
  }

  if (instance.skipNextReady) {
    badges.push({
      key: 'skip-ready',
      label: 'Skip ready',
      title: "Won't ready during its next ready phase",
    });
  }

  if (instance.gainVictoryPointOnDeathUntilTurn !== undefined) {
    badges.push({
      key: 'brand-vp',
      label: 'Death: +1 VP',
      title: 'If this unit dies this turn, the marked player gains 1 victory point',
    });
  }

  if (instance.abandonLabBanishOnDeathUntilTurn !== undefined) {
    badges.push({
      key: 'abandon-lab',
      label: 'Death: return',
      title: 'If this unit would die this turn, banish it and return it next main phase',
    });
  }

  const hasRadarBeaconAura = zoneCards.some(
    (card) =>
      card.card.id === 'IMP094' &&
      !card.faceDown &&
      isTerritoryCard(card.card) &&
      getCardController(card) === getCardController(instance)
  );
  if (hasRadarBeaconAura) {
    badges.push({
      key: 'radar',
      label: 'On Defend: Ready',
      title: 'On Defend: Ready this unit',
    });
  }

  for (const item of attachedItems) {
    switch (item.card.id) {
      case 'IMP028':
        badges.push({
          key: item.instanceId,
          label: "Can't score",
          title: `${item.card.name}: equipped unit can't score`,
        });
        break;
      case 'IMP029':
        badges.push({
          key: item.instanceId,
          label: 'Death: 3 dmg',
          title: `${item.card.name}: when equipped unit dies in combat, deal 3 damage to units in that zone`,
        });
        break;
      case 'IMP060':
        badges.push({
          key: item.instanceId,
          label: 'Provoke',
          title: `${item.card.name}: equipped unit gains Provoke`,
        });
        break;
      case 'IMP089':
        badges.push({
          key: item.instanceId,
          label: 'Death: discard',
          title: `${item.card.name}: when equipped unit dies, target opponent discards a card`,
        });
        break;
      case 'IMP090':
        badges.push({
          key: item.instanceId,
          label: 'Capture: +1 VP',
          title: `${item.card.name}: when equipped unit takes an unoccupied zone, return this and gain 1 victory point`,
        });
        break;
      case 'IMP091':
        badges.push({
          key: item.instanceId,
          label: 'Score: supply',
          title: `${item.card.name}: when equipped unit scores, this may move to supply exhausted`,
        });
        break;
      case 'IMP122':
        badges.push({
          key: item.instanceId,
          label: 'Glory 1',
          title: `${item.card.name}: equipped unit gains Glory 1`,
        });
        break;
      case 'IMP123':
        badges.push({
          key: item.instanceId,
          label: 'Vengeance',
          title: `${item.card.name}: when equipped unit dies while attacking, this may return to hand`,
        });
        break;
      case 'IMP152':
        badges.push({
          key: item.instanceId,
          label: 'Impede 1',
          title: `${item.card.name}: equipped unit gains Impede 1`,
        });
        break;
      case 'IMP153':
        badges.push({
          key: item.instanceId,
          label: 'Defend death: top deck',
          title: `${item.card.name}: when equipped unit dies while defending, it may return to the top of its deck`,
        });
        break;
      default:
        break;
    }
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-1 top-1 z-20 flex max-w-[70%] flex-col items-start gap-1">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className="rounded border border-white/15 bg-black/65 px-1.5 py-0.5 text-[0.48rem] font-semibold leading-tight text-white shadow-md backdrop-blur-[1px]"
          title={badge.title}
          aria-label={badge.title}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export function CurrentInfluenceBadge({
  instance,
  attachedCards = [],
  cardsDrawnThisTurnByOwner = { player: 0, opponent: 0 },
}: {
  instance: GameCardInstance;
  attachedCards?: GameCardInstance[];
  cardsDrawnThisTurnByOwner?: CardsDrawnThisTurnByOwner;
}) {
  if (instance.faceDown || (!isUnitCard(instance.card) && !isItemCard(instance.card))) {
    return null;
  }

  const influence = isUnitCard(instance.card)
    ? getCurrentUnitInfluence(instance, attachedCards, cardsDrawnThisTurnByOwner[getCardController(instance)])
    : Math.max(0, instance.card.influence ?? 0);

  return (
    <span
      className="absolute bottom-1 left-1 z-20 inline-flex h-5 min-w-5 items-center justify-center rounded border border-yellow-300/80 bg-black/80 px-1 text-[0.58rem] font-black leading-none text-yellow-300 shadow-md"
      title={`Current influence: ${influence}`}
      aria-label={`${instance.card.name} has ${influence} influence`}
    >
      {influence}
    </span>
  );
}

export function AttackArrowOverlay({ arrow }: { arrow: AttackArrowState }) {
  const markerId = `attack-arrow-head-${arrow.id}`;

  return (
    <svg className="pointer-events-none fixed inset-0 z-[85] h-screen w-screen" aria-hidden="true">
      <defs>
        <marker id={markerId} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
          <path d="M2,2 L10,6 L2,10 Z" fill="rgb(248 113 113)" />
        </marker>
      </defs>
      <line
        x1={arrow.from.x}
        y1={arrow.from.y}
        x2={arrow.to.x}
        y2={arrow.to.y}
        stroke="rgb(248 113 113)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="18 12"
        markerEnd={`url(#${markerId})`}
        opacity="0.95"
      >
        <animate attributeName="stroke-dashoffset" from="60" to="0" dur="0.7s" repeatCount="1" />
      </line>
    </svg>
  );
}

export function BattlefieldPanel({
  zone,
  cards,
  onMove,
  onActivate,
  onAttack,
  battlefieldCardsByZone,
  disabled = false,
  canFlipFaceUp = false,
  currentTurn,
  readySupplyCount = 0,
  currentCombatStatsByInstanceId = {},
  cardsDrawnThisTurnByOwner = { player: 0, opponent: 0 },
  locale = 'en',
}: {
  zone: ZoneId;
  cards: GameCardInstance[];
  onMove: MoveCardHandler;
  onActivate?: ActivateAbilityHandler;
  onAttack?: AttackBattlefieldHandler;
  battlefieldCardsByZone?: Record<BattlefieldZoneId, GameCardInstance[]>;
  disabled?: boolean;
  canFlipFaceUp?: boolean;
  currentTurn?: number;
  readySupplyCount?: number;
  currentCombatStatsByInstanceId?: CurrentCombatStatsByInstanceId;
  cardsDrawnThisTurnByOwner?: CardsDrawnThisTurnByOwner;
  locale?: Locale;
}) {
  const copy = getPlayBoardCopy(locale);
  const unit = cards.find((instance) => isUnitCard(instance.card)) ?? null;
  const zoneController = unit ? getCardController(unit) : null;
  const zoneControlLabel = zoneController === 'player' ? copy.captured : zoneController === 'opponent' ? copy.lost : null;
  const playerTerritory = cards.find((instance) => instance.owner === 'player' && isTerritoryCard(instance.card)) ?? null;
  const opponentTerritory = cards.find((instance) => instance.owner === 'opponent' && isTerritoryCard(instance.card)) ?? null;
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const activeInstance = cards.find((instance) => instance.instanceId === activeInstanceId) ?? null;
  const [previewCards, setPreviewCards] = useState<GameCardInstance[] | null>(null);
  const previewClearTimeoutRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isFourKViewport = useIsFourKViewport();
  const actions = activeInstance
    ? getBattlefieldActions(zone, activeInstance, {
        canFlipFaceUp:
          canFlipFaceUp &&
          readySupplyCount >= getPlayCost(activeInstance.card) &&
          activeInstance.faceDownEnteredTurn !== currentTurn,
        locale,
      })
    : [];
  const canActivate = canShowActivatedAbilityAction(activeInstance, onActivate, { inCombatZone: true });
  const flankingTargets: BattlefieldZoneId[] =
    activeInstance &&
    isUnitCard(activeInstance.card) &&
    getCardController(activeInstance) === 'player' &&
    activeInstance.ready &&
    hasCardKeyword(activeInstance.card, 'flanking') &&
    onAttack
      ? (['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight'] as BattlefieldZoneId[]).filter(
          (target) =>
            target !== zone &&
            !battlefieldCardsByZone?.[target]?.some(
              (card) => isUnitCard(card.card) && getCardController(card) === 'player'
            )
        )
      : [];

  useCloseOnOutsidePointerDown(activeInstance !== null, [triggerRef, menuRef], () => setActiveInstanceId(null));

  useEffect(() => {
    return () => {
      if (previewClearTimeoutRef.current !== null) {
        window.clearTimeout(previewClearTimeoutRef.current);
      }
    };
  }, []);

  function cancelPreviewClear() {
    if (previewClearTimeoutRef.current !== null) {
      window.clearTimeout(previewClearTimeoutRef.current);
      previewClearTimeoutRef.current = null;
    }
  }

  function openPreview(instance: GameCardInstance) {
    cancelPreviewClear();
    const previewInstance =
      instance.owner === 'player' && instance.faceDown && isTerritoryCard(instance.card)
        ? { ...instance, faceDown: false }
        : instance;
    setPreviewCards([previewInstance, ...getAttachedCards(cards, instance.instanceId)]);
  }

  function openEquipmentPreview(instance: GameCardInstance) {
    cancelPreviewClear();
    setPreviewCards([instance]);
  }

  function schedulePreviewClear(instanceId: string) {
    cancelPreviewClear();
    previewClearTimeoutRef.current = window.setTimeout(() => {
      setPreviewCards((current) => (current?.[0]?.instanceId === instanceId ? null : current));
      previewClearTimeoutRef.current = null;
    }, 120);
  }

  function handleMove(instanceId: string, action: BattlefieldAction) {
    if (disabled || action.disabled) {
      setActiveInstanceId(null);
      cancelPreviewClear();
      setPreviewCards(null);
      return;
    }

    onMove(instanceId, zone, action.target, action.options);
    setActiveInstanceId(null);
    cancelPreviewClear();
    setPreviewCards(null);
  }

  function renderSlot(instance: GameCardInstance | null, label: string | null, size: 'unit' | 'territory') {
    const isActive = activeInstanceId === instance?.instanceId;
    const sizeClassName = size === 'unit' ? 'h-[7.1rem] min-[2560px]:h-[min(11rem,100%)]' : 'h-[6.35rem] min-[2560px]:h-[min(10.25rem,100%)]';
    const slotClassName =
      size === 'unit'
        ? 'border-[color:var(--accent)]/45 bg-[color:var(--surface-muted)]/35'
        : 'border-[color:var(--border)]/75 bg-[color:var(--background)]/35';
    if (!instance) {
      return (
        <div className={`flex aspect-[5/7] ${sizeClassName} ${slotClassName} items-center justify-center rounded-md border border-dashed px-1 text-center text-[0.58rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]`}>
          {label}
        </div>
      );
    }

    return (
      <button
        ref={isActive ? triggerRef : undefined}
        type="button"
        data-card-instance-id={instance.instanceId}
        onClick={() => !disabled && setActiveInstanceId((current) => (current === instance.instanceId ? null : instance.instanceId))}
        onMouseEnter={() => openPreview(instance)}
        onFocus={() => openPreview(instance)}
        onMouseLeave={() => schedulePreviewClear(instance.instanceId)}
        onBlur={() => schedulePreviewClear(instance.instanceId)}
        className={`relative z-10 aspect-[5/7] ${sizeClassName} ${getReadyStateClassName(instance)} overflow-hidden rounded-md border-2 border-black/25 bg-[color:var(--surface-muted)] shadow-md transition hover:border-[color:var(--accent)] hover:shadow-[0_0_1rem_rgba(241,143,59,0.35)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]`}
        aria-expanded={isActive}
        aria-haspopup={disabled ? undefined : 'menu'}
        aria-disabled={disabled}
      >
        <span className="sr-only">Open {instance.card.name} actions in {getBoardBattlefieldLabel(copy, zone)}</span>
        <span className="relative block h-full w-full">
          {instance.faceDown || instance.card.imageSrc ? (
            <Image src={instance.faceDown ? CARD_BACK_IMAGE_SRC : instance.card.imageSrc} alt="" fill sizes={size === 'unit' ? '88px' : '56px'} className="object-cover" />
          ) : null}
          <CurrentInfluenceBadge
            instance={instance}
            attachedCards={getAttachedCards(cards, instance.instanceId)}
            cardsDrawnThisTurnByOwner={cardsDrawnThisTurnByOwner}
          />
          <EffectSourceBadges instance={instance} zoneCards={cards} banishOnDeathLabel={getBanishOnDeathLabel(locale)} />
          <DamageBadge instance={instance} />
          <CombatStatsBadge
            instance={instance}
            currentStats={currentCombatStatsByInstanceId[instance.instanceId]}
          />
          <QuarantineProgressBadge instance={instance} />
          <RuinsProgressBadge instance={instance} />
        </span>
      </button>
    );
  }

  function renderTerritoryColumn(label: string, instance: GameCardInstance | null) {
    return (
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] place-items-center gap-0.5">
        <p className="truncate text-[0.58rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">
          {label}
        </p>
        {renderSlot(instance, null, 'territory')}
      </div>
    );
  }

  return (
    <section className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-visible rounded-lg border border-[color:var(--accent)]/35 bg-[radial-gradient(circle_at_50%_0%,rgba(241,143,59,0.14),transparent_48%),linear-gradient(180deg,rgba(55,42,32,0.92),rgba(30,27,25,0.86))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,226,183,0.08),0_0.75rem_1.35rem_rgba(0,0,0,0.18)]" data-battlefield-zone={zone}>
      <CardZoomPreview
        cards={previewCards}
        interactive
        side={zone === 'battlefieldRight' ? 'center' : 'right'}
        onMouseEnter={cancelPreviewClear}
        onMouseLeave={() => {
          cancelPreviewClear();
          setPreviewCards(null);
        }}
      />
      <p className="truncate text-center text-[0.7rem] font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
        {getBoardBattlefieldLabel(copy, zone)}
        {zoneControlLabel ? (
          <>
            {' ('}
            <span className={zoneController === 'player' ? 'text-emerald-400' : 'text-red-400'}>
              {zoneControlLabel}
            </span>
            {')'}
          </>
        ) : null}
      </p>
      <div className="grid min-h-0 grid-cols-[minmax(7.25rem,0.86fr)_1px_minmax(0,1fr)_1px_minmax(7.25rem,0.86fr)] items-stretch gap-2 rounded-md border border-[color:var(--border)]/70 bg-[linear-gradient(180deg,rgba(20,18,17,0.38),rgba(0,0,0,0.18))] p-2 shadow-inner">
        {renderTerritoryColumn(copy.yourTerritory, playerTerritory)}
        <div className="my-1 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.25),transparent)]" aria-hidden="true" />
        <div className="flex min-h-0 items-center justify-center overflow-visible">
          <div className="relative flex h-full items-center justify-center overflow-visible">
            {unit ? (
              <div className="absolute left-1/2 top-[5.35rem] z-0 -translate-x-1/2">
                <AttachedEquipmentCards
                  cards={getAttachedCards(cards, unit.instanceId)}
                  cardHeight={isFourKViewport ? 166 : 72}
                  offset={isFourKViewport ? 32 : 24}
                  exposedHeight={isFourKViewport ? 116 : 28}
                  interactive
                  onCardMouseEnter={openEquipmentPreview}
                  onCardMouseLeave={(instance) => schedulePreviewClear(instance.instanceId)}
                />
              </div>
            ) : null}
            {renderSlot(unit, copy.unit, 'unit')}
          </div>
        </div>
        <div className="my-1 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.25),transparent)]" aria-hidden="true" />
        {renderTerritoryColumn(copy.enemyTerritory, opponentTerritory)}
      </div>
      {activeInstance && !disabled && (actions.length > 0 || canActivate || flankingTargets.length > 0) ? (
        <div ref={menuRef} className="absolute left-1/2 top-2 z-40 w-36 -translate-x-1/2 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-2xl">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              onClick={() => handleMove(activeInstance.instanceId, action)}
              disabled={action.disabled}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {action.label}
            </button>
          ))}
          {canActivate ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onActivate?.(activeInstance);
                setActiveInstanceId(null);
                setPreviewCards(null);
              }}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)]"
            >
              {copy.activateAbility}
            </button>
          ) : null}
          {flankingTargets.map((target) => (
            <button
              key={`flanking-${target}`}
              type="button"
              role="menuitem"
              onClick={() => {
                onAttack?.(activeInstance.instanceId, target);
                setActiveInstanceId(null);
                setPreviewCards(null);
              }}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)]"
            >
              {copy.flank(getBoardBattlefieldLabel(copy, target))}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CombinedStagingSupplyPanel({
  stagingCards,
  supplyCards,
  graveyardCards,
  banishCards,
  deckCards,
  compact = false,
  mirror = false,
  onMove,
  onAttack,
  onActivate,
  battlefieldCardsByZone,
  disabled = false,
  temporarySupplyCount = 0,
  canInspectSupplyCards = false,
  currentCombatStatsByInstanceId = {},
  cardsDrawnThisTurnByOwner = { player: 0, opponent: 0 },
  locale = 'en',
}: {
  stagingCards: GameCardInstance[];
  supplyCards: GameCardInstance[];
  graveyardCards: GameCardInstance[];
  banishCards: GameCardInstance[];
  deckCards: GameCardInstance[];
  compact?: boolean;
  mirror?: boolean;
  onMove?: MoveCardHandler;
  onAttack?: AttackBattlefieldHandler;
  onActivate?: ActivateAbilityHandler;
  battlefieldCardsByZone?: Record<BattlefieldZoneId, GameCardInstance[]>;
  disabled?: boolean;
  temporarySupplyCount?: number;
  canInspectSupplyCards?: boolean;
  currentCombatStatsByInstanceId?: CurrentCombatStatsByInstanceId;
  cardsDrawnThisTurnByOwner?: CardsDrawnThisTurnByOwner;
  locale?: Locale;
}) {
  const copy = getPlayBoardCopy(locale);
  const visibleStagingCards = stagingCards.filter(
    (instance) =>
      !instance.attachedToInstanceId ||
      !stagingCards.some((candidate) => candidate.instanceId === instance.attachedToInstanceId)
  );
  const [activeStagingCardId, setActiveStagingCardId] = useState<string | null>(null);
  const [stagingMenuPosition, setStagingMenuPosition] = useState<{
    left: number;
    top: number;
    placement: 'above' | 'below';
  } | null>(null);
  const [previewCards, setPreviewCards] = useState<GameCardInstance[] | null>(null);
  const [isGraveyardOpen, setIsGraveyardOpen] = useState(false);
  const [isBanishOpen, setIsBanishOpen] = useState(false);
  const previewClearTimeoutRef = useRef<number | null>(null);
  const activeStagingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const stagingMenuRef = useRef<HTMLDivElement | null>(null);
  const isFourKViewport = useIsFourKViewport();
  const activeStagingCard = visibleStagingCards.find((instance) => instance.instanceId === activeStagingCardId) ?? null;
  const stagingTargets: BattlefieldZoneId[] = activeStagingCard?.ready && isUnitCard(activeStagingCard.card) && onAttack
    ? ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight']
    : [];
  const canActivateActiveStagingCard = canShowActivatedAbilityAction(activeStagingCard, onActivate);
  const rowsClassName = compact
    ? mirror
      ? 'grid-rows-[minmax(4.6rem,0.38fr)_minmax(7rem,0.66fr)] min-[2560px]:grid-rows-[minmax(5.25rem,0.42fr)_minmax(9.5rem,0.82fr)]'
      : 'grid-rows-[minmax(7rem,0.66fr)_minmax(4.6rem,0.38fr)] min-[2560px]:grid-rows-[minmax(9.5rem,0.82fr)_minmax(5.25rem,0.42fr)]'
    : mirror
      ? 'grid-rows-[minmax(5.1rem,0.4fr)_minmax(10rem,0.86fr)] min-[2560px]:grid-rows-[minmax(5.75rem,0.44fr)_minmax(12rem,0.86fr)]'
      : 'grid-rows-[minmax(10rem,0.86fr)_minmax(5.1rem,0.4fr)] min-[2560px]:grid-rows-[minmax(12rem,0.86fr)_minmax(5.75rem,0.44fr)]';
  const stagingCardClassName = compact ? 'h-[5.6rem] min-[2560px]:h-[min(8rem,100%)]' : 'h-[7.5rem] min-[2560px]:h-[min(10.75rem,100%)]';
  const exhaustedStagingWidthClassName = compact ? 'w-[5.6rem] min-[2560px]:w-[8rem]' : 'w-[7.5rem] min-[2560px]:w-[10.75rem]';
  const stagingAttachmentPaddingClassName = compact ? 'pb-10 min-[2560px]:pb-16' : 'pb-9 min-[2560px]:pb-24';
  const stagingAttachmentTopClassName = compact ? 'top-[2.1rem] min-[2560px]:top-[2.8rem]' : 'top-[5.35rem] min-[2560px]:top-[3.9rem]';
  const stagingAttachmentSizes = isFourKViewport
    ? compact
      ? { cardHeight: 112, offset: 24, exposedHeight: 28 }
      : { cardHeight: 146, offset: 30, exposedHeight: 40 }
    : compact
      ? { cardHeight: 64, offset: 17, exposedHeight: 20 }
      : { cardHeight: 72, offset: 24, exposedHeight: 28 };
  const panelToneClassName = 'border-[color:var(--accent)]/24 bg-[radial-gradient(circle_at_50%_0%,rgba(241,143,59,0.10),transparent_42%),linear-gradient(180deg,rgba(54,48,42,0.78),rgba(30,28,26,0.72))]';
  const stagingToneClassName = 'border-[color:var(--border)]/70 bg-[linear-gradient(180deg,rgba(255,226,183,0.045),rgba(0,0,0,0.13))]';
  const visibleTemporarySupplyCount = Math.max(0, Math.floor(temporarySupplyCount));
  const totalSupplyCount = supplyCards.length + visibleTemporarySupplyCount;

  function closeStagingMenu() {
    setActiveStagingCardId(null);
    setStagingMenuPosition(null);
  }

  useEffect(() => {
    return () => {
      if (previewClearTimeoutRef.current !== null) {
        window.clearTimeout(previewClearTimeoutRef.current);
      }
    };
  }, []);

  function cancelPreviewClear() {
    if (previewClearTimeoutRef.current !== null) {
      window.clearTimeout(previewClearTimeoutRef.current);
      previewClearTimeoutRef.current = null;
    }
  }

  function openPreview(instance: GameCardInstance, attachedItems: GameCardInstance[]) {
    cancelPreviewClear();
    setPreviewCards([instance, ...attachedItems]);
  }

  function openEquipmentPreview(instance: GameCardInstance) {
    cancelPreviewClear();
    setPreviewCards([instance]);
  }

  function openSupplyPreview(instance: GameCardInstance) {
    cancelPreviewClear();
    setPreviewCards([{ ...instance, faceDown: false }]);
  }

  function schedulePreviewClear(instanceId: string) {
    cancelPreviewClear();
    previewClearTimeoutRef.current = window.setTimeout(() => {
      setPreviewCards((current) => (current?.[0]?.instanceId === instanceId ? null : current));
      previewClearTimeoutRef.current = null;
    }, 120);
  }

  useCloseOnOutsidePointerDown(Boolean((onMove || onAttack || onActivate) && !disabled && activeStagingCard), [activeStagingTriggerRef, stagingMenuRef], closeStagingMenu);

  function handleStagingAttack(instanceId: string, target: ZoneId) {
    if (!onAttack || disabled) {
      return;
    }

    onAttack(instanceId, target);
    setActiveStagingCardId(null);
    setStagingMenuPosition(null);
    cancelPreviewClear();
    setPreviewCards(null);
  }

  return (
    <section className={`relative grid min-h-0 overflow-hidden rounded-lg border bg-[color:var(--surface)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${panelToneClassName}`}>
      <CardZoomPreview
        cards={previewCards}
        interactive
        zIndexClassName={isGraveyardOpen || isBanishOpen ? 'z-[100]' : 'z-50'}
        onMouseEnter={cancelPreviewClear}
        onMouseLeave={() => {
          cancelPreviewClear();
          setPreviewCards(null);
        }}
      />
      <div className={`grid min-h-0 ${rowsClassName} gap-3`}>
        <div className={`grid min-h-0 grid-cols-[minmax(0,1fr)_1px_auto] rounded-md border ${stagingToneClassName} ${mirror ? 'order-2' : 'order-1'}`}>
          <div className="deck-builder-scroll flex min-h-0 items-center gap-3 overflow-x-auto overflow-y-hidden px-3 py-1.5">
            {visibleStagingCards.length === 0 ? (
              <p className="flex h-full w-full items-center justify-center text-center text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                {copy.staging}
              </p>
            ) : (
              visibleStagingCards.map((instance) => {
                const attachedItems = getAttachedCards(stagingCards, instance.instanceId);

                return (
                <div
                  key={instance.instanceId}
                  className={`relative flex h-full flex-none items-center justify-center ${attachedItems.length > 0 ? stagingAttachmentPaddingClassName : ''} ${instance.ready ? '' : exhaustedStagingWidthClassName}`}
                >
                  {attachedItems.length > 0 ? (
                    <div className={`absolute left-1/2 z-0 -translate-x-1/2 ${stagingAttachmentTopClassName}`}>
                      <AttachedEquipmentCards
                        cards={attachedItems}
                        cardHeight={stagingAttachmentSizes.cardHeight}
                        offset={stagingAttachmentSizes.offset}
                        exposedHeight={stagingAttachmentSizes.exposedHeight}
                        interactive
                        onCardMouseEnter={openEquipmentPreview}
                        onCardMouseLeave={(instance) => schedulePreviewClear(instance.instanceId)}
                      />
                    </div>
                  ) : null}
                  <button
                    ref={activeStagingCardId === instance.instanceId ? activeStagingTriggerRef : undefined}
                    type="button"
                    data-card-instance-id={instance.instanceId}
                    onClick={(event) => {
                      if ((!onMove && !onAttack && !onActivate) || disabled) {
                        return;
                      }

                      const nextCardId = activeStagingCardId === instance.instanceId ? null : instance.instanceId;
                      if (!nextCardId) {
                        closeStagingMenu();
                        return;
                      }

                      if (!instance.ready && !canShowActivatedAbilityAction(instance, onActivate)) {
                        closeStagingMenu();
                        return;
                      }

                      const triggerRect = event.currentTarget.getBoundingClientRect();
                      const menuWidth = 208;
                      const menuHalfWidth = menuWidth / 2;
                      const horizontalPadding = 12;
                      const menuItemHeight = 36;
                      const menuVerticalPadding = 8;
                      const abilityActionCount = canShowActivatedAbilityAction(instance, onActivate) ? 1 : 0;
                      const menuHeight = (stagingTargets.length + abilityActionCount) * menuItemHeight + menuVerticalPadding;
                      const viewportWidth = window.innerWidth;
                      const viewportHeight = window.innerHeight;
                      const desiredLeft = triggerRect.left + triggerRect.width / 2;
                      const clampedLeft = Math.min(
                        Math.max(desiredLeft, menuHalfWidth + horizontalPadding),
                        viewportWidth - menuHalfWidth - horizontalPadding
                      );
                      const canOpenAbove = triggerRect.top - 8 >= menuHeight + horizontalPadding;
                      const canOpenBelow = viewportHeight - triggerRect.bottom - 8 >= menuHeight + horizontalPadding;
                      const placement = canOpenAbove || !canOpenBelow ? 'above' : 'below';

                      setActiveStagingCardId(nextCardId);
                      setStagingMenuPosition({
                        left: clampedLeft,
                        top: placement === 'above' ? triggerRect.top - 8 : triggerRect.bottom + 8,
                        placement,
                      });
                    }}
                    onMouseEnter={() => openPreview(instance, attachedItems)}
                    onFocus={() => openPreview(instance, attachedItems)}
                    onMouseLeave={() => schedulePreviewClear(instance.instanceId)}
                    onBlur={() => schedulePreviewClear(instance.instanceId)}
                    className={`relative z-10 aspect-[5/7] ${stagingCardClassName} ${getReadyStateClassName(instance)} overflow-hidden rounded-md border-2 border-black/25 bg-[color:var(--surface-muted)] shadow-lg transition hover:border-[color:var(--accent)] hover:shadow-[0_0_1rem_rgba(241,143,59,0.38)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]`}
                    aria-expanded={activeStagingCardId === instance.instanceId}
                    aria-haspopup={(onMove || onAttack || onActivate) && !disabled ? 'menu' : undefined}
                    aria-disabled={disabled}
                  >
                    {instance.card.imageSrc ? (
                      <Image src={instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                    ) : null}
                    <CurrentInfluenceBadge
                      instance={instance}
                      attachedCards={attachedItems}
                      cardsDrawnThisTurnByOwner={cardsDrawnThisTurnByOwner}
                    />
                    <EffectSourceBadges instance={instance} zoneCards={stagingCards} banishOnDeathLabel={getBanishOnDeathLabel(locale)} />
                    <DamageBadge instance={instance} />
                    <CombatStatsBadge
                      instance={instance}
                      currentStats={currentCombatStatsByInstanceId[instance.instanceId]}
                    />
                  </button>
                </div>
                );
              })
            )}
          </div>
          <div className="min-h-0 bg-[color:var(--border)]/70" aria-hidden="true" />
          <div className="grid min-h-0 w-[4.5rem] grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] place-items-center min-[2560px]:w-20">
            <div className="flex min-h-0 w-[4.5rem] items-center justify-center min-[2560px]:w-20">
              <CompactZoneStack
                label={mirror ? copy.deck : copy.banish}
                cards={mirror ? deckCards : banishCards}
                faceDown={mirror}
                compact
                onClick={mirror ? undefined : () => setIsBanishOpen(true)}
              />
            </div>
            <div className="mx-2 h-px bg-[color:var(--border)]/70" aria-hidden="true" />
            <div className="flex min-h-0 w-[4.5rem] items-center justify-center min-[2560px]:w-20">
              <CompactZoneStack
                label={mirror ? copy.banish : copy.deck}
                cards={mirror ? banishCards : deckCards}
                faceDown={!mirror}
                compact
                onClick={mirror ? () => setIsBanishOpen(true) : undefined}
              />
            </div>
          </div>
        </div>
        <div className={`relative flex min-h-0 flex-col rounded-md border border-[color:var(--border)]/70 bg-black/10 ${mirror ? 'order-1' : 'order-2'}`}>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_1px_auto] py-3 pl-3 pr-0">
            <div className="relative min-h-0 pr-3">
              <span
                className="absolute right-5 top-0 z-10 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white shadow-sm"
                aria-label={`${totalSupplyCount} total supply${visibleTemporarySupplyCount > 0 ? `, including ${visibleTemporarySupplyCount} temporary` : ''}`}
              >
                {totalSupplyCount}
              </span>
              <div className="deck-builder-scroll flex h-full min-h-0 items-center gap-2 overflow-x-auto overflow-y-hidden pr-10">
              {totalSupplyCount === 0 ? (
                <p className="flex h-full w-full items-center justify-center text-center text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {copy.supply}
                </p>
              ) : (
                <>
                  {Array.from({ length: visibleTemporarySupplyCount }, (_, index) => (
                    <div
                      key={`temporary-supply-${index}`}
                      className="flex h-16 w-16 flex-none items-center justify-center min-[2560px]:h-20 min-[2560px]:w-20"
                      data-temporary-supply
                    >
                      <div
                        className="relative flex aspect-[5/7] h-16 flex-col items-center justify-center overflow-hidden rounded-md border-2 border-amber-200/80 bg-amber-600 text-white shadow-md shadow-amber-950/30 min-[2560px]:h-20"
                        title="Temporary supply"
                        aria-label={`Temporary supply ${index + 1} of ${visibleTemporarySupplyCount}`}
                      >
                        <span className="text-lg font-black leading-none">+1</span>
                        <span className="mt-1 text-[0.48rem] font-black uppercase leading-none">{copy.supply}</span>
                      </div>
                    </div>
                  ))}
                  {supplyCards.map((instance) => (
                    <div
                      key={instance.instanceId}
                      className="flex h-16 w-16 flex-none items-center justify-center min-[2560px]:h-20 min-[2560px]:w-20"
                      aria-hidden={canInspectSupplyCards ? undefined : 'true'}
                    >
                      {canInspectSupplyCards ? (
                        <button
                          type="button"
                          className={`relative aspect-[5/7] h-16 min-[2560px]:h-20 ${getReadyStateClassName(instance)} overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]`}
                          aria-label={`Inspect supply card ${instance.card.name}`}
                          onMouseEnter={() => openSupplyPreview(instance)}
                          onFocus={() => openSupplyPreview(instance)}
                          onMouseLeave={() => schedulePreviewClear(instance.instanceId)}
                          onBlur={() => schedulePreviewClear(instance.instanceId)}
                        >
                          <Image src={CARD_BACK_IMAGE_SRC} alt="" fill sizes="56px" className="object-cover" />
                        </button>
                      ) : (
                        <div className={`relative aspect-[5/7] h-16 min-[2560px]:h-20 ${getReadyStateClassName(instance)} overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md`}>
                          <Image src={CARD_BACK_IMAGE_SRC} alt="" fill sizes="56px" className="object-cover" />
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
              </div>
            </div>
            <div className="min-h-0 bg-[color:var(--border)]/70" aria-hidden="true" />
            <div className="flex min-h-0 w-[4.5rem] items-center justify-center px-0 min-[2560px]:w-20">
              <CompactZoneStack label={copy.graveyard} cards={graveyardCards} compact onClick={() => setIsGraveyardOpen(true)} />
            </div>
          </div>
        </div>
        {activeStagingCard && stagingMenuPosition && (onAttack || onActivate) && !disabled ? (
          <div
            ref={stagingMenuRef}
            className={`fixed z-[80] w-52 -translate-x-1/2 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-2xl ${
              stagingMenuPosition.placement === 'above' ? '-translate-y-full' : ''
            }`}
            style={{
              left: `${stagingMenuPosition.left}px`,
              top: `${stagingMenuPosition.top}px`,
            }}
          >
            <div className="border-b border-[color:var(--border)]/70 px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">
              {copy.cardActions}
            </div>
            {canActivateActiveStagingCard ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onActivate?.(activeStagingCard);
                  closeStagingMenu();
                  setPreviewCards(null);
                }}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)]"
              >
                {copy.activateAbility}
              </button>
            ) : null}
            {stagingTargets.map((target) => {
              const defender = battlefieldCardsByZone?.[target]?.find((instance) => isUnitCard(instance.card) && getCardController(instance) !== getCardController(activeStagingCard)) ?? null;
              const friendlyOccupant = battlefieldCardsByZone?.[target]?.find((instance) => isUnitCard(instance.card) && getCardController(instance) === getCardController(activeStagingCard)) ?? null;

              return (
                <button
                  key={target}
                  type="button"
                  role="menuitem"
                  onClick={() => handleStagingAttack(activeStagingCard.instanceId, target)}
                  disabled={Boolean(friendlyOccupant)}
                  className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="block">{copy.attack(getBoardBattlefieldLabel(copy, target))}</span>
                  <span className="mt-0.5 block truncate text-[0.65rem] font-medium text-[color:var(--text-secondary)]">
                    {friendlyOccupant ? copy.occupiedBy(friendlyOccupant.card.name) : defender ? copy.defender(defender.card.name) : copy.openBattlefield}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {isGraveyardOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="graveyard-title" className="grid max-h-full w-full max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <div>
                <h2 id="graveyard-title" className="text-sm font-bold uppercase tracking-wide text-[color:var(--text-primary)]">{copy.graveyard}</h2>
                <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">{graveyardCards.length} {graveyardCards.length === 1 ? 'card' : 'cards'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsGraveyardOpen(false);
                  setPreviewCards(null);
                }}
                className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                Close
              </button>
            </header>
            <div className="deck-builder-scroll min-h-0 overflow-y-auto p-4">
              {graveyardCards.length === 0 ? (
                <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-[color:var(--border)] text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {copy.graveyardEmpty}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
                  {graveyardCards.map((instance) => (
                    <article
                      key={instance.instanceId}
                      className="min-w-0"
                      onMouseEnter={() => openEquipmentPreview(instance)}
                      onMouseLeave={() => schedulePreviewClear(instance.instanceId)}
                    >
                      {onMove && !disabled && getCardController(instance) === 'player' && (instance.card.id === 'IMP007' || instance.card.id === 'IMP009') ? (
                        <button
                          type="button"
                          onClick={() => {
                            onMove(instance.instanceId, 'graveyard', 'staging');
                            setIsGraveyardOpen(false);
                            setPreviewCards(null);
                          }}
                          onFocus={() => openEquipmentPreview(instance)}
                          onBlur={() => schedulePreviewClear(instance.instanceId)}
                          className="w-full rounded-md text-left transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                        >
                          <div className="relative aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface-muted)] shadow-md">
                            {instance.card.imageSrc ? (
                              <Image src={instance.faceDown ? CARD_BACK_IMAGE_SRC : instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                            ) : null}
                            <CurrentInfluenceBadge instance={instance} />
                            <CombatStatsBadge instance={instance} />
                          </div>
                          <p className="mt-1 truncate text-center text-[0.65rem] font-semibold text-[color:var(--text-secondary)]" title={instance.card.name}>
                            {instance.card.name}
                          </p>
                        </button>
                      ) : (
                        <>
                          <div className="relative aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface-muted)] shadow-md">
                            {instance.card.imageSrc ? (
                              <Image src={instance.faceDown ? CARD_BACK_IMAGE_SRC : instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                            ) : null}
                            <CurrentInfluenceBadge instance={instance} />
                            <CombatStatsBadge instance={instance} />
                          </div>
                          <p className="mt-1 truncate text-center text-[0.65rem] font-semibold text-[color:var(--text-secondary)]" title={instance.card.name}>
                            {instance.card.name}
                          </p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isBanishOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="banish-title" className="grid max-h-full w-full max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <div>
                <h2 id="banish-title" className="text-sm font-bold uppercase tracking-wide text-[color:var(--text-primary)]">{copy.banish}</h2>
                <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">{banishCards.length} {banishCards.length === 1 ? 'card' : 'cards'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsBanishOpen(false);
                  setPreviewCards(null);
                }}
                className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                Close
              </button>
            </header>
            <div className="deck-builder-scroll min-h-0 overflow-y-auto p-4">
              {banishCards.length === 0 ? (
                <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-[color:var(--border)] text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {copy.banishEmpty}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
                  {banishCards.map((instance) => {
                    const canPlayFromBanish =
                      !mirror &&
                      onMove &&
                      !disabled &&
                      getCardController(instance) === 'player' &&
                      instance.lingyiPlayableFromBanishOnce;

                    return (
                      <article
                        key={instance.instanceId}
                        className="min-w-0"
                        onMouseEnter={() => openEquipmentPreview(instance)}
                        onMouseLeave={() => schedulePreviewClear(instance.instanceId)}
                      >
                        {canPlayFromBanish ? (
                          <button
                            type="button"
                            onClick={() => {
                              onMove(instance.instanceId, 'banish', 'staging');
                              setIsBanishOpen(false);
                              setPreviewCards(null);
                            }}
                            onFocus={() => openEquipmentPreview(instance)}
                            onBlur={() => schedulePreviewClear(instance.instanceId)}
                            className="w-full rounded-md text-left transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                          >
                            <div className="relative aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface-muted)] shadow-md">
                              {instance.card.imageSrc ? (
                                <Image src={instance.faceDown ? CARD_BACK_IMAGE_SRC : instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                              ) : null}
                              <CurrentInfluenceBadge instance={instance} />
                              <CombatStatsBadge instance={instance} />
                            </div>
                            <p className="mt-1 truncate text-center text-[0.65rem] font-semibold text-[color:var(--text-secondary)]" title={instance.card.name}>
                              {instance.card.name}
                            </p>
                            <p className="mt-0.5 text-center text-[0.58rem] font-black uppercase tracking-wide text-[color:var(--accent)]">
                              {copy.playFromBanish}
                            </p>
                          </button>
                        ) : (
                          <>
                            <div className="relative aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface-muted)] shadow-md">
                              {instance.card.imageSrc ? (
                                <Image src={instance.faceDown ? CARD_BACK_IMAGE_SRC : instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                              ) : null}
                              <CurrentInfluenceBadge instance={instance} />
                              <CombatStatsBadge instance={instance} />
                            </div>
                            <p className="mt-1 truncate text-center text-[0.65rem] font-semibold text-[color:var(--text-secondary)]" title={instance.card.name}>
                              {instance.card.name}
                            </p>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function HandStrip({
  cards,
  gameState,
  onMove,
  disabled = false,
  canSupplyFromHand,
  canPlayFromHand,
  friendlyUnitsInPlay,
  graveyardCards,
  readySupplyCount,
  stagingUnits,
  demonicAdvanceActive,
  battlefieldCardsByZone,
  locale = 'en',
}: {
  cards: GameCardInstance[];
  gameState: GameState;
  onMove: MoveCardHandler;
  disabled?: boolean;
  canSupplyFromHand: boolean;
  canPlayFromHand: boolean;
  friendlyUnitsInPlay: GameCardInstance[];
  graveyardCards: GameCardInstance[];
  readySupplyCount: number;
  stagingUnits: GameCardInstance[];
  demonicAdvanceActive: boolean;
  battlefieldCardsByZone: Record<BattlefieldZoneId, GameCardInstance[]>;
  locale?: Locale;
}) {
  const copy = getPlayBoardCopy(locale);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const activeHandTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handMenuRef = useRef<HTMLDivElement | null>(null);
  const activeInstance = cards.find((instance) => instance.instanceId === activeCardId) ?? null;
  const handActions = activeInstance
    ? getHandActions(activeInstance, {
        canSupplyFromHand,
        canPlayFromHand,
        gameState,
        graveyardCards,
        handCards: cards,
        friendlyUnitsInPlay,
        readySupplyCount,
        stagingUnits,
        demonicAdvanceActive,
        battlefieldCardsByZone,
        locale,
      })
    : [];
  const activeCardDisplay = activeInstance ? getLocalizedCardDisplay(locale, activeInstance.card) : null;

  useCloseOnOutsidePointerDown(activeInstance !== null, [activeHandTriggerRef, handMenuRef], closeHandMenu);

  function closeHandMenu() {
    setActiveCardId(null);
    setPreviewCard(null);
  }

  function handleMove(action: HandAction) {
    if (!activeInstance || disabled || action.disabled) {
      closeHandMenu();
      return;
    }

    onMove(activeInstance.instanceId, 'hand', action.target, action.options);
    closeHandMenu();
  }

  return (
    <section className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pt-2 xl:left-[13.5rem] xl:right-4">
      {activeInstance ? (
        <div ref={handMenuRef} className="pointer-events-auto absolute bottom-[5.75rem] left-1/2 z-50 w-[min(94vw,32rem)] -translate-x-1/2 overflow-hidden rounded-xl border-2 border-[color:var(--accent)] bg-[color:var(--surface)] shadow-2xl shadow-black/40">
          <button
            type="button"
            onClick={closeHandMenu}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-lg font-semibold text-white transition hover:bg-black/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label={copy.closeCardActions}
          >
            ×
          </button>
          <div className="p-5">
            <div className="min-w-0 pr-8">
              <div className="rounded-lg bg-[color:var(--surface-muted)]/70 px-4 py-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-semibold text-[color:var(--text-primary)]">{activeCardDisplay?.name ?? activeInstance.card.name}</h3>
                    <p className="mt-1 truncate text-sm font-semibold text-[color:var(--text-secondary)]">
                      {activeCardDisplay?.typeLabel ?? (activeInstance.card.subtype || activeInstance.card.type)}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-base font-bold text-[color:var(--text-on-accent)]">
                    {activeInstance.card.cost}
                  </span>
                </div>
              </div>
              {activeCardDisplay?.rulesText || activeCardDisplay?.description ? (
                <div className="mt-3 max-h-28 overflow-y-auto rounded-md border border-[color:var(--border)] bg-[color:var(--background)]/55 px-3 py-2 text-sm text-[color:var(--text-primary)]">
                  {activeCardDisplay?.rulesText ? <p>{activeCardDisplay.rulesText}</p> : null}
                  {activeCardDisplay?.description ? <p className="mt-2 italic text-[color:var(--text-secondary)]">{activeCardDisplay.description}</p> : null}
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {handActions.map((action) => {
                  return (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => handleMove(action)}
                      disabled={disabled || action.disabled}
                      className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)]/15 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[color:var(--border)] disabled:hover:bg-[color:var(--surface-muted)]"
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <CardZoomPreview card={previewCard} />
      {cards.length === 0 ? (
        <p className="mx-auto translate-y-4 max-w-4xl rounded-md border border-dashed border-[color:var(--border)] px-3 py-4 text-center text-sm text-[color:var(--text-secondary)]">
          {copy.emptyHand}
        </p>
      ) : (
        <div className="mx-auto flex h-28 max-w-4xl items-end justify-center overflow-visible px-2 pb-0">
          {cards.map((instance, index) => {
            const midpoint = (cards.length - 1) / 2;
            const offsetFromCenter = index - midpoint;
            const rotation = Math.max(-10, Math.min(10, offsetFromCenter * 2.8));
            const verticalOffset = Math.min(10, Math.abs(offsetFromCenter) * 1.4);
            const handCardStyle = {
              '--hand-card-y': `${62 + verticalOffset}px`,
              '--hand-card-rotation': `${rotation}deg`,
              transformOrigin: '50% 115%',
            } as CSSProperties;

            return (
            <article
              key={instance.instanceId}
              className="relative flex w-16 flex-none justify-center hover:z-40"
              style={{ zIndex: activeCardId === instance.instanceId ? 30 : index + 1 }}
            >
              <button
                ref={activeCardId === instance.instanceId ? activeHandTriggerRef : undefined}
                type="button"
                onClick={() => !disabled && setActiveCardId((current) => (current === instance.instanceId ? null : instance.instanceId))}
                onMouseEnter={() => setPreviewCard(instance.card)}
                onFocus={() => setPreviewCard(instance.card)}
                onMouseLeave={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
                onBlur={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
                className="pointer-events-auto group flex w-28 origin-bottom translate-y-[var(--hand-card-y)] rotate-[var(--hand-card-rotation)] transform-gpu rounded-md transition-transform duration-200 hover:translate-y-6 hover:rotate-0 hover:scale-110 focus:outline-none focus-visible:translate-y-6 focus-visible:rotate-0 focus-visible:scale-110"
                style={handCardStyle}
                aria-expanded={activeCardId === instance.instanceId}
                aria-haspopup={disabled ? undefined : 'menu'}
                aria-disabled={disabled}
              >
                <span
                  className={`relative aspect-[5/7] w-28 overflow-hidden rounded-md border-2 bg-[color:var(--surface-muted)] shadow-xl shadow-black/30 transition-[border-color,box-shadow,transform] duration-200 group-hover:border-[color:var(--accent)] group-hover:shadow-[0_0_1rem_rgba(241,143,59,0.45)] group-focus-visible:border-[color:var(--accent)] ${
                    activeCardId === instance.instanceId
                      ? 'border-[color:var(--accent)] ring-4 ring-[color:var(--accent)]/45'
                      : 'border-black/25'
                  }`}
                >
                  {instance.card.imageSrc ? (
                    <Image src={instance.card.imageSrc} alt="" fill sizes="112px" className="object-cover" />
                  ) : null}
                  <CurrentInfluenceBadge instance={instance} />
                  <CombatStatsBadge instance={instance} />
                  {instance.solaraRevealedFromDeckUntilTurn !== undefined ? (
                    <span
                      className="absolute left-1 top-1 rounded bg-amber-300/95 px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-wide text-black shadow shadow-black/40"
                      aria-label={`${instance.card.name} can be played or supplied until end of turn`}
                      title="Revealed by Solara: play it or use it to extend supply this turn"
                    >
                      EOT
                    </span>
                  ) : null}
                </span>
              </button>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

