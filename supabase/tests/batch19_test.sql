\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
-- reasons on a rating (max 4)
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
update place_ratings set reasons = '{Great service,Cozy}' where user_id = :'B' and place_id = (select id from places where created_by=:'B' limit 1);
select 'B reasons ok';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
update place_ratings set reasons = '{a,b,c,d,e}' where user_id = :'B';
select 'reasons 5 (expect error above)';
rollback;
-- profile spice/diet/safe
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
update profiles set spice_max = 1, diet = '{Vegetarian}', safe_for_me = true where id = :'B';
select 'B profile', spice_max, diet, safe_for_me from profiles where id = :'B';
-- next-time note only (empty body)
insert into place_private_notes (place_id, user_id, body, next_time)
  select id, :'B', '', 'Ask for extra spicy' from places where created_by = :'B' limit 1
  on conflict (place_id, user_id) do update set next_time = excluded.next_time;
select 'B next time', next_time from place_private_notes where user_id = :'B';
-- a home meal, private then public
create temp table bm as select id from groups where created_by = :'B' limit 1;
insert into home_meals (group_id, name, status, created_by, recipe) select id, 'B curry', 'Cooked', :'B', 'Fry onions…' from bm;
commit;
create temp table bc as select id from home_meals where name = 'B curry';
grant select on bc to authenticated;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D sees B recipe before share (expect 0)', jsonb_array_length(public.public_recipes(null, 30));
insert into recipe_reviews (meal_id, score, tip) select id, 4, 'more garlic' from bc;
select 'D review before share (expect error above)';
rollback;
update home_meals set recipe_public = true where name = 'B curry';
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D sees B recipe after share', (public.public_recipes('curry', 30)->0->>'name'), (public.public_recipes(null, 30)->0->>'by');
insert into recipe_reviews (meal_id, score, tip) select id, 4, 'more garlic' from bc;
select 'after review', public.public_recipes('curry', 30)->0->>'score', public.public_recipes('curry', 30)->0->'tips'->0->>'tip';
select 'D can read B meal row directly (expect 0)', count(*) from home_meals where name = 'B curry';
commit;
update home_meals set recipe_public = false where name = 'B curry';
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'unshared: D sees tips (own only)', count(*) from recipe_reviews;
select 'unshared list (expect 0)', jsonb_array_length(public.public_recipes(null, 30));
commit;
