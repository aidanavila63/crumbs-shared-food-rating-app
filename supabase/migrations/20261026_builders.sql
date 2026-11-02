-- Crumbs: Builders (Oct 26). Run after 20261026_after_v4.sql. Safe to re-run.
--
-- Members' answers need confirming again (2 agreeing) — EXCEPT admins and people Aidan makes a
-- "Builder" (trusted to build the data): their answers count straight away, they skip the daily
-- caps, and they can own any number of groups. Lower tiers can own fewer groups at once.

alter table public.profiles add column if not exists is_builder boolean not null default false;

-- Admins and Builders are trusted to build the data.
create or replace function public.is_builder_user(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin or p.is_builder from public.profiles p where p.id = uid), false)
$$;
revoke execute on function public.is_builder_user(uuid) from public, anon;
grant execute on function public.is_builder_user(uuid) to authenticated;

-- Nobody makes themselves a Builder: only an admin (or the SQL editor) can.
create or replace function public.protect_admin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'is_admin can only be changed from the Supabase SQL editor';
  end if;
  if new.restaurant_owner is distinct from old.restaurant_owner and auth.uid() is not null
     and coalesce(current_setting('crumbs.owner_sync', true), '') <> 'on' then
    raise exception 'restaurant_owner is set when a claim is approved';
  end if;
  if new.is_builder is distinct from old.is_builder and auth.uid() is not null and not public.is_crumbs_admin() then
    raise exception 'Only a Crumbs admin can make someone a Builder';
  end if;
  return new;
end $$;

