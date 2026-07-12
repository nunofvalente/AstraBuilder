import { NextResponse } from 'next/server';

import { createSupabaseAdminClient, resolveUserIdFromAuthorizationHeader } from '@/lib/supabase/admin';

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ message: 'Room service is not configured.' }, { status: 503 });
  }

  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ message: 'Invalid room code.' }, { status: 400 });
  }

  const { data: room, error } = await admin
    .from('game_rooms')
    .select('id,code,status,host_user_id,guest_user_id,host_last_seen_at,guest_last_seen_at,expires_at')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    console.error('Failed to load game room', error);
    return NextResponse.json({ message: 'Could not load the room.' }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ message: 'Room not found.' }, { status: 404 });
  }

  const isParticipant = room.host_user_id === userId || room.guest_user_id === userId;
  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      host_last_seen_at: room.host_last_seen_at,
      guest_last_seen_at: room.guest_last_seen_at,
      expires_at: room.expires_at,
    },
    isParticipant,
    role: room.host_user_id === userId ? 'host' : room.guest_user_id === userId ? 'guest' : 'spectator',
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ message: 'Room service is not configured.' }, { status: 503 });

  const userId = await resolveUserIdFromAuthorizationHeader(admin, request.headers.get('authorization'));
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return NextResponse.json({ message: 'Invalid room code.' }, { status: 400 });

  const { data, error } = await admin
    .from('game_rooms')
    .update({ status: 'finished', updated_at: new Date().toISOString() })
    .eq('code', code)
    .eq('host_user_id', userId)
    .in('status', ['waiting', 'ready'])
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Failed to cancel game room', error);
    return NextResponse.json({ message: 'Could not cancel the room.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ message: 'Only the host can cancel an open room.' }, { status: 403 });
  return NextResponse.json({ success: true });
}
