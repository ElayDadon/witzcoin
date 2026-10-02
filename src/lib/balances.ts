import type { Expense, Settlement } from './types';

export type Balance = {
  userId: string;
  paid: number;    // total this person put on the table
  owed: number;    // total this person consumed (their share of everything)
  sentSettle: number;
  gotSettle: number;
  net: number;     // > 0 -> the group owes them, < 0 -> they owe the group
};

export type Debt = { from: string; to: string; amount: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Net position of every member, in the trip's base currency.
 *
 *   net = (what you paid) - (your share of the spending)
 *       + (settlements you handed over) - (settlements you received)
 */
export function computeBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[]
): Balance[] {
  const b = new Map<string, Balance>(
    memberIds.map((id) => [
      id,
      { userId: id, paid: 0, owed: 0, sentSettle: 0, gotSettle: 0, net: 0 },
    ])
  );
  const touch = (id: string) => {
    if (!b.has(id)) b.set(id, { userId: id, paid: 0, owed: 0, sentSettle: 0, gotSettle: 0, net: 0 });
    return b.get(id)!;
  };

  for (const e of expenses) {
    touch(e.payer_id).paid += Number(e.amount_base) || 0;
    for (const s of e.expense_shares ?? []) {
      touch(s.user_id).owed += Number(s.amount_base) || 0;
    }
  }
  for (const s of settlements) {
    touch(s.from_user).sentSettle += Number(s.amount_base) || 0;
    touch(s.to_user).gotSettle += Number(s.amount_base) || 0;
  }

  return [...b.values()].map((x) => ({
    ...x,
    paid: round2(x.paid),
    owed: round2(x.owed),
    net: round2(x.paid - x.owed + x.sentSettle - x.gotSettle),
  }));
}

/**
 * Turns the net positions into the smallest practical set of payments
 * ("simplify debts", same idea as Splitwise): repeatedly match the biggest
 * debtor with the biggest creditor. With n members this yields at most n-1
 * transfers instead of up to n*(n-1)/2.
 */
export function simplifyDebts(balances: Balance[], epsilon = 0.01): Debt[] {
  const creditors = balances.filter((b) => b.net > epsilon).map((b) => ({ id: b.userId, amt: b.net }));
  const debtors = balances.filter((b) => b.net < -epsilon).map((b) => ({ id: b.userId, amt: -b.net }));
  creditors.sort((a, z) => z.amt - a.amt);
  debtors.sort((a, z) => z.amt - a.amt);

  const out: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > epsilon) out.push({ from: debtors[i].id, to: creditors[j].id, amount: round2(pay) });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt <= epsilon) i++;
    if (creditors[j].amt <= epsilon) j++;
  }
  return out;
}

/**
 * Distributes `total` across people in proportion to their weights, in the
 * currency's smallest unit — agorot for the shekel, whole dong for Vietnam,
 * which has no sub-unit. Uses largest-remainder rounding, so the parts always
 * add back up to the total exactly and the odd agora goes to whoever was
 * rounded down hardest rather than always to the same person.
 */
export function allocate(total: number, weights: Record<string, number>, digits = 2): Record<string, number> {
  const ids = Object.keys(weights);
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;

  const scale = 10 ** digits;
  const units = Math.round(total * scale);
  const sum = ids.reduce((a, id) => a + Math.max(weights[id], 0), 0);

  // No usable weights: fall back to an even split so nobody gets zero by accident.
  if (sum <= 0) {
    const each = Math.floor(units / ids.length);
    let left = units - each * ids.length;
    ids.forEach((id, i) => { out[id] = (each + (i < left ? 1 : 0)) / scale; });
    return out;
  }

  const exact = ids.map((id) => ({ id, raw: (units * Math.max(weights[id], 0)) / sum }));
  let assigned = 0;
  for (const e of exact) {
    const floor = Math.floor(e.raw);
    out[e.id] = floor;
    assigned += floor;
  }
  // Hand the leftover units to the biggest fractional parts.
  const order = [...exact].sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)));
  for (let i = 0; i < units - assigned; i++) out[order[i % order.length].id] += 1;

  for (const id of ids) out[id] = out[id] / scale;
  return out;
}

