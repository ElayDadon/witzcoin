'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CURRENCY_BY_CODE, orderedCurrencies, searchCurrencies } from '@/lib/currencies';
import { orderedCountries, searchCountries, COUNTRY_BY_CODE, type Country } from '@/lib/countries';
import { CATEGORY_PALETTE, CATEGORY_EMOJIS, keyFromLabel, pickable } from '@/lib/categories';
import { formatPhone } from '@/lib/auth';
import { Avatar, Sheet, SearchPicker, toast } from '@/components/ui';
import type { TripData } from '@/app/trips/[id]/page';

/** Everything about a trip that can be changed after it was created. */
export default function TripSettingsSheet({ open, onClose, data, onChanged }: {
  open: boolean; onClose: () => void; data: TripData; onChanged: () => void;
}) {
  const router = useRouter();
  const { trip, members, categories, expenses, meId } = data;

  const [name, setName] = useState(trip.name);
  const [emoji, setEmoji] = useState(trip.emoji);
  const [country, setCountry] = useState<Country | null>(COUNTRY_BY_CODE[trip.country_code] ?? null);
  const [base, setBase] = useState(trip.base_currency);
  const [spend, setSpend] = useState(trip.trip_currency);
  const [budget, setBudget] = useState(trip.budget != null ? String(trip.budget) : '');
  const [start, setStart] = useState(trip.start_date ?? '');
  const [end, setEnd] = useState(trip.end_date ?? '');
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏷️');
  const [picking, setPicking] = useState<null | 'base' | 'spend' | 'country' | 'emoji'>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(trip.name); setEmoji(trip.emoji);
    setCountry(COUNTRY_BY_CODE[trip.country_code] ?? null);
    setBase(trip.base_currency); setSpend(trip.trip_currency);
    setBudget(trip.budget != null ? String(trip.budget) : '');
    setStart(trip.start_date ?? ''); setEnd(trip.end_date ?? '');
  }, [open, trip]);

  const visible = pickable(categories);

  async function addCategory() {
    const label = newLabel.trim();
    if (!label) { toast('צריך שם לקטגוריה', 'err'); return; }
    if (visible.some((c) => c.label === label)) { toast('כבר קיימת קטגוריה בשם הזה', 'err'); return; }
    const { error } = await supabase().from('trip_categories').insert({
      trip_id: trip.id,
      key: keyFromLabel(label),
      label,
      emoji: newEmoji || '🏷️',
      color: CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length],
      sort_order: (categories.at(-1)?.sort_order ?? 0) + 1,
    });
    if (error) { toast('ההוספה נכשלה', 'err'); return; }
    setNewLabel(''); setNewEmoji('🏷️');
    onChanged();
  }

  async function removeCategory(id: string, key: string, label: string) {
    const used = expenses.some((e) => e.category === key);
    const { error } = await supabase().rpc('remove_category', { p_id: id });
    if (error) { toast('ההסרה נכשלה', 'err'); return; }
    toast(used ? `"${label}" ירדה מהרשימה — ההוצאות הקיימות נשארו` : `"${label}" נמחקה`);
    onChanged();
  }

  async function save() {
    if (!name.trim()) { toast('צריך שם לטיול', 'err'); return; }
    setBusy(true);
    const { error } = await supabase().from('trips').update({
      name: name.trim(),
      emoji,
      country_code: country?.code ?? trip.country_code,
      country_name: country?.he ?? trip.country_name,
      base_currency: base,
      trip_currency: spend,
      budget: budget ? Number(budget) : null,
      start_date: start || null,
      end_date: end || null,
    }).eq('id', trip.id);
    setBusy(false);
    if (error) { toast('השמירה נכשלה', 'err'); return; }
    onClose(); onChanged();
    toast('ההגדרות נשמרו');
  }

  async function leave() {
    await supabase().from('trip_members').delete().eq('trip_id', trip.id).eq('user_id', meId);
    router.replace('/trips');
  }

  const baseChanged = base !== trip.base_currency;

  return (
    <>
      <Sheet open={open} onClose={onClose} title="הגדרות הטיול"
             footer={<button className="btn btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>}>
        <div>
          <label className="label" htmlFor="tname">שם הטיול</label>
          <div className="flex gap-2">
            <button onClick={() => setPicking('emoji')} className="field w-[58px] shrink-0 text-center text-xl">{emoji}</button>
            <input id="tname" className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div>
          <span className="label">יעד</span>
          <button onClick={() => setPicking('country')} className="field flex items-center justify-between text-right">
            <span>{country ? `${country.flag} ${country.he}` : trip.country_name}</span>
            <span style={{ color: 'var(--fg-faint)' }}>▾</span>
          </button>
        </div>

        <div className="flex gap-2.5">
          <div className="min-w-0 flex-1">
            <span className="label">מטבע ההתחשבנות</span>
            <button onClick={() => setPicking('base')} className="field truncate text-right">
              {CURRENCY_BY_CODE[base]?.symbol} {base}
            </button>
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: 'var(--fg-faint)' }}>
              המטבע שבו מוצגים כל הסכומים והחובות
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <span className="label">מטבע ביעד</span>
            <button onClick={() => setPicking('spend')} className="field truncate text-right">
              {CURRENCY_BY_CODE[spend]?.symbol} {spend}
            </button>
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: 'var(--fg-faint)' }}>
              ברירת המחדל בטופס הוצאה חדשה
            </p>
          </div>
        </div>

        {baseChanged && expenses.length > 0 && (
          <p className="rounded-xl p-3 text-[12px] leading-relaxed"
             style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
            שינוי מטבע ההתחשבנות משנה רק את התצוגה של הוצאות קיימות — הסכום שנשמר עליהן נשאר כפי שהיה.
            אם כבר נרשמו הוצאות, עדיף לשנות את זה לפני שמתחילים.
          </p>
        )}

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className="label" htmlFor="st">מתאריך</label>
            <input id="st" type="date" className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="label" htmlFor="en">עד תאריך</label>
            <input id="en" type="date" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="bud">תקציב כולל לקבוצה</label>
          <input id="bud" className="field num text-left" dir="ltr" inputMode="decimal" value={budget}
                 onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`0 ${base}`} />
          <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
            אפשר להשאיר ריק — אז פשוט לא נציג פס תקציב.
          </p>
        </div>

        {/* categories */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="label mb-0">קטגוריות</span>
            <span className="text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>{visible.length} קטגוריות</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {visible.map((c) => (
              <span key={c.id} className="chip gap-2" style={{ padding: '5px 5px 5px 13px' }}>
                {c.emoji} {c.label}
                <button onClick={() => removeCategory(c.id, c.key, c.label)} aria-label={`הסרת ${c.label}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[15px] leading-none"
                        style={{ background: 'var(--line)', color: 'var(--fg-dim)' }}>×</button>
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => setPicking('emoji')} className="field w-[56px] shrink-0 text-center text-lg">{newEmoji}</button>
            <input className="field flex-1" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                   placeholder="שם קטגוריה חדשה" />
            <button className="btn btn-ghost shrink-0 px-4" onClick={addCategory}>הוספה</button>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: 'var(--fg-faint)' }}>
            קטגוריה שכבר יש עליה הוצאות לא נמחקת — היא רק יורדת מרשימת הבחירה, וההוצאות הישנות ממשיכות להציג אותה.
          </p>
        </div>

        {/* members */}
        <div>
          <span className="label">משתתפים</span>
          <div className="flex flex-col gap-2.5">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2.5">
                <Avatar name={m.profile.name} color={m.profile.avatar_color} size={32} />
                <span className="flex-1 truncate text-[13px] font-semibold">
                  {m.profile.name}
                  {m.user_id === meId && <span className="ms-1.5 text-[11.5px] font-normal" style={{ color: 'var(--fg-faint)' }}>(אתה)</span>}
                </span>
                <span className="num text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>{formatPhone(m.profile.phone)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[13px] p-4 text-center" style={{ background: 'var(--surface-2)' }}>
            <p className="ptitle">קוד הזמנה</p>
            <p className="num mt-1 text-[25px] font-extrabold tracking-[0.22em]" style={{ color: 'var(--brand)' }}>{trip.invite_code}</p>
            <button className="mt-1 text-[13px] font-bold" style={{ color: 'var(--brand)' }}
                    onClick={() => { void navigator.clipboard.writeText(trip.invite_code); toast('הקוד הועתק'); }}>
              העתקת הקוד
            </button>
          </div>
        </div>

        <button className="btn btn-ghost w-full text-[13px]" style={{ color: 'var(--neg)' }} onClick={leave}>
          יציאה מהטיול
        </button>
      </Sheet>

      <Sheet open={picking === 'base' || picking === 'spend'} onClose={() => setPicking(null)} title="בחירת מטבע">
        <SearchPicker items={orderedCurrencies()} placeholder="חיפוש מטבע — שם, קוד או סימן"
                      filter={(c, q) => searchCurrencies(q).includes(c)}
                      render={(c) => (<>
                        <span className="w-10 text-lg font-bold">{c.symbol}</span>
                        <span className="flex-1">{c.he}</span>
                        <span className="num text-xs" style={{ color: 'var(--fg-faint)' }}>{c.code}</span></>)}
                      onPick={(c) => { picking === 'base' ? setBase(c.code) : setSpend(c.code); setPicking(null); }} />
      </Sheet>

      <Sheet open={picking === 'country'} onClose={() => setPicking(null)} title="לאן נוסעים?">
        <SearchPicker items={orderedCountries()} placeholder="חיפוש מדינה…"
                      filter={(c, q) => searchCountries(q).includes(c)}
                      render={(c) => (<>
                        <span className="text-2xl">{c.flag}</span>
                        <span className="flex-1 font-medium">{c.he}</span>
                        <span className="num text-xs" style={{ color: 'var(--fg-faint)' }}>{c.currency}</span></>)}
                      onPick={(c) => { setCountry(c); setSpend(c.currency); setPicking(null); }} />
      </Sheet>

      <Sheet open={picking === 'emoji'} onClose={() => setPicking(null)} title="בחירת אייקון">
        <div className="grid grid-cols-6 gap-2">
          {['✈️','🏖️','🏔️','🎒','🏝️','🗼','🍜','🚐','🎿','🏛️','🕌','🌋', ...CATEGORY_EMOJIS].map((e, i) => (
            <button key={`${e}-${i}`} onClick={() => { if (newLabel) setNewEmoji(e); else setEmoji(e); setPicking(null); }}
                    className="grid h-12 place-items-center rounded-xl text-2xl" style={{ background: 'var(--surface-2)' }}>
              {e}
            </button>
          ))}
        </div>
        <p className="text-[11.5px]" style={{ color: 'var(--fg-faint)' }}>
          {newLabel ? 'האייקון ישמש לקטגוריה החדשה.' : 'האייקון מופיע לצד שם הטיול.'}
        </p>
      </Sheet>
    </>
  );
}
