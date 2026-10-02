import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Supabase pauses a free project after 7 days without a database request.
 * Vercel Cron hits this once a day (see vercel.json) so the project never sleeps.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { count, error } = await supabaseAdmin()
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profiles: count, at: new Date().toISOString() });
}
