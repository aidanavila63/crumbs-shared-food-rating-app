-- Round 46: Crumbs owns its restaurant facts.
-- Every fact on a shared restaurant profile now remembers when it was last checked (source_at),
-- the restaurant's own website becomes a source ('site'), owned facts flow down to every group's
-- copy of the place, and an admin can forget Google-only facts once they're older than Google
-- allows (before Crumbs goes public: only the Google place ID may be kept for good).
--
-- Who wins, best first: owner > crumbs (members) > site (the restaurant's own website)
--                       > osm (OpenStreetMap) > google (temporary).

alter table public.restaurants add column if not exists source_at jsonb not null default '{}'::jsonb;
alter table public.restaurants add column if not exists site_checked_at timestamptz;

create or replace function public.source_rank(src text)
returns integer language sql immutable as $$
  select case src when 'owner' then 5 when 'crumbs' then 4 when 'site' then 3
                  when 'osm' then 2 when 'google' then 1 else 0 end
$$;

-- Each fact's current value as text, to notice when one changes.
create or replace function public.fact_values(r public.restaurants)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'name', r.name,
    'address', r.formatted_address,
    'location', case when r.latitude is null then null else r.latitude::text || ',' || r.longitude::text end,
    'cuisine', r.cuisine,
    'price_level', r.price_level::text,
    'website', r.website,
    'hours', r.opening_hours::text,
    'status', r.business_status,
    'phone', r.phone)
$$;

-- Same as before, plus: a fact whose value or source changes gets today's date. (Functions that
-- re-confirm an unchanged fact set its date themselves.) Facts that are gone lose their date.
create or replace function public.fill_restaurant_sources()
returns trigger language plpgsql as $$
declare
  changed jsonb;
begin
  new.sources := public.default_sources(new) || coalesce(new.sources, '{}'::jsonb);
  if new.google_place_id is null and new.source_key not like 'osm:%' then new.google_place_id := new.source_key; end if;
  if tg_op = 'INSERT' then
    select coalesce(jsonb_object_agg(k, now()), '{}'::jsonb) into changed from jsonb_object_keys(new.sources) k;
  else
    select coalesce(jsonb_object_agg(e.key, now()), '{}'::jsonb) into changed
      from jsonb_each(public.fact_values(new)) e
     where e.value is distinct from public.fact_values(old)->e.key
        or new.sources->e.key is distinct from old.sources->e.key;
  end if;
  new.source_at := coalesce(new.source_at, '{}'::jsonb) || changed;
  new.source_at := new.source_at - coalesce((select array_agg(k) from jsonb_object_keys(new.source_at) k
                                              where not new.sources ? k), '{}'::text[]);
  return new;
end $$;

-- Dates for facts that were already there: when a member checked it, when open data was read,
-- when Google was last asked, or when the profile was made.
update public.restaurants r set source_at = (
  select coalesce(jsonb_object_agg(e.key, coalesce(
           (r.verified->e.key->>'at')::timestamptz,
           case when e.value = 'osm' then r.osm_checked_at end,
           case when e.key in ('hours', 'status') then r.hours_checked_at end,
           r.details_checked_at, r.created_at)), '{}'::jsonb)
    from jsonb_each_text(r.sources) e)
 where r.source_at = '{}'::jsonb and r.sources <> '{}'::jsonb;

