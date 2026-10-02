# Witzcoin Trips

A shared travel-expense tracker for small groups — Splitwise-style balances plus
per-person task assignment, receipt photos, and a personal "what did this trip
cost *me*" dashboard. Hebrew-first, right-to-left, installable on iPhone and
Android as a home-screen web app with real push notifications.

Built to run on **witzcoin.com** for about **$0/month**.

---

## 1. What it does

| Area | Detail |
|---|---|
| **Sign-in** | Name + phone number + 6-digit PIN. No SMS costs, no email. |
| **Trips** | One group per trip. Pick from all 237 countries/territories (Hebrew names, flags, default currency). Settlement currency, destination currency, dates, budget and categories are all editable later from trip settings. |
| **Members** | Join with a 7-character invite code or a share link. |
| **Expenses** | Amount in any of the 162 active ISO 4217 currencies — dong, riel, kip and the rest — auto-converted to the settlement currency at the live rate, which is stored per expense so history never shifts. Decimal places follow the currency, so the dong and the yen never show sub-units. Split three ways: evenly, by percentage, or by exact amounts — across any subset of the group. |
| **Splitting** | Type a share for whoever needs one and leave the rest blank; the untouched rows take whatever is left, so the last person completes themselves. Percentages show the resulting amount, amounts show the resulting percentage, and a running bar says whether the split closes — with a one-tap button to put the remainder on the last person. Typed numbers are never silently rescaled. |
| **Categories** | Twelve to start with; each group adds and removes its own from trip settings. A category that already has expenses is retired from the picker rather than deleted, so old expenses keep their label. |
| **Receipts** | Shoot the receipt with the phone camera. Compressed in-browser to ~250 KB before upload, stored privately in Supabase Storage. |
| **Tasks** | Assign a to-do to a person ("Dani books the Athens hotel"), with a due date and estimated cost. Ticking it off asks what it actually cost and — if the others chip in — creates the shared expense automatically. |
| **Balances** | Net position per person, then the *minimum* set of transfers that settles everyone (at most n−1 instead of up to n(n−1)/2). |
| **Getting paid** | Prepares the exact amount and a ready-to-send WhatsApp/SMS message, opens Bit, and can send an in-app push reminder. Partial repayments supported. |
| **Home screen** | Answers three questions in order: what the group has spent, what the trip is actually costing *you* (paid out of pocket vs. your real share vs. the difference), and what each friend is paying — each expandable to their own expenses. Charts and the plain-language explanation of the maths fold away into accordions. |
| **Navigation** | Four tabs with a raised + in the middle; it asks whether you're adding an expense or a task. |
| **Push** | Fires when someone adds an expense you're part of, assigns you a task, completes one, settles up, or asks you for money. |
| **Live sync** | Supabase Realtime — when one phone adds an expense, the others update without a refresh. |

### What it deliberately does *not* do: charge anyone automatically

Bit has **no public consumer API**. Its developer API is licensed by Bank Hapoalim
for businesses and licensed payment providers (PISPs), so no third-party app can
create a real person-to-person payment request. Anyone who tells you otherwise is
selling you a business clearing account.

So the "request in Bit" button does the useful 95%: copies the exact amount,
pre-writes the WhatsApp message naming the trip and the reason, deep-links into
the Bit app, and pushes a reminder. The transfer itself happens inside Bit, as
it would anyway.

---

## 2. Architecture

```
iPhone / Android (home-screen PWA)
        │
        ├── Next.js 15 App Router ────────── Vercel (free Hobby plan)
        │     ├── /api/push/send  → web-push (VAPID)
        │     ├── /api/fx         → cached exchange rates
        │     └── /api/cron/keepalive
        │
        └── Supabase (free tier)
              ├── Postgres + Row Level Security
              ├── Auth (phone → synthetic email + PIN)
              ├── Storage (receipt photos, private bucket)
              └── Realtime (live expense sync)
```

