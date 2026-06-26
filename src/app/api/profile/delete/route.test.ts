import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let consoleError: ReturnType<typeof vi.spyOn>;

async function importRoute() {
  vi.resetModules();
  return import('./route');
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  createClient.mockReset();
  consoleError.mockRestore();
});

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

function deleteRequest(token = 'Bearer token') {
  return new Request('https://app.test/api/profile/delete', {
    method: 'DELETE',
    headers: token ? { authorization: token } : {},
  });
}

describe('profile delete route', () => {
  it('requires admin configuration and bearer auth', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let { DELETE } = await importRoute();
    expect((await DELETE(deleteRequest())).status).toBe(500);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    ({ DELETE } = await importRoute());
    expect((await DELETE(deleteRequest(''))).status).toBe(401);
    expect((await DELETE(deleteRequest('Bearer   '))).status).toBe(401);
  });

  it('deletes the profile and auth user for valid requests', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    const eq = vi.fn().mockResolvedValue({ error: null });
    const supabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq }) }),
    };
    createClient.mockReturnValue(supabaseAdmin);
    const { DELETE } = await importRoute();

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(supabaseAdmin.auth.getUser).toHaveBeenCalledWith('token');
    expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('returns unauthorized or server errors for failed Supabase operations', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: null, error: new Error('invalid') }),
        admin: { deleteUser: vi.fn() },
      },
      from: vi.fn(),
    });
    let { DELETE } = await importRoute();
    expect((await DELETE(deleteRequest())).status).toBe(401);

    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        admin: { deleteUser: vi.fn().mockResolvedValue({ error: new Error('delete failed') }) },
      },
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
    });
    ({ DELETE } = await importRoute());
    expect((await DELETE(deleteRequest())).status).toBe(500);
  });
});
