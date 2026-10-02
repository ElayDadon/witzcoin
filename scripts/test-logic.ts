import { computeBalances, simplifyDebts, splitEvenly, allocate, resolveSplit, personalByCategory } from '../src/lib/balances.ts';
import { normalizePhone, formatPhone, phoneToEmail } from '../src/lib/auth.ts';
import { COUNTRIES, COUNTRY_BY_CODE } from '../src/lib/countries.ts';
import { money, moneyRound, moneyShort } from '../src/lib/format.ts';
import { CURRENCIES, CURRENCY_BY_CODE, currencyDigits, searchCurrencies, orderedCurrencies } from '../src/lib/currencies.ts';

let pass = 0, fail = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : (fail++, console.log(`❌ ${name}\n   got      ${JSON.stringify(a)}\n   expected ${JSON.stringify(b)}`));
  if (ok) console.log(`✅ ${name}`);
};

const A = 'alice', B = 'bob', C = 'carl';
const ex = (id: string, payer: string, amt: number, shares: Record<string, number>, cat = 'food') => ({
  id, trip_id: 't', payer_id: payer, description: id, category: cat,
  amount: amt, currency: 'ILS', fx_rate: 1, amount_base: amt,
  split_mode: 'equal' as const, spent_at: '2026-10-01T12:00:00Z', note: null,
  receipt_path: null, created_by: payer, created_at: '', 
  expense_shares: Object.entries(shares).map(([user_id, amount_base], i) => ({ id: `${id}-${i}`, expense_id: id, user_id, amount_base })),
});

console.log('\n--- splitEvenly: no lost agorot ---');
eq('100/3 sums back to 100', Object.values(splitEvenly(100, [A,B,C])).reduce((a,b)=>a+b,0), 100);
eq('100/3 parts', splitEvenly(100, [A,B,C]), { alice: 33.34, bob: 33.33, carl: 33.33 });
eq('0.05/2', Object.values(splitEvenly(0.05,[A,B])).reduce((a,b)=>a+b,0), 0.05);

console.log('\n--- classic case: Alice pays 300 for all three ---');
const e1 = ex('e1', A, 300, { alice: 100, bob: 100, carl: 100 });
let bal = computeBalances([A,B,C], [e1], []);
eq('alice net +200', bal.find(b=>b.userId===A)!.net, 200);
eq('bob net -100', bal.find(b=>b.userId===B)!.net, -100);
eq('nets sum to zero', Math.round(bal.reduce((s,b)=>s+b.net,0)*100)/100, 0);
eq('2 transfers', simplifyDebts(bal).length, 2);
eq('bob pays alice 100', simplifyDebts(bal).find(d=>d.from===B), { from: B, to: A, amount: 100 });

console.log('\n--- simplification actually reduces transfers ---');
// A paid 300 (split 3), B paid 150 (split 3), C paid 60 (split 3)
const e2 = ex('e2', B, 150, { alice: 50, bob: 50, carl: 50 });
const e3 = ex('e3', C, 60,  { alice: 20, bob: 20, carl: 20 });
bal = computeBalances([A,B,C], [e1,e2,e3], []);
eq('alice paid 300', bal.find(b=>b.userId===A)!.paid, 300);
eq('alice owed 170', bal.find(b=>b.userId===A)!.owed, 170);
eq('alice net +130', bal.find(b=>b.userId===A)!.net, 130);
eq('carl net -110', bal.find(b=>b.userId===C)!.net, -110);
const d = simplifyDebts(bal);
eq('only 2 transfers needed', d.length, 2);
eq('transfers settle everything', Math.round(d.reduce((s,x)=>s+x.amount,0)*100)/100, 130);

console.log('\n--- settlements move the needle ---');
bal = computeBalances([A,B,C], [e1], [{ id:'s1', trip_id:'t', from_user: B, to_user: A, amount_base: 100, method:'bit' as const, note:null, settled_at:'', }]);
eq('bob is square after paying', bal.find(b=>b.userId===B)!.net, 0);
eq('alice now owed only 100', bal.find(b=>b.userId===A)!.net, 100);

console.log('\n--- uneven split: Carl did not join dinner ---');
const e4 = ex('e4', A, 200, { alice: 100, bob: 100 });
bal = computeBalances([A,B,C], [e4], []);
eq('carl owes nothing', bal.find(b=>b.userId===C)!.net, 0);
eq('bob owes 100', bal.find(b=>b.userId===B)!.net, -100);

console.log('\n--- personal dashboard ---');
const cats = personalByCategory([e1, ex('e5', B, 90, { alice: 30, bob: 30, carl: 30 }, 'lodging')], A);
eq('alice food 100', cats.food, 100);
eq('alice lodging 30', cats.lodging, 30);

console.log('\n--- phone normalisation ---');
eq('050-123-4567', normalizePhone('050-123-4567'), '+972501234567');
eq('0501234567',   normalizePhone('0501234567'),   '+972501234567');
eq('+972 50 123 4567', normalizePhone('+972 50 123 4567'), '+972501234567');
eq('00972501234567', normalizePhone('00972501234567'), '+972501234567');
eq('US number kept', normalizePhone('+12125550123'), '+12125550123');
eq('garbage rejected', normalizePhone('abc'), null);
eq('too short rejected', normalizePhone('123'), null);
eq('display form', formatPhone('+972501234567'), '050-123-4567');
eq('synthetic email', phoneToEmail('+972501234567'), 'u972501234567@phone.witzcoin.app');

