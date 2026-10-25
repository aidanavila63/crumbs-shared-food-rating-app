\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
\set A '00000000-0000-0000-0000-00000000000a'
create temp table bg as select id from groups where created_by = :'B' limit 1;
insert into home_meals (group_id, name, status, created_by, recipe, recipe_public, dietary) select id, 'Vegan chili', 'Cooked', :'B', 'Beans…', true, '{Vegan}' from bg;
insert into home_meals (group_id, name, status, created_by, recipe, recipe_public) select id, 'Old pie', 'Cooked', :'B', 'Pastry…', true from bg;
insert into recipe_reviews (meal_id, user_id, score, tip) select id, :'D', 5, 'add cocoa' from home_meals where name = 'Vegan chili';
insert into recipe_reviews (meal_id, user_id, score, created_at) select id, :'D', 4, now() - interval '30 days' from home_meals where name = 'Old pie';
update profiles set diet = '{Vegan}' where id = :'D';
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'trending', jsonb_path_query_array(public.public_recipes(null, 10, 'trending'), '$[*].name');
select 'suggested', jsonb_path_query_array(public.public_recipes(null, 10, 'suggested'), '$[*].name');
select 'search pastry', jsonb_path_query_array(public.public_recipes('pastry', 10, 'search'), '$[*].name');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B suggested excludes own', jsonb_array_length(public.public_recipes(null, 10, 'suggested'));
insert into table_orders (place_id, people, items) select id, 4, '[{"dish_id":"x","qty":2}]' from places where created_by = :'B' limit 1;
select 'B order', people, items from table_orders;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D sees B order (expect 0)', count(*) from table_orders;
commit;
