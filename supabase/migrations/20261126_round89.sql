-- Round 89 (Nov 17): owner tools — tap counts (O3), table menu (O1), change all prices (O5),
-- "we moved / renamed / closed" (O7), "Owner says" tags (O14).
-- Safe to run more than once. The app works before this runs (the new owner sections say
-- they aren't switched on yet, and the public page just doesn't count taps).

-- ============================================================================================
-- 1. Columns: the owner's own tags and their "big change" notice
-- ============================================================================================
alter table public.restaurants add column if not exists owner_tags text[];
alter table public.restaurants add column if not exists owner_notice jsonb;
alter table public.restaurants drop constraint if exists restaurants_owner_tags_ok;
alter table public.restaurants add constraint restaurants_owner_tags_ok
  check (owner_tags is null or cardinality(owner_tags) <= 6);
alter table public.restaurants drop constraint if exists restaurants_owner_notice_ok;
alter table public.restaurants add constraint restaurants_owner_notice_ok
  check (owner_notice is null or (jsonb_typeof(owner_notice) = 'object'
         and coalesce(owner_notice ->> 'kind', '') in ('moved', 'renamed', 'closed')
         and char_length(coalesce(owner_notice ->> 'text', '')) <= 200));

-- ============================================================================================
-- 2. O14 "Owner says": up to 6 short tags the owner picks (Family-run, Since 1987…)
-- ============================================================================================
create or replace function public.owner_set_tags(target uuid, tags text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  clean text[] := '{}';
  t text;
begin
  if not public.manages_restaurant(target) then
    raise exception 'Only the restaurant''s verified owner can change its tags';
  end if;
  foreach t in array coalesce(tags, '{}') loop
    t := nullif(regexp_replace(btrim(t), '\s+', ' ', 'g'), '');
    continue when t is null;
    if char_length(t) < 2 or char_length(t) > 30 then raise exception 'Each tag is 2 to 30 characters'; end if;
    if t ~* '(https?:|www\.|\.com\b|@)' then raise exception 'Tags can''t be links or emails'; end if;
    if not (lower(t) = any (select lower(x) from unnest(clean) x)) then clean := clean || t; end if;
  end loop;
  if coalesce(array_length(clean, 1), 0) > 6 then raise exception 'Up to 6 tags'; end if;
  update public.restaurants set owner_tags = nullif(clean, '{}'), updated_at = now() where id = target;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = auth.uid();
  return clean;
end $$;
revoke execute on function public.owner_set_tags(uuid, text[]) from public, anon;
grant execute on function public.owner_set_tags(uuid, text[]) to authenticated;

-- ============================================================================================
-- 3. O7 "We moved / we have a new name / we closed": changes the detail and puts a notice on the
--    page (90 days for moved and renamed; while closed for closed). A new name keeps the old one
--    under "Also known as" so search still finds it.
-- ============================================================================================
create or replace function public.owner_big_change(target uuid, change text, new_value text default null,
                                                   note text default null,
                                                   lat double precision default null, lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants%rowtype;
  val text := nullif(btrim(coalesce(new_value, '')), '');
  msg text := nullif(btrim(coalesce(note, '')), '');
  today date := (now() at time zone 'America/Toronto')::date;
  notice jsonb;
  others text[];
begin
  if not public.manages_restaurant(target) then
    raise exception 'Only the restaurant''s verified owner can do this';
  end if;
  if msg is not null and char_length(msg) > 200 then raise exception 'Keep the note to 200 characters'; end if;
  select * into r from public.restaurants where id = target;
  if change = 'clear' then
    update public.restaurants set owner_notice = null, updated_at = now() where id = target;
    return null;
  elsif change = 'renamed' then
    if val is null or char_length(val) > 160 then raise exception 'Type the new name (160 characters at most)'; end if;
    if lower(val) = lower(r.name) then raise exception 'That''s the name you have now'; end if;
    perform public.contribute_fact(target, 'name', to_jsonb(val), 'in_person');
    select coalesce(array_agg(x order by o), '{}') into others
      from (select x, min(o) as o
              from unnest(array[r.name] || coalesce(r.aka, '{}')) with ordinality as u(x, o)
             where lower(btrim(x)) <> lower(val)
             group by x) s;
    others := others[1:8];
    perform public.set_restaurant_names(target, r.name_local, others);
    notice := jsonb_build_object('kind', 'renamed', 'old', r.name, 'text', msg, 'at', today, 'until', today + 90);
  elsif change = 'moved' then
    if val is null or char_length(val) > 300 then raise exception 'Type the new address'; end if;
    perform public.contribute_fact(target, 'address', to_jsonb(val), 'in_person');
    if lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180 then
      perform public.contribute_fact(target, 'location', jsonb_build_object('lat', lat, 'lng', lng), 'in_person');
    end if;
    notice := jsonb_build_object('kind', 'moved', 'old', r.formatted_address, 'text', msg, 'at', today, 'until', today + 90);
  elsif change = 'closed' then
    perform public.contribute_fact(target, 'status', to_jsonb('CLOSED_PERMANENTLY'::text), 'in_person');
    notice := jsonb_build_object('kind', 'closed', 'text', msg, 'at', today);
  else
    raise exception 'Unknown change';
  end if;
  update public.restaurants set owner_notice = jsonb_strip_nulls(notice), updated_at = now() where id = target;
  return jsonb_strip_nulls(notice);
end $$;
revoke execute on function public.owner_big_change(uuid, text, text, text, double precision, double precision) from public, anon;
grant execute on function public.owner_big_change(uuid, text, text, text, double precision, double precision) to authenticated;

-- ============================================================================================
-- 4. O5 Change all prices by a percentage (optionally one course only). Rounded to 5 cents.
-- ============================================================================================
create or replace function public.owner_bulk_price(target uuid, pct numeric, only_course text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can do this'; end if;
  if pct is null or pct = 0 or pct < -50 or pct > 100 then raise exception 'Pick a change between -50%% and +100%%'; end if;
  if only_course is not null and only_course not in ('starter', 'main', 'side', 'dessert', 'drink') then
    raise exception 'Unknown course';
  end if;
  update public.restaurant_dishes
     set price = least(9999.95, round(price * (1 + pct / 100.0) * 20) / 20.0),
         price_set_at = now(), price_checked_at = now(), owner_ok = true, claimed = true
   where restaurant_id = target and price is not null and price > 0 and not hidden
     and (only_course is null or course = only_course);
  get diagnostics n = row_count;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = auth.uid();
  perform public.refresh_menu_price(target);
  perform public.menu_settle(target);
  return n;
end $$;
revoke execute on function public.owner_bulk_price(uuid, numeric, text) from public, anon;
grant execute on function public.owner_bulk_price(uuid, numeric, text) to authenticated;

-- ============================================================================================
-- 5. O3 Tap counts: Call, Website, Directions, Book, Menu, Table menu (the QR on the table).
--    Only on owner-verified pages. One count per visitor per kind per day (Toronto). Signed-in
--    people count by their account, everyone else by a random id their browser keeps; both are
--    stored hashed and only for two days. At most 500 a day per page and kind. The owner sees
--    totals for the last 30 days (and the 30 before); 1 or 2 show as "fewer than 3". Never who.
--    The owner's own taps don't count.
-- ============================================================================================
create table if not exists public.restaurant_taps (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null check (kind in ('call', 'website', 'directions', 'book', 'menu', 'table_menu')),
  day date not null,
  n integer not null default 0 check (n >= 0),
  primary key (restaurant_id, kind, day)
);
alter table public.restaurant_taps enable row level security;
-- (no policies: counted and read through the functions below)

create table if not exists public.restaurant_tap_seen (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind text not null,
  day date not null,
  who text not null,
  primary key (restaurant_id, kind, day, who)
);
alter table public.restaurant_tap_seen enable row level security;

create or replace function public.count_tap(target uuid, what text, visitor text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  today date := (now() at time zone 'America/Toronto')::date;
  me uuid := auth.uid();
  who text;
  so_far integer;
begin
  if what not in ('call', 'website', 'directions', 'book', 'menu', 'table_menu') then return false; end if;
  if me is null and (visitor is null or visitor !~ '^[A-Za-z0-9-]{8,64}$') then return false; end if;
  if not exists (select 1 from public.restaurants where id = target and owner_verified) then return false; end if;
  if me is not null and public.manages_restaurant(target) then return false; end if;
  select n into so_far from public.restaurant_taps where restaurant_id = target and kind = what and day = today;
  if coalesce(so_far, 0) >= 500 then return false; end if;
  who := md5(coalesce(me::text, 'v:' || visitor) || ':' || target::text);
  insert into public.restaurant_tap_seen (restaurant_id, kind, day, who) values (target, what, today, who)
  on conflict do nothing;
  if not found then return false; end if;
  insert into public.restaurant_taps (restaurant_id, kind, day, n) values (target, what, today, 1)
  on conflict (restaurant_id, kind, day) do update set n = restaurant_taps.n + 1;
  -- now and then, forget who tapped before yesterday
  if random() < 0.05 then delete from public.restaurant_tap_seen where day < today - 1; end if;
  return true;
end $$;
revoke execute on function public.count_tap(uuid, text, text) from public;
grant execute on function public.count_tap(uuid, text, text) to anon, authenticated;

-- The owner's numbers, plus the page's link (for the table QR).
create or replace function public.owner_tools(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/Toronto')::date;
  sl record;
  taps jsonb;
begin
  if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then raise exception 'Owners only'; end if;
  select city, slug into sl from public.restaurant_slugs where restaurant_id = target and is_current;
  select coalesce(jsonb_object_agg(k.kind, jsonb_build_object(
           'last30', case when coalesce(t.recent, 0) between 1 and 2 then null else coalesce(t.recent, 0) end,
           'before', case when coalesce(t.before, 0) between 1 and 2 then null else coalesce(t.before, 0) end)), '{}')
    into taps
    from unnest(array['call', 'website', 'directions', 'book', 'menu', 'table_menu']) as k(kind)
    left join (select kind,
                      sum(n) filter (where day > today - 30) as recent,
                      sum(n) filter (where day <= today - 30 and day > today - 60) as before
                 from public.restaurant_taps
                where restaurant_id = target and day > today - 60
                group by kind) t on t.kind = k.kind;
  return jsonb_build_object('city', sl.city, 'slug', sl.slug, 'taps', taps);
end $$;
revoke execute on function public.owner_tools(uuid) from public, anon;
grant execute on function public.owner_tools(uuid) to authenticated;

-- ============================================================================================
-- 6. The restaurant page shows the owner's tags and notice (owner-verified pages only)
-- ============================================================================================
create or replace function public.restaurant_owner_bits(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner_tags', case when r.owner_verified then coalesce(to_jsonb(r.owner_tags), '[]'::jsonb) else '[]'::jsonb end,
    'owner_notice', case when r.owner_verified and r.owner_notice is not null
                          and (r.owner_notice ->> 'until' is null
                               or (r.owner_notice ->> 'until')::date >= (now() at time zone 'America/Toronto')::date)
                         then r.owner_notice end)
    from public.restaurants r where r.id = target
$$;
revoke execute on function public.restaurant_owner_bits(uuid) from public, anon, authenticated;

create or replace function public.restaurant_public(city_slug text, rest_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.restaurant_slugs%rowtype; cur public.restaurant_slugs%rowtype;
begin
  select * into s from public.restaurant_slugs
   where city = lower(coalesce(city_slug, '')) and slug = lower(coalesce(rest_slug, ''));
  if not found then return null; end if;
  if not s.is_current then
    select * into cur from public.restaurant_slugs where restaurant_id = s.restaurant_id and is_current;
    return jsonb_build_object('redirect', jsonb_build_object('city', cur.city, 'slug', cur.slug));
  end if;
  return public.restaurant_public_data(s.restaurant_id) || coalesce(public.restaurant_owner_bits(s.restaurant_id), '{}'::jsonb);
end $$;
revoke execute on function public.restaurant_public(text, text) from public;
grant execute on function public.restaurant_public(text, text) to anon, authenticated;

create or replace function public.restaurant_public_by_id(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.restaurant_public_data(target) || coalesce(public.restaurant_owner_bits(target), '{}'::jsonb)
   where auth.uid() is not null
$$;
revoke execute on function public.restaurant_public_by_id(uuid) from public, anon;
grant execute on function public.restaurant_public_by_id(uuid) to authenticated;

-- ============================================================================================
-- 7. Overture: the real data (release 2026-10-21.0) names food places with its new "taxonomy"
--    (e.g. barbecue_restaurant, bar_and_grill_restaurant, bubble_tea_shop). Round 79's mapping
--    turned barbecue into "Bar"; this one reads them properly.
-- ============================================================================================
create or replace function public.overture_cuisine(category text)
returns text language sql immutable set search_path = public as $$
  select case
    when category is null then null
    when category in ('restaurant', 'food', 'eat_and_drink', 'food_and_drink', 'casual_eatery',
                      'theme_restaurant', 'international_fusion_restaurant', 'food_court', 'cafeteria') then null
    when category like '%coffee%' or category like '%cafe%' or category = 'tea_room' then 'Café'
    when category like '%bakery%' or category in ('cupcake_shop', 'pie_shop', 'pretzel_shop', 'macaron_shop') then 'Bakery'
    when category like '%pizza%' then 'Pizza'
    when category like '%sushi%' then 'Sushi'
    when category like '%burger%' then 'Burgers'
    when category like '%barbecue%' then 'Barbecue'
    when category = 'bar_and_grill_restaurant' then 'Bar & grill'
    when category = 'breakfast_and_brunch_restaurant' or category = 'pancake_house' then 'Breakfast & brunch'
    when category = 'fast_food_restaurant' then 'Fast food'
    when category = 'fish_and_chips_restaurant' then 'Fish & chips'
    when category = 'chicken_wings_restaurant' then 'Wings'
    when category = 'texmex_restaurant' then 'Tex-Mex'
    when category = 'smoothie_juice_bar' then 'Juice bar'
    when category = 'salad_bar' then 'Salads'
    when category = 'tapas_bar' then 'Tapas'
    when category = 'bubble_tea_shop' then 'Bubble tea'
    when category in ('ice_cream_shop', 'gelato_shop', 'frozen_yogurt_shop', 'shaved_ice_shop') then 'Ice cream'
    when category in ('dessert_shop', 'candy_store', 'chocolatier') then 'Desserts'
    when category = 'sandwich_shop' then 'Sandwiches'
    when category in ('donut_shop', 'bagel_shop') then initcap(replace(category, '_shop', 's'))
    when category = 'delicatessen' then 'Deli'
    when category = 'food_truck_stand' then 'Food truck'
    when category in ('brewery', 'distillery', 'winery', 'cidery') then initcap(category)
    when category like '%bar' or category like '%pub' or category in ('pub', 'lounge', 'gastropub', 'speakeasy', 'beer_garden') then 'Bar'
    when category like '%_restaurant' then initcap(replace(replace(category, '_restaurant', ''), '_', ' '))
    else initcap(replace(category, '_', ' '))
  end
$$;

-- A CSV loaded through Supabase's table editor can bring empty text instead of nothing.
create or replace function public.overture_places_tidy()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name_local := nullif(btrim(new.name_local), '');
  new.category := nullif(btrim(new.category), '');
  new.address := nullif(btrim(new.address), '');
  new.city := nullif(btrim(new.city), '');
  new.postcode := nullif(btrim(new.postcode), '');
  new.phone := nullif(btrim(new.phone), '');
  new.website := case when new.website ~* '^https?://' then btrim(new.website) end;
  new.brand := nullif(btrim(new.brand), '');
  return new;
end $$;
drop trigger if exists overture_places_tidy on public.overture_places;
create trigger overture_places_tidy before insert or update on public.overture_places
  for each row execute function public.overture_places_tidy();

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261126_round89') on conflict (name) do nothing;
