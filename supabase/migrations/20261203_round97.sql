-- Round 97 (Nov 18): O5 menu extras for owners — when a dish is served (breakfast, lunch, dinner,
-- late), seasonal dishes (shown only between two dates) and more than one menu (Brunch, Drinks,
-- Kids…). Plus (app only) the "Our group" tab redesign and a wider layout on computers.
-- Safe to run more than once; the app works before it runs.

alter table public.restaurant_dishes add column if not exists served text[];
alter table public.restaurant_dishes add column if not exists menu_name text;
alter table public.restaurant_dishes add column if not exists season_from date;
alter table public.restaurant_dishes add column if not exists season_to date;
alter table public.restaurant_dishes drop constraint if exists restaurant_dishes_extras_ok;
alter table public.restaurant_dishes add constraint restaurant_dishes_extras_ok check (
  (served is null or (served <@ array['breakfast', 'lunch', 'dinner', 'late'] and cardinality(served) between 1 and 4))
  and (menu_name is null or char_length(menu_name) between 1 and 30)
  and (season_from is null or season_to is null or season_from <= season_to));

create or replace function public.owner_dish_extras(target_dish uuid, served_at text[], menu text,
                                                    from_day date, to_day date)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.restaurant_dishes where id = target_dish;
  if rid is null or not public.manages_restaurant(rid) then raise exception 'Only the restaurant can do this'; end if;
  if from_day is not null and to_day is not null and from_day > to_day then
    raise exception 'The season has to start before it ends';
  end if;
  update public.restaurant_dishes
     set served = nullif(served_at, '{}'),
         menu_name = nullif(btrim(coalesce(menu, '')), ''),
         season_from = from_day, season_to = to_day
   where id = target_dish;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = rid and user_id = auth.uid();
  return true;
end $$;
revoke execute on function public.owner_dish_extras(uuid, text[], text, date, date) from public, anon;
grant execute on function public.owner_dish_extras(uuid, text[], text, date, date) to authenticated;

-- The restaurant page's data: Round 82's version, with the menu's new fields (and out-of-season
-- dishes left out).
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
                                                          'claimed', m.claimed, 'served', to_jsonb(m.served),
                                                          'menu_name', m.menu_name, 'until', m.season_to)
                                       order by m.claimed desc, m.name), '[]')
               from (select * from public.restaurant_dishes d where d.restaurant_id = target and not d.hidden
                        -- Round 97: seasonal dishes only in their season (Toronto's date)
                        and (d.season_from is null or d.season_from <= (now() at time zone 'America/Toronto')::date)
                        and (d.season_to is null or d.season_to >= (now() at time zone 'America/Toronto')::date)
                      order by d.claimed desc, d.name limit 120) m),
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

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261203_round97') on conflict (name) do nothing;
