'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

import type { Dictionary } from '@/i18n/get-dictionary';
import { supabase } from '@/lib/supabase/supabaseClient';

type DeckBuilderProps = {
  dictionary: Dictionary;
};

type CardRow = {
  id: string;
  name: string | null;
  affinity: string | null;
  artist: string | null;
  rarity: string | null;
  number: number | null;
  type: string | null;
  subtype: string | null;
  cost: number | null;
  attack: number | null;
  health: number | null;
  influence: number | null;
  rules_text: string | null;
  description: string | null;
  image_url: string | null;
};

type Card = {
  id: string;
  name: string;
  type: string;
  cost: number;
  attack: number;
  health: number;
  imageSrc: string;
  searchContent: string;
  detailLabel: string;
};

const FALLBACK_GRADIENTS: Array<[string, string]> = [
  ['#f97316', '#ea580c'],
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#06b6d4'],
  ['#22c55e', '#16a34a'],
  ['#38bdf8', '#2563eb'],
  ['#f472b6', '#ec4899'],
  ['#fb7185', '#f97316'],
  ['#a855f7', '#ec4899'],
];

const CARD_SKELETON_COUNT = 8;
const CARD_IMAGE_SIZES =
  '(min-width: 1600px) 12vw, (min-width: 1280px) 14vw, (min-width: 1024px) 20vw, (min-width: 640px) 40vw, 90vw';

