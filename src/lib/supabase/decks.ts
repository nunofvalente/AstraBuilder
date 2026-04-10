import type { Card, DeckEntry } from '@/app/[locale]/create/deck-builder/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAstraCardLookup } from '@/lib/astra/astra-card-directory';
import { normalizeAffinity } from '@/lib/cards/affinity';

import { supabase } from './supabaseClient';

export type DeckSummary = {
  id: string;
  title: string | null;
  description: string | null;
  createdAt: string | null;
  isPublic: boolean;
  cardCount: number;
  viewsTotal: number;
  favoritesTotal: number;
  affinities: string[];
  authorId: string | null;
  authorName: string | null;
};

export type PublicDeckSummary = DeckSummary;

export type DeckDetailData = {
  id: string;
  title: string | null;
  description: string | null;
  isPublic: boolean;
  createdAt: string | null;
  favoritesTotal: number;
  viewsTotal: number;
  authorName: string | null;
  authorId: string | null;
  authorXLink: string | null;
  authorYoutubeLink: string | null;
  entries: DeckEntry[];
};

const PUBLIC_DECK_SELECT =
  'id,title,description,created_at,is_public,user_id,deck_cards(*),deck_stats(views_total,favorites_total),profiles:profiles!decks_user_id_profiles_fkey(id,username)';

const DECK_DETAIL_SELECT =
  'id,title,description,created_at,is_public,user_id,deck_cards(*),deck_stats(views_total,favorites_total),profiles:profiles!decks_user_id_profiles_fkey(id,username,x_link,youtube_link)';

type DeckCardReference = {
  quantity?: number | null;
  card_id?: string | null;
  card_id_astra?: string | null;
};

type DeckStatsRelation =
  | Array<{ views_total?: number | null; favorites_total?: number | null }>
  | { views_total?: number | null; favorites_total?: number | null }
  | null;

type ProfileRelation =
  | Array<{
      id?: string | null;
      username?: string | null;
      x_link?: string | null;
      youtube_link?: string | null;
    }>
  | {
      id?: string | null;
      username?: string | null;
      x_link?: string | null;
      youtube_link?: string | null;
    }
  | null;

type DeckRow = {
  id: string | number;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  is_public?: boolean | null;
  user_id?: string | null;
  deck_cards?: DeckCardReference[] | null;
  deck_stats?: DeckStatsRelation;
  profiles?: ProfileRelation;
};

type DeckDetailRow = DeckRow;
type DeckDataClient = Pick<SupabaseClient, 'from'>;

function resolveStats(statsRelation: DeckStatsRelation): { viewsTotal: number; favoritesTotal: number } {
  if (Array.isArray(statsRelation) && statsRelation.length > 0) {
    return {
      viewsTotal: Number(statsRelation[0]?.views_total ?? 0),
      favoritesTotal: Number(statsRelation[0]?.favorites_total ?? 0),
    };
  }

  if (statsRelation && !Array.isArray(statsRelation) && typeof statsRelation === 'object') {
    return {
      viewsTotal: Number(statsRelation.views_total ?? 0),
      favoritesTotal: Number(statsRelation.favorites_total ?? 0),
    };
  }

  return { viewsTotal: 0, favoritesTotal: 0 };
}

function resolveProfile(profileRelation: ProfileRelation, fallbackAuthorId: string | null): {
  authorId: string | null;
  authorName: string | null;
  authorXLink: string | null;
  authorYoutubeLink: string | null;
} {
  if (Array.isArray(profileRelation) && profileRelation.length > 0) {
    return {
      authorId: profileRelation[0]?.id ?? fallbackAuthorId,
      authorName: profileRelation[0]?.username ?? null,
      authorXLink: profileRelation[0]?.x_link ?? null,
      authorYoutubeLink: profileRelation[0]?.youtube_link ?? null,
    };
  }

  if (profileRelation && !Array.isArray(profileRelation) && typeof profileRelation === 'object') {
    return {
      authorId: profileRelation.id ?? fallbackAuthorId,
      authorName: profileRelation.username ?? null,
      authorXLink: profileRelation.x_link ?? null,
      authorYoutubeLink: profileRelation.youtube_link ?? null,
    };
  }

  return {
    authorId: fallbackAuthorId,
    authorName: null,
    authorXLink: null,
    authorYoutubeLink: null,
  };
}

function resolveDeckCardId(entry: DeckCardReference | null | undefined): string | null {
  if (!entry) {
    return null;
  }

  if (typeof entry.card_id_astra === 'string' && entry.card_id_astra.trim().length > 0) {
    return entry.card_id_astra.trim();
  }

  if (typeof entry.card_id === 'string' && entry.card_id.trim().length > 0) {
    return entry.card_id.trim();
  }

  return null;
}

