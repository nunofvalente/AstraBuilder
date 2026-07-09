'use client';

import Image from 'next/image';
import type { Locale } from '@/i18n/config';
import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';

import type { Card } from '../create/deck-builder/types';
import { type GameCardInstance, type GameState } from './game-rules';
import { getPlayBoardCopy, translateGameLogText } from './play-localization';
import { CARD_BACK_IMAGE_SRC } from './game-client-support';

export function useCloseOnOutsidePointerDown(
  isOpen: boolean,
  refs: Array<RefObject<HTMLElement | null>>,
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

export function CardZoomPreview({
  card = null,
  cards = null,
  interactive = false,
  zIndexClassName = 'z-50',
  onMouseEnter,
  onMouseLeave,
}: {
  card?: Card | null;
  cards?: GameCardInstance[] | null;
  interactive?: boolean;
  zIndexClassName?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const previewCards =
    cards && cards.length > 0
      ? cards
      : card
        ? [{ instanceId: `preview-${card.id}`, owner: 'player' as const, card, ready: true, faceDown: false, attachedToInstanceId: null, damage: 0, retreatLockedUntilNextTurn: false }]
        : [];

  if (previewCards.length === 0) {
    return null;
  }

  const hostCard = previewCards[0] ?? null;
  const attachedCards = previewCards.slice(1);

  return (
    <div
      data-card-zoom-preview
      className={`${interactive ? 'pointer-events-auto' : 'pointer-events-none'} fixed right-5 top-20 ${zIndexClassName} hidden w-80 lg:block`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-2 shadow-2xl shadow-black/40">
        <div className="relative aspect-[5/7] w-full flex-none overflow-hidden rounded-md bg-[color:var(--surface-muted)]">
          {hostCard?.card.imageSrc ? (
            <div className="relative z-10 h-full w-full">
              <Image
                src={hostCard.faceDown ? CARD_BACK_IMAGE_SRC : hostCard.card.imageSrc}
                alt=""
                fill
                sizes="320px"
                className="object-cover"
                priority={false}
              />
            </div>
          ) : null}
        </div>
        {attachedCards.length > 0 ? (
          <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-md border border-[color:var(--border)]/70 bg-black/20">
            <div className="deck-builder-scroll flex h-full flex-col items-center gap-3 overflow-y-auto p-3 pr-2">
              {attachedCards.map((instance) => (
                <div
                  key={instance.instanceId}
                  className="relative aspect-[5/7] h-[17rem] flex-none overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md"
                  title={instance.card.name}
                >
                  {instance.card.imageSrc ? <Image src={instance.card.imageSrc} alt="" fill sizes="208px" className="object-cover" /> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function getReadyStateClassName(instance: GameCardInstance): string {
  return instance.ready ? '' : 'rotate-90 opacity-85';
}

export function AttachedEquipmentCards({
  cards,
  cardHeight,
  offset,
  exposedHeight,
  interactive = false,
  onCardMouseEnter,
  onCardMouseLeave,
}: {
  cards: GameCardInstance[];
  cardHeight: number;
  offset: number;
  exposedHeight: number;
  interactive?: boolean;
  onCardMouseEnter?: (instance: GameCardInstance) => void;
  onCardMouseLeave?: (instance: GameCardInstance) => void;
}) {
  if (cards.length === 0) {
    return null;
  }

  const containerHeight = exposedHeight + Math.max(0, cards.length - 1) * offset;

  return (
    <div className={`${interactive ? 'pointer-events-auto' : 'pointer-events-none'} relative flex justify-center`} aria-hidden="true" style={{ height: `${containerHeight}px` }}>
      {cards.map((instance, index) => (
        <div
          key={instance.instanceId}
          className="absolute top-0 aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md"
          style={{
            height: `${cardHeight}px`,
            transform: `translateY(${index * offset}px)`,
            zIndex: cards.length - index,
          }}
          title={instance.card.rulesText || instance.card.name}
          onMouseEnter={() => onCardMouseEnter?.(instance)}
          onMouseLeave={() => onCardMouseLeave?.(instance)}
        >
          {instance.card.imageSrc ? <Image src={instance.card.imageSrc} alt="" fill sizes="128px" className="object-cover" /> : null}
        </div>
      ))}
    </div>
  );
}

export function CompactZoneStack({
  label,
  cards,
  faceDown = false,
  compact = false,
  onClick,
}: {
  label: string;
  cards: GameCardInstance[];
  faceDown?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const topCard = cards[0] ?? null;
  const showCardImage = cards.length > 0 && (faceDown || topCard?.card.imageSrc);
  const stackContent = (
    <>
      <div
        className={`relative aspect-[5/7] overflow-hidden rounded-md border border-black/30 bg-[color:var(--surface)] shadow-md ${
          compact ? 'h-16' : 'h-20'
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
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`grid min-h-0 w-full place-items-center transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
          compact ? 'grid-rows-[auto_auto] px-1 py-1' : 'grid-rows-[1fr_auto] px-2 py-1.5'
        }`}
      >
        {stackContent}
      </button>
    );
  }

  return (
    <div className={`grid min-h-0 w-full place-items-center ${
      compact ? 'grid-rows-[auto_auto] px-1 py-1' : 'grid-rows-[1fr_auto] px-2 py-1.5'
    }`}>
      {stackContent}
    </div>
  );
}

export function OpponentHandStrip({ cards, locale = 'en' }: { cards: GameCardInstance[]; locale?: Locale }) {
  const copy = getPlayBoardCopy(locale);
  return (
    <section className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pb-2 xl:left-[13.5rem] xl:right-4">
      {cards.length === 0 ? (
        <p className="mx-auto max-w-4xl rounded-md border border-dashed border-[color:var(--border)] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
          {copy.opponentHand}
        </p>
      ) : (
        <div className="mx-auto flex h-28 max-w-4xl items-start justify-center overflow-visible px-2 pt-0">
          {cards.map((instance, index) => {
            const midpoint = (cards.length - 1) / 2;
            const offsetFromCenter = index - midpoint;
            const rotation = Math.max(-10, Math.min(10, offsetFromCenter * 2.8));
            const verticalOffset = Math.min(10, Math.abs(offsetFromCenter) * 1.4);
            const handCardStyle = {
              '--opponent-hand-card-y': `${-36 - verticalOffset}px`,
              '--opponent-hand-card-rotation': `${rotation}deg`,
              transformOrigin: '50% -15%',
            } as CSSProperties;
            const revealedUntilEndOfTurn = instance.solaraRevealedFromDeckUntilTurn !== undefined;

            return (
              <article
                key={instance.instanceId}
                className="relative flex w-16 flex-none justify-center"
                style={{ zIndex: index + 1 }}
              >
                <div
                  className="relative aspect-[5/7] w-28 translate-y-[var(--opponent-hand-card-y)] rotate-[var(--opponent-hand-card-rotation)] transform-gpu overflow-hidden rounded-md border-2 border-black/25 bg-[color:var(--surface-muted)] shadow-xl shadow-black/30"
                  style={handCardStyle}
                >
                  <Image
                    src={revealedUntilEndOfTurn ? instance.card.imageSrc : CARD_BACK_IMAGE_SRC}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                  {revealedUntilEndOfTurn ? (
                    <span
                      className="absolute left-1 top-1 rounded bg-amber-300/95 px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-wide text-black shadow shadow-black/40"
                      aria-label={`${instance.card.name} was revealed until end of turn`}
                      title={`${instance.card.name} was revealed until end of turn`}
                    >
                      Revealed
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function VictoryPointScoreControl({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone: 'player' | 'opponent';
}) {
  const toneClassName =
    tone === 'player'
      ? 'border-[color:var(--accent)]/45 bg-[linear-gradient(135deg,rgba(241,143,59,0.18),rgba(44,180,120,0.10),rgba(0,0,0,0.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_1rem_rgba(241,143,59,0.08)]'
      : 'border-red-400/45 bg-[linear-gradient(135deg,rgba(239,68,68,0.18),rgba(127,29,29,0.12),rgba(0,0,0,0.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_1rem_rgba(239,68,68,0.08)]';
  const topBarClassName = tone === 'player' ? 'bg-[color:var(--accent)]' : 'bg-red-400';

  return (
    <div className={`relative overflow-hidden rounded-md border p-2 ${toneClassName}`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${topBarClassName}`} aria-hidden="true" />
      <div className="flex items-center justify-center">
        <p className="truncate text-[0.65rem] font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">{label}</p>
      </div>
      <div className="mt-2 grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2">
        <div className="h-px bg-[color:var(--border)]/80" aria-hidden="true" />
        <div className="min-w-0 rounded-md border border-white/10 bg-black/20 py-1 text-center text-3xl font-black leading-none text-[color:var(--text-primary)] shadow-inner">
          {value ?? 0}
        </div>
        <div className="h-px bg-[color:var(--border)]/80" aria-hidden="true" />
      </div>
    </div>
  );
}

export function RequiredActionToast({
  message,
  actions,
}: {
  message: string | null;
  actions?: ReactNode;
}) {
  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[24rem] z-50 flex justify-center px-4 xl:left-[13.5rem] xl:right-4">
      <div className="max-w-lg rounded-lg border border-[color:var(--accent)]/55 bg-[color:var(--surface)]/95 px-4 py-3 text-center text-sm font-bold text-[color:var(--text-primary)] shadow-2xl shadow-black/35 backdrop-blur">
        {message}
        {actions ? <div className="mt-3 flex justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function getLogGroupLabel(entry: GameState['log'][number], locale: Locale): string {
  const copy = getPlayBoardCopy(locale);
  if (entry.phase === 'setup') {
    return copy.setup;
  }

  if (typeof entry.turn === 'number') {
    return `${copy.turn} ${entry.turn}`;
  }

  return copy.log;
}

function LogEntryMessage({ entry, locale }: { entry: GameState['log'][number]; locale: Locale }) {
  const message = translateGameLogText(locale, `${entry.prefix ?? ''}${entry.cardName ?? ''}${entry.suffix}`);
  const cardNames = [...new Set([
    ...(entry.cardNames ?? []),
    ...(entry.cardName ? [entry.cardName] : []),
  ])].filter((name) => name.length > 0).sort((left, right) => right.length - left.length);

  if (cardNames.length === 0) {
    return message;
  }

  const escapedNames = cardNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const cardNamePattern = new RegExp(`(${escapedNames.join('|')})`, 'g');
  const cardNameSet = new Set(cardNames);

  return message.split(cardNamePattern).map((part, index) => (
    cardNameSet.has(part)
      ? <strong key={`${part}-${index}`} className="font-bold text-[color:var(--text-primary)]">{part}</strong>
      : part
  ));
}

export function ActionLogList({ entries, locale = 'en' }: { entries: GameState['log']; locale?: Locale }) {
  const groups: Array<{ label: string; entries: GameState['log'] }> = [];

  for (const entry of entries) {
    const label = getLogGroupLabel(entry, locale);
    const currentGroup = groups[groups.length - 1];

    if (currentGroup?.label === label) {
      currentGroup.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }

  return (
    <>
      {groups.map((group) => (
        <li key={`${group.label}-${group.entries[0]?.id}`} className="flex flex-col gap-2">
          <h3 className="text-center text-xs font-black uppercase tracking-wide text-[color:var(--text-primary)] underline decoration-[color:var(--accent)] decoration-2 underline-offset-4">
            {group.label}
          </h3>
          <ol className="flex flex-col gap-2">
            {group.entries.map((entry) => (
              <li key={entry.id} className="rounded-md bg-[color:var(--surface-muted)]/60 px-3 py-2">
                <LogEntryMessage entry={entry} locale={locale} />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </>
  );
}
