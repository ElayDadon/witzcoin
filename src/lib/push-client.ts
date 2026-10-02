'use client';
import { supabase } from './supabase';

export type PushState = 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied';

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * iOS only exposes the Push API inside a home-screen web app — in a Safari tab
 * it does not exist at all. We detect that and tell the user to install first.
 */
export function pushState(): PushState {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  return Notification.permission as PushState;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Asks for permission (must be called from a user gesture on iOS) and stores the subscription. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  const state = pushState();
  if (state === 'needs-install') return { ok: false, reason: 'needs-install' };
  if (state === 'unsupported') return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!reg) return { ok: false, reason: 'no-sw' };
  await navigator.serviceWorker.ready;

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, reason: 'no-vapid-key' };

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { data: auth } = await supabase().auth.getUser();
  if (!auth.user) return { ok: false, reason: 'not-signed-in' };

  const { error } = await supabase().from('push_subscriptions').upsert(
    {
      user_id: auth.user.id,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: 'endpoint' }
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** Sends a push to specific trip members through our own API route. */
export async function notify(args: {
  userIds: string[];
  title: string;
  body: string;
  url?: string;
  tripId?: string;
  type?: string;
}): Promise<void> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    });
  } catch {
    /* notifications are best-effort — never block the UI on them */
  }
}
