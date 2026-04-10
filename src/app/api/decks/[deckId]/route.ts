import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getDeckDetailById } from '@/lib/supabase/decks';

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

  const { data: accessRow, error: accessError } = await supabaseAdmin
    .from('decks')
    .select('id,user_id,is_public')
    .eq('id', normalizedDeckId)
    .maybeSingle();

  if (accessError) {
    console.error('Failed to load deck access metadata', accessError);
    return NextResponse.json({ message: 'Unable to load deck.' }, { status: 500 });
  }

  if (!accessRow) {
    return NextResponse.json({ message: 'Deck not found.' }, { status: 404 });
  }

  const userId = await resolveUserIdFromAuthorizationHeader(supabaseAdmin, request);
  const isOwner = Boolean(userId) && accessRow.user_id === userId;
  const isPublic = Boolean(accessRow.is_public);

  if (!isPublic && !isOwner) {
    return NextResponse.json({ message: 'Deck not found.' }, { status: 404 });
  }

  const deck = await getDeckDetailById(normalizedDeckId, supabaseAdmin);
  if (!deck) {
    return NextResponse.json({ message: 'Deck not found.' }, { status: 404 });
  }

  return NextResponse.json({ deck });
}
