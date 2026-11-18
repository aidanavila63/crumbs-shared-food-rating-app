-- Round 93 (Nov 18): U8 photos on visits (up to 3), U17 pick-a-day poll on plans.
-- Safe to run more than once; the app works before it runs (no photo button, no poll).

-- ============================================================================================
-- 1. U8: up to 3 photos on a visit. They count as "in use" for Admin → Photos (also while the
--    place is in Recently deleted), so the clean-up never removes them.
-- ============================================================================================
alter table public.place_visits add column if not exists photo_paths text[] not null default '{}';
alter table public.place_visits drop constraint if exists place_visits_photo_paths_ok;
alter table public.place_visits add constraint place_visits_photo_paths_ok
  check (cardinality(photo_paths) <= 3 and coalesce(array_to_string(photo_paths, ''), '') !~ '\.\.');

create or replace function public.photo_refs()
returns table (path text) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select photo_path from public.places where photo_path is not null
  union select photo_path from public.dishes where photo_path is not null
  union select photo_path from public.home_meals where photo_path is not null
  union select cover_path from public.groups where cover_path is not null
  union select photo_path from public.restaurant_tips where photo_path is not null
  union select unnest(photo_paths) from public.place_visits where photo_paths <> '{}'
  union select split_part(avatar_url, '/public/crumbs-photos/', 2) from public.profiles
   where avatar_url like '%/public/crumbs-photos/%'
  union select x->>'photo_path' from public.deleted_items d,
         jsonb_array_elements(coalesce(d.snapshot->'places', '[]') || coalesce(d.snapshot->'dishes', '[]')) x
   where x->>'photo_path' is not null
  union select p.value from public.deleted_items d,
         jsonb_array_elements(coalesce(d.snapshot->'place_visits', '[]')) v,
         jsonb_array_elements_text(coalesce(v->'photo_paths', '[]')) p(value);
end $$;
revoke execute on function public.photo_refs() from public, anon, authenticated;

-- ============================================================================================
-- 2. U17: pick-a-day poll on a plan. The planner offers up to 6 days/times; everyone in the group
--    taps the ones that work; the planner picks one (it becomes the plan's time).
-- ============================================================================================
create table if not exists public.plan_options (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (plan_id, starts_at)
);
create index if not exists plan_options_plan_idx on public.plan_options (plan_id);
create table if not exists public.plan_votes (
  option_id uuid not null references public.plan_options(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists plan_votes_user_idx on public.plan_votes (user_id);

-- (plan_group(target_plan) already exists, from v4)
create or replace function public.option_group(target uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.group_id from public.plan_options o join public.plans p on p.id = o.plan_id where o.id = target
$$;
-- guests can look but not vote or add days (same as the rest of a group)
create or replace function public.plan_writer(target_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = target_group
                   and user_id = (select auth.uid()) and coalesce(role, 'member') <> 'guest')
$$;
revoke execute on function public.option_group(uuid), public.plan_writer(uuid) from public, anon;
grant execute on function public.option_group(uuid), public.plan_writer(uuid) to authenticated;

alter table public.plan_options enable row level security;
alter table public.plan_votes enable row level security;
drop policy if exists plan_options_read on public.plan_options;
create policy plan_options_read on public.plan_options for select to authenticated
  using (public.is_group_member(public.plan_group(plan_id)));
drop policy if exists plan_options_add on public.plan_options;
create policy plan_options_add on public.plan_options for insert to authenticated
  with check (public.plan_writer(public.plan_group(plan_id))
              and (select count(*) from public.plan_options o where o.plan_id = plan_options.plan_id) < 6);
drop policy if exists plan_options_remove on public.plan_options;
create policy plan_options_remove on public.plan_options for delete to authenticated
  using (public.plan_writer(public.plan_group(plan_id)));
drop policy if exists plan_votes_read on public.plan_votes;
create policy plan_votes_read on public.plan_votes for select to authenticated
  using (public.is_group_member(public.option_group(option_id)));
drop policy if exists plan_votes_add on public.plan_votes;
create policy plan_votes_add on public.plan_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.plan_writer(public.option_group(option_id)));
drop policy if exists plan_votes_remove on public.plan_votes;
create policy plan_votes_remove on public.plan_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Live updates while people vote
do $$ begin
  alter publication supabase_realtime add table public.plan_votes;
exception when duplicate_object then null; when undefined_object then null;
end $$;

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261129_round93') on conflict (name) do nothing;
