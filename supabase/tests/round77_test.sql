-- Round 77 (Nov 16): photo folders, faster read rules, rate limits, groups hand-over/delete,
-- Recently deleted, pause switch, Admin numbers, invited-by.
-- Expected refusals: 12
--   1 a guest can't add to the group's photo folder (S15)
--   2 the 11th waitlist entry from one address in an hour (rate limit)
--   3 someone not in the group can't take it over
--   4 handing the group to a guest
--   5 the only full member leaving (they delete instead)
--   6 deleting with the wrong name
--   7 a guest putting a deleted place back
--   8 a member writing while Crumbs is paused
--   9 launch numbers for a non-admin
--  10 backup_rows for a signed-in person (server only)
--  11 photo report for a non-admin
--  12 a member emptying Recently deleted (owner/admins only)
\set owner '77777777-0000-0000-0000-000000000001'
\set mate '77777777-0000-0000-0000-000000000002'
\set guest '77777777-0000-0000-0000-000000000003'
\set outsider '77777777-0000-0000-0000-000000000004'
\set gid '77777777-0000-0000-0000-0000000000a1'
\set solo '77777777-0000-0000-0000-0000000000a2'
insert into auth.users (id, email) values (:'owner', 'o77@example.com'), (:'mate', 'm77@example.com'),
  (:'guest', 'g77@example.com'), (:'outsider', 'x77@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'owner', 'Olive'), (:'mate', 'Max'), (:'guest', 'Gus'),
  (:'outsider', 'Xena') on conflict do nothing;
update profiles set display_name = case id when :'owner' then 'Olive' when :'mate' then 'Max'
                                    when :'guest' then 'Gus' else 'Xena' end
 where id in (:'owner', :'mate', :'guest', :'outsider');
update profiles set is_admin = (id = :'owner'), access = 'approved'
 where id in (:'owner', :'mate', :'guest', :'outsider');
delete from groups where id in (:'gid', :'solo');
insert into groups (id, name, created_by, join_code) values (:'gid', 'Lunch crew', :'owner', 'LNCH77'),
  (:'solo', 'Just me', :'mate', 'SMLE77');
delete from group_members where group_id in (:'gid', :'solo');
insert into group_members (group_id, user_id, role, joined_at) values
  (:'gid', :'owner', 'owner', now() - interval '3 days'),
  (:'gid', :'mate', 'member', now() - interval '2 days'),
  (:'gid', :'guest', 'guest', now() - interval '3 days'),
  (:'solo', :'mate', 'owner', now());
insert into places (id, group_id, google_place_id, name, status, created_by) values
  ('77777777-0000-0000-0000-0000000000b1', :'gid', 'osm:777001', 'Noodle Bar', 'Been', :'owner'),
  ('77777777-0000-0000-0000-0000000000b2', :'gid', 'osm:777002', 'Taco Spot', 'Want to try', :'owner');
insert into place_ratings (place_id, user_id, score) values
  ('77777777-0000-0000-0000-0000000000b1', :'owner', 5), ('77777777-0000-0000-0000-0000000000b1', :'mate', 4);
insert into dishes (id, place_id, name, created_by) values
  ('77777777-0000-0000-0000-0000000000c1', '77777777-0000-0000-0000-0000000000b1', 'Dan dan', :'owner');
insert into dish_ratings (dish_id, user_id, score) values ('77777777-0000-0000-0000-0000000000c1', :'mate', 5);
insert into lists (id, group_id, name, created_by) values
  ('77777777-0000-0000-0000-0000000000d1', :'gid', 'Lunch', :'owner');
insert into list_places (list_id, place_id, added_by) values
  ('77777777-0000-0000-0000-0000000000d1', '77777777-0000-0000-0000-0000000000b1', :'owner');

-- ---------------------------------------------------------------------------------------------
-- Photo folders (B12, S15)
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select 1 / (case when public.photo_folder_can_add(:'gid') then 1 else 0 end) as member_adds_to_group;
select 1 / (case when public.photo_folder_can_add(:'mate') then 1 else 0 end) as own_folder;
select 1 / (case when public.photo_folder_can_add(:'owner') then 0 else 1 end) as not_someone_elses;
select 1 / (case when public.photo_folder_can_add('not-a-folder') then 0 else 1 end) as junk_folder;
insert into storage.objects (bucket_id, name, owner) values ('crumbs-photos', :'mate' || '/77777777-1111-0000-0000-000000000001.jpg', :'mate');
insert into storage.objects (bucket_id, name, owner) values ('crumbs-photos', :'gid' || '/77777777-1111-0000-0000-000000000002.jpg', :'mate');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'guest';
select 1 / (case when public.photo_folder_can_add(:'gid') then 0 else 1 end) as guest_cannot;
insert into storage.objects (bucket_id, name, owner) values ('crumbs-photos', :'gid' || '/77777777-1111-0000-0000-000000000003.jpg', :'guest');  -- [refusal 1]
rollback;
-- a restaurant's folder: anyone let in can add; only who added it (or an admin) removes it
insert into restaurants (id, source_key, name) values ('77777777-0000-0000-0000-0000000000e1', 'osm:777e1', 'Noodle Bar')
on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'outsider';
select 1 / (case when public.photo_folder_can_add('77777777-0000-0000-0000-0000000000e1') then 1 else 0 end) as restaurant_folder;
select 1 / (case when public.photo_can_remove('77777777-0000-0000-0000-0000000000e1/x.jpg', :'mate') then 0 else 1 end) as not_others_storefront;
select 1 / (case when public.photo_can_remove('77777777-0000-0000-0000-0000000000e1/x.jpg', :'outsider') then 1 else 0 end) as own_storefront;
select 1 / (case when public.photo_can_remove(:'gid' || '/x.jpg', :'outsider') then 0 else 1 end) as outsider_cannot_remove;
commit;

-- ---------------------------------------------------------------------------------------------
-- Faster read rules (E13): the same rows as before
-- ---------------------------------------------------------------------------------------------
update place_ratings set draft = true where place_id = '77777777-0000-0000-0000-0000000000b1' and user_id = :'mate';
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when (select count(*) from places where group_id = :'gid') = 2 then 1 else 0 end) as member_sees_places;
select 1 / (case when (select count(*) from place_ratings where place_id = '77777777-0000-0000-0000-0000000000b1') = 1 then 1 else 0 end) as draft_hidden;
select 1 / (case when (select count(*) from dish_ratings where dish_id = '77777777-0000-0000-0000-0000000000c1') = 1 then 1 else 0 end) as dish_ratings_seen;
select 1 / (case when (select count(*) from list_places where list_id = '77777777-0000-0000-0000-0000000000d1') = 1 then 1 else 0 end) as list_places_seen;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select 1 / (case when (select count(*) from place_ratings where place_id = '77777777-0000-0000-0000-0000000000b1') = 2 then 1 else 0 end) as own_draft_seen;
commit;
update place_ratings set draft = false where place_id = '77777777-0000-0000-0000-0000000000b1';
begin; set local role authenticated; set local request.jwt.claim.sub = :'outsider';
select 1 / (case when (select count(*) from places where group_id = :'gid') = 0 then 1 else 0 end) as outsider_sees_no_places;
select 1 / (case when (select count(*) from place_ratings where place_id = '77777777-0000-0000-0000-0000000000b1') = 0 then 1 else 0 end) as outsider_no_ratings;
select 1 / (case when (select count(*) from dishes where place_id = '77777777-0000-0000-0000-0000000000b1') = 0 then 1 else 0 end) as outsider_no_dishes;
select 1 / (case when (select count(*) from group_members where group_id = :'gid') = 0 then 1 else 0 end) as outsider_no_members;
commit;

