'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { AffinityFilterBar } from './deck-builder/components/affinity-filter-bar';
import { CardSearchBar } from './deck-builder/components/card-search-bar';
import { CardLibrary } from './deck-builder/components/card-library';
import { DeckExportModal } from './deck-builder/components/deck-export-modal';
import { DeckImportModal } from './deck-builder/components/deck-import-modal';
import { DeckShareModal } from './deck-builder/components/deck-share-modal';
import { DeckSaveModal } from './deck-builder/components/deck-save-modal';
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
import { supabase } from '@/lib/supabase/supabaseClient';

const SORT_OPTIONS = [
  { value: 'affinity', label: 'Affinity' },
  { value: 'number', label: 'Card number' },
  { value: 'cost', label: 'Cost' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

const DEFAULT_ZOOM_LABEL = 'Zoom';

type SaveDeckFormValues = {
  title: string;
  description: string;
  isPublic: boolean;
};


export function DeckBuilder({ dictionary, initialCards, initialError, locale }: DeckBuilderProps) {
  const zoomButtonLabel = DEFAULT_ZOOM_LABEL;
  const { builder, cards: cardsCopy } = dictionary;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deckIdQuery = searchParams.get('deck');
  const saveLabels = builder.save;
  const [saveNotice, setSaveNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSavingDeck, setIsSavingDeck] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [saveRequiresAuth, setSaveRequiresAuth] = useState(false);
  const [isCostCurveVisible, setIsCostCurveVisible] = useState(false);
  const [activeMobilePane, setActiveMobilePane] = useState<'catalogue' | 'deck'>('catalogue');
  const redirectPath = pathname ?? `/${locale}/create`;
  const signInHref = `/${locale}/sign-in?redirect=${encodeURIComponent(redirectPath)}`;

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
  const prefilledDeckIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!deckIdQuery) {
      prefilledDeckIdRef.current = null;
      return;
    }

    const deckId = deckIdQuery.trim();
    if (!deckId || cards.length === 0) {
      return;
    }

    if (prefilledDeckIdRef.current === deckId) {
      return;
    }

    let isActive = true;

    async function prefillDeckFromId() {
      try {
        const { data, error } = await supabase
          .from('deck_cards')
          .select('*')
          .eq('deck_id', deckId);

        if (!isActive) {
          return;
        }

        if (error) {
          console.error('Failed to load deck for builder', error);
          prefilledDeckIdRef.current = deckId;
          return;
        }

        const rows = Array.isArray(data) ? data : [];
        const nextDeck: Record<string, number> = {};

        for (const row of rows) {
          const cardId =
            typeof row.card_id_astra === 'string' && row.card_id_astra.trim().length > 0
              ? row.card_id_astra.trim()
              : typeof row.card_id === 'string'
                ? row.card_id
                : null;
          const quantity = Number(row.quantity ?? 0);
          if (!cardId || quantity <= 0) {
            continue;
          }

          if (!cardMap.has(cardId)) {
            continue;
          }

          const current = nextDeck[cardId] ?? 0;
          const cappedQuantity = Math.min(3, quantity);
          nextDeck[cardId] = Math.min(3, current + cappedQuantity);
        }

        setDeck(nextDeck);
        prefilledDeckIdRef.current = deckId;
      } catch (prefillError) {
        if (!isActive) {
          return;
        }
        console.error('Unexpected error while prefilling deck', prefillError);
        prefilledDeckIdRef.current = deckId;
      }
    }

    void prefillDeckFromId();

    return () => {
      isActive = false;
    };
  }, [cardMap, cards.length, deckIdQuery]);

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
  const initialSaveTitle = deckEntries.length > 0 ? deckEntries[0].card.name : '';

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
        setSaveErrorMessage(null);
        setSaveRequiresAuth(false);
        setIsSaveModalOpen(true);
        break;
      default:
        break;
    }
  }

  function handleCloseSaveModal() {
    if (isSavingDeck) {
      return;
    }
    setIsSaveModalOpen(false);
    setSaveErrorMessage(null);
    setSaveRequiresAuth(false);
  }

  async function handleSaveDeckSubmit(values: SaveDeckFormValues) {
    if (isSavingDeck) {
      return;
    }

    if (deckEntries.length === 0) {
      setSaveErrorMessage(saveLabels.emptyDeckError);
      setSaveRequiresAuth(false);
      return;
    }

    setIsSavingDeck(true);
    setSaveErrorMessage(null);
    setSaveRequiresAuth(false);

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult?.user) {
      setSaveErrorMessage(saveLabels.signInPrompt);
      setSaveRequiresAuth(true);
      setIsSavingDeck(false);
      return;
    }

    const userId = userResult.user.id;
    const trimmedTitle = values.title.trim();
    const trimmedDescription = values.description.trim();
    const isPublic = values.isPublic;
    const finalTitle = trimmedTitle.length > 0 ? trimmedTitle : saveLabels.titlePlaceholder;

    try {
      const { data: insertedDeck, error: deckInsertError } = await supabase
        .from('decks')
        .insert({
          user_id: userId,
          title: finalTitle,
          description: trimmedDescription.length > 0 ? trimmedDescription : null,
          is_public: isPublic,
        })
        .select('id')
        .single();

      if (deckInsertError || !insertedDeck) {
        throw deckInsertError ?? new Error('Deck insertion failed');
      }

      const deckId = insertedDeck.id;

      const cardsPayload = deckEntries.map((entry) => ({
        deck_id: deckId,
        card_id: entry.card.id,
        quantity: entry.count,
      }));

      if (cardsPayload.length > 0) {
        const { error: cardsError } = await supabase.from('deck_cards').insert(cardsPayload);
        if (cardsError) {
          try {
            await supabase.from('decks').delete().eq('id', deckId);
          } catch (cleanupError) {
            console.error('Failed to clean up deck after card insertion error', cleanupError);
          }
          throw cardsError;
        }
      }

      setIsSaveModalOpen(false);
      setSaveErrorMessage(null);
      setSaveRequiresAuth(false);
      setSaveNotice({ type: 'success', message: saveLabels.successMessage });
    } catch (error) {
      console.error('Failed to save deck', error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message?: unknown }).message)
            : null;
      setSaveErrorMessage(message ? `${saveLabels.genericError} (${message})` : saveLabels.genericError);
    } finally {
      setIsSavingDeck(false);
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
  const isCatalogueVisible = activeMobilePane === 'catalogue';
  const isDeckVisible = activeMobilePane === 'deck';

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden px-0 pb-20 pt-0 text-[color:var(--text-primary)] lg:pb-0">
      <div className="flex flex-1 min-h-0 flex-col items-stretch gap-0 lg:flex-row">
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border border-[color:var(--border)] bg-[color:var(--surface)] ${isCatalogueVisible ? 'flex' : 'hidden'} lg:flex lg:basis-1/2 xl:basis-3/5 min-[1920px]:basis-2/3`}
        >
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

        <div
          className={`min-h-0 flex-1 flex-col ${isDeckVisible ? 'flex' : 'hidden'} lg:flex lg:min-h-0 lg:min-w-0 lg:basis-1/2 xl:basis-2/5 min-[1920px]:basis-1/3`}
        >
          {saveNotice ? (
            <div className="mx-4 mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/70 px-4 py-3 text-sm text-[color:var(--text-primary)] lg:mx-6">
              <div className="flex items-start justify-between gap-4">
                <span>{saveNotice.message}</span>
                <button
                  type="button"
                  onClick={() => setSaveNotice(null)}
                  className="rounded-full bg-black/40 p-1 text-xs text-white transition hover:bg-black/60 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                  aria-label={saveLabels.dismissNotice}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              </div>
            </div>
          ) : null}
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
            className="w-full lg:w-auto"
          />
        </div>
      </div>

      <nav className="lg:hidden border-t border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setActiveMobilePane('catalogue')}
            aria-pressed={isCatalogueVisible}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
              isCatalogueVisible
                ? 'border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]'
                : 'border-transparent text-[color:var(--text-secondary)]'
            }`}
          >
            <span>{builder.cardsHeading}</span>
            <span className="text-[11px] font-normal text-[color:var(--text-secondary)]">{cardCountLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMobilePane('deck')}
            aria-pressed={isDeckVisible}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
              isDeckVisible
                ? 'border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]'
                : 'border-transparent text-[color:var(--text-secondary)]'
            }`}
          >
            <span>{builder.deckHeading}</span>
            <span className="text-[11px] font-normal text-[color:var(--text-secondary)]">
              {builder.totalCardsLabel}: {totalCards}
            </span>
          </button>
        </div>
      </nav>

      <ZoomOverlay
        card={zoomCard}
        variant={zoomVariant}
        anchor={zoomAnchor}
        onClose={() => handleZoom(null)}
      />

      <DeckSaveModal
        isOpen={isSaveModalOpen}
        onClose={handleCloseSaveModal}
        onSubmit={handleSaveDeckSubmit}
        isSaving={isSavingDeck}
        errorMessage={saveErrorMessage}
        requiresAuth={saveRequiresAuth}
        labels={saveLabels}
        totalCards={totalCards}
        totalCardsLabel={builder.totalCardsLabel}
        initialTitle={initialSaveTitle}
        signInHref={signInHref}
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
          exportHeading: builder.menuExport,
          exportOptionTTS: builder.exportOptionTTS,
          exportOptionText: builder.exportOptionText,
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
