'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Card, CostBucket, DeckEntry } from '../types';
import { DeckCardChip } from './deck-card-chip';

const CARD_TYPE_ORDER = ['Unit', 'Tactic', 'Territory'];
const FALLBACK_TYPE_LABEL = 'Other';

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
    addButton: string;
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
  onAdd: (cardId: string) => void;
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
  onAdd,
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

  const sections = useMemo(() => {
    if (deckEntries.length === 0) {
      return [];
    }

    const groups = new Map<string, { label: string; entries: DeckEntry[] }>();

    for (const entry of deckEntries) {
      const rawType = entry.card.type?.trim();
      const label = rawType && rawType.length > 0 ? rawType : FALLBACK_TYPE_LABEL;
      const key = label.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(key, { label, entries: [entry] });
      }
    }

    const getPriority = (label: string) => {
      const index = CARD_TYPE_ORDER.findIndex((type) => type.toLowerCase() === label.toLowerCase());
      return index === -1 ? CARD_TYPE_ORDER.length : index;
    };

    return Array.from(groups.values())
      .map(({ label, entries }) => ({
        type: label,
        entries,
        total: entries.reduce((sum, item) => sum + item.count, 0),
      }))
      .sort((a, b) => {
        const priorityDiff = getPriority(a.type) - getPriority(b.type);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return a.type.localeCompare(b.type);
      });
  }, [deckEntries]);

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
            <div className="flex flex-col gap-6">
              {sections.map((section) => (
                <section key={section.type} className="flex flex-col gap-3">
                  <header className="flex items-center justify-between px-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                      {section.type}
                    </h3>
                    <span className="text-xs text-[color:var(--text-secondary)]">x{section.total}</span>
                  </header>
                  <ul className="flex flex-col gap-2">
                    {section.entries.map(({ card, count }) => (
                      <DeckCardChip
                        key={card.id}
                        card={card}
                        count={count}
                        labels={{ add: labels.addButton, remove: labels.removeButton }}
                        onIncrement={onAdd}
                        onDecrement={onRemove}
                        onZoom={onZoom}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}
