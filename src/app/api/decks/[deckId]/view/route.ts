import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';
import { getDeckAccessMetadata } from '@/lib/supabase/decks';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deckId: string }> }
) {
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ message: 'Deck view recording is not configured.' }, { status: 500 });
  }

  const { deckId } = await context.params;
  const parsedDeckId = Number(deckId);
  if (!Number.isSafeInteger(parsedDeckId) || parsedDeckId <= 0) {
    return NextResponse.json({ message: 'Invalid deck id.' }, { status: 400 });
  }

  const userId = await resolveUserIdFromAuthorizationHeader(
    supabaseAdmin,
    request.headers.get('authorization')
  );
  const access = await getDeckAccessMetadata(String(parsedDeckId), userId, supabaseAdmin);
  if (!access || (!access.isPublic && !access.isOwner)) {
    return NextResponse.json({ message: 'Deck not found.' }, { status: 404 });
  }

  const payload: { deck_id: number; user_id?: string } = { deck_id: parsedDeckId };
  if (userId) {
    payload.user_id = userId;
  }

  const { error: insertError } = await supabaseAdmin.from('deck_view_events').insert(payload);

  if (insertError && insertError.code !== '23505') {
    console.error('Failed to insert deck view event', insertError);
    return NextResponse.json(
      { success: false, counted: false, message: 'Unable to record deck view.' },
      { status: 200 }
    );
  }

  const { data: statsRecord, error: statsError } = await supabaseAdmin
    .from('deck_stats')
    .select('views_total')
    .eq('deck_id', parsedDeckId)
    .maybeSingle();

  if (statsError) {
    console.error('Failed to fetch deck stats after recording view', statsError);
  }

  return NextResponse.json({
    success: true,
    counted: insertError?.code !== '23505',
    viewsTotal: Number(statsRecord?.views_total ?? 0),
  });
}
