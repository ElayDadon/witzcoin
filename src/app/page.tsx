'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { normalizePhone, formatPhone, phoneToEmail, isValidPin, colorForName, PIN_LENGTH } from '@/lib/auth';
import { Toaster, toast } from '@/components/ui';

type Step = 'phone' | 'pin' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [e164, setE164] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // Already signed in? Go straight to the trips list.
  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/trips');
      else setChecking(false);
    });
  }, [router]);

  async function continueWithPhone(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizePhone(phone);
    if (!n) { toast('מספר הטלפון לא תקין', 'err'); return; }
    setBusy(true);
    const { data, error } = await supabase().rpc('phone_exists', { p_phone: n });
    setBusy(false);
    if (error) { toast('שגיאת חיבור. נסה שוב', 'err'); return; }
    setE164(n);
    setStep(data ? 'pin' : 'register');
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin)) { toast(`הקוד צריך להיות ${PIN_LENGTH} ספרות`, 'err'); return; }
    setBusy(true);
    const { error } = await supabase().auth.signInWithPassword({ email: phoneToEmail(e164), password: pin });
    setBusy(false);
    if (error) { toast('קוד שגוי', 'err'); setPin(''); return; }
    router.replace('/trips');
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) { toast('צריך למלא שם', 'err'); return; }
    if (!isValidPin(pin)) { toast(`הקוד צריך להיות ${PIN_LENGTH} ספרות`, 'err'); return; }
    if (pin !== pin2) { toast('הקודים לא תואמים', 'err'); setPin2(''); return; }
    setBusy(true);
    const { error } = await supabase().auth.signUp({
      email: phoneToEmail(e164),
      password: pin,
      options: { data: { name: name.trim(), phone: e164, avatar_color: colorForName(name.trim()) } },
    });
    if (error) {
      setBusy(false);
      toast(error.message.includes('already') ? 'המספר כבר רשום — נסה להתחבר' : 'ההרשמה נכשלה', 'err');
      return;
    }
    // If e-mail confirmation is left on in Supabase, there is no session yet — sign in explicitly.
    const { data: s } = await supabase().auth.getSession();
    if (!s.session) {
      const { error: e2 } = await supabase().auth.signInWithPassword({ email: phoneToEmail(e164), password: pin });
      if (e2) {
        setBusy(false);
        toast('כבה "Confirm email" בהגדרות Supabase', 'err');
        return;
      }
    }
    setBusy(false);
    router.replace('/trips');
  }

  if (checking) {
    return <main className="grid min-h-dvh place-items-center"><div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-600 border-t-transparent" /></main>;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <Toaster />

      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl text-4xl shadow-lg"
             style={{ background: 'linear-gradient(160deg,#14b8a6,#115e59)' }}>🪙</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Witzcoin</h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--fg-dim)' }}>
          כל ההוצאות של הטיול במקום אחד — ומי חייב למי.
        </p>
      </header>

      <div className="panel p-6 rise">
        {step === 'phone' && (
          <form onSubmit={continueWithPhone} className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="phone">מספר טלפון</label>
              <input id="phone" className="field num text-lg" value={phone} onChange={(e) => setPhone(e.target.value)}
                     placeholder="050-123-4567" inputMode="tel" autoComplete="tel" dir="ltr" autoFocus />
              <p className="mt-2 text-xs" style={{ color: 'var(--fg-dim)' }}>
                אנחנו לא שולחים SMS. המספר משמש כדי שחברים ימצאו אותך ויבקשו ממך כסף בביט.
              </p>
            </div>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'בודק…' : 'המשך'}</button>
          </form>
        )}

        {step === 'pin' && (
          <form onSubmit={signIn} className="flex flex-col gap-4">
            <button type="button" onClick={() => { setStep('phone'); setPin(''); }}
                    className="self-start text-sm font-medium" style={{ color: 'var(--brand)' }}>
              → {formatPhone(e164)}
            </button>
            <PinInput value={pin} onChange={setPin} onComplete={() => {}} label="הקוד הסודי שלך" />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'מתחבר…' : 'כניסה'}</button>
          </form>
        )}

        {step === 'register' && (
          <form onSubmit={signUp} className="flex flex-col gap-4">
            <button type="button" onClick={() => setStep('phone')}
                    className="self-start text-sm font-medium" style={{ color: 'var(--brand)' }}>
              → {formatPhone(e164)}
            </button>
            <div>
              <label className="label" htmlFor="name">איך קוראים לך?</label>
              <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="ישראל ישראלי" autoComplete="name" autoFocus />
            </div>
            <PinInput value={pin} onChange={setPin} onComplete={() => {}} label={`בחר קוד סודי (${PIN_LENGTH} ספרות)`} />
            <PinInput value={pin2} onChange={setPin2} onComplete={() => {}} label="שוב, לוודא" />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'נרשם…' : 'יצירת חשבון'}</button>
          </form>
        )}
      </div>

      <p className="mt-6 px-4 text-center text-xs leading-relaxed" style={{ color: 'var(--fg-dim)' }}>
        טיפ: באייפון פתח דרך Safari ← שיתוף ← <b>הוספה למסך הבית</b>, כדי לקבל התראות.
      </p>
    </main>
  );
}

/* A 6-box PIN entry that behaves well with mobile keyboards. */
function PinInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; onComplete: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="relative" onClick={() => ref.current?.focus()}>
        <input
          ref={ref}
          className="absolute inset-0 h-full w-full opacity-0"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          inputMode="numeric" autoComplete="one-time-code" maxLength={PIN_LENGTH}
        />
        <div className="pointer-events-none flex justify-between gap-2" dir="ltr">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div key={i}
                 className="grid h-12 flex-1 place-items-center rounded-xl text-xl font-bold transition"
                 style={{
                   background: 'var(--surface-2)',
                   border: `1px solid ${i === value.length ? 'var(--brand)' : 'var(--line)'}`,
                 }}>
              {value[i] ? '•' : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
