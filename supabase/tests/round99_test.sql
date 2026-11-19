-- Round 99: table menus — owner categories, dish details, sold out today, the look.
-- Expected refusals: 8
--   1 a member who isn't the owner adds a category
--   2 a member sets the look
--   3 a look that isn't a v2 design
--   4 a dish put in another restaurant's category
--   5 a photo from another restaurant
--   6 ordering with a dish from another restaurant
--   7 a size price list with a gap in it
--   8 a diet label that isn't one of Crumbs' own
\set own '99999999-0000-0000-0000-000000000001'
\set mem '99999999-0000-0000-0000-000000000002'
\set r '99999999-0000-0000-0000-0000000000e1'
\set r2 '99999999-0000-0000-0000-0000000000e2'
insert into auth.users (id, email) values (:'own', 'o99@example.com'), (:'mem', 'm99@example.com') on conflict do nothing;
delete from restaurants where id in (:'r', :'r2');
insert into restaurants (id, source_key, name, owner_verified) values (:'r', 'osm:99e1', 'r99 Pizza', true), (:'r2', 'osm:99e2', 'r99 Other', true);
insert into restaurant_managers (restaurant_id, user_id) values (:'r', :'own'), (:'r2', :'mem') on conflict do nothing;
insert into restaurant_dishes (id, restaurant_id, name, name_key, price, course) values
  ('99999999-0000-0000-0000-0000000000d1', :'r', 'Margherita', 'margherita', 14, 'main'),
  ('99999999-0000-0000-0000-0000000000d2', :'r', 'Rigatoni', 'rigatoni', 22, 'main'),
  ('99999999-0000-0000-0000-0000000000d3', :'r', 'Garlic knots', 'garlic knots', 7, 'side'),
  ('99999999-0000-0000-0000-0000000000d9', :'r2', 'Elsewhere', 'elsewhere', 5, 'main');
insert into restaurant_menu_sections (id, restaurant_id, name) values ('99999999-0000-0000-0000-0000000000c9', :'r2', 'Their category');

begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.owner_menu_section_save(:'r', null, 'Pizza', null, null, '{}');  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.owner_set_menu_design(:'r', '{"v": 2, "mode": "style", "style": "pizzeria"}');  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_set_menu_design(:'r', '{"mode": "style"}');  -- [refusal 3]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_dish_look('99999999-0000-0000-0000-0000000000d1', '99999999-0000-0000-0000-0000000000c9', null, null, null, null, null, null, null, null);  -- [refusal 4]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_dish_look('99999999-0000-0000-0000-0000000000d1', null, null, null, null, null, null, null, null, '99999999-0000-0000-0000-0000000000e2/x.jpg');  -- [refusal 5]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_menu_order(:'r', null, array['99999999-0000-0000-0000-0000000000d9']::uuid[]);  -- [refusal 6]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_dish_look('99999999-0000-0000-0000-0000000000d1', null, array[14, null, 25]::numeric[], null, null, null, null, null, null, null);  -- [refusal 7]
rollback;

begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_dish_look('99999999-0000-0000-0000-0000000000d1', null, null, null, array['Keto'], null, null, null, null, null);  -- [refusal 8]
rollback;

-- The owner builds a menu: Pizza (sizes), Pasta, then puts Pasta first.
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_set_menu_design(:'r', '{"v": 2, "mode": "style", "style": "pizzeria", "way": 1}');
commit;
insert into restaurant_menu_sections (id, restaurant_id, name, position) values
  ('99999999-0000-0000-0000-0000000000c1', :'r', 'Pizza', 0), ('99999999-0000-0000-0000-0000000000c2', :'r', 'Pasta', 1);
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_menu_section_save(:'r', '99999999-0000-0000-0000-0000000000c1', ' Pizzas ', 'Pizze', null,
                                      '{"effect": "sizes", "sizes": ["10\"", "14\"", "18\""]}');
