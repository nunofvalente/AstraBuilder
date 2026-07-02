'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Bot, ChevronsRight, Flag, Hand, Layers, Play, RotateCcw, Swords, Users } from 'lucide-react';

import type { Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { Card } from '../create/deck-builder/types';
import { getBotBattlefieldAttackChoice } from './bot-policy';
import { applyPlayerCardAction } from './game-actions';
import { BOT_TURN_STEPS, applyBotTurnStep, playFirstBotCounter } from './game-bot';
import {
  BATTLEFIELD_ZONES,
  addLogEntry,
  advanceToNextTurn,
  buildInitialGameState,
  canManuallySupplyFromHand,
  createLogEntry,
  declareBattlefieldAttack,
  getAttachedCards,
  getCounterPlayError,
  getPlayCost,
  getReadySupplyCount,
  getStagingUnitCards,
  isItemCard,
  isTerritoryCard,
  isUnitCard,
  passCounterPriority,
  playCounterCard,
  resolveBattlefieldAttack,
  rollFirstPlayer,
  shuffleCards,
  startGameAfterSetup,
  type GameCardInstance,
  type GameState,
  type PrivateZones,
  type SavedDeck,
  type ZoneId,
} from './game-rules';
import {
  BOT_TURN_STEP_DELAY_MS,
  CARD_BACK_IMAGE_SRC,
  MATCH_SESSION_STORAGE_KEY,
  ZONE_LABELS,
  getBattlefieldActions,
  getHandActions,
  mapDeckRows,
  type BattlefieldAction,
  type DeckRow,
  type HandAction,
  type MoveCardHandler,
  type MoveCardOptions,
} from './game-client-support';
import {
  ActionLogList,
  AttachedEquipmentCards,
  CardZoomPreview,
  CompactZoneStack,
  VictoryPointScoreControl,
  OpponentHandStrip,
  RequiredActionToast,
  getReadyStateClassName,
  useCloseOnOutsidePointerDown,
} from './game-client-ui';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'auth' | 'error';
type PlayMode = 'matchmaking' | 'lobby' | 'practice';
type PlayQueue = 'ranked' | 'casual';
type BattlefieldZoneId = 'battlefieldLeft' | 'battlefieldCenter' | 'battlefieldRight';
type AttackBattlefieldHandler = (attackerInstanceId: string, targetZone: ZoneId) => void;
type AttackArrowState = {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

function DamageBadge({ instance }: { instance: GameCardInstance }) {
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

function AttackArrowOverlay({ arrow }: { arrow: AttackArrowState }) {
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

export type GameClientProps = {
  locale: Locale;
  initialCards: Card[];
  initialError: string | null;
  initialMode?: 'lobby' | 'match';
};

type MatchSessionPayload = {
  deckId: string;
  botDeckId: string | null;
  mode?: 'practice' | 'multiplayer';
};

function BattlefieldPanel({
  zone,
  cards,
  onMove,
  disabled = false,
  canFlipFaceUp = false,
  readySupplyCount = 0,
}: {
  zone: ZoneId;
  cards: GameCardInstance[];
  onMove: MoveCardHandler;
  disabled?: boolean;
  canFlipFaceUp?: boolean;
  readySupplyCount?: number;
}) {
  const unit = cards.find((instance) => isUnitCard(instance.card)) ?? null;
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
    setPreviewCards([instance, ...getAttachedCards(cards, instance.instanceId)]);
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
        {ZONE_LABELS[zone]}
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
      {activeInstance && !disabled && actions.length > 0 ? (
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
        </div>
      ) : null}
    </section>
  );
}

function CombinedStagingSupplyPanel({
  stagingCards,
  supplyCards,
  graveyardCards,
  banishCards,
  deckCards,
  compact = false,
  mirror = false,
  onMove,
  onAttack,
  battlefieldCardsByZone,
  disabled = false,
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
  battlefieldCardsByZone?: Record<BattlefieldZoneId, GameCardInstance[]>;
  disabled?: boolean;
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

  useCloseOnOutsidePointerDown(Boolean((onMove || onAttack) && !disabled && activeStagingCard), [activeStagingTriggerRef, stagingMenuRef], closeStagingMenu);

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
                      if ((!onMove && !onAttack) || disabled) {
                        return;
                      }

                      const nextCardId = activeStagingCardId === instance.instanceId ? null : instance.instanceId;
                      if (!nextCardId) {
                        closeStagingMenu();
                        return;
                      }

                      if (!instance.ready) {
                        closeStagingMenu();
                        return;
                      }

                      const triggerRect = event.currentTarget.getBoundingClientRect();
                      const menuWidth = 208;
                      const menuHalfWidth = menuWidth / 2;
                      const horizontalPadding = 12;
                      const menuItemHeight = 36;
                      const menuVerticalPadding = 8;
                      const menuHeight = stagingTargets.length * menuItemHeight + menuVerticalPadding;
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
                    aria-haspopup={(onMove || onAttack) && !disabled ? 'menu' : undefined}
                    aria-disabled={disabled}
                  >
                    {instance.card.imageSrc ? (
                      <Image src={instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                    ) : null}
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
        {activeStagingCard && stagingMenuPosition && onAttack && !disabled ? (
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
              Attack target
            </div>
            {stagingTargets.map((target) => {
              const defender = battlefieldCardsByZone?.[target]?.find((instance) => isUnitCard(instance.card) && instance.owner !== activeStagingCard.owner) ?? null;
              const friendlyOccupant = battlefieldCardsByZone?.[target]?.find((instance) => isUnitCard(instance.card) && instance.owner === activeStagingCard.owner) ?? null;

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
                onClick={() => setIsGraveyardOpen(false)}
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
                    <article key={instance.instanceId} className="min-w-0">
                      <div className="relative aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface-muted)] shadow-md">
                        {instance.card.imageSrc ? (
                          <Image src={instance.faceDown ? CARD_BACK_IMAGE_SRC : instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-center text-[0.65rem] font-semibold text-[color:var(--text-secondary)]" title={instance.card.name}>
                        {instance.card.name}
                      </p>
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

function HandStrip({
  cards,
  onMove,
  disabled = false,
  canSupplyFromHand,
  canPlayFromHand,
  readySupplyCount,
  stagingUnits,
}: {
  cards: GameCardInstance[];
  onMove: MoveCardHandler;
  disabled?: boolean;
  canSupplyFromHand: boolean;
  canPlayFromHand: boolean;
  readySupplyCount: number;
  stagingUnits: GameCardInstance[];
}) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const activeHandTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handMenuRef = useRef<HTMLDivElement | null>(null);
  const activeInstance = cards.find((instance) => instance.instanceId === activeCardId) ?? null;
  const handActions = activeInstance
    ? getHandActions(activeInstance, { canSupplyFromHand, canPlayFromHand, readySupplyCount, stagingUnits })
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

export function GameClient({ locale, initialCards, initialError, initialMode = 'lobby' }: GameClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedMode, setSelectedMode] = useState<PlayMode>('practice');
  const [selectedQueue, setSelectedQueue] = useState<PlayQueue>('casual');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [selectedBotDeckId, setSelectedBotDeckId] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConcedeDialogOpen, setIsConcedeDialogOpen] = useState(false);
  const [isPassTurnDialogOpen, setIsPassTurnDialogOpen] = useState(false);
  const [attackArrow, setAttackArrow] = useState<AttackArrowState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [matchSetupError, setMatchSetupError] = useState<string | null>(null);
  const botTurnTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cardMap = useMemo(() => new Map(initialCards.map((card) => [card.id, card])), [initialCards]);
  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? null,
    [decks, selectedDeckId]
  );
  const selectedBotDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedBotDeckId) ?? null,
    [decks, selectedBotDeckId]
  );
  const isMatchRoute = initialMode === 'match';
  const lobbyHref = `/${locale}/play`;
  const matchHref = `/${locale}/match`;
  const signInHref = `/${locale}/sign-in?redirect=${encodeURIComponent(isMatchRoute ? matchHref : lobbyHref)}`;

  function clearBotTurnTimers() {
    for (const timerId of botTurnTimersRef.current) {
      clearTimeout(timerId);
    }

    botTurnTimersRef.current = [];
  }

  function getElementCenter(element: Element): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function showAttackArrow(attackerInstanceId: string, targetZone: ZoneId, state: GameState): number | null {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return null;
    }

    const attackerElement = document.querySelector(`[data-card-instance-id="${CSS.escape(attackerInstanceId)}"]`);
    const defender = state.zones[targetZone]?.find((instance) => isUnitCard(instance.card) && instance.instanceId !== attackerInstanceId) ?? null;
    const targetElement = defender
      ? document.querySelector(`[data-card-instance-id="${CSS.escape(defender.instanceId)}"]`)
      : document.querySelector(`[data-battlefield-zone="${CSS.escape(targetZone)}"]`);

    if (!attackerElement || !targetElement) {
      return null;
    }

    const arrowId = Date.now();
    setAttackArrow({
      id: arrowId,
      from: getElementCenter(attackerElement),
      to: getElementCenter(targetElement),
    });

    return arrowId;
  }

  function clearAttackArrow(arrowId: number | null) {
    if (arrowId === null) {
      return;
    }

    setAttackArrow((current) => (current?.id === arrowId ? null : current));
  }

  function playAutomaticBotTurn(botTurnState: GameState) {
    clearBotTurnTimers();
    setGameState(botTurnState);

    for (const [index, step] of BOT_TURN_STEPS.entries()) {
      const timerId = setTimeout(() => {
        setGameState((previous) => {
          if (!previous) {
            return previous;
          }

          if (step !== 'attackBattlefield') {
            return applyBotTurnStep(previous, step);
          }

          const choice = getBotBattlefieldAttackChoice(previous);

          if (!choice) {
            return previous;
          }

          const arrowId = showAttackArrow(choice.attackerInstanceId, choice.targetZone, previous);
          window.setTimeout(() => {
            setGameState((current) => {
              if (!current) {
                return current;
              }

              const nextState = applyBotTurnStep(current, step);

              if (!nextState.pendingCombat) {
                clearAttackArrow(arrowId);
              }

              return nextState;
            });
          }, 700);

          return previous;
        });
      }, BOT_TURN_STEP_DELAY_MS * (index + 1));

      botTurnTimersRef.current.push(timerId);
    }

    const passTurnTimerId = setTimeout(() => {
      setGameState((previous) => {
        if (!previous || previous.phase !== 'main' || previous.activePlayer !== 'opponent') {
          return previous;
        }

        return advanceToNextTurn(previous);
      });
      botTurnTimersRef.current = [];
    }, BOT_TURN_STEP_DELAY_MS * (BOT_TURN_STEPS.length + 2));

    botTurnTimersRef.current.push(passTurnTimerId);
  }

  useEffect(() => clearBotTurnTimers, []);

  useEffect(() => {
    if (gameState?.winner) {
      clearBotTurnTimers();
      setAttackArrow(null);
      setIsPassTurnDialogOpen(false);
    }
  }, [gameState?.winner]);

  useEffect(() => {
    if (!gameState?.pendingCombat || gameState.pendingCombat.priorityOwner !== 'opponent') {
      return;
    }

    const timerId = window.setTimeout(() => {
      setGameState((previous) => {
        if (!previous?.pendingCombat || previous.pendingCombat.priorityOwner !== 'opponent') {
          return previous;
        }

        const counterState = playFirstBotCounter(previous);

        if (counterState) {
          return counterState;
        }

        const result = passCounterPriority(previous, 'opponent');

        if ('error' in result) {
          return {
            ...previous,
            log: addLogEntry(previous, { suffix: result.error }),
          };
        }

        if (result.resolvedCombat) {
          setAttackArrow(null);
          return result.state.activePlayer === 'opponent' ? advanceToNextTurn(result.state) : result.state;
        }

        return result.state;
      });
    }, 600);

    return () => window.clearTimeout(timerId);
  }, [gameState?.pendingCombat]);

  useEffect(() => {
    if (!isMatchRoute) {
      return;
    }

    document.body.classList.add('simulator-route-active');

    return () => {
      document.body.classList.remove('simulator-route-active');
    };
  }, [isMatchRoute]);

  useEffect(() => {
    let isMounted = true;

    async function loadDecks() {
      setStatus('loading');
      setErrorMessage(initialError);

      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (!isMounted) {
        return;
      }

      if (userError || !userResult?.user) {
        setStatus('auth');
        setDecks([]);
        return;
      }

      const { data, error } = await supabase
        .from('decks')
        .select('id,title,created_at,deck_cards(quantity,card_id)')
        .eq('user_id', userResult.user.id)
        .order('created_at', { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Failed to load simulator decks', error);
        setErrorMessage(error.message);
        setStatus('error');
        setDecks([]);
        return;
      }

      const mappedDecks = mapDeckRows((data ?? []) as DeckRow[], cardMap).filter((deck) => deck.cardCount > 0);
      setDecks(mappedDecks);
      setSelectedDeckId((previous) => previous || mappedDecks[0]?.id || '');
      setSelectedBotDeckId((previous) => previous || mappedDecks[1]?.id || mappedDecks[0]?.id || '');
      setStatus('ready');
    }

    void loadDecks();

    return () => {
      isMounted = false;
    };
  }, [cardMap, initialError]);

  useEffect(() => {
    if (!isMatchRoute || status !== 'ready' || gameState) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const storedPayload = window.sessionStorage.getItem(MATCH_SESSION_STORAGE_KEY);
    if (!storedPayload) {
      setMatchSetupError('Start a practice room from the Play lobby first.');
      return;
    }

    let payload: MatchSessionPayload;
    try {
      payload = JSON.parse(storedPayload) as MatchSessionPayload;
    } catch {
      window.sessionStorage.removeItem(MATCH_SESSION_STORAGE_KEY);
      setMatchSetupError('The saved match setup could not be opened. Please start a new room from the Play lobby.');
      return;
    }

    const matchDeck = decks.find((deck) => deck.id === payload.deckId) ?? null;
    const matchBotDeck = payload.botDeckId ? decks.find((deck) => deck.id === payload.botDeckId) ?? null : null;

    if (!matchDeck || !matchBotDeck) {
      setMatchSetupError('One of the selected decks is no longer available. Please start a new room from the Play lobby.');
      return;
    }

    setSelectedMode('practice');
    setSelectedDeckId(matchDeck.id);
    setSelectedBotDeckId(matchBotDeck.id);
    setMatchSetupError(null);
    setGameState(buildInitialGameState(matchDeck, matchBotDeck, payload.mode ?? 'practice'));
  }, [decks, gameState, isMatchRoute, status]);

  function startSelectedDeck() {
    if (!selectedDeck || !selectedBotDeck || selectedMode !== 'practice') {
      return;
    }

    if (isMatchRoute) {
      setGameState(buildInitialGameState(selectedDeck, selectedBotDeck, 'practice'));
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        MATCH_SESSION_STORAGE_KEY,
        JSON.stringify({ deckId: selectedDeck.id, botDeckId: selectedBotDeck.id, mode: 'practice' } satisfies MatchSessionPayload)
      );
    }

    router.push(matchHref);
  }

  function returnToLobby() {
    clearBotTurnTimers();
    setIsConcedeDialogOpen(false);
    setIsPassTurnDialogOpen(false);
    setGameState(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(MATCH_SESSION_STORAGE_KEY);
    }
    if (isMatchRoute) {
      router.push(lobbyHref);
    }
  }

  function confirmConcede() {
    returnToLobby();
  }

  function requestPassTurn() {
    if (!gameState || gameState.winner || gameState.phase === 'setup' || gameState.activePlayer !== 'player') {
      return;
    }

    setIsPassTurnDialogOpen(true);
  }

  function confirmPassTurn() {
    if (!gameState || gameState.winner || gameState.phase === 'setup' || gameState.activePlayer !== 'player') {
      setIsPassTurnDialogOpen(false);
      return;
    }

    setIsPassTurnDialogOpen(false);
    const botTurnState = advanceToNextTurn(gameState);

    if (botTurnState.activePlayer === 'opponent') {
      playAutomaticBotTurn(botTurnState);
      return;
    }

    setGameState(botTurnState);
  }

  function drawCards(count: number) {
    setGameState((previous) => {
      if (!previous || previous.winner || previous.zones.deck.length === 0) {
        return previous;
      }

      const drawn = previous.zones.deck.slice(0, count);
      const remainingDeck = previous.zones.deck.slice(drawn.length);
      const label = drawn.length === 1 ? 'card' : 'cards';

      return {
        ...previous,
        zones: {
          ...previous.zones,
          deck: remainingDeck,
          hand: [...previous.zones.hand, ...drawn],
        },
        log: addLogEntry(previous, { suffix: `Drew ${drawn.length} ${label}.` }),
      };
    });
  }

  function moveCard(instanceId: string, fromZone: ZoneId, toZone: ZoneId, options: MoveCardOptions = {}) {
    setGameState((previous) => {
      if (!previous) {
        return previous;
      }

      const setupFirstPlayer =
        fromZone === 'hand' &&
        toZone === 'supply' &&
        !previous.playerStartingSupplyPlaced &&
        previous.sessionMode === 'multiplayer'
          ? rollFirstPlayer()
          : undefined;

      return applyPlayerCardAction(previous, {
        instanceId,
        fromZone,
        toZone,
        options: {
          ...options,
          setupFirstPlayer,
        },
      }).state;
    });
  }

  function attackBattlefield(attackerInstanceId: string, targetZone: ZoneId) {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      const defender = previous.zones[targetZone].find((instance) => isUnitCard(instance.card) && instance.owner !== 'player') ?? null;
      const arrowId = showAttackArrow(attackerInstanceId, targetZone, previous);

      if (!defender) {
        window.setTimeout(() => {
          setGameState((current) => {
            if (!current) {
              return current;
            }

            const nextResult = resolveBattlefieldAttack(current, 'player', attackerInstanceId, targetZone);

            if ('error' in nextResult) {
              return {
                ...current,
                log: addLogEntry(current, { suffix: nextResult.error }),
              };
            }

            return nextResult.state;
          });
          clearAttackArrow(arrowId);
        }, 700);

        return previous;
      }

      const result = declareBattlefieldAttack(previous, 'player', attackerInstanceId, targetZone);

      if ('error' in result) {
        clearAttackArrow(arrowId);
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      return result.state;
    });
  }

  function passPlayerCounterPriority() {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      const result = passCounterPriority(previous, 'player');

      if ('error' in result) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      if (result.resolvedCombat) {
        setAttackArrow(null);
        return result.state.activePlayer === 'opponent' ? advanceToNextTurn(result.state) : result.state;
      }

      return result.state;
    });
  }

  function playPlayerCounter(instanceId: string) {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      const result = playCounterCard(previous, 'player', instanceId);

      if ('error' in result) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: result.error }),
        };
      }

      return result.state;
    });
  }

  function shuffleLibrary() {
    setGameState((previous) => {
      if (!previous || previous.winner) {
        return previous;
      }

      return {
        ...previous,
        zones: {
          ...previous.zones,
          deck: shuffleCards(previous.zones.deck),
        },
        log: addLogEntry(previous, { suffix: 'Shuffled deck.' }),
      };
    });
  }

  function chooseFirstPlayer(firstPlayer: 'player' | 'opponent') {
    if (!gameState || gameState.phase !== 'setup' || !gameState.playerStartingSupplyPlaced) {
      return;
    }

    const startedState = startGameAfterSetup(gameState, firstPlayer);

    if (startedState.activePlayer === 'opponent') {
      playAutomaticBotTurn(startedState);
      return;
    }

    setGameState(startedState);
  }

  function resetGame() {
    if (selectedDeck) {
      clearBotTurnTimers();
      setGameState(buildInitialGameState(selectedDeck, selectedBotDeck));
    }
  }

  const content = (() => {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-sm text-[color:var(--text-secondary)]">
          Loading your decks...
        </div>
      );
    }

    if (status === 'auth') {
      return (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">Sign in to simulate games with your saved decks.</p>
          <Link
            href={signInHref}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            Sign in
          </Link>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
          {errorMessage ?? 'Unable to load decks.'}
        </div>
      );
    }

    if (decks.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">Save a deck before starting a simulator session.</p>
          <Link
            href={`/${locale}/create`}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            Build a deck
          </Link>
        </div>
      );
    }

    if (isMatchRoute && matchSetupError) {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{matchSetupError}</p>
          <Link
            href={lobbyHref}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            Back to Play lobby
          </Link>
        </div>
      );
    }

    if (isMatchRoute && !gameState) {
      return (
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center text-sm text-[color:var(--text-secondary)]">
          Opening match room...
        </div>
      );
    }

    if (!gameState) {
      return (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center">
          <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[linear-gradient(110deg,rgba(241,143,59,0.18),rgba(44,180,120,0.14))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--accent)]/20 text-[color:var(--accent)]">
                    <Swords className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 truncate text-base font-bold text-[color:var(--text-primary)]">
                      {selectedDeck?.title?.trim() || 'Untitled deck'}
                    </h2>
                    <label className="relative inline-flex cursor-pointer items-center rounded-md border border-[color:var(--border)] bg-black/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)]">
                      Change
                      <select
                        aria-label="Change deck"
                        value={selectedDeckId}
                        onChange={(event) => setSelectedDeckId(event.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      >
                        {decks.map((deck) => (
                          <option key={deck.id} value={deck.id}>
                            {deck.title?.trim() || 'Untitled deck'} ({deck.cardCount})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <span className="rounded-full border border-[color:var(--border)] bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--text-primary)]">
                  {selectedDeck?.cardCount ?? 0} cards
                </span>
              </div>

              <div className="rounded-full border border-[color:var(--border)] bg-black/20 p-1" role="tablist" aria-label="Play mode">
                <div className="grid gap-1 sm:grid-cols-3">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedMode === 'matchmaking'}
                  onClick={() => setSelectedMode('matchmaking')}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    selectedMode === 'matchmaking'
                      ? 'bg-[color:var(--text-primary)] text-[color:var(--background)]'
                      : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                  }`}
                >
                  <Swords className="h-4 w-4" aria-hidden="true" />
                  Matchmaking
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedMode === 'lobby'}
                  onClick={() => setSelectedMode('lobby')}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    selectedMode === 'lobby'
                      ? 'bg-[color:var(--text-primary)] text-[color:var(--background)]'
                      : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                  }`}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Lobby
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedMode === 'practice'}
                  onClick={() => setSelectedMode('practice')}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    selectedMode === 'practice'
                      ? 'bg-[color:var(--text-primary)] text-[color:var(--background)]'
                      : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                  }`}
                >
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  Practice
                </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="flex flex-col gap-4">
                  {selectedMode === 'matchmaking' ? (
                    <>
                      <div className="rounded-full border border-[color:var(--border)] bg-black/15 p-1">
                        <div className="grid grid-cols-2 gap-1">
                          {(['ranked', 'casual'] as PlayQueue[]).map((queue) => (
                            <button
                              key={queue}
                              type="button"
                              onClick={() => setSelectedQueue(queue)}
                              className={`rounded-full px-4 py-3 text-sm font-bold capitalize transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                                selectedQueue === queue
                                  ? 'bg-[color:var(--text-primary)] text-[color:var(--background)]'
                                  : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                              }`}
                            >
                              {queue}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex min-h-40 items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 px-6 py-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]">
                            <Users className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <h2 className="text-xl font-bold capitalize text-[color:var(--text-primary)]">{selectedQueue} matchmaking</h2>
                            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                              Multiplayer is coming soon. When it is ready, this will find an online room for your selected deck.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : selectedMode === 'practice' ? (
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
                      <div className="flex min-h-56 items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 px-6 py-8">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--accent)]/15 text-[color:var(--accent)]">
                            <Bot className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">Practice vs Bot</h2>
                            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">Choose one of your saved decks for the bot opponent.</p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--border)] bg-black/15 p-4">
                        <label htmlFor="simulator-bot-deck" className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                          Bot deck
                        </label>
                        <select
                          id="simulator-bot-deck"
                          value={selectedBotDeckId}
                          onChange={(event) => setSelectedBotDeckId(event.target.value)}
                          className="mt-2 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm font-semibold text-[color:var(--text-primary)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                        >
                          {decks.map((deck) => (
                            <option key={deck.id} value={deck.id}>
                              {deck.title?.trim() || 'Untitled deck'} ({deck.cardCount})
                            </option>
                          ))}
                        </select>
                        {selectedBotDeck ? (
                          <div className="mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3">
                            <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">
                              {selectedBotDeck.title?.trim() || 'Untitled deck'}
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{selectedBotDeck.cardCount} cards</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-56 items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 px-6 py-8">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-[color:var(--surface-muted)] text-[color:var(--text-secondary)]">
                          <Users className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div>
                          <h2 className="text-xl font-bold text-[color:var(--text-primary)]">Room lobby</h2>
                          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                            Create a custom game and invite a friend with a room code.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <aside className="rounded-lg border border-[color:var(--border)] bg-black/15 p-4">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--text-primary)]">Your deck</h2>
                  {selectedDeck ? (
                    <div className="mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3">
                      <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">
                        {selectedDeck.title?.trim() || 'Untitled deck'}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{selectedDeck.cardCount} cards selected</p>
                    </div>
                  ) : null}
                </aside>
              </div>

              <button
                type="button"
                onClick={startSelectedDeck}
                disabled={!selectedDeck || !selectedBotDeck || selectedMode !== 'practice'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[color:var(--text-primary)] px-4 py-4 text-base font-bold text-[color:var(--background)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {selectedMode === 'practice'
                  ? 'Launch Practice vs Bot'
                  : selectedMode === 'matchmaking'
                    ? `Find ${selectedQueue} match`
                    : 'Create Lobby'}
              </button>
            </div>
          </section>
        </div>
      );
    }
    const pendingCombat = gameState.pendingCombat;
    const playablePlayerCounters =
      pendingCombat?.priorityOwner === 'player'
        ? gameState.zones.hand.filter((instance) => !getCounterPlayError(gameState, 'player', instance.instanceId))
        : [];
    const canTakePlayerActions = !gameState.winner && (gameState.phase === 'setup' || gameState.activePlayer === 'player');
    const canUseBoardActions = canTakePlayerActions && !pendingCombat;
    const canPlayFromHand = gameState.phase === 'main' && gameState.activePlayer === 'player' && !pendingCombat;
    const readySupplyCount = getReadySupplyCount(gameState, 'player');
    const playerStagingUnits = getStagingUnitCards(gameState.zones.staging, 'player');
    const canFlipFaceUp = canPlayFromHand;
    const canSupplyFromHand =
      gameState.phase === 'setup'
        ? !gameState.playerStartingSupplyPlaced
        : canManuallySupplyFromHand(gameState, 'player');

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {attackArrow ? <AttackArrowOverlay arrow={attackArrow} /> : null}
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(12rem,0.48fr)_minmax(0,2.63fr)]">
          <div className="flex min-h-[18rem] min-w-0 flex-col gap-3 xl:min-h-0">
            <section className="rounded-lg border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.06)),var(--surface)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <button type="button" onClick={returnToLobby} className="mb-2 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]">
                Back to lobby
              </button>
              <div className="mb-3 rounded-md border border-[color:var(--border)] bg-black/15 px-3 py-2 text-center">
                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">
                  {gameState.phase === 'setup' ? 'Turn 0 setup' : `Turn ${gameState.turn}`}
                </p>
                <p className="mt-0.5 text-sm font-black text-[color:var(--text-primary)]">
                  {gameState.phase === 'setup'
                    ? 'Setup'
                    : gameState.activePlayer === 'player'
                      ? 'Your turn'
                      : 'Bot turn'}
                </p>
              </div>
              <div className="mb-3 grid gap-2">
                <VictoryPointScoreControl label="Your victory points" value={gameState.playerVictoryPoints} tone="player" />
                <VictoryPointScoreControl label="Enemy victory points" value={gameState.opponentVictoryPoints} tone="opponent" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => drawCards(1)} disabled={Boolean(gameState.winner)} className="inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50">
                  <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                  Draw 1
                </button>
                <button type="button" onClick={() => drawCards(7)} disabled={Boolean(gameState.winner)} className="inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  Draw 7
                </button>
                <button type="button" onClick={() => setIsConcedeDialogOpen(true)} className="inline-flex items-center justify-center gap-1 rounded-md border border-red-500/45 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300 focus:outline-none focus-visible:ring focus-visible:ring-red-400">
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  Concede
                </button>
                <button type="button" onClick={requestPassTurn} disabled={Boolean(gameState.winner) || gameState.phase === 'setup' || gameState.activePlayer !== 'player' || Boolean(pendingCombat)} className="inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50">
                  <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Turn
                </button>
              </div>
            </section>
            <aside className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.06)),var(--surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <header className="border-b border-[color:var(--border)] px-4 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide">Action log</h2>
              </header>
              <ol className="deck-builder-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm text-[color:var(--text-secondary)]">
                <ActionLogList entries={gameState.log} />
              </ol>
            </aside>
          </div>
          <div className="relative grid min-h-[42rem] grid-rows-[minmax(12.5rem,0.84fr)_minmax(11rem,0.74fr)_minmax(12rem,1fr)] gap-2 rounded-xl border border-[color:var(--accent)]/30 bg-[radial-gradient(circle_at_50%_43%,rgba(241,143,59,0.15),transparent_34%),radial-gradient(circle_at_50%_50%,rgba(235,184,113,0.06),transparent_58%),linear-gradient(180deg,rgba(54,52,50,0.88),rgba(31,28,26,0.86))] p-2 shadow-[inset_0_1px_0_rgba(255,226,183,0.10),inset_0_0_0_1px_rgba(255,255,255,0.025),0_1rem_2rem_rgba(0,0,0,0.22)] xl:min-h-0">
            {pendingCombat ? (
              <div className="absolute inset-0 z-[75] flex items-center justify-center bg-black/45 px-4" role="presentation">
                <div role="dialog" aria-modal="true" aria-labelledby="counter-window-title" className="w-full max-w-md rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-4 shadow-2xl shadow-black/45">
                  <p id="counter-window-title" className="text-[0.65rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">Counter window</p>
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-[color:var(--text-secondary)]">Counter stack</p>
                    {pendingCombat.counterStack.length > 0 ? (
                      <ol className="mt-2 grid max-h-40 gap-2 overflow-y-auto">
                        {[...pendingCombat.counterStack].reverse().map((counter, index) => (
                          <li key={counter.instanceId} className="flex min-w-0 items-center gap-2 rounded-md border border-[color:var(--border)] bg-black/15 p-2">
                            <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black/20">
                              {counter.card.imageSrc ? <Image src={counter.card.imageSrc} alt="" fill sizes="36px" className="object-cover" /> : null}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{counter.card.name}</p>
                              <p className="text-[0.65rem] text-[color:var(--text-secondary)]">
                                {index === 0 ? 'Resolves next' : `Stack position ${pendingCombat.counterStack.length - index}`}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">No counters played.</p>
                    )}
                  </div>
                  {pendingCombat.priorityOwner === 'player' && playablePlayerCounters.length > 0 ? (
                    <div className="mt-4 border-t border-[color:var(--border)] pt-3">
                      <p className="text-xs font-semibold text-[color:var(--text-secondary)]">Available counters</p>
                      <div className="mt-2 grid max-h-36 gap-2 overflow-y-auto">
                        {playablePlayerCounters.map((counter) => (
                          <button
                            key={counter.instanceId}
                            type="button"
                            onClick={() => playPlayerCounter(counter.instanceId)}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-left transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                          >
                            <span className="truncate text-sm font-semibold">{counter.card.name}</span>
                            <span className="shrink-0 text-xs text-[color:var(--text-secondary)]">Cost {getPlayCost(counter.card)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={passPlayerCounterPriority}
                    disabled={pendingCombat.priorityOwner !== 'player'}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--accent)]/55 bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingCombat.priorityOwner === 'player' ? 'Pass counter' : 'Waiting for bot'}
                  </button>
                </div>
              </div>
            ) : null}
            <CombinedStagingSupplyPanel
              stagingCards={gameState.opponentZones.staging}
              supplyCards={gameState.opponentZones.supply}
              graveyardCards={gameState.opponentZones.graveyard}
              banishCards={gameState.opponentZones.banish}
              deckCards={gameState.opponentZones.deck}
              compact
              mirror
            />
            <div className="grid min-h-0 gap-2 md:grid-cols-3">
              <BattlefieldPanel zone="battlefieldLeft" cards={gameState.zones.battlefieldLeft} onMove={moveCard} disabled={!canUseBoardActions} canFlipFaceUp={canFlipFaceUp} readySupplyCount={readySupplyCount} />
              <BattlefieldPanel zone="battlefieldCenter" cards={gameState.zones.battlefieldCenter} onMove={moveCard} disabled={!canUseBoardActions} canFlipFaceUp={canFlipFaceUp} readySupplyCount={readySupplyCount} />
              <BattlefieldPanel zone="battlefieldRight" cards={gameState.zones.battlefieldRight} onMove={moveCard} disabled={!canUseBoardActions} canFlipFaceUp={canFlipFaceUp} readySupplyCount={readySupplyCount} />
            </div>
            <CombinedStagingSupplyPanel
              stagingCards={gameState.zones.staging}
              supplyCards={gameState.zones.supply}
              graveyardCards={gameState.zones.graveyard}
              banishCards={gameState.zones.banish}
              deckCards={gameState.zones.deck}
              onMove={moveCard}
              onAttack={attackBattlefield}
              battlefieldCardsByZone={{
                battlefieldLeft: gameState.zones.battlefieldLeft,
                battlefieldCenter: gameState.zones.battlefieldCenter,
                battlefieldRight: gameState.zones.battlefieldRight,
              }}
              disabled={!canUseBoardActions}
            />
          </div>
        </div>
        {gameState.winner ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="game-result-title" className="w-full max-w-sm rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)] p-5 text-center shadow-2xl shadow-black/50">
              <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">Game over</p>
              <h2 id="game-result-title" className="mt-2 text-2xl font-black text-[color:var(--text-primary)]">
                {gameState.winner === 'player' ? 'You won!' : 'You lost'}
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-[color:var(--accent)]/40 bg-black/15 p-3">
                  <p className="text-xs font-semibold text-[color:var(--text-secondary)]">You</p>
                  <p className="mt-1 text-3xl font-black">{gameState.playerVictoryPoints}</p>
                </div>
                <div className="rounded-md border border-red-400/40 bg-black/15 p-3">
                  <p className="text-xs font-semibold text-[color:var(--text-secondary)]">Bot</p>
                  <p className="mt-1 text-3xl font-black">{gameState.opponentVictoryPoints}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={returnToLobby}
                  className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  Lobby
                </button>
                <button
                  type="button"
                  onClick={resetGame}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-bold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Rematch
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {isConcedeDialogOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="concede-title" className="w-full max-w-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-2xl">
              <h2 id="concede-title" className="text-lg font-semibold text-[color:var(--text-primary)]">Concede game?</h2>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                This will leave the current room and return you to the lobby.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsConcedeDialogOpen(false)}
                  className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmConcede}
                  className="rounded-md border border-red-500/45 bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-100 transition hover:border-red-300 focus:outline-none focus-visible:ring focus-visible:ring-red-400"
                >
                  Concede
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {isPassTurnDialogOpen ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="pass-turn-title" className="w-full max-w-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-2xl">
              <h2 id="pass-turn-title" className="text-lg font-semibold text-[color:var(--text-primary)]">Pass turn?</h2>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                This will end your actions for this turn and pass priority to the bot.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPassTurnDialogOpen(false)}
                  className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPassTurn}
                  className="rounded-md border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/20 px-3 py-2 text-sm font-semibold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  Pass turn
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <RequiredActionToast
          message={
            !gameState.playerStartingSupplyPlaced
              ? 'Choose 1 card from your hand to place as starting supply.'
              : gameState.phase === 'setup'
                ? gameState.sessionMode === 'multiplayer'
                  ? 'Rolling to choose who takes the first turn.'
                  : 'Choose who takes the first turn.'
                : null
          }
          actions={
            gameState.sessionMode === 'practice' && gameState.phase === 'setup' && gameState.playerStartingSupplyPlaced ? (
              <>
                <button
                  type="button"
                  onClick={() => chooseFirstPlayer('player')}
                  className="pointer-events-auto rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  You first
                </button>
                <button
                  type="button"
                  onClick={() => chooseFirstPlayer('opponent')}
                  className="pointer-events-auto rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-bold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  Bot first
                </button>
              </>
            ) : null
          }
        />
        <OpponentHandStrip cards={gameState.opponentZones.hand} />
        <HandStrip
          cards={gameState.zones.hand}
          onMove={moveCard}
          disabled={!canUseBoardActions}
          canSupplyFromHand={canSupplyFromHand}
          canPlayFromHand={canPlayFromHand}
          readySupplyCount={readySupplyCount}
          stagingUnits={playerStagingUnits}
        />
      </div>
    );
  })();

  return (
    <main className="deck-builder-workspace flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-8 pt-4 text-[color:var(--text-primary)] lg:px-6">
      {content}
    </main>
  );
}
