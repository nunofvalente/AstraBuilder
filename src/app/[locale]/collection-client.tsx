'use client';

import { useEffect, useMemo, useState } from 'react';

import { AffinityFilterBar } from './create/deck-builder/components/affinity-filter-bar';
import { CardLibrary } from './create/deck-builder/components/card-library';
import { CardSearchBar } from './create/deck-builder/components/card-search-bar';
import { SortMenu } from './create/deck-builder/components/sort-menu';
import { ZoomOverlay } from './create/deck-builder/components/zoom-overlay';
import {
  AFFINITY_FILTERS,
  AFFINITY_SORT_ORDER,
  CARD_SKELETON_COUNT,
} from './create/deck-builder/constants';
import {
  buildSearchSuggestions,
  doesCardMatchQuery,
  parseSearchInput,
  type SearchQuery,
} from './create/deck-builder/search';
import type { Card } from './create/deck-builder/types';
import type { Dictionary } from '@/i18n/get-dictionary';

const SORT_OPTIONS = [
  { value: 'affinity', label: 'Affinity' },
  { value: 'number', label: 'Card number' },
  { value: 'cost', label: 'Cost' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

type CollectionClientProps = {
  dictionary: Dictionary;
  initialCards: Card[];
  initialError: string | null;
};

const DEFAULT_ZOOM_LABEL = 'Zoom';
const COLLECTION_GRID_CLASS_NAME =
  'grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7 xl:gap-2 2xl:grid-cols-8 min-[2200px]:grid-cols-10';

export function CollectionClient({ dictionary, initialCards, initialError }: CollectionClientProps) {
  const { builder, cards: cardsCopy } = dictionary;
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<SearchQuery[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('affinity');
  const [zoomCard, setZoomCard] = useState<Card | null>(null);
  const [activeAffinities, setActiveAffinities] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const filter of AFFINITY_FILTERS) {
      initial[filter.value] = true;
    }
    return initial;
  });

  const cards = useMemo(() => initialCards, [initialCards]);
  const cardsError = initialError;

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

  const { queries: searchQueries, terms: searchTerms } = useMemo(() => parseSearchInput(searchTerm), [searchTerm]);
  const combinedQueries = useMemo(() => [...activeFilters, ...searchQueries], [activeFilters, searchQueries]);
  const searchSuggestions = useMemo(() => buildSearchSuggestions(searchTerm), [searchTerm]);

  const filteredCards = useMemo(() => {
    const filtered = cards.filter((card) => {
      const matchesAffinity = !activeAffinitySet || activeAffinitySet.has(card.affinity);
      if (!matchesAffinity) {
        return false;
      }

      if (combinedQueries.length === 0 && searchTerms.length === 0) {
        return true;
      }

      const matchesStructured = combinedQueries.every((query) => doesCardMatchQuery(card, query));
      if (!matchesStructured) {
        return false;
      }

      if (searchTerms.length === 0) {
        return true;
      }

      return searchTerms.every((term) => card.searchContent.includes(term));
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === 'number') {
        const aNumber = a.number ?? Number.POSITIVE_INFINITY;
        const bNumber = b.number ?? Number.POSITIVE_INFINITY;
        if (aNumber !== bNumber) {
          return aNumber - bNumber;
        }
      } else if (sortOption === 'cost') {
        if (a.cost !== b.cost) {
          return a.cost - b.cost;
        }

        const aNumber = a.number ?? Number.POSITIVE_INFINITY;
        const bNumber = b.number ?? Number.POSITIVE_INFINITY;
        if (aNumber !== bNumber) {
          return aNumber - bNumber;
        }

        return a.name.localeCompare(b.name);
      }

      const affinityDiff = getAffinityIndex(a.affinity) - getAffinityIndex(b.affinity);
      if (affinityDiff !== 0) {
        return affinityDiff;
      }

      const nameDiff = a.name.localeCompare(b.name);
      if (nameDiff !== 0) {
        return nameDiff;
      }

      const aNumber = a.number ?? Number.POSITIVE_INFINITY;
      const bNumber = b.number ?? Number.POSITIVE_INFINITY;
      return aNumber - bNumber;
    });
  }, [cards, combinedQueries, searchTerms, activeAffinitySet, sortOption]);

  function toggleAffinity(value: string) {
    setActiveAffinities((previous) => ({
      ...previous,
      [value]: !previous[value],
    }));
  }

  function commitSearchQueries() {
    const { queries } = parseSearchInput(searchTerm);
    if (queries.length === 0) {
      return;
    }

    setActiveFilters((previous) => {
      const existingKeys = new Set(previous.map((query) => `${query.field.key}:${query.value.toLowerCase()}`));
      const appended: SearchQuery[] = [];
      for (const query of queries) {
        const key = `${query.field.key}:${query.value.toLowerCase()}`;
        if (!existingKeys.has(key)) {
          appended.push(query);
        }
      }

      if (appended.length === 0) {
        return previous;
      }

      return [...previous, ...appended];
    });

    setSearchTerm('');
  }

  function removeFilter(index: number) {
    setActiveFilters((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleSuggestionSelect(value: string) {
    setSearchTerm(value);
  }

  const cardCountLabel = `${filteredCards.length} / ${cards.length}`;
  const errorMessage = cardsError != null ? cardsError || cardsCopy.error : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden text-[color:var(--text-primary)]">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface)]">
        <CardSearchBar
          searchTerm={searchTerm}
          placeholder={builder.searchPlaceholder}
          ariaLabel={builder.searchLabel}
          libraryCountLabel={cardCountLabel}
          suggestions={searchSuggestions}
          filters={activeFilters}
          onSearchTermChange={setSearchTerm}
          onSubmit={commitSearchQueries}
          onSuggestionSelect={handleSuggestionSelect}
          onRemoveFilter={removeFilter}
        >
          <AffinityFilterBar activeAffinities={activeAffinities} onToggle={toggleAffinity} />
          <SortMenu options={SORT_OPTIONS} value={sortOption} onChange={(value) => setSortOption(value as SortOption)} />
        </CardSearchBar>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4">
          <CardLibrary
            cards={filteredCards}
            deck={{}}
            isLoading={false}
            errorMessage={errorMessage}
            noResultsLabel={builder.noResults}
            skeletonCount={CARD_SKELETON_COUNT}
            zoomButtonLabel={DEFAULT_ZOOM_LABEL}
            onZoom={(card) => setZoomCard(card)}
            readOnly
            gridClassName={COLLECTION_GRID_CLASS_NAME}
          />
        </div>
      </section>

      <ZoomOverlay card={zoomCard} onClose={() => setZoomCard(null)} />
    </div>
  );
}