-- ---------------------------------------------------------------------------------------------
-- Rate limits (S7): ten waitlist sign-ups an hour from one address
-- ---------------------------------------------------------------------------------------------
delete from rate_counters;
begin; set local role anon; set local request.headers = '{"x-forwarded-for": "203.0.113.77"}';
insert into waitlist (email) select 'rate' || n || '@example.com' from generate_series(1, 10) n;
commit;
begin; set local role anon; set local request.headers = '{"x-forwarded-for": "203.0.113.77"}';
insert into waitlist (email) values ('rate11@example.com');  -- [refusal 2]
rollback;
begin; set local role anon; set local request.headers = '{"x-forwarded-for": "198.51.100.1"}';
insert into waitlist (email) values ('other-address@example.com');
commit;
delete from waitlist where email like 'rate%@example.com' or email = 'other-address@example.com';

-- ---------------------------------------------------------------------------------------------
-- Groups: hand over, transfer, delete (third pass #1)
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'outsider';
select public.transfer_group(:'gid', :'outsider');  -- [refusal 3]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select public.transfer_group(:'gid', :'guest');  -- [refusal 4]
rollback;
-- The owner leaves: the longest-standing full member (not the older guest) takes over.
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select public.leave_group(:'gid');
commit;
do $$ begin
  if (select created_by from groups where id = '77777777-0000-0000-0000-0000000000a1') <> '77777777-0000-0000-0000-000000000002' then
    raise exception 'the member should have taken over'; end if;
  if (select role from group_members where group_id = '77777777-0000-0000-0000-0000000000a1'
        and user_id = '77777777-0000-0000-0000-000000000002') <> 'owner' then
    raise exception 'the new owner should have the owner role'; end if;
end $$;
-- back in, then the new owner hands it back properly
insert into group_members (group_id, user_id, role) values (:'gid', :'owner', 'member');
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.transfer_group(:'gid', :'owner');
commit;
do $$ begin
  if (select created_by from groups where id = '77777777-0000-0000-0000-0000000000a1') <> '77777777-0000-0000-0000-000000000001' then
    raise exception 'transfer should hand the group back'; end if;
  if (select role from group_members where group_id = '77777777-0000-0000-0000-0000000000a1'
        and user_id = '77777777-0000-0000-0000-000000000002') <> 'admin' then
    raise exception 'the old owner stays on as an admin'; end if;
end $$;
-- The only full member can't just leave (an older app deleting the row directly is caught too)
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
delete from group_members where group_id = :'solo' and user_id = :'mate';  -- [refusal 5]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.delete_group(:'solo', 'Just you');  -- [refusal 6]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.delete_group(:'solo', '  just ME ');
commit;
do $$ begin
  if exists (select 1 from groups where id = '77777777-0000-0000-0000-0000000000a2') then
    raise exception 'the group should be gone'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Recently deleted (third pass #2)
-- ---------------------------------------------------------------------------------------------
select count(*) as activity_before from activity where place_id = '77777777-0000-0000-0000-0000000000b1' \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
delete from places where id = '77777777-0000-0000-0000-0000000000b1';
select 1 / (case when (select count(*) from places where id = '77777777-0000-0000-0000-0000000000b1') = 0 then 1 else 0 end) as place_gone;
select 1 / (case when jsonb_array_length(public.recently_deleted(:'gid')) = 1 then 1 else 0 end) as kept_for_30_days;
select 1 / (case when (public.recently_deleted(:'gid')->0->>'ratings')::int = 2 then 1 else 0 end) as ratings_counted;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'outsider';
select 1 / (case when jsonb_array_length(public.recently_deleted(:'gid')) = 0 then 1 else 0 end) as outsider_sees_nothing;
select 1 / (case when (select count(*) from deleted_items) = 0 then 1 else 0 end) as copies_not_readable;
commit;
select id as copy from deleted_items where item_id = '77777777-0000-0000-0000-0000000000b1' \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'guest';
select public.restore_deleted(:'copy');  -- [refusal 7]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select public.restore_deleted(:'copy');
commit;
do $$ begin
  if (select count(*) from place_ratings where place_id = '77777777-0000-0000-0000-0000000000b1') <> 2 then
    raise exception 'both ratings should be back'; end if;
  if (select count(*) from dish_ratings where dish_id = '77777777-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'the dish rating should be back'; end if;
  if (select count(*) from list_places where place_id = '77777777-0000-0000-0000-0000000000b1') <> 1 then
    raise exception 'it should be back on its list'; end if;
  if exists (select 1 from deleted_items where item_id = '77777777-0000-0000-0000-0000000000b1') then
    raise exception 'the copy should be used up'; end if;
end $$;
select 1 / (case when (select count(*) from activity where place_id = '77777777-0000-0000-0000-0000000000b1') = :activity_before
                 then 1 else 0 end) as no_duplicate_news;
-- a list too
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
delete from lists where id = '77777777-0000-0000-0000-0000000000d1';
commit;
select id as listcopy from deleted_items where item_id = '77777777-0000-0000-0000-0000000000d1' \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select public.restore_deleted(:'listcopy');
select 1 / (case when (select count(*) from list_places where list_id = '77777777-0000-0000-0000-0000000000d1') = 1 then 1 else 0 end) as list_back;
commit;
-- emptying it: owner/admins only
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
delete from places where id = '77777777-0000-0000-0000-0000000000b2';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'guest';
select public.purge_deleted(:'gid');  -- [refusal 12]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when public.purge_deleted(:'gid') = 1 then 1 else 0 end) as emptied;
commit;
-- deleting a whole group keeps no copies
insert into groups (id, name, created_by, join_code) values (:'solo', 'Gone soon', :'mate', 'SMLE77');
insert into group_members (group_id, user_id, role) values (:'solo', :'mate', 'owner');
insert into places (group_id, google_place_id, name, status, created_by) values (:'solo', 'osm:777009', 'X', 'Been', :'mate');
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.delete_group(:'solo', 'Gone soon');
commit;
select 1 / (case when (select count(*) from deleted_items where group_id = :'solo') = 0 then 1 else 0 end) as no_copies_for_deleted_group;

-- ---------------------------------------------------------------------------------------------
-- Pause switch (third pass #16)
-- ---------------------------------------------------------------------------------------------
insert into site_settings (key, value) values ('pause', '{"on": true, "message": "Back in five"}')
on conflict (key) do update set value = excluded.value;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
insert into place_ratings (place_id, user_id, score) values ('77777777-0000-0000-0000-0000000000b1', :'mate', 3)
on conflict (place_id, user_id) do update set score = 3;  -- [refusal 8]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
update place_ratings set score = 4 where place_id = '77777777-0000-0000-0000-0000000000b1' and user_id = :'owner';
commit;
begin; set local role anon;
select 1 / (case when (select value->>'message' from site_settings where key = 'pause') = 'Back in five' then 1 else 0 end) as anyone_reads_notice;
commit;
update site_settings set value = '{"on": false}' where key = 'pause';
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
update place_ratings set score = 3 where place_id = '77777777-0000-0000-0000-0000000000b1' and user_id = :'mate';
commit;

-- ---------------------------------------------------------------------------------------------
-- Admin: launch numbers, backups, photo report, job runs, live-update check
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.admin_launch_numbers();  -- [refusal 9]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.backup_rows('places', 0, 10);  -- [refusal 10]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.admin_photo_report();  -- [refusal 11]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when jsonb_array_length(public.admin_launch_numbers()->'weeks') = 8 then 1 else 0 end) as eight_weeks;
select 1 / (case when (public.admin_photo_report()->>'files')::int >= 2 then 1 else 0 end) as photo_report;
select 1 / (case when jsonb_typeof(public.admin_job_runs()) = 'array' then 1 else 0 end) as job_runs;
select 1 / (case when public.admin_realtime_tables() = '[]'::jsonb then 1 else 0 end) as live_updates_all_on;
commit;
-- the server reads backups in key order, a page at a time
select 1 / (case when jsonb_array_length(public.backup_rows('group_members', 0, 2)) = 2 then 1 else 0 end) as backup_page;
select 1 / (case when (public.backup_rows('places', 0, 5000)->0->>'id') <= (public.backup_rows('places', 0, 5000)->1->>'id')
                 then 1 else 0 end) as backup_ordered;
-- an orphaned photo shows up once it's a day old; one still in use doesn't
update storage.objects set created_at = now() - interval '2 days' where name like '77777777-%';
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when (public.admin_photo_report()->'orphan_names') ? (:'gid' || '/77777777-1111-0000-0000-000000000002.jpg')
                 then 1 else 0 end) as orphan_found;
commit;
update places set photo_path = :'gid' || '/77777777-1111-0000-0000-000000000002.jpg' where id = '77777777-0000-0000-0000-0000000000b1';
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when (public.admin_photo_report()->'orphan_names') ? (:'gid' || '/77777777-1111-0000-0000-000000000002.jpg')
                 then 0 else 1 end) as in_use_kept;
