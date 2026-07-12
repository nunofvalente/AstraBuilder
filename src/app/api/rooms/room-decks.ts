import type { SupabaseClient } from '@supabase/supabase-js';

import { isConstructedDeckSize } from '@/lib/decks/rules';
import { getAstraCardLookup } from '@/lib/astra/astra-card-directory';
import { getDeckDetailById } from '@/lib/supabase/decks';
import type { MatchDeckSnapshot } from '@/lib/multiplayer/match-setup';
import { buildDemoDecks } from '@/app/[locale]/play/demo-decks';

export async function loadOwnedRoomDeck(admin: SupabaseClient, userId: string, deckId: string): Promise<MatchDeckSnapshot | null> {
  try {
    if (deckId.startsWith('demo-')) {
      const demoDeck = buildDemoDecks(await getAstraCardLookup()).find((deck) => deck.id === deckId);
      if (!demoDeck || !isConstructedDeckSize(demoDeck.cardCount)) return null;
      return { id: demoDeck.id, title: demoDeck.title, entries: demoDeck.entries };
    }

    const deck = await getDeckDetailById(deckId, admin);
    const cardCount = deck?.entries.reduce((total, entry) => total + entry.count, 0) ?? 0;
    if (!deck || deck.authorId !== userId || !isConstructedDeckSize(cardCount)) return null;
    return { id: deck.id, title: deck.title, entries: deck.entries };
  } catch {
    return null;
  }
}
