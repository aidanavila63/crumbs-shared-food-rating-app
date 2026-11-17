-- Round 80 (Nov 19): solo-first, part one (decided Nov 12: "solo with group advantages").
-- Safe to run more than once; the app works before it runs (it just doesn't offer these yet).
--   1. My Crumbs: a private space for one (a group nobody else can join)
--   2. Also save to…: copy a place into another of your spaces, with your scores
--   3. Private spending (third pass #20): what you spend stays yours, still counts in anonymous totals
--   4. Record of this file
-- Not in this file: ratings and recipes belonging to the person rather than the group. That moves
-- existing data, so it comes last, on its own.

-- ============================================================================================
-- 1. My Crumbs
-- Everyone who's been let in can have one private space, whatever the "start groups" switch says
-- and whatever their group allowance. It's an ordinary group in every other way (places, lists,
-- visits, home cooking, Decide), so everything the app does already works in it. Nobody else can
-- ever be in it: not by code, invite link, guest link, request, Find a group or an admin.
-- ============================================================================================
alter table public.groups add column if not exists is_personal boolean not null default false;
create unique index if not exists groups_one_personal_idx on public.groups (created_by) where is_personal;

-- Nobody else gets in, by any route (the code box, invite links, guest links, requests, public groups,
-- the account-deletion hand-over, the SQL editor's "add member" — every one ends in this insert).
create or replace function public.personal_members_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.groups g where g.id = new.group_id and g.is_personal and g.created_by <> new.user_id) then
    raise exception 'My Crumbs is just for you — use "Also save to…" to share a place with a group'
      using errcode = 'P0001', hint = 'personal_space';
  end if;
  return new;
end $$;
revoke execute on function public.personal_members_only() from public, anon, authenticated;
drop trigger if exists personal_members_only on public.group_members;
create trigger personal_members_only before insert or update of user_id, group_id on public.group_members
  for each row execute function public.personal_members_only();

create or replace function public.personal_no_requests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.groups g where g.id = new.group_id and g.is_personal) then
    raise exception 'My Crumbs is just for you' using errcode = 'P0001', hint = 'personal_space';
  end if;
  return new;
end $$;
revoke execute on function public.personal_no_requests() from public, anon, authenticated;
drop trigger if exists personal_no_requests on public.group_join_requests;
create trigger personal_no_requests before insert on public.group_join_requests
  for each row execute function public.personal_no_requests();

-- A personal space stays private: it can't be listed, opened to requests, given a guest code,
-- or turned into (or out of) a personal space from the app.
create or replace function public.personal_stays_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and new.is_personal is distinct from old.is_personal then
    raise exception 'That can''t be changed' using errcode = 'P0001';
  end if;
  if new.is_personal and (coalesce(new.visibility, 'private') <> 'private'
                          or coalesce(new.join_mode, 'invite') <> 'invite'
                          or new.guest_code is not null) then
    raise exception 'My Crumbs is just for you — start a group to share with people'
      using errcode = 'P0001', hint = 'personal_space';
  end if;
  return new;
end $$;
revoke execute on function public.personal_stays_private() from public, anon, authenticated;
drop trigger if exists personal_stays_private on public.groups;
create trigger personal_stays_private before update on public.groups
  for each row execute function public.personal_stays_private();

