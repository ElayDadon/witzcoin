import { CURRENCY_BY_CODE, currencyDigits } from './currencies';

/**
 * 1234.5, 'ILS' -> "1,234.50 ₪";  1234, 'VND' -> "1,234 ₫"
 *
 * Decimal places follow the currency: the dong, yen, won and the rest of the
 * zero-decimal currencies never show agorot. The he-IL formatter also injects
 * RLM marks around the symbol, which fight with the `direction: ltr` we put on
 * every number, so we strip them and let CSS isolation do the work.
 */
export function money(amount: number, currency: string): string {
  return fmt(amount, currency, currencyDigits(currency));
}

/** Same, rounded to whole units — for dense secondary lines. */
export function moneyRound(amount: number, currency: string): string {
  return fmt(amount, currency, 0);
}

function fmt(amount: number, currency: string, digits: number): string {
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
      .format(amount)
      .replace(/[\u200e\u200f]/g, '')
      .trim();
  } catch {
    // An unknown code still has to render something sensible.
    return `${amount.toFixed(digits)} ${currency}`;
  }
}

/**
 * Exact where it fits, compact where it doesn't. Dense summary lines have to
 * survive both "4,189 ₪" and "31,743,916 ₫" without wrapping.
 */
export function moneyCompact(amount: number, currency: string): string {
  const exact = moneyRound(amount, currency);
  return exact.length > 11 ? moneyShort(amount, currency) : exact;
}

/** Compact form for chart ticks: ₪12.4K */
export function moneyShort(amount: number, currency: string): string {
  const sym = CURRENCY_BY_CODE[currency]?.symbol ?? currency;
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sym}${(amount / 1000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${sym}${amount.toFixed(0)}`;
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'היום';
  if (same(d, yest)) return 'אתמול';
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(d);
}

export function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'ללא תאריכים';
  const f = (s: string) => new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(new Date(s));
  if (start && end) return `${f(start)} – ${f(end)}`;
  return f((start || end)!);
}

/** Days between today and the trip start/end, for the countdown pill. */
export function tripStatus(start: string | null, end: string | null): { label: string; tone: 'soon' | 'live' | 'done' | 'none' } {
  if (!start && !end) return { label: '', tone: 'none' };
  const now = Date.now();
  const s = start ? new Date(start).getTime() : null;
  const e = end ? new Date(end).getTime() + 864e5 : null;
  if (s && now < s) {
    const d = Math.ceil((s - now) / 864e5);
    return { label: d === 0 ? 'מתחיל היום' : `עוד ${d} ימים`, tone: 'soon' };
  }
  if (e && now > e) return { label: 'הסתיים', tone: 'done' };
  return { label: 'בטיול עכשיו', tone: 'live' };
}
