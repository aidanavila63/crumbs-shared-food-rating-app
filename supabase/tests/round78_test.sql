-- Round 78 (Nov 17): agreeing to the terms, deleting your account, reports, hibernation,
-- invite from the waitlist.
-- Expected refusals: 6
--   1 agreeing without the allergen tick
--   2 a member resolving a report (admins only)
--   3 hibernation run by a signed-in member
--   4 quiet-groups count for a non-admin
--   5 inviting from the waitlist without being the gatekeeper
--   6 a report from someone not let in yet
\set owner '78787878-0000-0000-0000-000000000001'
\set dee '78787878-0000-0000-0000-000000000002'
\set eve '78787878-0000-0000-0000-000000000003'
\set gid '78787878-0000-0000-0000-0000000000a1'
\set rid '78787878-0000-0000-0000-0000000000e1'
insert into auth.users (id, email) values (:'owner', 'o78@example.com'), (:'dee', 'd78@example.com'),
  (:'eve', 'e78@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'owner', 'Ola'), (:'dee', 'Dee'), (:'eve', 'Eve') on conflict do nothing;
update profiles set is_admin = (id = :'owner'), access = 'approved' where id in (:'owner', :'dee', :'eve');
delete from groups where id = :'gid';
insert into groups (id, name, created_by, join_code) values (:'gid', 'Dinner club', :'owner', 'DNRC78');
insert into group_members (group_id, user_id, role) values (:'gid', :'owner', 'owner'), (:'gid', :'dee', 'member'),
  (:'gid', :'eve', 'member') on conflict do nothing;
insert into restaurants (id, source_key, name) values (:'rid', 'osm:78e1', 'Pho Place') on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- Agreeing to the terms
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select public.accept_terms('2026-11-draft-1', false);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select public.accept_terms('2026-11-draft-1', true);
select 1 / (case when public.my_terms()->>'version' = '2026-11-draft-1' and public.my_terms()->>'allergen_at' is not null
                 then 1 else 0 end) as terms_stored;
commit;
-- the owner terms go with a pending claim
insert into restaurant_claims (restaurant_id, user_id, contact_name, role, status)
values (:'rid', :'eve', 'Eve', 'owner', 'pending');
begin; set local role authenticated; set local request.jwt.claim.sub = :'eve';
select public.accept_owner_terms(:'rid', 'owners-2026-11-draft-1');
commit;
select 1 / (case when (select owner_terms_version from restaurant_claims where user_id = :'eve' and restaurant_id = :'rid')
                 = 'owners-2026-11-draft-1' then 1 else 0 end) as owner_terms_stored;
delete from restaurant_claims where user_id = :'eve' and restaurant_id = :'rid';

-- ---------------------------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
insert into detail_reports (restaurant_id, detail, sensitive, note) values (:'rid', 'dish:pad-thai:gluten_free', true, 'has soy sauce');
select 1 / (case when public.reported_details(:'rid') @> '[{"detail": "dish:pad-thai:gluten_free", "sensitive": true}]' then 1 else 0 end) as reported_shows;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'eve';
select 1 / (case when (select count(*) from detail_reports where restaurant_id = :'rid') = 0 then 1 else 0 end) as who_reported_hidden;
select public.resolve_report((select id from public.detail_reports limit 1), 'fixed');  -- [refusal 2]
rollback;
begin; set local role anon;
select 1 / (case when jsonb_array_length(public.reported_details(:'rid')) = 1 then 1 else 0 end) as anyone_sees_hidden_flag;
commit;
select id as report from detail_reports where restaurant_id = :'rid' limit 1 \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when jsonb_array_length(public.admin_reports()) >= 1 then 1 else 0 end) as admin_queue;
select public.resolve_report(:'report', 'fixed');
select 1 / (case when public.reported_details(:'rid') = '[]'::jsonb then 1 else 0 end) as resolved;
commit;
-- someone not let in yet can't report  [refusal 6]
update feature_flags set state = 'admin' where key = 'new_people';
update profiles set access = 'pending' where id = :'eve';
begin; set local role authenticated; set local request.jwt.claim.sub = :'eve';
insert into detail_reports (restaurant_id, detail) values (:'rid', 'hours');
rollback;
update profiles set access = 'approved' where id = :'eve';
update feature_flags set state = 'everyone' where key = 'new_people';

-- ---------------------------------------------------------------------------------------------
-- Hibernation
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select public.seen_today();
commit;
select 1 / (case when (select last_seen_on from profiles where id = :'dee') = (now() at time zone 'America/Toronto')::date then 1 else 0 end) as seen;  -- Crumbs' day is Toronto's
update profiles set last_seen_on = current_date - 800 where id = :'eve';
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (:'eve', 'https://push.example/r78', 'k', 'a')
on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select public.hibernate_quiet_accounts();  -- [refusal 3]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select public.admin_quiet_groups();  -- [refusal 4]
rollback;
select public.hibernate_quiet_accounts();
select 1 / (case when not exists (select 1 from push_subscriptions where endpoint = 'https://push.example/r78') then 1 else 0 end) as keys_cleared;
select 1 / (case when exists (select 1 from profiles where id = :'eve') then 1 else 0 end) as nothing_deleted;
begin; set local role authenticated; set local request.jwt.claim.sub = :'owner';
select 1 / (case when (public.admin_quiet_groups()->>'quiet_people')::int >= 1 then 1 else 0 end) as quiet_counted;
commit;
update profiles set last_seen_on = null where id = :'eve';

