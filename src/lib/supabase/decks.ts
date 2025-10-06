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
};

export type PublicDeckSummary = DeckSummary & {
  authorId: string | null;
  authorName: string | null;
};

export async function getDeckSummariesForUser(userId: string): Promise<DeckSummary[]> {
  const { data, error } = await supabase
    .from('decks')
    .select('id,title,description,created_at,is_public,deck_cards(count),deck_stats(views_total,favorites_total)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map((row) => {
    const relationCards = (row as { deck_cards?: Array<{ count?: number }> }).deck_cards;
    const relationStats = (row as { deck_stats?: any }).deck_stats;

    let cardCount = 0;
    if (Array.isArray(relationCards) && relationCards.length > 0) {
      cardCount = Number(relationCards[0]?.count ?? 0);
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

    return {
      id: String(row.id),
      title: row.title ?? null,
      description: row.description ?? null,
      createdAt: row.created_at ?? null,
      isPublic: Boolean((row as { is_public?: boolean }).is_public),
      cardCount,
      viewsTotal,
      favoritesTotal,
    } satisfies DeckSummary;
  });
}

export async function getPublicDeckSummaries(limit = 50): Promise<PublicDeckSummary[]> {
  const { data, error } = await supabase
    .from('decks')
    .select(
      'id,title,description,created_at,is_public,user_id,deck_cards(count),deck_stats(views_total,favorites_total),profiles:profiles!decks_user_id_profiles_fkey(id,username)'
    )
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map((row) => {
    const cardRelation = (row as { deck_cards?: Array<{ count?: number }> }).deck_cards;
    const statsRelation = (row as { deck_stats?: any }).deck_stats;
    const profileRelation = (row as { profiles?: any }).profiles;

    let cardCount = 0;
    if (Array.isArray(cardRelation) && cardRelation.length > 0) {
      cardCount = Number(cardRelation[0]?.count ?? 0);
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

    let authorId = (row as { user_id?: string | null }).user_id ?? null;
    let authorName: string | null = null;

    if (Array.isArray(profileRelation) && profileRelation.length > 0) {
      authorId = profileRelation[0]?.id ?? authorId;
      authorName = profileRelation[0]?.username ?? null;
    } else if (profileRelation && typeof profileRelation === 'object') {
      authorId = profileRelation.id ?? authorId;
      authorName = profileRelation.username ?? null;
    }

    return {
      id: String(row.id),
      title: row.title ?? null,
      description: row.description ?? null,
      createdAt: row.created_at ?? null,
      isPublic: Boolean((row as { is_public?: boolean }).is_public),
      cardCount,
      viewsTotal,
      favoritesTotal,
      authorId,
      authorName,
    } satisfies PublicDeckSummary;
  });
}
