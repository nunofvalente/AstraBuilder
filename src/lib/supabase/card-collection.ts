import { supabase } from './supabaseClient';

export type CardCollectionQuantities = Record<string, number>;

type CollectionRow = {
  card_id?: string | null;
  quantity?: number | null;
};

export function normalizeCollectionRows(rows: CollectionRow[]): CardCollectionQuantities {
  const quantities: CardCollectionQuantities = {};
  for (const row of rows) {
    const cardId = row.card_id?.trim();
    const quantity = Math.max(0, Math.min(999, Math.floor(Number(row.quantity ?? 0))));
    if (cardId && quantity > 0) {
      quantities[cardId] = quantity;
    }
  }
  return quantities;
}

export async function getCardCollectionForUser(userId: string): Promise<CardCollectionQuantities> {
  const { data, error } = await supabase
    .from('user_card_collection')
    .select('card_id,quantity')
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
  return normalizeCollectionRows((data ?? []) as CollectionRow[]);
}

export async function setCardCollectionQuantity(
  userId: string,
  cardId: string,
  quantity: number
): Promise<void> {
  const normalizedCardId = cardId.trim();
  const normalizedQuantity = Math.max(0, Math.min(999, Math.floor(Number(quantity))));
  if (!normalizedCardId) {
    throw new Error('A card id is required.');
  }

  if (normalizedQuantity === 0) {
    const { error } = await supabase
      .from('user_card_collection')
      .delete()
      .eq('user_id', userId)
      .eq('card_id', normalizedCardId);
    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await supabase.from('user_card_collection').upsert(
    {
      user_id: userId,
      card_id: normalizedCardId,
      quantity: normalizedQuantity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,card_id' }
  );
  if (error) {
    throw error;
  }
}