**Why a PWA and not a native app.** Two of the three phones are iPhones. A native
iOS build needs an Apple Developer account at $99/year just to install on your own
devices. Since iOS 16.4, a web app added to the Home Screen can send push
notifications that appear on the lock screen, in Notification Center and on Apple
Watch — which is the only native feature this app actually needs. Android gets the
same thing with no caveats. The backend is a normal REST/Postgres API, so if you
ever do want a native shell, it wraps this without a rewrite.

**Known PWA limits.** On iOS, push only works after *Add to Home Screen* — never
from a Safari tab. There are no automatic install prompts; the app shows the user
how. Both of these are Apple platform behaviour, not bugs in this app.

---

## 3. Costs

| Service | Plan | Cost | Ceiling you'd hit first |
|---|---|---|---|
| Vercel | Hobby | $0 | Non-commercial use only |
| Supabase | Free | $0 | 500 MB database, 1 GB file storage, 50k monthly active users |
| Web Push | — | $0 | Unlimited; it's a browser standard |
| Exchange rates | open.er-api.com | $0 | No API key needed |
| Domain | you already own witzcoin.com | — | — |
| **Total** | | **$0/month** | |

For three people and a few trips a year this is not close to any limit. 1 GB of
storage holds roughly 4,000 compressed receipts.

**The one gotcha:** a free Supabase project is paused after 7 days with no database
request. Between trips that *will* happen. `vercel.json` therefore registers a daily
cron that pings `/api/cron/keepalive`, which touches the database and keeps the
project awake. Don't delete it.

---

## 4. Setup

Requires Node.js 20+ and accounts at supabase.com, vercel.com and github.com — all free.

### 4.1 Create the Supabase project

1. supabase.com → **New project**. Pick the **Frankfurt (eu-central-1)** region — it's
   the closest to Israel, roughly 60 ms versus 200 ms from Virginia.
2. Save the database password somewhere.
3. Open **SQL Editor → New query**, paste the entire contents of
   `supabase/schema.sql`, and hit **Run**. It creates every table, all the Row Level
   Security policies, the invite/join functions, the per-trip category set and its
   seed trigger, the realtime publication and the private `receipts` storage bucket.
   It is safe to re-run, and re-running is how you pick up schema changes —
   existing trips get backfilled with the default categories.
4. Go to **Authentication → Sign In / Providers → Email** and turn **Confirm email**
   **off**. Sign-in is phone + PIN; there is no inbox to confirm from, so leaving this
   on blocks every registration.
5. **Project Settings → API**, copy:
   - Project URL
   - `anon` `public` key
   - `service_role` key — **server-side only, never commit it or ship it to the browser**

### 4.2 Install and configure locally

```bash
git clone <your-repo> witzcoin && cd witzcoin
npm install
cp .env.example .env.local
npm run gen:vapid        # prints the two VAPID keys for push
```

