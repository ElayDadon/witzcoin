-- =============================================================================
-- Witzcoin Trips — full database schema
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run (idempotent).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- PROFILES  (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  phone         text not null unique,          -- E.164, e.g. +972501234567
  avatar_color  text not null default '#0D9488',
  locale        text not null default 'he',
  created_at    timestamptz not null default now()
);

-- Auto-create a profile row whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'משתמש'),
    coalesce(new.raw_user_meta_data->>'phone', new.id::text),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#0D9488')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- TRIPS
-- -----------------------------------------------------------------------------
create table if not exists public.trips (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  country_code   text not null,                -- ISO 3166-1 alpha-2
  country_name   text not null,                -- Hebrew name, denormalised for display
  base_currency  text not null default 'ILS',  -- everything is settled in this currency
  trip_currency  text not null default 'EUR',  -- the currency you mostly spend in
  start_date     date,
  end_date       date,
  budget         numeric(14,2),                -- optional total budget, in base_currency
  emoji          text not null default '✈️',
  invite_code    text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,7)),
  archived       boolean not null default false,
  created_by     uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  joined_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_idx on public.trip_members(user_id);

-- Security-definer helper: avoids infinite RLS recursion between trips/trip_members.
create or replace function public.is_trip_member(p_trip uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip and m.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- EXPENSES
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  payer_id      uuid not null references public.profiles(id) on delete cascade,
  description   text not null,
  category      text not null default 'other',
  amount        numeric(14,2) not null check (amount > 0),  -- in `currency`
  currency      text not null,
  fx_rate       numeric(18,8) not null default 1,           -- 1 unit of `currency` = fx_rate base_currency
  amount_base   numeric(14,2) not null,                     -- amount * fx_rate, cached for fast sums
  split_mode    text not null default 'equal' check (split_mode in ('equal','exact','percent','shares','full')),
  spent_at      timestamptz not null default now(),
  note          text,
  receipt_path  text,                                       -- storage object path in the `receipts` bucket
  created_by    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index if not exists expenses_trip_idx on public.expenses(trip_id, spent_at desc);

-- Who owes what on a given expense (always stored in base currency).
create table if not exists public.expense_shares (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount_base numeric(14,2) not null,
  unique (expense_id, user_id)
);
create index if not exists expense_shares_expense_idx on public.expense_shares(expense_id);

-- -----------------------------------------------------------------------------
-- TASKS  (per-person to-dos that can turn into expenses)
-- -----------------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  title         text not null,
  notes         text,
  assignee_id   uuid references public.profiles(id) on delete set null,
  due_at        timestamptz,
  is_done       boolean not null default false,
  done_at       timestamptz,
  est_cost      numeric(14,2),            -- planned cost, in `currency`
  currency      text,
  actual_cost   numeric(14,2),            -- what it really cost, in `currency`
  billable      boolean not null default true,   -- do the others chip in for this?
  expense_id    uuid references public.expenses(id) on delete set null, -- created when marked done
  created_by    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_trip_idx on public.tasks(trip_id, is_done, due_at);

-- -----------------------------------------------------------------------------
-- SETTLEMENTS  ("I paid you back")
-- -----------------------------------------------------------------------------
create table if not exists public.settlements (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_user     uuid not null references public.profiles(id) on delete cascade,
  amount_base numeric(14,2) not null check (amount_base > 0),
  method      text not null default 'bit' check (method in ('bit','cash','bank','paybox','other')),
  note        text,
  settled_at  timestamptz not null default now(),
  created_by  uuid not null references public.profiles(id) on delete cascade
);
create index if not exists settlements_trip_idx on public.settlements(trip_id);

-- -----------------------------------------------------------------------------
-- PUSH + NOTIFICATIONS
-- -----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  trip_id    uuid references public.trips(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, read, created_at desc);

-- -----------------------------------------------------------------------------
-- FX RATE CACHE  (so we don't hammer the free rates API)
-- -----------------------------------------------------------------------------
create table if not exists public.fx_rates (
  base       text primary key,
  rates      jsonb not null,
  fetched_at timestamptz not null default now()
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles           enable row level security;
alter table public.trips              enable row level security;
alter table public.trip_members       enable row level security;
alter table public.expenses           enable row level security;
alter table public.expense_shares     enable row level security;
alter table public.tasks              enable row level security;
alter table public.settlements        enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications      enable row level security;
alter table public.fx_rates           enable row level security;

-- PROFILES: you can read anyone you share a trip with (plus yourself); you may only edit yourself.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from public.trip_members me
    join public.trip_members them on them.trip_id = me.trip_id
    where me.user_id = auth.uid() and them.user_id = profiles.id
  )
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());

-- TRIPS
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select using (public.is_trip_member(id) or created_by = auth.uid());
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips for insert with check (created_by = auth.uid());
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update using (public.is_trip_member(id)) with check (public.is_trip_member(id));
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete using (created_by = auth.uid());

-- TRIP MEMBERS
drop policy if exists members_select on public.trip_members;
create policy members_select on public.trip_members for select using (public.is_trip_member(trip_id) or user_id = auth.uid());
drop policy if exists members_insert on public.trip_members;
create policy members_insert on public.trip_members for insert with check (
  user_id = auth.uid()                                   -- joining a trip yourself (via invite code)
  or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
);
drop policy if exists members_delete on public.trip_members;
create policy members_delete on public.trip_members for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
);

