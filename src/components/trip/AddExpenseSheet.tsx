'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { pickable } from '@/lib/categories';
import { CURRENCY_BY_CODE, currencyDigits, orderedCurrencies, searchCurrencies } from '@/lib/currencies';
import { getRate } from '@/lib/fx';
import { money } from '@/lib/format';
import { resolveSplit } from '@/lib/balances';
import { notify } from '@/lib/push-client';
import { Avatar, Sheet, SearchPicker, toast } from '@/components/ui';
import type { TripData } from '@/app/trips/[id]/page';
import type { Expense } from '@/lib/types';

type Props = { open: boolean; onClose: () => void; data: TripData; onSaved: () => void; editing?: Expense | null };

export default function AddExpenseSheet({ open, onClose, data, onSaved, editing }: Props) {
  const { trip, members, categories, meId } = data;
  const cats = pickable(categories);
  const baseDigits = currencyDigits(trip.base_currency);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(trip.trip_currency);
  const [rate, setRate] = useState(1);
  const [rateState, setRateState] = useState<'ok' | 'loading' | 'manual'>('ok');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState(cats[0]?.key ?? 'other');
  const [payer, setPayer] = useState(meId);
  const [participants, setParticipants] = useState<string[]>(members.map((m) => m.user_id));
  const [splitMode, setSplitMode] = useState<'equal' | 'percent' | 'exact'>('equal');
  // Only the rows the person actually typed into. Everyone else shares the rest,
  // which is what makes the last row fill itself in.
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<{ file: File; preview: string } | null>(null);
  const [existingReceipt, setExistingReceipt] = useState<string | null>(null);
  const [pickCurrency, setPickCurrency] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setAmount(String(editing.amount));
      setCurrency(editing.currency);
      setRate(Number(editing.fx_rate));
      setDesc(editing.description);
      setCat(editing.category);
      setPayer(editing.payer_id);
      setParticipants((editing.expense_shares ?? []).map((s) => s.user_id));
      const mode = editing.split_mode === 'exact' ? 'exact' : editing.split_mode === 'percent' ? 'percent' : 'equal';
      setSplitMode(mode);
      const totalBase = Number(editing.amount_base) || 0;
      setEntered(Object.fromEntries((editing.expense_shares ?? []).map((sh) => [
        sh.user_id,
        mode === 'percent' && totalBase > 0
          ? String(Math.round((Number(sh.amount_base) / totalBase) * 1000) / 10)
          : String(sh.amount_base),
      ])));
      setWhen(new Date(editing.spent_at).toISOString().slice(0, 16));
      setNote(editing.note ?? '');
      setExistingReceipt(editing.receipt_path);
      setReceipt(null);
    } else {
      setAmount(''); setCurrency(trip.trip_currency); setDesc('');
      setCat(cats[0]?.key ?? 'other'); setPayer(meId);
      setParticipants(members.map((m) => m.user_id));
      setSplitMode('equal'); setEntered({}); setNote('');
      setWhen(new Date().toISOString().slice(0, 16));
      setReceipt(null); setExistingReceipt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  /* Keep the rate in step with the chosen currency. */
  useEffect(() => {
    if (!open) return;
    if (currency === trip.base_currency) { setRate(1); setRateState('ok'); return; }
    if (editing && currency === editing.currency) { setRateState('ok'); return; } // keep the historical rate
    setRateState('loading');
    getRate(currency, trip.base_currency).then((r) => {
      if (r) { setRate(r); setRateState('ok'); }
      else { setRateState('manual'); }   // not covered by the rates feed — the field below is editable
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, trip.base_currency, open]);

  const amountNum = Number(amount) || 0;
  const scale = 10 ** baseDigits;
  const baseTotal = Math.round(amountNum * rate * scale) / scale;

  // Live preview of the split, recomputed on every keystroke.
  const enteredNums = Object.fromEntries(
    Object.entries(entered)
      .filter(([id, v]) => participants.includes(id) && v.trim() !== '' && !Number.isNaN(Number(v)))
      .map(([id, v]) => [id, Number(v)])
  );
  const split = resolveSplit({ mode: splitMode, participants, entered: enteredNums, total: baseTotal, digits: baseDigits });

  /** Puts whatever is missing onto one person, so the split closes in one tap. */
  function completeWith(id: string) {
    const current = Number(entered[id] ?? 0) || 0;
    const add = splitMode === 'percent'
      ? (baseTotal > 0 ? (split.gap / baseTotal) * 100 : 0)
      : split.gap;
    const next = Math.round((current + add) * 100) / 100;
    setEntered((e) => ({ ...e, [id]: String(next) }));
  }

  async function pickReceipt(file: File) {
    if (file.size > 12 * 1024 * 1024) { toast('הקובץ גדול מדי', 'err'); return; }
    if (file.type === 'application/pdf') { setReceipt({ file, preview: '' }); return; }
    const compressed = await compressImage(file);
    setReceipt({ file: compressed, preview: URL.createObjectURL(compressed) });
  }

  async function save() {
    if (amountNum <= 0) { toast('צריך למלא סכום', 'err'); return; }
    if (!desc.trim()) { toast('צריך לכתוב על מה', 'err'); return; }
    if (participants.length === 0) { toast('צריך לבחור מי משתתף', 'err'); return; }

    if (!split.complete) {
      toast(split.gap > 0
        ? `חסרים ${money(split.gap, trip.base_currency)} מהחלוקה`
        : `החלוקה גבוהה ב-${money(-split.gap, trip.base_currency)} מהסכום`, 'err');
      return;
    }
    const shares = split.amounts;

    setBusy(true);
    const expenseId = editing?.id ?? crypto.randomUUID();

    // Upload the receipt first — a failed upload shouldn't leave a half-saved expense.
    let receiptPath = existingReceipt;
    if (receipt) {
      const ext = receipt.file.type === 'application/pdf' ? 'pdf' : 'jpg';
      const path = `${trip.id}/${expenseId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase().storage.from('receipts').upload(path, receipt.file, {
        contentType: receipt.file.type || 'image/jpeg', upsert: true,
      });
      if (upErr) { setBusy(false); toast('העלאת הקבלה נכשלה', 'err'); return; }
      receiptPath = path;
    }

    const row = {
      id: expenseId, trip_id: trip.id, payer_id: payer,
      description: desc.trim(), category: cat,
      amount: amountNum, currency, fx_rate: rate, amount_base: baseTotal,
      split_mode: splitMode, spent_at: new Date(when).toISOString(),
      note: note.trim() || null, receipt_path: receiptPath, created_by: meId,
    };

    const { error } = editing
      ? await supabase().from('expenses').update(row).eq('id', expenseId)
      : await supabase().from('expenses').insert(row);
    if (error) { setBusy(false); toast('השמירה נכשלה', 'err'); return; }

    await supabase().from('expense_shares').delete().eq('expense_id', expenseId);
    await supabase().from('expense_shares').insert(
      Object.entries(shares).map(([user_id, amount_base]) => ({ expense_id: expenseId, user_id, amount_base }))
    );

    if (!editing) {
      const payerName = members.find((m) => m.user_id === payer)?.profile.name ?? 'מישהו';
      void notify({
        userIds: participants.filter((id) => id !== meId),
        tripId: trip.id, type: 'expense',
        title: `${trip.emoji} ${trip.name}`,
        body: `${payerName} הוסיף "${desc.trim()}" — ${money(baseTotal, trip.base_currency)}`,
        url: `/trips/${trip.id}`,
      });
    }

    setBusy(false);
    onClose(); onSaved();
    toast(editing ? 'ההוצאה עודכנה' : 'ההוצאה נוספה');
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={editing ? 'עריכת הוצאה' : 'הוצאה חדשה'}
             footer={
               <button className="btn btn-primary w-full" onClick={save} disabled={busy}>
                 {busy ? 'שומר…' : editing ? 'שמירת השינויים' : 'הוספת ההוצאה'}
               </button>
             }>
        {/* amount */}
        <div>
          <label className="label" htmlFor="amt">כמה זה עלה?</label>
          <div className="flex gap-2">
            <input id="amt" className="field num flex-1 text-left text-[21px] font-bold" inputMode="decimal" dir="ltr" autoFocus
                   value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
            <button onClick={() => setPickCurrency(true)} className="field w-[104px] shrink-0 text-center font-bold">
              {CURRENCY_BY_CODE[currency]?.symbol ?? ''} {currency}
            </button>
          </div>
          {currency !== trip.base_currency && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
              <span className="num">
                = <b>{money(baseTotal, trip.base_currency)}</b>{rateState === 'loading' && ' …'}
              </span>
              <span>·</span>
              <label className="flex items-center gap-1.5">
                שער
                <input className="num w-[88px] rounded-md px-1.5 py-0.5 text-center" dir="ltr" inputMode="decimal"
                       style={{ background: 'var(--surface-2)', border: `1px solid ${rateState === 'manual' ? 'var(--accent)' : 'transparent'}` }}
                       value={rate} onChange={(e) => { setRate(Number(e.target.value) || 0); setRateState('ok'); }} />
              </label>
              {rateState === 'manual' && (
                <span style={{ color: 'var(--accent)' }}>אין שער אוטומטי ל-{currency} — הזינו ידנית</span>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="desc">על מה?</label>
          <input id="desc" className="field" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ארוחת ערב בטברנה" />
        </div>

        <div>
          <span className="label">קטגוריה</span>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button key={c.key} onClick={() => setCat(c.key)} className="chip"
                      style={cat === c.key ? { background: c.color, color: '#fff' } : undefined}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* receipt */}
        <div>
          <span className="label">קבלה</span>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickReceipt(f); e.target.value = ''; }} />
          {receipt?.preview || existingReceipt ? (
            <div className="relative overflow-hidden rounded-[13px]" style={{ border: '1px solid var(--line)' }}>
              {receipt?.preview
                ? <img src={receipt.preview} alt="קבלה" className="max-h-56 w-full object-cover" />
                : <ReceiptThumb path={existingReceipt!} />}
              <button onClick={() => { setReceipt(null); setExistingReceipt(null); }} aria-label="הסרת הקבלה"
                      className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">×</button>
            </div>
          ) : receipt ? (
            <div className="flex items-center gap-2 rounded-[13px] p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
              📄 {receipt.file.name}
              <button className="ms-auto" onClick={() => setReceipt(null)} style={{ color: 'var(--neg)' }}>הסרה</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-[13px] py-4 text-sm font-bold"
                    style={{ background: 'var(--surface-2)', border: '1px dashed var(--line)', color: 'var(--fg-faint)' }}>
              📷 צילום או העלאה
            </button>
          )}
        </div>

        <div>
          <span className="label">מי שילם?</span>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button key={m.user_id} onClick={() => setPayer(m.user_id)} className={`chip ${payer === m.user_id ? 'chip-on' : ''}`}>
                <Avatar name={m.profile.name} color={payer === m.user_id ? 'rgba(255,255,255,.25)' : m.profile.avatar_color} size={18} />
                {m.user_id === meId ? 'אני' : m.profile.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* split */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="label mb-0">מתחלק בין</span>
            <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }}>
              {([['equal', 'שווה'], ['percent', 'אחוזים'], ['exact', 'סכומים']] as const).map(([m, label]) => (
                <button key={m} onClick={() => { setSplitMode(m); setEntered({}); }}
                        className="rounded-md px-2.5 py-1 text-[11.5px] font-bold transition"
                        style={splitMode === m ? { background: 'var(--surface)', color: 'var(--fg)' } : { color: 'var(--fg-faint)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {splitMode !== 'equal' && (
            <p className="mb-2 text-[11.5px] leading-relaxed" style={{ color: 'var(--fg-faint)' }}>
              {splitMode === 'percent'
                ? 'מלאו אחוז למי שצריך — מי שנשאר ריק מתחלק באופן אוטומטי בשאר.'
                : 'מלאו סכום למי שצריך — מי שנשאר ריק מתחלק באופן אוטומטי בשאר.'}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {members.map((m) => {
              const on = participants.includes(m.user_id);
              const auto = entered[m.user_id] === undefined || entered[m.user_id].trim() === '';
              const autoValue = splitMode === 'percent'
                ? String(split.percents[m.user_id] ?? 0)
                : String(split.amounts[m.user_id] ?? 0);
              return (
                <div key={m.user_id} className="flex items-center gap-2 rounded-[13px] px-3 py-2.5"
                     style={{ background: 'var(--surface-2)', opacity: on ? 1 : 0.45 }}>
                  <button onClick={() => setParticipants((p) => on ? p.filter((x) => x !== m.user_id) : [...p, m.user_id])}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-right">
                    <span className="grid h-[19px] w-[19px] shrink-0 place-items-center rounded-md text-[11px] text-white"
                          style={{ background: on ? 'var(--brand)' : 'transparent', border: on ? 'none' : '1.5px solid var(--line)' }}>
                      {on ? '✓' : ''}
                    </span>
                    <Avatar name={m.profile.name} color={m.profile.avatar_color} size={25} />
                    <span className="truncate text-[13px] font-semibold">{m.user_id === meId ? 'אני' : m.profile.name.split(' ')[0]}</span>
                  </button>

                  {on && splitMode !== 'equal' && (
                    <span className="flex shrink-0 items-center gap-1">
                      <input className="num w-[58px] rounded-lg px-1.5 py-1 text-center text-[13px]" dir="ltr" inputMode="decimal"
                             aria-label={`החלק של ${m.profile.name}`}
                             style={{ background: 'var(--surface)',
                                      border: `1px solid ${auto ? 'var(--line)' : 'var(--brand)'}`,
                                      color: auto ? 'var(--fg-faint)' : 'var(--fg)' }}
                             value={entered[m.user_id] ?? ''} placeholder={amountNum ? autoValue : '0'}
                             onChange={(e) => setEntered((x) => ({ ...x, [m.user_id]: e.target.value.replace(/[^\d.]/g, '') }))} />
                      <span className="text-[11px]" style={{ color: 'var(--fg-faint)' }}>
                        {splitMode === 'percent' ? '%' : CURRENCY_BY_CODE[trip.base_currency]?.symbol ?? ''}
                      </span>
                    </span>
                  )}

                  {on && (
                    <span className="num shrink-0 text-left text-[12px] font-bold" style={{ width: 62, color: 'var(--fg-dim)' }}>
                      {!amountNum ? '—'
                        : splitMode === 'exact' ? `${split.percents[m.user_id] ?? 0}%`
                        : money(split.amounts[m.user_id] ?? 0, trip.base_currency)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* running total, and a one-tap way to close the gap */}
          {splitMode !== 'equal' && amountNum > 0 && participants.length > 0 && (
            <div className="mt-2 flex items-center gap-2 rounded-[13px] px-3 py-2.5 text-[12px]"
                 style={{
                   background: split.complete ? 'var(--brand-soft)' : 'color-mix(in srgb, var(--accent) 14%, transparent)',
                   color: split.complete ? 'var(--brand)' : 'var(--accent)',
                 }}>
              <span className="flex-1 font-semibold">
                {split.complete
                  ? <>✓ חולק במלואו · <span className="num">{money(baseTotal, trip.base_currency)}</span></>
                  : split.gap > 0
                    ? <>חסרים <span className="num">{money(split.gap, trip.base_currency)}</span>
                        {baseTotal > 0 && <> (<span className="num">{Math.round((split.gap / baseTotal) * 1000) / 10}%</span>)</>}</>
                    : <>עודף של <span className="num">{money(-split.gap, trip.base_currency)}</span></>}
              </span>
              {!split.complete && (
                <button className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-bold"
                        style={{ background: 'var(--surface)', color: 'var(--fg)' }}
                        onClick={() => completeWith(participants[participants.length - 1])}>
                  השלמה ל{(() => {
                    const last = participants[participants.length - 1];
                    return last === meId ? 'עצמי' : members.find((m) => m.user_id === last)?.profile.name.split(' ')[0] ?? '';
                  })()}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className="label" htmlFor="when">מתי</label>
            <input id="when" type="datetime-local" className="field num" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="label" htmlFor="note">הערה</label>
            <input id="note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="לא חובה" />
          </div>
        </div>
      </Sheet>

      <Sheet open={pickCurrency} onClose={() => setPickCurrency(false)} title="מטבע ההוצאה">
        <SearchPicker items={orderedCurrencies()} placeholder="חיפוש מטבע — שם, קוד או סימן"
                      filter={(c, q) => searchCurrencies(q).includes(c)}
                      render={(c) => (<>
                        <span className="w-10 text-lg font-bold">{c.symbol}</span>
                        <span className="flex-1">{c.he}</span>
                        <span className="num text-xs" style={{ color: 'var(--fg-faint)' }}>{c.code}</span></>)}
                      onPick={(c) => { setCurrency(c.code); setPickCurrency(false); }} />
      </Sheet>
    </>
  );
}

/* A 4MB camera shot becomes ~250KB — it matters on the 1GB free storage tier
   and on hotel wifi. */
async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.75));
    if (!blob) return file;
    return new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // HEIC or anything the browser can't decode — send it as-is
  }
}

export function ReceiptThumb({ path, className = 'max-h-56 w-full object-cover' }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase().storage.from('receipts').createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  if (!url) return <div className="h-32 w-full animate-pulse" style={{ background: 'var(--surface-2)' }} />;
  if (path.endsWith('.pdf')) return <a href={url} target="_blank" rel="noreferrer" className="block p-4 text-sm">📄 פתיחת הקבלה (PDF)</a>;
  return <img src={url} alt="קבלה" className={className} />;
}
