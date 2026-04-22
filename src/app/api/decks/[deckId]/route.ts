import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';
import { getAccessibleDeckDetailById, getDeckDetailById } from '@/lib/supabase/decks';

type DeckCardPayload = {
  card_id: string;
  quantity: number;
};

function parseDeckCards(cards: unknown): DeckCardPayload[] {
  if (!Array.isArray(cards)) {
    return [];
  }

  return cards
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const value = entry as { card_id?: unknown; quantity?: unknown };
      const cardId = typeof value.card_id === 'string' ? value.card_id.trim() : '';
      const quantity = Number(value.quantity ?? 0);

      if (!cardId || !Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }

      return { card_id: cardId, quantity };
    })
    .filter((entry): entry is DeckCardPayload => Boolean(entry));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deckId: string }> }
) {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ message: 'Deck loading is not configured.' }, { status: 500 });
  }

  const { deckId } = await context.params;
  const normalizedDeckId = deckId?.trim();
  if (!normalizedDeckId) {
    return NextResponse.json({ message: 'Invalid deck id.' }, { status: 400 });
  }

  try {
    const userId = await resolveUserIdFromAuthorizationHeader(
      supabaseAdmin,
      request.headers.get('authorization')
    );
    const deck = await getAccessibleDeckDetailById(normalizedDeckId, userId, supabaseAdmin);
    if (!deck) {
      return NextResponse.json({ message: 'Deck not found.' }, { status: 404 });
    }

    return NextResponse.json({ deck });
  } catch (error) {
    console.error('Failed to load deck through API route', error);
    return NextResponse.json({ message: 'Unable to load deck.' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ deckId: string }> }
) {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ message: 'Deck saving is not configured.' }, { status: 500 });
  }

  const { deckId } = await context.params;
  const normalizedDeckId = deckId?.trim();
  if (!normalizedDeckId) {
    return NextResponse.json({ message: 'Invalid deck id.' }, { status: 400 });
  }

  try {
    const userId = await resolveUserIdFromAuthorizationHeader(
      supabaseAdmin,
      request.headers.get('authorization')
    );
    if (!userId) {
      return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
    }

    const { data: accessRow, error: accessError } = await supabaseAdmin
      .from('decks')
      .select('id,user_id')
      .eq('id', normalizedDeckId)
      .maybeSingle();

    if (accessError) {
      console.error('Failed to load deck access metadata for update', accessError);
      return NextResponse.json({ message: 'Unable to load deck.' }, { status: 500 });
    }

    if (!accessRow) {
      return NextResponse.json({ message: 'Deck not found.' }, { status: 404 });
    }

    if (accessRow.user_id !== userId) {
      return NextResponse.json({ message: 'You do not own this deck.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as
      | {
          title?: unknown;
          description?: unknown;
          is_public?: unknown;
          cards?: unknown;
        }
      | null;

    if (!body) {
      return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 45) : '';
    const descriptionRaw = typeof body.description === 'string' ? body.description.trim().slice(0, 100) : '';
    const isPublic = Boolean(body.is_public);
    const cards = parseDeckCards(body.cards);

    const previousDeck = await getDeckDetailById(normalizedDeckId, supabaseAdmin);
    const previousCards = previousDeck?.entries ?? [];

    const { error: deckUpdateError } = await supabaseAdmin
      .from('decks')
      .update({
        title: title.length > 0 ? title : 'Untitled deck',
        description: descriptionRaw.length > 0 ? descriptionRaw : null,
        is_public: isPublic,
      })
      .eq('id', normalizedDeckId)
      .eq('user_id', userId);

    if (deckUpdateError) {
      console.error('Failed to update deck metadata', deckUpdateError);
      return NextResponse.json({ message: 'Unable to update deck.' }, { status: 500 });
    }

    const { error: deleteError } = await supabaseAdmin.from('deck_cards').delete().eq('deck_id', normalizedDeckId);
    if (deleteError) {
      console.error('Failed to clear deck cards before update', deleteError);
      return NextResponse.json({ message: 'Unable to update deck cards.' }, { status: 500 });
    }

    if (cards.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('deck_cards').insert(
        cards.map((entry) => ({
          deck_id: normalizedDeckId,
          card_id: entry.card_id,
          quantity: entry.quantity,
        }))
      );

      if (insertError) {
        console.error('Failed to insert updated deck cards', insertError);

        if (previousCards.length > 0) {
          await supabaseAdmin.from('deck_cards').insert(
            previousCards.map((entry) => ({
              deck_id: normalizedDeckId,
              card_id: entry.card.id,
              quantity: entry.count,
            }))
          );
        }

        return NextResponse.json({ message: 'Unable to update deck cards.' }, { status: 500 });
      }
    }

    const deck = await getAccessibleDeckDetailById(normalizedDeckId, userId, supabaseAdmin);
    return NextResponse.json({ deck });
  } catch (error) {
    console.error('Failed to update deck through API route', error);
    return NextResponse.json({ message: 'Unable to update deck.' }, { status: 500 });
  }
}
