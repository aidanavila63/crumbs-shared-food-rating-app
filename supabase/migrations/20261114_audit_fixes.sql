-- Rounds 74–76 (Nov 11 audit). Run once in the Supabase SQL editor after 20261113; safe to run twice.
-- The app works before this file is run (it falls back to how things were).
--   1. A record of which SQL files have run (Admin → "Database updates").
--   2. Days counted in Toronto time, not UTC (specials flipped to tomorrow's at 7 pm).
--   3. Spending guard: two people can't both take the last free slot.
--   4. A shared list link no longer counts draft ratings.
--   5. Photo storage: size + type limits; view-only guests can't delete a group's photos.
--   6. Push notification keys: only your own rows (the server sends for everyone).
--   7. Indexes the access rules lean on.
--   8. Your saved areas become private; group-mates only get the fields the app shows them.
--   9. Group locations (e.g. a work group's office) that everyone in the group can use; a group's
--      own "Download backup" includes them.
--  10. The "let in by hand" gate also covers allowances and starting a group directly.

-- ---------------------------------------------------------------------------------------------
-- 1. Which SQL files have run. Every file from this one on adds its own line; the older ones are
--    recognised by something only they create.
create table if not exists public.crumbs_migrations (
  name text primary key,
  ran_at timestamptz not null default now()
);
alter table public.crumbs_migrations enable row level security;
drop policy if exists crumbs_migrations_admin on public.crumbs_migrations;
create policy crumbs_migrations_admin on public.crumbs_migrations for select to authenticated
  using (public.is_crumbs_admin());

create or replace function public.admin_migrations()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb := '[]'::jsonb;
  f record;
  has_it boolean;
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  -- kind: t = table, f = function, c = table.column
  for f in select * from (values
      ('20261022_places_visited_on', 'c', 'places.visited_on'),
      ('20261023_v2_features', 't', 'list_shares'),
      ('20261024_v3_features', 't', 'place_facts'),
      ('20261025_v4_features', 't', 'home_meals'),
      ('20261026_after_v4', 't', 'recipe_saves'),
      ('20261026_builders', 'c', 'profiles.is_builder'),
      ('20261101_owned_facts', 'c', 'restaurants.source_at'),
      ('20261102_invites', 'c', 'groups.invite_approval'),
      ('20261102_invites_approval', 't', 'access_requests'),
      ('20261103_public_pages', 't', 'restaurant_slugs'),
      ('20261104_website_facts', 'c', 'restaurants.source_urls'),
      ('20261105_reservations_held', 't', 'restaurant_reservations'),
      ('20261106_read_cache', 't', 'site_read_cache'),
      ('20261107_data_health', 'f', 'admin_data_health'),
      ('20261108_public_claims', 'f', 'claims_open'),
      ('20261109_claims_safety', 'f', 'claim_guard'),
      ('20261110_maybe_closed', 'f', 'maybe_closed'),
      ('20261111_dish_of_week', 't', 'dish_of_week'),
      ('20261112_owner_booking', 'c', 'restaurant_reservations.owner_off'),
      ('20261113_seasonal_hours', 'f', 'set_seasonal_hours')) v(name, kind, what)
  loop
    has_it := case f.kind
      when 't' then to_regclass('public.' || f.what) is not null
      when 'f' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public' and p.proname = f.what)
      else exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = split_part(f.what, '.', 1)
                      and c.column_name = split_part(f.what, '.', 2))
    end;
    out := out || jsonb_build_object('name', f.name, 'ran', has_it, 'ran_at', null);
  end loop;
  return out || coalesce((select jsonb_agg(jsonb_build_object('name', m.name, 'ran', true, 'ran_at', m.ran_at)
                                           order by m.name)
                            from public.crumbs_migrations m), '[]'::jsonb);
end $$;
revoke execute on function public.admin_migrations() from public, anon;
grant execute on function public.admin_migrations() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Spending guard. Same rules as before, plus: one check at a time per kind (so two people
--    tapping together can't both pass the last slot), and the old-rows tidy-up only now and then
--    instead of on every call.
create or replace function public.use_allowance(what text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.usage_budgets;
  me uuid := auth.uid();
  everyone constant uuid := '00000000-0000-0000-0000-000000000000';
  admin boolean := public.is_crumbs_admin();
  tier integer;
  mine integer;
  total integer;
  month integer;
  let_in boolean := true;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'signin'); end if;
  -- Round 76: someone who has signed in but hasn't been let into Crumbs yet gets no allowance
  -- (AI, website reads, map lookups). Skipped if the let-in rules were never installed.
  if to_regprocedure('public.is_let_in(uuid)') is not null then
    execute 'select public.is_let_in($1)' into let_in using me;
    if not coalesce(let_in, false) then return jsonb_build_object('ok', false, 'reason', 'signin'); end if;
  end if;
  select * into b from public.usage_budgets where kind = what;
  if b.kind is null then return jsonb_build_object('ok', true); end if;
  perform pg_advisory_xact_lock(hashtext('crumbs_allowance:' || what));
  tier := public.my_tier();
  select count into mine from public.usage_counts where kind = what and day = current_date and user_id = me;
  select count into total from public.usage_counts where kind = what and day = current_date and user_id = everyone;
  select coalesce(sum(count), 0) into month from public.usage_counts
   where kind = what and user_id = everyone and day >= date_trunc('month', current_date);
  if b.monthly_total is not null and month >= b.monthly_total then
    return jsonb_build_object('ok', false, 'reason', 'budget_month');
  end if;
  if b.daily_total is not null and coalesce(total, 0) >= b.daily_total then
    return jsonb_build_object('ok', false, 'reason', 'budget_day');
  end if;
  if not admin and coalesce(mine, 0) >= b.per_tier[least(tier, 4) + 1] then
    return jsonb_build_object('ok', false, 'reason', 'personal', 'limit', b.per_tier[least(tier, 4) + 1]);
  end if;
  insert into public.usage_counts (kind, day, user_id, count) values (what, current_date, me, 1), (what, current_date, everyone, 1)
  on conflict (kind, day, user_id) do update set count = usage_counts.count + 1;
  if random() < 0.02 then
    delete from public.usage_counts where day < current_date - 62; -- keep two months
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. A shared list link (/share/…): the average leaves out ratings still kept as drafts.
create or replace function public.get_shared_list(share_token text)
returns jsonb language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'name', l.name,
    'emoji', l.emoji,
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name,
        'address', p.formatted_address,
        'cuisine', p.cuisine,
        'price_level', p.price_level,
        'status', p.status,
        'avg', (select round(avg(r.score)::numeric, 1) from public.place_ratings r
                 where r.place_id = p.id and not coalesce(r.draft, false))
      ) order by p.name)
      from public.list_places lp join public.places p on p.id = lp.place_id
      where lp.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.list_shares s join public.lists l on l.id = s.list_id
  where s.token = share_token
