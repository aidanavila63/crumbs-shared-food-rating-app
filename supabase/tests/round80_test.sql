-- Round 80 (Nov 19): My Crumbs (a private space), Also save to…, private spending.
-- Expected refusals: 9
--   1 someone else typing the personal space's code
--   2 adding someone else to a personal space directly (even from the SQL editor)
--   3 a join request for a personal space
--   4 making a personal space public
--   5 turning a personal space into an ordinary group from the app
--   6 a guest code for a personal space
--   7 My Crumbs for someone not let in yet
--   8 saving a place into a group you're not in
--   9 a member reading the all-amounts view directly
\set ana '80808080-0000-0000-0000-000000000001'
\set ben '80808080-0000-0000-0000-000000000002'
\set cal '80808080-0000-0000-0000-000000000003'
\set gid '80808080-0000-0000-0000-0000000000a1'
\set other '80808080-0000-0000-0000-0000000000a2'
\set rid '80808080-0000-0000-0000-0000000000e1'
insert into auth.users (id, email) values (:'ana', 'a80@example.com'), (:'ben', 'b80@example.com'),
  (:'cal', 'c80@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'ana', 'Ana'), (:'ben', 'Ben'), (:'cal', 'Cal') on conflict do nothing;
update profiles set access = 'approved', private_spend = false where id in (:'ana', :'ben', :'cal');
delete from groups where id in (:'gid', :'other') or (is_personal and created_by in (:'ana', :'ben', :'cal'));
insert into groups (id, name, created_by, join_code) values (:'gid', 'Lunch crew', :'ana', 'LNCHRB'),
  (:'other', 'Not yours', :'cal', 'NTYRSB');
insert into group_members (group_id, user_id, role) values (:'gid', :'ana', 'owner'), (:'gid', :'ben', 'member'),
  (:'other', :'cal', 'owner') on conflict do nothing;
insert into restaurants (id, source_key, name) values (:'rid', 'osm:80e1', 'Taco Spot') on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- My Crumbs
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select (public.ensure_my_crumbs()).id as mine \gset
select 1 / (case when (public.ensure_my_crumbs()).id = :'mine' then 1 else 0 end) as same_space_twice;
select 1 / (case when (select is_personal and name = 'My Crumbs' from groups where id = :'mine') then 1 else 0 end) as is_personal;
commit;
select join_code as code from groups where id = :'mine' \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'ben';
select 1 / (case when public.invite_preview(:'code') is null then 1 else 0 end) as invite_page_shows_nothing;
select public.join_group(:'code');  -- [refusal 1]
rollback;
insert into group_members (group_id, user_id, role) values (:'mine', :'ben', 'member');  -- [refusal 2]
insert into group_join_requests (group_id, user_id, role, via) values (:'mine', :'ben', 'member', 'invite');  -- [refusal 3]
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
update groups set visibility = 'public', join_mode = 'open' where id = :'mine';  -- [refusal 4]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
update groups set is_personal = false where id = :'mine';  -- [refusal 5]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.guest_invite(:'mine');  -- [refusal 6]
rollback;
-- renaming and the look still work
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
update groups set name = 'Ana''s spots', emoji = '🌮' where id = :'mine';
commit;
select 1 / (case when (select name from groups where id = :'mine') = 'Ana''s spots' then 1 else 0 end) as renamed;
-- someone not let in yet
update feature_flags set state = 'admin' where key = 'new_people';
update profiles set access = 'pending' where id = :'cal';
begin; set local role authenticated; set local request.jwt.claim.sub = :'cal';
select public.ensure_my_crumbs();  -- [refusal 7]
rollback;
update profiles set access = 'approved' where id = :'cal';
update feature_flags set state = 'everyone' where key = 'new_people';
-- a personal space doesn't use up the group allowance
select 1 / (case when (select count(*) from groups where created_by = :'ana' and not is_personal) = 1 then 1 else 0 end) as allowance_counts_groups_only;

-- ---------------------------------------------------------------------------------------------
-- Also save to…
-- ---------------------------------------------------------------------------------------------
insert into places (id, group_id, google_place_id, name, status, created_by, restaurant_id) values
  ('80808080-0000-0000-0000-0000000000b1', :'mine', 'osm:80b1', 'Taco Spot', 'Been', :'ana', :'rid');
insert into place_ratings (place_id, user_id, score, notes) values ('80808080-0000-0000-0000-0000000000b1', :'ana', 5, 'r80 secret note');
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select (public.copy_place('80808080-0000-0000-0000-0000000000b1', :'gid'))->>'id' as copy \gset
select 1 / (case when (public.copy_place('80808080-0000-0000-0000-0000000000b1', :'gid'))->>'existed' = 'true' then 1 else 0 end) as second_time_no_change;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.copy_place('80808080-0000-0000-0000-0000000000b1', :'other');  -- [refusal 8]
rollback;
do $$ begin
  if (select count(*) from places where group_id = '80808080-0000-0000-0000-0000000000a1' and google_place_id = 'osm:80b1') <> 1 then
    raise exception 'the group should have one copy'; end if;
end $$;
select 1 / (case when (select score from place_ratings where place_id = :'copy' and user_id = :'ana') = 5
                  and (select notes from place_ratings where place_id = :'copy' and user_id = :'ana') is null
                 then 1 else 0 end) as score_travels_note_stays;

-- ---------------------------------------------------------------------------------------------
-- Private spending
-- ---------------------------------------------------------------------------------------------
insert into place_visits (id, place_id, created_by, visited_on, spend, people) values
  ('80808080-0000-0000-0000-0000000000c1', :'copy', :'ana', current_date - 3, 60, 2);
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.set_private_spend(true);
insert into place_visits (id, place_id, created_by, visited_on, spend, people) values
  ('80808080-0000-0000-0000-0000000000c2', :'copy', :'ana', current_date, 80, 2);
select 1 / (case when (select count(*) from private_spends) = 2 then 1 else 0 end) as ana_sees_her_amounts;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ben';
select 1 / (case when (select count(*) from place_visits where place_id = :'copy' and spend is not null) = 0
                  and (select count(*) from place_visits where place_id = :'copy') = 2 then 1 else 0 end) as group_sees_visits_not_amounts;
select 1 / (case when (select count(*) from private_spends) = 0 then 1 else 0 end) as ben_sees_no_amounts;
select count(*) from public.visits_for_totals;  -- [refusal 9]
rollback;
select 1 / (case when (select sum(spend) from visits_for_totals where place_id = :'copy') = 140 then 1 else 0 end) as totals_still_count;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.set_private_spend(false);
commit;
select 1 / (case when (select sum(spend) from place_visits where place_id = :'copy') = 140
                  and not exists (select 1 from private_spends where user_id = :'ana') then 1 else 0 end) as amounts_back;
-- deleting a visit takes its private amount with it
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.set_private_spend(true);
commit;
delete from place_visits where id = '80808080-0000-0000-0000-0000000000c2';
select 1 / (case when not exists (select 1 from private_spends where visit_id = '80808080-0000-0000-0000-0000000000c2') then 1 else 0 end) as amount_gone_with_visit;

-- tidy up
delete from groups where id in (:'gid', :'other', :'mine');
delete from restaurants where id = :'rid';
delete from auth.users where id in (:'ana', :'ben', :'cal');
