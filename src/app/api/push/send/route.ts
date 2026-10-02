import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin, userFromToken } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  userIds: string[];
  title: string;
  body: string;
  url?: string;
  tripId?: string;
  type?: string;
  tag?: string;
};

export async function POST(req: Request) {
  const senderId = await userFromToken(req.headers.get('authorization'));
  if (!senderId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'push-not-configured' }, { status: 503 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@witzcoin.com', vapidPublic, vapidPrivate);

  const payload = (await req.json()) as Body;
  const db = supabaseAdmin();

  // The sender may only notify people they actually share this trip with.
  let recipients = [...new Set(payload.userIds || [])].filter((id) => id !== senderId);
  if (payload.tripId) {
    const { data: members } = await db.from('trip_members').select('user_id').eq('trip_id', payload.tripId);
    const allowed = new Set((members ?? []).map((m) => m.user_id));
    if (!allowed.has(senderId)) return NextResponse.json({ error: 'not-a-member' }, { status: 403 });
    recipients = recipients.filter((id) => allowed.has(id));
  }
  if (recipients.length === 0) return NextResponse.json({ sent: 0 });

  // Keep an in-app copy so notifications aren't lost if push fails or is off.
  await db.from('notifications').insert(
    recipients.map((user_id) => ({
      user_id,
      trip_id: payload.tripId ?? null,
      type: payload.type ?? 'generic',
      title: payload.title,
      body: payload.body,
      data: { url: payload.url ?? '/trips' },
    }))
  );

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipients);

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/trips',
    tag: payload.tag,
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          { TTL: 60 * 60 * 24 }
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404/410 = the browser dropped this subscription; clean it up.
        if (code === 404 || code === 410) dead.push(s.id);
      }
    })
  );
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);

  return NextResponse.json({ sent, pruned: dead.length });
}
