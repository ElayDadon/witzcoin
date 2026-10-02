'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Expense, Member, Profile, Settlement, Task, Trip, TripCategory } from '@/lib/types';
import { DEFAULT_CATEGORIES } from '@/lib/categories';
import { Toaster, Spinner, Sheet, Icon, toast } from '@/components/ui';
import TripHeader from '@/components/trip/TripHeader';
import HomeTab from '@/components/trip/HomeTab';
import ExpensesTab from '@/components/trip/ExpensesTab';
import TasksTab from '@/components/trip/TasksTab';
import BalancesTab from '@/components/trip/BalancesTab';
import AddExpenseSheet from '@/components/trip/AddExpenseSheet';
import TaskSheet from '@/components/trip/TaskSheet';

export type TripData = {
  trip: Trip;
  members: (Member & { profile: Profile })[];
  categories: TripCategory[];
  expenses: Expense[];
  tasks: Task[];
  settlements: Settlement[];
  meId: string;
};

export type TabKey = 'home' | 'expenses' | 'tasks' | 'balance';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'home',     label: 'בית',    icon: 'home' },
  { key: 'expenses', label: 'הוצאות', icon: 'receipt' },
  { key: 'tasks',    label: 'משימות', icon: 'check' },
  { key: 'balance',  label: 'מאזן',   icon: 'scale' },
];

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<TripData | null>(null);
  const [tab, setTab] = useState<TabKey>('home');
  const [loading, setLoading] = useState(true);
  const [chooser, setChooser] = useState(false);
  const [addExpense, setAddExpense] = useState(false);
  const [addTask, setAddTask] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase().auth.getUser();
    if (!auth.user) { router.replace('/'); return; }

    const { data: trip, error } = await supabase().from('trips').select('*').eq('id', id).single();
    if (error || !trip) { toast('הטיול לא נמצא', 'err'); router.replace('/trips'); return; }

    const [{ data: memberRows }, { data: categories }, { data: expenses }, { data: tasks }, { data: settlements }] =
      await Promise.all([
        supabase().from('trip_members').select('trip_id, user_id, role').eq('trip_id', id),
        supabase().from('trip_categories').select('*').eq('trip_id', id).order('sort_order'),
        supabase().from('expenses').select('*, expense_shares(*)').eq('trip_id', id).order('spent_at', { ascending: false }),
        supabase().from('tasks').select('*').eq('trip_id', id).order('created_at', { ascending: false }),
        supabase().from('settlements').select('*').eq('trip_id', id).order('settled_at', { ascending: false }),
      ]);

    const ids = (memberRows ?? []).map((m) => m.user_id);
    const { data: profiles } = await supabase().from('profiles').select('*')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

    setData({
      trip: trip as Trip,
      members: (memberRows ?? []).map((m) => ({ ...(m as Member), profile: byId.get(m.user_id)! })).filter((m) => m.profile),
      // Fall back to the defaults if the categories migration hasn't been run yet.
      categories: (categories?.length ? categories : DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `d${i}`, trip_id: id }))) as TripCategory[],
      expenses: (expenses ?? []) as Expense[],
      tasks: (tasks ?? []) as Task[],
      settlements: (settlements ?? []) as Settlement[],
      meId: auth.user.id,
    });
    setLoading(false);
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  // Live updates: a friend adding an expense refreshes everyone's screen.
  useEffect(() => {
    const ch = supabase().channel(`trip:${id}`);
    for (const table of ['expenses', 'tasks', 'settlements', 'trip_members', 'trip_categories', 'trips']) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'trips' ? `id=eq.${id}` : `trip_id=eq.${id}` },
        () => void load());
    }
    ch.subscribe();
    return () => { void supabase().removeChannel(ch); };
  }, [id, load]);

  if (loading || !data) return <main className="min-h-dvh"><Toaster /><Spinner label="טוען את הטיול…" /></main>;

  return (
    <main className="mx-auto w-full max-w-[460px] px-4" style={{ paddingBottom: 124 }}>
      <Toaster />
      <TripHeader data={data} onChanged={load} />

      <div className="rise">
        {tab === 'home'     && <HomeTab data={data} onJump={setTab} />}
        {tab === 'expenses' && <ExpensesTab data={data} onChanged={load} />}
        {tab === 'tasks'    && <TasksTab data={data} onChanged={load} onAdd={() => setAddTask(true)} />}
        {tab === 'balance'  && <BalancesTab data={data} onChanged={load} />}
      </div>

      {/* Bottom bar — the raised + in the middle is how anything gets added. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 backdrop-blur-xl"
           style={{ borderTop: '1px solid var(--line)', background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-auto flex max-w-[460px] items-end">
          {TABS.map((t, i) => (
            <Slot key={t.key} t={t} active={tab === t.key} onClick={() => setTab(t.key)} plusBefore={i === 2} onPlus={() => setChooser(true)} />
          ))}
        </div>
      </nav>

      <Sheet open={chooser} onClose={() => setChooser(false)} title="מה להוסיף?">
        <Choice emoji="🧾" title="הוצאה" soft
                hint="משהו שכבר שילמתם עליו, ומתחלק בין המשתתפים"
                onClick={() => { setChooser(false); setAddExpense(true); }} />
        <Choice emoji="✅" title="משימה"
                hint="משהו שמישהו צריך לעשות — ההוצאה תירשם כשתסמנו שבוצע"
                onClick={() => { setChooser(false); setAddTask(true); }} />
      </Sheet>

      <AddExpenseSheet open={addExpense} onClose={() => setAddExpense(false)} data={data} onSaved={load} />
      <TaskSheet open={addTask} task={null} data={data} onClose={() => setAddTask(false)} onSaved={load} />
    </main>
  );
}

function Slot({ t, active, onClick, plusBefore, onPlus }: {
  t: { key: TabKey; label: string; icon: string };
  active: boolean; onClick: () => void; plusBefore: boolean; onPlus: () => void;
}) {
  const tab = (
    <button onClick={onClick} aria-selected={active} role="tab"
            className="flex flex-1 flex-col items-center gap-[3px] py-[9px] text-[10.5px] font-bold transition"
            style={{ color: active ? 'var(--brand)' : 'var(--fg-faint)' }}>
      <Icon name={t.icon} size={21} />
      {t.label}
    </button>
  );
  if (!plusBefore) return tab;
  return (
    <>
      <span className="flex flex-1 items-start justify-center">
        <button onClick={onPlus} aria-label="הוספה"
                className="grid h-[52px] w-[52px] place-items-center rounded-full text-white transition active:scale-[.93]"
                style={{ marginTop: -20, background: 'var(--brand)', border: '4px solid var(--bg)',
                         boxShadow: '0 6px 18px -4px rgba(14,124,113,.55)' }}>
          <Icon name="plus" size={26} width={2.2} />
        </button>
      </span>
      {tab}
    </>
  );
}

function Choice({ emoji, title, hint, onClick, soft }: {
  emoji: string; title: string; hint: string; onClick: () => void; soft?: boolean;
}) {
  return (
    <button onClick={onClick} className="panel flex w-full items-center gap-3.5 p-[18px] text-right transition active:scale-[.99]">
      <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] text-[22px]"
            style={{ background: soft ? 'var(--brand-soft)' : 'var(--surface-2)' }}>{emoji}</span>
      <span className="flex-1">
        <b className="text-[15.5px]">{title}</b>
        <span className="mt-0.5 block text-[13px] leading-relaxed" style={{ color: 'var(--fg-faint)' }}>{hint}</span>
      </span>
    </button>
  );
}
