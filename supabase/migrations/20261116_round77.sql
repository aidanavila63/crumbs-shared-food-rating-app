-- Round 77 (Nov 16): the "next patch" from the Nov 12–15 plan. Safe to run more than once; the app
-- works before it runs (Admin → Database updates shows whether it has).
--   1. Photo folders: your own folder and a restaurant's folder (B12); guests can't add (S15)
--   2. Photo report for the Admin clean-up and small copies (B10, E6)
--   3. Faster read rules (E13)
--   4. Missing indexes (E18)
--   5. Live updates for the core tables (E22)
--   6. Rate limits in the database (S7)
--   7. Backups: ordered reads (E24); daily job runs record (E23)
--   8. Groups: hand over, transfer, delete (third pass #1)
--   9. Recently deleted places and lists, 30 days (third pass #2)
--  10. Notice banner + read-only pause (third pass #16); launch numbers (#17); "Invited by" (#19)
--  11. Server error log from routes (third pass #9)
--  12. Record of this file
-- (The group's main location lives in the group's settings: no SQL needed.)

-- ============================================================================================
-- 1. Photo folders (B12, S15)
-- A photo's first folder says who it belongs to: a group (places, dishes, meals, cover), a person
-- (their profile photo) or a restaurant (storefront / tip photos everyone sees). Before this, every
-- photo went under a group, so deleting a group (or the photo clean-up) could remove a profile or
-- storefront photo other people still see.
-- ============================================================================================
create or replace function public.photo_folder_can_add(folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when folder::uuid = (select auth.uid()) then public.is_let_in((select auth.uid()))
    when exists (select 1 from public.group_members m
                  where m.group_id = folder::uuid and m.user_id = (select auth.uid()))
      then not public.is_group_guest(folder::uuid)
    when exists (select 1 from public.restaurants r where r.id = folder::uuid)
      then public.is_let_in((select auth.uid()))
    else false
  end
$$;

-- Removing: a group's full members; yourself; a restaurant photo only by whoever added it or an admin.
create or replace function public.photo_can_remove(object_name text, uploader uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when (storage.foldername(object_name))[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_crumbs_admin()
    when ((storage.foldername(object_name))[1])::uuid = (select auth.uid()) then true
    when exists (select 1 from public.group_members m
                  where m.group_id = ((storage.foldername(object_name))[1])::uuid
                    and m.user_id = (select auth.uid()))
      then not public.is_group_guest(((storage.foldername(object_name))[1])::uuid)
    when exists (select 1 from public.restaurants r where r.id = ((storage.foldername(object_name))[1])::uuid)
      then uploader = (select auth.uid()) or public.is_crumbs_admin()
    else public.is_crumbs_admin()
  end
$$;
revoke execute on function public.photo_folder_can_add(text), public.photo_can_remove(text, uuid) from public, anon;
grant execute on function public.photo_folder_can_add(text), public.photo_can_remove(text, uuid) to authenticated;

drop policy if exists crumbs_photos_insert on storage.objects;
create policy crumbs_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crumbs-photos' and public.photo_folder_can_add((storage.foldername(name))[1]));
drop policy if exists crumbs_photos_delete on storage.objects;
create policy crumbs_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crumbs-photos' and public.photo_can_remove(name, owner));
-- The bucket is public (links work without signing in); this rule only matters for listing.
drop policy if exists crumbs_photos_select on storage.objects;
create policy crumbs_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'crumbs-photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or public.is_crumbs_admin()
              or ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  and public.is_group_member(((storage.foldername(name))[1])::uuid))));

-- ============================================================================================
-- 2. Photo report for Admin (B10 orphaned photos, E6 small copies for old photos)
-- Lists files in the photo bucket that nothing points at (older than a day, so an upload in
-- progress is never counted) and pictures that have no small copy yet. Admin only. Deleting goes
-- through the storage API on the server (deleting rows here would leave the files behind).
-- Places and lists in "Recently deleted" still count as pointing at their photos.
-- ============================================================================================
create or replace function public.photo_refs()
returns table (path text) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select photo_path from public.places where photo_path is not null
  union select photo_path from public.dishes where photo_path is not null
  union select photo_path from public.home_meals where photo_path is not null
  union select cover_path from public.groups where cover_path is not null
  union select photo_path from public.restaurant_tips where photo_path is not null
  union select split_part(avatar_url, '/public/crumbs-photos/', 2) from public.profiles
   where avatar_url like '%/public/crumbs-photos/%'
  union select x->>'photo_path' from public.deleted_items d,
         jsonb_array_elements(coalesce(d.snapshot->'places', '[]') || coalesce(d.snapshot->'dishes', '[]')) x
   where x->>'photo_path' is not null;
end $$;
revoke execute on function public.photo_refs() from public, anon, authenticated;

create or replace function public.admin_photo_report(sample int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can see this'; end if;
  with refs as (select path from public.photo_refs()),
  objs as (
    select o.name, coalesce((o.metadata->>'size')::bigint, 0) as size, o.created_at
      from storage.objects o where o.bucket_id = 'crumbs-photos'),
  mains as (select * from objs where name !~ '\.t\.jpg$'),
  orphans as (
    select m.name, m.size from mains m
     where m.name not in (select path from refs)
       and coalesce(m.created_at, now() - interval '2 days') < now() - interval '1 day'
    union all
    -- a small copy whose photo is gone
    select t.name, t.size from objs t
     where t.name ~ '\.t\.jpg$'
       and not exists (select 1 from objs m where m.name = regexp_replace(t.name, '\.t\.jpg$', '.jpg'))
       and coalesce(t.created_at, now() - interval '2 days') < now() - interval '1 day'),
  no_thumb as (
    select m.name from mains m
     where m.name in (select path from refs)
       and m.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
       and not exists (select 1 from objs t where t.name = regexp_replace(m.name, '\.jpg$', '.t.jpg')))
  select jsonb_build_object(
    'files', (select count(*) from objs),
    'bytes', (select coalesce(sum(size), 0) from objs),
    'orphans', (select count(*) from orphans),
    'orphan_bytes', (select coalesce(sum(size), 0) from orphans),
    'orphan_names', (select coalesce(jsonb_agg(name order by name), '[]') from (select name from orphans order by name limit greatest(sample, 0)) x),
    'no_thumb', (select count(*) from no_thumb),
    'no_thumb_names', (select coalesce(jsonb_agg(name order by name), '[]') from (select name from no_thumb order by name limit greatest(sample, 0)) y)
  ) into result;
  return result;
end $$;
revoke execute on function public.admin_photo_report(int) from public, anon;
grant execute on function public.admin_photo_report(int) to authenticated;

-- ============================================================================================
-- 3. Faster read rules (E13)
-- The read rules asked "is this person in the group?" once per row, and for ratings and dishes
-- two to five lookups per row; with 500 places the main load took 1.05 s instead of 0.11 s.
-- Now the list of your groups (and your places and dishes) is worked out once per query.
-- Same rows as before: tested in round77_test and by every older security test.
-- ============================================================================================
create or replace function public.my_group_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select group_id from public.group_members where user_id = (select auth.uid())
$$;
create or replace function public.my_place_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.places p
    join public.group_members m on m.group_id = p.group_id and m.user_id = (select auth.uid())
$$;
create or replace function public.my_dish_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select d.id from public.dishes d
    join public.places p on p.id = d.place_id
    join public.group_members m on m.group_id = p.group_id and m.user_id = (select auth.uid())
$$;
revoke execute on function public.my_group_ids(), public.my_place_ids(), public.my_dish_ids() from public, anon;
grant execute on function public.my_group_ids(), public.my_place_ids(), public.my_dish_ids() to authenticated;

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated
  using (id in (select public.my_group_ids()));
drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists places_read on public.places;
create policy places_read on public.places for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists dishes_read on public.dishes;
create policy dishes_read on public.dishes for select to authenticated
  using (place_id in (select public.my_place_ids()));
drop policy if exists dish_ratings_read on public.dish_ratings;
create policy dish_ratings_read on public.dish_ratings for select to authenticated
  using (dish_id in (select public.my_dish_ids()));
drop policy if exists place_ratings_read on public.place_ratings;
create policy place_ratings_read on public.place_ratings for select to authenticated
  using (place_id in (select public.my_place_ids()) and (not draft or user_id = (select auth.uid())));
drop policy if exists place_visits_read on public.place_visits;
create policy place_visits_read on public.place_visits for select to authenticated
  using (place_id in (select public.my_place_ids()));
drop policy if exists place_facts_read on public.place_facts;
create policy place_facts_read on public.place_facts for select to authenticated
  using (place_id in (select public.my_place_ids()));
drop policy if exists lists_read on public.lists;
create policy lists_read on public.lists for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists list_places_read on public.list_places;
create policy list_places_read on public.list_places for select to authenticated
  using (list_id in (select l.id from public.lists l where l.group_id in (select public.my_group_ids())));
drop policy if exists list_shares_read on public.list_shares;
create policy list_shares_read on public.list_shares for select to authenticated
  using (list_id in (select l.id from public.lists l where l.group_id in (select public.my_group_ids())));
drop policy if exists activity_read on public.activity;
create policy activity_read on public.activity for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists group_locations_read on public.group_locations;
create policy group_locations_read on public.group_locations for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists swipe_sessions_read on public.swipe_sessions;
create policy swipe_sessions_read on public.swipe_sessions for select to authenticated
  using (group_id in (select public.my_group_ids()));
drop policy if exists swipe_votes_read on public.swipe_votes;
create policy swipe_votes_read on public.swipe_votes for select to authenticated
  using (session_id in (select s.id from public.swipe_sessions s where s.group_id in (select public.my_group_ids())));
drop policy if exists plan_rsvps_read on public.plan_rsvps;
create policy plan_rsvps_read on public.plan_rsvps for select to authenticated
  using (plan_id in (select p.id from public.plans p where p.group_id in (select public.my_group_ids())));
drop policy if exists home_meal_ratings_read on public.home_meal_ratings;
create policy home_meal_ratings_read on public.home_meal_ratings for select to authenticated
  using (meal_id in (select h.id from public.home_meals h where h.group_id in (select public.my_group_ids())));
-- "Everything" rules: reading uses the fast check; writing keeps the per-row check it had.
drop policy if exists home_meals_all on public.home_meals;
create policy home_meals_all on public.home_meals for all to authenticated
  using (group_id in (select public.my_group_ids())) with check (public.is_group_member(group_id));
drop policy if exists home_meal_cooks_all on public.home_meal_cooks;
create policy home_meal_cooks_all on public.home_meal_cooks for all to authenticated
  using (meal_id in (select h.id from public.home_meals h where h.group_id in (select public.my_group_ids())))
  with check (public.is_group_member(public.meal_group(meal_id)));
drop policy if exists plans_all on public.plans;
create policy plans_all on public.plans for all to authenticated
  using (group_id in (select public.my_group_ids())) with check (public.is_group_member(group_id));
drop policy if exists group_goals_all on public.group_goals;
create policy group_goals_all on public.group_goals for all to authenticated
  using (group_id in (select public.my_group_ids())) with check (public.is_group_member(group_id));
drop policy if exists table_orders_group on public.table_orders;
create policy table_orders_group on public.table_orders for all to authenticated
  using (place_id in (select public.my_place_ids())) with check (public.is_group_member(public.place_group(place_id)));

-- ============================================================================================
-- 4. Missing indexes (E18)
-- 63 of 112 links between tables had no index: reading a group's lists, plans and swipe sessions,
-- a meal's cooks, a person's push keys, and deleting an account (which looks up everything that
-- person wrote) scanned whole tables. One small index per link.
-- ============================================================================================
create index if not exists access_requests_group_id_idx on public.access_requests (group_id);
create index if not exists activity_actor_idx on public.activity (actor);
create index if not exists activity_meal_id_idx on public.activity (meal_id);
create index if not exists activity_place_id_idx on public.activity (place_id);
create index if not exists client_errors_user_id_idx on public.client_errors (user_id);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists contribution_points_restaurant_id_idx on public.contribution_points (restaurant_id);
create index if not exists dish_of_week_restaurant_id_idx on public.dish_of_week (restaurant_id);
create index if not exists dish_ratings_user_id_idx on public.dish_ratings (user_id);
create index if not exists dishes_created_by_idx on public.dishes (created_by);
create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists group_goals_created_by_idx on public.group_goals (created_by);
create index if not exists group_join_requests_user_id_idx on public.group_join_requests (user_id);
create index if not exists group_locations_created_by_idx on public.group_locations (created_by);
create index if not exists groups_created_by_idx on public.groups (created_by);
create index if not exists handle_reservations_user_id_idx on public.handle_reservations (user_id);
create index if not exists home_meal_cooks_cooked_by_idx on public.home_meal_cooks (cooked_by);
create index if not exists home_meal_cooks_created_by_idx on public.home_meal_cooks (created_by);
create index if not exists home_meal_cooks_meal_id_idx on public.home_meal_cooks (meal_id);
create index if not exists home_meal_ratings_user_id_idx on public.home_meal_ratings (user_id);
create index if not exists home_meals_created_by_idx on public.home_meals (created_by);
create index if not exists home_meals_from_dish_idx on public.home_meals (from_dish);
create index if not exists list_places_added_by_idx on public.list_places (added_by);
create index if not exists list_shares_created_by_idx on public.list_shares (created_by);
create index if not exists lists_created_by_idx on public.lists (created_by);
create index if not exists lists_group_id_idx on public.lists (group_id);
create index if not exists place_facts_updated_by_idx on public.place_facts (updated_by);
create index if not exists place_private_notes_user_id_idx on public.place_private_notes (user_id);
create index if not exists place_ratings_user_id_idx on public.place_ratings (user_id);
create index if not exists place_visits_created_by_idx on public.place_visits (created_by);
create index if not exists place_visits_picked_by_idx on public.place_visits (picked_by);
create index if not exists places_created_by_idx on public.places (created_by);
create index if not exists plan_rsvps_user_id_idx on public.plan_rsvps (user_id);
create index if not exists plans_created_by_idx on public.plans (created_by);
create index if not exists plans_group_id_idx on public.plans (group_id);
create index if not exists plans_place_id_idx on public.plans (place_id);
create index if not exists plans_session_id_idx on public.plans (session_id);
create index if not exists profile_picks_restaurant_id_idx on public.profile_picks (restaurant_id);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index if not exists reactions_user_id_idx on public.reactions (user_id);
create index if not exists recipe_reviews_user_id_idx on public.recipe_reviews (user_id);
create index if not exists recipe_saves_meal_id_idx on public.recipe_saves (meal_id);
create index if not exists restaurant_attr_votes_user_id_idx on public.restaurant_attr_votes (user_id);
create index if not exists restaurant_claims_user_id_idx on public.restaurant_claims (user_id);
create index if not exists restaurant_dish_prices_user_id_idx on public.restaurant_dish_prices (user_id);
create index if not exists restaurant_dish_votes_user_id_idx on public.restaurant_dish_votes (user_id);
create index if not exists restaurant_dishes_added_by_idx on public.restaurant_dishes (added_by);
create index if not exists restaurant_facts_user_id_idx on public.restaurant_facts (user_id);
create index if not exists restaurant_managers_user_id_idx on public.restaurant_managers (user_id);
create index if not exists restaurant_menu_files_restaurant_id_idx on public.restaurant_menu_files (restaurant_id);
create index if not exists restaurant_menu_files_uploaded_by_idx on public.restaurant_menu_files (uploaded_by);
create index if not exists restaurant_posts_created_by_idx on public.restaurant_posts (created_by);
create index if not exists restaurant_question_skips_restaurant_id_idx on public.restaurant_question_skips (restaurant_id);
create index if not exists restaurant_reservations_enabled_by_idx on public.restaurant_reservations (enabled_by);
create index if not exists restaurant_tip_votes_user_id_idx on public.restaurant_tip_votes (user_id);
create index if not exists restaurant_tips_user_id_idx on public.restaurant_tips (user_id);
create index if not exists swipe_limits_user_id_idx on public.swipe_limits (user_id);
create index if not exists swipe_sessions_created_by_idx on public.swipe_sessions (created_by);
create index if not exists swipe_sessions_group_id_idx on public.swipe_sessions (group_id);
create index if not exists swipe_sessions_list_id_idx on public.swipe_sessions (list_id);
create index if not exists swipe_votes_place_id_idx on public.swipe_votes (place_id);
create index if not exists swipe_votes_user_id_idx on public.swipe_votes (user_id);
create index if not exists table_orders_updated_by_idx on public.table_orders (updated_by);

-- ============================================================================================
-- 5. Live updates for the core tables (E22)
-- The app listens to these, but no SQL file ever switched them on (it was presumably done by hand
-- on the live project). Harmless if they're already on.
-- ============================================================================================
do $$
declare t text;
begin
  foreach t in array array['places', 'place_ratings', 'place_visits', 'place_facts', 'dishes', 'dish_ratings',
                           'lists', 'list_places', 'group_locations'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

create or replace function public.admin_realtime_tables()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can see this'; end if;
  return (select coalesce(jsonb_agg(t order by t), '[]') from (
    select unnest(array['places', 'place_ratings', 'place_visits', 'place_facts', 'dishes', 'dish_ratings',
                        'lists', 'list_places', 'group_locations', 'home_meals', 'home_meal_ratings',
                        'home_meal_cooks', 'activity', 'reactions', 'comments', 'swipe_sessions',
                        'swipe_votes', 'plans', 'plan_rsvps', 'groups', 'group_members']) as t
    except select tablename::text from pg_publication_tables where pubname = 'supabase_realtime') missing);
end $$;
revoke execute on function public.admin_realtime_tables() from public, anon;
grant execute on function public.admin_realtime_tables() to authenticated;

-- ============================================================================================
-- 6. Rate limits in the database (S7)
-- The server routes already slow down runaway taps, but the app also writes straight to the
-- database. A runaway loop or a misused account could add thousands of rows a minute. Each kind
-- of write now has an hourly ceiling per person (per address for the signed-out waitlist) that
-- no real use comes near. Crumbs admins and the server itself are never limited.
-- ============================================================================================
create table if not exists public.rate_counters (
  who text not null,
  kind text not null,
  window_start timestamptz not null default now(),
  n int not null default 0,
  primary key (who, kind)
);
alter table public.rate_counters enable row level security;
-- (no rules: nobody reads or writes it directly; only the trigger below does)

create or replace function public.crumbs_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind text := tg_table_name;
  ceiling int := coalesce(tg_argv[0]::int, 200);
  me uuid := (select auth.uid());
  v_who text;
  used int;
begin
  -- The server (service key) and the database owner aren't limited. (current_user would be this
  -- function's owner here, so ask which role the request came in as.)
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then return new; end if;
  if me is not null and public.is_crumbs_admin() then return new; end if;
  v_who := coalesce(me::text,
                  'ip:' || nullif(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
                  'anon');
  insert into public.rate_counters as c (who, kind, window_start, n) values (v_who, v_kind, now(), 1)
  on conflict (who, kind) do update
     set n = case when c.window_start < now() - interval '1 hour' then 1 else c.n + 1 end,
         window_start = case when c.window_start < now() - interval '1 hour' then now() else c.window_start end
  returning n into used;
  if used > ceiling then
    raise exception 'Slow down: that''s a lot in a short time. Try again in a little while.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  -- Tidy now and then.
  if random() < 0.01 then
    delete from public.rate_counters where window_start < now() - interval '2 hours';
  end if;
  return new;
end $$;
revoke execute on function public.crumbs_rate_limit() from public, anon, authenticated;

do $$
declare spec record;
begin
  for spec in select * from (values
      ('places', 300), ('place_ratings', 600), ('dishes', 600), ('dish_ratings', 1000),
      ('place_visits', 300), ('comments', 150), ('reactions', 400), ('lists', 60), ('list_places', 600),
      ('home_meals', 200), ('feedback', 20), ('waitlist', 10), ('restaurant_tips', 40),
      ('restaurant_dishes', 300), ('client_errors', 120), ('group_join_requests', 30),
      ('group_locations', 30), ('plans', 60)) as s(t, ceiling)
  loop
    if to_regclass('public.' || spec.t) is not null then
      execute format('drop trigger if exists crumbs_rate_limit on public.%I', spec.t);
      execute format('create trigger crumbs_rate_limit before insert on public.%I
                      for each row execute function public.crumbs_rate_limit(%s)', spec.t, spec.ceiling);
    end if;
  end loop;
end $$;

-- ============================================================================================
-- 7. Backups read in a fixed order (E24); a record of scheduled job runs (E23)
-- The backup read each table in pages of 1,000 with no order, so a big table could come back
-- with rows missing or twice. backup_rows reads a page in primary-key order. Server only.
-- job_runs: each scheduled chore writes one row (Admin → "Last runs"); kept 60 days.
-- ============================================================================================
create or replace function public.backup_rows(t text, page int default 0, size int default 1000)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  keys text;
  result jsonb;
begin
  if to_regclass('public.' || quote_ident(t)) is null then
    raise exception 'No table %', t using errcode = '42P01';
  end if;
  select string_agg(quote_ident(a.attname), ', ' order by k.n)
    into keys
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality as k(attnum, n)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = ('public.' || quote_ident(t))::regclass and i.indisprimary;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (select * from public.%I order by %s limit %s offset %s) x',
    t, coalesce(keys, 'ctid'), greatest(least(size, 5000), 1), greatest(page, 0) * greatest(least(size, 5000), 1))
    into result;
  return result;
end $$;
revoke execute on function public.backup_rows(text, int, int) from public, anon, authenticated;

create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  job text not null check (char_length(job) <= 60),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail jsonb not null default '{}'
);
create index if not exists job_runs_job_started_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;
drop policy if exists job_runs_admin on public.job_runs;
create policy job_runs_admin on public.job_runs for select to authenticated using (public.is_crumbs_admin());

-- Newest run of each chore, for Admin.
create or replace function public.admin_job_runs()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can see this'; end if;
  delete from public.job_runs where started_at < now() - interval '60 days';
  return (select coalesce(jsonb_agg(r order by r.job), '[]') from (
    select distinct on (job) job, started_at, finished_at, ok, detail,
           (select max(started_at) from public.job_runs j2 where j2.job = j.job and j2.ok) as last_ok
      from public.job_runs j order by job, started_at desc) r);
end $$;
revoke execute on function public.admin_job_runs() from public, anon;
grant execute on function public.admin_job_runs() to authenticated;

-- ============================================================================================
-- 8. Groups: hand over, transfer, delete (third pass #1)
-- Before: "Leave group" just removed the owner's row; the group kept pointing at them and nobody
-- could change its settings or delete it. Now:
--   transfer_group  the owner hands the group to another full member (they stay on as an admin);
--   leaving         an owner who leaves hands it to the longest-standing admin, else member
--                   (never a guest); the only member can't leave — they delete it instead;
--   delete_group    owner only, and they must type the group's name.
-- ============================================================================================
create or replace function public.group_heir(target_group uuid, leaving uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.group_members
   where group_id = target_group and user_id <> leaving and role <> 'guest'
   order by (role = 'admin') desc, joined_at, user_id
   limit 1
$$;
revoke execute on function public.group_heir(uuid, uuid) from public, anon, authenticated;

create or replace function public.transfer_group(target_group uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.groups where id = target_group and created_by = (select auth.uid())) then
    raise exception 'Only the group owner can hand it over';
  end if;
  if new_owner = (select auth.uid()) then return; end if;
  if not exists (select 1 from public.group_members
                  where group_id = target_group and user_id = new_owner and role <> 'guest') then
    raise exception 'Hand it to someone who is a full member of the group';
  end if;
  update public.groups set created_by = new_owner where id = target_group;
  update public.group_members set role = 'admin' where group_id = target_group and user_id = (select auth.uid());
  update public.group_members set role = 'owner' where group_id = target_group and user_id = new_owner;
end $$;

-- Covers the Leave button (and phones still on the older app, which delete their row directly).
create or replace function public.group_member_left()
returns trigger language plpgsql security definer set search_path = public as $$
declare heir uuid;
begin
  if not exists (select 1 from public.groups where id = old.group_id and created_by = old.user_id) then
    return old;
  end if;
  heir := public.group_heir(old.group_id, old.user_id);
  if heir is null then
    -- Leaving on your own as the last full member: say so instead of leaving a group nobody runs.
    if old.user_id = (select auth.uid()) then
      raise exception 'You''re the only full member, so delete the group instead (Group → ⋯ → Delete group)'
        using errcode = 'P0001', hint = 'last_member';
    end if;
    return old;
  end if;
  update public.groups set created_by = heir where id = old.group_id;
  update public.group_members set role = 'owner' where group_id = old.group_id and user_id = heir;
  return old;
end $$;
drop trigger if exists group_member_left on public.group_members;
create trigger group_member_left after delete on public.group_members
  for each row execute function public.group_member_left();

create or replace function public.leave_group(target_group uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Please sign in first'; end if;
  delete from public.group_members where group_id = target_group and user_id = me;
  return jsonb_build_object('owner', (select created_by from public.groups where id = target_group));
end $$;

create or replace function public.delete_group(target_group uuid, typed_name text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where id = target_group;
  if g.id is null or g.created_by <> (select auth.uid()) then
    raise exception 'Only the group owner can delete it';
  end if;
  if lower(btrim(coalesce(typed_name, ''))) <> lower(btrim(g.name)) then
    raise exception 'Type the group''s name exactly to delete it';
  end if;
  delete from public.groups where id = target_group;
end $$;
revoke execute on function public.transfer_group(uuid, uuid), public.leave_group(uuid),
  public.delete_group(uuid, text) from public, anon;
grant execute on function public.transfer_group(uuid, uuid), public.leave_group(uuid),
  public.delete_group(uuid, text) to authenticated;

-- ============================================================================================
-- 9. Recently deleted places and lists, 30 days (third pass #2)
-- Deleting a place used to remove everyone's ratings, visits, dishes and photos for it for good
-- once the undo message was gone. Now a copy of the place (or list) and everything attached to it
-- is kept for 30 days and any full member can put it back. Works for every way of deleting,
-- including phones still on the older app. Deleting a whole group doesn't keep copies.
-- Photos stay in storage while the copy exists (the photo clean-up counts them as in use).
-- ============================================================================================
create table if not exists public.deleted_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  kind text not null check (kind in ('place', 'list')),
  item_id uuid not null,
  name text not null default '',
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null
);
create index if not exists deleted_items_group_idx on public.deleted_items (group_id, deleted_at desc);
create index if not exists deleted_items_deleted_by_idx on public.deleted_items (deleted_by);
alter table public.deleted_items enable row level security;
-- No read rule: the copy holds everyone's private notes for the place, so it's only reached
-- through recently_deleted() (names only) and restore_deleted().

create or replace function public.keep_deleted_place()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only a delete someone asked for (not one cascading from a deleted group).
  if pg_trigger_depth() > 1 then return old; end if;
  insert into public.deleted_items (group_id, kind, item_id, name, deleted_by, snapshot)
  values (old.group_id, 'place', old.id, old.name, (select auth.uid()), jsonb_build_object(
    'places', jsonb_build_array(to_jsonb(old)),
    'place_ratings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.place_ratings x where x.place_id = old.id),
    'dishes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.dishes x where x.place_id = old.id),
    'dish_ratings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.dish_ratings x
                      where x.dish_id in (select id from public.dishes where place_id = old.id)),
    'place_visits', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.place_visits x where x.place_id = old.id),
    'place_facts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.place_facts x where x.place_id = old.id),
    'place_private_notes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.place_private_notes x where x.place_id = old.id),
    'list_places', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.list_places x where x.place_id = old.id),
    'table_orders', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.table_orders x where x.place_id = old.id),
    'activity', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.activity x where x.place_id = old.id),
    'plans', (select coalesce(jsonb_agg(x.id), '[]') from public.plans x where x.place_id = old.id)));
  return old;
end $$;
drop trigger if exists keep_deleted_place on public.places;
create trigger keep_deleted_place before delete on public.places
  for each row execute function public.keep_deleted_place();

create or replace function public.keep_deleted_list()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  insert into public.deleted_items (group_id, kind, item_id, name, deleted_by, snapshot)
  values (old.group_id, 'list', old.id, old.name, (select auth.uid()), jsonb_build_object(
    'lists', jsonb_build_array(to_jsonb(old)),
    'list_places', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.list_places x where x.list_id = old.id),
    'list_shares', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.list_shares x where x.list_id = old.id),
    'swipe_sessions', (select coalesce(jsonb_agg(x.id), '[]') from public.swipe_sessions x where x.list_id = old.id)));
  return old;
end $$;
drop trigger if exists keep_deleted_list on public.lists;
create trigger keep_deleted_list before delete on public.lists
  for each row execute function public.keep_deleted_list();

-- What can be put back in a group (newest first). Names only.
create or replace function public.recently_deleted(target_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(target_group) then return '[]'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', d.id, 'kind', d.kind, 'name', d.name, 'deleted_at', d.deleted_at,
            'deleted_by', d.deleted_by,
            'until', d.deleted_at + interval '30 days',
            'ratings', jsonb_array_length(coalesce(d.snapshot->'place_ratings', '[]')),
            'places', jsonb_array_length(coalesce(d.snapshot->'list_places', '[]')))
          order by d.deleted_at desc), '[]')
            from public.deleted_items d
           where d.group_id = target_group and d.deleted_at > now() - interval '30 days');
