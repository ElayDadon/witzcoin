/**
 * Bit / PayBox hand-off.
 *
 * Bit has no public consumer API — its developer API is licensed by Bank Hapoalim
 * for businesses and licensed payment providers, so an app cannot create a real
 * P2P payment request programmatically. What we do instead, which is what people
 * actually do anyway:
 *   1. copy the exact amount to the clipboard,
 *   2. open a pre-written WhatsApp message with the amount, reason and trip,
 *   3. deep-link straight into the Bit app so the payer finishes in two taps.
 */
import { money } from './format';

export function requestText(args: {
  debtorName: string;
  creditorName: string;
  creditorPhone: string;
  amount: number;
  currency: string;
  tripName: string;
  reason?: string;
}): string {
  const { debtorName, creditorName, creditorPhone, amount, currency, tripName, reason } = args;
  const lines = [
    `היי ${debtorName} 👋`,
    `מהחשבון של "${tripName}" יצא שאתה חייב לי ${money(amount, currency)}.`,
    reason ? `על: ${reason}` : '',
    `אפשר להעביר בביט ל-${creditorPhone} (${creditorName}).`,
    'תודה! 🙏',
  ].filter(Boolean);
  return lines.join('\n');
}

export function whatsappLink(toPhoneE164: string, text: string): string {
  const num = toPhoneE164.replace(/[^\d]/g, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export function smsLink(toPhoneE164: string, text: string): string {
  return `sms:${toPhoneE164}?&body=${encodeURIComponent(text)}`;
}

/** Best-effort deep link into the Bit app (falls back to the store page if not installed). */
export const BIT_APP_LINK = 'https://bitpay.co.il/app/openBit';
export const BIT_STORE_IOS = 'https://apps.apple.com/il/app/bit/id1182007739';
export const BIT_STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.bnhp.payments.paymentsapp';

export function openBit(): void {
  window.location.href = BIT_APP_LINK;
}
