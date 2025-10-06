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
};

export type PublicDeckSummary = DeckSummary & {
  authorId: string | null;
  authorName: string | null;
};

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
    authorId,
    authorName,
    affinities,
  } satisfies PublicDeckSummary;
}

export async function getDeckSummariesForUser(userId: string): Promise<DeckSummary[]> {
  const { data, error } = await supabase
    .from('decks')
    .select('id,title,description,created_at,is_public,deck_cards(quantity,cards(affinity)),deck_stats(views_total,favorites_total)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map((row) => {
    const relationCards = (row as { deck_cards?: Array<{ quantity?: number | null; cards?: { affinity?: string | null } | null }> }).deck_cards;
    const relationStats = (row as { deck_stats?: any }).deck_stats;

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

    return {
      id: String(row.id),
      title: row.title ?? null,
      description: row.description ?? null,
      createdAt: row.created_at ?? null,
      isPublic: Boolean((row as { is_public?: boolean }).is_public),
      cardCount,
      viewsTotal,
      favoritesTotal,
      affinities,
    } satisfies DeckSummary;
  });
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
