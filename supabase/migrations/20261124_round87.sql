-- Round 87 (Nov 17): everyday features from the approved list (fourth pass, U-ideas).
-- Safe to run more than once; the app works before it runs (the new bits just don't show).
--   1. More Good to know questions (U4)
--   2. Good to know for a whole space at once, for filtering (U3)
--   3. Mute a group and quiet hours (U5)
--   4. "Where I heard about it" (U6)
--   5. Record of this file

-- ============================================================================================
-- 1. U4: vegetarian, kosher, dog-friendly patio, Wi-Fi, plugs, TVs, big groups, good on your own,
--    takeout, delivery. Same rules as the others (2 agreeing, or the owner).
-- ============================================================================================
create or replace function public.attr_keys()
returns text[] language sql immutable as $$
  select array['cards', 'tap', 'cash_only', 'takes_bookings', 'walk_ins', 'patio', 'late_night', 'byob',
               'licensed', 'kids_menu', 'high_chairs', 'change_table', 'step_free', 'accessible_washroom',
               'vegan_options', 'gluten_free_options', 'halal_options', 'parking_lot',
               'vegetarian_options', 'kosher_options', 'dog_friendly', 'wifi', 'outlets', 'tvs',
               'big_groups', 'good_solo', 'takeout', 'delivery']
$$;

-- ============================================================================================
-- 2. U3: what's confirmed about each restaurant in one of your spaces, in one call — so the Places
--    filter can show "Patio", "Takes bookings", "Step-free"… Only confirmed yeses (owner, builder,
--    or 2 agreeing), never who said what.
-- ============================================================================================
create or replace function public.space_facts(target_group uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct p.restaurant_id from public.places p
     where p.group_id = target_group and p.restaurant_id is not null
       and public.is_group_member(target_group)
  ), per_key as (
    select v.restaurant_id, v.key,
           count(*) filter (where v.value) as y, count(*) filter (where not v.value) as n,
           bool_or(v.value) filter (where exists (select 1 from public.restaurant_managers m
                                                   where m.restaurant_id = v.restaurant_id and m.user_id = v.user_id)) as owner,
           (array_agg(v.value order by v.created_at desc) filter (where public.is_builder_user(v.user_id)))[1] as builder
      from public.restaurant_attr_votes v join mine on mine.restaurant_id = v.restaurant_id
     group by v.restaurant_id, v.key
  )
  select coalesce(jsonb_object_agg(restaurant_id, keys), '{}'::jsonb) from (
    select restaurant_id, jsonb_agg(key order by key) as keys from per_key
     where coalesce(owner, builder, case when y >= 2 and y > n then true when n >= 2 and n > y then false end)
     group by restaurant_id) x
$$;
revoke execute on function public.space_facts(uuid) from public, anon;
grant execute on function public.space_facts(uuid) to authenticated;

-- ============================================================================================
-- 3. U5: mute a group, quiet hours. Kept in profiles.notify (your own row):
--      notify.muted  = ["<group id>", …]   nothing from those groups
--      notify.quiet  = {"from": 22, "to": 7} no pushes between these hours (Toronto time)
--    push_targets (Round 86) now honours both. Notifications aimed at you personally (being let
--    into a group) still come when a group is muted, but not in quiet hours.
-- ============================================================================================
create or replace function public.in_quiet_hours(quiet jsonb, at timestamptz default now())
returns boolean language sql stable set search_path = public as $$
  select case
    when quiet is null or jsonb_typeof(quiet) <> 'object' or quiet ->> 'from' is null or quiet ->> 'to' is null then false
    else (
      with h as (select extract(hour from at at time zone 'America/Toronto')::int as now_h,
                        least(greatest((quiet ->> 'from')::int, 0), 23) as f,
                        least(greatest((quiet ->> 'to')::int, 0), 23) as t)
      select case when f = t then false
                  when f < t then now_h >= f and now_h < t
                  else now_h >= f or now_h < t end from h)
  end
$$;

create or replace function public.push_targets(kind text, target_group uuid default null,
                                               people uuid[] default null, sender uuid default null)
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  with who as (
    select m.user_id from public.group_members m
     where target_group is not null and m.group_id = target_group
       and (people is null or m.user_id = any (people))
    union
    select unnest(people) where target_group is null
  )
  select s.user_id, s.endpoint, s.p256dh, s.auth
    from who
    join public.push_subscriptions s on s.user_id = who.user_id
    left join public.profiles p on p.id = who.user_id
   where who.user_id is distinct from sender
     and coalesce((p.notify ->> kind)::boolean, true)
     and not (target_group is not null and kind <> 'join'
              and coalesce(p.notify -> 'muted', '[]'::jsonb) ? target_group::text)
     and not public.in_quiet_hours(p.notify -> 'quiet')
$$;
revoke execute on function public.push_targets(text, uuid, uuid[], uuid) from public, anon, authenticated;

-- ============================================================================================
-- 4. U6: where you heard about a place ("Maya's story", "blogTO", a link). Seen by the group.
-- ============================================================================================
alter table public.places add column if not exists heard_from text
  check (heard_from is null or char_length(heard_from) <= 200);

-- ============================================================================================
-- 5. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261124_round87')
on conflict (name) do nothing;
