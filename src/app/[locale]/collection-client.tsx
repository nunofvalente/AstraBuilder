'use client';

import { useEffect, useMemo, useState } from 'react';

import { AffinityFilterBar } from './create/deck-builder/components/affinity-filter-bar';
import { CardLibrary } from './create/deck-builder/components/card-library';
import { CardSearchBar } from './create/deck-builder/components/card-search-bar';
import { SortMenu } from './create/deck-builder/components/sort-menu';
import { ZoomOverlay } from './create/deck-builder/components/zoom-overlay';
import {
  appendUniqueFilters,
  buildActiveAffinitySet,
  buildCombinedQueries,
  CARD_SORT_OPTIONS,
  createInitialActiveAffinities,
  filterAndSortCards,
  parseCatalogSearch,
  toggleAffinitySelection,
  type CardSortOption,
} from './create/deck-builder/catalog-controls';
import {
  CARD_SKELETON_COUNT,
} from './create/deck-builder/constants';
import {
  buildSearchSuggestions,
  type SearchQuery,
} from './create/deck-builder/search';
import type { Card } from './create/deck-builder/types';
import type { Dictionary } from '@/i18n/get-dictionary';

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
  const [sortOption, setSortOption] = useState<CardSortOption>('affinity');
  const [zoomCard, setZoomCard] = useState<Card | null>(null);
  const [activeAffinities, setActiveAffinities] = useState<Record<string, boolean>>(
    createInitialActiveAffinities
  );

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

  const activeAffinitySet = useMemo(() => buildActiveAffinitySet(activeAffinities), [activeAffinities]);

  const { queries: searchQueries, terms: searchTerms } = useMemo(
    () => parseCatalogSearch(searchTerm),
    [searchTerm]
  );
  const combinedQueries = useMemo(
    () => buildCombinedQueries(activeFilters, searchQueries),
    [activeFilters, searchQueries]
  );
  const searchSuggestions = useMemo(() => buildSearchSuggestions(searchTerm), [searchTerm]);

  const filteredCards = useMemo(
    () =>
      filterAndSortCards({
        cards,
        activeAffinitySet,
        combinedQueries,
        searchTerms,
        sortOption,
      }),
    [cards, combinedQueries, searchTerms, activeAffinitySet, sortOption]
  );

  function toggleAffinity(value: string) {
    setActiveAffinities((previous) => toggleAffinitySelection(previous, value));
  }

  function commitSearchQueries() {
    const { queries } = parseCatalogSearch(searchTerm);
    if (queries.length === 0) {
      return;
    }

    setActiveFilters((previous) => appendUniqueFilters(previous, queries));

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
          <SortMenu
            options={CARD_SORT_OPTIONS}
            value={sortOption}
            onChange={(value) => setSortOption(value as CardSortOption)}
          />
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
