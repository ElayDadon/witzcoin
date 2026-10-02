'use client';
import { useEffect, useRef, useState } from 'react';
import { initials } from '@/lib/auth';

/* ------------------------------------------------------------------- icons */
const PATHS: Record<string, string> = {
  home: 'M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  receipt: 'M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21 7.3 19.4 5 21zM8.5 8h7M8.5 12h7',
  check: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18M8.4 12.2l2.5 2.5 4.7-5',
  scale: 'M12 4v16M7 20h10M4.5 9h15M4.5 9 2 15h5zM19.5 9 17 15h5zM8 6.2 12 5l4 1.2',
  gear: 'M12 8.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2M19.4 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1.1z',
  chev: 'm6 9 6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  back: 'm9 6 6 6-6 6',
  share: 'M12 16V4m0 0L8 8m4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4',
};

export function Icon({ name, size = 22, width = 1.7 }: { name: keyof typeof PATHS | string; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.chev} />
    </svg>
  );
}

/* ------------------------------------------------------------------ avatar */
export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white"
          style={{ width: size, height: size, background: color || '#0e7c71', fontSize: size * 0.4 }}
          title={name}>
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------- bottom sheet */
export function Sheet({
  open, onClose, title, children, footer,
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(6,16,15,.52)' }} onClick={onClose} />
      <div className="sheet-up relative flex max-h-[90vh] w-full max-w-[460px] flex-col rounded-t-[22px]"
           role="dialog" aria-modal="true" aria-label={title}
           style={{ background: 'var(--surface)' }}>
        <header className="flex items-center justify-between gap-3 px-[18px] py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="text-[17px] font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="סגירה" className="text-[25px] leading-none" style={{ color: 'var(--fg-faint)' }}>×</button>
        </header>
        <div className="flex flex-col gap-[18px] overflow-y-auto p-[18px]">{children}</div>
        {footer && (
          <div className="px-[18px] pt-3" style={{ borderTop: '1px solid var(--line)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- accordion */
export function Collapse({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="acc panel" open={open}>
      <summary className="flex items-center gap-2.5 px-[18px] py-4 text-[14.5px] font-bold">
        {title}
        <span className="chev ms-auto" style={{ color: 'var(--fg-faint)' }}><Icon name="chev" size={18} /></span>
      </summary>
      <div className="px-[18px] pb-[18px]">{children}</div>
    </details>
  );
}

/* ----------------------------------------------------------------- toasts */
let seq = 0;
type Toast = { id: number; text: string; tone: 'ok' | 'err' };
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

export function toast(text: string, tone: 'ok' | 'err' = 'ok') {
  const t = { id: ++seq, text, tone };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, 3200);
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => { listeners.add(setList); return () => { listeners.delete(setList); }; }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
         style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
      {list.map((t) => (
        <div key={t.id} className="rise rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
             style={{ background: t.tone === 'ok' ? '#0e7c71' : '#bf3b2e' }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ list picker */
export function SearchPicker<T>({
  items, render, onPick, placeholder, filter,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  placeholder: string;
  filter: (item: T, q: string) => boolean;
}) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 140); return () => clearTimeout(t); }, []);
  const shown = q.trim() ? items.filter((i) => filter(i, q.trim().toLowerCase())) : items;
  return (
    <div className="flex flex-col gap-3">
      <input ref={ref} className="field" value={q} onChange={(e) => setQ(e.target.value)}
             placeholder={placeholder} inputMode="search" />
      <div className="no-scrollbar -mx-1 max-h-[55vh] overflow-y-auto">
        {shown.length === 0 && <p className="px-2 py-6 text-center text-sm" style={{ color: 'var(--fg-faint)' }}>לא נמצאו תוצאות</p>}
        {shown.map((item, i) => (
          <button key={i} onClick={() => onPick(item)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right transition active:scale-[.99]">
            {render(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ charts */
export function Bars({ data }: { data: { label: string; value: string; ratio: number; color: string }[] }) {
  return (
    <div className="flex flex-col gap-[11px]">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-[5px] flex items-baseline justify-between gap-2.5">
            <span className="truncate text-[13px] font-semibold">{d.label}</span>
            <span className="num shrink-0 text-[11.5px]" style={{ color: 'var(--fg-dim)' }}>{d.value}</span>
          </div>
          <span className="track block"><i style={{ width: `${Math.max(d.ratio * 100, 1)}%`, background: d.color }} /></span>
        </div>
      ))}
    </div>
  );
}

export function DayChart({ days, label }: { days: { day: string; total: number }[]; label: (n: number) => string }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: 96, direction: 'ltr' }}>
      {days.slice(-14).map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="num text-[9px]" style={{ color: 'var(--fg-faint)' }}>{label(d.total)}</span>
          <div className="w-full rounded-t-[5px]"
               style={{ height: `${Math.max((d.total / max) * 56, 4)}px`, background: 'var(--brand)', opacity: 0.9 }} />
          <span className="num text-[9px]" style={{ color: 'var(--fg-faint)' }}>{d.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ states */
export function Spinner({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ color: 'var(--fg-faint)' }}>
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-current border-t-transparent opacity-40" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="text-4xl">{emoji}</span>
      <p className="font-bold">{title}</p>
      {hint && <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-faint)' }}>{hint}</p>}
    </div>
  );
}