/** An even split is just an allocation where everyone carries the same weight. */
export function splitEvenly(totalBase: number, userIds: string[], digits = 2): Record<string, number> {
  return allocate(totalBase, Object.fromEntries(userIds.map((id) => [id, 1])), digits);
}

/**
 * Works out everyone's share while the person is still typing.
 *
 * `entered` holds only the rows that were actually touched. Everyone else splits
 * whatever is left over, which is what makes the last row complete itself: type
 * 50 and 20 and the third row fills in 30 on its own.
 *
 * In 'percent' mode the entered values are percentages; in 'exact' mode they are
 * amounts in the settlement currency. Typed values are never rescaled behind the
 * person's back — if the numbers don't add up, `gap` says by how much.
 */
export function resolveSplit(args: {
  mode: 'equal' | 'percent' | 'exact';
  participants: string[];
  entered: Record<string, number>;
  total: number;
  digits?: number;
}): { amounts: Record<string, number>; percents: Record<string, number>; gap: number; complete: boolean } {
  const { mode, participants, entered, total, digits = 2 } = args;
  const step = 1 / 10 ** digits;
  const tidy = (n: number) => Math.round(n / step) * step;

  if (mode === 'equal' || participants.length === 0) {
    const amounts = splitEvenly(total, participants, digits);
    return { amounts, percents: toPercents(amounts, total), gap: 0, complete: true };
  }

  const touched = participants.filter((id) => typeof entered[id] === 'number' && !Number.isNaN(entered[id]));
  const open = participants.filter((id) => !touched.includes(id));
  const whole = mode === 'percent' ? 100 : total;
  const used = touched.reduce((a, id) => a + entered[id], 0);
  const leftover = whole - used;

  // While any row is still untouched, those rows soak up the remainder exactly,
  // so there is never a gap to report.
  if (open.length > 0) {
    const weights: Record<string, number> = {};
    for (const id of touched) weights[id] = entered[id];
    for (const id of open) weights[id] = Math.max(leftover, 0) / open.length;

    const amounts = mode === 'percent'
      ? allocate(total, weights, digits)
      : { ...Object.fromEntries(touched.map((id) => [id, tidy(entered[id])])),
          ...allocate(Math.max(leftover, 0), Object.fromEntries(open.map((id) => [id, 1])), digits) };

    const sum = participants.reduce((a, id) => a + (amounts[id] ?? 0), 0);
    const gap = Math.abs(total - sum) < step ? 0 : tidy(total - sum);
    return { amounts, percents: toPercents(amounts, total), gap, complete: gap === 0 };
  }

  // Every row was typed in. Show the numbers exactly as entered and report the gap.
  const amounts: Record<string, number> = {};
  for (const id of participants) {
    amounts[id] = mode === 'percent' ? tidy((total * entered[id]) / 100) : tidy(entered[id]);
  }
  const sum = participants.reduce((a, id) => a + amounts[id], 0);
  const gap = Math.abs(total - sum) < step ? 0 : tidy(total - sum);
  return { amounts, percents: toPercents(amounts, total), gap, complete: gap === 0 };
}

function toPercents(amounts: Record<string, number>, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(amounts)) {
    out[id] = total > 0 ? Math.round((v / total) * 1000) / 10 : 0;
  }
  return out;
}

/** Spend grouped by category key, in base currency. */
export function byCategory(expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) out[e.category] = round2((out[e.category] ?? 0) + Number(e.amount_base));
  return out;
}

/** Spend grouped by calendar day (YYYY-MM-DD), for the trend chart. */
export function byDay(expenses: Expense[]): { day: string; total: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const day = new Date(e.spent_at).toISOString().slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + Number(e.amount_base));
  }
  return [...map.entries()].sort((a, z) => a[0].localeCompare(z[0])).map(([day, total]) => ({ day, total: round2(total) }));
}

/** What a single person actually consumed, by category — powers the personal dashboard. */
export function personalByCategory(expenses: Expense[], userId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    const mine = (e.expense_shares ?? []).find((s) => s.user_id === userId);
    if (!mine) continue;
    out[e.category] = round2((out[e.category] ?? 0) + Number(mine.amount_base));
  }
  return out;
}
