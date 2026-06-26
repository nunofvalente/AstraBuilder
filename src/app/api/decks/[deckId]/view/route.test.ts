import { afterEach, describe, expect, it, vi } from 'vitest';

const createSupabaseAdminClient = vi.fn();
const resolveUserIdFromAuthorizationHeader = vi.fn();
const getDeckAccessMetadata = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient,
  resolveUserIdFromAuthorizationHeader,
}));

vi.mock('@/lib/supabase/decks', () => ({
  getDeckAccessMetadata,
}));

function request(token = 'Bearer token') {
  return new Request('https://app.test/api/decks/1/view', {
    method: 'POST',
    headers: token ? { authorization: token } : {},
  });
}

afterEach(() => {
  createSupabaseAdminClient.mockReset();
  resolveUserIdFromAuthorizationHeader.mockReset();
  getDeckAccessMetadata.mockReset();
});

describe('deck view route', () => {
  it('validates configuration and deck id', async () => {
    const { POST } = await import('./route');
    createSupabaseAdminClient.mockReturnValue(null);

    expect((await POST(request() as never, { params: Promise.resolve({ deckId: '1' }) })).status).toBe(500);

    createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    expect((await POST(request() as never, { params: Promise.resolve({ deckId: 'bad' }) })).status).toBe(400);
  });

  it('returns 404 when the deck is not accessible', async () => {
    const { POST } = await import('./route');
    const admin = { from: vi.fn() };
    createSupabaseAdminClient.mockReturnValue(admin);
    resolveUserIdFromAuthorizationHeader.mockResolvedValue('viewer-1');
    getDeckAccessMetadata.mockResolvedValue({ isPublic: false, isOwner: false });

    expect((await POST(request() as never, { params: Promise.resolve({ deckId: '1' }) })).status).toBe(404);
  });

  it('records accessible deck views and returns stats', async () => {
    const { POST } = await import('./route');
    const insert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { views_total: 12 }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const admin = {
      from: vi.fn((table: string) => (table === 'deck_view_events' ? { insert } : { select })),
    };
    createSupabaseAdminClient.mockReturnValue(admin);
    resolveUserIdFromAuthorizationHeader.mockResolvedValue('viewer-1');
    getDeckAccessMetadata.mockResolvedValue({ isPublic: true, isOwner: false });

    const response = await POST(request() as never, { params: Promise.resolve({ deckId: '1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, counted: true, viewsTotal: 12 });
    expect(insert).toHaveBeenCalledWith({ deck_id: 1, user_id: 'viewer-1' });
  });

  it('treats duplicate view inserts as successful but not counted', async () => {
    const { POST } = await import('./route');
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505' } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { views_total: 12 }, error: null });
    const admin = {
      from: vi.fn((table: string) =>
        table === 'deck_view_events'
          ? { insert }
          : { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) },
      ),
    };
    createSupabaseAdminClient.mockReturnValue(admin);
    resolveUserIdFromAuthorizationHeader.mockResolvedValue(null);
    getDeckAccessMetadata.mockResolvedValue({ isPublic: true, isOwner: false });

    const response = await POST(request('') as never, { params: Promise.resolve({ deckId: '1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, counted: false, viewsTotal: 12 });
    expect(insert).toHaveBeenCalledWith({ deck_id: 1 });
  });
});