$$;
grant execute on function public.get_shared_list(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Photo storage. Photos are shrunk on the phone (well under 1 MB), so 5 MB and pictures only
--    costs nobody anything and stops the 1 GB being filled with something else. Guests may look,
--    and may add their own profile photo, but can't delete the group's files.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'crumbs-photos';
drop policy if exists crumbs_photos_delete on storage.objects;
create policy crumbs_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crumbs-photos'
         and public.is_group_member(((storage.foldername(name))[1])::uuid)
         and not public.is_group_guest(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------------------------
-- 6. Push notification keys: group-mates could read and delete each other's. The server now sends
--    every push with its own key (app/api/notify), so only your own rows are yours to see.
drop policy if exists push_subs_mates_read on public.push_subscriptions;
drop policy if exists push_subs_mates_delete on public.push_subscriptions;

-- ---------------------------------------------------------------------------------------------
-- 7. Indexes. The access rules look these up for every row they check.
create index if not exists group_members_user_idx on public.group_members (user_id);
create index if not exists dishes_place_idx on public.dishes (place_id);
create index if not exists place_visits_place_idx on public.place_visits (place_id);
create index if not exists list_places_place_idx on public.list_places (place_id);

-- ---------------------------------------------------------------------------------------------
-- 8. Private places. Saved areas (Home, Work, the cottage… each a spot on the map) sat on the
--    profile row, which everyone in a group with you could read. They move to a table only you
--    can read. A phone still on the old app that saves an area has it moved here straight away.
create table if not exists public.private_places (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  areas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(areas) = 'array' and jsonb_array_length(areas) <= 8),
  updated_at timestamptz not null default now()
);
alter table public.private_places enable row level security;
drop policy if exists private_places_own on public.private_places;
create policy private_places_own on public.private_places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

insert into public.private_places (user_id, areas)
select p.id, p.areas from public.profiles p
 where jsonb_array_length(p.areas) > 0
on conflict (user_id) do nothing;

create or replace function public.keep_areas_private()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.areas is not null and jsonb_array_length(new.areas) > 0 then
    insert into public.private_places (user_id, areas, updated_at) values (new.id, new.areas, now())
    on conflict (user_id) do update set areas = excluded.areas, updated_at = now();
    new.areas := '[]'::jsonb;
  end if;
  return new;
end $$;
drop trigger if exists keep_areas_private on public.profiles;
create trigger keep_areas_private before insert or update of areas on public.profiles
  for each row execute function public.keep_areas_private();
update public.profiles set areas = '[]'::jsonb where jsonb_array_length(areas) > 0;

-- Who can read a profile row: you (all of it) and Crumbs admins. Group-mates get only what the
-- app shows about each other, through group_profiles() below: name, photo, what they avoid and
-- their spice limit (both shown on place and dish pages on purpose), the "Restaurant owner" tag,
-- and their public handle if they switched a public profile on. Not: diet, Safe for me,
-- notification choices, rating-sharing choice, admin flags, saved areas.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_crumbs_admin());

