'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { orderedCountries, searchCountries, type Country } from '@/lib/countries';
import { orderedCurrencies, searchCurrencies, CURRENCY_BY_CODE } from '@/lib/currencies';
import { money, dateRange, tripStatus } from '@/lib/format';
import { formatPhone } from '@/lib/auth';
import { pushState, enablePush, isIOS, isStandalone } from '@/lib/push-client';
import type { Trip, Profile } from '@/lib/types';
import { Avatar, Sheet, SearchPicker, Toaster, toast, Spinner, Empty } from '@/components/ui';

type TripRow = Trip & { _spent?: number; _members?: number };

export default function TripsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase().auth.getUser();
    if (!auth.user) { router.replace('/'); return; }

    // Someone opened an invite link before signing up — finish the join now.
    const pending = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('witzcoin.pendingInvite') : null;
    if (pending) {
      sessionStorage.removeItem('witzcoin.pendingInvite');
      const { data: joined } = await supabase().rpc('join_trip', { p_code: pending });
      if (joined) { router.replace(`/trips/${joined}`); return; }
    }

    const [{ data: profile }, { data: memberRows }] = await Promise.all([
      supabase().from('profiles').select('*').eq('id', auth.user.id).single(),
      supabase().from('trip_members').select('trip_id').eq('user_id', auth.user.id),
    ]);
    setMe(profile as Profile);

    const ids = (memberRows ?? []).map((m) => m.trip_id);
    if (ids.length === 0) { setTrips([]); setLoading(false); return; }

    const [{ data: tripRows }, { data: expenses }, { data: members }] = await Promise.all([
      supabase().from('trips').select('*').in('id', ids).eq('archived', false).order('created_at', { ascending: false }),
      supabase().from('expenses').select('trip_id, amount_base').in('trip_id', ids),
      supabase().from('trip_members').select('trip_id').in('trip_id', ids),
    ]);

    const spent = new Map<string, number>();
    for (const e of expenses ?? []) spent.set(e.trip_id, (spent.get(e.trip_id) ?? 0) + Number(e.amount_base));
    const count = new Map<string, number>();
    for (const m of members ?? []) count.set(m.trip_id, (count.get(m.trip_id) ?? 0) + 1);

    setTrips((tripRows ?? []).map((t) => ({ ...(t as Trip), _spent: spent.get(t.id) ?? 0, _members: count.get(t.id) ?? 1 })));
    setLoading(false);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-5">
      <Toaster />

      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--fg-dim)' }}>שלום{me ? `, ${me.name.split(' ')[0]}` : ''} 👋</p>
          <h1 className="text-2xl font-extrabold tracking-tight">הטיולים שלי</h1>
        </div>
        <button onClick={() => setShowMenu(true)} aria-label="הגדרות" className="rounded-full">
          {me && <Avatar name={me.name} color={me.avatar_color} size={44} />}
        </button>
      </header>

      <PushBanner />

      {loading ? (
        <Spinner />
      ) : trips.length === 0 ? (
        <div className="panel">
          <Empty emoji="🧳" title="עדיין אין טיולים" hint="פתח טיול חדש או הצטרף לאחד עם קוד הזמנה." />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {trips.map((t) => <TripCard key={t.id} trip={t} onOpen={() => router.push(`/trips/${t.id}`)} />)}
        </div>
      )}

      {/* Sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur"
           style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
                    paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-lg gap-2 px-4 pt-3">
          <button className="btn btn-ghost flex-1" onClick={() => setShowJoin(true)}>הצטרפות עם קוד</button>
          <button className="btn btn-primary flex-[1.3]" onClick={() => setShowCreate(true)}>+ טיול חדש</button>
        </div>
      </div>

      <CreateTripSheet open={showCreate} onClose={() => setShowCreate(false)} onCreated={(id) => router.push(`/trips/${id}`)} />
      <JoinSheet open={showJoin} onClose={() => setShowJoin(false)} onJoined={(id) => router.push(`/trips/${id}`)} />
      <ProfileSheet open={showMenu} onClose={() => setShowMenu(false)} me={me} />
    </main>
  );
}

/* ------------------------------------------------------------------ cards */
function TripCard({ trip, onOpen }: { trip: TripRow; onOpen: () => void }) {
  const st = tripStatus(trip.start_date, trip.end_date);
  const pct = trip.budget ? Math.min((trip._spent ?? 0) / Number(trip.budget), 1) : 0;
  const over = trip.budget ? (trip._spent ?? 0) > Number(trip.budget) : false;
  return (
    <button onClick={onOpen} className="panel rise w-full p-4 text-right transition active:scale-[.99]">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: 'var(--surface-2)' }}>
          {trip.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold">{trip.name}</h3>
            {st.tone !== 'none' && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: st.tone === 'live' ? 'var(--brand-soft)' : 'var(--surface-2)',
                      color: st.tone === 'live' ? 'var(--brand)' : 'var(--fg-dim)',
                    }}>{st.label}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm" style={{ color: 'var(--fg-dim)' }}>
            {trip.country_name} · {dateRange(trip.start_date, trip.end_date)} · {trip._members} משתתפים
          </p>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="num text-lg font-extrabold">{money(trip._spent ?? 0, trip.base_currency)}</span>
            {trip.budget ? (
              <span className="num text-xs" style={{ color: over ? 'var(--neg)' : 'var(--fg-dim)' }}>
                מתוך {money(Number(trip.budget), trip.base_currency)}
              </span>
            ) : null}
          </div>
          {trip.budget ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${pct * 100}%`, background: over ? 'var(--neg)' : pct > 0.8 ? 'var(--accent)' : 'var(--brand)' }} />
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/* --------------------------------------------------------- push onboarding */
function PushBanner() {
  const [state, setState] = useState<string>('');
  useEffect(() => { setState(pushState()); }, []);
  if (state === 'granted' || state === '' || state === 'unsupported') return null;

  if (state === 'needs-install') {
    if (!isIOS() || isStandalone()) return null;
    return (
      <div className="panel mb-4 flex items-start gap-3 p-4" style={{ background: 'var(--brand-soft)' }}>
        <span className="text-xl">📲</span>
        <p className="text-sm leading-relaxed">
          כדי לקבל התראות באייפון: לחץ על <b>שיתוף</b> בסרגל של Safari ואז <b>הוספה למסך הבית</b>. פותחים משם — והכל עובד.
        </p>
      </div>
    );
  }
  return (
    <button
      onClick={async () => {
        const r = await enablePush();
        if (r.ok) { toast('התראות הופעלו'); setState('granted'); }
        else toast(r.reason === 'denied' ? 'ההתראות נחסמו בהגדרות הדפדפן' : 'לא הצלחנו להפעיל התראות', 'err');
      }}
      className="panel mb-4 flex w-full items-center gap-3 p-4 text-right">
      <span className="text-xl">🔔</span>
      <span className="flex-1 text-sm">הפעל התראות — שתדע מיד כשמישהו מוסיף הוצאה או מבקש כסף.</span>
      <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>הפעל</span>
    </button>
  );
}

/* ------------------------------------------------------------ create trip */
function CreateTripSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState<Country | null>(null);
  const [tripCurrency, setTripCurrency] = useState('EUR');
  const [baseCurrency, setBaseCurrency] = useState('ILS');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [budget, setBudget] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const [pickCountry, setPickCountry] = useState(false);
  const [pickCurrency, setPickCurrency] = useState<null | 'trip' | 'base'>(null);
  const [busy, setBusy] = useState(false);

  const EMOJIS = ['✈️','🏖️','🏔️','🎒','🏝️','🗼','🍜','🚐','🎿','🏛️'];

  async function create() {
    if (!name.trim()) { toast('צריך שם לטיול', 'err'); return; }
    if (!country) { toast('בחר יעד', 'err'); return; }
    setBusy(true);
    const { data: auth } = await supabase().auth.getUser();
    const { data, error } = await supabase().from('trips').insert({
      name: name.trim(),
      country_code: country.code,
      country_name: country.he,
      base_currency: baseCurrency,
      trip_currency: tripCurrency,
      start_date: start || null,
      end_date: end || null,
      budget: budget ? Number(budget) : null,
      emoji,
      created_by: auth.user!.id,
    }).select('id').single();

    if (error || !data) { setBusy(false); toast('לא הצלחנו ליצור את הטיול', 'err'); return; }
    await supabase().from('trip_members').insert({ trip_id: data.id, user_id: auth.user!.id, role: 'owner' });
    setBusy(false);
    onClose();
    onCreated(data.id);
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="טיול חדש"
             footer={<button className="btn btn-primary w-full" onClick={create} disabled={busy}>{busy ? 'יוצר…' : 'צור טיול'}</button>}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="label">שם הטיול</label>
            <div className="flex gap-2">
              <button onClick={() => setEmoji(EMOJIS[(EMOJIS.indexOf(emoji) + 1) % EMOJIS.length])}
                      className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl text-2xl"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>{emoji}</button>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="יוון עם החברים" />
            </div>
          </div>

          <div>
            <label className="label">יעד</label>
            <button onClick={() => setPickCountry(true)} className="field flex items-center justify-between text-right">
              <span>{country ? `${country.flag} ${country.he}` : 'בחר מדינה…'}</span>
              <span style={{ color: 'var(--fg-dim)' }}>▾</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">מטבע ביעד</label>
              <button onClick={() => setPickCurrency('trip')} className="field text-right">
                {CURRENCY_BY_CODE[tripCurrency]?.symbol} {tripCurrency}
              </button>
            </div>
            <div>
              <label className="label">מתחשבנים ב־</label>
              <button onClick={() => setPickCurrency('base')} className="field text-right">
                {CURRENCY_BY_CODE[baseCurrency]?.symbol} {baseCurrency}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">מתאריך</label>
              <input type="date" className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label">עד תאריך</label>
              <input type="date" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">תקציב כולל (לא חובה)</label>
            <input className="field num" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)}
                   placeholder={`0 ${baseCurrency}`} dir="ltr" />
            <p className="mt-1.5 text-xs" style={{ color: 'var(--fg-dim)' }}>
              התקציב של כל הקבוצה יחד. נציג לך כמה נשאר בכל רגע.
            </p>
          </div>
        </div>
      </Sheet>

      <Sheet open={pickCountry} onClose={() => setPickCountry(false)} title="לאן נוסעים?">
        <SearchPicker
          items={orderedCountries()}
          placeholder="חיפוש מדינה…"
          filter={(c, q) => searchCountries(q).includes(c)}
          render={(c) => (<><span className="text-2xl">{c.flag}</span><span className="flex-1 font-medium">{c.he}</span>
            <span className="text-xs" style={{ color: 'var(--fg-dim)' }}>{c.currency}</span></>)}
          onPick={(c) => { setCountry(c); setTripCurrency(c.currency); setPickCountry(false); }}
        />
      </Sheet>

      <Sheet open={pickCurrency !== null} onClose={() => setPickCurrency(null)} title="בחירת מטבע">
        <SearchPicker
          items={orderedCurrencies()}
          placeholder="חיפוש מטבע — שם, קוד או סימן"
          filter={(c, q) => searchCurrencies(q).includes(c)}
          render={(c) => (<><span className="w-10 text-lg font-bold">{c.symbol}</span>
            <span className="flex-1">{c.he}</span><span className="text-xs" style={{ color: 'var(--fg-dim)' }}>{c.code}</span></>)}
          onPick={(c) => { pickCurrency === 'trip' ? setTripCurrency(c.code) : setBaseCurrency(c.code); setPickCurrency(null); }}
        />
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------- join trip */
function JoinSheet({ open, onClose, onJoined }: { open: boolean; onClose: () => void; onJoined: (id: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function join() {
    if (code.trim().length < 4) { toast('קוד לא תקין', 'err'); return; }
    setBusy(true);
    const { data, error } = await supabase().rpc('join_trip', { p_code: code.trim() });
    setBusy(false);
    if (error || !data) { toast('קוד לא נמצא', 'err'); return; }
    onClose();
    onJoined(data as string);
  }
  return (
    <Sheet open={open} onClose={onClose} title="הצטרפות לטיול"
           footer={<button className="btn btn-primary w-full" onClick={join} disabled={busy}>{busy ? 'מצטרף…' : 'הצטרף'}</button>}>
      <label className="label">קוד הזמנה</label>
      <input className="field num text-center text-2xl font-bold tracking-[0.3em]" dir="ltr" value={code}
             onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 10))} placeholder="AB12CD3" autoFocus />
      <p className="mt-3 text-sm" style={{ color: 'var(--fg-dim)' }}>
        בקש מהחבר שפתח את הטיול את הקוד — הוא מופיע אצלו תחת "הזמנת חברים".
      </p>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- profile */
function ProfileSheet({ open, onClose, me }: { open: boolean; onClose: () => void; me: Profile | null }) {
  const router = useRouter();
  const [state, setState] = useState('');
  useEffect(() => { if (open) setState(pushState()); }, [open]);
  if (!me) return null;
  return (
    <Sheet open={open} onClose={onClose} title="החשבון שלי">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} color={me.avatar_color} size={56} />
          <div>
            <p className="text-lg font-bold">{me.name}</p>
            <p className="num text-sm" style={{ color: 'var(--fg-dim)' }}>{formatPhone(me.phone)}</p>
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">התראות</p>
              <p className="text-sm" style={{ color: 'var(--fg-dim)' }}>
                {state === 'granted' ? 'פעילות במכשיר הזה' : state === 'needs-install' ? 'צריך להוסיף למסך הבית' : 'כבויות'}
              </p>
            </div>
            {state !== 'granted' && (
              <button className="btn btn-ghost px-3 py-2 text-sm"
                      onClick={async () => { const r = await enablePush(); if (r.ok) { setState('granted'); toast('התראות הופעלו'); } else toast('לא הצלחנו להפעיל', 'err'); }}>
                הפעל
              </button>
            )}
          </div>
        </div>

        <button className="btn btn-ghost w-full" style={{ color: 'var(--neg)' }}
                onClick={async () => { await supabase().auth.signOut(); router.replace('/'); }}>
          התנתקות
        </button>
      </div>
    </Sheet>
  );
}