select 1 / (case when (public.admin_photo_report()->'no_thumb_names') ? (:'gid' || '/77777777-1111-0000-0000-000000000002.jpg')
                 then 1 else 0 end) as needs_small_copy;
commit;

-- ---------------------------------------------------------------------------------------------
-- Invited by (#19)
-- ---------------------------------------------------------------------------------------------
update profiles set access = 'pending' where id = :'outsider';
insert into access_requests (user_id, group_id, role) values (:'outsider', :'gid', 'member')
on conflict (user_id) do update set group_id = excluded.group_id;
begin; set local role authenticated; set local request.jwt.claim.sub = :'outsider';
select public.note_inviter(:'guest');   -- a guest's link doesn't count
select public.note_inviter(:'mate');
commit;
-- (the gatekeeper answers the list; earlier tests may have named one)
select coalesce((select id::text from profiles where lets_people_in order by id limit 1), :'owner') as keeper \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'keeper';
select 1 / (case when (select invited_by from public.access_request_people() where user_id = :'outsider') = 'Max'
                 then 1 else 0 end) as invited_by_shown;
commit;

-- tidy up
delete from access_requests where user_id = :'outsider';
delete from storage.objects where name like '77777777-%';
delete from groups where id in (:'gid', :'solo');
delete from restaurants where id = '77777777-0000-0000-0000-0000000000e1';
delete from rate_counters;
delete from deleted_items where group_id in (:'gid', :'solo');
