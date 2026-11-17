-- Round 81 (Nov 20): recipes belong to the person who added them and are shared into groups.
-- Expected refusals: 6
--   1 a member sharing someone else's recipe
--   2 the owner sharing into a group they're not in
--   3 a guest rating a shared recipe
--   4 an outsider sharing a recipe they can't see
--   5 a plain member taking a recipe out of their group
--   6 showing a place on a profile that isn't public
\set ana '81818181-0000-0000-0000-000000000001'
\set ben '81818181-0000-0000-0000-000000000002'
\set cal '81818181-0000-0000-0000-000000000003'
\set gus '81818181-0000-0000-0000-000000000004'
\set dee '81818181-0000-0000-0000-000000000005'
\set g '81818181-0000-0000-0000-0000000000a1'
\set h '81818181-0000-0000-0000-0000000000a2'
\set d '81818181-0000-0000-0000-0000000000a3'
\set rid '81818181-0000-0000-0000-0000000000e1'
insert into auth.users (id, email) values (:'ana', 'a81@example.com'), (:'ben', 'b81@example.com'),
  (:'cal', 'c81@example.com'), (:'gus', 'g81@example.com'), (:'dee', 'd81@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'ana', 'Ana'), (:'ben', 'Ben'), (:'cal', 'Cal'), (:'gus', 'Gus'), (:'dee', 'Dee')
on conflict do nothing;
update profiles set access = 'approved' where id in (:'ana', :'ben', :'cal', :'gus', :'dee');
delete from groups where id in (:'g', :'h', :'d') or (is_personal and created_by in (:'ana', :'ben', :'cal', :'gus', :'dee'));
insert into groups (id, name, created_by, join_code) values (:'g', 'Supper club', :'ana', 'SPPRCB'),
  (:'h', 'Work lunch', :'cal', 'WRKLNC'), (:'d', 'Dee crew', :'dee', 'DEECRW');
insert into group_members (group_id, user_id, role) values
  (:'g', :'ana', 'owner'), (:'g', :'ben', 'member'), (:'g', :'gus', 'guest'),
  (:'h', :'cal', 'owner'), (:'h', :'ana', 'member'), (:'d', :'dee', 'owner') on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- Adding a recipe in a group: it becomes Ana's, lives in her My Crumbs, stays shared with the group
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
insert into home_meals (id, group_id, name, status, created_by)
values ('81818181-0000-0000-0000-0000000000c1', :'g', 'r81 lasagna', 'Want to cook', :'ana') returning name;
commit;
select 1 / (case when (select g.is_personal and g.created_by = '81818181-0000-0000-0000-000000000001'
                        from home_meals m join groups g on g.id = m.group_id
                       where m.id = '81818181-0000-0000-0000-0000000000c1') then 1 else 0 end) as lives_in_my_crumbs;
select 1 / (case when exists (select 1 from home_meal_shares where meal_id = '81818181-0000-0000-0000-0000000000c1' and group_id = :'g')
                 then 1 else 0 end) as still_in_the_group;
select 1 / (case when (select count(*) from activity where group_id = :'g' and meal_id = '81818181-0000-0000-0000-0000000000c1') >= 1
                 then 1 else 0 end) as group_feed_saw_it;

-- Ben (member of the group) sees it, rates it, logs it; can't edit or delete it
begin; set local role authenticated; set local request.jwt.claim.sub = :'ben';
select 1 / (case when (select count(*) from home_meals where id = '81818181-0000-0000-0000-0000000000c1') = 1 then 1 else 0 end) as ben_sees_it;
insert into home_meal_ratings (meal_id, user_id, score, notes) values ('81818181-0000-0000-0000-0000000000c1', :'ben', 5, 'r81 ben loved it');
insert into home_meal_cooks (meal_id, cooked_on, cooked_by, created_by) values ('81818181-0000-0000-0000-0000000000c1', current_date, :'ben', :'ben');
update home_meals set name = 'r81 changed by ben' where id = '81818181-0000-0000-0000-0000000000c1';
delete from home_meals where id = '81818181-0000-0000-0000-0000000000c1';
commit;
select 1 / (case when (select name = 'r81 lasagna' and status = 'Cooked' from home_meals where id = '81818181-0000-0000-0000-0000000000c1')
                 then 1 else 0 end) as only_owner_edits_and_cooking_marks_it;

-- Ana shares it into Work lunch too
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.share_meal('81818181-0000-0000-0000-0000000000c1', :'h');
insert into home_meal_ratings (meal_id, user_id, score) values ('81818181-0000-0000-0000-0000000000c1', :'ana', 4);
select 1 / (case when (select count(*) from home_meal_ratings where meal_id = '81818181-0000-0000-0000-0000000000c1') = 2 then 1 else 0 end) as ana_sees_both;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'cal';
select 1 / (case when (select count(*) from home_meals where id = '81818181-0000-0000-0000-0000000000c1') = 1 then 1 else 0 end) as cal_sees_it;
select 1 / (case when (select count(*) from home_meal_ratings where meal_id = '81818181-0000-0000-0000-0000000000c1') = 1
                  and not exists (select 1 from home_meal_ratings where user_id = '81818181-0000-0000-0000-000000000002')
                 then 1 else 0 end) as cal_sees_owner_not_other_group;
select 1 / (case when (select count(*) from home_meal_cooks where meal_id = '81818181-0000-0000-0000-0000000000c1') = 0 then 1 else 0 end) as other_groups_cooks_hidden;
commit;

begin; set local role authenticated; set local request.jwt.claim.sub = :'ben';
select public.share_meal('81818181-0000-0000-0000-0000000000c1', :'h');  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.share_meal('81818181-0000-0000-0000-0000000000c1', :'d');  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'gus';
insert into home_meal_ratings (meal_id, user_id, score) values ('81818181-0000-0000-0000-0000000000c1', :'gus', 3);  -- [refusal 3]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select 1 / (case when (select count(*) from home_meals where id = '81818181-0000-0000-0000-0000000000c1') = 0 then 1 else 0 end) as outsider_sees_nothing;
select public.share_meal('81818181-0000-0000-0000-0000000000c1', :'d');  -- [refusal 4]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ben';
select public.share_meal('81818181-0000-0000-0000-0000000000c1', :'g', false);  -- [refusal 5]
rollback;

-- Shared on Crumbs: people who already see it in their spaces don't get it twice
update home_meals set recipe_public = true, recipe = 'r81 layer and bake' where id = '81818181-0000-0000-0000-0000000000c1';
begin; set local role authenticated; set local request.jwt.claim.sub = :'ben';
select 1 / (case when not (public.public_recipes('r81 lasagna') @> '[{"id": "81818181-0000-0000-0000-0000000000c1"}]') then 1 else 0 end) as not_twice;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'dee';
select 1 / (case when public.public_recipes('r81 lasagna') @> '[{"id": "81818181-0000-0000-0000-0000000000c1"}]' then 1 else 0 end) as everyone_on_crumbs;
commit;

-- The work group's owner can take it out of their group
begin; set local role authenticated; set local request.jwt.claim.sub = :'cal';
select public.share_meal('81818181-0000-0000-0000-0000000000c1', :'h', false);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.share_meal('81818181-0000-0000-0000-0000000000c1', :'h');
commit;

-- Deleting My Crumbs: the recipe moves to the group it was shared with first, nothing lost
select id as space from groups where created_by = :'ana' and is_personal \gset
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.delete_group(:'space', 'My Crumbs');
commit;
select 1 / (case when (select group_id from home_meals where id = '81818181-0000-0000-0000-0000000000c1') = :'g'
                  and (select count(*) from home_meal_ratings where meal_id = '81818181-0000-0000-0000-0000000000c1') = 2
                  and exists (select 1 from home_meal_shares where meal_id = '81818181-0000-0000-0000-0000000000c1' and group_id = :'h')
                  and not exists (select 1 from home_meal_shares where meal_id = '81818181-0000-0000-0000-0000000000c1' and group_id = :'g')
                 then 1 else 0 end) as rescued;

-- The move of existing recipes (as when the SQL file runs): Ben's old group recipe becomes his
insert into home_meals (id, group_id, name, status, created_by)
values ('81818181-0000-0000-0000-0000000000c2', :'g', 'r81 old soup', 'Cooked', :'ben');
select 1 / (case when (select g.is_personal and g.created_by = :'ben' from home_meals m join groups g on g.id = m.group_id
                        where m.id = '81818181-0000-0000-0000-0000000000c2')
                  and exists (select 1 from home_meal_shares where meal_id = '81818181-0000-0000-0000-0000000000c2' and group_id = :'g')
                 then 1 else 0 end) as old_recipe_moved;

-- ---------------------------------------------------------------------------------------------
-- A place on your public profile
-- ---------------------------------------------------------------------------------------------
insert into restaurants (id, source_key, name) values (:'rid', 'osm:81e1', 'Noodle Bar') on conflict do nothing;
insert into places (group_id, google_place_id, name, status, created_by, restaurant_id)
values (:'g', 'osm:81e1', 'Noodle Bar', 'Been', :'ana', :'rid');
update profiles set profile_public = false where id = :'ana';
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.toggle_profile_pick(:'rid', true);  -- [refusal 6]
rollback;
update profiles set profile_public = true, handle = 'ana81' where id = :'ana';
begin; set local role authenticated; set local request.jwt.claim.sub = :'ana';
select public.toggle_profile_pick(:'rid', true);
select public.toggle_profile_pick(:'rid', true);
select 1 / (case when (select count(*) from profile_picks where user_id = :'ana' and restaurant_id = :'rid') = 1 then 1 else 0 end) as shown_once;
select public.toggle_profile_pick(:'rid', false);
select 1 / (case when (select count(*) from profile_picks where user_id = :'ana') = 0 then 1 else 0 end) as taken_off;
commit;

-- tidy up
update profiles set profile_public = false, handle = null where id = :'ana';
delete from home_meals where name like 'r81 %';
delete from groups where id in (:'g', :'h', :'d') or (is_personal and created_by in (:'ana', :'ben', :'cal', :'gus', :'dee'));
delete from restaurants where id = :'rid';
delete from auth.users where id in (:'ana', :'ben', :'cal', :'gus', :'dee');
