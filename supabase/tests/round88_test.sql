-- Round 88: recipe servings and times, your shopping list (U9).
-- Expected refusals: 2
--   1 adding to someone else's shopping list
--   2 a recipe for 51 servings
\set a '88888888-0000-0000-0000-000000000001'
\set b '88888888-0000-0000-0000-000000000002'
\set g '88888888-0000-0000-0000-0000000000a1'
insert into auth.users (id, email) values (:'a', 'a88@example.com'), (:'b', 'b88@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'a', 'Ana'), (:'b', 'Ben') on conflict do nothing;
update profiles set access = 'approved' where id in (:'a', :'b');
delete from groups where id = :'g' or (is_personal and created_by in (:'a', :'b'));
insert into groups (id, name, created_by, join_code) values (:'g', 'r88 group', :'a', 'GTRBXV');
insert into group_members (group_id, user_id, role) values (:'g', :'a', 'owner'), (:'g', :'b', 'member') on conflict do nothing;

begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
insert into home_meals (id, group_id, name, status, created_by, servings, prep_minutes, cook_minutes)
values ('88888888-0000-0000-0000-0000000000c1', :'g', 'r88 curry', 'Want to cook', :'a', 4, 15, 40);
insert into shopping_items (item, qty, unit, meal_id) values ('rice', '2', 'cup', '88888888-0000-0000-0000-0000000000c1');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
select 1 / (case when (select count(*) from shopping_items) = 0 then 1 else 0 end) as others_lists_hidden;
insert into shopping_items (user_id, item) values (:'a', 'sneaky');  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
select 1 / (case when (select count(*) from shopping_items) = 1 then 1 else 0 end) as own_list;
select 1 / (case when jsonb_array_length(public.export_me() -> 'shopping_items') = 1 then 1 else 0 end) as in_my_download;
update home_meals set servings = 51 where id = '88888888-0000-0000-0000-0000000000c1';  -- [refusal 2]
rollback;

-- tidy up
delete from home_meals where name like 'r88 %';
delete from groups where id = :'g' or (is_personal and created_by in (:'a', :'b'));
delete from auth.users where id in (:'a', :'b');
