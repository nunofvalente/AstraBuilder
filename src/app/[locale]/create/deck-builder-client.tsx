'use client';

import { useEffect, useMemo, useState } from 'react';

import { AffinityFilterBar } from './deck-builder/components/affinity-filter-bar';
import { CardLibrary } from './deck-builder/components/card-library';
import { DeckPanel } from './deck-builder/components/deck-panel';
import { ZoomOverlay } from './deck-builder/components/zoom-overlay';
import {
  AFFINITY_FILTERS,
  AFFINITY_SORT_ORDER,
  CARD_SKELETON_COUNT,
} from './deck-builder/constants';
import type {
  Card,
  CardRow,
  CostBucket,
  DeckBuilderProps,
  DeckEntry,
} from './deck-builder/types';
import { normaliseCard } from './deck-builder/utils';
import { supabase } from '@/lib/supabase/supabaseClient';

const SORT_OPTIONS = [
  { value: 'affinity', label: 'Affinity (Nox first)' },
  { value: 'number', label: 'Card number' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

const DEFAULT_ZOOM_LABEL = 'Zoom';

export function DeckBuilder({ dictionary }: DeckBuilderProps) {
  const zoomButtonLabel = DEFAULT_ZOOM_LABEL;
  const { builder, cards: cardsCopy } = dictionary;
  const [searchTerm, setSearchTerm] = useState('');
  const [deck, setDeck] = useState<Record<string, number>>({});
  const [cards, setCards] = useState<Card[]>([]);
  const [activeAffinities, setActiveAffinities] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const filter of AFFINITY_FILTERS) {
      initial[filter.value] = true;
    }
    return initial;
  });
  const [sortOption, setSortOption] = useState<SortOption>('affinity');
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [zoomCard, setZoomCard] = useState<Card | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCards() {
      setIsLoadingCards(true);
      setCardsError(null);

      try {
        const { data, error } = await supabase
          .from<CardRow>('cards')
          .select(
            'id,name,affinity,artist,rarity,number,type,subtype,cost,attack,health,influence,rules_text,description,image_url',
          )
          .order('name', { ascending: true });

        if (!isMounted) {
          return;
        }

        if (error) {
          setCardsError(error.message ?? cardsCopy.error);
          setCards([]);
          return;
        }

        const rows = (data ?? []) as CardRow[];
        const nextCards = rows.map((row, index) => normaliseCard(row, index));
        setCards(nextCards);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : cardsCopy.error;
        setCardsError(message);
        setCards([]);
      } finally {
        if (isMounted) {
          setIsLoadingCards(false);
        }
      }
    }

    void loadCards();

    return () => {
      isMounted = false;
    };
  }, [cardsCopy.error]);

  useEffect(() => {
    if (cards.length === 0) {
      return;
    }

    setDeck((previous) => {
      const validIds = new Set(cards.map((card) => card.id));
      const nextEntries = Object.entries(previous).filter(([cardId]) => validIds.has(cardId));

      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [cards]);

  useEffect(() => {
    if (!zoomCard) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setZoomCard(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomCard]);

  const getAffinityIndex = (value: string) => {
    const index = AFFINITY_SORT_ORDER.indexOf(value);
    return index === -1 ? AFFINITY_SORT_ORDER.length : index;
  };

  const activeAffinitySet = useMemo(() => {
    const enabled = AFFINITY_FILTERS.filter((filter) => activeAffinities[filter.value]);
    if (enabled.length === AFFINITY_FILTERS.length) {
      return null;
    }

    return new Set(enabled.map((filter) => filter.value));
  }, [activeAffinities]);

  const filteredCards = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = cards.filter((card) => {
      const matchesAffinity = !activeAffinitySet || activeAffinitySet.has(card.affinity);
      if (!matchesAffinity) {
        return false;
      }

      if (term.length === 0) {
        return true;
      }

      return card.searchContent.includes(term);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortOption === 'number') {
        const aNumber = a.number ?? Number.POSITIVE_INFINITY;
        const bNumber = b.number ?? Number.POSITIVE_INFINITY;
        if (aNumber !== bNumber) {
          return aNumber - bNumber;
        }
      }

      const affinityDiff = getAffinityIndex(a.affinity) - getAffinityIndex(b.affinity);
      if (affinityDiff !== 0) {
        return affinityDiff;
      }

      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [cards, searchTerm, activeAffinitySet, sortOption]);

  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  const deckEntries = useMemo<DeckEntry[]>(() => {
    return Object.entries(deck)
      .map(([cardId, count]) => {
        const card = cardMap.get(cardId);
        if (!card) {
          return undefined;
        }
        return { card, count };
      })
      .filter((entry): entry is DeckEntry => Boolean(entry));
  }, [deck, cardMap]);

  const totalCards = useMemo(() => deckEntries.reduce((sum, entry) => sum + entry.count, 0), [deckEntries]);

  const highestCost = useMemo(() => cards.reduce((max, card) => (card.cost > max ? card.cost : max), 0), [cards]);

  const costBuckets = useMemo<CostBucket[]>(() => {
    const bucketRange = Array.from({ length: Math.max(highestCost + 1, 1) }, (_, cost) => cost);

    return bucketRange.map((cost) => {
      const count = deckEntries.reduce((sum, entry) => (entry.card.cost === cost ? sum + entry.count : sum), 0);
      return { cost, count };
    });
  }, [deckEntries, highestCost]);

  const maxBucketCount = costBuckets.reduce((max, bucket) => (bucket.count > max ? bucket.count : max), 0);

  function handleAddCard(cardId: string) {
    if (!cardMap.has(cardId)) {
      return;
    }

    setDeck((previous) => ({
      ...previous,
      [cardId]: (previous[cardId] ?? 0) + 1,
    }));
  }

  function handleRemoveCard(cardId: string) {
    setDeck((previous) => {
      if (!previous[cardId]) {
        return previous;
      }

      const next = { ...previous };
      if (next[cardId] <= 1) {
        delete next[cardId];
      } else {
        next[cardId] -= 1;
      }

      return next;
    });
  }

  function openZoom(card: Card) {
    setZoomCard(card);
  }

  function toggleAffinity(value: string) {
    setActiveAffinities((previous) => {
      const next: Record<string, boolean> = { ...previous };
      const totalFilters = AFFINITY_FILTERS.length;
      const enabledBefore = AFFINITY_FILTERS.reduce((count, filter) => (next[filter.value] ? count + 1 : count), 0);
      const current = next[value] ?? true;

      if (enabledBefore === totalFilters && current) {
        for (const filter of AFFINITY_FILTERS) {
          next[filter.value] = filter.value === value;
        }
        return next;
      }

      if (current && enabledBefore === 1) {
        for (const filter of AFFINITY_FILTERS) {
          next[filter.value] = true;
        }
        return next;
      }

      next[value] = !current;

      const enabledAfter = AFFINITY_FILTERS.reduce((count, filter) => (next[filter.value] ? count + 1 : count), 0);
      if (enabledAfter === 0) {
        for (const filter of AFFINITY_FILTERS) {
          next[filter.value] = true;
        }
      }

      return next;
    });
  }

  const cardCountLabel = isLoadingCards ? '...' : `${filteredCards.length} / ${cards.length}`;
  const errorMessage = cardsError != null ? cardsError || cardsCopy.error : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden px-0 pb-0 pt-0 text-[color:var(--text-primary)]">
      <div className="flex flex-1 min-h-0 flex-col gap-0 lg:flex-row lg:items-stretch lg:gap-0 lg:min-h-0">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border border-[color:var(--border)] bg-[color:var(--surface)]">
          <div className="border-b border-[color:var(--border)] px-4 py-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-1">
                <input
                  id="card-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={builder.searchPlaceholder}
                  aria-label={builder.searchLabel}
                  className="w-full border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                />
              </div>
              <div className="flex flex-col items-end gap-2 text-xs text-[color:var(--text-secondary)]">
                <div className="flex flex-col items-end">
                  <span>Library: {cardCountLabel}</span>
                  <span>
                    {builder.totalCardsLabel}: {totalCards}
                  </span>
                </div>
                <label htmlFor="card-sort" className="flex items-center gap-2">
                  <span className="uppercase tracking-wide">Sort</span>
                  <select
                    id="card-sort"
                    value={sortOption}
                    onChange={(event) => setSortOption(event.target.value as SortOption)}
                    className="rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-xs text-[color:var(--text-primary)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <AffinityFilterBar activeAffinities={activeAffinities} onToggle={toggleAffinity} />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
            <CardLibrary
              cards={filteredCards}
              deck={deck}
              isLoading={isLoadingCards}
              errorMessage={errorMessage}
              noResultsLabel={builder.noResults}
              skeletonCount={CARD_SKELETON_COUNT}
              addButtonLabel={builder.addButton}
              zoomButtonLabel={zoomButtonLabel}
              onAdd={handleAddCard}
              onZoom={openZoom}
            />
          </div>
        </section>

        <DeckPanel
          deckEntries={deckEntries}
          totalCards={totalCards}
          costBuckets={costBuckets}
          maxBucketCount={maxBucketCount}
          labels={{
            deckHeading: builder.deckHeading,
            totalCardsLabel: builder.totalCardsLabel,
            emptyDeck: builder.emptyDeck,
            removeButton: builder.removeButton,
            costCurveHeading: builder.costCurveHeading,
            costCurveEmpty: builder.costCurveEmpty,
          }}
          onRemove={handleRemoveCard}
          onZoom={openZoom}
        />
      </div>

      <ZoomOverlay card={zoomCard} onClose={() => setZoomCard(null)} />
    </div>
  );
}





