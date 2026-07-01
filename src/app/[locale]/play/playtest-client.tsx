'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Archive, ArrowDownToLine, Ban, Bot, ChevronsRight, Flag, Hand, Layers, Play, RotateCcw, Swords, Users } from 'lucide-react';

import type { Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { Card, DeckEntry } from '../create/deck-builder/types';

type ZoneId =
  | 'deck'
  | 'hand'
  | 'staging'
  | 'supply'
  | 'graveyard'
  | 'banish'
  | 'battlefieldLeft'
  | 'battlefieldCenter'
  | 'battlefieldRight';
type LoadStatus = 'idle' | 'loading' | 'ready' | 'auth' | 'error';
type PlayMode = 'matchmaking' | 'lobby' | 'practice';
type PlayQueue = 'ranked' | 'casual';

type DeckCardRow = {
  quantity?: number | null;
  card_id?: string | null;
  card_id_astra?: string | null;
};

type DeckRow = {
  id: string | number;
  title?: string | null;
  created_at?: string | null;
  deck_cards?: DeckCardRow[] | null;
};

type SavedDeck = {
  id: string;
  title: string | null;
  cardCount: number;
  entries: DeckEntry[];
};

type GameCardInstance = {
  instanceId: string;
  card: Card;
};

type PrivateZones = Pick<Record<ZoneId, GameCardInstance[]>, 'deck' | 'hand' | 'staging' | 'supply' | 'graveyard' | 'banish'>;

type GameState = {
  deckId: string;
  deckTitle: string;
  botDeckId: string | null;
  botDeckTitle: string | null;
  turn: number;
  zones: Record<ZoneId, GameCardInstance[]>;
  opponentZones: PrivateZones;
  log: LogEntry[];
};

type LogEntry = {
  id: string;
  prefix?: string;
  cardName?: string;
  suffix: string;
};

export type PlaytestClientProps = {
  locale: Locale;
  initialCards: Card[];
  initialError: string | null;
  initialMode?: 'lobby' | 'match';
};

type MatchSessionPayload = {
  deckId: string;
  botDeckId: string | null;
};

const ZONE_LABELS: Record<ZoneId, string> = {
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

const MATCH_SESSION_STORAGE_KEY = 'astrabuilder-playtest-match';

const BATTLEFIELD_ZONES = new Set<ZoneId>(['battlefieldLeft', 'battlefieldCenter', 'battlefieldRight']);
const CARD_BACK_IMAGE_SRC = '/images/card-back.png';

function useCloseOnOutsidePointerDown(
  isOpen: boolean,
  refs: Array<{ current: HTMLElement | null }>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (refs.some((ref) => ref.current?.contains(target))) {
        return;
      }

      onClose();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, refs, onClose]);
}

function CardZoomPreview({ card }: { card: Card | null }) {
  if (!card) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-5 top-20 z-50 hidden w-80 overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/40 lg:block">
      <div className="relative aspect-[5/7] w-full bg-[color:var(--surface-muted)]">
        {card.imageSrc ? (
          <Image src={card.imageSrc} alt="" fill sizes="320px" className="object-cover" priority={false} />
        ) : null}
      </div>
    </div>
  );
}
const DEFAULT_MOVE_TARGETS: ZoneId[] = [
  'hand',
  'staging',
  'supply',
  'battlefieldLeft',
  'battlefieldCenter',
  'battlefieldRight',
  'graveyard',
  'banish',
  'deck',
];

function getVisibleMoveTargets(zone: ZoneId): ZoneId[] {
  return DEFAULT_MOVE_TARGETS.filter((target) => target !== zone);
}