end $$;

create or replace function public.restore_deleted(item uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.deleted_items;
  t text;
  r jsonb;
  put int := 0;
  skipped int := 0;
begin
  select * into d from public.deleted_items where id = item;
  if d.id is null or d.deleted_at < now() - interval '30 days' then
    raise exception 'That''s no longer in Recently deleted';
  end if;
  if not public.is_group_member(d.group_id) or public.is_group_guest(d.group_id) then
    raise exception 'Only full members of the group can put things back';
  end if;
  if d.kind = 'place' and exists (
       select 1 from public.places p
        where p.group_id = d.group_id
          and p.google_place_id = d.snapshot->'places'->0->>'google_place_id') then
    raise exception '% is already back in the group', d.name;
  end if;
  -- The row itself first, then everything that hangs off it. A row that can't come back
  -- (its list or its person is gone since) is skipped; the rest still comes back.
  foreach t in array case d.kind
      when 'place' then array['places', 'dishes', 'place_ratings', 'dish_ratings', 'place_visits',
                              'place_facts', 'place_private_notes', 'list_places', 'table_orders']
      else array['lists', 'list_places', 'list_shares'] end loop
    for r in select * from jsonb_array_elements(coalesce(d.snapshot->t, '[]')) loop
      begin
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict do nothing', t, t)
          using r;
        put := put + 1;
      exception when others then
        if t in ('places', 'lists') then raise; end if;
        skipped := skipped + 1;
      end;
    end loop;
  end loop;
  if d.kind = 'place' then
    -- Putting rows back made fresh "added"/"rated" news; keep the original news instead.
    delete from public.activity where place_id = d.item_id and created_at >= now();
    for r in select * from jsonb_array_elements(coalesce(d.snapshot->'activity', '[]')) loop
      begin
        insert into public.activity select * from jsonb_populate_record(null::public.activity, r) on conflict do nothing;
      exception when others then null;
      end;
    end loop;
    update public.plans set place_id = d.item_id
     where place_id is null and id in (select (jsonb_array_elements_text(coalesce(d.snapshot->'plans', '[]')))::uuid);
  else
    update public.swipe_sessions set list_id = d.item_id
     where list_id is null and id in (select (jsonb_array_elements_text(coalesce(d.snapshot->'swipe_sessions', '[]')))::uuid);
  end if;
  delete from public.deleted_items where id = d.id;
  return jsonb_build_object('kind', d.kind, 'id', d.item_id, 'name', d.name, 'rows', put, 'skipped', skipped);
end $$;

-- Gone for good after 30 days (daily job), or straight away when a full member empties it.
create or replace function public.purge_deleted(target_group uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if target_group is null then
    if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and not public.is_crumbs_admin() then
      raise exception 'Not allowed';
    end if;
    delete from public.deleted_items where deleted_at < now() - interval '30 days';
  else
    if not public.is_group_admin(target_group) then
      raise exception 'Only the owner or an admin can empty Recently deleted';
    end if;
    delete from public.deleted_items where group_id = target_group;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.keep_deleted_place(), public.keep_deleted_list() from public, anon, authenticated;
revoke execute on function public.recently_deleted(uuid), public.restore_deleted(uuid), public.purge_deleted(uuid) from public, anon;
grant execute on function public.recently_deleted(uuid), public.restore_deleted(uuid), public.purge_deleted(uuid) to authenticated;

-- ============================================================================================
-- 10. Admin: notice banner + read-only pause (third pass #16), launch numbers (#17),
--     "Invited by" on requests (#19)
-- ============================================================================================
create table if not exists public.site_settings (
  key text primary key check (key in ('notice', 'pause', 'bot_check')),
  value jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.site_settings enable row level security;
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists site_settings_admin on public.site_settings;
create policy site_settings_admin on public.site_settings for all to authenticated
  using (public.is_crumbs_admin()) with check (public.is_crumbs_admin());
grant select on public.site_settings to anon;

-- Bot check on the waitlist (S8): once Turnstile is set up and Admin switches this on, sign-ups
-- only come through the server (/api/waitlist checks the Turnstile answer), not straight in.
do $$ begin
  alter table public.site_settings drop constraint if exists site_settings_key_check;
  alter table public.site_settings add constraint site_settings_key_check check (key in ('notice', 'pause', 'bot_check'));
end $$;
drop policy if exists waitlist_insert on public.waitlist;
create policy waitlist_insert on public.waitlist for insert to anon, authenticated
  with check (not coalesce((select (value->>'on')::boolean from public.site_settings where key = 'bot_check'), false));

-- Read-only pause: while it's on, only Crumbs admins can change things in groups.
create or replace function public.crumbs_paused()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'on')::boolean from public.site_settings where key = 'pause'), false)
$$;
create or replace function public.crumbs_pause_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and public.crumbs_paused() and not public.is_crumbs_admin() then
    raise exception '%', coalesce(nullif((select value->>'message' from public.site_settings where key = 'pause'), ''),
                                  'Crumbs is read-only for a few minutes. Try again soon.')
      using errcode = 'P0001', hint = 'paused';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public.crumbs_pause_guard() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['places', 'place_ratings', 'dishes', 'dish_ratings', 'place_visits', 'place_facts',
                           'place_private_notes', 'comments', 'reactions', 'lists', 'list_places', 'home_meals',
                           'home_meal_ratings', 'home_meal_cooks', 'plans', 'plan_rsvps', 'group_locations',
                           'restaurant_tips', 'restaurant_dishes', 'swipe_votes', 'groups'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists crumbs_pause_guard on public.%I', t);
      execute format('create trigger crumbs_pause_guard before insert or update or delete on public.%I
                      for each row execute function public.crumbs_pause_guard()', t);
    end if;
  end loop;
end $$;

-- Launch numbers, from the database only (no tracking): the last 8 weeks.
create or replace function public.admin_launch_numbers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can see this'; end if;
  return jsonb_build_object(
    'active_7d', (select count(distinct actor) from public.activity where created_at > now() - interval '7 days'),
    'active_30d', (select count(distinct actor) from public.activity where created_at > now() - interval '30 days'),
    'people', (select count(*) from public.profiles),
    'waiting', (select count(*) from public.access_requests r join public.profiles p on p.id = r.user_id
                 where p.access = 'pending'),
    'waitlist', (select count(*) from public.waitlist),
    'weeks', (select coalesce(jsonb_agg(w order by w.week), '[]') from (
      select to_char(wk, 'YYYY-MM-DD') as week,
             (select count(*) from public.places where created_at >= wk and created_at < wk + interval '7 days') as places,
             (select count(*) from public.place_ratings where created_at >= wk and created_at < wk + interval '7 days') as ratings,
             (select count(*) from public.place_visits where created_at >= wk and created_at < wk + interval '7 days') as visits,
             (select count(*) from public.groups where created_at >= wk and created_at < wk + interval '7 days') as groups,
             (select count(*) from public.profiles where created_at >= wk and created_at < wk + interval '7 days') as people,
             (select count(distinct actor) from public.activity where created_at >= wk and created_at < wk + interval '7 days') as active
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') wk) w));
end $$;
revoke execute on function public.admin_launch_numbers() from public, anon;
grant execute on function public.admin_launch_numbers() to authenticated;

-- Invite links are per group, so the link now carries who shared it (?by=…); the request keeps it.
alter table public.access_requests add column if not exists invited_by uuid references auth.users(id) on delete set null;
create index if not exists access_requests_invited_by_idx on public.access_requests (invited_by);
create or replace function public.note_inviter(inviter uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.access_requests r set invited_by = inviter
   where r.user_id = (select auth.uid()) and inviter is not null and inviter <> r.user_id
     and exists (select 1 from public.group_members m
                  where m.group_id = r.group_id and m.user_id = inviter and m.role <> 'guest');
end $$;
revoke execute on function public.note_inviter(uuid) from public, anon;
grant execute on function public.note_inviter(uuid) to authenticated;

-- Same as access_request_list (kept as it was for phones still on the older app) plus who shared
-- the link and the group's owner.
create or replace function public.access_request_people()
returns table (user_id uuid, display_name text, email text, note text, group_name text, role text,
               created_at timestamptz, invited_by text, group_owner text)
language sql stable security definer set search_path = public as $$
  select r.user_id, coalesce(p.display_name, 'Someone'), u.email::text, r.note, g.name, r.role, r.created_at,
         ip.display_name, op.display_name
    from public.access_requests r
    join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.groups g on g.id = r.group_id
    left join public.profiles ip on ip.id = r.invited_by
    left join public.profiles op on op.id = g.created_by
   where public.is_gatekeeper() and p.access = 'pending'
   order by r.created_at
$$;
revoke execute on function public.access_request_people() from public, anon;
grant execute on function public.access_request_people() to authenticated;

-- ============================================================================================
-- 11. Server errors kept (third pass #9)
-- Vercel's free plan keeps server logs for an hour. Route failures now go into the same error
-- log as the app's (Admin → Errors), marked "server". Written with the server key.
-- ============================================================================================
alter table public.client_errors add column if not exists source text not null default 'app'
  check (source in ('app', 'server'));

-- Website and menu read caches were never trimmed (E30): the daily job drops reads older than
-- 90 days (they're read again when someone opens the place).
create or replace function public.trim_read_caches()
returns int language plpgsql security definer set search_path = public as $$
declare a int; b int;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and not public.is_crumbs_admin() then
    raise exception 'Not allowed';
  end if;
  delete from public.site_read_cache where read_at < now() - interval '90 days';
  get diagnostics a = row_count;
  delete from public.menu_read_cache where read_at < now() - interval '90 days';
  get diagnostics b = row_count;
  return a + b;
end $$;
revoke execute on function public.trim_read_caches() from public, anon;
grant execute on function public.trim_read_caches() to authenticated;

-- ============================================================================================
-- 12. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261116_round77')
on conflict (name) do nothing;
