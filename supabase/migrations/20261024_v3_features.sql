-- Crumbs v3: opening hours, dealbreakers, dish verdicts/tags, trips, personal preferences.
-- Safe to run more than once. Run AFTER 20261023_v2_features.sql and BEFORE deploying the new code.

-- 1. Opening hours cache + business status (filled in by the app from Google, refreshed every ~2 weeks)
alter table public.places add column if not exists opening_hours jsonb;
alter table public.places add column if not exists business_status text;
alter table public.places add column if not exists hours_checked_at timestamptz;

-- 2. Dealbreakers / practical facts about a place (one row per place)
create table if not exists public.place_facts (
  place_id uuid primary key references public.places(id) on delete cascade,
  noise text check (noise in ('quiet','normal','loud')),
  parking text check (parking in ('easy','hard','none')),
  accessible boolean,
  wait text check (wait in ('short','long')),
  cash_only boolean not null default false,
  allergens text[] not null default '{}',
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.place_facts enable row level security;
drop policy if exists place_facts_read on public.place_facts;
drop policy if exists place_facts_insert on public.place_facts;
drop policy if exists place_facts_update on public.place_facts;
drop policy if exists place_facts_delete on public.place_facts;
create policy place_facts_read on public.place_facts for select to authenticated
  using (public.is_group_member(public.place_group(place_id)));
create policy place_facts_insert on public.place_facts for insert to authenticated
  with check (public.is_group_member(public.place_group(place_id)));
create policy place_facts_update on public.place_facts for update to authenticated
  using (public.is_group_member(public.place_group(place_id)));
create policy place_facts_delete on public.place_facts for delete to authenticated
  using (public.is_group_member(public.place_group(place_id)));
do $$ begin
  alter publication supabase_realtime add table public.place_facts;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- 3. Dishes: "order again" / "never again" and free tags (spicy, pizza, shareable...)
alter table public.dishes add column if not exists verdict text check (verdict in ('again','never'));
alter table public.dishes add column if not exists tags text[] not null default '{}';

-- 4. Personal preferences (each person edits their own row): things to avoid + blind ratings
alter table public.profiles add column if not exists avoid text[] not null default '{}';
alter table public.profiles add column if not exists blind_ratings boolean not null default false;

-- 5. Trip mode: a list can be tied to a city and dates
alter table public.lists add column if not exists trip_city text;
alter table public.lists add column if not exists starts_on date;
alter table public.lists add column if not exists ends_on date;
