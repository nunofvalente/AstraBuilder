import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicDeckSummary } from '@/lib/supabase/decks';
import {
  sortDecksByNewest,
  sortDecksByOption,
  sortDecksByPopularity,
  sortDecksByTrending,
  splitDecksForHome,
} from './rankings';

function deck(overrides: Partial<PublicDeckSummary>): PublicDeckSummary {
  return {
    id: 'deck',
    title: null,
    description: null,
    createdAt: null,
    isPublic: true,
    cardCount: 0,
    viewsTotal: 0,
    favoritesTotal: 0,
    affinities: [],
    authorId: null,
    authorName: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('deck rankings', () => {
  it('sorts by popularity with views and recency tie breakers', () => {
    const decks = [
      deck({ id: 'old', favoritesTotal: 1, viewsTotal: 10, createdAt: '2024-01-01T00:00:00Z' }),
      deck({ id: 'popular', favoritesTotal: 2, viewsTotal: 1, createdAt: '2024-01-01T00:00:00Z' }),
      deck({ id: 'newer', favoritesTotal: 1, viewsTotal: 10, createdAt: '2024-02-01T00:00:00Z' }),
    ];

    expect(sortDecksByPopularity(decks).map((item) => item.id)).toEqual(['popular', 'newer', 'old']);
    expect(decks.map((item) => item.id)).toEqual(['old', 'popular', 'newer']);
  });

  it('sorts by trending score and newest date', () => {
    vi.setSystemTime(new Date('2024-02-08T00:00:00Z'));
    const decks = [
      deck({ id: 'older-high', favoritesTotal: 10, viewsTotal: 10, createdAt: '2024-01-01T00:00:00Z' }),
      deck({ id: 'newer-low', favoritesTotal: 1, viewsTotal: 10, createdAt: '2024-02-07T00:00:00Z' }),
      deck({ id: 'newest', createdAt: '2024-02-08T00:00:00Z' }),
    ];

    expect(sortDecksByTrending(decks).map((item) => item.id)).toEqual(['newer-low', 'older-high', 'newest']);
    expect(sortDecksByNewest(decks).map((item) => item.id)).toEqual(['newest', 'newer-low', 'older-high']);
    expect(sortDecksByOption(decks, 'new').map((item) => item.id)).toEqual(['newest', 'newer-low', 'older-high']);
  });

  it('splits home rankings without duplicating popular decks', () => {
    vi.setSystemTime(new Date('2024-02-08T00:00:00Z'));
    const decks = [
      deck({ id: 'popular', favoritesTotal: 10, createdAt: '2024-01-01T00:00:00Z' }),
      deck({ id: 'trending', viewsTotal: 20, createdAt: '2024-02-08T00:00:00Z' }),
      deck({ id: 'other', viewsTotal: 1, createdAt: '2024-02-08T00:00:00Z' }),
    ];

    expect(splitDecksForHome(decks, 1)).toEqual({
      popular: [decks[0]],
      trending: [decks[1]],
    });
    expect(splitDecksForHome([])).toEqual({ popular: [], trending: [] });
  });
});
