-- Round 90: make your own version of a recipe (credited); no near-copies on Crumbs.
-- Expected refusals: 5
--   1 an unchanged version going on Crumbs
--   2 someone else's near-copy (one word changed) going on Crumbs
--   3 the same near-copy added straight onto Crumbs
--   4 a version of a private recipe you can't see
--   5 an unchanged version of a private group recipe going on Crumbs
\set a '90909090-0000-0000-0000-000000000001'
\set b '90909090-0000-0000-0000-000000000002'
\set c '90909090-0000-0000-0000-000000000003'
\set g '90909090-0000-0000-0000-0000000000a1'
\set gc '90909090-0000-0000-0000-0000000000a2'
\set r1 '90909090-0000-0000-0000-0000000000c1'
\set r2 '90909090-0000-0000-0000-0000000000c2'
insert into auth.users (id, email) values (:'a', 'a90@example.com'), (:'b', 'b90@example.com'), (:'c', 'c90@example.com')
on conflict do nothing;
insert into profiles (id, display_name) values (:'a', 'Ana Silva'), (:'b', 'Ben'), (:'c', 'Cara') on conflict do nothing;
update profiles set display_name = case id when :'a' then 'Ana Silva' when :'b' then 'Ben' else 'Cara' end where id in (:'a', :'b', :'c');
update profiles set access = 'approved' where id in (:'a', :'b', :'c');
delete from home_meals where name like 'r90 %';
delete from groups where id in (:'g', :'gc') or (is_personal and created_by in (:'a', :'b', :'c'));
insert into groups (id, name, created_by, join_code) values (:'g', 'r90 group', :'a', 'NRBXQV'), (:'gc', 'r90 cara', :'c', 'NRBXQW');
insert into group_members (group_id, user_id, role) values (:'g', :'a', 'owner'), (:'g', :'b', 'member'), (:'gc', :'c', 'owner')
on conflict do nothing;

-- Ana's lasagna (on Crumbs) and her private stew (only in the group)
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
insert into home_meals (id, group_id, name, status, created_by, ingredients, recipe, servings, recipe_public) values
  (:'r1', :'g', 'r90 Sunday lasagna', 'Cooked', :'a',
   '[{"qty":"500","unit":"g","item":"beef mince"},{"qty":"1","unit":"","item":"onion"},{"qty":"2","unit":"cups","item":"tomato passata"},
     {"qty":"12","unit":"","item":"lasagna sheets"},{"qty":"250","unit":"g","item":"ricotta"},{"qty":"","unit":"","item":"mozzarella"}]',
   E'1. Brown the beef with the onion and a pinch of salt.\n2. Add the passata and simmer gently for forty minutes.\n3. Layer sauce, sheets and ricotta three times.\n4. Top with mozzarella and bake until bubbling and golden.',
   6, true),
  (:'r2', :'g', 'r90 Grandma stew', 'Cooked', :'a',
   '[{"item":"beef chuck"},{"item":"carrots"},{"item":"potatoes"},{"item":"red wine"}]',
   E'Sear the beef in batches. Add carrots, potatoes and wine. Cover and braise slowly for three hours until tender.',
   null, false);
commit;
select 1 / (case when (select cardinality(fp_ingredients) = 6 and cardinality(fp_steps) > 20 from home_meals where id = :'r1')
                 then 1 else 0 end) as fingerprinted;

-- Ben makes his own version: in his My Crumbs, credited, private, his to change
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
select public.make_my_version(:'r1');
commit;
select 1 / (case when (select count(*) from home_meals m join groups g on g.id = m.group_id
                        where m.created_by = :'b' and g.is_personal and m.based_on = :'r1'
                          and m.based_on_name = 'r90 Sunday lasagna' and m.based_on_by = :'a'
                          and not m.recipe_public and m.status = 'Want to cook' and m.servings = 6) = 1
                 then 1 else 0 end) as version_made;
-- he can't take the credit off or change it
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
update home_meals set based_on = null, based_on_name = 'Mine', based_on_by = :'b' where created_by = :'b' and based_on = :'r1';
commit;
select 1 / (case when (select count(*) from home_meals where created_by = :'b' and based_on = :'r1'
                         and based_on_name = 'r90 Sunday lasagna' and based_on_by = :'a') = 1 then 1 else 0 end) as credit_stays;
-- and can't add a made-up credit on a new recipe
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
insert into home_meals (group_id, name, status, created_by, based_on_name, based_on_by)
values (:'g', 'r90 fake credit', 'Cooked', :'b', 'Someone famous', :'a');
commit;
select 1 / (case when (select based_on_name is null and based_on_by is null from home_meals where name = 'r90 fake credit')
                 then 1 else 0 end) as no_made_up_credit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
