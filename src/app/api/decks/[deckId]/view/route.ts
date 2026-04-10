import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createSupabaseAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function resolveUserIdFromAuthorizationHeader(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  request: NextRequest
): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authorization.slice('Bearer '.length).trim();
  if (!accessToken || !supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    return null;
  }

  return data.user.id;
}

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

  const userId = await resolveUserIdFromAuthorizationHeader(supabaseAdmin, request);
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
