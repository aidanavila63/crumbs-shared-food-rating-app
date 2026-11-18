-- Round 96 (Nov 18): U22 "Loved near you", U23 change history on a place.
-- (Also in this round, app-only: Explore on the map only zoomed in, nearest 40 spots.)
-- Safe to run more than once; the app works before it runs (the card and History stay hidden).

-- ============================================================================================
-- 1. U22: restaurants near you that 3+ groups on Crumbs rated 4★ or more, that none of your spaces
--    has yet. Totals only (never who, never which group). Signed-in people only.
-- ============================================================================================
create or replace function public.loved_near(lat double precision, lng double precision,
                                             km double precision default 5, lim int default 10)
returns jsonb language sql stable security definer set search_path = public as $$
  with k as (select least(greatest(coalesce(km, 5), 0.5), 15) as km),
  box as (select lat - k.km / 111.0 as lat0, lat + k.km / 111.0 as lat1,
                 lng - k.km / (111.0 * greatest(cos(radians(lat)), 0.2)) as lng0,
                 lng + k.km / (111.0 * greatest(cos(radians(lat)), 0.2)) as lng1, k.km from k),
  near as (
    select r.id, r.name, r.cuisine, r.formatted_address, r.latitude, r.longitude,
           6371 * 2 * asin(sqrt(power(sin(radians(r.latitude - lat) / 2), 2)
             + cos(radians(lat)) * cos(radians(r.latitude)) * power(sin(radians(r.longitude - lng) / 2), 2))) as dist
      from public.restaurants r, box
     where r.latitude between box.lat0 and box.lat1 and r.longitude between box.lng0 and box.lng1
       and coalesce(r.business_status, '') <> 'CLOSED_PERMANENTLY'
       and not exists (select 1 from public.places mine where mine.restaurant_id = r.id
                         and mine.group_id in (select public.my_group_ids()))),
  rated as (
    select n.*, round(avg(coalesce(pr.points / 20.0, pr.score))::numeric, 1) as avg, count(distinct p.group_id) as groups
      from near n
      join public.places p on p.restaurant_id = n.id
      join public.place_ratings pr on pr.place_id = p.id and not coalesce(pr.draft, false)
     group by n.id, n.name, n.cuisine, n.formatted_address, n.latitude, n.longitude, n.dist
    having count(distinct p.group_id) >= 3 and avg(coalesce(pr.points / 20.0, pr.score)) >= 4)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'name', x.name, 'cuisine', x.cuisine, 'address', x.formatted_address,
           'lat', x.latitude, 'lng', x.longitude, 'km', round(x.dist::numeric, 2),
           'avg', x.avg, 'groups', x.groups, 'city', s.city, 'slug', s.slug) order by x.avg desc, x.dist), '[]')
    from (select * from rated, box where rated.dist <= box.km order by rated.avg desc, rated.dist
           limit least(greatest(coalesce(lim, 10), 1), 30)) x
    left join public.restaurant_slugs s on s.restaurant_id = x.id and s.is_current
   where auth.uid() is not null
$$;
revoke execute on function public.loved_near(double precision, double precision, double precision, int) from public, anon;
grant execute on function public.loved_near(double precision, double precision, double precision, int) to authenticated;

-- ============================================================================================
-- 2. U23: what changed on a place, and who changed it (seen by the group). The last 30 changes
--    per place are kept.
-- ============================================================================================
create table if not exists public.place_changes (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);
create index if not exists place_changes_place_idx on public.place_changes (place_id, changed_at desc);
create index if not exists place_changes_user_idx on public.place_changes (user_id);
alter table public.place_changes enable row level security;
drop policy if exists place_changes_read on public.place_changes;
create policy place_changes_read on public.place_changes for select to authenticated
  using (place_id in (select public.my_place_ids()));

create or replace function public.log_place_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f text;
  a text;
  b text;
begin
  -- only what people change in the app (not the database's own tidy-ups)
  if me is null or coalesce(current_setting('role', true), 'none') <> 'authenticated' then return new; end if;
  foreach f in array array['name', 'formatted_address', 'cuisine', 'price_level', 'website', 'status', 'tags', 'heard_from', 'pinned'] loop
    execute format('select ($1).%I::text, ($2).%I::text', f, f) into a, b using old, new;
    if a is distinct from b then
      insert into public.place_changes (place_id, user_id, field, old_value, new_value)
      values (new.id, me, f, left(a, 300), left(b, 300));
    end if;
  end loop;
  delete from public.place_changes c where c.place_id = new.id
     and c.id not in (select id from public.place_changes where place_id = new.id order by changed_at desc, id desc limit 30);
  return new;
end $$;
revoke execute on function public.log_place_changes() from public, anon, authenticated;
drop trigger if exists log_place_changes on public.places;
create trigger log_place_changes after update on public.places
  for each row execute function public.log_place_changes();

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261202_round96') on conflict (name) do nothing;