function resolveDeckCardId(entry: DeckCardRow | null | undefined): string | null {
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

function shuffleCards(cards: GameCardInstance[]): GameCardInstance[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function buildDeckInstances(deck: SavedDeck, owner: 'player' | 'opponent'): GameCardInstance[] {
  return deck.entries.flatMap((entry) =>
    Array.from({ length: entry.count }, (_, index) => ({
      instanceId: `${owner}-${entry.card.id}-${index}-${crypto.randomUUID()}`,
      card: entry.card,
    }))
  );
}

function createPrivateZones(deckCards: GameCardInstance[]): PrivateZones {
  const shuffledDeck = shuffleCards(deckCards);
  const openingHand = shuffledDeck.slice(0, 7);

  return {
    deck: shuffledDeck.slice(openingHand.length),
    hand: openingHand,
    staging: [],
    supply: [],
    graveyard: [],
    banish: [],
  };
}

function buildInitialGameState(deck: SavedDeck, botDeck: SavedDeck | null): GameState {
  const instances = buildDeckInstances(deck, 'player');
  const opponentInstances = botDeck ? buildDeckInstances(botDeck, 'opponent') : [];
  const playerZones = createPrivateZones(instances);
  const opponentZones = createPrivateZones(opponentInstances);

  return {
    deckId: deck.id,
    deckTitle: deck.title?.trim() || 'Untitled deck',
    botDeckId: botDeck?.id ?? null,
    botDeckTitle: botDeck?.title?.trim() || null,
    turn: 1,
    zones: {
      ...playerZones,
      battlefieldLeft: [],
      battlefieldCenter: [],
      battlefieldRight: [],
    },
    opponentZones,
    log: [
      createLogEntry({
        suffix: botDeck
          ? `Started practice with ${instances.length} cards against ${botDeck.title?.trim() || 'Untitled deck'}. Both players drew 7 cards.`
          : `Started practice with ${instances.length} cards. You drew 7 cards.`,
      }),
    ],
  };
}

function mapDeckRows(rows: DeckRow[], cardMap: Map<string, Card>): SavedDeck[] {
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

function createLogEntry({
  prefix,
  cardName,
  suffix,
}: {
  prefix?: string;
  cardName?: string;
  suffix: string;
}): LogEntry {
  return {
    id: crypto.randomUUID(),
    prefix,
    cardName,
    suffix,
  };
}

function addLogEntry(state: GameState, entry: Omit<LogEntry, 'id'>): LogEntry[] {
  return [createLogEntry(entry), ...state.log].slice(0, 40);
}

function ZoneIcon({ zone }: { zone: ZoneId }) {
  const iconClassName = 'h-4 w-4';

  if (zone === 'deck') {
    return <Layers className={iconClassName} aria-hidden="true" />;
  }

  if (zone === 'hand') {
    return <Hand className={iconClassName} aria-hidden="true" />;
  }

  if (zone === 'staging') {
    return <Swords className={iconClassName} aria-hidden="true" />;
  }

  if (zone === 'supply') {
    return <Archive className={iconClassName} aria-hidden="true" />;
  }

  if (zone === 'battlefieldLeft' || zone === 'battlefieldCenter' || zone === 'battlefieldRight') {
    return <Flag className={iconClassName} aria-hidden="true" />;
  }

  if (zone === 'banish') {
    return <Ban className={iconClassName} aria-hidden="true" />;
  }

  return <ArrowDownToLine className={iconClassName} aria-hidden="true" />;
}

function CardTile({
  instance,
  zone,
  onMove,
}: {
  instance: GameCardInstance;
  zone: ZoneId;
  onMove: (instanceId: string, fromZone: ZoneId, toZone: ZoneId) => void;
}) {
  const visibleTargets = getVisibleMoveTargets(zone);

  return (
    <article className="flex min-w-0 gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-2 shadow-sm">
      <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded border border-black/20 bg-[color:var(--surface-muted)]">
        {instance.card.imageSrc ? (
          <Image src={instance.card.imageSrc} alt="" fill sizes="56px" className="object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{instance.card.name}</h3>
          <p className="truncate text-xs text-[color:var(--text-secondary)]">
            Cost {instance.card.cost} · {instance.card.type}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleTargets.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onMove(instance.instanceId, zone, target)}
              className="rounded border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            >
              {target === 'deck' ? 'To deck' : ZONE_LABELS[target]}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function MoveButtons({
  instanceId,
  zone,
  targets = getVisibleMoveTargets(zone),
  onMove,
  className = '',
}: {
  instanceId: string;
  zone: ZoneId;
  targets?: ZoneId[];
  onMove: (instanceId: string, fromZone: ZoneId, toZone: ZoneId) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {targets.map((target) => (
        <button
          key={target}
          type="button"
          onClick={() => onMove(instanceId, zone, target)}
          className="rounded border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
        >
          {target === 'deck' ? 'To deck' : ZONE_LABELS[target]}
        </button>
      ))}
    </div>
  );
}

function ZonePanel({
  zone,
  cards,
  onMove,
}: {
  zone: ZoneId;
  cards: GameCardInstance[];
  onMove: (instanceId: string, fromZone: ZoneId, toZone: ZoneId) => void;
}) {
  const shouldShowCount = !BATTLEFIELD_ZONES.has(zone);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ZoneIcon zone={zone} />
          <h2 className="truncate text-sm font-semibold uppercase tracking-wide">{ZONE_LABELS[zone]}</h2>
        </div>
        {shouldShowCount ? (
          <span className="rounded-full bg-[color:var(--surface-muted)] px-2.5 py-1 text-xs font-bold">{cards.length}</span>
        ) : null}
      </header>
      <div className="deck-builder-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {cards.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--border)] px-3 py-6 text-center text-sm text-[color:var(--text-secondary)]">
            No cards here.
          </p>
        ) : (
          cards.map((instance) => (
            <CardTile key={instance.instanceId} instance={instance} zone={zone} onMove={onMove} />
          ))
        )}
      </div>
    </section>
  );
}

function BattlefieldPanel({
  zone,
  cards,
  onMove,
}: {
  zone: ZoneId;
  cards: GameCardInstance[];
  onMove: (instanceId: string, fromZone: ZoneId, toZone: ZoneId) => void;
}) {
  const instance = cards[0] ?? null;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const targets: ZoneId[] = ['staging', 'graveyard', 'banish', 'hand'];

  useCloseOnOutsidePointerDown(isMenuOpen, [triggerRef, menuRef], () => setIsMenuOpen(false));

  function handleMove(instanceId: string, target: ZoneId) {
    onMove(instanceId, zone, target);
    setIsMenuOpen(false);
    setPreviewCard(null);
  }

  return (
    <section className="relative flex min-h-0 flex-col rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]/92">
      <CardZoomPreview card={previewCard} />
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        {instance ? (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
            onMouseEnter={() => setPreviewCard(instance.card)}
            onFocus={() => setPreviewCard(instance.card)}
            onMouseLeave={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
            onBlur={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
            className="relative aspect-[5/7] h-[min(8.5rem,100%)] overflow-hidden rounded-md border-2 border-black/25 bg-[color:var(--surface-muted)] shadow-md transition hover:border-[color:var(--accent)] hover:shadow-[0_0_1rem_rgba(241,143,59,0.35)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <span className="sr-only">Open {ZONE_LABELS[zone]} actions</span>
            <span className="relative block h-full w-full">
              {instance.card.imageSrc ? (
                <Image src={instance.card.imageSrc} alt="" fill sizes="96px" className="object-cover" />
              ) : null}
            </span>
          </button>
        ) : (
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
            {ZONE_LABELS[zone]}
          </p>
        )}
      </div>
      {instance && isMenuOpen ? (
        <div ref={menuRef} className="absolute left-1/2 top-2 z-40 w-36 -translate-x-1/2 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-2xl">
          {targets.map((target) => (
            <button
              key={target}
              type="button"
              role="menuitem"
              onClick={() => handleMove(instance.instanceId, target)}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)]"
            >
              {`Move to ${ZONE_LABELS[target]}`}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CompactZoneStack({
  label,
  cards,
  faceDown = false,
  compact = false,
}: {
  label: string;
  cards: GameCardInstance[];
  faceDown?: boolean;
  compact?: boolean;
}) {
  const topCard = cards[0] ?? null;
  const showCardImage = cards.length > 0 && (faceDown || topCard?.card.imageSrc);

  return (
    <div className="grid min-h-0 w-full grid-rows-[1fr_auto] place-items-center px-2 py-1.5">
      <div
        className={`relative aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md ${
          compact ? 'h-[min(4.35rem,100%)]' : 'h-20'
        }`}
        title={label}
      >
        {showCardImage ? (
          <>
            <Image
              src={faceDown ? CARD_BACK_IMAGE_SRC : topCard?.card.imageSrc || CARD_BACK_IMAGE_SRC}
              alt=""
              fill
              sizes={compact ? '44px' : '56px'}
              className="object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-sm font-bold text-white shadow-sm">
                {cards.length}
              </span>
            </span>
          </>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-bold text-[color:var(--text-secondary)]">
            {cards.length}
          </span>
        )}
      </div>
      <span className="mt-1 text-center text-[9px] font-bold uppercase leading-none tracking-wide text-[color:var(--text-secondary)]">{label}</span>
    </div>
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
}: {
  stagingCards: GameCardInstance[];
  supplyCards: GameCardInstance[];
  graveyardCards: GameCardInstance[];
  banishCards: GameCardInstance[];
  deckCards: GameCardInstance[];
  compact?: boolean;
  mirror?: boolean;
  onMove?: (instanceId: string, fromZone: ZoneId, toZone: ZoneId) => void;
}) {
  const [activeStagingCardId, setActiveStagingCardId] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const activeStagingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const stagingMenuRef = useRef<HTMLDivElement | null>(null);
  const activeStagingCard = stagingCards.find((instance) => instance.instanceId === activeStagingCardId) ?? null;
  const stagingTargets: ZoneId[] = ['hand', 'supply', 'battlefieldLeft', 'battlefieldCenter', 'battlefieldRight', 'graveyard', 'banish', 'deck'];
  const rowsClassName = compact
    ? mirror
      ? 'grid-rows-[minmax(5.25rem,0.42fr)_minmax(9.5rem,0.82fr)]'
      : 'grid-rows-[minmax(9.5rem,0.82fr)_minmax(5.25rem,0.42fr)]'
    : mirror
      ? 'grid-rows-[minmax(5.75rem,0.44fr)_minmax(12rem,0.86fr)]'
      : 'grid-rows-[minmax(12rem,0.86fr)_minmax(5.75rem,0.44fr)]';
  const stagingCardClassName = compact ? 'h-[min(8rem,100%)]' : 'h-[min(10.75rem,100%)]';

  useCloseOnOutsidePointerDown(Boolean(onMove && activeStagingCard), [activeStagingTriggerRef, stagingMenuRef], () => setActiveStagingCardId(null));

  function handleStagingMove(instanceId: string, target: ZoneId) {
    if (!onMove) {
      return;
    }

    onMove(instanceId, 'staging', target);
    setActiveStagingCardId(null);
    setPreviewCard(null);
  }

  return (
    <section className="relative grid min-h-0 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
      <CardZoomPreview card={previewCard} />
      <div className={`grid min-h-0 ${rowsClassName} gap-3`}>
        <div className={`grid min-h-0 grid-cols-[minmax(0,1fr)_1px_auto] rounded-md border border-[color:var(--border)]/65 bg-[color:var(--surface-muted)]/10 ${mirror ? 'order-2' : 'order-1'}`}>
          <div className="deck-builder-scroll flex min-h-0 items-center gap-3 overflow-x-auto overflow-y-hidden px-3 py-1.5">
            {stagingCards.length === 0 ? (
              <p className="flex h-full w-full items-center justify-center text-center text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                Staging
              </p>
            ) : (
              stagingCards.map((instance) => (
                <div key={instance.instanceId} className="relative flex h-full flex-none items-center">
                  <button
                    ref={activeStagingCardId === instance.instanceId ? activeStagingTriggerRef : undefined}
                    type="button"
                    onClick={() => onMove && setActiveStagingCardId((current) => (current === instance.instanceId ? null : instance.instanceId))}
                    onMouseEnter={() => setPreviewCard(instance.card)}
                    onFocus={() => setPreviewCard(instance.card)}
                    onMouseLeave={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
                    onBlur={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
                    className={`relative aspect-[5/7] ${stagingCardClassName} overflow-hidden rounded-md border-2 border-black/25 bg-[color:var(--surface-muted)] shadow-lg transition hover:border-[color:var(--accent)] hover:shadow-[0_0_1rem_rgba(241,143,59,0.38)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]`}
                    aria-expanded={activeStagingCardId === instance.instanceId}
                    aria-haspopup={onMove ? 'menu' : undefined}
                  >
                    {instance.card.imageSrc ? (
                      <Image src={instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" />
                    ) : null}
                  </button>
                </div>
              ))
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
        <div className={`relative flex min-h-0 flex-col rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/25 ${mirror ? 'order-1' : 'order-2'}`}>
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
                    className="relative aspect-[5/7] h-20 flex-none overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md"
                    aria-hidden="true"
                  >
                    <Image src={CARD_BACK_IMAGE_SRC} alt="" fill sizes="56px" className="object-cover" />
                  </div>
                ))
              )}
              </div>
            </div>
            <div className="min-h-0 bg-[color:var(--border)]/70" aria-hidden="true" />
            <div className="flex min-h-0 w-20 items-center justify-center px-0">
              <CompactZoneStack label="Graveyard" cards={graveyardCards} />
            </div>
          </div>
        </div>
        {activeStagingCard && onMove ? (
          <div ref={stagingMenuRef} className="absolute left-1/2 top-6 z-50 w-52 -translate-x-1/2 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-2xl">
            {stagingTargets.map((target) => (
              <button
                key={target}
                type="button"
                role="menuitem"
                onClick={() => handleStagingMove(activeStagingCard.instanceId, target)}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:bg-[color:var(--surface-muted)]"
              >
                {target === 'deck' ? 'To deck' : `Move to ${ZONE_LABELS[target]}`}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HandStrip({
  cards,
  onMove,
}: {
  cards: GameCardInstance[];
  onMove: (instanceId: string, fromZone: ZoneId, toZone: ZoneId) => void;
}) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const activeHandTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handMenuRef = useRef<HTMLDivElement | null>(null);
  const activeInstance = cards.find((instance) => instance.instanceId === activeCardId) ?? null;
  const actionTargets: ZoneId[] = ['staging', 'supply', 'battlefieldLeft', 'battlefieldCenter', 'battlefieldRight', 'graveyard'];

  useCloseOnOutsidePointerDown(activeInstance !== null, [activeHandTriggerRef, handMenuRef], closeHandMenu);

  function closeHandMenu() {
    setActiveCardId(null);
    setPreviewCard(null);
  }

  function handleMove(instanceId: string, target: ZoneId) {
    onMove(instanceId, 'hand', target);
    closeHandMenu();
  }

  return (
    <section className="fixed inset-x-0 bottom-0 z-40 px-3 pt-2 xl:left-[13.5rem] xl:right-4">
      {activeInstance ? (
        <div ref={handMenuRef} className="absolute bottom-[6.75rem] left-1/2 z-50 w-[min(94vw,32rem)] -translate-x-1/2 overflow-hidden rounded-xl border-2 border-[color:var(--accent)] bg-[color:var(--surface)] shadow-2xl shadow-black/40">
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
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {actionTargets.map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => handleMove(activeInstance.instanceId, target)}
                    className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-semibold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)]/15 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                  >
                    {target === 'supply' ? 'Supply' : `Move to ${ZONE_LABELS[target]}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <CardZoomPreview card={previewCard} />
      {cards.length === 0 ? (
        <p className="mx-auto max-w-4xl rounded-md border border-dashed border-[color:var(--border)] px-3 py-4 text-center text-sm text-[color:var(--text-secondary)]">
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
              '--hand-card-y': `${44 + verticalOffset}px`,
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
                onClick={() => setActiveCardId((current) => (current === instance.instanceId ? null : instance.instanceId))}
                onMouseEnter={() => setPreviewCard(instance.card)}
                onFocus={() => setPreviewCard(instance.card)}
                onMouseLeave={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
                onBlur={() => setPreviewCard((current) => (current?.id === instance.card.id ? null : current))}
                className="group flex w-28 translate-y-[var(--hand-card-y)] rotate-[var(--hand-card-rotation)] rounded-md focus:outline-none transition-transform duration-200 hover:translate-y-6 hover:rotate-0 focus-visible:translate-y-6 focus-visible:rotate-0"
                style={handCardStyle}
                aria-expanded={activeCardId === instance.instanceId}
                aria-haspopup="menu"
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

function OpponentHandStrip({ cards }: { cards: GameCardInstance[] }) {
  return (
    <section className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pb-2 xl:left-[13.5rem] xl:right-4">
      {cards.length === 0 ? (
        <p className="mx-auto max-w-4xl rounded-md border border-dashed border-[color:var(--border)] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
          Opponent hand
        </p>
      ) : (
        <div className="mx-auto flex h-28 max-w-4xl items-start justify-center overflow-visible px-2 pt-0">
          {cards.map((instance, index) => {
            const midpoint = (cards.length - 1) / 2;
            const offsetFromCenter = index - midpoint;
            const rotation = Math.max(-12, Math.min(12, offsetFromCenter * 3.2));
            const verticalOffset = Math.min(10, Math.abs(offsetFromCenter) * 1.4);
            const handCardStyle = {
              '--opponent-hand-card-y': `${-36 - verticalOffset}px`,
              '--opponent-hand-card-rotation': `${rotation}deg`,
              transformOrigin: '50% -15%',
            } as CSSProperties;

            return (
              <article
                key={instance.instanceId}
                className="relative flex w-16 flex-none justify-center"
                style={{ zIndex: index + 1 }}
              >
                <div
                  className="relative aspect-[5/7] w-28 translate-y-[var(--opponent-hand-card-y)] rotate-[var(--opponent-hand-card-rotation)] overflow-hidden rounded-md border-2 border-black/25 bg-[color:var(--surface-muted)] shadow-xl shadow-black/30"
                  style={handCardStyle}
                >
                  <Image src={CARD_BACK_IMAGE_SRC} alt="" fill sizes="112px" className="object-cover" />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function PlaytestClient({ locale, initialCards, initialError, initialMode = 'lobby' }: PlaytestClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedMode, setSelectedMode] = useState<PlayMode>('practice');
  const [selectedQueue, setSelectedQueue] = useState<PlayQueue>('casual');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [selectedBotDeckId, setSelectedBotDeckId] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConcedeDialogOpen, setIsConcedeDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [matchSetupError, setMatchSetupError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isMatchRoute) {
      return;
    }

    document.body.classList.add('playtest-route-active');

    return () => {
      document.body.classList.remove('playtest-route-active');
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
        .select('id,title,created_at,deck_cards(*)')
        .eq('user_id', userResult.user.id)
        .order('created_at', { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Failed to load playtest decks', error);
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
    setGameState(buildInitialGameState(matchDeck, matchBotDeck));
  }, [decks, gameState, isMatchRoute, status]);

  function startSelectedDeck() {
    if (!selectedDeck || !selectedBotDeck || selectedMode !== 'practice') {
      return;
    }

    if (isMatchRoute) {
      setGameState(buildInitialGameState(selectedDeck, selectedBotDeck));
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        MATCH_SESSION_STORAGE_KEY,
        JSON.stringify({ deckId: selectedDeck.id, botDeckId: selectedBotDeck.id } satisfies MatchSessionPayload)
      );
    }

    router.push(matchHref);
  }

  function returnToLobby() {
    setIsConcedeDialogOpen(false);
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

  function drawCards(count: number) {
    setGameState((previous) => {
      if (!previous || previous.zones.deck.length === 0) {
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

  function moveCard(instanceId: string, fromZone: ZoneId, toZone: ZoneId) {
    setGameState((previous) => {
      if (!previous) {
        return previous;
      }

      const card = previous.zones[fromZone].find((instance) => instance.instanceId === instanceId);
      if (!card) {
        return previous;
      }

      if (BATTLEFIELD_ZONES.has(toZone) && previous.zones[toZone].length >= 1) {
        return {
          ...previous,
          log: addLogEntry(previous, { suffix: `${ZONE_LABELS[toZone]} already has a card.` }),
        };
      }

      const nextZones = {
        ...previous.zones,
        [fromZone]: previous.zones[fromZone].filter((instance) => instance.instanceId !== instanceId),
        [toZone]: toZone === 'deck' ? [...previous.zones[toZone], card] : [card, ...previous.zones[toZone]],
      };

      return {
        ...previous,
        zones: nextZones,
        log: addLogEntry(previous, {
          prefix: 'Moved ',
          cardName: card.card.name,
          suffix: ` from ${ZONE_LABELS[fromZone]} to ${ZONE_LABELS[toZone]}.`,
        }),
      };
    });
  }

  function shuffleLibrary() {
    setGameState((previous) => {
      if (!previous) {
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

  function advanceTurn() {
    setGameState((previous) => {
      if (!previous) {
        return previous;
      }

      const nextTurn = previous.turn + 1;
      return {
        ...previous,
        turn: nextTurn,
        log: addLogEntry(previous, { suffix: `Advanced to turn ${nextTurn}.` }),
      };
    });
  }

  function resetGame() {
    if (selectedDeck) {
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
          <p className="text-sm text-[color:var(--text-secondary)]">Sign in to playtest your saved decks.</p>
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
          <p className="text-sm text-[color:var(--text-secondary)]">Save a deck before starting a playtest session.</p>
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
                        <label htmlFor="playtest-bot-deck" className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                          Bot deck
                        </label>
                        <select
                          id="playtest-bot-deck"
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
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(12rem,0.48fr)_minmax(0,2.63fr)]">
          <div className="flex min-h-[18rem] min-w-0 flex-col gap-3 xl:min-h-0">
            <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
              <button type="button" onClick={returnToLobby} className="mb-2 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]">
                Back to lobby
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => drawCards(1)} className="inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]">
                  <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                  Draw 1
                </button>
                <button type="button" onClick={() => drawCards(7)} className="inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  Draw 7
                </button>
                <button type="button" onClick={() => setIsConcedeDialogOpen(true)} className="inline-flex items-center justify-center gap-1 rounded-md border border-red-500/45 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300 focus:outline-none focus-visible:ring focus-visible:ring-red-400">
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  Concede
                </button>
                <button type="button" onClick={advanceTurn} className="inline-flex items-center justify-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs font-semibold transition hover:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]">
                  <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Turn
                </button>
              </div>
            </section>
            <aside className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
              <header className="border-b border-[color:var(--border)] px-4 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide">Action log</h2>
              </header>
              <ol className="deck-builder-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm text-[color:var(--text-secondary)]">
                {gameState.log.map((entry) => (
                  <li key={entry.id} className="rounded-md bg-[color:var(--surface-muted)]/60 px-3 py-2">
                    {entry.prefix}
                    {entry.cardName ? <strong className="font-bold text-[color:var(--text-primary)]">{entry.cardName}</strong> : null}
                    {entry.suffix}
                  </li>
                ))}
              </ol>
            </aside>
          </div>
          <div className="grid min-h-[38rem] grid-rows-[minmax(13.5rem,0.9fr)_minmax(6.25rem,0.44fr)_minmax(12rem,1fr)] gap-2 xl:min-h-0">
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
              <BattlefieldPanel zone="battlefieldLeft" cards={gameState.zones.battlefieldLeft} onMove={moveCard} />
              <BattlefieldPanel zone="battlefieldCenter" cards={gameState.zones.battlefieldCenter} onMove={moveCard} />
              <BattlefieldPanel zone="battlefieldRight" cards={gameState.zones.battlefieldRight} onMove={moveCard} />
            </div>
            <CombinedStagingSupplyPanel
              stagingCards={gameState.zones.staging}
              supplyCards={gameState.zones.supply}
              graveyardCards={gameState.zones.graveyard}
              banishCards={gameState.zones.banish}
              deckCards={gameState.zones.deck}
              onMove={moveCard}
            />
          </div>
        </div>
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
        <OpponentHandStrip cards={gameState.opponentZones.hand} />
        <HandStrip cards={gameState.zones.hand} onMove={moveCard} />
      </div>
    );
  })();

  return (
    <main className="deck-builder-workspace flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-8 pt-4 text-[color:var(--text-primary)] lg:px-6">
      {content}
    </main>
  );
}