Fill in `.env.local`:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BK...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@witzcoin.com
NEXT_PUBLIC_SITE_URL=https://witzcoin.com
CRON_SECRET=<any long random string>
```

The VAPID key pair identifies your server to Apple's and Google's push services.
Generate it **once**. If you ever change it, every device has to re-enable
notifications.

```bash
npm run dev     # http://localhost:3000
npm test        # runs the balance-math test suite
```

Push notifications need HTTPS, so they won't work on `localhost` — test them after
deploying.

### 4.3 Deploy to Vercel

1. Push the repo to GitHub.
2. vercel.com → **Add New → Project** → import the repo. Next.js is detected
   automatically; no build settings to change.
3. Under **Environment Variables**, add all eight from `.env.local`. Mark
   `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` and `CRON_SECRET` for
   **Production** only.
4. **Deploy**. You get a `*.vercel.app` URL — confirm the app loads before touching DNS.

### 4.4 Point witzcoin.com at it

In the Vercel project: **Settings → Domains → Add** → `witzcoin.com`. Add
`www.witzcoin.com` too; Vercel will offer to redirect one to the other.

Vercel then shows you the exact records to create. At your domain registrar (wherever
witzcoin.com is managed), set:

| Type | Name / Host | Value | TTL |
|---|---|---|---|
| `A` | `@` (or blank — the apex) | `76.76.21.21` | 60 |
| `CNAME` | `www` | the value shown on your Vercel domain card (`cname.vercel-dns.com`-style) | 60 |

Notes that save an evening:

- **Use the values Vercel prints on the domain card.** The apex A record is
  `76.76.21.21`, but the CNAME target is per-domain — copy it, don't guess it.
- **Delete any existing A / AAAA / CNAME on `@` and `www`** (parking pages, old
  hosts). Conflicting records are the usual cause of a domain that never verifies.
- **Don't add an AAAA record.** Vercel doesn't support IPv6.
- If the registrar has a "forwarding" or "parking" toggle, turn it off.
- Propagation is usually minutes but can take up to 24–48 hours. Check progress at
  <https://whatsmydns.net>. Vercel issues the HTTPS certificate automatically once
  the records resolve.
- **Alternative:** point the domain's nameservers at Vercel instead and let it manage
  DNS entirely. Simpler, but then Vercel owns your MX records too — only do this if
  no email runs on witzcoin.com.

Finally, set `NEXT_PUBLIC_SITE_URL=https://witzcoin.com` in Vercel's env vars and
redeploy, so invite links point at the real domain.

### 4.5 Install on the three phones

**iPhone (both of them) — must be Safari:**
1. Open `https://witzcoin.com` in **Safari** (not Chrome — iOS only allows install from Safari).
2. Share button → scroll → **Add to Home Screen** → **Add**.
3. Open the app **from the new home-screen icon**, not from Safari.
4. Register, then tap **Enable notifications** and allow.

Step 3 is not optional. In a Safari tab the Push API doesn't exist at all, and the
app will show the install hint instead of the notification prompt.

**Android:**
1. Open `https://witzcoin.com` in Chrome.
2. Menu → **Install app** (or the banner Chrome offers).
3. Register and allow notifications.

Then: whoever creates the trip taps the member avatars → **Share invite**, and sends
the link to the other two.

---

## 5. Project layout

```
supabase/schema.sql          Tables, RLS, functions, storage bucket. Run once.
scripts/
  gen-vapid.mjs              Generates the push key pair
  gen-countries.mjs          Regenerates the country list from Node's ICU data
  gen-currencies.mjs         Regenerates the currency list
  test-logic.ts              Balance-math test suite (npm test)
src/lib/
  balances.ts                Net positions, debt simplification, even splitting
  countries.ts               237 countries, Hebrew names, flags, currencies (generated)
  currencies.ts              All 162 active ISO 4217 currencies, symbols, decimals (generated)
  categories.ts              Default category set, palette, lookup with fallback
  auth.ts                    Phone normalisation, PIN rules, synthetic email mapping
  bit.ts                     Bit / WhatsApp / SMS hand-off
  fx.ts, format.ts           Rates; Hebrew money and date formatting
  push-client.ts             Service worker, subscription, iOS detection
  supabase.ts                Browser client (RLS-scoped)
  supabase-admin.ts          Service-role client — server only
src/app/
  page.tsx                   Phone → PIN → trips
  trips/page.tsx             Trip list, create, join, profile
  trips/[id]/page.tsx        Trip shell: tabs + realtime subscription
  join/[code]/page.tsx       Invite landing page
  api/push/send/route.ts     Sends web push, prunes dead subscriptions
  api/fx/route.ts            Exchange rates, cached in Postgres
  api/cron/keepalive/route.ts  Keeps the free Supabase project awake
src/components/trip/
  HomeTab.tsx                The three money questions, plus the folded-away detail
  ExpensesTab.tsx            Filtered feed, expense detail, receipt viewer
  TasksTab.tsx               Tasks, and turning a completed one into a shared expense
  BalancesTab.tsx            Net positions, minimum transfers, Bit requests
  AddExpenseSheet.tsx        The expense form, incl. camera capture and FX
  TaskSheet.tsx              Create / edit a task
  TripSettingsSheet.tsx      Currencies, budget, dates, categories, members
  TripHeader.tsx             Title bar, invite sharing, settings
public/sw.js                 Service worker: push, notification taps, offline shell
```

