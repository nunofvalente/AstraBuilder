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

const PUBLIC_DECK_SELECT =
  'id,title,description,created_at,is_public,user_id,deck_cards(quantity,cards(affinity)),deck_stats(views_total,favorites_total),profiles:profiles!decks_user_id_profiles_fkey(id,username)';

type DeckCardRelation = {
  quantity?: number | null;
  cards?: {
    affinity?: string | null;
  } | null;
};

type DeckStatsRelation = Array<{ views_total?: number | null; favorites_total?: number | null }> | { views_total?: number | null; favorites_total?: number | null } | null;

type ProfileRelation =
  | Array<{
      id?: string | null;
      username?: string | null;
    }>
  | {
      id?: string | null;
      username?: string | null;
    }
  | null;

type PublicDeckRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  is_public?: boolean | null;
  user_id?: string | null;
  deck_cards?: DeckCardRelation[] | null;
  deck_stats?: DeckStatsRelation;
  profiles?: ProfileRelation;
};

type DeckRow = {
  id: string | number;
  title?: string | null;
  description?: string | null;
  created_at?: string | null;
  is_public?: boolean | null;
  deck_cards?: DeckCardRelation[] | null;
  deck_stats?: DeckStatsRelation;
  user_id?: string | null;
  profiles?: ProfileRelation;
};

function mapDeckRowToSummary(row: DeckRow): DeckSummary {
  const relationCards = row.deck_cards;
  const relationStats = row.deck_stats;
  const profileRelation = row.profiles;

  let cardCount = 0;
  const affinityTotals = new Map<string, number>();

  if (Array.isArray(relationCards)) {
    for (const entry of relationCards) {
      const quantity = Math.max(0, Number(entry?.quantity ?? 0));
      cardCount += quantity;

      const normalizedAffinity = normalizeAffinity(entry?.cards?.affinity);
      if (!normalizedAffinity) {
        continue;
      }

      affinityTotals.set(normalizedAffinity, (affinityTotals.get(normalizedAffinity) ?? 0) + quantity);
    }
  }

  let viewsTotal = 0;
  let favoritesTotal = 0;

  if (Array.isArray(relationStats) && relationStats.length > 0) {
    viewsTotal = Number(relationStats[0]?.views_total ?? 0);
    favoritesTotal = Number(relationStats[0]?.favorites_total ?? 0);
  } else if (relationStats && typeof relationStats === 'object') {
    viewsTotal = Number((relationStats as { views_total?: number }).views_total ?? 0);
    favoritesTotal = Number((relationStats as { favorites_total?: number }).favorites_total ?? 0);
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

  let authorId = row.user_id ?? null;
  let authorName: string | null = null;

  if (Array.isArray(profileRelation) && profileRelation.length > 0) {
    authorId = profileRelation[0]?.id ?? authorId;
    authorName = profileRelation[0]?.username ?? null;
  } else if (profileRelation && !Array.isArray(profileRelation) && typeof profileRelation === 'object') {
    authorId = profileRelation.id ?? authorId;
    authorName = profileRelation.username ?? null;
  }

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
    authorId: authorId ? String(authorId) : null,
    authorName: authorName && authorName.trim().length > 0 ? authorName.trim() : null,
  };
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

function mapPublicDeckRow(row: PublicDeckRow): PublicDeckSummary {
  const cardRelation = row.deck_cards;
  const statsRelation = row.deck_stats;
  const profileRelation = row.profiles;

  let cardCount = 0;
  const affinityTotals = new Map<string, number>();

  if (Array.isArray(cardRelation)) {
    for (const entry of cardRelation) {
      const quantity = Math.max(0, Number(entry?.quantity ?? 0));
      cardCount += quantity;

      const normalizedAffinity = normalizeAffinity(entry?.cards?.affinity);
      if (!normalizedAffinity) {
        continue;
      }
      affinityTotals.set(normalizedAffinity, (affinityTotals.get(normalizedAffinity) ?? 0) + quantity);
    }
  }

  let viewsTotal = 0;
  let favoritesTotal = 0;

  if (Array.isArray(statsRelation) && statsRelation.length > 0) {
    viewsTotal = Number(statsRelation[0]?.views_total ?? 0);
    favoritesTotal = Number(statsRelation[0]?.favorites_total ?? 0);
  } else if (statsRelation && typeof statsRelation === 'object') {
    viewsTotal = Number((statsRelation as { views_total?: number }).views_total ?? 0);
    favoritesTotal = Number((statsRelation as { favorites_total?: number }).favorites_total ?? 0);
  }

  let authorId = row.user_id ?? null;
  let authorName: string | null = null;

  if (Array.isArray(profileRelation) && profileRelation.length > 0) {
    authorId = profileRelation[0]?.id ?? authorId;
    authorName = profileRelation[0]?.username ?? null;
  } else if (profileRelation && !Array.isArray(profileRelation) && typeof profileRelation === 'object') {
    authorId = profileRelation.id ?? authorId;
    authorName = profileRelation.username ?? null;
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

  return {
    id: String(row.id),
    title: row.title ?? null,
    description: row.description ?? null,
    createdAt: row.created_at ?? null,
    isPublic: Boolean(row.is_public),
    cardCount,
    viewsTotal,
    favoritesTotal,
    authorId: authorId ? String(authorId) : null,
    authorName: authorName && authorName.trim().length > 0 ? authorName.trim() : null,
    affinities,
  } satisfies PublicDeckSummary;
}

export async function getDeckSummariesForUser(userId: string): Promise<DeckSummary[]> {
  const { data, error } = await supabase
    .from('decks')
    .select(
      'id,title,description,created_at,is_public,user_id,deck_cards(quantity,cards(affinity)),deck_stats(views_total,favorites_total),profiles:profiles!decks_user_id_profiles_fkey(id,username)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  const summaries = (data as DeckRow[]).map((row) => mapDeckRowToSummary(row));
  return hydrateDeckSummariesWithProfiles(summaries);
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

  return data.map((row) => mapPublicDeckRow(row as PublicDeckRow));
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
  let summaries = (deckRows as PublicDeckRow[]).map((row) => mapPublicDeckRow(row) as DeckSummary);
  summaries = await hydrateDeckSummariesWithProfiles(summaries);

  return summaries.sort((a, b) => {
    const aIndex = favoriteDeckOrder.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bIndex = favoriteDeckOrder.get(b.id) ?? Number.POSITIVE_INFINITY;
    return aIndex - bIndex;
  });
}

export async function getAllPublicDeckSummaries(batchSize = 200, maxPages = 10): Promise<PublicDeckSummary[]> {
  const results: PublicDeckSummary[] = [];

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

    results.push(...data.map((row) => mapPublicDeckRow(row as PublicDeckRow)));

    if (data.length < batchSize) {
      break;
    }
  }

  return results;
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

  return mapPublicDeckRow(data as PublicDeckRow);
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

  return data.map((row) => mapPublicDeckRow(row as PublicDeckRow));
}
