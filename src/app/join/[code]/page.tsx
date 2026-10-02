'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Toaster, toast, Spinner } from '@/components/ui';

type Preview = { id: string; name: string; country_name: string; emoji: string; member_count: number };

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Preview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase().rpc('trip_by_invite', { p_code: code });
      const t = Array.isArray(data) ? data[0] : data;
      if (!t) { setState('missing'); return; }
      setTrip(t as Preview);
      setState('ready');
    })();
  }, [code]);

  async function join() {
    const { data: auth } = await supabase().auth.getSession();
    if (!auth.session) {
      sessionStorage.setItem('witzcoin.pendingInvite', code);
      router.push('/');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase().rpc('join_trip', { p_code: code });
    setBusy(false);
    if (error || !data) { toast('ההצטרפות נכשלה', 'err'); return; }
    router.replace(`/trips/${data}`);
  }

  if (state === 'loading') return <main className="min-h-dvh"><Spinner /></main>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <Toaster />
      {state === 'missing' ? (
        <div className="panel p-8 text-center">
          <div className="mb-3 text-4xl">🤷</div>
          <h1 className="text-lg font-bold">הקוד לא נמצא</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--fg-dim)' }}>יכול להיות שהטיול נסגר, או שהקוד הועתק חלקית.</p>
          <button className="btn btn-ghost mt-5 w-full" onClick={() => router.push('/trips')}>לטיולים שלי</button>
        </div>
      ) : (
        <div className="panel p-8 text-center rise">
          <div className="mb-3 text-5xl">{trip!.emoji}</div>
          <p className="text-sm" style={{ color: 'var(--fg-dim)' }}>הוזמנת לטיול</p>
          <h1 className="mt-1 text-2xl font-extrabold">{trip!.name}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--fg-dim)' }}>
            {trip!.country_name} · {trip!.member_count} משתתפים
          </p>
          <button className="btn btn-primary mt-6 w-full" onClick={join} disabled={busy}>
            {busy ? 'מצטרף…' : 'הצטרף לטיול'}
          </button>
        </div>
      )}
    </main>
  );
}
