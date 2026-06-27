import Image from 'next/image';
import type { CSSProperties } from 'react';
import { Search } from 'lucide-react';
import { CARD_IMAGE_SIZES } from '../constants';
import { getCardImageVariantUrl } from '../image-url';
import type { Card } from '../types';
import type { ZoomAnchor } from './zoom-overlay';
import { getAffinityBaseColor } from '@/lib/cards/affinity';

export type CardLibraryProps = {
  cards: Card[];
  deck: Record<string, number>;
  isLoading: boolean;
  errorMessage: string | null;
  noResultsLabel: string;
  skeletonCount: number;
  addButtonLabel?: string;
  zoomButtonLabel: string;
  onAdd?: (cardId: string) => void;
  onZoom: (card: Card | null, variant?: 'default' | 'compact', anchor?: ZoomAnchor | null) => void;
  readOnly?: boolean;
  gridClassName?: string;
};

const DEFAULT_GRID_CLASS_NAME =
  'deck-builder-card-grid grid gap-4';

export function CardLibrary({
  cards,
  deck,
  isLoading,
  errorMessage,
  noResultsLabel,
  skeletonCount,
  addButtonLabel,
  zoomButtonLabel,
  onAdd,
  onZoom,
  readOnly = false,
  gridClassName = DEFAULT_GRID_CLASS_NAME,
}: CardLibraryProps) {
  if (isLoading) {
    return (
      <ul className={gridClassName}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <li key={index}>
            <div className="aspect-[5/7] w-full animate-pulse rounded-none bg-[color:var(--surface-muted)]" />
          </li>
        ))}
      </ul>
    );
  }

  if (errorMessage) {
    return <p className="text-center text-sm text-[color:var(--text-secondary)]">{errorMessage}</p>;
  }

  if (cards.length === 0) {
    return <p className="text-center text-sm text-[color:var(--text-secondary)]">{noResultsLabel}</p>;
  }

  return (
    <ul className={gridClassName}>
      {cards.map((card) => {
        const copies = deck[card.id] ?? 0;
        const isSelected = copies > 0;
        const isMaxed = copies >= 3;
        const isAddDisabled = readOnly || isMaxed || !onAdd;

        const thumbnailSrc = getCardImageVariantUrl(card.imageSrc, 'large');
        const cardAccent = getAffinityBaseColor(card.affinity);
        const cardFrameStyle = {
          '--card-accent': cardAccent,
        } as CSSProperties;
        const cardFrame = (
          <div
            style={cardFrameStyle}
            className={`deck-builder-card-frame relative overflow-hidden rounded-md border bg-black/15 shadow-md transition duration-150 group-hover:-translate-y-1 group-hover:shadow-2xl ${
              isSelected
                ? 'deck-builder-card-frame-selected border-[color:var(--card-accent)] ring-2 ring-[color:var(--card-accent)]/55'
                : 'border-black/20'
            }`}
          >
            <Image
              src={thumbnailSrc}
              alt={card.name}
              width={220}
              height={308}
              className="h-auto w-full select-none"
              sizes={CARD_IMAGE_SIZES}
              quality={95}
              loading="lazy"
              fetchPriority="low"
            />
            {copies > 0 ? (
              <span className="absolute bottom-2 right-2 inline-flex min-w-8 items-center justify-center rounded-full bg-[color:var(--accent)] px-2 py-1 text-xs font-bold text-[color:var(--text-on-accent)] shadow-lg shadow-black/35">
                x{copies}
              </span>
            ) : null}
            {isMaxed ? (
              <span className="absolute left-2 top-2 rounded-full border border-white/25 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
                Max
              </span>
            ) : null}
          </div>
        );

        return (
          <li key={card.id}>
            <div className="group relative h-full">
              {readOnly ? (
                <div className="relative block h-full w-full">
                  <span className="sr-only">{card.detailLabel}</span>
                  {cardFrame}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isAddDisabled) {
                      return;
                    }
                    onAdd(card.id);
                  }}
                  aria-label={`${addButtonLabel ?? 'Add'} ${card.name}`}
                  aria-disabled={isAddDisabled}
                  disabled={isAddDisabled}
                  className={`relative block h-full w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
                    isAddDisabled ? 'cursor-not-allowed opacity-90' : ''
                  }`}
                >
                  <span className="sr-only">{card.detailLabel}</span>
                  {cardFrame}
                </button>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onZoom(card);
                }}
                aria-label={`${zoomButtonLabel} ${card.name}`}
                className="pointer-events-auto absolute right-2 top-2 z-10 rounded-full border border-white/80 bg-black/70 p-2 text-white opacity-0 shadow-lg transition hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
