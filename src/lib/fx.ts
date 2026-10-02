/**
 * Exchange rates.
 *
 * Source: open.er-api.com — free, no API key, ~160 currencies, updated daily.
 * Rates are cached in the `fx_rates` table so the trip doesn't depend on a
 * third-party API being up while you're abroad, and every expense also stores
 * the rate that was used, so history never changes retroactively.
 */
export type RateTable = { base: string; rates: Record<string, number>; fetchedAt: string };

export const RATES_ENDPOINT = (base: string) => `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;

/** Fetches /api/fx and returns "how many <base> is one <from>". */
export async function getRate(from: string, base: string): Promise<number | null> {
  if (from === base) return 1;
  try {
    const res = await fetch(`/api/fx?base=${encodeURIComponent(base)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const r = data.rates?.[from];
    return r && r > 0 ? r : null;
  } catch {
    return null;
  }
}
