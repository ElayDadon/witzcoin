'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { pickable, findCategory } from '@/lib/categories';
import { money, dayLabel, timeLabel } from '@/lib/format';
import { Avatar, Sheet, Empty, toast } from '@/components/ui';
import AddExpenseSheet, { ReceiptThumb } from './AddExpenseSheet';
import type { TripData } from '@/app/trips/[id]/page';
import type { Expense } from '@/lib/types';

export default function ExpensesTab({ data, onChanged }: { data: TripData; onChanged: () => void }) {
  const { trip, expenses, members, categories, meId } = data;
  const cur = trip.base_currency;
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<Expense | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);

  const list = useMemo(
    () => (filter ? expenses.filter((e) => e.category === filter || e.payer_id === filter) : expenses),
    [expenses, filter]
  );
  const groups = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of list) m.set(e.spent_at.slice(0, 10), [...(m.get(e.spent_at.slice(0, 10)) ?? []), e]);
    return [...m.entries()].sort((a, z) => z[0].localeCompare(a[0]));
  }, [list]);

  const sum = list.reduce((s, e) => s + Number(e.amount_base), 0);
  const used = new Set(expenses.map((e) => e.category));

  if (expenses.length === 0) {
    return <div className="panel"><Empty emoji="🧾" title="עוד לא נרשמו הוצאות" hint="לחצו על + באמצע הסרגל למטה." /></div>;
  }

  return (
    <div className="flex flex-col">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2.5 pt-0.5">
        <button onClick={() => setFilter(null)} className={`chip ${!filter ? 'chip-on' : ''}`}>הכול</button>
        {members.map((m) => (
          <button key={m.user_id} onClick={() => setFilter(filter === m.user_id ? null : m.user_id)}
                  className={`chip ${filter === m.user_id ? 'chip-on' : ''}`}>
            <Avatar name={m.profile.name} color={m.profile.avatar_color} size={17} />
            {m.user_id === meId ? 'אני' : m.profile.name.split(' ')[0]}
          </button>
        ))}
        {pickable(categories).filter((c) => used.has(c.key)).map((c) => (
          <button key={c.key} onClick={() => setFilter(filter === c.key ? null : c.key)} className="chip"
                  style={filter === c.key ? { background: c.color, color: '#fff' } : undefined}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <p className="mb-2.5 px-1 text-[13px]" style={{ color: 'var(--fg-dim)' }}>
        {list.length} הוצאות · <b className="num">{money(sum, cur)}</b>
      </p>

      {groups.length === 0 ? (
        <div className="panel"><Empty emoji="🔍" title="אין הוצאות שמתאימות לסינון" /></div>
      ) : groups.map(([day, items]) => (
        <section key={day}>
          <div className="flex items-baseline justify-between px-1 pb-1.5 pt-3.5">
            <h3 className="text-[13px] font-extrabold">{dayLabel(day)}</h3>
            <span className="num text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
              {money(items.reduce((s, e) => s + Number(e.amount_base), 0), cur)}
            </span>
          </div>
          <div className="panel">
            {items.map((e, i) => {
              const c = findCategory(categories, e.category);
              const payer = members.find((m) => m.user_id === e.payer_id);
              const mine = (e.expense_shares ?? []).find((s) => s.user_id === meId);
              return (
                <button key={e.id} onClick={() => setOpen(e)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-right"
                        style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
                  <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl text-[17px]"
                        style={{ background: `${c.color}1c` }}>{c.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold leading-tight">{e.description}</span>
                    <span className="block truncate text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
                      {payer?.user_id === meId ? 'שילמת' : `${payer?.profile.name.split(' ')[0]} שילם`} · {timeLabel(e.spent_at)}
                      {e.receipt_path && ' · 📎'}
                    </span>
                  </span>
                  <span className="shrink-0 text-left">
                    <span className="num block text-[14.5px] font-extrabold">{money(Number(e.amount_base), cur)}</span>
                    <span className="num block text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
                      {mine ? `חלקך ${money(Number(mine.amount_base), cur)}` : 'לא השתתפת'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <ExpenseDetail expense={open} data={data} onClose={() => setOpen(null)}
                     onEdit={(e) => { setOpen(null); setEditing(e); }}
                     onDeleted={() => { setOpen(null); onChanged(); }} />
      <AddExpenseSheet open={!!editing} editing={editing} onClose={() => setEditing(null)} data={data} onSaved={onChanged} />
    </div>
  );
}

function ExpenseDetail({ expense, data, onClose, onEdit, onDeleted }: {
  expense: Expense | null; data: TripData; onClose: () => void;
  onEdit: (e: Expense) => void; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!expense) return null;
  const { trip, members, categories } = data;
  const cur = trip.base_currency;
  const c = findCategory(categories, expense.category);
  const payer = members.find((m) => m.user_id === expense.payer_id);

  async function remove() {
    setBusy(true);
    if (expense!.receipt_path) await supabase().storage.from('receipts').remove([expense!.receipt_path]);
    const { error } = await supabase().from('expenses').delete().eq('id', expense!.id);
    setBusy(false);
    if (error) { toast('המחיקה נכשלה', 'err'); return; }
    toast('ההוצאה נמחקה');
    onDeleted();
  }

  return (
    <Sheet open onClose={onClose} title={expense.description}
           footer={
             confirming ? (
               <div className="flex gap-2">
                 <button className="btn btn-ghost flex-1" onClick={() => setConfirming(false)}>ביטול</button>
                 <button className="btn flex-1 text-white" style={{ background: 'var(--neg)' }} onClick={remove} disabled={busy}>
                   {busy ? 'מוחק…' : 'כן, למחוק'}
                 </button>
               </div>
             ) : (
               <div className="flex gap-2">
                 <button className="btn btn-ghost flex-1" style={{ color: 'var(--neg)' }} onClick={() => setConfirming(true)}>מחיקה</button>
                 <button className="btn btn-primary flex-[2]" onClick={() => onEdit(expense)}>עריכה</button>
               </div>
             )
           }>
      <div className="flex items-center gap-3.5">
        <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] text-[22px]"
              style={{ background: `${c.color}1c` }}>{c.emoji}</span>
        <div>
          <p className="num text-2xl font-extrabold">{money(Number(expense.amount_base), cur)}</p>
          {expense.currency !== cur && (
            <p className="num mt-0.5 text-[13px]" style={{ color: 'var(--fg-faint)' }}>
              {money(Number(expense.amount), expense.currency)} · שער {Number(expense.fx_rate).toFixed(4)}
            </p>
          )}
        </div>
      </div>

      <section className="rounded-[13px]" style={{ background: 'var(--surface-2)' }}>
        <Line k="קטגוריה" v={`${c.emoji} ${c.label}`} />
        <Line k="שילם" v={payer?.profile.name ?? '—'} />
        <Line k="מתי" v={`${dayLabel(expense.spent_at)}, ${timeLabel(expense.spent_at)}`} />
        {expense.note && <Line k="הערה" v={expense.note} />}
      </section>

      <div>
        <p className="label">החלוקה</p>
        <section className="rounded-[13px]" style={{ background: 'var(--surface-2)' }}>
          {(expense.expense_shares ?? []).map((s, i) => {
            const m = members.find((x) => x.user_id === s.user_id);
            return (
              <div key={s.id} className="flex items-center gap-2.5 px-3.5 py-2.5"
                   style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
                <Avatar name={m?.profile.name ?? '?'} color={m?.profile.avatar_color} size={25} />
                <span className="flex-1 text-[13px]">{m?.profile.name ?? 'משתתף'}</span>
                <span className="num text-[13px] font-bold">{money(Number(s.amount_base), cur)}</span>
              </div>
            );
          })}
        </section>
      </div>

      {expense.receipt_path && (
        <div>
          <p className="label">קבלה</p>
          <div className="overflow-hidden rounded-[13px]" style={{ border: '1px solid var(--line)' }}>
            <ReceiptThumb path={expense.receipt_path} className="w-full object-contain" />
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between px-3.5 py-2.5 text-[13px]">
      <span style={{ color: 'var(--fg-dim)' }}>{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
