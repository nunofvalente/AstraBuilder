import Image from 'next/image';
import { CARD_IMAGE_SIZES } from '../constants';
import { getCardImageVariantUrl } from '../image-url';
import type { Card } from '../types';
import type { ZoomAnchor } from './zoom-overlay';

export type CardLibraryProps = {
  cards: Card[];
  deck: Record<string, number>;
  isLoading: boolean;
  errorMessage: string | null;
  noResultsLabel: string;
  skeletonCount: number;
  addButtonLabel: string;
  zoomButtonLabel: string;
  onAdd: (cardId: string) => void;
  onZoom: (card: Card | null, variant?: 'default' | 'compact', anchor?: ZoomAnchor | null) => void;
};

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
}: CardLibraryProps) {
  if (isLoading) {
    return (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 xl:gap-2 2xl:grid-cols-6 min-[2200px]:grid-cols-7">
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
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 xl:gap-2 2xl:grid-cols-6 min-[2200px]:grid-cols-7">
      {cards.map((card) => {
        const copies = deck[card.id] ?? 0;
        const isSelected = copies > 0;
        const isMaxed = copies >= 3;

        const thumbnailSrc = getCardImageVariantUrl(card.imageSrc, 'small');

        return (
          <li key={card.id}>
            <div className="group relative h-full">
              <button
                type="button"
                onClick={() => {
                  if (isMaxed) {
                    return;
                  }
                  onAdd(card.id);
                }}
                aria-label={`${addButtonLabel} ${card.name}`}
                aria-disabled={isMaxed}
                disabled={isMaxed}
                className={`relative block h-full w-full focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                  isMaxed ? 'cursor-not-allowed opacity-90' : ''
                }`}
              >
                <span className="sr-only">{card.detailLabel}</span>
                <div
                  className={`relative overflow-hidden rounded-none shadow-md transition-transform duration-150 group-hover:-translate-y-1 group-hover:shadow-2xl ${
                    isSelected ? 'ring-2 ring-[color:var(--accent)]' : ''
                  }`}
                >
                  <Image
                    src={thumbnailSrc}
                    alt={card.name}
                    width={220}
                    height={308}
                    className="h-auto w-full select-none"
                    sizes={CARD_IMAGE_SIZES}
                    loading="lazy"
                    fetchPriority="low"
                  />
                  {copies > 0 ? (
                    <span className="absolute bottom-2 right-2 inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-xs font-semibold text-[color:var(--text-on-accent)] shadow-md">
                      x{copies}
                    </span>
                  ) : null}
                </div>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onZoom(card);
                }}
                aria-label={`${zoomButtonLabel} ${card.name}`}
                className="pointer-events-auto absolute right-2 top-2 z-10 rounded-full border border-white/80 bg-black/70 p-2 text-white opacity-0 transition hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                >
                  <path d="m21 21-4.35-4.35" />
                  <circle cx="11" cy="11" r="6" />
                </svg>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