function createCardArtwork(name: string, colorFrom: string, colorTo: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join('')
    .slice(0, 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 336" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${colorFrom}" />
        <stop offset="100%" stop-color="${colorTo}" />
      </linearGradient>
    </defs>
    <rect width="240" height="336" fill="url(#gradient)" rx="18" />
    <rect x="16" y="16" width="208" height="304" rx="14" fill="rgba(0, 0, 0, 0.25)" />
    <text x="50%" y="56" text-anchor="middle" font-family="'Montserrat', 'Arial', sans-serif" font-size="26" fill="#ffffff" opacity="0.85">${name}</text>
    <text x="50%" y="206" text-anchor="middle" font-family="'Montserrat', 'Arial', sans-serif" font-size="92" fill="#ffffff" font-weight="700" opacity="0.85">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toNumber(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function normaliseCard(row: CardRow, index: number): Card {
  const safeName = safeText(row.name) || 'Card';
  const safeType = safeText(row.type) || 'Unknown';
  const cost = toNumber(row.cost);
  const attack = toNumber(row.attack);
  const health = toNumber(row.health);
  const gradient = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];
  const imageSrc = safeText(row.image_url) || createCardArtwork(safeName, gradient[0], gradient[1]);

  const searchContent = [
    safeName,
    safeType,
    safeText(row.subtype),
    safeText(row.affinity),
    safeText(row.rarity),
    safeText(row.artist),
    safeText(row.rules_text),
    safeText(row.description),
    row.number ? String(row.number) : '',
    row.influence ? String(row.influence) : '',
    cost ? String(cost) : '',
    attack ? String(attack) : '',
    health ? String(health) : '',
  ]
    .join(' ')
    .toLowerCase();

  const detailLabel = [
    safeName,
    safeType,
    row.subtype ? `(${row.subtype})` : '',
    `Cost ${cost}`,
    row.affinity ? `Affinity ${row.affinity}` : '',
    row.rarity ? `Rarity ${row.rarity}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: row.id,
    name: safeName,
    type: safeType,
    cost,
    attack,
    health,
    imageSrc,
    searchContent,
    detailLabel,
  };
}

export function DeckBuilder({ dictionary }: DeckBuilderProps) {
  const { builder, cards: cardsCopy } = dictionary;
  const [searchTerm, setSearchTerm] = useState('');
  const [deck, setDeck] = useState<Record<string, number>>({});
  const [cards, setCards] = useState<Card[]>([]);
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
          .from('cards')
          .select(
            'id,name,affinity,artist,rarity,number,type,subtype,cost,attack,health,influence,rules_text,description,image_url',
          )
          .order('name', { ascending: true });

        if (!isMounted) {
          return;
        }

        if (error) {
          console.error('Failed to load cards', error);
          setCardsError(error.message ?? 'Unable to load cards.');
          setCards([]);
          setIsLoadingCards(false);
          return;
        }

        const rows = (data ?? []) as CardRow[];
        const nextCards = rows.map((row, index) => normaliseCard(row, index));
        setCards(nextCards);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to load cards.';
        console.error('Failed to load cards', error);
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
  }, []);

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

  const filteredCards = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return cards;
    }

    return cards.filter((card) => card.searchContent.includes(term));
  }, [cards, searchTerm]);

  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  const deckEntries = useMemo(() => {
    return Object.entries(deck)
      .map(([cardId, count]) => {
        const card = cardMap.get(cardId);
        if (!card) {
          return undefined;
        }
        return { card, count };
      })
      .filter((entry): entry is { card: Card; count: number } => Boolean(entry));
  }, [deck, cardMap]);

  const totalCards = useMemo(
    () => deckEntries.reduce((sum, entry) => sum + entry.count, 0),
    [deckEntries],
  );

  const highestCost = useMemo(() => cards.reduce((max, card) => (card.cost > max ? card.cost : max), 0), [cards]);

  const costBuckets = useMemo(() => {
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

  const cardCountLabel = isLoadingCards ? '...' : `${filteredCards.length} / ${cards.length}`;
  const errorMessage = cardsError ?? cardsCopy.error;

  return (
    <div className="flex h-full w-full flex-1 flex-col gap-0 px-0 pb-0 pt-0 text-[color:var(--text-primary)]">
      <div className="flex flex-1 flex-col gap-0 lg:flex-row lg:gap-0 lg:items-stretch">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-none border border-[color:var(--border)] bg-[color:var(--surface)]">
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
              <div className="flex flex-shrink-0 flex-col items-end text-xs text-[color:var(--text-secondary)]">
                <span>Library: {cardCountLabel}</span>
                <span>{builder.totalCardsLabel}: {totalCards}</span>
              </div>
            </div>
            <div className="mt-2 bg-[color:var(--surface-muted)]/40 p-3 text-xs text-[color:var(--text-secondary)]">
              <p className="leading-relaxed">{builder.filtersDescription}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {isLoadingCards ? (
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {Array.from({ length: CARD_SKELETON_COUNT }).map((_, index) => (
                  <li key={index}>
                    <div className="aspect-[5/7] w-full animate-pulse rounded-none bg-[color:var(--surface-muted)]" />
                  </li>
                ))}
              </ul>
            ) : cardsError ? (
              <p className="text-center text-sm text-[color:var(--text-secondary)]">{errorMessage}</p>
            ) : filteredCards.length === 0 ? (
              <p className="text-center text-sm text-[color:var(--text-secondary)]">{builder.noResults}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {filteredCards.map((card) => {
                  const copies = deck[card.id] ?? 0;
                  const isSelected = copies > 0;

                  return (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() => handleAddCard(card.id)}
                        aria-label={`${builder.addButton} ${card.name}`}
                        className="group relative block h-full w-full focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                      >
                        <span className="sr-only">{card.detailLabel}</span>
                        <div
                          className={`relative overflow-hidden rounded-none shadow-md transition-transform duration-150 group-hover:-translate-y-1 group-hover:shadow-2xl ${
                            isSelected ? 'ring-2 ring-[color:var(--accent)]' : ''
                          }`}
                        >
                          <Image
                            src={card.imageSrc}
                            alt={card.name}
                            width={240}
                            height={336}
                            className="h-auto w-full select-none"
                            sizes={CARD_IMAGE_SIZES}
                          />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openZoom(card);
                            }}
                            aria-label={`Zoom ${card.name}`}
                            className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white opacity-0 transition hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              className="h-4 w-4"
                            >
                              <path d="m21 21-4.35-4.35" />
                              <circle cx="11" cy="11" r="6" />
                            </svg>
                          </button>
                          {copies > 0 ? (
                            <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                              x{copies}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-1 flex-col gap-6">
          <section className="flex min-h-[40vh] flex-1 flex-col overflow-hidden rounded-none border border-[color:var(--border)] bg-[color:var(--surface)]">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-lg font-semibold">{builder.deckHeading}</h2>
              <span className="text-xs text-[color:var(--text-secondary)]">
                {builder.totalCardsLabel}: {totalCards}
              </span>
            </div>
            {deckEntries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">{builder.emptyDeck}</p>
            ) : (
              <div className="deck-scroll flex-1 overflow-y-auto px-4 pb-4">
                <ul className="flex flex-col gap-3">
                  {deckEntries.map(({ card, count }) => (
                    <li key={card.id} className="group flex items-center gap-3 rounded-none border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 p-2">
                      <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-none">
                        <Image
                          src={card.imageSrc}
                          alt={card.name}
                          width={120}
                          height={168}
                          className="h-full w-full select-none object-cover"
                          sizes="120px"
                        />
                        <button
                          type="button"
                          onClick={() => openZoom(card)}
                          aria-label={`Zoom ${card.name}`}
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            className="h-3 w-3"
                          >
                            <path d="m21 21-4.35-4.35" />
                            <circle cx="11" cy="11" r="6" />
                          </svg>
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{card.name}</p>
                        <p className="truncate text-xs text-[color:var(--text-secondary)]">
                          {builder.totalCardsLabel}: {count} | {card.type} | Cost {card.cost}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-xs font-semibold text-[color:var(--text-on-accent)]">
                          x{count}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCard(card.id)}
                          className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[var(--surface)]"
                        >
                          {builder.removeButton}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-none border border-[color:var(--border)] bg-[color:var(--surface)]">
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
          </section>
        </aside>
      </div>

      {zoomCard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-4xl">
            <button
              type="button"
              onClick={() => setZoomCard(null)}
              className="absolute right-4 top-4 rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              aria-label="Close zoomed card"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5"
              >
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
            <div className="overflow-hidden rounded-none bg-[color:var(--surface)] p-4 shadow-2xl">
              <Image
                src={zoomCard.imageSrc}
                alt={zoomCard.name}
                width={480}
                height={672}
                className="h-auto w-full select-none rounded-none"
                sizes="(min-width: 1280px) 480px, 90vw"
              />
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{zoomCard.detailLabel}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}














