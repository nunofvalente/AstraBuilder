'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { Card } from '../create/deck-builder/types';
import {
  getAttachedCards,
  getCardController,
  getCurrentUnitInfluence,
  getPlayCost,
  isTerritoryCard,
  isUnitCard,
  type GameCardInstance,
  type Owner,
  type ZoneId,
} from './game-rules';
import {
  CARD_BACK_IMAGE_SRC,
  ZONE_LABELS,
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

export type BattlefieldZoneId = 'battlefieldLeft' | 'battlefieldCenter' | 'battlefieldRight';
type AttackBattlefieldHandler = (attackerInstanceId: string, targetZone: ZoneId) => void;
type ActivateAbilityHandler = (source: GameCardInstance) => void;
type CardsDrawnThisTurnByOwner = Record<Owner, number>;
export type AttackArrowState = {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
};
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

export function InfluenceBonusBadge({ instance }: { instance: GameCardInstance }) {
  const bonus = Number(instance.temporaryInfluenceBonus ?? 0);

  if (!isUnitCard(instance.card) || !Number.isFinite(bonus) || bonus <= 0) {
    return null;
  }

  return (
    <span
      className="absolute left-1 top-1 z-20 rounded-full border border-emerald-200/70 bg-emerald-700/95 px-1.5 py-0.5 text-[0.56rem] font-black leading-none text-white shadow-md"
      title={`+${bonus} influence`}
    >
      +{bonus} INF
    </span>
  );
}

export function CurrentInfluenceBadge({
  instance,
  attachedCards,
  cardsDrawnThisTurnByOwner,
}: {
  instance: GameCardInstance;
  attachedCards: GameCardInstance[];
  cardsDrawnThisTurnByOwner: CardsDrawnThisTurnByOwner;
}) {
  if (!isUnitCard(instance.card) || instance.card.id !== 'IMP019') {
    return null;
  }

  const influence = getCurrentUnitInfluence(instance, attachedCards, cardsDrawnThisTurnByOwner[getCardController(instance)]);

  return (
    <span
      className="absolute bottom-1 left-1 z-20 rounded-full border border-sky-100/70 bg-sky-700/95 px-1.5 py-0.5 text-[0.56rem] font-black leading-none text-white shadow-md"
      title={`Current influence: ${influence}`}
    >
      INF {influence}
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
  disabled = false,
  canFlipFaceUp = false,
  readySupplyCount = 0,
  cardsDrawnThisTurnByOwner = { player: 0, opponent: 0 },
}: {
  zone: ZoneId;
  cards: GameCardInstance[];
  onMove: MoveCardHandler;
  onActivate?: ActivateAbilityHandler;
  disabled?: boolean;
  canFlipFaceUp?: boolean;
  readySupplyCount?: number;
  cardsDrawnThisTurnByOwner?: CardsDrawnThisTurnByOwner;
}) {
  const unit = cards.find((instance) => isUnitCard(instance.card)) ?? null;
  const zoneControlLabel = unit ? (getCardController(unit) === 'player' ? 'Captured' : 'Lost') : null;
  const playerTerritory = cards.find((instance) => instance.owner === 'player' && isTerritoryCard(instance.card)) ?? null;
  const opponentTerritory = cards.find((instance) => instance.owner === 'opponent' && isTerritoryCard(instance.card)) ?? null;
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const activeInstance = cards.find((instance) => instance.instanceId === activeInstanceId) ?? null;
  const [previewCards, setPreviewCards] = useState<GameCardInstance[] | null>(null);
  const previewClearTimeoutRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const actions = activeInstance
    ? getBattlefieldActions(zone, activeInstance, {
        canFlipFaceUp: canFlipFaceUp && readySupplyCount >= getPlayCost(activeInstance.card),
      })
    : [];
  const canActivate =
    activeInstance &&
    getCardController(activeInstance) === 'player' &&
    (
      (activeInstance.card.id === 'IMP001' && !activeInstance.ready) ||
      (activeInstance.card.id === 'IMP016' && activeInstance.ready)
    ) &&
    Boolean(onActivate);

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
    const sizeClassName = size === 'unit' ? 'h-[min(11rem,100%)]' : 'h-[min(10.25rem,100%)]';
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
        <span className="sr-only">Open {instance.card.name} actions in {ZONE_LABELS[zone]}</span>
        <span className="relative block h-full w-full">
          {instance.faceDown || instance.card.imageSrc ? (
            <Image src={instance.faceDown ? CARD_BACK_IMAGE_SRC : instance.card.imageSrc} alt="" fill sizes={size === 'unit' ? '88px' : '56px'} className="object-cover" />
          ) : null}
          <InfluenceBonusBadge instance={instance} />
          <CurrentInfluenceBadge
            instance={instance}
            attachedCards={getAttachedCards(cards, instance.instanceId)}
            cardsDrawnThisTurnByOwner={cardsDrawnThisTurnByOwner}
          />
          <DamageBadge instance={instance} />
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
        onMouseEnter={cancelPreviewClear}
        onMouseLeave={() => {
          cancelPreviewClear();
          setPreviewCards(null);
        }}
      />
      <p className="truncate text-center text-[0.7rem] font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
        {ZONE_LABELS[zone]}{zoneControlLabel ? ` (${zoneControlLabel})` : ''}
      </p>
      <div className="grid min-h-0 grid-cols-[minmax(7.25rem,0.86fr)_1px_minmax(0,1fr)_1px_minmax(7.25rem,0.86fr)] items-stretch gap-2 rounded-md border border-[color:var(--border)]/70 bg-[linear-gradient(180deg,rgba(20,18,17,0.38),rgba(0,0,0,0.18))] p-2 shadow-inner">
        {renderTerritoryColumn('Your territory', playerTerritory)}
        <div className="my-1 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.25),transparent)]" aria-hidden="true" />
        <div className="flex min-h-0 items-center justify-center overflow-visible">
          <div className="relative flex h-full items-center justify-center overflow-visible">
            {unit ? (
              <div className="absolute left-1/2 top-[5.2rem] z-0 -translate-x-1/2">
                <AttachedEquipmentCards
                  cards={getAttachedCards(cards, unit.instanceId)}
                  cardHeight={166}
                  offset={32}
                  exposedHeight={116}
                  interactive
                  onCardMouseEnter={openEquipmentPreview}
                  onCardMouseLeave={(instance) => schedulePreviewClear(instance.instanceId)}
                />
              </div>
            ) : null}
            {renderSlot(unit, 'Unit', 'unit')}
          </div>
        </div>
        <div className="my-1 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.25),transparent)]" aria-hidden="true" />
        {renderTerritoryColumn('Enemy territory', opponentTerritory)}
      </div>
      {activeInstance && !disabled && (actions.length > 0 || canActivate) ? (
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
              Activate ability
            </button>
          ) : null}
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
  cardsDrawnThisTurnByOwner = { player: 0, opponent: 0 },
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
  cardsDrawnThisTurnByOwner?: CardsDrawnThisTurnByOwner;
}) {
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
  const previewClearTimeoutRef = useRef<number | null>(null);
  const activeStagingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const stagingMenuRef = useRef<HTMLDivElement | null>(null);
  const activeStagingCard = visibleStagingCards.find((instance) => instance.instanceId === activeStagingCardId) ?? null;
  const stagingTargets: BattlefieldZoneId[] = activeStagingCard?.ready && isUnitCard(activeStagingCard.card) && onAttack
    ? ['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight']
    : [];
  const canActivateActiveStagingCard =
    activeStagingCard &&
    getCardController(activeStagingCard) === 'player' &&
    (
      (activeStagingCard.card.id === 'IMP001' && !activeStagingCard.ready) ||
      (activeStagingCard.card.id === 'IMP016' && activeStagingCard.ready)
    ) &&
    Boolean(onActivate);
  const rowsClassName = compact
    ? mirror
      ? 'grid-rows-[minmax(5.25rem,0.42fr)_minmax(9.5rem,0.82fr)]'
      : 'grid-rows-[minmax(9.5rem,0.82fr)_minmax(5.25rem,0.42fr)]'
    : mirror
      ? 'grid-rows-[minmax(5.75rem,0.44fr)_minmax(12rem,0.86fr)]'
      : 'grid-rows-[minmax(12rem,0.86fr)_minmax(5.75rem,0.44fr)]';
  const stagingCardClassName = compact ? 'h-[min(8rem,100%)]' : 'h-[min(10.75rem,100%)]';
  const panelToneClassName = 'border-[color:var(--accent)]/24 bg-[radial-gradient(circle_at_50%_0%,rgba(241,143,59,0.10),transparent_42%),linear-gradient(180deg,rgba(54,48,42,0.78),rgba(30,28,26,0.72))]';
  const stagingToneClassName = 'border-[color:var(--border)]/70 bg-[linear-gradient(180deg,rgba(255,226,183,0.045),rgba(0,0,0,0.13))]';

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
        zIndexClassName={isGraveyardOpen ? 'z-[100]' : 'z-50'}
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
                Staging
              </p>
            ) : (
              visibleStagingCards.map((instance) => {
                const attachedItems = getAttachedCards(stagingCards, instance.instanceId);

                return (
                <div
                  key={instance.instanceId}
                  className={`relative flex h-full flex-none items-center justify-center ${attachedItems.length > 0 ? compact ? 'pb-16' : 'pb-24' : ''} ${instance.ready ? '' : compact ? 'w-[8rem]' : 'w-[10.75rem]'}`}
                >
                  {attachedItems.length > 0 ? (
                    <div className={`absolute left-1/2 z-0 -translate-x-1/2 ${compact ? 'top-[2.8rem]' : 'top-[3.9rem]'}`}>
                      <AttachedEquipmentCards
                        cards={attachedItems}
                        cardHeight={compact ? 112 : 146}
                        offset={compact ? 24 : 30}
                        exposedHeight={compact ? 28 : 40}
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

                      if (
                        !instance.ready &&
                        !(instance.card.id === 'IMP001' && onActivate)
                      ) {
                        closeStagingMenu();
                        return;
                      }

                      const triggerRect = event.currentTarget.getBoundingClientRect();
                      const menuWidth = 208;
                      const menuHalfWidth = menuWidth / 2;
                      const horizontalPadding = 12;
                      const menuItemHeight = 36;
                      const menuVerticalPadding = 8;
                      const abilityActionCount =
                        (
                          (instance.card.id === 'IMP001' && !instance.ready) ||
                          (instance.card.id === 'IMP016' && instance.ready)
                        ) &&
                        onActivate
                          ? 1
                          : 0;
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
                    <InfluenceBonusBadge instance={instance} />
                    <CurrentInfluenceBadge
                      instance={instance}
                      attachedCards={attachedItems}
                      cardsDrawnThisTurnByOwner={cardsDrawnThisTurnByOwner}
                    />
                    <DamageBadge instance={instance} />
                  </button>
                </div>
                );
              })
            )}
          </div>
          <div className="min-h-0 bg-[color:var(--border)]/70" aria-hidden="true" />
          <div className="grid min-h-0 w-20 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] place-items-center">
            <div className="flex min-h-0 w-20 items-center justify-center">
              <CompactZoneStack label="Banish" cards={banishCards} />
            </div>
            <div className="mx-2 h-px bg-[color:var(--border)]/70" aria-hidden="true" />
            <div className="flex min-h-0 w-20 items-center justify-center">
              <CompactZoneStack label="Deck" cards={deckCards} faceDown />
            </div>
          </div>
        </div>
        <div className={`relative flex min-h-0 flex-col rounded-md border border-[color:var(--border)]/70 bg-black/10 ${mirror ? 'order-1' : 'order-2'}`}>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_1px_auto] py-3 pl-3 pr-0">
            <div className="relative min-h-0 pr-3">
              <span className="absolute right-5 top-0 z-10 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                {supplyCards.length}
              </span>
              <div className="deck-builder-scroll flex h-full min-h-0 items-center gap-2 overflow-x-auto overflow-y-hidden pr-10">
              {supplyCards.length === 0 ? (
                <p className="flex h-full w-full items-center justify-center text-center text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  Supply
                </p>
              ) : (
                supplyCards.map((instance) => (
                  <div
                    key={instance.instanceId}
                    className="flex h-20 w-20 flex-none items-center justify-center"
                    aria-hidden="true"
                  >
                    <div className={`relative aspect-[5/7] h-20 ${getReadyStateClassName(instance)} overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md`}>
                      <Image src={CARD_BACK_IMAGE_SRC} alt="" fill sizes="56px" className="object-cover" />
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>
            <div className="min-h-0 bg-[color:var(--border)]/70" aria-hidden="true" />
            <div className="flex min-h-0 w-20 items-center justify-center px-0">
              <CompactZoneStack label="Graveyard" cards={graveyardCards} onClick={() => setIsGraveyardOpen(true)} />
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
              Card actions
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
                Activate ability
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
                  <span className="block">Attack {ZONE_LABELS[target]}</span>
                  <span className="mt-0.5 block truncate text-[0.65rem] font-medium text-[color:var(--text-secondary)]">
                    {friendlyOccupant ? `Occupied by ${friendlyOccupant.card.name}` : defender ? `Defender: ${defender.card.name}` : 'Open battlefield'}
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
                <h2 id="graveyard-title" className="text-sm font-bold uppercase tracking-wide text-[color:var(--text-primary)]">Graveyard</h2>
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
                  Graveyard is empty
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
    </section>
  );
}

export function HandStrip({
  cards,
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
}: {
  cards: GameCardInstance[];
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
}) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const activeHandTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handMenuRef = useRef<HTMLDivElement | null>(null);
  const activeInstance = cards.find((instance) => instance.instanceId === activeCardId) ?? null;
  const handActions = activeInstance
    ? getHandActions(activeInstance, {
        canSupplyFromHand,
        canPlayFromHand,
        graveyardCards,
        handCards: cards,
        friendlyUnitsInPlay,
        readySupplyCount,
        stagingUnits,
        demonicAdvanceActive,
        battlefieldCardsByZone,
      })
    : [];

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
    <section className="fixed inset-x-0 bottom-0 z-40 px-3 pt-2 xl:left-[13.5rem] xl:right-4">
      {activeInstance ? (
        <div ref={handMenuRef} className="absolute bottom-[5.75rem] left-1/2 z-50 w-[min(94vw,32rem)] -translate-x-1/2 overflow-hidden rounded-xl border-2 border-[color:var(--accent)] bg-[color:var(--surface)] shadow-2xl shadow-black/40">
          <button
            type="button"
            onClick={closeHandMenu}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-lg font-semibold text-white transition hover:bg-black/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label="Close card actions"
          >
            ×
          </button>
          <div className="p-5">
            <div className="min-w-0 pr-8">
              <div className="rounded-lg bg-[color:var(--surface-muted)]/70 px-4 py-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-semibold text-[color:var(--text-primary)]">{activeInstance.card.name}</h3>
                    <p className="mt-1 truncate text-sm font-semibold text-[color:var(--text-secondary)]">
                      {activeInstance.card.subtype || activeInstance.card.type}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-base font-bold text-[color:var(--text-on-accent)]">
                    {activeInstance.card.cost}
                  </span>
                </div>
              </div>
              {activeInstance.card.rulesText || activeInstance.card.description ? (
                <div className="mt-3 max-h-28 overflow-y-auto rounded-md border border-[color:var(--border)] bg-[color:var(--background)]/55 px-3 py-2 text-sm text-[color:var(--text-primary)]">
                  {activeInstance.card.rulesText ? <p>{activeInstance.card.rulesText}</p> : null}
                  {activeInstance.card.description ? <p className="mt-2 italic text-[color:var(--text-secondary)]">{activeInstance.card.description}</p> : null}
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
          Draw cards to fill your hand.
        </p>
      ) : (
        <div className="mx-auto flex h-28 max-w-4xl items-end justify-center overflow-visible px-2 pb-0">
          {cards.map((instance, index) => {
            const midpoint = (cards.length - 1) / 2;
            const offsetFromCenter = index - midpoint;
            const rotation = Math.max(-12, Math.min(12, offsetFromCenter * 3.2));
            const verticalOffset = Math.min(10, Math.abs(offsetFromCenter) * 1.4);
            const handCardStyle = {
              '--hand-card-y': `${62 + verticalOffset}px`,
              '--hand-card-rotation': `${rotation}deg`,
              transformOrigin: '50% 115%',
            } as CSSProperties;

            return (
            <article
              key={instance.instanceId}
              className="relative flex w-16 flex-none justify-center"
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
                className="group flex w-28 translate-y-[var(--hand-card-y)] rotate-[var(--hand-card-rotation)] rounded-md focus:outline-none transition-transform duration-200 hover:translate-y-6 hover:rotate-0 focus-visible:translate-y-6 focus-visible:rotate-0"
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

