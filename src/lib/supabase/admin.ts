import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createSupabaseAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function resolveUserIdFromAuthorizationHeader(
  supabaseAdmin: SupabaseClient | null,
  authorizationHeader: string | null
): Promise<string | null> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authorizationHeader.slice('Bearer '.length).trim();
  if (!accessToken || !supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    return null;
  }

  return data.user.id;
}
