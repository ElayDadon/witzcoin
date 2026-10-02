'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CURRENCY_BY_CODE, currencyDigits } from '@/lib/currencies';
import { money, dayLabel } from '@/lib/format';
import { getRate } from '@/lib/fx';
import { splitEvenly } from '@/lib/balances';
import { notify } from '@/lib/push-client';
import { Avatar, Sheet, Empty, toast } from '@/components/ui';
import TaskSheet from './TaskSheet';
import type { TripData } from '@/app/trips/[id]/page';
import type { Task } from '@/lib/types';

export default function TasksTab({ data, onChanged, onAdd }: {
  data: TripData; onChanged: () => void; onAdd: () => void;
}) {
  const { trip, tasks, members, meId } = data;
  const cur = trip.base_currency;
  const [editing, setEditing] = useState<Task | null>(null);
  const [completing, setCompleting] = useState<Task | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const list = mineOnly ? tasks.filter((t) => t.assignee_id === meId) : tasks;
  const open = list.filter((t) => !t.is_done);
  const done = list.filter((t) => t.is_done);
  const planned = open.reduce((s, t) => s + (Number(t.est_cost) || 0), 0);

  async function toggle(t: Task) {
    if (!t.is_done) { setCompleting(t); return; }
    // Un-completing also removes the expense the completion created.
    if (t.expense_id) await supabase().from('expenses').delete().eq('id', t.expense_id);
    await supabase().from('tasks').update({ is_done: false, done_at: null, expense_id: null }).eq('id', t.id);
    onChanged();
  }

  const row = (t: Task, i: number) => {
    const who = members.find((m) => m.user_id === t.assignee_id);
    const cost = t.is_done ? t.actual_cost : t.est_cost;
    const late = !t.is_done && t.due_at && new Date(t.due_at) < new Date();
    return (
      <div key={t.id} className="flex items-center gap-3 px-4 py-3.5"
           style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
        <button onClick={() => toggle(t)} aria-label="סימון כבוצע"
                className="grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full text-xs text-white transition active:scale-90"
                style={{ background: t.is_done ? 'var(--pos)' : 'transparent', border: `2px solid ${t.is_done ? 'var(--pos)' : 'var(--line)'}` }}>
          {t.is_done ? '✓' : ''}
        </button>
        <button onClick={() => setEditing(t)} className="min-w-0 flex-1 text-right">
          <span className={`block truncate text-[14.5px] font-bold ${t.is_done ? 'line-through opacity-[.45]' : ''}`}>{t.title}</span>
          <span className="block text-[11.5px]" style={{ color: late ? 'var(--neg)' : 'var(--fg-faint)' }}>
            {who ? (who.user_id === meId ? 'עליך' : who.profile.name.split(' ')[0]) : 'ללא אחראי'}
            {t.due_at && ` · ${dayLabel(t.due_at)}`}
            {!t.billable && ' · על חשבונו'}
          </span>
        </button>
        {who && <Avatar name={who.profile.name} color={who.profile.avatar_color} size={26} />}
        {cost ? <span className="num shrink-0 text-[13px] font-extrabold">{money(Number(cost), t.currency || cur)}</span> : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="panel flex items-center gap-3 p-[18px]">
        <div className="flex-1">
          <p className="ptitle">משימות פתוחות</p>
          <p className="mt-1 text-[22px] font-extrabold">{open.length}</p>
        </div>
        {planned > 0 && (
          <div className="text-left">
            <p className="ptitle">צפי עלות</p>
            <p className="num mt-1 text-[22px] font-extrabold">{money(planned, trip.trip_currency)}</p>
          </div>
        )}
      </section>

      <div className="flex items-center gap-2">
        <button onClick={() => setMineOnly(!mineOnly)} className={`chip ${mineOnly ? 'chip-on' : ''}`}>רק שלי</button>
        <button onClick={onAdd} className="chip ms-auto font-bold" style={{ color: 'var(--brand)' }}>+ משימה</button>
      </div>

      {list.length === 0 && (
        <div className="panel">
          <Empty emoji="✅" title="אין משימות"
                 hint="לדוגמה: ״דני מזמין את המלון באתונה״ — ואז מסמנים שבוצע וכמה זה עלה." />
        </div>
      )}

      {open.length > 0 && <section className="panel">{open.map(row)}</section>}

      {done.length > 0 && (
        <>
          <h3 className="mt-2 px-1 text-[13px] font-extrabold" style={{ color: 'var(--fg-faint)' }}>בוצעו ({done.length})</h3>
          <section className="panel">{done.map(row)}</section>
        </>
      )}

      <p className="px-1 text-[11.5px] leading-relaxed" style={{ color: 'var(--fg-faint)' }}>
        סימון משימה כבוצעה פותח שאלה אחת: כמה היא עלתה בפועל. אם כולם משתתפים — נוצר מזה חיוב משותף,
        בלי להקליד את ההוצאה פעם שנייה.
      </p>

      <TaskSheet open={!!editing} task={editing} data={data} onClose={() => setEditing(null)} onSaved={onChanged} />
      <CompleteSheet task={completing} data={data} onClose={() => setCompleting(null)} onSaved={onChanged} />
    </div>
  );
}

/* ------------------------- mark done, and turn it into a shared expense ---- */
function CompleteSheet({ task, data, onClose, onSaved }: {
  task: Task | null; data: TripData; onClose: () => void; onSaved: () => void;
}) {
  const { trip, members, meId } = data;
  const [cost, setCost] = useState('');
  const [billable, setBillable] = useState(true);
  const [who, setWho] = useState<string[]>(members.map((m) => m.user_id));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    setCost(task.est_cost != null ? String(task.est_cost) : '');
    setBillable(task.billable);
    setWho(members.map((m) => m.user_id));
  }, [task, members]);

  if (!task) return null;
  const payer = task.assignee_id ?? meId;
  const currency = task.currency || trip.trip_currency;

  async function confirm() {
    setBusy(true);
    const amount = Number(cost) || 0;
    let expenseId: string | null = null;

    if (amount > 0) {
      const rate = currency === trip.base_currency ? 1 : (await getRate(currency, trip.base_currency)) ?? 1;
      const baseTotal = Math.round(amount * rate * 100) / 100;
      const participants = billable ? who : [payer];
      expenseId = crypto.randomUUID();

      const { error } = await supabase().from('expenses').insert({
        id: expenseId, trip_id: trip.id, payer_id: payer,
        description: task!.title, category: 'other',
        amount, currency, fx_rate: rate, amount_base: baseTotal,
        split_mode: 'equal', spent_at: new Date().toISOString(),
        note: 'נוצר ממשימה', created_by: meId,
      });
      if (error) { setBusy(false); toast('לא הצלחנו ליצור את ההוצאה', 'err'); return; }

      const shares = splitEvenly(baseTotal, participants, currencyDigits(trip.base_currency));
      await supabase().from('expense_shares').insert(
        Object.entries(shares).map(([user_id, amount_base]) => ({ expense_id: expenseId, user_id, amount_base }))
      );
    }

    await supabase().from('tasks').update({
      is_done: true, done_at: new Date().toISOString(),
      actual_cost: amount || null, billable, expense_id: expenseId,
    }).eq('id', task!.id);

    const meName = members.find((m) => m.user_id === meId)?.profile.name ?? 'מישהו';
    void notify({
      userIds: members.map((m) => m.user_id).filter((id) => id !== meId),
      tripId: trip.id, type: 'task-done',
      title: `${trip.emoji} ${trip.name}`,
      body: amount > 0 ? `${meName} סיים "${task!.title}" — ${money(amount, currency)}` : `${meName} סיים "${task!.title}"`,
      url: `/trips/${trip.id}`,
    });

    setBusy(false);
    onClose(); onSaved();
    toast('סומן כבוצע');
  }

  return (
    <Sheet open onClose={onClose} title="בוצע! כמה זה עלה?"
           footer={<button className="btn btn-primary w-full" onClick={confirm} disabled={busy}>{busy ? 'שומר…' : 'אישור'}</button>}>
      <p className="font-bold">{task.title}</p>

      <div>
        <label className="label" htmlFor="cost">עלות בפועל</label>
        <div className="flex gap-2">
          <input id="cost" className="field num flex-1 text-left text-xl font-bold" inputMode="decimal" dir="ltr" autoFocus
                 value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
          <span className="field w-[86px] shrink-0 text-center font-bold">
            {CURRENCY_BY_CODE[currency]?.symbol ?? ''} {currency}
          </span>
        </div>
        <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
          אפשר להשאיר ריק אם זה לא עלה כסף — המשימה פשוט תסומן כבוצעה.
        </p>
      </div>

      {Number(cost) > 0 && (
        <>
          <button onClick={() => setBillable(!billable)}
                  className="flex w-full items-center gap-3 rounded-[13px] p-3.5 text-right"
                  style={{ background: 'var(--surface-2)' }}>
            <span className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md text-xs text-white"
                  style={{ background: billable ? 'var(--brand)' : 'transparent', border: billable ? 'none' : '1.5px solid var(--line)' }}>
              {billable ? '✓' : ''}
            </span>
            <span className="flex-1 text-[13px]">
              <b>האחרים משתתפים בעלות</b>
              <span className="mt-0.5 block text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
                {billable ? 'ייווצר חיוב משותף' : 'ההוצאה תירשם רק על המבצע'}
              </span>
            </span>
          </button>

          {billable && (
            <div>
              <span className="label">מתחלק בין</span>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const on = who.includes(m.user_id);
                  return (
                    <button key={m.user_id} className={`chip ${on ? 'chip-on' : ''}`} style={on ? undefined : { opacity: .55 }}
                            onClick={() => setWho((w) => on ? w.filter((x) => x !== m.user_id) : [...w, m.user_id])}>
                      {m.user_id === meId ? 'אני' : m.profile.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
