import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. SERVER ONLY — bypasses RLS.
 * Never import this from a file that runs in the browser.
 */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Verifies a user access token coming from the browser and returns the user id. */
export async function userFromToken(authHeader: string | null): Promise<string | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
