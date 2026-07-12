import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSupabaseAdminClient = vi.fn();
const resolveUserIdFromAuthorizationHeader = vi.fn();
const loadOwnedRoomDeck = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient,
  resolveUserIdFromAuthorizationHeader,
}));

vi.mock('../room-decks', () => ({ loadOwnedRoomDeck }));

function request(body: unknown) {
  return new Request('https://app.test/api/rooms/join', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('join room route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveUserIdFromAuthorizationHeader.mockResolvedValue('guest-1');
    loadOwnedRoomDeck.mockResolvedValue({ id: 'deck-1', title: 'Deck', entries: [] });
  });

  it('validates authentication and room codes', async () => {
    createSupabaseAdminClient.mockReturnValue({});
    resolveUserIdFromAuthorizationHeader.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(request({ code: 'ABC123', deckId: 'deck-1' }))).status).toBe(401);

    resolveUserIdFromAuthorizationHeader.mockResolvedValue('guest-1');
    expect((await POST(request({ code: 'short', deckId: 'deck-1' }))).status).toBe(400);
  });

  it('claims an available room and marks it ready', async () => {
    const room = { id: 'room-1', host_user_id: 'host-1', guest_user_id: null, host_deck_id: 'host-deck', status: 'waiting', expires_at: '2099-01-01' };
    const joinedRoom = { ...room, code: 'ABC123', guest_user_id: 'guest-1', guest_deck_id: 'deck-1', status: 'ready' };
    const lookupMaybeSingle = vi.fn().mockResolvedValue({ data: room });
    const updateMaybeSingle = vi.fn().mockResolvedValue({ data: joinedRoom, error: null });
    const updateChain = {
      eq: vi.fn(), is: vi.fn(), select: vi.fn().mockReturnValue({ maybeSingle: updateMaybeSingle }),
    };
    updateChain.eq.mockReturnValue(updateChain);
    updateChain.is.mockReturnValue(updateChain);
    const roomTable = {
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: lookupMaybeSingle }) }),
      update: vi.fn().mockReturnValue(updateChain),
    };
    const matchInsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((name: string) => name === 'game_matches' ? { insert: matchInsert } : roomTable);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { POST } = await import('./route');

    const response = await POST(request({ code: 'abc123', deckId: 'deck-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room: joinedRoom });
    expect(roomTable.update).toHaveBeenCalledWith(expect.objectContaining({ guest_user_id: 'guest-1', status: 'ready' }));
    expect(matchInsert).toHaveBeenCalledWith(expect.objectContaining({ room_id: 'room-1' }));
  });

  it('rejects expired and already claimed rooms', async () => {
    const lookup = vi.fn().mockResolvedValue({ data: { id: 'room-1', host_user_id: 'host-1', status: 'waiting', expires_at: '2000-01-01' } });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: lookup }) }) }),
    });
    const { POST } = await import('./route');
    expect((await POST(request({ code: 'ABC123', deckId: 'deck-1' }))).status).toBe(404);
  });
});
