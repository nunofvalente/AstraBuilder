import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';
import { buildMultiplayerSetupState } from '@/lib/multiplayer/board-state';
import type { MatchDeckSnapshot, PlayerSetupState } from '@/lib/multiplayer/match-setup';
import { addLogEntry, type GameState } from '@/app/[locale]/play/game-rules';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Room service is not configured.' }, { status: 503 });
  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const code = (await params).code.toUpperCase();
  const { data: room } = await admin.from('game_rooms').select('id,host_user_id,guest_user_id,status,host_last_seen_at,guest_last_seen_at').eq('code', code).maybeSingle();
  if (!room || (room.host_user_id !== userId && room.guest_user_id !== userId)) return NextResponse.json({ message: 'Room not found.' }, { status: 404 });
  if (!['waiting', 'ready', 'playing'].includes(room.status)) return NextResponse.json({ success: true });
  const column = room.host_user_id === userId ? 'host_last_seen_at' : 'guest_last_seen_at';
  await admin.from('game_rooms').update({ [column]: new Date().toISOString() }).eq('id', room.id);
  if (room.status === 'ready' || room.status === 'playing') {
    const opponentLastSeen = room.host_user_id === userId ? room.guest_last_seen_at : room.host_last_seen_at;
    if (opponentLastSeen && Date.now() - new Date(opponentLastSeen).getTime() > 60_000) {
      const { data: match } = await admin.from('game_matches').select('id,revision,status,game_state,host_deck_snapshot,guest_deck_snapshot,host_setup,guest_setup').eq('room_id', room.id).maybeSingle();
      if (match && (match.status === 'setup' || match.status === 'playing')) {
        const winner = room.host_user_id === userId ? 'player' : 'opponent';
        const gameState = (match.game_state ?? buildMultiplayerSetupState(
          match.host_deck_snapshot as MatchDeckSnapshot,
          match.guest_deck_snapshot as MatchDeckSnapshot,
          match.host_setup as PlayerSetupState,
          match.guest_setup as PlayerSetupState
        )) as GameState;
        const finishedState = addLogEntry({ ...gameState, winner }, { suffix: 'Opponent did not reconnect before the grace period expired.' });
        await admin.from('game_matches').update({ game_state: finishedState, status: 'finished', revision: match.revision + 1, updated_at: new Date().toISOString() }).eq('id', match.id).eq('revision', match.revision);
        await admin.from('game_rooms').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', room.id).in('status', ['ready', 'playing']);
      }
    }
  }
  return NextResponse.json({ success: true });
}