function buildDeckAggregates(
  deckCards: DeckCardReference[] | null | undefined,
  astraCardLookup: Map<string, Card>
): { cardCount: number; affinities: string[] } {
  let cardCount = 0;
  const affinityTotals = new Map<string, number>();

  for (const entry of deckCards ?? []) {
    const quantity = Math.max(0, Number(entry?.quantity ?? 0));
    const cardId = resolveDeckCardId(entry);
    cardCount += quantity;

    if (!cardId) {
      continue;
    }

    const card = astraCardLookup.get(cardId);
    const normalizedAffinity = normalizeAffinity(card?.affinity);
    if (!normalizedAffinity) {
      continue;
    }

    affinityTotals.set(normalizedAffinity, (affinityTotals.get(normalizedAffinity) ?? 0) + quantity);
  }

  const affinities = Array.from(affinityTotals.entries())
    .sort((a, b) => {
      const quantityDiff = b[1] - a[1];
      if (quantityDiff !== 0) {
        return quantityDiff;
      }

      return a[0].localeCompare(b[0]);
    })
    .map(([name]) => name);

  return { cardCount, affinities };
}

function mapDeckRowToSummary(row: DeckRow, astraCardLookup: Map<string, Card>): DeckSummary {
  const { cardCount, affinities } = buildDeckAggregates(row.deck_cards, astraCardLookup);
  const { viewsTotal, favoritesTotal } = resolveStats(row.deck_stats ?? null);
  const profile = resolveProfile(row.profiles ?? null, row.user_id ?? null);

  return {
    id: String(row.id),
    title: row.title ?? null,
    description: row.description ?? null,
    createdAt: row.created_at ?? null,
    isPublic: Boolean(row.is_public),
    cardCount,
    viewsTotal,
    favoritesTotal,
    affinities,
    authorId: profile.authorId ? String(profile.authorId) : null,
    authorName: profile.authorName && profile.authorName.trim().length > 0 ? profile.authorName.trim() : null,
  };
}

function buildDeckEntries(
  deckCards: DeckCardReference[] | null | undefined,
  astraCardLookup: Map<string, Card>
): DeckEntry[] {
  const entries: DeckEntry[] = [];

  for (const entry of deckCards ?? []) {
    const quantity = Math.max(0, Number(entry?.quantity ?? 0));
    const cardId = resolveDeckCardId(entry);
    if (!cardId || quantity <= 0) {
      continue;
    }

    const card = astraCardLookup.get(cardId);
    if (!card) {
      continue;
    }

    entries.push({ card, count: quantity });
  }

  return entries;
}

async function hydrateDeckSummariesWithProfiles(decks: DeckSummary[]): Promise<DeckSummary[]> {
  const missingAuthorIds = Array.from(
    new Set(
      decks
        .filter((deck) => (!deck.authorName || deck.authorName.trim().length === 0) && deck.authorId)
        .map((deck) => deck.authorId as string)
    )
  );

  if (missingAuthorIds.length === 0) {
    return decks;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id,username')
    .in('id', missingAuthorIds);

  if (error || !data) {
    return decks;
  }

  const profileLookup = new Map<string, string>();
  for (const profile of data) {
    const idValue = profile?.id;
    const username = typeof profile?.username === 'string' ? profile.username.trim() : '';
    const id = typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue) : null;
    if (id && username.length > 0) {
      profileLookup.set(id, username);
    }
  }

  if (profileLookup.size === 0) {
    return decks;
  }

  return decks.map((deck) => {
    if (!deck.authorName && deck.authorId) {
      const username = profileLookup.get(deck.authorId);
      if (username) {
        return { ...deck, authorName: username };
      }
    }

    return deck;
  });
}

async function resolveDeckRowsToSummaries(rows: DeckRow[]): Promise<DeckSummary[]> {
  const astraCardLookup = await getAstraCardLookup();
  const summaries = rows.map((row) => mapDeckRowToSummary(row, astraCardLookup));
  return hydrateDeckSummariesWithProfiles(summaries);
}

async function resolveDeckStatsWithFallback(
  deckId: string,
  statsRelation: DeckStatsRelation,
  client: DeckDataClient = supabase
): Promise<{ viewsTotal: number; favoritesTotal: number }> {
  const stats = resolveStats(statsRelation);
  if (stats.viewsTotal !== 0 || stats.favoritesTotal !== 0) {
    return stats;
  }

  const { data } = await client
    .from('deck_stats')
    .select('views_total,favorites_total')
    .eq('deck_id', deckId)
    .maybeSingle();

  if (!data) {
    return stats;
  }

  return {
    viewsTotal: Math.max(stats.viewsTotal, Number(data.views_total ?? 0)),
    favoritesTotal: Math.max(stats.favoritesTotal, Number(data.favorites_total ?? 0)),
  };
}