-- Facts the restaurant publishes on its own website (schema.org data, read by /api/site-info).
-- They're the restaurant's own facts, not Google's, so Crumbs may keep them. They replace Google
-- and open data, never what members or the owner told us. Returns the fields that were taken.
create or replace function public.merge_site_data(target uuid, data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
  took text[] := '{}';
  f text;
  ok boolean;
begin
  if not public.my_restaurant(target) then raise exception 'Not one of your restaurants'; end if;
  select * into r from public.restaurants where id = target;
  -- A restaurant that manages its own page keeps it current itself.
  if not coalesce(r.owner_verified, false) and jsonb_typeof(data) = 'object' then
    foreach f in array array['hours', 'phone', 'cuisine', 'price_level', 'address', 'location', 'website'] loop
      continue when not data ? f;
      continue when public.source_rank(r.sources->>f) > public.source_rank('site');
      ok := case f
        when 'hours' then jsonb_typeof(data->'hours'->'periods') = 'array'
                          and jsonb_array_length(data->'hours'->'periods') between 1 and 50
        when 'phone' then regexp_replace(coalesce(data->>'phone', ''), '\D', '', 'g') ~ '^\d{6,20}$'
        when 'cuisine' then char_length(coalesce(data->>'cuisine', '')) between 1 and 60
        when 'price_level' then jsonb_typeof(data->'price_level') = 'number' and (data->>'price_level')::numeric in (1, 2, 3, 4)
        when 'address' then char_length(coalesce(data->>'address', '')) between 5 and 300
        when 'location' then jsonb_typeof(data->'location'->'lat') = 'number' and jsonb_typeof(data->'location'->'lng') = 'number'
                             and abs((data->'location'->>'lat')::float8) <= 90 and abs((data->'location'->>'lng')::float8) <= 180
        when 'website' then coalesce(data->>'website', '') ~* '^https?://' and char_length(data->>'website') <= 300
        else false end;
      if ok then took := took || f; end if;
    end loop;
  end if;
  update public.restaurants set
    opening_hours = case when 'hours' = any(took) then data->'hours' else opening_hours end,
    hours_checked_at = case when 'hours' = any(took) then now() else hours_checked_at end,
    phone = case when 'phone' = any(took) then left(data->>'phone', 40) else phone end,
    cuisine = case when 'cuisine' = any(took) then left(data->>'cuisine', 60) else cuisine end,
    price_level = case when 'price_level' = any(took) then (data->>'price_level')::smallint else price_level end,
    formatted_address = case when 'address' = any(took) then left(data->>'address', 300) else formatted_address end,
    latitude = case when 'location' = any(took) then (data->'location'->>'lat')::float8 else latitude end,
    longitude = case when 'location' = any(took) then (data->'location'->>'lng')::float8 else longitude end,
    website = case when 'website' = any(took) then data->>'website' else website end,
    sources = sources || coalesce((select jsonb_object_agg(t, 'site') from unnest(took) t), '{}'::jsonb),
    source_at = source_at || coalesce((select jsonb_object_agg(t, now()) from unnest(took) t), '{}'::jsonb),
    site_checked_at = now(),
    updated_at = now()
  where id = target;
  return jsonb_build_object('applied', to_jsonb(took));
end $$;
revoke execute on function public.merge_site_data(uuid, jsonb) from public, anon;
grant execute on function public.merge_site_data(uuid, jsonb) to authenticated;

-- Open data re-confirming a fact it already gave us keeps that fact's date fresh.
create or replace function public.touch_open_data(target uuid, fields text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.my_restaurant(target) then raise exception 'Not one of your restaurants'; end if;
  update public.restaurants set source_at = source_at || coalesce(
    (select jsonb_object_agg(f, now()) from unnest(fields) f where sources->>f = 'osm'), '{}'::jsonb)
   where id = target;
end $$;
revoke execute on function public.touch_open_data(uuid, text[]) from public, anon;
grant execute on function public.touch_open_data(uuid, text[]) to authenticated;

-- Facts Crumbs owns flow down to every group's copy of the place, so groups stop showing the
-- Google copy they saved. (Name and cuisine stay as each group wrote them.)
create or replace function public.share_owned_facts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.source_rank(new.sources->>'address') > 1 and new.formatted_address is not null
     and new.formatted_address is distinct from old.formatted_address then
    update public.places set formatted_address = new.formatted_address
     where restaurant_id = new.id and formatted_address is distinct from new.formatted_address;
  end if;
  if public.source_rank(new.sources->>'location') > 1 and new.latitude is not null
     and (new.latitude, new.longitude) is distinct from (old.latitude, old.longitude) then
    update public.places set latitude = new.latitude, longitude = new.longitude
     where restaurant_id = new.id and (latitude, longitude) is distinct from (new.latitude, new.longitude);
  end if;
  if public.source_rank(new.sources->>'website') > 1 and new.website is not null
     and new.website is distinct from old.website then
    update public.places set website = new.website
     where restaurant_id = new.id and website is distinct from new.website;
  end if;
  if public.source_rank(new.sources->>'hours') > 1 and new.opening_hours is not null
     and new.opening_hours is distinct from old.opening_hours then
    update public.places set opening_hours = new.opening_hours, hours_checked_at = new.hours_checked_at
     where restaurant_id = new.id and opening_hours is distinct from new.opening_hours;
  end if;
  return null;
end $$;
drop trigger if exists restaurants_share_owned on public.restaurants;
create trigger restaurants_share_owned after update on public.restaurants
  for each row execute function public.share_owned_facts();

-- A group that saves (or first opens) a restaurant gets Crumbs' own facts on its copy straight
-- away, instead of the Google copy it was saved with.
create or replace function public.place_takes_owned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
begin
  if new.restaurant_id is null or (tg_op = 'UPDATE' and new.restaurant_id is not distinct from old.restaurant_id) then
    return new;
  end if;
  select * into r from public.restaurants where id = new.restaurant_id;
  if r.id is null then return new; end if;
  if public.source_rank(r.sources->>'address') > 1 and r.formatted_address is not null then
    new.formatted_address := r.formatted_address;
  end if;
  if public.source_rank(r.sources->>'location') > 1 and r.latitude is not null then
    new.latitude := r.latitude; new.longitude := r.longitude;
  end if;
  if public.source_rank(r.sources->>'website') > 1 and r.website is not null then
    new.website := r.website;
  end if;
  if public.source_rank(r.sources->>'hours') > 1 and r.opening_hours is not null then
    new.opening_hours := r.opening_hours; new.hours_checked_at := r.hours_checked_at;
  end if;
  return new;
end $$;
drop trigger if exists places_take_owned on public.places;
create trigger places_take_owned before insert or update of restaurant_id on public.places
  for each row execute function public.place_takes_owned();

-- Once now: groups' copies of restaurants whose facts Crumbs already owns.
update public.places p set formatted_address = r.formatted_address from public.restaurants r
 where p.restaurant_id = r.id and public.source_rank(r.sources->>'address') > 1
   and r.formatted_address is not null and p.formatted_address is distinct from r.formatted_address;
update public.places p set latitude = r.latitude, longitude = r.longitude from public.restaurants r
 where p.restaurant_id = r.id and public.source_rank(r.sources->>'location') > 1
   and r.latitude is not null and (p.latitude, p.longitude) is distinct from (r.latitude, r.longitude);
update public.places p set website = r.website from public.restaurants r
 where p.restaurant_id = r.id and public.source_rank(r.sources->>'website') > 1
   and r.website is not null and p.website is distinct from r.website;
update public.places p set opening_hours = r.opening_hours, hours_checked_at = r.hours_checked_at from public.restaurants r
 where p.restaurant_id = r.id and public.source_rank(r.sources->>'hours') > 1
   and r.opening_hours is not null and p.opening_hours is distinct from r.opening_hours;

-- Before going public: forget every Google-only fact older than Google allows (30 days).
-- Dry run by default (just counts). The name stays (members confirm names through the "is this
-- right?" questions); everything else Google-only is cleared on the shared profile and on each
-- group's copy that still holds the same Google value. Facts from members, the owner, the
-- restaurant's website or OpenStreetMap are never touched. Admins only.
create or replace function public.forget_google_facts(apply boolean default false, days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(days, 0));
  counts jsonb;
  r record;
  gone text[];
  copies integer := 0;
  n integer;
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  select coalesce(jsonb_object_agg(field, total), '{}'::jsonb) into counts from (
    select e.key as field, count(*) as total
      from public.restaurants x, jsonb_each_text(x.sources) e
     where e.value = 'google' and e.key <> 'name'
       and coalesce((x.source_at->>e.key)::timestamptz, x.created_at) < cutoff
     group by e.key) s;
  if apply then
    for r in select * from public.restaurants x
              where exists (select 1 from jsonb_each_text(x.sources) e
                             where e.value = 'google' and e.key <> 'name'
                               and coalesce((x.source_at->>e.key)::timestamptz, x.created_at) < cutoff) loop
      select array_agg(e.key) into gone from jsonb_each_text(r.sources) e
       where e.value = 'google' and e.key <> 'name'
         and coalesce((r.source_at->>e.key)::timestamptz, r.created_at) < cutoff;
      -- Each group's copy, where it's still the same Google value.
      update public.places p set
        formatted_address = case when 'address' = any(gone) and p.formatted_address is not distinct from r.formatted_address then null else p.formatted_address end,
        latitude = case when 'location' = any(gone) and p.latitude is not distinct from r.latitude then null else p.latitude end,
        longitude = case when 'location' = any(gone) and p.longitude is not distinct from r.longitude then null else p.longitude end,
        price_level = case when 'price_level' = any(gone) and p.price_level is not distinct from r.price_level then null else p.price_level end,
        website = case when 'website' = any(gone) and p.website is not distinct from r.website then null else p.website end,
        cuisine = case when 'cuisine' = any(gone) and p.cuisine is not distinct from r.cuisine then null else p.cuisine end,
        opening_hours = case when 'hours' = any(gone) and p.opening_hours is not distinct from r.opening_hours then null else p.opening_hours end,
        business_status = case when 'status' = any(gone) and p.business_status is not distinct from r.business_status then null else p.business_status end
       where p.restaurant_id = r.id;
      get diagnostics n = row_count;
      copies := copies + n;
      update public.restaurants set
        formatted_address = case when 'address' = any(gone) then null else formatted_address end,
        latitude = case when 'location' = any(gone) then null else latitude end,
        longitude = case when 'location' = any(gone) then null else longitude end,
        price_level = case when 'price_level' = any(gone) then null else price_level end,
        website = case when 'website' = any(gone) then null else website end,
        cuisine = case when 'cuisine' = any(gone) then null else cuisine end,
        opening_hours = case when 'hours' = any(gone) then null else opening_hours end,
        hours_checked_at = case when 'hours' = any(gone) then null else hours_checked_at end,
        business_status = case when 'status' = any(gone) then null else business_status end,
        phone = case when 'phone' = any(gone) then null else phone end,
        sources = sources - gone,
        updated_at = now()
      where id = r.id;
    end loop;
  end if;
  return jsonb_build_object(
    'applied', apply,
    'fields', counts,
    'restaurants', (select count(*) from public.restaurants x where exists (
                      select 1 from jsonb_each_text(x.sources) e where e.value = 'google' and e.key <> 'name'
                        and coalesce((x.source_at->>e.key)::timestamptz, x.created_at) < cutoff)),
    'group_copies', copies,
    -- Saved before shared profiles existed and nobody has opened them since: still Google copies.
    'unlinked_places', (select count(*) from public.places
                         where restaurant_id is null and google_place_id not like 'osm:%' and google_place_id not like 'manual:%'),
    'names_to_check', (select count(*) from public.restaurants where sources->>'name' = 'google'));
end $$;
revoke execute on function public.forget_google_facts(boolean, integer) from public, anon;
grant execute on function public.forget_google_facts(boolean, integer) to authenticated;

-- Questions: their website counts like open data (fine to use, better confirmed); dates come
-- from source_at.
drop function if exists public.next_question(uuid);
create or replace function public.next_question(target uuid, skip text[] default '{}')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.restaurants;
  me uuid := auth.uid();
  pick record;
begin
  if not public.my_restaurant(target) then return null; end if;
  select * into r from public.restaurants where id = target;
  select * into pick from (
    select f.field,
      case when f.val is null then 1                                          -- missing
           when coalesce(r.sources->>f.field, 'google') = 'google' then 2      -- only Google's: can't keep it
           when not coalesce((r.verified->f.field->>'claimed')::boolean, false) and r.sources->>f.field = 'crumbs' then 3 -- one member said it: needs a cross-check
           when not coalesce((r.verified->f.field->>'claimed')::boolean, false) and r.sources->>f.field in ('osm', 'site') then 4 -- open data / their website: fine to use, better to own
           else 5 end as tier,                                                -- ours: re-check when due
      coalesce((r.verified->f.field->>'at')::timestamptz, (r.source_at->>f.field)::timestamptz,
               case when r.sources->>f.field = 'osm' then r.osm_checked_at end) as last_at
    -- (Price comes from menu prices; "still open?" isn't asked.)
    from (values
      ('hours', r.opening_hours::text), ('phone', r.phone), ('website', r.website), ('cuisine', r.cuisine),
      ('address', r.formatted_address), ('name', r.name),
      ('location', case when r.latitude is null then null else r.latitude::text end)
    ) as f(field, val)
    where not (f.field = any(skip))
      and not exists (select 1 from public.restaurant_question_skips k
                       where k.user_id = me and k.restaurant_id = target and k.field = f.field and k.until > now())
      and not exists (select 1 from public.restaurant_facts x
                       where x.user_id = me and x.restaurant_id = target and x.field = f.field
                         and x.created_at > now() - make_interval(days => least(public.fact_refresh_days(f.field), 365)))
      -- The restaurant's owner keeps their own details current.
      and coalesce(r.sources->>f.field, '') <> 'owner'
      and not (r.owner_verified and public.owner_locked(f.field))
  ) c
  where c.tier < 5 or c.last_at is null or c.last_at < now() - make_interval(days => public.fact_refresh_days(c.field))
  order by c.tier, c.last_at nulls first, md5(me::text || c.field || target::text)
  limit 1;
  if pick.field is null then return null; end if;
  return jsonb_build_object('field', pick.field,
                            'reason', case pick.tier when 1 then 'missing' when 2 then 'unowned' when 3 then 'unclaimed'
                                                     when 4 then 'open_data' else 'stale' end,
                            'checked_at', pick.last_at);
end $$;

-- Admin counts: the website counts as Crumbs' own; how much Google data is past its 30 days.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'groups', (select count(*) from public.groups),
    'places', (select count(*) from public.places),
    'ratings', (select count(*) from public.place_ratings),
    'visits', (select count(*) from public.place_visits),
    'meals', (select count(*) from public.home_meals),
    'active_7d', (select count(distinct actor) from public.activity where created_at > now() - interval '7 days'),
    'waitlist', (select count(*) from public.waitlist),
    'feedback', (select count(*) from public.feedback),
    'restaurants', (select count(*) from public.restaurants),
    'menu_dishes', (select count(*) from public.restaurant_dishes where hidden = false),
    -- How much of the restaurant data Crumbs owns (from members or open data, not Google).
    'owned_hours', (select count(*) from public.restaurants where sources->>'hours' in ('crumbs', 'osm', 'owner', 'site')),
    'owned_address', (select count(*) from public.restaurants where sources->>'address' in ('crumbs', 'osm', 'owner', 'site')),
    'owned_location', (select count(*) from public.restaurants where sources->>'location' in ('crumbs', 'osm', 'owner', 'site')),
    'site_fields', (select coalesce(sum((select count(*) from jsonb_each_text(r.sources) e where e.value = 'site')), 0) from public.restaurants r),
    'facts', (select count(*) from public.restaurant_facts),
    'claimed_facts', (select coalesce(sum((select count(*) from jsonb_each(r.verified) e where (e.value->>'claimed')::boolean)), 0) from public.restaurants r),
    'claimed_dishes', (select count(*) from public.restaurant_dishes where claimed),
    'claims_pending', (select count(*) from public.restaurant_claims where status = 'pending'),
    'owner_verified', (select count(*) from public.restaurants where owner_verified),
    -- Facts that are still only Google's (would need showing live, not stored, once public).
    'borrowed_fields', (select coalesce(sum((select count(*) from jsonb_each_text(r.sources) e where e.value = 'google')), 0) from public.restaurants r),
    -- ...of which older than Google's 30 days (what forget_google_facts would clear today).
    'borrowed_stale', (select coalesce(sum((select count(*) from jsonb_each_text(r.sources) e
                         where e.value = 'google' and e.key <> 'name'
                           and coalesce((r.source_at->>e.key)::timestamptz, r.created_at) < now() - interval '30 days')), 0)
                         from public.restaurants r),
    -- Free-tier meters: database (500 MB) and photo storage (1 GB).
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'crumbs-photos')
  );
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
