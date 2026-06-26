import { afterEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function importAdminHelpers() {
  vi.resetModules();
  return import('./admin');
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  createClient.mockReset();
});

describe('Supabase admin helpers', () => {
  it('returns null when admin credentials are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { createSupabaseAdminClient } = await importAdminHelpers();

    expect(createSupabaseAdminClient()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('creates a non-persistent admin client when credentials exist', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    createClient.mockReturnValue({ from: vi.fn() });

    const { createSupabaseAdminClient } = await importAdminHelpers();

    expect(createSupabaseAdminClient()).toEqual({ from: expect.any(Function) });
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'service-role', {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  });

  it('resolves user ids from bearer tokens', async () => {
    const { resolveUserIdFromAuthorizationHeader } = await importAdminHelpers();
    const supabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
    };

    await expect(resolveUserIdFromAuthorizationHeader(supabaseAdmin as never, 'Bearer token-1')).resolves.toBe('user-1');
    expect(supabaseAdmin.auth.getUser).toHaveBeenCalledWith('token-1');
  });

  it('returns null for missing, invalid, or rejected authorization', async () => {
    const { resolveUserIdFromAuthorizationHeader } = await importAdminHelpers();
    const supabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: null, error: new Error('invalid') }),
      },
    };

    await expect(resolveUserIdFromAuthorizationHeader(null, 'Bearer token')).resolves.toBeNull();
    await expect(resolveUserIdFromAuthorizationHeader(supabaseAdmin as never, null)).resolves.toBeNull();
    await expect(resolveUserIdFromAuthorizationHeader(supabaseAdmin as never, 'Basic token')).resolves.toBeNull();
    await expect(resolveUserIdFromAuthorizationHeader(supabaseAdmin as never, 'Bearer   ')).resolves.toBeNull();
    await expect(resolveUserIdFromAuthorizationHeader(supabaseAdmin as never, 'Bearer token')).resolves.toBeNull();
  });
});