select 1 / (case when public.recipe_credit((select id from home_meals where created_by = :'b' and based_on = :'r1'))
                      @> '{"by": "Ana", "name": "r90 Sunday lasagna", "original": {"name": "r90 Sunday lasagna"}}'
                 then 1 else 0 end) as credit_line;
update home_meals set recipe_public = true where created_by = :'b' and based_on = :'r1';  -- [refusal 1]
rollback;
-- changed enough (new meat, cheese and steps): it can go on Crumbs, still credited
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
update home_meals
   set ingredients = '[{"item":"italian sausage"},{"item":"onion"},{"item":"tomato passata"},{"item":"lasagna sheets"},
                       {"item":"bechamel"},{"item":"parmesan"},{"item":"spinach"}]',
       recipe = E'Fry the sausage until crisp. Wilt the spinach in the same pan. Make a bechamel with butter, flour and milk.\nLayer sauce, sheets, spinach and bechamel. Finish with parmesan and bake for forty minutes.',
       recipe_public = true
 where created_by = :'b' and based_on = :'r1';
commit;
select 1 / (case when (select recipe_public and public_since is not null from home_meals where created_by = :'b' and based_on = :'r1')
                 then 1 else 0 end) as own_version_shared;
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
select 1 / (case when exists (select 1 from jsonb_array_elements(public.public_recipes('r90 Sunday', 10)) x
                               where x->>'by' = 'Ben' and x->>'based_on_by' = 'Ana') then 1 else 0 end) as credit_on_crumbs;
commit;

-- Cara types the same lasagna (one word changed) and tries to share it
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
insert into home_meals (group_id, name, status, created_by, ingredients, recipe)
values (:'gc', 'r90 My lasagna', 'Cooked', :'c',
   '[{"qty":"1","unit":"lb","item":"Beef Mince"},{"item":"onions"},{"item":"tomato passata"},{"item":"lasagna sheets"},{"item":"ricotta"},{"item":"mozzarella"}]',
   E'1. Brown the beef with the onion and a pinch of pepper.\n2. Add the passata and simmer gently for forty minutes.\n3. Layer sauce, sheets and ricotta three times.\n4. Top with mozzarella and bake until bubbling and golden.');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
update home_meals set recipe_public = true where name = 'r90 My lasagna';  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
insert into home_meals (group_id, name, status, created_by, ingredients, recipe, recipe_public)
select group_id, 'r90 Copy again', 'Cooked', created_by, ingredients, recipe, true from home_meals where name = 'r90 My lasagna';  -- [refusal 3]
rollback;
-- a different recipe of hers is fine, and so is a tiny one with nothing much to copy
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
insert into home_meals (group_id, name, status, created_by, ingredients, recipe, recipe_public) values
  (:'gc', 'r90 Miso soup', 'Cooked', :'c', '[{"item":"dashi"},{"item":"white miso"},{"item":"tofu"},{"item":"scallions"}]',
   'Warm the dashi, whisk in the miso off the heat, add tofu and scallions.', true),
  (:'gc', 'r90 Toast', 'Cooked', :'c', '[{"item":"bread"},{"item":"butter"}]', 'Toast it.', true);
commit;
select 1 / (case when (select count(*) from home_meals where name in ('r90 Miso soup', 'r90 Toast') and recipe_public) = 2
                 then 1 else 0 end) as different_ones_shared;
-- Ana can still edit hers (she was first)
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
update home_meals set recipe = recipe || E'\n5. Rest ten minutes before cutting.' where id = :'r1';
commit;

-- Private recipes: Cara can't copy Ana's stew; Ben (in the group) can, but can't share it unchanged
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
select public.make_my_version(:'r2');  -- [refusal 4]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
select public.make_my_version(:'r2');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
update home_meals set recipe_public = true where created_by = :'b' and based_on = :'r2';  -- [refusal 5]
rollback;

-- Ana deletes her stew: Ben's version stays, still says whose it was
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
delete from home_meals where id = :'r2';
commit;
select 1 / (case when (select based_on is null and based_on_name = 'r90 Grandma stew' and based_on_by = :'a'
                         from home_meals where created_by = :'b' and based_on_name = 'r90 Grandma stew') then 1 else 0 end) as credit_outlives_original;

-- tidy up
delete from home_meals where name like 'r90 %' or based_on_name like 'r90 %';
delete from groups where id in (:'g', :'gc') or (is_personal and created_by in (:'a', :'b', :'c'));
delete from auth.users where id in (:'a', :'b', :'c');