console.log('\n--- data completeness ---');
eq('countries loaded', COUNTRIES.length > 200, true);
eq('israel present', COUNTRY_BY_CODE['IL'].he, 'ישראל');
eq('japan currency', COUNTRY_BY_CODE['JP'].currency, 'JPY');
eq('georgia hebrew', COUNTRY_BY_CODE['GE'].he, 'גאורגיה');
eq('every country has a currency', COUNTRIES.every(c => /^[A-Z]{3}$/.test(c.currency)), true);
eq('every country has a flag', COUNTRIES.every(c => [...c.flag].length === 2), true);

console.log('\n--- money formatting ---');
eq('ILS', money(1234.5, 'ILS'), '1,234.50 ₪');
eq('JPY has no decimals', money(1234, 'JPY'), '1,234 ¥');

console.log('\n--- currency coverage: every active ISO 4217 code ---');
eq('162 currencies', CURRENCIES.length, 162);
eq('vietnamese dong', CURRENCY_BY_CODE['VND'].he, 'דונג וייטנאמי');
eq('dong has no sub-unit', currencyDigits('VND'), 0);
eq('shekel has agorot', currencyDigits('ILS'), 2);
eq('search by hebrew name', searchCurrencies('דונג')[0].code, 'VND');
eq('search by code', searchCurrencies('khr')[0].code, 'KHR');
eq('search by symbol', searchCurrencies('₫')[0].code, 'VND');
eq('shekel is first in the picker', orderedCurrencies()[0].code, 'ILS');
eq('every currency has a symbol', CURRENCIES.every(c => c.symbol.length > 0), true);
eq('every currency has a hebrew name', CURRENCIES.every(c => c.he !== c.code), true);

console.log('\n--- formatting around the world ---');
const nb = (n: number, sym: string) => new Intl.NumberFormat('he-IL').format(n) + '\u00a0' + sym;
eq('VND', money(2450000, 'VND'), nb(2450000, '₫'));
eq('JPY', money(15800, 'JPY'), nb(15800, '¥'));
eq('KRW', money(45000, 'KRW'), nb(45000, '₩'));
eq('rounded form drops agorot', moneyRound(1234.56, 'ILS'), nb(1235, '₪'));
eq('compact millions', moneyShort(2450000, 'VND'), '₫2.5M');

console.log('\n--- splitting a currency with no sub-unit ---');
const vnd = splitEvenly(100000, [A, B, C], 0);
eq('dong parts are whole', Object.values(vnd), [33334, 33333, 33333]);
eq('dong parts sum to the total', Object.values(vnd).reduce((x, y) => x + y, 0), 100000);
eq('yen even split', Object.values(splitEvenly(15800, [A, B], 0)), [7900, 7900]);

console.log('\n--- allocation: the parts always add back up ---');
const tot = (o: Record<string, number>) => Math.round(Object.values(o).reduce((x, y) => x + y, 0) * 100) / 100;
eq('100 split three ways', allocate(100, { a: 1, b: 1, c: 1 }, 2), { a: 33.34, b: 33.33, c: 33.33 });
eq('50:30:20 lands exactly', allocate(100, { a: 50, b: 30, c: 20 }, 2), { a: 50, b: 30, c: 20 });
eq('dong allocates whole units', allocate(100000, { a: 1, b: 1, c: 1 }, 0), { a: 33334, b: 33333, c: 33333 });
eq('zero weights fall back to even', tot(allocate(90, { a: 0, b: 0, c: 0 }, 2)), 90);

console.log('\n--- split by percentage: the last row completes itself ---');
let sp = resolveSplit({ mode: 'percent', participants: [A, B, C], entered: { [A]: 50, [B]: 20 }, total: 350 });
eq('untouched row fills in 30%', sp.percents[C], 30);
eq('and gets the matching amount', sp.amounts[C], 105);
eq('no gap while a row is open', sp.gap, 0);
eq('shares sum to the total', tot(sp.amounts), 350);

sp = resolveSplit({ mode: 'percent', participants: [A, B, C], entered: { [A]: 50, [B]: 20, [C]: 20 }, total: 350 });
eq('short of 100% reports the gap', sp.gap, 35);
eq('typed percentages are never rescaled', [sp.amounts[A], sp.amounts[B], sp.amounts[C]], [175, 70, 70]);

console.log('\n--- split by amount: shows the percentage, shares the rest ---');
sp = resolveSplit({ mode: 'exact', participants: [A, B, C], entered: { [A]: 200 }, total: 350 });
eq('typed amount stays put', sp.amounts[A], 200);
eq('the others share what is left', [sp.amounts[B], sp.amounts[C]], [75, 75]);
eq('and it shows as a percentage', sp.percents[A], 57.1);
eq('sums to the total', tot(sp.amounts), 350);

sp = resolveSplit({ mode: 'exact', participants: [A, B], entered: { [A]: 400 }, total: 350 });
eq('typing more than the total is flagged', sp.gap, -50);

sp = resolveSplit({ mode: 'percent', participants: [A, B, C], entered: { [A]: 50 }, total: 2450000, digits: 0 });
eq('percentages work in dong too', tot(sp.amounts), 2450000);
eq('half of the dong', sp.amounts[A], 1225000);

console.log(`\n${fail === 0 ? '🎉' : '⚠️'}  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
