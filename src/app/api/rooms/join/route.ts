import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';
import { createPlayerSetup } from '@/lib/multiplayer/match-setup';
import { loadOwnedRoomDeck } from '../room-decks';

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ message: 'Room service is not configured.' }, { status: 503 });
  }

  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { code?: unknown; deckId?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  const deckId = typeof body?.deckId === 'string' ? body.deckId.trim() : '';
  if (!/^[A-Z0-9]{6}$/.test(code) || !deckId) {
    return NextResponse.json({ message: 'Enter a valid six-character room code and choose a deck.' }, { status: 400 });
  }

  const guestDeck = await loadOwnedRoomDeck(admin, userId, deckId);
  if (!guestDeck) {
    return NextResponse.json({ message: 'Choose a starter deck or one of your saved decks with at least 50 cards.' }, { status: 400 });
  }

  const { data: room } = await admin
    .from('game_rooms')
    .select('id,host_user_id,guest_user_id,host_deck_id,status,expires_at')
    .eq('code', code)
    .maybeSingle();

  if (!room || room.status !== 'waiting' || new Date(room.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ message: 'That room is unavailable or has expired.' }, { status: 404 });
  }
  if (room.host_user_id === userId) {
    return NextResponse.json({ message: 'You already host this room.' }, { status: 409 });
  }

  const hostDeck = await loadOwnedRoomDeck(admin, room.host_user_id, room.host_deck_id);
  if (!hostDeck) {
    return NextResponse.json({ message: 'The host deck is no longer available.' }, { status: 409 });
  }

  const { data, error } = await admin
    .from('game_rooms')
    .update({ guest_user_id: userId, guest_deck_id: deckId, guest_last_seen_at: new Date().toISOString(), status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', room.id)
    .is('guest_user_id', null)
    .eq('status', 'waiting')
    .select('id,code,status,host_user_id,guest_user_id,host_deck_id,guest_deck_id,host_last_seen_at,guest_last_seen_at,expires_at')
    .maybeSingle();

  if (error) {
    console.error('Failed to join game room', error);
    return NextResponse.json({ message: 'Could not join the room.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ message: 'Someone else joined this room first.' }, { status: 409 });
  }


  const { error: matchError } = await admin.from('game_matches').insert({
    room_id: room.id,
    host_deck_snapshot: hostDeck,
    guest_deck_snapshot: guestDeck,
    host_setup: createPlayerSetup(hostDeck),
    guest_setup: createPlayerSetup(guestDeck),
  });
  if (matchError) {
    console.error('Failed to create game match', matchError);
    await admin.from('game_rooms').update({ guest_user_id: null, guest_deck_id: null, status: 'waiting' }).eq('id', room.id);
    return NextResponse.json({ message: 'Could not prepare the match.' }, { status: 500 });
  }

  return NextResponse.json({ room: data });
}
