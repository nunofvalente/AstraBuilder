import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Match history is not configured.' }, { status: 503 });
  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const matchId = (await params).matchId.trim();
  if (!matchId) return NextResponse.json({ message: 'Invalid match id.' }, { status: 400 });

  const { data: match } = await admin
    .from('game_matches')
    .select('id,room_id,status,revision,first_player,host_deck_snapshot,guest_deck_snapshot,game_state,created_at,updated_at')
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return NextResponse.json({ message: 'Match not found.' }, { status: 404 });
  const { data: room } = await admin.from('game_rooms').select('code,host_user_id,guest_user_id').eq('id', match.room_id).maybeSingle();
  if (!room || (room.host_user_id !== userId && room.guest_user_id !== userId)) return NextResponse.json({ message: 'Match not found.' }, { status: 404 });

  const { data: actions, error } = await admin
    .from('game_match_actions')
    .select('revision,actor_user_id,action,created_at')
    .eq('match_id', match.id)
    .order('revision', { ascending: true });
  if (error) return NextResponse.json({ message: 'Could not load match actions.' }, { status: 500 });
  const isHost = room.host_user_id === userId;
  const winner = (match.game_state as { winner?: 'player' | 'opponent' | null } | null)?.winner ?? null;
  return NextResponse.json({
    match: {
      id: match.id,
      code: room.code,
      status: match.status,
      revision: match.revision,
      firstPlayer: match.first_player,
      yourDeckTitle: (isHost ? match.host_deck_snapshot : match.guest_deck_snapshot as { title?: string | null })?.title ?? null,
      opponentDeckTitle: (isHost ? match.guest_deck_snapshot : match.host_deck_snapshot as { title?: string | null })?.title ?? null,
      result: winner ? ((isHost && winner === 'player') || (!isHost && winner === 'opponent') ? 'win' : 'loss') : null,
      createdAt: match.created_at,
      updatedAt: match.updated_at,
      actions: (actions ?? []).map((entry) => ({ revision: entry.revision, actor: entry.actor_user_id === userId ? 'you' : 'opponent', action: entry.action, createdAt: entry.created_at })),
    },
  });
}
