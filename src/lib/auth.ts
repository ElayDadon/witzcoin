/**
 * Phone + PIN authentication.
 *
 * Supabase Auth needs an identifier + password. Real SMS verification costs money
 * (Twilio), so we map a phone number onto a synthetic, non-routable e-mail address
 * and use the 6-digit PIN as the password. The user only ever sees name / phone / PIN.
 */

export const PIN_LENGTH = 6;

/** Normalises any Israeli / international input into E.164, e.g. "050-123 4567" -> "+972501234567". */
export function normalizePhone(input: string): string | null {
  let s = (input || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    const digits = s.slice(1);
    if (digits.length < 8 || digits.length > 15) return null;
    return '+' + digits;
  }
  // Bare local number: assume Israel.
  if (s.startsWith('0')) s = s.slice(1);
  if (s.length < 8 || s.length > 10) return null;
  return '+972' + s;
}

/** Pretty display form: +972501234567 -> 050-123-4567 for Israeli numbers. */
export function formatPhone(e164: string): string {
  if (e164.startsWith('+972')) {
    const n = '0' + e164.slice(4);
    if (n.length === 10) return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
    if (n.length === 9) return `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
  }
  return e164;
}

/** Synthetic e-mail used as the Supabase Auth identifier. Never receives mail. */
export function phoneToEmail(e164: string): string {
  return `u${e164.replace('+', '')}@phone.witzcoin.app`;
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

const AVATAR_COLORS = [
  '#0D9488', '#F59E0B', '#6366F1', '#EC4899', '#10B981',
  '#F43F5E', '#8B5CF6', '#0EA5E9', '#D97706', '#14B8A6',
];

/** Deterministic colour per person, so avatars stay stable across devices. */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || '').join('') || '?';
}