create or replace function public.group_profiles(target_group uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_group_member(target_group) then
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'created_at', p.created_at,
        'avoid', p.avoid, 'spice_max', p.spice_max, 'restaurant_owner', p.restaurant_owner,
        'profile_public', p.profile_public, 'handle', case when p.profile_public then p.handle end))
      from public.group_members m join public.profiles p on p.id = m.user_id
     where m.group_id = target_group), '[]'::jsonb)
  else '[]'::jsonb end
$$;
revoke execute on function public.group_profiles(uuid) from public, anon;
grant execute on function public.group_profiles(uuid) to authenticated;

-- "Download my data" includes your private places.
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
      ('private_places', 'user_id'), ('group_locations', 'created_by')) v(t, col)
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

-- ---------------------------------------------------------------------------------------------
-- 9. Group locations: spots a whole group shares (a work group's office for lunches). Everyone in
--    the group sees them; the owner and admins add them, or every member when the group's
--    "Members can add locations" setting is on. Up to 8 a group.
create table if not exists public.group_locations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  km numeric not null default 2 check (km > 0 and km <= 50),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists group_locations_name_key on public.group_locations (group_id, lower(btrim(name)));
alter table public.group_locations enable row level security;

create or replace function public.can_edit_group_locations(target_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_group_admin(target_group)
      or (public.is_group_member(target_group) and not public.is_group_guest(target_group)
          and coalesce((select (g.settings->>'members_add_locations')::boolean
                          from public.groups g where g.id = target_group), false))
$$;
revoke execute on function public.can_edit_group_locations(uuid) from public, anon;
grant execute on function public.can_edit_group_locations(uuid) to authenticated;

drop policy if exists group_locations_read on public.group_locations;
drop policy if exists group_locations_insert on public.group_locations;
drop policy if exists group_locations_update on public.group_locations;
drop policy if exists group_locations_delete on public.group_locations;
create policy group_locations_read on public.group_locations for select to authenticated
  using (public.is_group_member(group_id));
create policy group_locations_insert on public.group_locations for insert to authenticated
  with check (public.can_edit_group_locations(group_id) and created_by = (select auth.uid()));
create policy group_locations_update on public.group_locations for update to authenticated
  using (public.can_edit_group_locations(group_id)) with check (public.can_edit_group_locations(group_id));
create policy group_locations_delete on public.group_locations for delete to authenticated
  using (public.can_edit_group_locations(group_id));

create or replace function public.group_locations_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.group_locations where group_id = new.group_id) >= 8 then
    raise exception 'A group can share up to 8 locations — remove one first';
  end if;
  return new;
end $$;
drop trigger if exists group_locations_limit on public.group_locations;
create trigger group_locations_limit before insert on public.group_locations
  for each row execute function public.group_locations_limit();

-- A group's own "Download backup" (Settings → Your data) now includes its shared locations.
-- Same function as before with one more part at the end.
create or replace function public.export_group(target_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(target_group) then raise exception 'Not your group'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'group', (select to_jsonb(g) - 'join_code' from public.groups g where id = target_group),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'role', m.role)), '[]')
                  from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = target_group),
    'places', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
                  'ratings', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.place_ratings r
                               where r.place_id = p.id and (not r.draft or r.user_id = auth.uid())),
                  'visits', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.place_visits v where v.place_id = p.id),
                  'facts', (select to_jsonb(f) from public.place_facts f where f.place_id = p.id),
                  'table_order', (select to_jsonb(t) from public.table_orders t where t.place_id = p.id),
                  'dishes', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object(
                     'ratings', (select coalesce(jsonb_agg(to_jsonb(dr)), '[]') from public.dish_ratings dr where dr.dish_id = d.id))), '[]')
                     from public.dishes d where d.place_id = p.id))), '[]')
               from public.places p where p.group_id = target_group),
    'lists', (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
                 'places', (select coalesce(jsonb_agg(to_jsonb(lp)), '[]') from public.list_places lp where lp.list_id = l.id))), '[]')
              from public.lists l where l.group_id = target_group),
    'home_meals', (select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object(
                 'ratings', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.home_meal_ratings r where r.meal_id = m.id),
                 'cooks', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.home_meal_cooks c where c.meal_id = m.id))), '[]')
              from public.home_meals m where m.group_id = target_group),
    'plans', (select coalesce(jsonb_agg(to_jsonb(pl)), '[]') from public.plans pl where pl.group_id = target_group),
    'comments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.comments c where c.group_id = target_group),
    'locations', (select coalesce(jsonb_agg(to_jsonb(gl) order by gl.created_at), '[]')
                    from public.group_locations gl where gl.group_id = target_group)
  );