select public.owner_menu_section_save(:'r', null, 'Sides', null, null, '{"effect": "compact"}') is not null as added;
select public.owner_dish_look('99999999-0000-0000-0000-0000000000d1', '99999999-0000-0000-0000-0000000000c1', array[14, 19, 25]::numeric[],
                              array['Popular'], array['Vegetarian'], '#E8B27A', null, 0, null, '99999999-0000-0000-0000-0000000000e1/m.jpg');
select public.owner_dish_look('99999999-0000-0000-0000-0000000000d2', '99999999-0000-0000-0000-0000000000c2', array[22]::numeric[],
                              null, null, null, 'Rigatoni alla vodka', 2, 'House red', null);
select public.owner_dish_sold_out('99999999-0000-0000-0000-0000000000d2', true);
select public.owner_menu_order(:'r', array['99999999-0000-0000-0000-0000000000c2', '99999999-0000-0000-0000-0000000000c1']::uuid[],
                               array['99999999-0000-0000-0000-0000000000d2', '99999999-0000-0000-0000-0000000000d1']::uuid[]);
commit;

select 1 / (case when (select price from restaurant_dishes where id = '99999999-0000-0000-0000-0000000000d1') = 14
                  and (select prices from restaurant_dishes where id = '99999999-0000-0000-0000-0000000000d1') = array[14, 19, 25]::numeric[]
                  and (select prices from restaurant_dishes where id = '99999999-0000-0000-0000-0000000000d2') is null
                  and (select spice from restaurant_dishes where id = '99999999-0000-0000-0000-0000000000d2') = 2
                  and (select dietary from restaurant_dishes where id = '99999999-0000-0000-0000-0000000000d1') = array['Vegetarian']
                 then 1 else 0 end) as sizes_saved;
select 1 / (case when (select jsonb_agg(s ->> 'name') from jsonb_array_elements(public.restaurant_menu_bits(:'r') -> 'menu_sections') s)
                      = '["Pasta", "Pizzas", "Sides"]'::jsonb then 1 else 0 end) as owner_order;
select 1 / (case when (public.restaurant_menu_bits(:'r') -> 'menu_design' ->> 'style') = 'pizzeria' then 1 else 0 end) as look_on_page;
select 1 / (case when exists (select 1 from jsonb_array_elements(public.restaurant_menu_bits(:'r') -> 'menu_items') m
                               where m ->> 'name' = 'Rigatoni' and (m ->> 'sold_out_on')::date = (now() at time zone 'America/Toronto')::date
                                 and m ->> 'pairs_with' = 'House red')
                 then 1 else 0 end) as sold_out_on_page;
select 1 / (case when public.restaurant_public('nowhere', 'nothing') is null then 1 else 0 end) as no_page;
select 1 / (case when exists (select 1 from public.photo_refs() where path = '99999999-0000-0000-0000-0000000000e1/m.jpg') then 1 else 0 end) as photo_in_use;
-- removing a category keeps its dishes (back under their course)
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_menu_section_remove('99999999-0000-0000-0000-0000000000c1');
select public.owner_dish_sold_out('99999999-0000-0000-0000-0000000000d2', false);
commit;
select 1 / (case when (select section_id from restaurant_dishes where id = '99999999-0000-0000-0000-0000000000d1') is null
                  and (select sold_out_on from restaurant_dishes where id = '99999999-0000-0000-0000-0000000000d2') is null
                 then 1 else 0 end) as category_removed;
-- an unclaimed page gives none of the owner's bits
update restaurants set owner_verified = false where id = :'r';
select 1 / (case when public.restaurant_menu_bits(:'r') -> 'menu_design' = 'null'::jsonb
                  and jsonb_array_length(public.restaurant_menu_bits(:'r') -> 'menu_items') = 0 then 1 else 0 end) as unclaimed_plain;

delete from restaurants where id in (:'r', :'r2');
delete from auth.users where id in (:'own', :'mem');
