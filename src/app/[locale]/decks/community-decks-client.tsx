'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

import type { Locale } from '@/i18n/config';
import type { PublicDeckSummary } from '@/lib/supabase/decks';
import { DeckSummaryCard } from '@/components/deck-summary-card';
import { normalizeAffinity } from '@/lib/cards/affinity';
import { AFFINITY_FILTERS } from '@/app/[locale]/create/deck-builder/constants';
import { sortDecksByOption, type DeckSortOption } from '@/lib/decks/rankings';

type CommunityDecksClientProps = {
  locale: Locale;
  decks: PublicDeckSummary[];
  deckFeedLabels: {
    empty: string;
    cardsLabel: string;
    sortOptions: {
      popular: string;
      trending: string;
      new: string;
    };
  };
  myDeckLabels: {
    untitled: string;
    publicTag: string;
    privateTag: string;
  };
  showAffinityFilters?: boolean;
};

type DeckStatsOverride = {
  viewsTotal?: number;
  favoritesTotal?: number;
};

type DeckWithAuthor = PublicDeckSummary & {
  authorLabel: string | null;
  authorHref: string | null;
};

function buildInitialAffinityState() {
  const initial: Record<string, boolean> = {};
  for (const filter of AFFINITY_FILTERS) {
    initial[filter.value] = true;
  }
  return initial;
}

