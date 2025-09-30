'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  { value: 'affinity', label: 'Affinity' },
  { value: 'number', label: 'Card number' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

const DEFAULT_ZOOM_LABEL = 'Zoom';

type SearchFieldType = 'number' | 'text';

type SearchField = {
  key: string;
  label: string;
  type: SearchFieldType;
  aliases?: string[];
  getValue: (card: Card) => string | number | null;
};

type SearchQuery = {
  field: SearchField;
  rawKey: string;
  value: string;
};

type SearchSuggestion = {
  key: string;
  label: string;
  value: string;
  display: string;
};

type ParsedSearch = {
  queries: SearchQuery[];
  terms: string[];
};

const SEARCH_FIELDS: SearchField[] = [
  { key: 'cost', label: 'Cost', type: 'number', getValue: (card) => card.cost },
  { key: 'attack', label: 'Attack', type: 'number', getValue: (card) => card.attack },
  { key: 'health', label: 'Health', type: 'number', getValue: (card) => card.health },
  { key: 'influence', label: 'Influence', type: 'number', getValue: (card) => (card.influence ?? null) },
  { key: 'number', label: 'Card Number', type: 'number', getValue: (card) => (card.number ?? null) },
  { key: 'name', label: 'Name', type: 'text', getValue: (card) => card.name },
  { key: 'type', label: 'Type', type: 'text', getValue: (card) => card.type },
  { key: 'subtype', label: 'Subtype', type: 'text', getValue: (card) => card.subtype },
  { key: 'abilities', label: 'Abilities', type: 'text', aliases: ['ability', 'rules', 'rules_text'], getValue: (card) => card.rulesText },
  { key: 'affinity', label: 'Affinity', type: 'text', getValue: (card) => card.affinity },
  { key: 'rarity', label: 'Rarity', type: 'text', getValue: (card) => card.rarity },
  { key: 'artist', label: 'Artist', type: 'text', aliases: ['author'], getValue: (card) => card.artist },
  { key: 'description', label: 'Description', type: 'text', getValue: (card) => card.description },
];

const SEARCH_FIELD_MAP: Map<string, SearchField> = (() => {
  const map = new Map<string, SearchField>();
  for (const field of SEARCH_FIELDS) {
    map.set(field.key, field);
    for (const alias of field.aliases ?? []) {
      map.set(alias, field);
    }
  }
  return map;
})();

const NUMBER_FIELDS = SEARCH_FIELDS.filter((field) => field.type === 'number');
const TEXT_FIELDS = SEARCH_FIELDS.filter((field) => field.type === 'text');

const KEY_VALUE_PATTERN = /^([^:\s]+)\s*:\s*(.+)$/;

function parseSearchInput(input: string): ParsedSearch {
  const lines = input.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const queries: SearchQuery[] = [];
  const terms: string[] = [];

  for (const line of lines) {
    const match = line.match(KEY_VALUE_PATTERN);
    if (!match) {
      terms.push(line.toLowerCase());
      continue;
    }

    const rawKey = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (!rawKey || !value) {
      continue;
    }

    const field = SEARCH_FIELD_MAP.get(rawKey);
    if (!field) {
      terms.push(line.toLowerCase());
      continue;
    }

    queries.push({ field, rawKey, value });
  }

  return { queries, terms };
}

function doesCardMatchQuery(card: Card, query: SearchQuery): boolean {
  const fieldValue = query.field.getValue(card);

  if (query.field.type === 'number') {
    const numericTarget = Number(query.value);
    if (!Number.isFinite(numericTarget)) {
      return false;
    }

    if (typeof fieldValue !== 'number') {
      return false;
    }

    return fieldValue === numericTarget;
  }

  const textValue = (fieldValue ?? '').toString().toLowerCase();
  return textValue.includes(query.value.toLowerCase());
}

function buildSearchSuggestions(input: string): SearchSuggestion[] {
  const lines = input.split(/\n/);
  const current = lines[lines.length - 1] ?? '';
  const trimmed = current.trim();

  if (!trimmed || current.includes(':')) {
    return [];
  }

  const numericPattern = /^-?\d+$/;
  const alphaPattern = /^[a-z_]+$/i;
  const isNumeric = numericPattern.test(trimmed);
  const lowerTrimmed = trimmed.toLowerCase();

  if (isNumeric) {
    const candidates = NUMBER_FIELDS.slice(0, 6);
    return candidates.map((field) => ({
      key: field.key,
      label: field.label,
      value: `${field.key}: ${trimmed}`,
      display: `${field.label}: ${trimmed}`,
    }));
  }

  if (alphaPattern.test(trimmed)) {
    const matches = SEARCH_FIELDS.filter((field) =>
      field.key.includes(lowerTrimmed) || field.label.toLowerCase().includes(lowerTrimmed),
    ).slice(0, 6);

    return matches.map((field) => ({
      key: field.key,
      label: field.label,
      value: `${field.key}: `,
      display: `${field.label}:`,
    }));
  }

  const candidates = TEXT_FIELDS.slice(0, 6);
  return candidates.map((field) => ({
    key: field.key,
    label: field.label,
    value: `${field.key}: ${trimmed}`,
    display: `${field.label}: ${trimmed}`,
  }));
}

export function DeckBuilder({ dictionary }: DeckBuilderProps) {
  const zoomButtonLabel = DEFAULT_ZOOM_LABEL;
  const { builder, cards: cardsCopy } = dictionary;
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<SearchQuery[]>([]);
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
  const [zoomVariant, setZoomVariant] = useState<'default' | 'compact'>('default');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [exportContent, setExportContent] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

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

  useEffect(() => {
    if (!isMenuModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuModalOpen(false);
        setExportContent(null);
        setCopyStatus('idle');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuModalOpen]);

  useEffect(() => {
    if (!isSortMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!sortMenuRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!sortMenuRef.current.contains(target)) {
        setIsSortMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsSortMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSortMenuOpen]);

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
      }

      const affinityDiff = getAffinityIndex(a.affinity) - getAffinityIndex(b.affinity);
      if (affinityDiff !== 0) {
        return affinityDiff;
      }

      return a.name.localeCompare(b.name);
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

  function handleZoom(card: Card | null, variant: 'default' | 'compact' = 'default') {
    if (card) {
      setZoomVariant(variant);
      setZoomCard(card);
      return;
    }

    setZoomCard(null);
    setZoomVariant('default');
  }

  function handleSortChange(nextOption: SortOption) {
    setSortOption(nextOption);
    setIsSortMenuOpen(false);
  }

  function openMenu() {
    setIsMenuModalOpen(true);
    setExportContent(null);
    setCopyStatus('idle');
  }

  function closeMenu() {
    setIsMenuModalOpen(false);
    setExportContent(null);
    setCopyStatus('idle');
  }

  function handleExport(provider: 'tts') {
    if (provider !== 'tts' || deckEntries.length === 0) {
      return;
    }

    const payload = deckEntries.map(({ card, count }) => ({
      count,
      name: card.name,
    }));

    const json = JSON.stringify(payload, null, 2);
    setExportContent(json);
    setCopyStatus('idle');
  }

  async function handleCopyExport() {
    if (!exportContent) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportContent);
        setCopyStatus('success');
        return;
      }
    } catch (error) {
      // Fallback to manual prompt below
    }

    const didCopy = window.prompt('Copy the export JSON:', exportContent);
    setCopyStatus(didCopy != null ? 'success' : 'error');
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

  const cardCountLabel = isLoadingCards ? '...' : `${filteredCards.length} / ${cards.length}`;
  const errorMessage = cardsError != null ? cardsError || cardsCopy.error : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden px-0 pb-0 pt-0 text-[color:var(--text-primary)]">
      <div className="flex flex-1 min-h-0 flex-row items-stretch gap-0">
        <section className="flex min-h-0 min-w-0 basis-1/2 flex-1 flex-col overflow-hidden rounded-none border border-[color:var(--border)] bg-[color:var(--surface)] xl:basis-2/3">
          <div className="border-b border-[color:var(--border)] px-4 py-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="relative flex min-w-0 flex-1">
                <input
                  id="card-search"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitSearchQueries();
                    }
                  }}
                  placeholder={builder.searchPlaceholder}
                  aria-label={builder.searchLabel}
                  className="w-full border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                />
                {searchSuggestions.length > 0 ? (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-lg">
                    {searchSuggestions.map((suggestion) => (
                      <li key={suggestion.key}>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSuggestionSelect(suggestion.value);
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-primary)]"
                        >
                          <span>{suggestion.display}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="flex flex-col items-end text-xs text-[color:var(--text-secondary)]">
                <span>Library: {cardCountLabel}</span>
              </div>
            </div>
            {activeFilters.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {activeFilters.map((filter, index) => (
                  <span
                    key={`${filter.field.key}:${filter.value}:${index}`}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)]/70 px-3 py-1 text-xs font-medium text-[color:var(--text-secondary)]"
                  >
                    <span>{`${filter.field.label}: ${filter.value}`}</span>
                    <button
                      type="button"
                      onClick={() => removeFilter(index)}
                      className="rounded-full bg-black/40 p-1 text-white transition hover:bg-black/60 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                      aria-label={`Remove filter ${filter.field.label}: ${filter.value}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
                        <path d="M6 6l12 12M6 18L18 6" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <AffinityFilterBar activeAffinities={activeAffinities} onToggle={toggleAffinity} />
              <div ref={sortMenuRef} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSortMenuOpen((previous) => !previous)}
                  aria-haspopup="menu"
                  aria-expanded={isSortMenuOpen}
                  aria-controls="card-sort-menu"
                  className="flex items-center gap-2 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-xs uppercase tracking-wide text-[color:var(--text-secondary)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  <span>Sort</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 transition-transform ${isSortMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  >
                    <path d="M8 10.5 12 6l4 4.5" />
                    <path d="M8 13.5 12 18l4-4.5" />
                  </svg>
                </button>
                {isSortMenuOpen ? (
                  <div
                    id="card-sort-menu"
                    role="menu"
                    aria-orientation="vertical"
                    className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-lg"
                  >
                    {SORT_OPTIONS.map((option) => {
                      const isActive = option.value === sortOption;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => handleSortChange(option.value)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? 'bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]'
                              : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-primary)]'
                          }`}
                        >
                          <span>{option.label}</span>
                          {isActive ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-4">
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
            costCurveHeading: builder.costCurveHeading,
            costCurveEmpty: builder.costCurveEmpty,
            menuButton: builder.menuButton,
            exportOptionTTS: builder.exportOptionTTS,
          }}
          onRemove={handleRemoveCard}
          onZoom={handleZoom}
          onOpenMenu={openMenu}
        />
      </div>

      <ZoomOverlay card={zoomCard} variant={zoomVariant} onClose={() => handleZoom(null)} />

      {isMenuModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeMenu}
                className="rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                aria-label="Close menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleExport('tts')}
                disabled={deckEntries.length === 0}
                className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                  deckEntries.length === 0
                    ? 'cursor-not-allowed border border-[color:var(--border)] text-[color:var(--text-secondary)]/60'
                    : 'border border-[color:var(--accent)] text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-[color:var(--text-on-accent)]'
                }`}
              >
                {builder.exportOptionTTS}
              </button>
            </div>

            {exportContent ? (
              <div className="mt-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[color:var(--text-primary)]">Export JSON</h4>
                  <button
                    type="button"
                    onClick={handleCopyExport}
                    className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
                    Copy
                  </button>
                </div>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 p-3 text-xs text-[color:var(--text-primary)]">{exportContent}</pre>
                {copyStatus === 'success' ? (
                  <span className="text-xs text-[color:var(--text-secondary)]">Copied to clipboard.</span>
                ) : null}
                {copyStatus === 'error' ? (
                  <span className="text-xs text-[color:var(--accent)]">Unable to copy automatically. Please copy manually.</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
