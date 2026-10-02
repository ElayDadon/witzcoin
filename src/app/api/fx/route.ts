import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { RATES_ENDPOINT } from '@/lib/fx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AGE_HOURS = 12;

/**
 * GET /api/fx?base=ILS
 * Returns { base, rates } where rates[X] = how many `base` units one X is worth.
 * Cached in Postgres so we survive the upstream API being down mid-trip.
 */
export async function GET(req: Request) {
  const base = (new URL(req.url).searchParams.get('base') || 'ILS').toUpperCase().slice(0, 3);
  const db = supabaseAdmin();

  const { data: cached } = await db.from('fx_rates').select('rates, fetched_at').eq('base', base).maybeSingle();
  const fresh =
    cached && Date.now() - new Date(cached.fetched_at).getTime() < MAX_AGE_HOURS * 3600_000;
  if (fresh) return NextResponse.json({ base, rates: cached!.rates, cached: true });

  try {
    const res = await fetch(RATES_ENDPOINT(base), { cache: 'no-store' });
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result !== 'success' || !json.rates) throw new Error('bad upstream response');

    // Upstream gives "1 base = N foreign". We want "1 foreign = N base".
    const inverted: Record<string, number> = {};
    for (const [code, rate] of Object.entries(json.rates)) {
      if (rate > 0) inverted[code] = 1 / rate;
    }
    inverted[base] = 1;

    await db.from('fx_rates').upsert({ base, rates: inverted, fetched_at: new Date().toISOString() });
    return NextResponse.json({ base, rates: inverted, cached: false });
  } catch {
    if (cached) return NextResponse.json({ base, rates: cached.rates, cached: true, stale: true });
    return NextResponse.json({ error: 'rates-unavailable' }, { status: 503 });
  }
}
