import { randomInt } from 'node:crypto';

import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';
import { loadOwnedRoomDeck } from './room-decks';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createRoomCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ message: 'Room service is not configured.' }, { status: 503 });
  }

  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { deckId?: unknown } | null;
  const deckId = typeof body?.deckId === 'string' ? body.deckId.trim() : '';
  if (!deckId) {
    return NextResponse.json({ message: 'Choose a deck first.' }, { status: 400 });
  }

  const deck = await loadOwnedRoomDeck(admin, userId, deckId);
  if (!deck) {
    return NextResponse.json({ message: 'Choose a starter deck or one of your saved decks with at least 50 cards.' }, { status: 400 });
  }

  await admin.from('game_rooms').delete().eq('status', 'waiting').lt('expires_at', new Date().toISOString());

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const { data, error } = await admin
      .from('game_rooms')
      .insert({ code, host_user_id: userId, host_deck_id: deckId })
      .select('id,code,status,host_user_id,guest_user_id,host_deck_id,guest_deck_id,host_last_seen_at,guest_last_seen_at,expires_at')
      .single();

    if (!error && data) {
      return NextResponse.json({ room: data }, { status: 201 });
    }
    if (error?.code !== '23505') {
      console.error('Failed to create game room', error);
      return NextResponse.json({ message: 'Could not create the room.' }, { status: 500 });
    }
  }

  return NextResponse.json({ message: 'Could not allocate a room code.' }, { status: 503 });
}
