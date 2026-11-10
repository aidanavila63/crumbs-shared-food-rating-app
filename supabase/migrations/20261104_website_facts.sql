-- Round 55: where a website fact came from, a budget for reading websites, and an admin
-- "re-pull stale places" button. Safe to run twice. Run after 20261103_public_pages.sql.
--
-- 1. Each fact read off a restaurant's own website remembers the page it came from
--    (restaurants.source_urls). Its date is already in source_at.
-- 2. The public page hands out those addresses and dates (website-sourced facts only).
-- 3. 'website' joins the spending guard (usage_budgets): reading a site costs nothing, but it is
--    still outside traffic, so it gets the same per-person and overall limits as everything else.
-- 4. admin_recheck_open_data(): clears the "last checked" stamps on places that still hold only
--    Google's facts or were last checked a while ago, so the next time someone opens the place
--    OpenStreetMap and the website are read again (inside the budgets). Admins only.

alter table public.restaurants add column if not exists source_urls jsonb not null default '{}'::jsonb;

create or replace function public.merge_site_data(target uuid, data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
  took text[] := '{}';
  f text;
  ok boolean;
  page text := case when coalesce(data->>'source_url', '') ~* '^https?://' and char_length(data->>'source_url') <= 300
                    then data->>'source_url' end;
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
    -- The page each fact was read from (shown on the public page next to the date).
    source_urls = case when page is null then source_urls
                       else source_urls || coalesce((select jsonb_object_agg(t, page) from unnest(took) t), '{}'::jsonb) end,
    site_checked_at = now(),
    updated_at = now()
  where id = target;
  return jsonb_build_object('applied', to_jsonb(took));
end $$;
revoke execute on function public.merge_site_data(uuid, jsonb) from public, anon;
grant execute on function public.merge_site_data(uuid, jsonb) to authenticated;

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
            from public.place_visits w join public.places wp on wp.id = w.place_id
           where wp.restaurant_id = target and w.wait_minutes is not null and coalesce(w.kind, 'dine_in') = 'dine_in') as wait,
         (select count(*) from public.place_visits w join public.places wp on wp.id = w.place_id
           where wp.restaurant_id = target and w.wait_minutes is not null and coalesce(w.kind, 'dine_in') = 'dine_in') as wait_n
    into vs
    from public.place_visits v join public.places p on p.id = v.place_id
   where p.restaurant_id = target;
  v3 := vs.groups >= 3;
  select count(distinct group_id) into groups_n from public.places where restaurant_id = target;

  return jsonb_build_object(
    'id', r.id, 'name', r.name, 'city', sl.city, 'slug', sl.slug,
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
                   from public.place_visits v join public.places p on p.id = v.place_id
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
revoke execute on function public.restaurant_public_data(uuid) from public, anon, authenticated;

insert into public.usage_budgets (kind, daily_total, monthly_total, per_tier, note) values
  ('website', 600, null, '{8,10,12,15,20}', 'Read a restaurant''s own website for hours, phone and menu (free, fair use)')
on conflict (kind) do nothing;

-- What would be re-checked (apply = false) or clear the stamps (apply = true). Nothing is fetched
-- here; places refresh as they are opened, so the budgets above set the pace.
create or replace function public.admin_recheck_open_data(apply boolean default false, days integer default 90)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(days, 1));
  n integer;
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  if apply then
    update public.restaurants x set site_checked_at = null, osm_checked_at = null
     where not coalesce(x.owner_verified, false)
       and (exists (select 1 from jsonb_each_text(x.sources) e where e.value = 'google' and e.key <> 'name')
            or x.site_checked_at < cutoff or x.osm_checked_at < cutoff);
    get diagnostics n = row_count;
    return jsonb_build_object('restaurants', n, 'applied', true);
  end if;
  select count(*) into n from public.restaurants x
   where not coalesce(x.owner_verified, false)
     and (exists (select 1 from jsonb_each_text(x.sources) e where e.value = 'google' and e.key <> 'name')
          or x.site_checked_at < cutoff or x.osm_checked_at < cutoff);
  return jsonb_build_object('restaurants', n, 'applied', false);
end $$;
revoke execute on function public.admin_recheck_open_data(boolean, integer) from public, anon;
grant execute on function public.admin_recheck_open_data(boolean, integer) to authenticated;
