import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';

import { createPlayerSetup, type MatchDeckSnapshot } from '@/lib/multiplayer/match-setup';
import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Rematches are not configured.' }, { status: 503 });
  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const code = (await params).code.toUpperCase();
  const { data: room } = await admin.from('game_rooms').select('id,host_user_id,guest_user_id,status,rematch_room_id').eq('code', code).maybeSingle();
  if (!room || (room.host_user_id !== userId && room.guest_user_id !== userId) || room.status !== 'finished') return NextResponse.json({ message: 'Rematch is unavailable.' }, { status: 404 });
  if (room.rematch_room_id) {
    const { data: nextRoom } = await admin.from('game_rooms').select('code').eq('id', room.rematch_room_id).maybeSingle();
    return NextResponse.json({ ready: Boolean(nextRoom), code: nextRoom?.code, requestedByYou: true, requestedByOpponent: true });
  }
  const { data: match } = await admin.from('game_matches').select('id').eq('room_id', room.id).maybeSingle();
  if (!match) return NextResponse.json({ message: 'Match not found.' }, { status: 404 });
  const { data: requests } = await admin.from('game_rematch_requests').select('user_id').eq('match_id', match.id);
  const requestedUserIds = new Set((requests ?? []).map((entry) => entry.user_id));
  const opponentId = room.host_user_id === userId ? room.guest_user_id : room.host_user_id;
  return NextResponse.json({
    ready: false,
    requestedByYou: requestedUserIds.has(userId),
    requestedByOpponent: Boolean(opponentId && requestedUserIds.has(opponentId)),
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Rematches are not configured.' }, { status: 503 });
  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const code = (await params).code.toUpperCase();
  const { data: room } = await admin.from('game_rooms').select('id,host_user_id,guest_user_id,status,rematch_room_id').eq('code', code).maybeSingle();
  if (!room || (room.host_user_id !== userId && room.guest_user_id !== userId) || room.status !== 'finished') return NextResponse.json({ message: 'Rematch is unavailable.' }, { status: 404 });
  if (room.rematch_room_id) return NextResponse.json({ message: 'The rematch has already started.' }, { status: 409 });
  const { data: match } = await admin.from('game_matches').select('id').eq('room_id', room.id).maybeSingle();
  if (!match) return NextResponse.json({ message: 'Match not found.' }, { status: 404 });
  const { error } = await admin.from('game_rematch_requests').delete().eq('match_id', match.id);
  if (error) return NextResponse.json({ message: 'Could not decline the rematch.' }, { status: 500 });
  return NextResponse.json({ declined: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Rematches are not configured.' }, { status: 503 });
  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const code = (await params).code.toUpperCase();
  const { data: room } = await admin.from('game_rooms').select('id,host_user_id,guest_user_id,host_deck_id,guest_deck_id,status,rematch_room_id').eq('code', code).maybeSingle();
  if (!room || (room.host_user_id !== userId && room.guest_user_id !== userId) || room.status !== 'finished') return NextResponse.json({ message: 'Rematch is unavailable.' }, { status: 404 });
  if (room.rematch_room_id) {
    const { data: nextRoom } = await admin.from('game_rooms').select('code').eq('id', room.rematch_room_id).maybeSingle();
    return NextResponse.json({ ready: true, code: nextRoom?.code });
  }
  const { data: match } = await admin.from('game_matches').select('id,host_deck_snapshot,guest_deck_snapshot').eq('room_id', room.id).maybeSingle();
  if (!match) return NextResponse.json({ message: 'Match not found.' }, { status: 404 });
  await admin.from('game_rematch_requests').upsert({ match_id: match.id, user_id: userId });
  const { count } = await admin.from('game_rematch_requests').select('*', { count: 'exact', head: true }).eq('match_id', match.id);
  if ((count ?? 0) < 2) return NextResponse.json({ ready: false });

  const { error: claimError } = await admin.from('game_rematch_runs').insert({ match_id: match.id, creator_user_id: userId });
  if (claimError?.code === '23505') {
    const { data: run } = await admin.from('game_rematch_runs').select('room_id').eq('match_id', match.id).maybeSingle();
    if (!run?.room_id) return NextResponse.json({ ready: false });
    const { data: nextRoom } = await admin.from('game_rooms').select('code').eq('id', run.room_id).maybeSingle();
    return NextResponse.json({ ready: Boolean(nextRoom), code: nextRoom?.code });
  }
  if (claimError) return NextResponse.json({ message: 'Could not coordinate rematch.' }, { status: 500 });

  const hostDeck = match.host_deck_snapshot as MatchDeckSnapshot;
  const guestDeck = match.guest_deck_snapshot as MatchDeckSnapshot;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: nextRoom, error } = await admin.from('game_rooms').insert({ code: roomCode(), host_user_id: room.host_user_id, guest_user_id: room.guest_user_id, host_deck_id: room.host_deck_id, guest_deck_id: room.guest_deck_id, status: 'ready', guest_last_seen_at: new Date().toISOString() }).select('id,code').single();
    if (error?.code === '23505') continue;
    if (error || !nextRoom) {
      await admin.from('game_rematch_runs').delete().eq('match_id', match.id);
      return NextResponse.json({ message: 'Could not create rematch.' }, { status: 500 });
    }
    const { error: matchError } = await admin.from('game_matches').insert({ room_id: nextRoom.id, host_deck_snapshot: hostDeck, guest_deck_snapshot: guestDeck, host_setup: createPlayerSetup(hostDeck), guest_setup: createPlayerSetup(guestDeck) });
    if (matchError) {
      await admin.from('game_rooms').delete().eq('id', nextRoom.id);
      await admin.from('game_rematch_runs').delete().eq('match_id', match.id);
      return NextResponse.json({ message: 'Could not prepare rematch.' }, { status: 500 });
    }
    await admin.from('game_rematch_runs').update({ room_id: nextRoom.id }).eq('match_id', match.id);
    await admin.from('game_rooms').update({ rematch_room_id: nextRoom.id }).eq('id', room.id).is('rematch_room_id', null);
    return NextResponse.json({ ready: true, code: nextRoom.code });
  }
  await admin.from('game_rematch_runs').delete().eq('match_id', match.id);
  return NextResponse.json({ message: 'Could not allocate a rematch code.' }, { status: 503 });
}
