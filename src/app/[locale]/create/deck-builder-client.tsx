'use client';

import { useEffect, useMemo, useState } from 'react';

import { AffinityFilterBar } from './deck-builder/components/affinity-filter-bar';
import { CardSearchBar } from './deck-builder/components/card-search-bar';
import { CardLibrary } from './deck-builder/components/card-library';
import { DeckExportModal } from './deck-builder/components/deck-export-modal';
import { DeckImportModal } from './deck-builder/components/deck-import-modal';
import { DeckShareModal } from './deck-builder/components/deck-share-modal';
import { DeckPanel } from './deck-builder/components/deck-panel';
import { SortMenu } from './deck-builder/components/sort-menu';
import { ZoomOverlay } from './deck-builder/components/zoom-overlay';
import type { ZoomAnchor } from './deck-builder/components/zoom-overlay';
import {
  AFFINITY_FILTERS,
  AFFINITY_SORT_ORDER,
  CARD_SKELETON_COUNT,
} from './deck-builder/constants';
import type { Card, CostBucket, DeckBuilderProps, DeckEntry } from './deck-builder/types';
import {
  buildSearchSuggestions,
  doesCardMatchQuery,
  parseSearchInput,
  type SearchQuery,
  type SearchSuggestion,
} from './deck-builder/search';