export async function getDeckSummariesForUser(userId: string): Promise<DeckSummary[]> {
  const { data, error } = await supabase
    .from('decks')
    .select(PUBLIC_DECK_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return resolveDeckRowsToSummaries(data as DeckRow[]);
}

export async function getPublicDeckSummaries(limit = 50): Promise<PublicDeckSummary[]> {
  const { data, error } = await supabase
    .from('decks')
    .select(PUBLIC_DECK_SELECT)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return resolveDeckRowsToSummaries(data as DeckRow[]);
}

export async function getFavoriteDeckSummariesForUser(userId: string): Promise<DeckSummary[]> {
  const { data, error } = await supabase
    .from('deck_favorite_events')
    .select('deck_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  const favoriteDeckIds: string[] = [];

  for (const entry of data ?? []) {
    const value = entry as { deck_id?: string | number | null };
    const identifier = value?.deck_id;
    if (identifier === null || identifier === undefined) {
      continue;
    }

    const deckId = String(identifier);
    if (!favoriteDeckIds.includes(deckId)) {
      favoriteDeckIds.push(deckId);
    }
  }

  if (favoriteDeckIds.length === 0) {
    return [];
  }

  const { data: deckRows, error: decksError } = await supabase
    .from('decks')
    .select(PUBLIC_DECK_SELECT)
    .in('id', favoriteDeckIds);

  if (decksError) {
    throw decksError;
  }

  if (!deckRows) {
    return [];
  }

  const favoriteDeckOrder = new Map(favoriteDeckIds.map((deckId, index) => [deckId, index]));
  const summaries = await resolveDeckRowsToSummaries(deckRows as DeckRow[]);

  return summaries.sort((a, b) => {
    const aIndex = favoriteDeckOrder.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bIndex = favoriteDeckOrder.get(b.id) ?? Number.POSITIVE_INFINITY;
    return aIndex - bIndex;
  });
}

export async function getAllPublicDeckSummaries(batchSize = 200, maxPages = 10): Promise<PublicDeckSummary[]> {
  const results: DeckRow[] = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * batchSize;
    const to = from + batchSize - 1;

    const { data, error } = await supabase
      .from('decks')
      .select(PUBLIC_DECK_SELECT)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    results.push(...(data as DeckRow[]));

    if (data.length < batchSize) {
      break;
    }
  }

  return resolveDeckRowsToSummaries(results);
}

export async function getPublicDeckSummaryById(deckId: string): Promise<PublicDeckSummary | null> {
  const { data, error } = await supabase
    .from('decks')
    .select(PUBLIC_DECK_SELECT)
    .eq('is_public', true)
    .eq('id', deckId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const [summary] = await resolveDeckRowsToSummaries([data as DeckRow]);
  return summary ?? null;
}

export async function getPublicDeckSummariesByAuthor(authorId: string, limit = 50): Promise<PublicDeckSummary[]> {
  const { data, error } = await supabase
    .from('decks')
    .select(PUBLIC_DECK_SELECT)
    .eq('is_public', true)
    .eq('user_id', authorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return resolveDeckRowsToSummaries(data as DeckRow[]);
}

export async function getDeckDetailById(
  deckId: string,
  client: DeckDataClient = supabase
): Promise<DeckDetailData | null> {
  const { data, error } = await client
    .from('decks')
    .select(DECK_DETAIL_SELECT)
    .eq('id', deckId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as DeckDetailRow;
  const astraCardLookup = await getAstraCardLookup();
  const profile = resolveProfile(row.profiles ?? null, row.user_id ?? null);
  const stats = await resolveDeckStatsWithFallback(String(row.id), row.deck_stats ?? null, client);

  return {
    id: String(row.id),
    title: row.title ?? null,
    description: row.description ?? null,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at ?? null,
    favoritesTotal: stats.favoritesTotal,
    viewsTotal: stats.viewsTotal,
    authorName: profile.authorName && profile.authorName.trim().length > 0 ? profile.authorName.trim() : null,
    authorId: profile.authorId ? String(profile.authorId) : null,
    authorXLink: profile.authorXLink ?? null,
    authorYoutubeLink: profile.authorYoutubeLink ?? null,
    entries: buildDeckEntries(row.deck_cards, astraCardLookup),
  };
}
