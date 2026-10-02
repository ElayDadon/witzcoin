'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { computeBalances, simplifyDebts, type Debt } from '@/lib/balances';
import { money, moneyCompact, dayLabel } from '@/lib/format';
import { formatPhone } from '@/lib/auth';
import { requestText, whatsappLink, smsLink, openBit } from '@/lib/bit';
import { notify } from '@/lib/push-client';
import { Avatar, Sheet, Empty, toast } from '@/components/ui';
import type { TripData } from '@/app/trips/[id]/page';

export default function BalancesTab({ data, onChanged }: { data: TripData; onChanged: () => void }) {
  const { trip, expenses, settlements, members, meId } = data;
  const cur = trip.base_currency;
  const [settleFor, setSettleFor] = useState<Debt | null>(null);
  const [askFor, setAskFor] = useState<Debt | null>(null);

  const balances = useMemo(
    () => computeBalances(members.map((m) => m.user_id), expenses, settlements),
    [members, expenses, settlements]
  );
  const debts = useMemo(() => simplifyDebts(balances), [balances]);
  const pairs = (members.length * (members.length - 1)) / 2;
  const name = (id: string) => members.find((m) => m.user_id === id)?.profile.name ?? 'משתתף';
  const prof = (id: string) => members.find((m) => m.user_id === id)?.profile;

  if (expenses.length === 0) {
    return <div className="panel"><Empty emoji="⚖️" title="אין מה לחשב עדיין" hint="אחרי ההוצאה הראשונה נראה כאן מי חייב למי." /></div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="panel">
        <div className="px-[18px] pb-1.5 pt-[18px]"><p className="ptitle">המאזן של כל אחד</p></div>
        {[...balances].sort((a, z) => z.net - a.net).map((b, i) => {
          const pos = b.net > 0.01, neg = b.net < -0.01;
          return (
            <div key={b.userId} className="flex items-center gap-3 px-[18px] py-3"
                 style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
              <Avatar name={prof(b.userId)?.name ?? '?'} color={prof(b.userId)?.avatar_color} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">{b.userId === meId ? 'אני' : name(b.userId)}</span>
                <span className="num block text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
                  שילם {moneyCompact(b.paid, cur)} · חלקו {moneyCompact(b.owed, cur)}
                </span>
              </span>
              <span className="num text-[13px] font-extrabold"
                    style={{ color: pos ? 'var(--pos)' : neg ? 'var(--neg)' : 'var(--fg-faint)' }}>
                {pos ? '+' : ''}{money(b.net, cur)}
              </span>
            </div>
          );
        })}
      </section>

      <div className="flex items-baseline justify-between px-1 pt-2">
        <h3 className="text-[15px] font-extrabold">איך סוגרים את זה</h3>
        <span className="text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
          {debts.length === 0 ? 'הכול מאוזן' : `${debts.length} העברות במקום ${pairs}`}
        </span>
      </div>

      {debts.length === 0 ? (
        <div className="panel"><Empty emoji="🎉" title="כולם מאופסים" hint="אף אחד לא חייב לאף אחד." /></div>
      ) : debts.map((d, i) => {
        const iPay = d.from === meId, iGet = d.to === meId;
        return (
          <section key={i} className="panel p-[18px]">
            <div className="flex items-center gap-2.5">
              <Avatar name={name(d.from)} color={prof(d.from)?.avatar_color} size={30} />
              <span className="text-[13px] font-bold">{iPay ? 'אני' : name(d.from).split(' ')[0]}</span>
              <span className="flex-1 text-center" style={{ color: 'var(--fg-faint)' }}>←</span>
              <span className="text-[13px] font-bold">{iGet ? 'אני' : name(d.to).split(' ')[0]}</span>
              <Avatar name={name(d.to)} color={prof(d.to)?.avatar_color} size={30} />
            </div>
            <p className="num mt-2.5 text-center text-2xl font-extrabold">{money(d.amount, cur)}</p>
            <div className="mt-3.5 flex gap-2">
              {iGet && <button className="btn btn-primary flex-1" onClick={() => setAskFor(d)}>בקשה בביט</button>}
              {iPay && (
                <>
                  <button className="btn btn-ghost flex-1" onClick={openBit}>פתיחת ביט</button>
                  <button className="btn btn-primary flex-1" onClick={() => setSettleFor(d)}>שילמתי</button>
                </>
              )}
              {!iPay && !iGet && <button className="btn btn-ghost w-full" onClick={() => setSettleFor(d)}>סימון כשולם</button>}
            </div>
          </section>
        );
      })}

      {settlements.length > 0 && (
        <>
          <h3 className="mt-2 px-1 text-[13px] font-extrabold" style={{ color: 'var(--fg-faint)' }}>החזרים שכבר בוצעו</h3>
          <section className="panel">
            {settlements.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3.5"
                   style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
                <span className="text-[17px]">{s.method === 'bit' ? '💸' : s.method === 'cash' ? '💵' : '🏦'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    {s.from_user === meId ? 'אני' : name(s.from_user).split(' ')[0]} ← {s.to_user === meId ? 'אני' : name(s.to_user).split(' ')[0]}
                  </span>
                  <span className="block text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
                    {dayLabel(s.settled_at)}{s.note ? ` · ${s.note}` : ''}
                  </span>
                </span>
                <span className="num text-[13px] font-extrabold">{money(Number(s.amount_base), cur)}</span>
                <button aria-label="ביטול ההחזר" style={{ color: 'var(--fg-faint)' }}
                        onClick={async () => { await supabase().from('settlements').delete().eq('id', s.id); onChanged(); }}>×</button>
              </div>
            ))}
          </section>
        </>
      )}

      <SettleSheet debt={settleFor} data={data} onClose={() => setSettleFor(null)} onSaved={onChanged} />
      <AskSheet debt={askFor} data={data} onClose={() => setAskFor(null)} />
    </div>
  );
}