-- Codes never find a personal space (so the invite page shows nothing for one).
create or replace function public.group_for_code(code text, out g public.groups, out as_guest boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  c text := upper(trim(coalesce(code, '')));
begin
  as_guest := false;
  if c !~ '^[A-Z0-9]{6,8}$' then return; end if;
  select * into g from public.groups where join_code = c and not is_personal;
  if g.id is null then
    select * into g from public.groups where guest_code = c and not is_personal;
    as_guest := g.id is not null;
  end if;
end $$;
revoke execute on function public.group_for_code(text) from public, anon, authenticated;

-- Same as before, except a personal space doesn't count toward how many groups you can own.
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
  if not public.can_start_group() then
    raise exception 'Crumbs is invite-only for now — open an invite link from a friend to get started';
  end if;
  if coalesce(trim(group_name), '') = '' then raise exception 'Group name is required'; end if;
  -- How many groups you can own at once grows with your tier (Admin → Points; null = no limit).
  if cap is not null and jsonb_typeof(cap) = 'number'
     and (select count(*) from public.groups where created_by = auth.uid() and not is_personal) >= cap::text::int then
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

-- Your private space: returns it, making it the first time (only once you've been let in).
create or replace function public.ensure_my_crumbs()
returns public.groups language plpgsql security definer
set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  mine public.groups;
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if not public.is_let_in(me) then raise exception 'Crumbs hasn''t let you in yet'; end if;
  select * into mine from public.groups where created_by = me and is_personal;
  if mine.id is null then
    -- (The code is never shown or accepted; groups just need one.)
    loop
      code := '';
      for i in 1..6 loop
        code := code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
      end loop;
      exit when not exists (select 1 from public.groups where join_code = code);
    end loop;
    insert into public.groups (name, join_code, created_by, is_personal, emoji)
      values ('My Crumbs', code, me, true, '🍞')
    on conflict do nothing
    returning * into mine;
    if mine.id is null then
      select * into mine from public.groups where created_by = me and is_personal;
    end if;
  end if;
  insert into public.group_members (group_id, user_id, role) values (mine.id, me, 'owner')
  on conflict (group_id, user_id) do nothing;
  return mine;
end $$;
revoke execute on function public.ensure_my_crumbs() from public, anon;
grant execute on function public.ensure_my_crumbs() to authenticated;

-- ============================================================================================
-- 2. Also save to…
-- Puts a place you can see into another of your spaces (personal or group). Brings the place's
-- details and your own scores (never your notes, never other people's ratings or visits). If the
-- space already has it, nothing changes. Returns {id, existed}.
-- ============================================================================================
create or replace function public.copy_place(source uuid, target_group uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.places;
  tp uuid;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  select * into p from public.places where id = source;
  if p.id is null or not public.is_group_member(p.group_id) then raise exception 'Not one of your places'; end if;
  if not public.is_group_member(target_group) or public.is_group_guest(target_group) then
    raise exception 'You can only save to a space you''re a member of';
  end if;
  select id into tp from public.places
   where group_id = target_group
     and (google_place_id = p.google_place_id or (p.restaurant_id is not null and restaurant_id = p.restaurant_id))
   limit 1;
  if tp is not null then
    return jsonb_build_object('id', tp, 'existed', true);
  end if;
  insert into public.places (group_id, google_place_id, name, formatted_address, latitude, longitude, price_level,
                             cuisine, website, google_maps_url, status, created_by, restaurant_id, opening_hours,
                             business_status, hours_checked_at, visited_on)
  values (target_group, p.google_place_id, p.name, p.formatted_address, p.latitude, p.longitude, p.price_level,
          p.cuisine, p.website, p.google_maps_url, p.status, me, p.restaurant_id, p.opening_hours,
          p.business_status, p.hours_checked_at, p.visited_on)
  returning id into tp;
  insert into public.place_ratings (place_id, user_id, score, points, food, service, vibe, value, would_return)
  select tp, me, r.score, r.points, r.food, r.service, r.vibe, r.value, r.would_return
    from public.place_ratings r
   where r.place_id = source and r.user_id = me and not coalesce(r.draft, false)
  on conflict do nothing;
  return jsonb_build_object('id', tp, 'existed', false);
end $$;
revoke execute on function public.copy_place(uuid, uuid) from public, anon;
grant execute on function public.copy_place(uuid, uuid) to authenticated;

-- ============================================================================================
-- 3. Private spending (third pass #20)
-- With "Keep what I spend private" on, the amount on a visit you log is kept in a table only you
-- can read; your group sees the visit without the amount. The anonymous totals (cost per person
-- on restaurant pages, owner insights) still count it, through a view only the database reads.
-- Turning it on hides your earlier amounts too; turning it off puts them back.
-- ============================================================================================
alter table public.profiles add column if not exists private_spend boolean not null default false;

create table if not exists public.private_spends (
  visit_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists private_spends_user_idx on public.private_spends (user_id);
alter table public.private_spends enable row level security;
drop policy if exists private_spends_own on public.private_spends;
create policy private_spends_own on public.private_spends for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists private_spends_delete on public.private_spends;
create policy private_spends_delete on public.private_spends for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.keep_spend_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.spend is not null and new.created_by is not null
     and coalesce((select private_spend from public.profiles where id = new.created_by), false) then
    insert into public.private_spends (visit_id, user_id, amount) values (new.id, new.created_by, new.spend)
    on conflict (visit_id) do update set amount = excluded.amount;
    new.spend := null;
  end if;
  return new;
end $$;
revoke execute on function public.keep_spend_private() from public, anon, authenticated;
drop trigger if exists keep_spend_private on public.place_visits;
create trigger keep_spend_private before insert or update of spend on public.place_visits
  for each row execute function public.keep_spend_private();

create or replace function public.drop_private_spend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.private_spends where visit_id = old.id;
  return old;
end $$;
revoke execute on function public.drop_private_spend() from public, anon, authenticated;
drop trigger if exists drop_private_spend on public.place_visits;
create trigger drop_private_spend after delete on public.place_visits
  for each row execute function public.drop_private_spend();

create or replace function public.set_private_spend(keep_private boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  moved int := 0;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  update public.profiles set private_spend = coalesce(keep_private, false) where id = me;
  if coalesce(keep_private, false) then
    insert into public.private_spends (visit_id, user_id, amount)
    select id, me, spend from public.place_visits where created_by = me and spend is not null
    on conflict (visit_id) do update set amount = excluded.amount;
    update public.place_visits set spend = null where created_by = me and spend is not null;
    get diagnostics moved = row_count;
  else
    update public.place_visits v set spend = s.amount
      from public.private_spends s where s.visit_id = v.id and s.user_id = me and v.created_by = me;
    get diagnostics moved = row_count;
    delete from public.private_spends where user_id = me;
  end if;
  return jsonb_build_object('private', coalesce(keep_private, false), 'moved', moved);
end $$;
revoke execute on function public.set_private_spend(boolean) from public, anon;
grant execute on function public.set_private_spend(boolean) to authenticated;

-- Every visit with its amount, private ones included. Read only by the database's own total
-- functions below (which never show who spent what, and need 3+ visits before they show anything).
create or replace view public.visits_for_totals as
  select v.id, v.place_id, v.visited_on, coalesce(v.spend, s.amount) as spend, v.created_by, v.created_at,
         v.score, v.people, v.kind, v.picked_by, v.occasion, v.milestone, v.note, v.meal_time, v.wait_minutes
    from public.place_visits v
    left join public.private_spends s on s.visit_id = v.id;
revoke all on public.visits_for_totals from public, anon, authenticated;

-- The three total functions, unchanged except that they read visits_for_totals.
create or replace function public.restaurant_insights(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not (public.my_restaurant(target) or public.manages_restaurant(target)) then raise exception 'Not one of your restaurants'; end if;
  with v as (
    select v.* from public.visits_for_totals v join public.places p on p.id = v.place_id where p.restaurant_id = target
  )
  select jsonb_build_object(
    'visits', (select count(*) from v),
    'groups', (select count(distinct p.group_id) from public.visits_for_totals x join public.places p on p.id = x.place_id where p.restaurant_id = target),
    'per_head', (select case when count(*) >= 3 then round(avg(spend / people), 0) end from v where spend > 0 and people > 0),
    'lunch_per_head', (select case when count(*) >= 3 then round(avg(spend / people), 0) end
                         from v where spend > 0 and people > 0 and meal_time in ('breakfast', 'lunch')),
    'dinner_per_head', (select case when count(*) >= 3 then round(avg(spend / people), 0) end
                          from v where spend > 0 and people > 0 and meal_time in ('dinner', 'late')),
    'takeout_share', (select case when count(*) >= 5
                        then round(100.0 * count(*) filter (where kind in ('takeout', 'delivery')) / count(*)) end from v),
    'typical_wait', (select case when count(*) >= 3
                       then round(percentile_cont(0.5) within group (order by wait_minutes))::int end
                       from v where wait_minutes is not null and coalesce(kind, 'dine_in') = 'dine_in'),
    'busy', (select case when (select count(*) from v where meal_time is not null) >= 8 then
               coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'meal', meal_time, 'n', n) order by n desc), '[]') end
             from (select extract(dow from visited_on)::int as dow, meal_time, count(*) as n
                     from v where meal_time is not null group by 1, 2 order by 3 desc limit 6) b)
  ) into result;
  return result;
end $$;

create or replace function public.owner_insights(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then raise exception 'Owners only'; end if;
  with v as (
    select v.* from public.visits_for_totals v join public.places p on p.id = v.place_id where p.restaurant_id = target
  ), pl as (
    select * from public.places where restaurant_id = target
  )
  select jsonb_build_object(
    'saved', (select count(*) from pl),
    'want_to_try', (select count(*) from pl where status = 'Want to try'),
    'been', (select count(*) from pl where status = 'Been'),
    'visits', (select count(*) from v),
    'by_month', (select case when (select count(*) from v) >= 5 then coalesce(jsonb_agg(jsonb_build_object('month', m, 'visits', n) order by m), '[]') end
                   from (select to_char(date_trunc('month', visited_on), 'YYYY-MM') as m, count(*) as n
                           from v where visited_on > current_date - interval '12 months' group by 1) x),
    'per_head_by_quarter', (select coalesce(jsonb_agg(jsonb_build_object('quarter', q, 'per_head', ph) order by q), '[]')
                   from (select to_char(date_trunc('quarter', visited_on), 'YYYY-"Q"Q') as q, round(avg(spend / people), 0) as ph
                           from v where spend > 0 and people > 0 group by 1 having count(*) >= 3) x),
    'rating', (select case when count(*) >= 3 then round(avg(coalesce(r.points, r.score * 20)) / 20.0, 1) end
                 from public.place_ratings r join pl on pl.id = r.place_id where not r.draft),
    'ratings', (select count(*) from public.place_ratings r join pl on pl.id = r.place_id where not r.draft),
    'top_dishes', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'confirms', c) order by c desc), '[]') from (
                     select d.name, count(*) filter (where dv.vote = 'confirm') as c
                       from public.restaurant_dishes d join public.restaurant_dish_votes dv on dv.dish_id = d.id
                      where d.restaurant_id = target group by d.id, d.name order by 2 desc limit 5) x where c > 0)
  ) into result;
  return result;
end $$;

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

-- Your own data download includes your private amounts.
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
      ('private_places', 'user_id'), ('group_locations', 'created_by'), ('private_spends', 'user_id')) v(t, col)
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

insert into public.crumbs_migrations (name) values ('20261119_round80')
on conflict (name) do nothing;
