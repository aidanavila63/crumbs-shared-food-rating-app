-- Round 79 (Nov 18): Crumbs' own place data, ready for the Overture Maps import (decided Nov 12:
-- the whole GTA as the open base layer; nearby features read our own table first), and better
-- name search (E21). Safe to run more than once; the app works before it runs.
--   1. Name search that ignores accents and case and copes with small typos (pg_trgm, unaccent)
--   2. "Also known as" and the original-language name (O10)
--   3. Near-me search on our own table (restaurants_near)
--   4. Holding table for the Overture import, and the merge into restaurants
--   5. Record of this file

-- ============================================================================================
-- 1. Name search (E21)
-- Before: lower(name) like '%q%' — every search read the whole table, and "creperie" never
-- found "Crêperie". Now names are folded (lower case, accents off) once, kept in an index that
-- finds parts of words and near-misses ("shwarma" → "Shawarma").
-- ============================================================================================
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent() isn't marked immutable (its dictionary could change), so it can't feed an index
-- directly; this wrapper names the dictionary and is.
create or replace function public.fold(t text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;

-- ============================================================================================
-- 2. Also known as, original-language name (O10)
-- ============================================================================================
alter table public.restaurants add column if not exists name_local text check (name_local is null or char_length(name_local) <= 160);
alter table public.restaurants add column if not exists aka text[] not null default '{}';
alter table public.restaurants add column if not exists overture_id text;
create unique index if not exists restaurants_overture_id_idx on public.restaurants (overture_id) where overture_id is not null;

-- Folded names, kept up to date by a trigger (a generated column can't call our function on every
-- Postgres version Supabase runs).
alter table public.restaurants add column if not exists search_name text;
create or replace function public.restaurants_search_name()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  new.search_name := public.fold(concat_ws(' ', new.name, new.name_local, array_to_string(new.aka, ' ')));
  return new;
end $$;
drop trigger if exists restaurants_search_name on public.restaurants;
create trigger restaurants_search_name before insert or update of name, name_local, aka on public.restaurants
  for each row execute function public.restaurants_search_name();
update public.restaurants
   set search_name = public.fold(concat_ws(' ', name, name_local, array_to_string(aka, ' ')))
 where search_name is distinct from public.fold(concat_ws(' ', name, name_local, array_to_string(aka, ' ')));
create index if not exists restaurants_search_name_trgm on public.restaurants
  using gin (search_name extensions.gin_trgm_ops);

-- Same name and return type as before (the app calls it as it always has).
create or replace function public.search_restaurants(q text, lat double precision default null, lng double precision default null)
returns setof public.restaurants language sql stable security definer set search_path = public, extensions as $$
  with term as (select public.fold(trim(q)) as t)
  select r.* from public.restaurants r, term
   where length(term.t) >= 3
     and (r.search_name like '%' || term.t || '%' or r.search_name % term.t)
     and (lat is null or r.latitude is null or (abs(r.latitude - lat) < 0.5 and abs(r.longitude - lng) < 0.7))
   order by (r.search_name like '%' || term.t || '%') desc,
            extensions.similarity(r.search_name, term.t) desc,
            r.places_count desc,
            (case when lat is null or r.latitude is null then 0 else abs(r.latitude - lat) + abs(r.longitude - lng) end)
   limit 8
$$;
revoke execute on function public.search_restaurants(text, double precision, double precision) from public, anon;
grant execute on function public.search_restaurants(text, double precision, double precision) to authenticated;

-- ============================================================================================
-- 3. Near-me search on our own table
-- What's around a spot, nearest first, from Crumbs' own restaurants (members' places, open data,
-- and the Overture import once it's in). The app asks this first and only goes to OpenStreetMap
-- or Google when it doesn't have enough. Uses the existing (latitude, longitude) index.
-- ============================================================================================
create or replace function public.restaurants_near(
  lat double precision, lng double precision, km double precision default 1.5,
  q text default null, lim int default 40)
returns table (id uuid, source_key text, name text, cuisine text, formatted_address text,
               latitude double precision, longitude double precision, website text,
               google_maps_url text, distance_km double precision)
language sql stable security definer set search_path = public, extensions as $$
  with box as (
    select least(greatest(coalesce(km, 1.5), 0.1), 25) as k,
           public.fold(trim(coalesce(q, ''))) as t)
  select r.id, r.source_key, r.name, r.cuisine, r.formatted_address, r.latitude, r.longitude,
         r.website, r.google_maps_url,
         round((6371 * 2 * asin(sqrt(
           power(sin(radians(r.latitude - lat) / 2), 2) +
           cos(radians(lat)) * cos(radians(r.latitude)) * power(sin(radians(r.longitude - lng) / 2), 2))))::numeric, 3)::double precision
    from public.restaurants r, box
   where r.latitude between lat - box.k / 111.0 and lat + box.k / 111.0
     and r.longitude between lng - box.k / (111.0 * greatest(cos(radians(lat)), 0.2))
                         and lng + box.k / (111.0 * greatest(cos(radians(lat)), 0.2))
     and coalesce(r.business_status, 'OPERATIONAL') not in ('CLOSED_PERMANENTLY')
     and (box.t = '' or r.search_name like '%' || box.t || '%' or public.fold(r.cuisine) like '%' || box.t || '%')
   order by 10
   limit least(greatest(coalesce(lim, 40), 1), 100)
$$;
revoke execute on function public.restaurants_near(double precision, double precision, double precision, text, int) from public, anon;
grant execute on function public.restaurants_near(double precision, double precision, double precision, text, int) to authenticated;

-- ============================================================================================
-- 4. The Overture import (decided Nov 12)
-- Food places for the whole GTA from Overture Maps (open data, CDLA Permissive 2.0) are loaded
-- into this holding table (scripts/overture/README.md), then merged into restaurants a few
-- thousand at a time: a place already in Crumbs (same name, within 80 m) gets its Overture id and
-- only its EMPTY details filled; anything new becomes a restaurant with source "overture". Imported
-- restaurants appear in search and nearby only — pins are still only the places groups save.
-- Never overwrites a detail members, the owner or the restaurant's website gave.
-- ============================================================================================
create table if not exists public.overture_places (
  id text primary key check (char_length(id) <= 64),
  name text not null check (char_length(name) between 1 and 160),
  name_local text,
  category text,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  city text,
  postcode text,
  phone text,
  website text,
  brand text,
  confidence real,
  release text,
  loaded_at timestamptz not null default now(),
  merged_at timestamptz,
  merged_into uuid references public.restaurants(id) on delete set null,
  matched boolean
);
create index if not exists overture_places_unmerged_idx on public.overture_places (loaded_at) where merged_at is null;
create index if not exists overture_places_merged_into_idx on public.overture_places (merged_into);
alter table public.overture_places enable row level security;
drop policy if exists overture_places_admin on public.overture_places;
create policy overture_places_admin on public.overture_places for select to authenticated using (public.is_crumbs_admin());

-- Overture's food categories → the words Crumbs uses for cuisine.
create or replace function public.overture_cuisine(category text)
returns text language sql immutable set search_path = public as $$
  select case
    when category is null then null
    when category in ('restaurant', 'food', 'eat_and_drink') then null
    when category like '%coffee%' or category like '%cafe%' then 'Café'
    when category like '%bakery%' then 'Bakery'
    when category like '%pizza%' then 'Pizza'
    when category like '%sushi%' then 'Sushi'
    when category like '%burger%' then 'Burgers'
    when category like '%bar%' or category like '%pub%' then 'Bar'
    when category like '%_restaurant' then initcap(replace(replace(category, '_restaurant', ''), '_', ' '))
    else initcap(replace(category, '_', ' '))
  end
$$;

create or replace function public.merge_overture(batch int default 2000)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.overture_places;
  hit uuid;
  linked int := 0;
  added int := 0;
  skipped int := 0;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and not public.is_crumbs_admin() then
    raise exception 'Only a Crumbs admin can do this';
  end if;
  for p in select * from public.overture_places where merged_at is null order by id
           limit least(greatest(coalesce(batch, 2000), 1), 10000) loop
    begin
      select r.id into hit from public.restaurants r
       where r.overture_id = p.id
          or (r.latitude between p.latitude - 0.0008 and p.latitude + 0.0008
              and r.longitude between p.longitude - 0.0011 and p.longitude + 0.0011
              and extensions.similarity(r.search_name, public.fold(p.name)) > 0.45)
       order by (r.overture_id = p.id) desc, extensions.similarity(r.search_name, public.fold(p.name)) desc
       limit 1;
      if hit is not null then
        -- Already known: link it and fill only what's empty.
        update public.restaurants r set
          overture_id = coalesce(r.overture_id, p.id),
          formatted_address = coalesce(r.formatted_address, nullif(concat_ws(', ', p.address, p.city), '')),
          phone = coalesce(r.phone, p.phone),
          website = coalesce(r.website, p.website),
          cuisine = coalesce(r.cuisine, public.overture_cuisine(p.category)),
          name_local = coalesce(r.name_local, p.name_local),
          sources = r.sources
            || case when r.formatted_address is null and p.address is not null then '{"address":"overture"}'::jsonb else '{}'::jsonb end
            || case when r.phone is null and p.phone is not null then '{"phone":"overture"}'::jsonb else '{}'::jsonb end
            || case when r.website is null and p.website is not null then '{"website":"overture"}'::jsonb else '{}'::jsonb end
         where r.id = hit and (r.overture_id is null or r.overture_id = p.id);
        update public.overture_places set merged_at = now(), merged_into = hit, matched = true where id = p.id;
        linked := linked + 1;
      else
        insert into public.restaurants (source_key, name, name_local, formatted_address, latitude, longitude,
                                        cuisine, phone, website, overture_id, sources)
        values ('ovt:' || p.id, left(p.name, 160), p.name_local, nullif(concat_ws(', ', p.address, p.city), ''),
                p.latitude, p.longitude, public.overture_cuisine(p.category), p.phone, p.website, p.id,
                jsonb_strip_nulls(jsonb_build_object('name', 'overture', 'location', 'overture',
                  'address', case when p.address is not null then 'overture' end,
                  'phone', case when p.phone is not null then 'overture' end,
                  'website', case when p.website is not null then 'overture' end)))
        on conflict (source_key) do nothing
        returning id into hit;
        update public.overture_places set merged_at = now(), merged_into = hit, matched = false where id = p.id;
        added := added + 1;
      end if;
    exception when others then
      update public.overture_places set merged_at = now(), matched = null where id = p.id;
      skipped := skipped + 1;
    end;
    hit := null;
  end loop;
  return jsonb_build_object('linked', linked, 'added', added, 'skipped', skipped,
    'waiting', (select count(*) from public.overture_places where merged_at is null));
end $$;

create or replace function public.admin_overture()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can see this'; end if;
  return jsonb_build_object(
    'loaded', (select count(*) from public.overture_places),
    'waiting', (select count(*) from public.overture_places where merged_at is null),
    'linked', (select count(*) from public.overture_places where matched),
    'added', (select count(*) from public.overture_places where matched = false),
    'skipped', (select count(*) from public.overture_places where merged_at is not null and matched is null),
    'release', (select max(release) from public.overture_places),
    'restaurants', (select count(*) from public.restaurants));
end $$;
revoke execute on function public.merge_overture(int), public.admin_overture() from public, anon;
grant execute on function public.merge_overture(int), public.admin_overture() to authenticated;

-- ============================================================================================
-- 5. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261118_round79')
on conflict (name) do nothing;
