'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CURRENCY_BY_CODE, orderedCurrencies, searchCurrencies } from '@/lib/currencies';
import { notify } from '@/lib/push-client';
import { Avatar, Sheet, SearchPicker, toast } from '@/components/ui';
import type { TripData } from '@/app/trips/[id]/page';
import type { Task } from '@/lib/types';

export default function TaskSheet({ open, task, data, onClose, onSaved }: {
  open: boolean; task: Task | null; data: TripData; onClose: () => void; onSaved: () => void;
}) {
  const { trip, members, meId } = data;
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<string | null>(meId);
  const [due, setDue] = useState('');
  const [est, setEst] = useState('');
  const [currency, setCurrency] = useState(trip.trip_currency);
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState('');
  const [pickCur, setPickCur] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setAssignee(task?.assignee_id ?? meId);
    setDue(task?.due_at ? task.due_at.slice(0, 10) : '');
    setEst(task?.est_cost != null ? String(task.est_cost) : '');
    setCurrency(task?.currency ?? trip.trip_currency);
    setBillable(task?.billable ?? true);
    setNotes(task?.notes ?? '');
  }, [open, task, meId, trip.trip_currency]);

  async function save() {
    if (!title.trim()) { toast('צריך לכתוב מה לעשות', 'err'); return; }
    setBusy(true);
    const row = {
      trip_id: trip.id,
      title: title.trim(),
      notes: notes.trim() || null,
      assignee_id: assignee,
      due_at: due ? new Date(due).toISOString() : null,
      est_cost: est ? Number(est) : null,
      currency,
      billable,
      created_by: meId,
    };
    const { error } = task
      ? await supabase().from('tasks').update(row).eq('id', task.id)
      : await supabase().from('tasks').insert(row);
    setBusy(false);
    if (error) { toast('השמירה נכשלה', 'err'); return; }

    if (!task && assignee && assignee !== meId) {
      const meName = members.find((m) => m.user_id === meId)?.profile.name ?? 'מישהו';
      void notify({
        userIds: [assignee], tripId: trip.id, type: 'task',
        title: `${trip.emoji} ${trip.name}`,
        body: `${meName} הטיל עליך משימה: ${title.trim()}`,
        url: `/trips/${trip.id}`,
      });
    }
    onClose(); onSaved();
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    await supabase().from('tasks').delete().eq('id', task.id);
    setBusy(false);
    onClose(); onSaved();
    toast('המשימה נמחקה');
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={task ? 'עריכת משימה' : 'משימה חדשה'}
             footer={
               <div className="flex gap-2">
                 {task && <button className="btn btn-ghost flex-1" style={{ color: 'var(--neg)' }} onClick={remove} disabled={busy}>מחיקה</button>}
                 <button className="btn btn-primary flex-[2]" onClick={save} disabled={busy}>
                   {busy ? 'שומר…' : task ? 'שמירת השינויים' : 'הוספת המשימה'}
                 </button>
               </div>
             }>
        <div>
          <label className="label" htmlFor="tt">מה צריך לעשות?</label>
          <input id="tt" className="field" value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder="להזמין את הרכב בשדה התעופה" autoFocus />
        </div>

        <div>
          <span className="label">על מי זה</span>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button key={m.user_id} onClick={() => setAssignee(m.user_id)}
                      className={`chip ${assignee === m.user_id ? 'chip-on' : ''}`}>
                <Avatar name={m.profile.name} color={assignee === m.user_id ? 'rgba(255,255,255,.25)' : m.profile.avatar_color} size={18} />
                {m.user_id === meId ? 'אני' : m.profile.name.split(' ')[0]}
              </button>
            ))}
            <button onClick={() => setAssignee(null)} className={`chip ${assignee === null ? 'chip-on' : ''}`}>ללא אחראי</button>
          </div>
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className="label" htmlFor="due">עד מתי</label>
            <input id="due" type="date" className="field num" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="label" htmlFor="est">עלות משוערת</label>
            <div className="flex gap-1.5">
              <input id="est" className="field num flex-1 text-left" dir="ltr" inputMode="decimal" value={est}
                     onChange={(e) => setEst(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
              <button onClick={() => setPickCur(true)} className="field w-[62px] shrink-0 px-0 text-center text-sm font-bold">
                {CURRENCY_BY_CODE[currency]?.symbol ?? currency}
              </button>
            </div>
          </div>
        </div>

        <button onClick={() => setBillable(!billable)}
                className="flex w-full items-center gap-3 rounded-[13px] p-3.5 text-right"
                style={{ background: 'var(--surface-2)' }}>
          <span className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md text-xs text-white"
                style={{ background: billable ? 'var(--brand)' : 'transparent', border: billable ? 'none' : '1.5px solid var(--line)' }}>
            {billable ? '✓' : ''}
          </span>
          <span className="flex-1 text-[13px]">
            <b>כולם משתתפים בעלות</b>
            <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: 'var(--fg-faint)' }}>
              {billable ? 'כשתסמנו שבוצע, ייווצר חיוב משותף אוטומטית' : 'ההוצאה תירשם רק על מי שביצע'}
            </span>
          </span>
        </button>

        <div>
          <label className="label" htmlFor="tn">הערות</label>
          <textarea id="tn" className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="לא חובה" />
        </div>
      </Sheet>

      <Sheet open={pickCur} onClose={() => setPickCur(false)} title="מטבע">
        <SearchPicker items={orderedCurrencies()} placeholder="חיפוש מטבע — שם, קוד או סימן"
                      filter={(c, q) => searchCurrencies(q).includes(c)}
                      render={(c) => (<>
                        <span className="w-10 text-lg font-bold">{c.symbol}</span>
                        <span className="flex-1">{c.he}</span>
                        <span className="num text-xs" style={{ color: 'var(--fg-faint)' }}>{c.code}</span></>)}
                      onPick={(c) => { setCurrency(c.code); setPickCur(false); }} />
      </Sheet>
    </>
  );
}
