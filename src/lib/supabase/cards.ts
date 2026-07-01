import { createClient } from '@supabase/supabase-js';

import type { CardRow } from '@/app/[locale]/create/deck-builder/types';

const CARD_COLUMNS = [
  'id',
  'name',
  'affinity',
  'artist',
  'rarity',
  'number',
  'type',
  'subtype',
  'cost',
  'attack',
  'health',
  'influence',
  'rules_text',
  'description',
  'image_url',
].join(',');

export async function getSupabaseCardRows(): Promise<{ rows: CardRow[]; error: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      rows: [],
      error: 'Supabase card catalogue is not configured. Showing cached cards.',
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from('cards')
    .select(CARD_COLUMNS)
    .order('name', { ascending: true });

  if (error) {
    return {
      rows: [],
      error: `Unable to load Supabase card catalogue: ${error.message}`,
    };
  }

  return {
    rows: (data ?? []) as unknown as CardRow[],
    error: null,
  };
}