const SORT_OPTIONS = [
  { value: 'affinity', label: 'Affinity' },
  { value: 'number', label: 'Card number' },
  { value: 'cost', label: 'Cost' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

const DEFAULT_ZOOM_LABEL = 'Zoom';


export function DeckBuilder({ dictionary, initialCards, initialError }: DeckBuilderProps) {
  const zoomButtonLabel = DEFAULT_ZOOM_LABEL;
  const { builder, cards: cardsCopy } = dictionary;
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<SearchQuery[]>([]);
  const [deck, setDeck] = useState<Record<string, number>>({});
  const cards = useMemo(() => initialCards, [initialCards]);
  const [activeAffinities, setActiveAffinities] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const filter of AFFINITY_FILTERS) {
      initial[filter.value] = true;
    }
    return initial;
  });
  const [sortOption, setSortOption] = useState<SortOption>('affinity');
  const cardsError = initialError;
  const [zoomCard, setZoomCard] = useState<Card | null>(null);
  const [zoomVariant, setZoomVariant] = useState<'default' | 'compact'>('default');
  const [zoomAnchor, setZoomAnchor] = useState<ZoomAnchor | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCostCurveVisible, setIsCostCurveVisible] = useState(true);

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

      const lowerContent = card.searchContent;
      return searchTerms.every((term) => lowerContent.includes(term));
    });

    const sorted = [...filtered].sort((a, b) => {
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

    return sorted;
  }, [cards, combinedQueries, searchTerms, activeAffinitySet, sortOption]);

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
      .filter((entry): entry is DeckEntry => Boolean(entry))
      .sort((a, b) => {
        if (a.card.cost !== b.card.cost) {
          return a.card.cost - b.card.cost;
        }

        const aNumber = a.card.number ?? Number.POSITIVE_INFINITY;
        const bNumber = b.card.number ?? Number.POSITIVE_INFINITY;
        if (aNumber !== bNumber) {
          return aNumber - bNumber;
        }

        return a.card.name.localeCompare(b.card.name);
      });
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

    setDeck((previous) => {
      const current = previous[cardId] ?? 0;
      if (current >= 3) {
        return previous;
      }

      return {
        ...previous,
        [cardId]: current + 1,
      };
    });
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

  function handleZoom(
    card: Card | null,
    variant: 'default' | 'compact' = 'default',
    anchorRect: ZoomAnchor | null = null
  ) {
    if (card) {
      setZoomVariant(variant);
      setZoomCard(card);
      if (variant === 'compact' && anchorRect) {
        const viewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : anchorRect.viewportWidth;
        const viewportHeight =
          typeof window !== 'undefined' ? window.innerHeight : anchorRect.viewportHeight;

        setZoomAnchor({
          top: anchorRect.top,
          left: anchorRect.left,
          width: anchorRect.width,
          height: anchorRect.height,
          viewportWidth: viewportWidth ?? anchorRect.viewportWidth,
          viewportHeight: viewportHeight ?? anchorRect.viewportHeight,
          pointerX: anchorRect.pointerX ?? anchorRect.left + anchorRect.width / 2,
          pointerY: anchorRect.pointerY ?? anchorRect.top + anchorRect.height / 2,
        });
      } else {
        setZoomAnchor(null);
      }
      return;
    }

    setZoomCard(null);
    setZoomVariant('default');
    setZoomAnchor(null);
  }

  function handleSortChange(nextOption: string) {
    if (SORT_OPTIONS.some((option) => option.value === nextOption)) {
      setSortOption(nextOption as SortOption);
    }
  }

  function toggleCostCurve() {
    setIsCostCurveVisible((previous) => !previous);
  }

  function handleMenuSelect(action: 'import' | 'export' | 'share' | 'save') {
    switch (action) {
      case 'import':
        setIsImportModalOpen(true);
        break;
      case 'export':
        setIsExportModalOpen(true);
        break;
      case 'share':
        setIsShareModalOpen(true);
        break;
      case 'save':
        console.warn('Deck saving is not yet available.');
        break;
      default:
        break;
    }
  }

  function handleImportDeck(importedDeck: Record<string, number>) {
    setDeck(importedDeck);
    setIsImportModalOpen(false);
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

  function handleSuggestionSelect(suggestionValue: string) {
    setSearchTerm((previous) => {
      if (!previous) {
        return suggestionValue;
      }

      const lines = previous.split(/\n/);
      lines[lines.length - 1] = suggestionValue;
      return lines.join('\n');
    });
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

  const cardCountLabel = `${filteredCards.length} / ${cards.length}`;
  const errorMessage = cardsError != null ? cardsError || cardsCopy.error : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden px-0 pb-0 pt-0 text-[color:var(--text-primary)]">
      <div className="flex flex-1 min-h-0 flex-row items-stretch gap-0">
        <section className="flex min-h-0 min-w-0 basis-1/2 flex-1 flex-col overflow-hidden rounded-none border border-[color:var(--border)] bg-[color:var(--surface)] xl:basis-2/3">
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
            <SortMenu options={SORT_OPTIONS} value={sortOption} onChange={handleSortChange} />
          </CardSearchBar>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4">
            <CardLibrary
              cards={filteredCards}
              deck={deck}
              isLoading={false}
              errorMessage={errorMessage}
              noResultsLabel={builder.noResults}
              skeletonCount={CARD_SKELETON_COUNT}
              addButtonLabel={builder.addButton}
              zoomButtonLabel={zoomButtonLabel}
              onAdd={handleAddCard}
              onZoom={handleZoom}
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
            addButton: builder.addButton,
            costCurveHeading: builder.costCurveHeading,
            costCurveEmpty: builder.costCurveEmpty,
            showCostCurve: builder.showCostCurve,
            hideCostCurve: builder.hideCostCurve,
            menuButton: builder.menuButton,
            menuImport: builder.menuImport,
            menuExport: builder.menuExport,
            menuShare: builder.menuShare,
            menuSave: builder.menuSave,
          }}
          onAdd={handleAddCard}
          onRemove={handleRemoveCard}
          onZoom={handleZoom}
          onMenuSelect={handleMenuSelect}
          isCostCurveVisible={isCostCurveVisible}
          onToggleCostCurve={toggleCostCurve}
        />
      </div>

      <ZoomOverlay
        card={zoomCard}
        variant={zoomVariant}
        anchor={zoomAnchor}
        onClose={() => handleZoom(null)}
      />

      <DeckImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        cards={cards}
        onImport={handleImportDeck}
        labels={{
          heading: builder.importHeading,
          instructions: builder.importInstructions,
          placeholder: builder.importPlaceholder,
          uploadLabel: builder.importUploadLabel,
          importButton: builder.importButton,
          cancelButton: builder.importCancel,
          errorInvalid: builder.importErrorInvalid,
          errorUnknown: builder.importErrorUnknown,
          errorEmpty: builder.importErrorEmpty,
        }}
      />

      <DeckExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        deckEntries={deckEntries}
        labels={{
          exportOptionTTS: builder.exportOptionTTS,
          emptyDeck: builder.emptyDeck,
          exportCopy: builder.exportCopy,
          exportCopySuccess: builder.exportCopySuccess,
          exportCopyError: builder.exportCopyError,
        }}
      />

      <DeckShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        deckEntries={deckEntries}
        totalCards={totalCards}
        labels={{
          deckHeading: builder.deckHeading,
          totalCardsLabel: builder.totalCardsLabel,
          shareButton: builder.shareButton,
          shareGenerating: builder.shareGenerating,
          shareDownload: builder.shareDownload,
          shareCopy: builder.shareCopy,
          shareCopySuccess: builder.shareCopySuccess,
          shareCopyError: builder.shareCopyError,
          shareEmpty: builder.shareEmpty,
          shareError: builder.shareError,
        }}
      />
    </div>
  );
}
