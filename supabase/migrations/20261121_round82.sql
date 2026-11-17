-- Round 82 (Nov 21): original-language names and "also known as" on pages, set by the owner (O10),
-- and a dish finder across Crumbs (U1). Safe to run more than once. Run after 20261120_round81.sql.
--   1. Owners set the restaurant's name in its own language and other names it goes by
--   2. Restaurant pages show them
--   3. Find a dish across Crumbs
--   4. Record of this file

-- ============================================================================================
-- 1. Other names (O10). Searched since Round 79; now owners (and Crumbs admins) can set them.
-- ============================================================================================
create or replace function public.set_restaurant_names(target uuid, local_name text, other_names text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  clean text[];
  n text;
  local_clean text := nullif(btrim(coalesce(local_name, '')), '');
begin
  if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then
    raise exception 'Only the restaurant''s verified owner can change its names';
  end if;
  if local_clean is not null and char_length(local_clean) > 160 then
    raise exception 'That name is too long (160 characters at most)';
  end if;
  clean := '{}';
  foreach n in array coalesce(other_names, '{}') loop
    n := nullif(btrim(n), '');
    continue when n is null;
    if char_length(n) > 80 then raise exception 'Each other name can be 80 characters at most'; end if;
    if not (lower(n) = any (select lower(x) from unnest(clean) x)) then clean := clean || n; end if;
  end loop;
  if array_length(clean, 1) > 8 then raise exception 'Up to 8 other names'; end if;
  update public.restaurants
     set name_local = local_clean, aka = clean,
         sources = sources || jsonb_build_object('name_local', 'owner', 'aka', 'owner')
   where id = target;
  return jsonb_build_object('name_local', local_clean, 'aka', to_jsonb(clean));
end $$;
revoke execute on function public.set_restaurant_names(uuid, text, text[]) from public, anon;
grant execute on function public.set_restaurant_names(uuid, text, text[]) to authenticated;

-- ============================================================================================
-- 2. Restaurant pages show them (same as Round 80's version plus name_local and aka)
-- ============================================================================================
create or replace function public.restaurant_public_data(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.restaurants%rowtype;
  sl record;
  own text[] := array['crumbs', 'osm', 'owner', 'site'];
  rs record;
  vs record;
  g3 boolean;
  v3 boolean;
  groups_n integer;
begin
  select * into r from public.restaurants where id = target;
  if not found then return null; end if;
  select city, slug into sl from public.restaurant_slugs where restaurant_id = target and is_current;

  select count(distinct p.group_id) as groups, count(*) as n,
         round(avg(coalesce(pr.points / 20.0, pr.score))::numeric, 1) as avg,
         count(*) filter (where pr.would_return = 'yes') as yes,
         count(*) filter (where pr.would_return is not null) as asked,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 5) as c5,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 4) as c4,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 3) as c3,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 2) as c2,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) <= 1) as c1
    into rs
    from public.place_ratings pr join public.places p on p.id = pr.place_id
   where p.restaurant_id = target and not coalesce(pr.draft, false);
  g3 := rs.groups >= 3;

  select count(*) as visits, count(distinct p.group_id) as groups,
         count(*) filter (where v.spend > 0 and v.people > 0) as paid,
         round(avg(v.spend / v.people) filter (where v.spend > 0 and v.people > 0), 0) as per_head,
         round(avg(v.spend / v.people) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('breakfast', 'lunch')), 0) as lunch,
         count(*) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('breakfast', 'lunch')) as lunch_n,
         round(avg(v.spend / v.people) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('dinner', 'late')), 0) as dinner,
         count(*) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('dinner', 'late')) as dinner_n,
         count(*) filter (where v.meal_time is not null) as timed,
         (select round(percentile_cont(0.5) within group (order by w.wait_minutes))::int
            from public.visits_for_totals w join public.places wp on wp.id = w.place_id
           where wp.restaurant_id = target and w.wait_minutes is not null and coalesce(w.kind, 'dine_in') = 'dine_in') as wait,
         (select count(*) from public.visits_for_totals w join public.places wp on wp.id = w.place_id
           where wp.restaurant_id = target and w.wait_minutes is not null and coalesce(w.kind, 'dine_in') = 'dine_in') as wait_n
    into vs
    from public.visits_for_totals v join public.places p on p.id = v.place_id
   where p.restaurant_id = target;
  v3 := vs.groups >= 3;
  select count(distinct group_id) into groups_n from public.places where restaurant_id = target;

  return jsonb_build_object(
    'id', r.id, 'name', r.name, 'name_local', r.name_local, 'aka', to_jsonb(r.aka), 'city', sl.city, 'slug', sl.slug,
    'claimed', r.owner_verified,
    'google_place_id', r.google_place_id,
    'cuisine', case when r.sources ->> 'cuisine' = any (own) then r.cuisine end,
    'price_level', case when r.sources ->> 'price_level' = any (own) then r.price_level end,
    'address', case when r.sources ->> 'address' = any (own) then r.formatted_address end,
    'phone', case when r.sources ->> 'phone' = any (own) then r.phone end,
    'website', case when r.sources ->> 'website' = any (own) then r.website end,
    'hours', case when r.sources ->> 'hours' = any (own) then r.opening_hours end,
    'business_status', case when r.sources ->> 'status' = any (own) then r.business_status end,
    'lat', case when r.sources ->> 'location' = any (own) then r.latitude end,
    'lng', case when r.sources ->> 'location' = any (own) then r.longitude end,
    'sources', (select coalesce(jsonb_object_agg(e.key, e.value), '{}')
                  from jsonb_each_text(r.sources) e where e.value = any (own)),
    -- Where each website-sourced fact was read and when, so the page can say "from lanternpho.com,
    -- checked Nov 4". Only the restaurant's own website; never anything else.
    'source_urls', (select coalesce(jsonb_object_agg(e.key, r.source_urls ->> e.key), '{}')
                      from jsonb_each_text(r.sources) e
                     where e.value = 'site' and coalesce(r.source_urls ->> e.key, '') ~* '^https?://'),
    'source_at', (select coalesce(jsonb_object_agg(e.key, r.source_at ->> e.key), '{}')
                    from jsonb_each_text(r.sources) e
                   where e.value = 'site' and r.source_at ? e.key),
    'saved_by_groups', case when groups_n >= 3 then groups_n end,
    'rating', case when g3 then jsonb_build_object(
        'avg', rs.avg, 'groups', rs.groups, 'ratings', rs.n,
        'hist', jsonb_build_object('5', rs.c5, '4', rs.c4, '3', rs.c3, '2', rs.c2, '1', rs.c1),
        'would_return', case when rs.asked >= 3 then round(100.0 * rs.yes / rs.asked) end) end,
    'visits', case when v3 then vs.visits end,
    'known_for', case when g3 then
        (select coalesce(jsonb_agg(jsonb_build_object('reason', t.reason, 'n', t.n) order by t.n desc, t.reason), '[]')
           from (select x.reason, count(distinct p.group_id) as n
                   from public.place_ratings pr join public.places p on p.id = pr.place_id
                   cross join lateral unnest(pr.reasons) as x(reason)
                  where p.restaurant_id = target and not coalesce(pr.draft, false)
                  group by x.reason having count(distinct p.group_id) >= 3
                  order by n desc, x.reason limit 6) t) else '[]'::jsonb end,
    'top_dishes', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'points', t.points, 'groups', t.groups)
                                              order by t.points desc, t.name), '[]')
                     from (select min(d.name) as name, round(avg(coalesce(dr.points, dr.score * 20)))::int as points,
                                  count(distinct p.group_id) as groups
                             from public.dishes d join public.places p on p.id = d.place_id
                             join public.dish_ratings dr on dr.dish_id = d.id
                            where p.restaurant_id = target
                            group by public.dish_key(d.name)
                           having count(distinct p.group_id) >= 3
                            order by 2 desc limit 6) t),
    'menu', (select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'price', m.price, 'course', m.course,
                                                          'dietary', m.dietary, 'description', m.description,
                                                          'claimed', m.claimed) order by m.claimed desc, m.name), '[]')
               from (select * from public.restaurant_dishes d where d.restaurant_id = target and not d.hidden
                      order by d.claimed desc, d.name limit 80) m),
    'spend', case when v3 and vs.paid >= 3 then jsonb_build_object(
        'per_head', vs.per_head,
        'lunch', case when vs.lunch_n >= 3 then vs.lunch end,
        'dinner', case when vs.dinner_n >= 3 then vs.dinner end) end,
    'wait', case when v3 and vs.wait_n >= 3 then vs.wait end,
    'busy', case when v3 and vs.timed >= 8 then
        (select coalesce(jsonb_agg(jsonb_build_object('dow', b.dow, 'meal', b.meal_time, 'n', b.n) order by b.n desc), '[]')
           from (select extract(dow from v.visited_on)::int as dow, v.meal_time, count(*) as n
                   from public.visits_for_totals v join public.places p on p.id = v.place_id
                  where p.restaurant_id = target and v.meal_time is not null
                  group by 1, 2 order by 3 desc limit 6) b) end,
    'good_to_know', (select coalesce(jsonb_object_agg(t.k, jsonb_build_object('verdict', t.verdict, 'owner', t.owner)), '{}')
                       from (select k, owner, case when owner is not null then owner
                                                   when y >= 2 and y > n then true
                                                   when n >= 2 and n > y then false end as verdict
                               from (select v.key as k,
                                            count(*) filter (where v.value) as y, count(*) filter (where not v.value) as n,
                                            bool_or(v.value) filter (where exists (select 1 from public.restaurant_managers m
                                                                                    where m.restaurant_id = target and m.user_id = v.user_id)) as owner
                                       from public.restaurant_attr_votes v where v.restaurant_id = target group by v.key) a) t
                      where t.verdict is not null),
    'tips', (select coalesce(jsonb_agg(jsonb_build_object('kind', t.kind, 'body', t.body, 'photo_path', t.photo_path)
                                       order by t.created_at desc), '[]')
               from (select * from public.restaurant_tips where restaurant_id = target
                        and kind in ('entrance', 'parking', 'storefront') order by created_at desc limit 8) t),
    'posts', case when r.owner_verified then
        (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'title', x.title, 'body', x.body,
                                                      'ends_on', x.ends_on) order by x.created_at desc), '[]')
           from (select * from public.restaurant_posts po
                  where po.restaurant_id = target
                    and (po.starts_on is null or po.starts_on <= current_date)
                    and (po.ends_on is null or po.ends_on >= current_date)
                    and (po.weekdays is null or extract(dow from current_date)::int = any (po.weekdays))
                  order by po.created_at desc limit 5) x) else '[]'::jsonb end);
