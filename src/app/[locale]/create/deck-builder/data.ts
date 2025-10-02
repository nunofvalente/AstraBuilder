import { createClient } from '@supabase/supabase-js';

import cardsData from '@/data/cards.json';
import devCardsData from '@/data/cards-dev.json';
import type { Card, CardRow } from './types';
import { normaliseCard } from './utils';

type CardsFile = {
  generatedAt: string;
  cards: Card[];
};

const typedData = cardsData as CardsFile;
const devTypedData = devCardsData as CardsFile;

const SUPABASE_COLUMNS =
  'id,name,affinity,artist,rarity,number,type,subtype,cost,attack,health,influence,rules_text,description,image_url';

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
}

export async function getStaticCards(): Promise<{ cards: Card[]; error: string | null }> {
  const useDevCards = process.env.NEXT_PUBLIC_USE_DEV_CARDS === 'true';
  if (useDevCards) {
    return { cards: devTypedData.cards, error: null };
  }

  const fallbackCards = typedData.cards;
  const supabase = createSupabaseClient();

  if (!supabase) {
    return { cards: fallbackCards, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('cards')
      .select(SUPABASE_COLUMNS)
      .order('name', { ascending: true });

    if (error) {
      return { cards: fallbackCards, error: `Unable to load live card data: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return { cards: fallbackCards, error: 'No card data returned from database. Showing cached cards.' };
    }

    const rows = data as CardRow[];
    const cards = rows.map((row, index) => normaliseCard(row, index));

    return { cards, error: null };
  } catch (unknownError) {
    const message = unknownError instanceof Error ? unknownError.message : 'Unknown error';
    return { cards: fallbackCards, error: `Unable to load live card data: ${message}` };
  }
}
