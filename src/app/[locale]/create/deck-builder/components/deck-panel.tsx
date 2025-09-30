'use client';

import Image from 'next/image';

import type { Card, CostBucket, DeckEntry } from '../types';

export type DeckPanelProps = {
  deckEntries: DeckEntry[];
  totalCards: number;
  costBuckets: CostBucket[];
  maxBucketCount: number;
  labels: {
    deckHeading: string;
    totalCardsLabel: string;
    emptyDeck: string;
    removeButton: string;
    costCurveHeading: string;
    costCurveEmpty: string;
    menuButton: string;
    exportOptionTTS: string;
  };
  onRemove: (cardId: string) => void;
  onZoom: (card: Card | null, variant?: 'default' | 'compact') => void;
  onOpenMenu: () => void;
};

export function DeckPanel({ deckEntries, totalCards, costBuckets, maxBucketCount, labels, onRemove, onZoom, onOpenMenu }: DeckPanelProps) {
  return (
    <aside className="flex min-h-0 min-w-0 basis-1/2 flex-1 flex-col xl:basis-1/3">
      <section className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible rounded-none border border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{labels.deckHeading}</h2>
            <button
              type="button"
              onClick={onOpenMenu}
              className="flex items-center gap-2 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-on-accent)] transition-colors hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            >
              <span>{labels.menuButton}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          <span className="text-xs text-[color:var(--text-secondary)]">
            {labels.totalCardsLabel}: {totalCards}
          </span>
        </div>
        <div className="border-b border-[color:var(--border)] px-4 py-4">
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{labels.costCurveHeading}</h3>
          {totalCards === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--text-secondary)]">{labels.costCurveEmpty}</p>
          ) : (
            <div className="mt-4 flex items-end gap-3">
              {costBuckets.map((bucket) => {
                const hasCards = maxBucketCount > 0;
                const height = hasCards ? Math.max((bucket.count / maxBucketCount) * 120, 4) : 0;

                return (
                  <div key={bucket.cost} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="flex w-full items-end justify-center rounded bg-[color:var(--accent)]/80"
                      style={{ height: `${height}px` }}
                      aria-label={`${bucket.count} cards with cost ${bucket.cost}`}
                    >
                      <span className="pb-1 text-xs font-semibold text-[color:var(--text-on-accent)]">{bucket.count}</span>
                    </div>
                    <span className="text-xs text-[color:var(--text-secondary)]">{bucket.cost}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {deckEntries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">{labels.emptyDeck}</p>
        ) : (
          <div className="deck-scroll flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4">
            <ul className="flex flex-col gap-3">
              {deckEntries.map(({ card, count }) => (
                <li
                  key={card.id}
                  className="group flex items-center gap-3 rounded-none border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 p-2"
                >
                  <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-none lg:h-24 lg:w-16">
                    <button
                      type="button"
                      onClick={() => onZoom(card)}
                      onMouseEnter={() => onZoom(card, 'compact')}
                      onMouseLeave={() => onZoom(null)}
                      onFocus={() => onZoom(card, 'compact')}
                      onBlur={() => onZoom(null)}
                      aria-label={`Zoom ${card.name}`}
                      className="group/image relative block h-full w-full overflow-hidden rounded-none focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                    >
                      <Image
                        src={card.imageSrc}
                        alt={card.name}
                        width={200}
                        height={280}
                        className="h-full w-full select-none object-cover transition-transform duration-150 group-hover/image:scale-110"
                        sizes="200px"
                      />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{card.name}</p>
                    <p className="truncate text-xs text-[color:var(--text-secondary)]">
                      {labels.totalCardsLabel}: {count} | {card.type} | Cost {card.cost}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-xs font-semibold text-[color:var(--text-on-accent)]">
                      x{count}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(card.id)}
                      className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[var(--surface)]"
                    >
                      {labels.removeButton}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </aside>
  );
}