end $$;
revoke execute on function public.export_group(uuid) from public, anon;
grant execute on function public.export_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 10. The gate. Starting a group goes through create_group(), which checks that you've been let
--     in, the invite-only switch and how many groups you may own. The very first database rules
--     also let anyone signed in add a row to `groups` directly, skipping all three. Nothing in the
--     app does that, so the direct way is closed. (use_allowance above has the other half.)
drop policy if exists groups_create on public.groups;

-- ---------------------------------------------------------------------------------------------
-- 2. Days in Toronto time. Everything that asks "what day is it?" (daily limits and budgets, an
--    owner's weekday specials and deal dates, the special-hours last day, dish of the week) used
--    the database's clock, which is UTC: the day changed at 7 pm Toronto time (8 pm in summer).
--    Each such function now runs on Toronto time. This sits last so it also covers the functions
--    above, and it is its own function so later SQL files can end with:
--      select public.crumbs_local_days();
--    (A file that re-creates one of these functions puts it back on UTC until that line runs.)
create or replace function public.crumbs_local_days()
returns integer language plpgsql security definer set search_path = public as $$
declare
  f record;
  n integer := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and p.proname <> 'crumbs_local_days'
       and p.prosrc ~* '(current_date|date_trunc\s*\(|now\(\)\s*::\s*date|extract\s*\(\s*(dow|isodow)|to_char\s*\()'
  loop
    execute format('alter function %s set timezone = %L', f.sig, 'America/Toronto');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.crumbs_local_days() from public, anon, authenticated;
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261114_audit_fixes')
on conflict (name) do nothing;
