'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';

import type { Locale } from '@/i18n/config';
import type { PublicDeckSummary } from '@/lib/supabase/decks';
import { DeckSummaryCard } from '@/components/deck-summary-card';
import { AFFINITY_FILTERS } from '@/app/[locale]/create/deck-builder/constants';
import { normalizeAffinity } from '@/lib/cards/affinity';

type CommunityDecksClientProps = {
  locale: Locale;
  decks: PublicDeckSummary[];
  deckFeedLabels: {
    empty: string;
    cardsLabel: string;
  };
  myDeckLabels: {
    untitled: string;
    publicTag: string;
    privateTag: string;
  };
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
}: CommunityDecksClientProps) {
  const [activeAffinities, setActiveAffinities] = useState<Record<string, boolean>>(() => buildInitialAffinityState());

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
    const enabled = AFFINITY_FILTERS.filter((filter) => activeAffinities[filter.value] ?? true);
    if (enabled.length === AFFINITY_FILTERS.length) {
      return null;
    }
    return new Set(enabled.map((filter) => filter.value));
  }, [activeAffinities]);

  const decksWithAuthor = useMemo<DeckWithAuthor[]>(() => {
    return decks.map((deck) => {
      const authorLabel = deck.authorName && deck.authorName.trim().length > 0
        ? deck.authorName.trim()
        : deck.authorId
          ? `${deck.authorId.slice(0, 8)}…`
          : null;
      const authorHref = deck.authorId ? `/${locale}/players/${encodeURIComponent(deck.authorId)}` : null;

      return {
        ...deck,
        authorLabel,
        authorHref,
      };
    });
  }, [decks, locale]);

  const filteredDecks = useMemo(() => {
    if (!enabledAffinitySet) {
      return decksWithAuthor;
    }

    return decksWithAuthor.filter((deck) => {
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
    });
  }, [decksWithAuthor, enabledAffinitySet]);

  return (
    <div className="flex w-full flex-col gap-8 px-4 py-10 text-[color:var(--text-primary)] sm:px-6 lg:px-10 xl:px-16">
      <div className="flex items-center justify-start">
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
