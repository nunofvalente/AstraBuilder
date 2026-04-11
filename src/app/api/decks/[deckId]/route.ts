import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';
import { getAccessibleDeckDetailById } from '@/lib/supabase/decks';

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
