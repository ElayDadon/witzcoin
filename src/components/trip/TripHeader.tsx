'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dateRange, tripStatus } from '@/lib/format';
import { COUNTRY_BY_CODE } from '@/lib/countries';
import { Avatar, Icon, toast } from '@/components/ui';
import TripSettingsSheet from './TripSettingsSheet';
import type { TripData } from '@/app/trips/[id]/page';

export default function TripHeader({ data, onChanged }: { data: TripData; onChanged: () => void }) {
  const router = useRouter();
  const { trip, members } = data;
  const [settings, setSettings] = useState(false);
  const flag = COUNTRY_BY_CODE[trip.country_code]?.flag ?? '🌍';
  const status = tripStatus(trip.start_date, trip.end_date);

  async function share() {
    const url = `${window.location.origin}/join/${trip.invite_code}`;
    const text = `הצטרפו לטיול "${trip.name}" ב-Witzcoin:\n${url}\n\nאו הכניסו את הקוד: ${trip.invite_code}`;
    if (navigator.share) {
      try { await navigator.share({ title: trip.name, text }); return; } catch { /* dismissed */ }
    }
    await navigator.clipboard.writeText(text);
    toast('ההזמנה הועתקה');
  }

  return (
    <>
      <header className="pb-4 pt-3">
        <button onClick={() => router.push('/trips')} className="mb-2 flex items-center gap-1 text-[13px] font-bold"
                style={{ color: 'var(--brand)' }}>
          <Icon name="back" size={15} /> כל הטיולים
        </button>

        <div className="flex items-center gap-3">
          <span className="panel grid h-[46px] w-[46px] shrink-0 place-items-center text-[23px]" style={{ borderRadius: 14 }}>
            {trip.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-extrabold leading-tight">{trip.name}</h1>
            <p className="mt-0.5 truncate text-[13px]" style={{ color: 'var(--fg-dim)' }}>
              {flag} {trip.country_name} · {dateRange(trip.start_date, trip.end_date)}
              {status.tone !== 'none' && (
                <> · <span style={{ color: status.tone === 'live' ? 'var(--brand)' : undefined }}>{status.label}</span></>
              )}
            </p>
          </div>

          <button onClick={share} aria-label="שיתוף הזמנה" className="flex shrink-0 flex-row-reverse">
            {members.slice(0, 3).map((m) => (
              <span key={m.user_id} className="-ms-[7px]" style={{ borderRadius: 999, boxShadow: '0 0 0 2px var(--bg)' }}>
                <Avatar name={m.profile.name} color={m.profile.avatar_color} size={28} />
              </span>
            ))}
            {members.length > 3 && (
              <span className="-ms-[7px] grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold"
                    style={{ background: 'var(--surface-2)', boxShadow: '0 0 0 2px var(--bg)' }}>
                +{members.length - 3}
              </span>
            )}
          </button>

          <button onClick={() => setSettings(true)} aria-label="הגדרות הטיול"
                  className="panel grid h-[38px] w-[38px] shrink-0 place-items-center"
                  style={{ borderRadius: 12, color: 'var(--fg-dim)' }}>
            <Icon name="gear" size={19} />
          </button>
        </div>
      </header>

      <TripSettingsSheet open={settings} onClose={() => setSettings(false)} data={data} onChanged={onChanged} />
    </>
  );
}
