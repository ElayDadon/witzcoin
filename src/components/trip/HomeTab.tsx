'use client';
import { useMemo } from 'react';
import { computeBalances, byCategory, byDay } from '@/lib/balances';
import { findCategory } from '@/lib/categories';
import { money, moneyShort, moneyCompact, dayLabel } from '@/lib/format';
import { Avatar, Bars, Collapse, DayChart, Empty, Icon } from '@/components/ui';
import type { TripData, TabKey } from '@/app/trips/[id]/page';

/**
 * The home page answers three questions, in this order:
 *   1. how much has the group spent,
 *   2. what is this actually costing me,
 *   3. what is each of my friends paying.
 * Everything else folds away into an accordion.
 */
export default function HomeTab({ data, onJump }: { data: TripData; onJump: (t: TabKey) => void }) {
  const { trip, expenses, settlements, members, categories, meId } = data;
  const cur = trip.base_currency;

  const balances = useMemo(
    () => computeBalances(members.map((m) => m.user_id), expenses, settlements),
    [members, expenses, settlements]
  );
  const mine = balances.find((b) => b.userId === meId);
  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount_base), 0), [expenses]);
  const budget = Number(trip.budget) || 0;
  const left = budget - total;
  const over = budget > 0 && total > budget;
  const pct = budget > 0 ? Math.min(total / budget, 1) : 0;

  const days = useMemo(() => byDay(expenses), [expenses]);
  const perDay = days.length ? total / days.length : 0;
  const daysLeft = trip.end_date
    ? Math.max(1, Math.ceil((new Date(trip.end_date).getTime() + 864e5 - Date.now()) / 864e5))
    : 0;

  const cats = useMemo(
    () => Object.entries(byCategory(expenses)).sort((a, z) => z[1] - a[1]),
    [expenses]
  );
  const maxCat = cats.length ? cats[0][1] : 1;
  const name = (id: string) => members.find((m) => m.user_id === id)?.profile.name ?? 'משתתף';
  const prof = (id: string) => members.find((m) => m.user_id === id)?.profile;

  if (expenses.length === 0) {
    return (
      <div className="panel">
        <Empty emoji="🧾" title="עוד לא נרשמו הוצאות"
               hint="לחצו על + באמצע הסרגל למטה כדי להוסיף את הראשונה. אפשר גם לצלם את הקבלה." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 1 — how much has the group spent */}
      <section className="panel p-[18px]">
        <p className="ptitle">סה״כ הוצאות הקבוצה</p>
        <p className="num mt-1.5 text-[32px] font-extrabold leading-tight tracking-tight">{money(total, cur)}</p>

        {budget > 0 && (
          <>
            <span className="track mt-3.5 block">
              <i style={{ width: `${pct * 100}%`, background: over ? 'var(--neg)' : pct > 0.8 ? 'var(--accent)' : 'var(--brand)' }} />
            </span>
            <p className="mt-2.5 text-[13px]" style={{ color: over ? 'var(--neg)' : 'var(--fg-dim)' }}>
              {over
                ? <>חריגה של <b className="num">{money(-left, cur)}</b> מהתקציב</>
                : <>נשארו <b className="num">{money(left, cur)}</b> מתוך <span className="num">{money(budget, cur)}</span></>}
            </p>
          </>
        )}

        <div className="mt-4 flex gap-3 pt-3.5" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="min-w-0 flex-1">
            <p className="ptitle">הוצאנו ליום</p>
            <p className="num mt-0.5 text-[17px] font-extrabold">{money(perDay, cur)}</p>
          </div>
          {budget > 0 && left > 0 && daysLeft > 0 && (
            <div className="min-w-0 flex-1 ps-3" style={{ borderInlineStart: '1px solid var(--line)' }}>
              <p className="ptitle">אפשר ליום · {daysLeft} ימים</p>
              <p className="num mt-0.5 text-[17px] font-extrabold" style={{ color: 'var(--brand)' }}>
                {money(left / daysLeft, cur)}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 2 — what is this costing me */}
      {mine && (
        <section className="panel">
          <div className="px-[18px] pb-1 pt-[18px]"><p className="ptitle">הכסף שלי</p></div>

          <Row k="שילמתי מהכיס" hint="כל מה שהעברת בפועל, גם כשזה היה בשביל כולם" v={money(mine.paid, cur)} />
          <Row k="מה באמת עלה לי" hint="רק החלק שלך, אחרי חלוקה בין המשתתפים" v={money(mine.owed, cur)} />
          <Row lead
               k={mine.net >= 0 ? 'חייבים לי' : 'אני חייב'}
               hint={mine.net >= 0 ? 'ההפרש — זה מה שתקבל בחזרה בסוף' : 'ההפרש — זה מה שתצטרך להשלים'}
               v={money(Math.abs(mine.net), cur)} />

          <div className="px-[18px] pb-4 pt-3">
            <button className="btn btn-ghost w-full" onClick={() => onJump('balance')}>לראות מי מעביר למי</button>
          </div>
        </section>
      )}

      {/* 3 — what is each friend paying */}
      <section className="panel">
        <div className="px-[18px] pb-1.5 pt-[18px]">
          <p className="ptitle">מה כל אחד שילם</p>
          <p className="mt-1 text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>לחיצה על שם פותחת את הפירוט שלו</p>
        </div>

        {[...balances].sort((a, z) => z.paid - a.paid).map((b, i) => {
          const his = expenses.filter((e) => e.payer_id === b.userId);
          const pos = b.net > 0.01, neg = b.net < -0.01;
          return (
            <details key={b.userId} className="acc" style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
              <summary className="flex items-center gap-3 px-[18px] py-3.5">
                <Avatar name={prof(b.userId)?.name ?? '?'} color={prof(b.userId)?.avatar_color} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] font-bold">{b.userId === meId ? 'אני' : name(b.userId)}</span>
                    <span className="ms-auto whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold"
                          style={{
                            background: pos ? 'var(--brand-soft)' : neg ? 'color-mix(in srgb, var(--neg) 14%, transparent)' : 'var(--surface-2)',
                            color: pos ? 'var(--brand)' : neg ? 'var(--neg)' : 'var(--fg-dim)',
                          }}>
                      <span className="num">{pos ? '+' : ''}{money(b.net, cur)}</span>
                    </span>
                  </span>
                  <span className="num mt-[3px] block text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
                    שילם {moneyCompact(b.paid, cur)} · חלקו {moneyCompact(b.owed, cur)}
                  </span>
                </span>
                <span className="chev" style={{ color: 'var(--fg-faint)' }}><Icon name="chev" size={17} /></span>
              </summary>

              <div className="px-[18px] pb-3.5 pt-0.5">
                <p className="mb-2 text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
                  {his.length ? `${his.length} הוצאות ששילם:` : 'עוד לא שילם על כלום'}
                </p>
                {his.map((e) => (
                  <div key={e.id} className="flex items-baseline gap-2 py-1">
                    <span>{findCategory(categories, e.category).emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{e.description}</span>
                    <span className="num text-[11.5px]" style={{ color: 'var(--fg-dim)' }}>{money(Number(e.amount_base), cur)}</span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </section>

      <Collapse title="לאן הולך הכסף">
        <Bars data={cats.map(([key, v]) => {
          const c = findCategory(categories, key);
          return { label: `${c.emoji} ${c.label}`, value: `${money(v, cur)} · ${Math.round((v / total) * 100)}%`, ratio: v / maxCat, color: c.color };
        })} />
      </Collapse>

      {days.length > 1 && (
        <Collapse title="הוצאה לפי ימים">
          <DayChart days={days} label={(n) => moneyShort(n, cur)} />
          <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--fg-faint)' }}>
            היום היקר ביותר: <b>{dayLabel(days.reduce((a, b) => (b.total > a.total ? b : a)).day)}</b>{' '}
            עם <b className="num">{money(Math.max(...days.map((d) => d.total)), cur)}</b>.
          </p>
        </Collapse>
      )}

      <Collapse title="איך מחשבים את זה">
        <div className="text-[13px] leading-[1.85]" style={{ color: 'var(--fg-dim)' }}>
          <p><b style={{ color: 'var(--fg)' }}>שילמתי מהכיס</b> — סכום כל ההוצאות שרשומות על שמך כמי ששילם עליהן.</p>
          <p className="mt-2.5">
            <b style={{ color: 'var(--fg)' }}>מה באמת עלה לי</b> — מכל הוצאה נלקח רק החלק שלך.
            אם שילמת <span className="num">{money(300, cur)}</span> על ארוחה לשלושה, החלק שלך הוא <span className="num">{money(100, cur)}</span>.
          </p>
          <p className="mt-2.5">
            <b style={{ color: 'var(--fg)' }}>המאזן</b> — ההפרש בין השניים, פחות החזרים שכבר הועברו.
            מספר חיובי אומר שהקבוצה חייבת לך.
          </p>
          <p className="mt-2.5">
            <b style={{ color: 'var(--fg)' }}>ההעברות</b> — במקום שכל אחד יעביר לכל אחד, האפליקציה מחשבת
            את מספר ההעברות המינימלי שמאפס את כולם.
          </p>
          <p className="mt-2.5">
            הוצאה במטבע זר מומרת למטבע ההתחשבנות לפי השער ביום ההוצאה, והשער נשמר על ההוצאה —
            כך ששינוי שער מחר לא משנה את מה שהיה אתמול.
          </p>
        </div>
      </Collapse>
    </div>
  );
}

function Row({ k, hint, v, lead }: { k: string; hint: string; v: string; lead?: boolean }) {
  return (
    <div className="kv" style={lead ? { background: 'var(--brand-soft)' } : undefined}>
      <span className="text-sm font-semibold" style={lead ? { color: 'var(--brand)' } : undefined}>
        {k}
        <span className="mt-0.5 block text-[11.5px] font-normal leading-snug"
              style={{ color: lead ? 'var(--brand)' : 'var(--fg-faint)', opacity: lead ? 0.75 : 1 }}>
          {hint}
        </span>
      </span>
      <span className="num whitespace-nowrap text-[17px] font-extrabold" style={lead ? { color: 'var(--brand)' } : undefined}>{v}</span>
    </div>
  );
}