export function CommunityDecksClient({
  locale,
  decks,
  deckFeedLabels,
  myDeckLabels,
  showAffinityFilters = true,
}: CommunityDecksClientProps) {
  const [activeAffinities, setActiveAffinities] = useState<Record<string, boolean>>(() => buildInitialAffinityState());
  const [resolvedDecks, setResolvedDecks] = useState<PublicDeckSummary[]>(decks);
  const [sortOption, setSortOption] = useState<DeckSortOption>('popular');

  useEffect(() => {
    if (typeof window === 'undefined') {
      setResolvedDecks(decks);
      return;
    }

    const nextDecks = decks.map((deck) => {
      const overrideRaw = window.sessionStorage.getItem(`deck-stats:${deck.id}`);
      if (!overrideRaw) {
        return deck;
      }

      try {
        const override = JSON.parse(overrideRaw) as DeckStatsOverride;
        return {
          ...deck,
          viewsTotal: Math.max(deck.viewsTotal, Number(override.viewsTotal ?? deck.viewsTotal)),
          favoritesTotal: Math.max(deck.favoritesTotal, Number(override.favoritesTotal ?? deck.favoritesTotal)),
        };
      } catch {
        return deck;
      }
    });

    setResolvedDecks(nextDecks);
  }, [decks]);

  const toggleAffinity = useCallback((value: string) => {
    setActiveAffinities((previous) => {
      const allSelected = AFFINITY_FILTERS.every((filter) => previous[filter.value] ?? true);

      if (allSelected) {
        const nextState = buildInitialAffinityState();
        for (const filter of AFFINITY_FILTERS) {
          nextState[filter.value] = filter.value === value;
        }
        return nextState;
      }

      const next: Record<string, boolean> = { ...previous };
      const current = previous[value] ?? true;
      next[value] = !current;

      const enabledCount = AFFINITY_FILTERS.reduce(
        (count, filter) => (next[filter.value] ? count + 1 : count),
        0
      );

      if (enabledCount === 0) {
        return buildInitialAffinityState();
      }

      return next;
    });
  }, []);

  const enabledAffinitySet = useMemo(() => {
    if (!showAffinityFilters) {
      return null;
    }
    const enabled = AFFINITY_FILTERS.filter((filter) => activeAffinities[filter.value] ?? true);
    if (enabled.length === AFFINITY_FILTERS.length) {
      return null;
    }
    return new Set(enabled.map((filter) => filter.value));
  }, [activeAffinities, showAffinityFilters]);

  const decksWithAuthor = useMemo<DeckWithAuthor[]>(() => {
    return resolvedDecks.map((deck) => {
      const trimmedName = deck.authorName?.trim() ?? null;
      const authorLabel = trimmedName && trimmedName.length > 0 ? trimmedName : null;
      const authorHref =
        authorLabel && deck.authorId ? `/${locale}/players/${encodeURIComponent(deck.authorId)}` : null;

      return {
        ...deck,
        authorLabel,
        authorHref,
      };
    });
  }, [resolvedDecks, locale]);

  const filteredDecks = useMemo(() => {
    const decksToFilter = enabledAffinitySet
      ? decksWithAuthor.filter((deck) => {
          if (!deck.affinities || deck.affinities.length === 0) {
            return enabledAffinitySet.has('Neutral');
          }

          return deck.affinities.some((affinity) => {
            const normalized = normalizeAffinity(affinity);
            if (!normalized) {
              return enabledAffinitySet.has('Neutral');
            }
            return enabledAffinitySet.has(normalized);
          });
        })
      : decksWithAuthor;

    return sortDecksByOption(decksToFilter, sortOption);
  }, [decksWithAuthor, enabledAffinitySet, sortOption]);

  const sortOptions = useMemo(
    () => [
      { value: 'popular' as DeckSortOption, label: deckFeedLabels.sortOptions.popular },
      { value: 'trending' as DeckSortOption, label: deckFeedLabels.sortOptions.trending },
      { value: 'new' as DeckSortOption, label: deckFeedLabels.sortOptions.new },
    ],
    [deckFeedLabels.sortOptions]
  );
  const activeSortIndex = sortOptions.findIndex((option) => option.value === sortOption);
  const indicatorIndex = activeSortIndex >= 0 ? activeSortIndex : 0;
  const filterIndicatorStyle = useMemo(() => {
    const segment = Number((100 / sortOptions.length).toFixed(6));
    const offset = Number((segment * indicatorIndex).toFixed(6));
    return {
      width: `calc(${segment}% - 0.5rem)`,
      left: `calc(${offset}% + 0.25rem)`,
    } as const;
  }, [indicatorIndex, sortOptions.length]);

  return (
    <div className="flex w-full flex-col gap-8 px-4 py-10 text-[color:var(--text-primary)] sm:px-6 lg:px-10 xl:px-16">
      <div className="flex w-full flex-wrap items-center gap-4">
        {showAffinityFilters ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 shadow-sm">
            {AFFINITY_FILTERS.map((filter) => {
              const isEnabled = activeAffinities[filter.value] ?? true;
              const iconSrc = isEnabled ? filter.filledIcon : filter.disabledIcon;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => toggleAffinity(filter.value)}
                  className={`flex h-12 w-12 items-center justify-center rounded-lg border transition-transform duration-150 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] hover:-translate-y-1 hover:shadow-lg ${
                    isEnabled
                      ? 'border-[color:var(--accent)]/50 bg-[color:var(--surface)]'
                      : 'border-transparent bg-[color:var(--surface-muted)]/60'
                  }`}
                  aria-pressed={isEnabled}
                  title={filter.label}
                >
                  <Image src={iconSrc} alt={`${filter.label} icon`} width={36} height={36} className="h-9 w-9 select-none" />
                  <span className="sr-only">{filter.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className={`flex justify-center ${showAffinityFilters ? 'sm:ml-auto' : 'ml-auto'}`}>
          <div className="relative flex w-full min-w-[16rem] max-w-sm overflow-hidden rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 shadow-sm sm:min-w-[20rem] sm:max-w-md lg:min-w-[24rem] lg:max-w-lg">
            <span
              className="pointer-events-none absolute inset-y-1 rounded-full bg-[color:var(--accent)]/15 transition-all duration-200 ease-out"
              style={filterIndicatorStyle}
            />
            {sortOptions.map((option) => {
              const isActive = sortOption === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSortOption(option.value)}
                  className={`relative z-10 flex-1 px-4 py-2 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                    isActive
                      ? 'text-[color:var(--accent)]'
                      : 'text-[color:var(--text-secondary)] hover:text-[color:var(--accent)]'
                  }`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="hidden flex-1 sm:flex" aria-hidden="true" />
      </div>

      {filteredDecks.length === 0 ? (
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
          {deckFeedLabels.empty}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredDecks.map((deck) => (
            <DeckSummaryCard
              key={deck.id}
              locale={locale}
              deck={deck}
              detailHref={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
              labels={{
                cards: deckFeedLabels.cardsLabel,
                untitled: myDeckLabels.untitled,
                publicTag: myDeckLabels.publicTag,
                privateTag: myDeckLabels.privateTag,
              }}
              mutedMetrics
              author={deck.authorLabel ? { label: deck.authorLabel, href: deck.authorHref ?? undefined } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