---

## 6. How the money math works

Every amount is stored twice: in the currency it was actually paid in, and converted
to the trip's settlement currency (`amount_base`) using the rate at that moment. The
rate is saved on the row, so a shekel-euro move next month doesn't silently rewrite
last month's dinner.

Each expense has a row per participant in `expense_shares`, always as an amount in
the settlement currency; `split_mode` only records which editor to reopen. Shares
are allocated by largest-remainder rounding in the currency's smallest unit — agorot
for the shekel, whole dong for Vietnam, which has no sub-unit — so the displayed
parts always sum back to the displayed total, and the odd agora goes to whoever was
rounded down hardest instead of always to the same person.

A person's net position is:

```
net = (what they paid) − (their share of everything) + (settlements they sent) − (settlements they received)
```

Positive means the group owes them. The simplifier then repeatedly matches the
largest debtor against the largest creditor, which settles everyone in at most
n−1 transfers. `npm test` covers all of this, including rounding and partial
repayments.

---

## 7. Security notes

- Row Level Security is on for every table. A member can only read trips they belong
  to, and can only see the profiles of people they share a trip with.
- Receipt photos live in a private bucket; the app serves them through short-lived
  signed URLs. The storage policy checks trip membership from the object path.
- The `service_role` key is only ever used in `/api/*` route handlers, which run on
  the server. It is never bundled into the browser.
- A 6-digit PIN is appropriate for a closed group of friends, not for a public
  product. It is not SMS-verified, so anyone who knows a phone number *and* guesses
  the PIN gets in. If you later open this up, switch `src/lib/auth.ts` to Supabase's
  real phone provider (needs a paid Twilio account) and add rate limiting.
- `/api/push/send` verifies the caller's token and refuses to notify anyone outside
  the trip, so the push endpoint can't be used to spam strangers.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Registration fails, "Confirm email" error | Turn off **Confirm email** in Supabase → Authentication → Providers. |
| No notifications on iPhone | Not opened from the home-screen icon, or installed from Chrome instead of Safari. Delete the icon and redo from Safari. |
| Notifications stopped for everyone | `VAPID_PRIVATE_KEY` changed. Restore it, or have everyone re-enable notifications. |
| App loads slowly after an idle week | The Supabase project paused. Check the cron in Vercel → Settings → Cron Jobs. |
| Domain stuck on "Invalid Configuration" | Leftover A/AAAA/CNAME on `@` or `www`, or the registrar is still parking the domain. |
| Exchange rate looks wrong | Overwrite it by hand in the expense form — the field next to the converted amount is editable. |
| A currency has no automatic rate | The rates feed covers about 160 of the 162 codes. The form says so and gives you a manual rate field; the rate you type is stored on the expense like any other. |
| "Percent" splits refuse to save | The `split_mode` constraint predates them. Re-run `schema.sql`; it widens the constraint in place. |
| Categories don't appear in trip settings | `schema.sql` was run before the `trip_categories` section existed. Re-run the whole file — it backfills every existing trip. |
| Receipt upload fails | File over 10 MB, or the schema was run before the storage bucket existed. Re-run `schema.sql`. |

---

## 9. Ideas for later

Split by percentage or shares (the `split_mode` column already allows it) · recurring
expenses · CSV/PDF export for the end of a trip · OCR on receipts to prefill the
amount · offline queueing of expenses written on a plane · a cash-vs-card wallet view ·
reordering categories by drag.
