import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Match history is not configured.' }, { status: 503 });
  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data: rooms, error } = await admin
    .from('game_rooms')
    .select('id,code,status,host_user_id,guest_user_id,created_at,updated_at')
    .or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`)
    .in('status', ['playing', 'finished'])
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ message: 'Could not load match history.' }, { status: 500 });

  const roomIds = (rooms ?? []).map((room) => room.id);
  const opponentIds = [...new Set((rooms ?? []).map((room) => room.host_user_id === userId ? room.guest_user_id : room.host_user_id).filter(Boolean))];
  const [{ data: matches }, { data: profiles }] = await Promise.all([
    roomIds.length ? admin.from('game_matches').select('id,room_id,status,game_state,created_at,updated_at').in('room_id', roomIds) : Promise.resolve({ data: [] }),
    opponentIds.length ? admin.from('profiles').select('id,username').in('id', opponentIds) : Promise.resolve({ data: [] }),
  ]);
  const matchesByRoom = new Map((matches ?? []).map((match) => [match.room_id, match]));
  const namesById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username?.trim() || null]));
  const history = (rooms ?? []).flatMap((room) => {
    const match = matchesByRoom.get(room.id);
    if (!match) return [];
    const isHost = room.host_user_id === userId;
    const opponentId = isHost ? room.guest_user_id : room.host_user_id;
    const winner = (match.game_state as { winner?: 'player' | 'opponent' | null } | null)?.winner ?? null;
    const won = winner ? (isHost ? winner === 'player' : winner === 'opponent') : null;
    return [{ id: match.id, code: room.code, status: match.status, opponentName: namesById.get(opponentId) ?? 'Opponent', result: won === null ? null : won ? 'win' : 'loss', createdAt: match.created_at, updatedAt: match.updated_at }];
  });
  return NextResponse.json({ matches: history });
}