-- EXPENSES / SHARES / TASKS / SETTLEMENTS: any trip member can do anything inside their trip.
drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses for all
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists shares_all on public.expense_shares;
create policy shares_all on public.expense_shares for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));

drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks for all
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists settlements_all on public.settlements;
create policy settlements_all on public.settlements for all
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- PUSH SUBSCRIPTIONS + NOTIFICATIONS: strictly your own.
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- FX: readable by any signed-in user; only the server (service role) writes.
drop policy if exists fx_select on public.fx_rates;
create policy fx_select on public.fx_rates for select using (auth.role() = 'authenticated');

-- =============================================================================
-- LOOKUP RPCs
-- Needed because RLS (correctly) hides trips and profiles you are not part of.
-- =============================================================================

-- Resolve an invite code -> trip preview, without exposing the whole trips table.
create or replace function public.trip_by_invite(p_code text)
returns table (id uuid, name text, country_name text, emoji text, member_count bigint)
language sql security definer stable set search_path = public as $$
  select t.id, t.name, t.country_name, t.emoji,
         (select count(*) from public.trip_members m where m.trip_id = t.id)
  from public.trips t
  where upper(t.invite_code) = upper(trim(p_code)) and t.archived = false
  limit 1;
$$;

-- Add yourself to a trip using an invite code.
create or replace function public.join_trip(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  select t.id into v_trip from public.trips t
  where upper(t.invite_code) = upper(trim(p_code)) and t.archived = false limit 1;
  if v_trip is null then raise exception 'INVALID_CODE'; end if;
  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip, auth.uid(), 'member')
  on conflict do nothing;
  return v_trip;
end; $$;

-- Find a registered person by phone, so you can add them to a trip directly.
create or replace function public.find_profile_by_phone(p_phone text)
returns table (id uuid, name text, avatar_color text)
language sql security definer stable set search_path = public as $$
  select p.id, p.name, p.avatar_color from public.profiles p
  where p.phone = trim(p_phone) limit 1;
$$;

-- Does this phone already have an account? Used by the login screen.
create or replace function public.phone_exists(p_phone text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where phone = trim(p_phone));
$$;

grant execute on function public.trip_by_invite(text)        to anon, authenticated;
grant execute on function public.join_trip(text)             to authenticated;
grant execute on function public.find_profile_by_phone(text) to authenticated;
grant execute on function public.phone_exists(text)          to anon, authenticated;

-- =============================================================================
-- REALTIME  (live updates when a friend adds an expense)
-- =============================================================================
do $$ begin
  alter publication supabase_realtime add table public.expenses;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.expense_shares;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.settlements;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.trip_members;