function SettleSheet({ debt, data, onClose, onSaved }: {
  debt: Debt | null; data: TripData; onClose: () => void; onSaved: () => void;
}) {
  const { trip, members, meId } = data;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'bit' | 'cash' | 'bank' | 'paybox' | 'other'>('bit');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  if (debt && !ready) { setReady(true); setAmount(String(debt.amount)); }
  if (!debt && ready) setReady(false);
  if (!debt) return null;

  const name = (id: string) => members.find((m) => m.user_id === id)?.profile.name ?? 'משתתף';
  const METHODS = [
    { k: 'bit', label: 'ביט', icon: '💸' }, { k: 'paybox', label: 'פייבוקס', icon: '📦' },
    { k: 'cash', label: 'מזומן', icon: '💵' }, { k: 'bank', label: 'העברה בנקאית', icon: '🏦' },
  ] as const;

  async function save() {
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast('סכום לא תקין', 'err'); return; }
    setBusy(true);
    const { error } = await supabase().from('settlements').insert({
      trip_id: trip.id, from_user: debt!.from, to_user: debt!.to,
      amount_base: amt, method, created_by: meId,
    });
    setBusy(false);
    if (error) { toast('השמירה נכשלה', 'err'); return; }
    void notify({
      userIds: [debt!.to, debt!.from].filter((id) => id !== meId),
      tripId: trip.id, type: 'settlement',
      title: `${trip.emoji} ${trip.name}`,
      body: `${name(debt!.from)} העביר ${money(amt, trip.base_currency)} ל${name(debt!.to)}`,
      url: `/trips/${trip.id}`,
    });
    onClose(); onSaved();
    toast('ההחזר נרשם');
  }

  return (
    <Sheet open onClose={onClose} title="רישום החזר"
           footer={<button className="btn btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'אישור'}</button>}>
      <p className="text-[13px]" style={{ color: 'var(--fg-dim)' }}>
        <b>{debt.from === meId ? 'אני' : name(debt.from)}</b> ← <b>{debt.to === meId ? 'אני' : name(debt.to)}</b>
      </p>
      <div>
        <label className="label" htmlFor="amt2">סכום</label>
        <input id="amt2" className="field num text-left text-xl font-bold" dir="ltr" inputMode="decimal" value={amount}
               onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
          אפשר גם החזר חלקי — המאזן יתעדכן בהתאם.
        </p>
      </div>
      <div>
        <span className="label">איך שולם</span>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button key={m.k} onClick={() => setMethod(m.k)} className={`chip ${method === m.k ? 'chip-on' : ''}`}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function AskSheet({ debt, data, onClose }: { debt: Debt | null; data: TripData; onClose: () => void }) {
  const { trip, members, meId } = data;
  if (!debt) return null;
  const debtor = members.find((m) => m.user_id === debt.from)!;
  const me = members.find((m) => m.user_id === meId)!;

  const text = requestText({
    debtorName: debtor.profile.name.split(' ')[0],
    creditorName: me.profile.name,
    creditorPhone: formatPhone(me.profile.phone),
    amount: debt.amount,
    currency: trip.base_currency,
    tripName: trip.name,
  });

  return (
    <Sheet open onClose={onClose} title={`בקשת תשלום מ${debtor.profile.name.split(' ')[0]}`}>
      <section className="rounded-[13px] p-4 text-center" style={{ background: 'var(--brand-soft)' }}>
        <p className="num text-[27px] font-extrabold" style={{ color: 'var(--brand)' }}>{money(debt.amount, trip.base_currency)}</p>
        <p className="num mt-1 text-[13px]" style={{ color: 'var(--brand)', opacity: .8 }}>לביט של {formatPhone(me.profile.phone)}</p>
      </section>

      <section className="rounded-[13px] p-3.5" style={{ background: 'var(--surface-2)' }}>
        <p className="whitespace-pre-line text-[13px] leading-relaxed">{text}</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <a className="btn btn-primary" href={whatsappLink(debtor.profile.phone, text)} target="_blank" rel="noreferrer">שליחה בוואטסאפ</a>
        <a className="btn btn-ghost" href={smsLink(debtor.profile.phone, text)}>שליחה ב-SMS</a>
        <button className="btn btn-ghost" onClick={() => { void navigator.clipboard.writeText(String(debt.amount)); toast('הסכום הועתק'); }}>
          העתקת הסכום
        </button>
        <button className="btn btn-ghost" onClick={() => {
          void notify({
            userIds: [debt.from], tripId: trip.id, type: 'reminder',
            title: `${trip.emoji} ${trip.name}`,
            body: `${me.profile.name} מבקש ${money(debt.amount, trip.base_currency)}`,
            url: `/trips/${trip.id}`,
          });
          toast('נשלחה תזכורת באפליקציה');
        }}>
          תזכורת באפליקציה
        </button>
      </div>

      <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--fg-faint)' }}>
        לביט אין API ציבורי לאנשים פרטיים, אז אי אפשר לחייב אוטומטית. הכפתורים כאן מכינים את ההודעה
        עם הסכום המדויק — ההעברה עצמה נעשית באפליקציית ביט.
      </p>
    </Sheet>
  );
}
