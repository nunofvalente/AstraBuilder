import { afterEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();

vi.mock('./supabaseClient', () => ({
  supabase: { from },
}));

function profileRow(overrides = {}) {
  return {
    id: 'user-1',
    username: 'Player',
    bio: null,
    x_link: null,
    youtube_link: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockSelectMaybeSingle(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  from.mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

afterEach(() => {
  from.mockReset();
});

describe('profile helpers', () => {
  it('loads profiles by id and propagates errors', async () => {
    const { getProfileById } = await import('./profiles');
    const row = profileRow();
    const chain = mockSelectMaybeSingle({ data: row, error: null });

    await expect(getProfileById('user-1')).resolves.toEqual(row);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(chain.select).toHaveBeenCalledWith('id, username, bio, x_link, youtube_link, created_at');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');

    mockSelectMaybeSingle({ data: null, error: new Error('boom') });
    await expect(getProfileById('user-1')).rejects.toThrow('boom');
  });

  it('returns an existing profile when ensuring a profile', async () => {
    const { ensureProfileForUser } = await import('./profiles');
    const row = profileRow({ username: 'Existing' });
    mockSelectMaybeSingle({ data: row, error: null });

    await expect(ensureProfileForUser({ id: 'user-1' } as never)).resolves.toEqual(row);
  });

  it('creates a default profile from provider metadata', async () => {
    const { ensureProfileForUser, USERNAME_MAX_LENGTH } = await import('./profiles');
    mockSelectMaybeSingle({ data: null, error: null });

    const single = vi.fn().mockResolvedValue({ data: profileRow({ username: 'Ada Lovelace' }), error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    from.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) });
    from.mockReturnValueOnce({ upsert });

    const user = {
      id: 'abcdef-123456',
      email: 'ada@example.com',
      app_metadata: { provider: 'google' },
      user_metadata: { full_name: ' Ada   Lovelace ' },
    };

    await expect(ensureProfileForUser(user as never)).resolves.toMatchObject({ username: 'Ada Lovelace' });
    expect(upsert).toHaveBeenCalledWith({ id: 'abcdef-123456', username: 'Ada Lovelace' }, { onConflict: 'id' });
    expect(select).toHaveBeenCalledWith('id, username, bio, x_link, youtube_link, created_at');
    expect(USERNAME_MAX_LENGTH).toBe(30);
  });

  it('falls back to a generated username when no metadata is usable', async () => {
    const { ensureProfileForUser } = await import('./profiles');
    const single = vi.fn().mockResolvedValue({ data: profileRow({ username: 'Player-ABCDEF' }), error: null });
    const upsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    from.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) });
    from.mockReturnValueOnce({ upsert });

    await expect(ensureProfileForUser({ id: 'abcdef-123456', user_metadata: {}, app_metadata: {} } as never)).resolves.toMatchObject({
      username: 'Player-ABCDEF',
    });
    expect(upsert).toHaveBeenCalledWith({ id: 'abcdef-123456', username: 'Player-ABCDEF' }, { onConflict: 'id' });
  });
});