-- Admin → Builders: find people and switch Builder on or off.
create or replace function public.admin_people(q text default '')
returns table (id uuid, display_name text, email text, is_builder boolean, is_admin boolean, points integer, groups integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.is_builder, p.is_admin,
         coalesce((select sum(c.points) from public.contribution_points c where c.user_id = p.id
                    and c.created_at > now() - make_interval(days => public.points_window_days())), 0)::int,
         (select count(*) from public.group_members m where m.user_id = p.id)::int
    from public.profiles p left join auth.users u on u.id = p.id
   where public.is_crumbs_admin()
     and (coalesce(trim(q), '') = '' or p.display_name ilike '%' || trim(q) || '%' or u.email ilike '%' || trim(q) || '%')
   order by p.is_builder desc, 6 desc, p.display_name
   limit 50
$$;
create or replace function public.set_builder(person uuid, builder boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  update public.profiles set is_builder = builder where id = person;
end $$;
revoke execute on function public.admin_people(text), public.set_builder(uuid, boolean) from public, anon;
grant execute on function public.admin_people(text), public.set_builder(uuid, boolean) to authenticated;

-- Groups you can own at once, by tier (Taster → Legend; null = no limit). Admin → Points.
update public.point_rules set day_caps = day_caps || '{"groups": [1, 1, 2, 3, null]}'::jsonb
 where id = 1 and not (day_caps ? 'groups');

create or replace function public.my_day_caps()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  shaky boolean := coalesce(public.user_trust(me) < 0.3, false);
  t integer := case when shaky then 0 else least(public.my_tier(), 4) end;
  caps jsonb := (select day_caps from public.point_rules where id = 1);
  admin boolean := public.is_builder_user(auth.uid()); -- admins and Builders: no daily caps
begin
  return jsonb_build_object(
    'tier', t, 'shaky', shaky,
    'fact', case when admin then null else caps->'fact'->t end,
    'vote', case when admin then null else caps->'vote'->t end,
    'price', case when admin then null else caps->'price'->t end,
    'groups', case when admin then null else coalesce(caps->'groups'->t, 'null'::jsonb) end,
    'builder', admin,
    'used', jsonb_build_object(
      'fact', (select count(*) from public.restaurant_facts where user_id = me and created_at >= current_date)
            + (select count(*) from public.restaurant_attr_votes where user_id = me and created_at >= current_date)
            + (select count(*) from public.restaurant_tips where user_id = me and created_at >= current_date),
      'vote', (select count(*) from public.restaurant_dish_votes where user_id = me and created_at >= current_date),
      'price', (select count(*) from public.restaurant_dish_prices where user_id = me and created_at >= current_date)));
end $$;

create or replace function public.create_group(group_name text)
returns public.groups language plpgsql security definer
set search_path = public, extensions as $$
declare
  new_group public.groups;
  cap jsonb := public.my_day_caps()->'groups';
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if coalesce(trim(group_name), '') = '' then raise exception 'Group name is required'; end if;
  -- How many groups you can own at once grows with your tier (Admin → Points; null = no limit).
  if cap is not null and jsonb_typeof(cap) = 'number'
     and (select count(*) from public.groups where created_by = auth.uid()) >= cap::text::int then
    raise exception 'You can own % group% at once for now — leave or hand one over first, or keep helping build Crumbs to unlock more',
      cap::text::int, case when cap::text::int = 1 then '' else 's' end;
  end if;
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups where join_code = code);
  end loop;
  insert into public.groups (name, join_code, created_by)
    values (trim(group_name), code, auth.uid()) returning * into new_group;
  insert into public.group_members (group_id, user_id, role)
    values (new_group.id, auth.uid(), 'owner');
  return new_group;
end $$;

-- Good to know: the owner's answer wins, then a Builder's (or admin's), then 2 agreeing.
create or replace function public.restaurant_attrs(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'attrs', (select coalesce(jsonb_object_agg(k, jsonb_build_object(
        'yes', y, 'no', n, 'mine', mine, 'owner', owner,
        'verdict', case when owner is not null then owner
                        when builder is not null then builder
                        when y >= 2 and y > n then true when n >= 2 and n > y then false end)), '{}')
      from (select v.key as k,
                   count(*) filter (where v.value) as y, count(*) filter (where not v.value) as n,
                   bool_or(v.value) filter (where v.user_id = auth.uid()) as mine,
                   bool_or(v.value) filter (where exists (select 1 from public.restaurant_managers m
                                                           where m.restaurant_id = target and m.user_id = v.user_id)) as owner,
                   (array_agg(v.value order by v.created_at desc) filter (where public.is_builder_user(v.user_id)))[1] as builder
              from public.restaurant_attr_votes v where v.restaurant_id = target group by v.key) t),
    'groups', (select jsonb_build_object(
        'loud', count(*) filter (where f.noise = 'loud') >= 2,
        'hard_parking', count(*) filter (where f.parking in ('hard', 'none')) >= 2,
        'long_wait', count(*) filter (where f.wait = 'long') >= 2,
        'cash_only', count(*) filter (where f.cash_only) >= 2,
        'not_accessible', count(*) filter (where f.accessible = false) >= 2)
      from public.place_facts f join public.places p on p.id = f.place_id where p.restaurant_id = target)
  ) where auth.uid() is not null
$$;

-- Details: changing what a member set needs 2 agreeing again — or one Builder / admin.
create or replace function public.contribute_fact(target uuid, fact text, val jsonb, how text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
  me uuid := auth.uid();
  v jsonb := val;
  current jsonb;
  agree integer;
  src text;
  applied boolean := false;
  groups_agree integer;
  claimed boolean;
  was_claimed boolean;
  manager boolean := public.manages_restaurant(target);
  last_at timestamptz;
  new_info boolean;
  confirming boolean;
  locked boolean;
  far boolean := false;
  shaky boolean := false;
  builder boolean := public.is_builder_user(auth.uid());
  earned integer := 0;
begin
  if not (public.my_restaurant(target) or manager) then raise exception 'Not one of your restaurants'; end if;
  if not manager and public.over_daily_cap('fact') then raise exception 'That’s a lot of details for one day — thank you! Try again tomorrow.'; end if;
  -- #171 Someone whose details are rarely backed up needs a second person to agree first.
  shaky := coalesce(public.user_trust(me) < 0.3, false);
  select * into r from public.restaurants where id = target;
  -- Verified by Owner: most details are the restaurant's to change. A member's answer is kept as
  -- a suggestion the owner sees in "Your restaurants" (no points; applies only if enough people
  -- agree while the owner is away — see settle_owner_suggestions).
  locked := not manager and r.owner_verified and public.owner_locked(fact);
  -- Validate + tidy each kind of fact.
  if fact in ('name', 'address', 'phone', 'website', 'cuisine') then
    if jsonb_typeof(v) <> 'string' or length(trim(v #>> '{}')) = 0 or length(v #>> '{}') > 300 then raise exception 'Bad value'; end if;
    v := to_jsonb(trim(v #>> '{}'));
    if fact = 'website' and (v #>> '{}') !~* '^https?://' then raise exception 'Website must start with http'; end if;
  elsif fact = 'price_level' then
    if jsonb_typeof(v) <> 'number' or (v::text)::int not between 0 and 4 then raise exception 'Bad price'; end if;
  elsif fact = 'status' then
    if (v #>> '{}') not in ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY') then raise exception 'Bad status'; end if;
  elsif fact = 'location' then
    if jsonb_typeof(v->'lat') <> 'number' or jsonb_typeof(v->'lng') <> 'number' then raise exception 'Bad location'; end if;
    -- ~1 m precision is plenty, and means two phones standing at the door can agree.
    v := jsonb_build_object('lat', round((v->>'lat')::numeric, 5)::float8, 'lng', round((v->>'lng')::numeric, 5)::float8);
  elsif fact = 'hours' then
    if jsonb_typeof(v->'periods') <> 'array' or jsonb_array_length(v->'periods') > 30 or jsonb_typeof(v->'utc') <> 'number' then
      raise exception 'Bad hours';
    end if;
  else
    raise exception 'Unknown field';
  end if;

  insert into public.restaurant_facts (restaurant_id, field, value, evidence, user_id)
  values (target, fact, v, how, me)
  on conflict (restaurant_id, field, user_id) do update set value = excluded.value, evidence = excluded.evidence, created_at = now();
  if manager then
    update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = me;
  end if;
  if locked then
    perform public.settle_owner_suggestions(target);
    return jsonb_build_object('applied', false, 'agree', 1, 'claimed', false, 'points', 0, 'locked', true);
  end if;

  select count(*) into agree from public.restaurant_facts f where f.restaurant_id = target and f.field = fact and f.value = v;
  -- Cross-check: how many different groups' members independently said the same thing.
  select count(distinct p.group_id) into groups_agree
    from public.restaurant_facts f
    join public.group_members gm on gm.user_id = f.user_id
    join public.places p on p.group_id = gm.group_id and p.restaurant_id = target
   where f.restaurant_id = target and f.field = fact and f.value = v;
  src := r.sources->>fact;
  current := public.fact_value(r, fact);
  -- A map pin moved more than ~300 m always needs two people.
  if fact = 'location' and r.latitude is not null then
    far := abs(r.latitude - (v->>'lat')::float8) > 0.003 or abs(r.longitude - (v->>'lng')::float8) > 0.004;
  end if;

  -- Claimed = verified as Crumbs' own: two different groups agree, or a member independently
  -- confirmed what OpenStreetMap says, or two people agree and one of them had a photo.
  was_claimed := coalesce((r.verified->fact->>'claimed')::boolean, false);
  last_at := coalesce((r.verified->fact->>'at')::timestamptz, case when src = 'osm' then r.osm_checked_at end);
  -- Points for NEW info: filling a gap, giving Crumbs its own copy of something only Google had,
  -- or a re-check that's due. A change earns once it actually applies (below).
  new_info := current is null or coalesce(src, 'google') not in ('crumbs', 'osm', 'owner')
            or last_at is null or last_at < now() - make_interval(days => public.fact_refresh_days(fact));
  -- A smaller point for helping make a detail Crumbs' own: confirming a member's or open-data
  -- value that isn't claimed yet — only the first few confirmations, never the 30th.
  confirming := not new_info and not was_claimed and current = v and src in ('crumbs', 'osm') and agree <= 3;
  claimed := manager or groups_agree >= 2
    or (src = 'osm' and current = v)
    or (agree >= 2 and exists (select 1 from public.restaurant_facts f where f.restaurant_id = target
                                 and f.field = fact and f.value = v and f.evidence in ('photo', 'receipt')));
  -- The restaurant's own confirmed manager always wins; members need 3 to overrule them.
  -- On a Verified-by-Owner page the details members may still change (e.g. a closure) need 3.
  if manager or (src = 'owner' and (agree >= 3 or current = v))
     or (not r.owner_verified or agree >= 3) and not ((far or shaky) and agree < 2 and not builder) and
        (coalesce(src, '') not in ('crumbs', 'owner') or current is null or (src = 'crumbs' and (agree >= 2 or builder)) or current = v) then
    applied := current is distinct from v or src is distinct from 'crumbs';
    if src = 'owner' and not manager and current = v then applied := false; end if;
    perform public.apply_fact(target, fact, v,
      case when manager then 'owner' when src = 'owner' and current = v then 'owner' else 'crumbs' end,
      jsonb_build_object('n', agree, 'groups', groups_agree, 'claimed', claimed, 'at', now()));
  end if;
  if applied and current is distinct from v then new_info := true; end if;
  if manager then new_info := false; confirming := false; end if; -- owners keep their own page right
  if new_info then
    earned := public.award_points(me, 'fact', public.points_for('detail'), target, target || ':' || fact || ':' || to_char(now(), 'YYYY-MM'));
  elsif confirming then
    earned := public.award_points(me, 'confirm', public.points_for('confirm'), target, target || ':' || fact || ':confirm:' || to_char(now(), 'YYYY-MM'));
  end if;
  -- When it becomes Crumbs' own, the people who said it before get ONE small bonus each —
  -- however many more agree later.
  if claimed and not was_claimed and not manager then
    perform public.award_points(f.user_id, 'backed', public.points_for('backed'), target, target || ':' || fact || ':backed:' || to_char(now(), 'YYYY-MM'))
      from public.restaurant_facts f
     where f.restaurant_id = target and f.field = fact and f.value = v and f.user_id is not null and f.user_id <> me;
  end if;
  return jsonb_build_object('applied', applied, 'agree', agree, 'claimed', claimed, 'points', earned);
end $$;

-- Menu prices: a new price needs 2 agreeing — or one Builder / admin.
create or replace function public.suggest_dish_price(target_dish uuid, new_price numeric, how text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.restaurant_dishes;
  verified_page boolean;
  agree integer;
begin
  select * into d from public.restaurant_dishes where id = target_dish;
  if d.id is null or not (public.my_restaurant(d.restaurant_id) or public.manages_restaurant(d.restaurant_id)) then
    raise exception 'Not one of your restaurants';
  end if;
  if new_price is null or new_price < 0 or new_price >= 10000 then raise exception 'Bad price'; end if;
  if public.over_daily_cap('price') then raise exception 'That’s a lot of prices for one day — try again tomorrow.'; end if;
  new_price := round(new_price, 2);
  if public.manages_restaurant(d.restaurant_id) then
    perform public.owner_edit_dish(target_dish, d.name, new_price, d.course, false);
    return jsonb_build_object('applied', true);
  end if;
  insert into public.restaurant_dish_prices (dish_id, user_id, price, evidence)
  values (target_dish, auth.uid(), new_price, case when how = 'photo' then 'photo' else 'in_person' end)
  on conflict (dish_id, user_id) do update set price = excluded.price, evidence = excluded.evidence, created_at = now();
  select owner_verified into verified_page from public.restaurants where id = d.restaurant_id;
  if d.owner_ok and verified_page then
    perform public.settle_owner_suggestions(d.restaurant_id);
    return jsonb_build_object('applied', false, 'sent', true);
  end if;
  select count(*) into agree from public.restaurant_dish_prices
   where dish_id = target_dish and price = new_price and created_at >= d.price_set_at;
  if d.price is null or agree >= 2 or public.is_builder_user(auth.uid()) then
    update public.restaurant_dishes set price = new_price, price_set_at = now(), price_checked_at = now() where id = target_dish;
    perform public.refresh_menu_price(d.restaurant_id);
    perform public.menu_settle(d.restaurant_id);
    return jsonb_build_object('applied', true, 'agree', agree);
  end if;
  return jsonb_build_object('applied', false, 'agree', agree);
end $$;