end $$;

-- ============================================================================================
-- 3. Find a dish across Crumbs (U1)
-- Which restaurants have a dish on their Crumbs menu (owners' menus and the community menu, never
-- hidden ones), nearest first when you give a spot, otherwise most confirmed first. How many groups
-- have it and how they rate it only shows once 3 or more groups do (the usual rule for totals);
-- never who. Signed-in people only.
-- ============================================================================================
create index if not exists restaurant_dishes_name_trgm on public.restaurant_dishes
  using gin (public.fold(name) extensions.gin_trgm_ops);

create or replace function public.find_dish(q text, lat double precision default null, lng double precision default null,
                                            km double precision default 15, lim int default 30)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with term as (select public.fold(btrim(coalesce(q, ''))) as t,
                       least(greatest(coalesce(km, 15), 1), 50) as k),
  hits as (
    select distinct on (r.id)
           r.id, r.name, r.name_local, r.formatted_address, r.latitude, r.longitude, r.cuisine,
           d.name as dish, d.price, coalesce(d.owner_ok, false) as owner_ok, coalesce(d.confirms, 0) as confirms,
           case when lat is null or r.latitude is null then null
                else round((6371 * 2 * asin(sqrt(
                       power(sin(radians(r.latitude - lat) / 2), 2) +
                       cos(radians(lat)) * cos(radians(r.latitude)) * power(sin(radians(r.longitude - lng) / 2), 2))))::numeric, 2)
           end as distance_km
      from public.restaurant_dishes d
      join public.restaurants r on r.id = d.restaurant_id, term
     where length(term.t) >= 3
       and not coalesce(d.hidden, false)
       and (public.fold(d.name) like '%' || term.t || '%' or public.fold(d.name) % term.t)
       and coalesce(r.business_status, 'OPERATIONAL') <> 'CLOSED_PERMANENTLY'
       and (lat is null or (r.latitude between lat - term.k / 111.0 and lat + term.k / 111.0
            and r.longitude between lng - term.k / (111.0 * greatest(cos(radians(lat)), 0.2))
                                and lng + term.k / (111.0 * greatest(cos(radians(lat)), 0.2))))
     order by r.id, (public.fold(d.name) like '%' || term.t || '%') desc,
              extensions.similarity(public.fold(d.name), term.t) desc, coalesce(d.confirms, 0) desc
  ),
  loved as (
    select h.id, count(distinct p.group_id) as groups,
           round(avg(coalesce(dr.points, dr.score * 20))::numeric / 20.0, 1) as rating
      from hits h
      join public.places p on p.restaurant_id = h.id
      join public.dishes gd on gd.place_id = p.id and public.fold(gd.name) = public.fold(h.dish)
      left join public.dish_ratings dr on dr.dish_id = gd.id
     group by h.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', h.id, 'name', h.name, 'name_local', h.name_local, 'address', h.formatted_address,
           'cuisine', h.cuisine, 'lat', h.latitude, 'lng', h.longitude, 'distance_km', h.distance_km,
           'dish', h.dish, 'price', h.price, 'owner_ok', h.owner_ok, 'confirms', h.confirms,
           'groups', case when l.groups >= 3 then l.groups end,
           'rating', case when l.groups >= 3 then l.rating end,
           'city', sl.city, 'slug', sl.slug)
         order by h.distance_km nulls last, h.owner_ok desc, h.confirms desc, h.name), '[]'::jsonb)
    from (select * from hits order by distance_km nulls last, owner_ok desc, confirms desc
          limit least(greatest(coalesce(lim, 30), 1), 60)) h
    left join loved l on l.id = h.id
    left join public.restaurant_slugs sl on sl.restaurant_id = h.id and sl.is_current
$$;
revoke execute on function public.find_dish(text, double precision, double precision, double precision, int) from public, anon;
grant execute on function public.find_dish(text, double precision, double precision, double precision, int) to authenticated;

-- ============================================================================================
-- 4. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261121_round82')
on conflict (name) do nothing;
