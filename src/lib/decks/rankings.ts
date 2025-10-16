import type { PublicDeckSummary } from '@/lib/supabase/decks';

const MS_PER_DAY = 86_400_000;
const AGE_DECAY_DAYS = 7;
const DEFAULT_AGE_DAYS = 30;
const FAVORITES_WEIGHT = 2;

function getAgeInDays(createdAt: string | null): number {
  if (!createdAt) {
    return DEFAULT_AGE_DAYS;
  }

  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp)) {
    return DEFAULT_AGE_DAYS;
  }

  const ageDays = (Date.now() - timestamp) / MS_PER_DAY;
  return Math.max(1, ageDays);
}

function getTrendingScore(deck: PublicDeckSummary): number {
  const favorites = Math.max(0, Number(deck.favoritesTotal ?? 0));
  const views = Math.max(0, Number(deck.viewsTotal ?? 0));
  const ageDays = getAgeInDays(deck.createdAt);
  const decay = Math.max(1, ageDays / AGE_DECAY_DAYS);

  return (favorites * FAVORITES_WEIGHT + views) / decay;
}

export function sortDecksByPopularity(decks: PublicDeckSummary[]): PublicDeckSummary[] {
  return [...decks].sort((a, b) => {
    const favoritesDiff = Number(b.favoritesTotal ?? 0) - Number(a.favoritesTotal ?? 0);
    if (favoritesDiff !== 0) {
      return favoritesDiff;
    }

    const viewsDiff = Number(b.viewsTotal ?? 0) - Number(a.viewsTotal ?? 0);
    if (viewsDiff !== 0) {
      return viewsDiff;
    }

    const aCreated = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bCreated = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bCreated - aCreated;
  });
}

export function sortDecksByTrending(decks: PublicDeckSummary[]): PublicDeckSummary[] {
  return [...decks].sort((a, b) => {
    const scoreDiff = getTrendingScore(b) - getTrendingScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return Number(b.viewsTotal ?? 0) - Number(a.viewsTotal ?? 0);
  });
}

export function sortDecksByNewest(decks: PublicDeckSummary[]): PublicDeckSummary[] {
  return [...decks].sort((a, b) => {
    const aCreated = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bCreated = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bCreated - aCreated;
  });
}

export function splitDecksForHome(
  decks: PublicDeckSummary[],
  limit = 4
): { popular: PublicDeckSummary[]; trending: PublicDeckSummary[] } {
  if (decks.length === 0) {
    return { popular: [], trending: [] };
  }

  const popular = sortDecksByPopularity(decks).slice(0, limit);
  const popularIds = new Set(popular.map((deck) => deck.id));

  const trending = sortDecksByTrending(decks)
    .filter((deck) => !popularIds.has(deck.id))
    .slice(0, limit);

  return {
    popular,
    trending,
  };
}

export type DeckSortOption = 'popular' | 'trending' | 'new';

export function sortDecksByOption(decks: PublicDeckSummary[], option: DeckSortOption): PublicDeckSummary[] {
  switch (option) {
    case 'trending':
      return sortDecksByTrending(decks);
    case 'new':
      return sortDecksByNewest(decks);
    case 'popular':
    default:
      return sortDecksByPopularity(decks);
  }
}
