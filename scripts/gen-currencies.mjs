// Regenerates src/lib/currencies.ts from the full active ISO 4217 list that
// Node's ICU data exposes (~162 codes), with Hebrew names, narrow symbols and
// the correct number of decimal places per currency (JPY and VND have none).
import fs from 'fs';

const codes = Intl.supportedValuesOf('currency').sort();
const he = new Intl.DisplayNames(['he'], { type: 'currency' });
const en = new Intl.DisplayNames(['en'], { type: 'currency' });

// Shown first in the picker: the shekel, then the currencies Israelis travel with most.
const POPULAR = ['ILS', 'EUR', 'USD', 'GBP', 'THB', 'JPY', 'TRY', 'GEL', 'CZK', 'HUF', 'AED', 'CHF', 'VND', 'INR'];

const symbol = (c) => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? c;
  } catch { return c; }
};
const digits = (c) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits; }
  catch { return 2; }
};

const rows = codes.map((c) => ({
  code: c,
  he: he.of(c) && he.of(c) !== c ? he.of(c) : (en.of(c) ?? c),
  symbol: symbol(c),
  digits: digits(c),
}));

const out = `// AUTO-GENERATED — do not edit by hand. See scripts/gen-currencies.mjs
// The complete active ISO 4217 list, so any destination's money can be entered as-is.
export type Currency = { code: string; he: string; symbol: string; digits: number };

export const POPULAR_CURRENCIES = ${JSON.stringify(POPULAR)};

export const CURRENCIES: Currency[] = [
${rows.map((r) => `  { code: '${r.code}', he: ${JSON.stringify(r.he)}, symbol: ${JSON.stringify(r.symbol)}, digits: ${r.digits} },`).join('\n')}
];

export const CURRENCY_BY_CODE: Record<string, Currency> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
);

/** Travel currencies first, then the rest alphabetically by Hebrew name. */
export function orderedCurrencies(): Currency[] {
  const pop = POPULAR_CURRENCIES.map((c) => CURRENCY_BY_CODE[c]).filter(Boolean);
  const rest = CURRENCIES.filter((c) => !POPULAR_CURRENCIES.includes(c.code))
    .sort((a, b) => a.he.localeCompare(b.he, 'he'));
  return [...pop, ...rest];
}

/** Matches on code, Hebrew name or symbol. */
export function searchCurrencies(q: string): Currency[] {
  const s = q.trim().toLowerCase();
  if (!s) return orderedCurrencies();
  return orderedCurrencies().filter(
    (c) => c.code.toLowerCase().includes(s) || c.he.includes(s) || c.symbol.toLowerCase() === s
  );
}

export function currencySymbol(code: string): string {
  return CURRENCY_BY_CODE[code]?.symbol ?? code;
}

/** Decimal places for a currency — 0 for the yen, dong, won and friends. */
export function currencyDigits(code: string): number {
  return CURRENCY_BY_CODE[code]?.digits ?? 2;
}
`;

fs.writeFileSync('src/lib/currencies.ts', out);
console.log('currencies written:', rows.length);
console.log('zero-decimal:', rows.filter((r) => r.digits === 0).map((r) => r.code).join(' '));
