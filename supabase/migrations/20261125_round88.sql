-- Round 88 (Nov 17): recipe upgrades (U9). Safe to run more than once; the app works before it
-- runs (the new recipe fields and the shopping list just don't save).
--   1. Servings, prep and cook time on a recipe
--   2. Your shopping list
--   3. Your data download includes the shopping list
--   4. Record of this file

-- ============================================================================================
-- 1. Servings (for scaling) and times
-- ============================================================================================
alter table public.home_meals add column if not exists servings smallint check (servings is null or servings between 1 and 50);
alter table public.home_meals add column if not exists prep_minutes smallint check (prep_minutes is null or prep_minutes between 0 and 2880);
alter table public.home_meals add column if not exists cook_minutes smallint check (cook_minutes is null or cook_minutes between 0 and 2880);

-- ============================================================================================
-- 2. Shopping list: yours only (not a group's). Add a recipe's ingredients (scaled), tick them off.
-- ============================================================================================
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item text not null check (char_length(item) between 1 and 160),
  qty text check (qty is null or char_length(qty) <= 40),
  unit text check (unit is null or char_length(unit) <= 20),
  meal_id uuid references public.home_meals(id) on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shopping_items_user_idx on public.shopping_items (user_id, done, created_at);
create index if not exists shopping_items_meal_idx on public.shopping_items (meal_id);
alter table public.shopping_items enable row level security;
drop policy if exists shopping_items_own on public.shopping_items;
create policy shopping_items_own on public.shopping_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- at most 300 items at once (a list, not a database)
create or replace function public.shopping_items_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.shopping_items where user_id = new.user_id) >= 300 then
    raise exception 'Your shopping list is full (300 items) — clear the ticked ones first';
  end if;
  return new;
end $$;
revoke execute on function public.shopping_items_cap() from public, anon, authenticated;
drop trigger if exists shopping_items_cap on public.shopping_items;
create trigger shopping_items_cap before insert on public.shopping_items
  for each row execute function public.shopping_items_cap();

-- ============================================================================================
-- 3. Your data download includes it (same as before plus shopping_items)
-- ============================================================================================
create or replace function public.export_me()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  out jsonb := jsonb_build_object('app', 'crumbs', 'version', 1, 'exported_at', now());
  t text;
  col text;
  rows jsonb;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  out := out || jsonb_build_object('profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', m.role)), '[]')
                 from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = me));
  for t, col in select * from (values
      ('place_ratings', 'user_id'), ('place_visits', 'created_by'), ('places', 'created_by'),
      ('place_private_notes', 'user_id'), ('dishes', 'created_by'), ('dish_ratings', 'user_id'),
      ('home_meals', 'created_by'), ('home_meal_ratings', 'user_id'), ('home_meal_cooks', 'created_by'),
      ('recipe_reviews', 'user_id'),
      ('lists', 'created_by'), ('comments', 'user_id'), ('reactions', 'user_id'), ('plans', 'created_by'),
      ('plan_rsvps', 'user_id'), ('restaurant_facts', 'user_id'), ('restaurant_dishes', 'added_by'),
      ('restaurant_dish_votes', 'user_id'), ('restaurant_dish_prices', 'user_id'),
      ('contribution_points', 'user_id'), ('feedback', 'user_id'),
      ('private_places', 'user_id'), ('group_locations', 'created_by'), ('private_spends', 'user_id'), ('shopping_items', 'user_id')) v(t, col)
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where %I = $1', t, col)
      into rows using me;
    out := out || jsonb_build_object(t, rows);
  end loop;
  return out;
end $$;
revoke execute on function public.export_me() from public, anon;
grant execute on function public.export_me() to authenticated;

-- ============================================================================================
-- 4. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261125_round88')
on conflict (name) do nothing;
