'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import type { Card, CostBucket, DeckEntry } from '../types';
import { getAffinityColorScheme } from '../constants';

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
    showCostCurve: string;
    hideCostCurve: string;
    menuButton: string;
    menuImport: string;
    menuExport: string;
    menuShare: string;
    menuSave: string;
  };
  onRemove: (cardId: string) => void;
  onZoom: (card: Card | null, variant?: 'default' | 'compact', anchorRect?: DOMRect | null) => void;
  onMenuSelect: (action: 'import' | 'export' | 'share' | 'save') => void;
  isCostCurveVisible: boolean;
  onToggleCostCurve: () => void;
};

export function DeckPanel({
  deckEntries,
  totalCards,
  costBuckets,
  maxBucketCount,
  labels,
  onRemove,
  onZoom,
  onMenuSelect,
  isCostCurveVisible,
  onToggleCostCurve,
}: DeckPanelProps) {
  const costCurveToggleLabel = isCostCurveVisible ? labels.hideCostCurve : labels.showCostCurve;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(target) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  function toggleMenu() {
    setIsMenuOpen((previous) => !previous);
  }

  function handleMenuAction(action: 'import' | 'export' | 'share' | 'save') {
    setIsMenuOpen(false);
    onMenuSelect(action);
  }

  return (
    <aside className="flex min-h-0 min-w-0 basis-1/2 flex-1 flex-col xl:basis-1/3">
      <section className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible rounded-none border border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{labels.deckHeading}</h2>
            <div className="relative" ref={menuContainerRef}>
              <button
                type="button"
                ref={menuButtonRef}
                onClick={toggleMenu}
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
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
                  className={`h-4 w-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-2 w-48 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('import')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
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
                      <path d="M12 3v12" />
                      <path d="M8.5 11.5 12 15l3.5-3.5" />
                      <path d="M5 19h14" />
                    </svg>
                    <span>{labels.menuImport}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('export')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
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
                      <path d="M12 21V9" />
                      <path d="M8.5 12.5 12 9l3.5 3.5" />
                      <path d="M5 5h14" />
                    </svg>
                    <span>{labels.menuExport}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('share')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
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
                      <circle cx="18" cy="5" r="2" />
                      <circle cx="6" cy="12" r="2" />
                      <circle cx="18" cy="19" r="2" />
                      <path d="M8 11l8-4" />
                      <path d="M8 13l8 4" />
                    </svg>
                    <span>{labels.menuShare}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('save')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
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
                      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-3-7 3V4a1 1 0 0 1 1-1z" />
                    </svg>
                    <span>{labels.menuSave}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                {labels.costCurveHeading}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isCostCurveVisible}
                onClick={onToggleCostCurve}
                className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                  isCostCurveVisible ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--border)]'
                }`}
              >
                <span className="sr-only">{costCurveToggleLabel}</span>
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform transform ${
                    isCostCurveVisible ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <span className="text-xs text-[color:var(--text-secondary)]">
              {labels.totalCardsLabel}: {totalCards}
            </span>
          </div>
        </div>
        {isCostCurveVisible ? (
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
        ) : null}
        {deckEntries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">{labels.emptyDeck}</p>
        ) : (
          <div className="deck-scroll flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4">
            <ul className="flex flex-col gap-3">
              {deckEntries.map(({ card, count }) => {
                const scheme = getAffinityColorScheme(card.affinity);
                return (
                  <li
                    key={card.id}
                    className="group flex items-center gap-3 rounded-md border p-2 transition-shadow hover:shadow-md"
                    style={{
                      background: scheme.gradient,
                      borderColor: scheme.borderColor,
                      color: scheme.textColor,
                    }}
                  >
                  <div className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-none lg:h-24 lg:w-16">
                    <button
                      type="button"
                      onClick={() => onZoom(card)}
                      onMouseEnter={(event) =>
                        onZoom(card, 'compact', event.currentTarget.getBoundingClientRect())
                      }
                      onMouseLeave={() => onZoom(null)}
                      onFocus={(event) =>
                        onZoom(card, 'compact', event.currentTarget.getBoundingClientRect())
                      }
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
                    <p className="truncate text-sm font-semibold" style={{ color: scheme.textColor }}>
                      {card.name}
                    </p>
                    <p className="truncate text-xs" style={{ color: scheme.mutedTextColor }}>
                      {labels.totalCardsLabel}: {count} | {card.type} | Cost {card.cost}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: scheme.chipBackground,
                        color: scheme.chipTextColor,
                      }}
                    >
                      x{count}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(card.id)}
                      className="rounded-md border px-2 py-1 text-xs font-medium transition"
                      style={{
                        backgroundColor: scheme.chipBackground,
                        borderColor: scheme.chipBackground,
                        color: scheme.chipTextColor,
                      }}
                    >
                      {labels.removeButton}
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </aside>
  );
}
