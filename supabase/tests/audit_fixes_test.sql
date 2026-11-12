-- Rounds 74–75 (Nov 11 audit): private places, what group-mates can read, group locations,
-- push keys, Toronto days, the record of SQL files.
-- Expected refusals: 4 (a member adding a group location before the setting allows it; an
-- outsider adding one; a ninth location; someone not yet let in adding a group directly).
create temp table ag as
  select g.id as gid, g.created_by as owner,
         (select m.user_id from group_members m
           where m.group_id = g.id and m.user_id <> g.created_by and m.role is distinct from 'guest'
           order by m.user_id limit 1) as mate
    from groups g
   where exists (select 1 from group_members m
                  where m.group_id = g.id and m.user_id <> g.created_by and m.role is distinct from 'guest')
   order by g.id limit 1;
select gid, owner, mate from ag \gset
select id as outsider from profiles
 where id not in (select user_id from group_members where group_id = :'gid') order by id limit 1 \gset
-- the group's owner doubles as the Crumbs admin here; the mate and the outsider are ordinary people
update profiles set is_admin = (id = :'owner') where id in (:'owner', :'mate', :'outsider');
update groups set settings = settings - 'members_add_locations' where id = :'gid';
delete from group_locations where group_id = :'gid';

-- A phone still on the old app saves an area on the profile: it is moved to the private table.
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
update profiles set areas = '[{"name":"Home","lat":43.6,"lng":-79.5,"km":2}]'::jsonb where id = :'mate';
commit;
do $$ begin
  if exists (select 1 from profiles where jsonb_array_length(areas) > 0) then
    raise exception 'areas must not stay on the profile row'; end if;
  if not exists (select 1 from private_places where areas->0->>'name' = 'Home') then
    raise exception 'the area should have moved to private_places'; end if;
end $$;

-- A group-mate can't read the other's profile row or private places; group_profiles gives the safe fields.
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select 1 / (case when (select count(*) from profiles where id = :'owner') = 0 then 1 else 0 end) as mate_cannot_read_row;
select 1 / (case when (select count(*) from profiles where id = :'mate') = 1 then 1 else 0 end) as own_row_ok;
select 1 / (case when jsonb_array_length(public.group_profiles(:'gid')) >= 2 then 1 else 0 end) as safe_list;
select 1 / (case when (public.group_profiles(:'gid')->0) ?| array['notify', 'areas', 'diet', 'is_admin', 'share_ratings']
                 then 0 else 1 end) as no_private_fields;
select 1 / (case when (public.group_profiles(:'gid')->0) ? 'avoid' then 1 else 0 end) as has_avoid;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when (select count(*) from private_places where user_id = :'mate') = 0 then 1 else 0 end) as places_private;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'outsider';
select 1 / (case when jsonb_array_length(public.group_profiles(:'gid')) = 0 then 1 else 0 end) as outsider_gets_nothing;
commit;
-- A Crumbs admin still reads every row (Admin page).
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when (select count(*) from profiles) > 1 then 1 else 0 end) as admin_reads_all;
select 1 / (case when public.admin_migrations() @> '[{"name": "20261114_audit_fixes", "ran": true}]' then 1 else 0 end) as recorded;
select 1 / (case when public.admin_migrations() @> '[{"name": "20261113_seasonal_hours", "ran": true}]' then 1 else 0 end) as older_seen;
commit;

-- Group locations: the owner adds one; a member can't until the setting is on  [refusal 1]
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
insert into group_locations (group_id, name, lat, lng, km) values (:'gid', 'Office', 43.65, -79.38, 1);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select 1 / (case when (select count(*) from group_locations where group_id = :'gid') = 1 then 1 else 0 end) as member_sees_it;
insert into group_locations (group_id, name, lat, lng, km) values (:'gid', 'Gym', 43.66, -79.39, 1);
rollback;
update groups set settings = settings || '{"members_add_locations": true}'::jsonb where id = :'gid';
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
insert into group_locations (group_id, name, lat, lng, km) values (:'gid', 'Gym', 43.66, -79.39, 1);
commit;
-- An outsider sees none and can't add one  [refusal 2]
begin; set local role authenticated; set local request.jwt.claim.sub = :'outsider';
select 1 / (case when (select count(*) from group_locations where group_id = :'gid') = 0 then 1 else 0 end) as outsider_sees_none;
insert into group_locations (group_id, name, lat, lng, km) values (:'gid', 'Nope', 43.66, -79.39, 1);
rollback;
-- Eight at most  [refusal 3]
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
insert into group_locations (group_id, name, lat, lng, km)
select :'gid', 'Spot ' || n, 43.6 + n / 100.0, -79.4, 2 from generate_series(1, 6) n;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
insert into group_locations (group_id, name, lat, lng, km) values (:'gid', 'Ninth', 43.7, -79.4, 2);
rollback;
-- The group's own "Download backup" carries its locations (all eight).
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select 1 / (case when jsonb_array_length(public.export_group(:'gid')->'locations') = 8 then 1 else 0 end) as backup_has_locations;
select 1 / (case when public.export_group(:'gid') ?& array['places', 'lists', 'home_meals', 'plans', 'comments', 'members'] then 1 else 0 end) as backup_keeps_the_rest;
commit;

-- Push keys: only your own.
insert into push_subscriptions (user_id, endpoint, p256dh, auth)
values (:'owner', 'https://push.example/audit-test', 'k', 'a') on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select 1 / (case when (select count(*) from push_subscriptions where user_id = :'owner') = 0 then 1 else 0 end) as keys_private;
select (public.use_allowance('ai'))->>'ok' as allowance_still_answers;
commit;
delete from push_subscriptions where endpoint = 'https://push.example/audit-test';

-- Days run on Toronto time for everything that asks what day it is.
do $$ declare fn text; begin
  foreach fn in array array['use_allowance', 'restaurant_public_data', 'set_seasonal_hours', 'dish_of_the_week'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = fn
                      and array_to_string(p.proconfig, ',') ilike '%timezone=America/Toronto%') then
      raise exception '% should run on Toronto time', fn; end if;
  end loop;
end $$;

-- Round 76: someone who signed in but hasn't been let in gets no allowance and can't add a group
-- behind create_group()'s back  [refusal 4]. Once let in, the allowance answers again.
update feature_flags set state = 'admin' where key = 'new_people';
insert into auth.users (id, email) values ('99999999-0000-0000-0000-0000000000a1', 'waiting@example.com') on conflict do nothing;
insert into profiles (id, display_name) values ('99999999-0000-0000-0000-0000000000a1', 'Waiting Wren') on conflict do nothing;
update profiles set access = 'pending', is_admin = false, is_builder = false where id = '99999999-0000-0000-0000-0000000000a1';
begin; set local role authenticated; set local request.jwt.claim.sub = '99999999-0000-0000-0000-0000000000a1';
select 1 / (case when (public.use_allowance('ai'))->>'ok' = 'false' then 1 else 0 end) as waiting_gets_no_allowance;
select 1 / (case when (public.my_access())->>'status' = 'pending' then 1 else 0 end) as still_waiting;
insert into groups (name, created_by, join_code) values ('Behind the back', '99999999-0000-0000-0000-0000000000a1', 'BEHIND');
rollback;
update profiles set access = 'approved' where id = '99999999-0000-0000-0000-0000000000a1';
begin; set local role authenticated; set local request.jwt.claim.sub = '99999999-0000-0000-0000-0000000000a1';
select 1 / (case when (public.use_allowance('ai'))->>'ok' = 'true' then 1 else 0 end) as let_in_gets_allowance;
rollback;
update feature_flags set state = 'everyone' where key = 'new_people';