-- ---------------------------------------------------------------------------------------------
-- Invite from the waitlist
-- ---------------------------------------------------------------------------------------------
delete from waitlist where email = 'newcomer78@example.com';
insert into waitlist (email) values ('newcomer78@example.com');
select id as entry from waitlist where email = 'newcomer78@example.com' \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select public.invite_from_waitlist(:'entry');  -- [refusal 5]
rollback;
select coalesce((select id::text from profiles where lets_people_in order by id limit 1), :'owner') as keeper \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'keeper';
select public.invite_from_waitlist(:'entry');
commit;
update feature_flags set state = 'admin' where key = 'new_people';
insert into auth.users (id, email) values ('78787878-0000-0000-0000-0000000000f1', 'Newcomer78@example.com') on conflict do nothing;
insert into profiles (id, display_name) values ('78787878-0000-0000-0000-0000000000f1', 'Newcomer') on conflict do nothing;
select 1 / (case when (select access from profiles where id = '78787878-0000-0000-0000-0000000000f1') = 'approved'
                 then 1 else 0 end) as approved_on_arrival;
select 1 / (case when not exists (select 1 from waitlist where email = 'newcomer78@example.com') then 1 else 0 end) as off_the_waitlist;
update feature_flags set state = 'everyone' where key = 'new_people';
delete from auth.users where id = '78787878-0000-0000-0000-0000000000f1';

-- ---------------------------------------------------------------------------------------------
-- Deleting an account: everything of data value stays without a name; personal data and photos go
-- ---------------------------------------------------------------------------------------------
insert into places (id, group_id, google_place_id, name, status, created_by, photo_path) values
  ('78787878-0000-0000-0000-0000000000b1', :'gid', 'osm:78b1', 'Pho Place', 'Been', :'dee', :'gid' || '/78787878-1111-0000-0000-000000000001.jpg');
insert into storage.objects (bucket_id, name, owner) values ('crumbs-photos', :'gid' || '/78787878-1111-0000-0000-000000000001.jpg', :'dee');
insert into place_ratings (place_id, user_id, score, notes) values ('78787878-0000-0000-0000-0000000000b1', :'dee', 4, 'great broth');
insert into restaurant_attr_votes (restaurant_id, key, user_id, value) values (:'rid', 'patio', :'dee', true);
insert into place_visits (place_id, created_by, note, visited_on) values ('78787878-0000-0000-0000-0000000000b1', :'dee', 'birthday dinner', current_date);
insert into comments (group_id, target, user_id, body) values (:'gid', 'place:78b1', :'dee', 'r78 so good'), (:'gid', 'place:78b1', :'eve', 'r78 agreed');
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select 1 / (case when (select count(*) from public.my_photo_files()) = 1 then 1 else 0 end) as my_photos_listed;
select public.delete_my_account(false);
commit;
do $$ begin
  if (select created_by from places where id = '78787878-0000-0000-0000-0000000000b1') is not null then
    raise exception 'the place should stay without a name'; end if;
  if (select photo_path from places where id = '78787878-0000-0000-0000-0000000000b1') is not null then
    raise exception 'the photo link should be cleared'; end if;
  if exists (select 1 from place_ratings where user_id = '78787878-0000-0000-0000-000000000002') then
    raise exception 'the rating should no longer carry the account'; end if;
  if not exists (select 1 from place_ratings r where r.place_id = '78787878-0000-0000-0000-0000000000b1' and r.score = 4
                  and r.notes = 'great broth' and not exists (select 1 from auth.users u where u.id = r.user_id)) then
    raise exception 'the rating should stay, under an anonymous id'; end if;
  if not exists (select 1 from restaurant_attr_votes v where v.restaurant_id = '78787878-0000-0000-0000-0000000000e1'
                  and v.key = 'patio' and not exists (select 1 from auth.users u where u.id = v.user_id)) then
    raise exception 'the yes/no confirmation should stay, under an anonymous id'; end if;
  if (select count(*) from place_visits where place_id = '78787878-0000-0000-0000-0000000000b1' and created_by is null and note is null) <> 1 then
    raise exception 'the visit should stay, without a name or its note'; end if;
  if exists (select 1 from comments where body = 'r78 so good') then
    raise exception 'unticked: the comment should be gone'; end if;
end $$;
-- Keeping notes (the default): the comment stays, without a name
begin; set local role authenticated; set local request.jwt.claim.sub = :'eve';
select public.delete_my_account();
commit;
do $$ begin
  if not exists (select 1 from comments where body = 'r78 agreed' and user_id is null) then
    raise exception 'kept: the comment should stay without a name'; end if;
  if exists (select 1 from auth.users where id = '78787878-0000-0000-0000-000000000003') then
    raise exception 'the account should be gone'; end if;
end $$;

-- tidy up
delete from storage.objects where name like '78787878-%' or name like :'gid' || '/%';
delete from groups where id = :'gid';
delete from restaurant_attr_votes where restaurant_id = :'rid';
delete from place_ratings where place_id = '78787878-0000-0000-0000-0000000000b1';
delete from restaurants where id = :'rid';
delete from waitlist where email = 'newcomer78@example.com';
delete from auth.users where id in (:'owner', :'dee', :'eve');
