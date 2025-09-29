"use client";

import { useMemo, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";

type DeckBuilderProps = {
  dictionary: Dictionary;
};

type SampleCard = {
  id: string;
  name: string;
  cost: number;
  type: string;
  attack: number;
  health: number;
};

const SAMPLE_CARDS: SampleCard[] = [
  { id: "card-1", name: "Solar Knight", cost: 1, type: "Unit", attack: 2, health: 1 },
  { id: "card-2", name: "Moonlit Seer", cost: 2, type: "Unit", attack: 1, health: 3 },
  { id: "card-3", name: "Astra Bolt", cost: 3, type: "Spell", attack: 3, health: 0 },
  { id: "card-4", name: "Verdant Guardian", cost: 4, type: "Unit", attack: 3, health: 5 },
  { id: "card-5", name: "Crystalline Drake", cost: 5, type: "Unit", attack: 5, health: 4 },
  { id: "card-6", name: "Starfall Nova", cost: 6, type: "Spell", attack: 6, health: 0 },
  { id: "card-7", name: "Eclipse Titan", cost: 7, type: "Unit", attack: 7, health: 7 },
  { id: "card-8", name: "Temporal Archivist", cost: 3, type: "Unit", attack: 2, health: 4 },
  { id: "card-9", name: "Glimmer Sprite", cost: 1, type: "Unit", attack: 1, health: 1 },
  { id: "card-10", name: "Celestial Beacon", cost: 2, type: "Spell", attack: 0, health: 0 },
];

const CARD_MAP = new Map(SAMPLE_CARDS.map((card) => [card.id, card]));
const MAX_COST = SAMPLE_CARDS.reduce((max, card) => (card.cost > max ? card.cost : max), 0);
const COST_BUCKETS = Array.from({ length: MAX_COST + 1 }, (_, cost) => cost);

export function DeckBuilder({ dictionary }: DeckBuilderProps) {
  const { builder, cards } = dictionary;
  const [searchTerm, setSearchTerm] = useState("");
  const [deck, setDeck] = useState<Record<string, number>>({});

  const filteredCards = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return SAMPLE_CARDS;
    }

    return SAMPLE_CARDS.filter((card) => {
      const searchableValues = [card.name, card.type].join(" ").toLowerCase();
      return searchableValues.includes(term);
    });
  }, [searchTerm]);

  const deckEntries = useMemo(() => {
    return Object.entries(deck)
      .map(([cardId, count]) => {
        const card = CARD_MAP.get(cardId);

        if (!card) {
          return undefined;
        }

        return { card, count };
      })
      .filter((entry): entry is { card: SampleCard; count: number } => Boolean(entry));
  }, [deck]);

  const totalCards = useMemo(
    () => deckEntries.reduce((sum, entry) => sum + entry.count, 0),
    [deckEntries],
  );

  const costBuckets = useMemo(() => {
    return COST_BUCKETS.map((cost) => {
      const count = deckEntries.reduce((sum, entry) => {
        return entry.card.cost === cost ? sum + entry.count : sum;
      }, 0);

      return { cost, count };
    });
  }, [deckEntries]);

  const maxBucketCount = costBuckets.reduce((max, bucket) => (bucket.count > max ? bucket.count : max), 0);

  function handleAddCard(cardId: string) {
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 text-[color:var(--text-primary)]">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{builder.title}</h1>
        <p className="text-sm text-[color:var(--text-secondary)]">{builder.comingSoon}</p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <section className="flex w-full flex-col gap-4 lg:w-1/2">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <label className="block text-sm font-medium" htmlFor="card-search">
              {builder.searchLabel}
            </label>
            <input
              id="card-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={builder.searchPlaceholder}
              className="mt-2 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
            />
          </div>

          <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <h2 className="text-lg font-semibold">{builder.filtersHeading}</h2>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{builder.filtersDescription}</p>
          </div>

          <div className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-lg font-semibold">{builder.cardsHeading}</h2>
              <span className="text-xs text-[color:var(--text-secondary)]">
                {filteredCards.length} / {SAMPLE_CARDS.length}
              </span>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {filteredCards.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">{builder.noResults}</p>
              ) : (
                <ul className="divide-y divide-[color:var(--border)]">
                  {filteredCards.map((card) => {
                    const copies = deck[card.id] ?? 0;

                    return (
                      <li key={card.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-medium">{card.name}</p>
                          <p className="text-xs text-[color:var(--text-secondary)]">
                            {cards.fields.cost}: {card.cost} | {cards.fields.type}: {card.type}
                          </p>
                          <p className="text-xs text-[color:var(--text-secondary)]">
                            {cards.fields.attack}: {card.attack} | {cards.fields.health}: {card.health}
                          </p>
                          {copies > 0 ? (
                            <p className="text-xs font-medium text-[color:var(--accent)]">
                              x{copies}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddCard(card.id)}
                          className="self-center rounded-md border border-[color:var(--accent)] px-3 py-1 text-xs font-semibold text-[color:var(--accent)] transition hover:bg-[color:var(--accent)] hover:text-[color:var(--text-on-accent)]"
                        >
                          {builder.addButton}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="flex w-full flex-col gap-4 lg:w-1/2">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-lg font-semibold">{builder.costCurveHeading}</h2>
            </div>
            {totalCards === 0 ? (
              <p className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">{builder.costCurveEmpty}</p>
            ) : (
              <div className="flex items-end gap-3 px-4 py-6">
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
                        <span className="pb-1 text-xs font-semibold text-[color:var(--text-on-accent)]">
                          {bucket.count}
                        </span>
                      </div>
                      <span className="text-xs text-[color:var(--text-secondary)]">{bucket.cost}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-lg font-semibold">{builder.deckHeading}</h2>
              <span className="text-xs text-[color:var(--text-secondary)]">
                {builder.totalCardsLabel}: {totalCards}
              </span>
            </div>
            {deckEntries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">{builder.emptyDeck}</p>
            ) : (
              <ul className="divide-y divide-[color:var(--border)]">
                {deckEntries.map(({ card, count }) => (
                  <li key={card.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium">{card.name}</p>
                      <p className="text-xs text-[color:var(--text-secondary)]">
                        {cards.fields.cost}: {card.cost} | {cards.fields.type}: {card.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">x{count}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCard(card.id)}
                        className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[var(--surface-muted)]"
                      >
                        {builder.removeButton}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


