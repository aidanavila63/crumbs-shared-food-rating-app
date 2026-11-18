-- Round 97: menu extras (O5) — served-at times, seasonal dishes, more than one menu.
-- Expected refusals: 2
--   1 a member who isn't the owner
--   2 a season that ends before it starts
\set own '97979797-0000-0000-0000-000000000001'
\set mem '97979797-0000-0000-0000-000000000002'
\set r '97979797-0000-0000-0000-0000000000e1'
insert into auth.users (id, email) values (:'own', 'o97@example.com'), (:'mem', 'm97@example.com') on conflict do nothing;
delete from restaurants where id = :'r';
insert into restaurants (id, source_key, name) values (:'r', 'osm:97e1', 'r97 Cafe');
insert into restaurant_managers (restaurant_id, user_id) values (:'r', :'own') on conflict do nothing;
insert into restaurant_dishes (id, restaurant_id, name, name_key, price) values
  ('97979797-0000-0000-0000-0000000000d1', :'r', 'Eggs Benny', 'eggs benny', 16),
  ('97979797-0000-0000-0000-0000000000d2', :'r', 'Pumpkin Latte', 'pumpkin latte', 6),
  ('97979797-0000-0000-0000-0000000000d3', :'r', 'Summer Salad', 'summer salad', 14);

begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.owner_dish_extras('97979797-0000-0000-0000-0000000000d1', array['breakfast'], 'Brunch', null, null);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_dish_extras('97979797-0000-0000-0000-0000000000d2', null, null, current_date + 5, current_date);  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_dish_extras('97979797-0000-0000-0000-0000000000d1', array['breakfast', 'lunch'], ' Brunch ', null, null);
select public.owner_dish_extras('97979797-0000-0000-0000-0000000000d2', null, 'Drinks', (now() at time zone 'America/Toronto')::date - 1, (now() at time zone 'America/Toronto')::date + 30);
select public.owner_dish_extras('97979797-0000-0000-0000-0000000000d3', null, null, (now() at time zone 'America/Toronto')::date + 100, (now() at time zone 'America/Toronto')::date + 190);
commit;
select 1 / (case when (select jsonb_agg(m ->> 'name' order by m ->> 'name') from jsonb_array_elements(public.restaurant_public_data(:'r') -> 'menu') m)
                      = '["Eggs Benny", "Pumpkin Latte"]'::jsonb then 1 else 0 end) as out_of_season_hidden;
select 1 / (case when exists (select 1 from jsonb_array_elements(public.restaurant_public_data(:'r') -> 'menu') m
                               where m ->> 'name' = 'Eggs Benny' and m ->> 'menu_name' = 'Brunch' and m -> 'served' = '["breakfast", "lunch"]')
                 then 1 else 0 end) as extras_on_page;

delete from restaurants where id = :'r';
delete from auth.users where id in (:'own', :'mem');