exception when duplicate_object then null; end $$;

-- =============================================================================
-- STORAGE  — receipt photos
-- Objects are stored as:  receipts/<trip_id>/<expense_or_draft_id>/<file>.jpg
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid));

-- =============================================================================
-- TRIP CATEGORIES
-- Categories belong to a trip so each group can add and remove its own.
-- A category that already has expenses is archived rather than deleted, so old
-- expenses keep showing the right label.
-- =============================================================================
create table if not exists public.trip_categories (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  key         text not null,
  label       text not null,
  emoji       text not null default '🏷️',
  color       text not null default '#64748b',
  sort_order  int  not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (trip_id, key)
);
create index if not exists trip_categories_trip_idx on public.trip_categories(trip_id, archived, sort_order);

alter table public.trip_categories enable row level security;

drop policy if exists categories_all on public.trip_categories;
create policy categories_all on public.trip_categories for all
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- The starting set every new trip gets. Groups edit it from trip settings.
create or replace function public.seed_trip_categories(p_trip uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.trip_categories (trip_id, key, label, emoji, color, sort_order)
  values
    (p_trip, 'lodging',   'לינה',          '🏨', '#5b5bd6',  1),
    (p_trip, 'food',      'אוכל ושתייה',   '🍽️', '#d98324',  2),
    (p_trip, 'transport', 'תחבורה',        '🚕', '#0ea5e9',  3),
    (p_trip, 'flights',   'טיסות',         '✈️', '#8b5cf6',  4),
    (p_trip, 'activity',  'אטרקציות',      '🎟️', '#10b981',  5),
    (p_trip, 'shopping',  'קניות',         '🛍️', '#ec4899',  6),
    (p_trip, 'nightlife', 'בילויים',       '🍻', '#f43f5e',  7),
    (p_trip, 'groceries', 'סופר',          '🛒', '#84cc16',  8),
    (p_trip, 'health',    'בריאות וביטוח', '🏥', '#ef4444',  9),
    (p_trip, 'comms',     'סים ואינטרנט',  '📱', '#06b6d4', 10),
    (p_trip, 'fees',      'עמלות ומזומן',  '💱', '#a16207', 11),
    (p_trip, 'other',     'אחר',           '📦', '#64748b', 12)
  on conflict (trip_id, key) do nothing;
$$;

create or replace function public.handle_new_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_trip_categories(new.id);
  return new;
end; $$;

drop trigger if exists on_trip_created on public.trips;
create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.handle_new_trip();

-- Backfill: give any trip created before this migration the default set.
do $$
declare t record;
begin
  for t in select id from public.trips loop
    perform public.seed_trip_categories(t.id);
  end loop;
end $$;

/**
 * Removing a category: archive it when expenses already reference it, delete it
 * when nothing does. Returns 'archived' or 'deleted' so the UI can say which.
 */
create or replace function public.remove_category(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_trip uuid; v_key text; v_used int;
begin
  select trip_id, key into v_trip, v_key from public.trip_categories where id = p_id;
  if v_trip is null then raise exception 'NOT_FOUND'; end if;
  if not public.is_trip_member(v_trip) then raise exception 'FORBIDDEN'; end if;

  select count(*) into v_used from public.expenses where trip_id = v_trip and category = v_key;
  if v_used > 0 then
    update public.trip_categories set archived = true where id = p_id;
    return 'archived';
  end if;
  delete from public.trip_categories where id = p_id;
  return 'deleted';
end; $$;

grant execute on function public.remove_category(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.trip_categories;
exception when duplicate_object then null; end $$;

-- =============================================================================
-- SPLIT MODES
-- 'percent' was added after the first release; this widens the constraint on a
-- database that already exists. Shares are always stored as amounts, so nothing
-- else has to change — the mode only tells the app which editor to reopen.
-- =============================================================================
do $$ begin
  alter table public.expenses drop constraint if exists expenses_split_mode_check;
  alter table public.expenses add constraint expenses_split_mode_check
    check (split_mode in ('equal','exact','percent','shares','full'));
end $$;
