-- Crumbs v2: dish points (0-100), multiple visits + spend, photos, shared lists, push.
-- Safe to run more than once. Run this in Supabase -> SQL Editor BEFORE deploying the new code.

-- 1. Dish points out of 100 (stars in `score` stay valid; `points` is the new precise score)
alter table public.dish_ratings add column if not exists points integer check (points between 0 and 100);

-- 2. Visits: one row per time you went
create table if not exists public.place_visits (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  visited_on date not null,
  spend numeric(10,2) check (spend is null or spend >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.place_visits enable row level security;
drop policy if exists place_visits_read on public.place_visits;
drop policy if exists place_visits_insert on public.place_visits;
drop policy if exists place_visits_delete on public.place_visits;
create policy place_visits_read on public.place_visits for select to authenticated
  using (public.is_group_member(public.place_group(place_id)));
create policy place_visits_insert on public.place_visits for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(public.place_group(place_id)));
create policy place_visits_delete on public.place_visits for delete to authenticated
  using (public.is_group_member(public.place_group(place_id)));
-- Turn the single dates you already saved into visits (only once per place)
insert into public.place_visits (place_id, visited_on, created_by)
select p.id, p.visited_on, p.created_by from public.places p
where p.visited_on is not null
  and not exists (select 1 from public.place_visits v where v.place_id = p.id);
do $$ begin
  alter publication supabase_realtime add table public.place_visits;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- 3. Photos (one per place, one per dish). Files live in a public bucket under <group id>/<random>.jpg
alter table public.places add column if not exists photo_path text;
alter table public.dishes add column if not exists photo_path text;
insert into storage.buckets (id, name, public) values ('crumbs-photos', 'crumbs-photos', true)
  on conflict (id) do nothing;
drop policy if exists crumbs_photos_select on storage.objects;
drop policy if exists crumbs_photos_insert on storage.objects;
drop policy if exists crumbs_photos_delete on storage.objects;
create policy crumbs_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'crumbs-photos' and public.is_group_member(((storage.foldername(name))[1])::uuid));
create policy crumbs_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crumbs-photos' and public.is_group_member(((storage.foldername(name))[1])::uuid));
create policy crumbs_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crumbs-photos' and public.is_group_member(((storage.foldername(name))[1])::uuid));

-- 4. Read-only shared lists (private link, can be switched off by deleting the row)
create or replace function public.list_group_id(target_list uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select group_id from public.lists where id = target_list $$;
create table if not exists public.list_shares (
  token text primary key default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  list_id uuid not null unique references public.lists(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.list_shares enable row level security;
drop policy if exists list_shares_read on public.list_shares;
drop policy if exists list_shares_insert on public.list_shares;
drop policy if exists list_shares_delete on public.list_shares;
create policy list_shares_read on public.list_shares for select to authenticated
  using (public.is_group_member(public.list_group_id(list_id)));
create policy list_shares_insert on public.list_shares for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(public.list_group_id(list_id)));
create policy list_shares_delete on public.list_shares for delete to authenticated
  using (public.is_group_member(public.list_group_id(list_id)));
-- Anyone with the link can read ONLY names, addresses, cuisine, price, status and average stars.
create or replace function public.get_shared_list(share_token text)
returns jsonb language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'name', l.name,
    'emoji', l.emoji,
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name,
        'address', p.formatted_address,
        'cuisine', p.cuisine,
        'price_level', p.price_level,
        'status', p.status,
        'avg', (select round(avg(r.score)::numeric, 1) from public.place_ratings r where r.place_id = p.id)
      ) order by p.name)
      from public.list_places lp join public.places p on p.id = lp.place_id
      where lp.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.list_shares s join public.lists l on l.id = s.list_id
  where s.token = share_token
$$;
grant execute on function public.get_shared_list(text) to anon, authenticated;

-- 5. Push notifications (only used if the VAPID keys are set in Vercel)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_own on public.push_subscriptions;
drop policy if exists push_subs_mates_read on public.push_subscriptions;
drop policy if exists push_subs_mates_delete on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subs_mates_read on public.push_subscriptions for select to authenticated
  using (exists (select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
                 where a.user_id = (select auth.uid()) and b.user_id = push_subscriptions.user_id));
create policy push_subs_mates_delete on public.push_subscriptions for delete to authenticated
  using (exists (select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
                 where a.user_id = (select auth.uid()) and b.user_id = push_subscriptions.user_id));
