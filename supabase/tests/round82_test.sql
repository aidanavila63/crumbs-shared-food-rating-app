-- Round 82 (Nov 21): other names set by the owner (O10), find a dish across Crumbs (U1).
-- Expected refusals: 3
--   1 a member who isn't the owner setting a restaurant's names
--   2 more than 8 other names
--   3 the dish finder signed out
\set own '82828282-0000-0000-0000-000000000001'
\set mem '82828282-0000-0000-0000-000000000002'
\set r1 '82828282-0000-0000-0000-0000000000e1'
\set r2 '82828282-0000-0000-0000-0000000000e2'
\set r3 '82828282-0000-0000-0000-0000000000e3'
insert into auth.users (id, email) values (:'own', 'o82@example.com'), (:'mem', 'm82@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'own', 'Oona'), (:'mem', 'Milo') on conflict do nothing;
update profiles set access = 'approved' where id in (:'own', :'mem');
insert into restaurants (id, source_key, name, latitude, longitude) values
  (:'r1', 'osm:82e1', 'Lanna House', 43.65, -79.38),
  (:'r2', 'osm:82e2', 'Far Away Noodles', 45.50, -73.56),
  (:'r3', 'osm:82e3', 'Quiet Spot', 43.651, -79.381) on conflict do nothing;
insert into restaurant_managers (restaurant_id, user_id) values (:'r1', :'own') on conflict do nothing;
insert into restaurant_dishes (restaurant_id, name, name_key, price, confirms, owner_ok) values
  (:'r1', 'Khao Soi Gai', 'khao soi gai', 17, 4, true),
  (:'r2', 'Khao soi', 'khao soi', 15, 1, false);
insert into restaurant_dishes (restaurant_id, name, name_key, hidden) values (:'r3', 'Khao Soi Secret', 'khao soi secret', true);
-- three groups have the dish at Lanna House and rate it
do $$
declare i int; gid uuid; pid uuid; did uuid;
begin
  for i in 1..3 loop
    gid := gen_random_uuid();
    insert into public.groups (id, name, created_by, join_code)
      values (gid, 'r82 group ' || i, '82828282-0000-0000-0000-000000000002', 'KS' || chr(64 + i) || 'RBX');
    insert into public.places (id, group_id, google_place_id, name, status, created_by, restaurant_id)
      values (gen_random_uuid(), gid, 'osm:82e1', 'Lanna House', 'Been', '82828282-0000-0000-0000-000000000002',
              '82828282-0000-0000-0000-0000000000e1') returning id into pid;
    insert into public.dishes (id, place_id, name) values (gen_random_uuid(), pid, 'khao soi gai') returning id into did;
    insert into public.dish_ratings (dish_id, user_id, score, points) values (did, '82828282-0000-0000-0000-000000000002', 5, 90);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Other names
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.set_restaurant_names(:'r1', 'ร้านล้านนา', array['Lanna']);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.set_restaurant_names(:'r1', 'x', array['a','b','c','d','e','f','g','h','i']);  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.set_restaurant_names(:'r1', '  ร้านล้านนา ', array['Lanna', ' lanna ', 'Lanna Thai', '']);
commit;
select 1 / (case when (select name_local = 'ร้านล้านนา' and aka = array['Lanna', 'Lanna Thai'] from restaurants where id = :'r1')
                 then 1 else 0 end) as names_saved_cleanly;
select 1 / (case when public.restaurant_public_data(:'r1') @> '{"name_local": "ร้านล้านนา", "aka": ["Lanna", "Lanna Thai"]}'
                 then 1 else 0 end) as page_shows_them;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select 1 / (case when exists (select 1 from public.search_restaurants('lanna thai') r where r.id = :'r1') then 1 else 0 end) as searchable;
commit;

-- ---------------------------------------------------------------------------------------------
-- Find a dish
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select 1 / (case when jsonb_array_length(public.find_dish('khao soi')) >= 2 then 1 else 0 end) as found_both;
select 1 / (case when not (public.find_dish('khao soi') @> '[{"id": "82828282-0000-0000-0000-0000000000e3"}]') then 1 else 0 end) as hidden_left_out;
select 1 / (case when public.find_dish('khao soi', 43.65, -79.38) @> '[{"id": "82828282-0000-0000-0000-0000000000e1", "groups": 3, "rating": 4.5}]'
                  and (public.find_dish('khao soi', 43.65, -79.38) -> 0 ->> 'slug') is not null
                  and not (public.find_dish('khao soi', 43.65, -79.38) @> '[{"id": "82828282-0000-0000-0000-0000000000e2"}]')
                 then 1 else 0 end) as nearby_with_totals;
select 1 / (case when (public.find_dish('khao soi') -> 0 ->> 'id') = '82828282-0000-0000-0000-0000000000e1' then 1 else 0 end) as owner_checked_first;
select 1 / (case when public.find_dish('khao') @> '[{"id": "82828282-0000-0000-0000-0000000000e2", "groups": null}]' then 1 else 0 end) as few_groups_no_totals;
select 1 / (case when public.find_dish('ks') = '[]'::jsonb then 1 else 0 end) as short_search_empty;
commit;
begin; set local role anon;
select public.find_dish('khao soi');  -- [refusal 3]
rollback;

-- tidy up
delete from groups where name like 'r82 group %';
delete from restaurants where id in (:'r1', :'r2', :'r3');
delete from auth.users where id in (:'own', :'mem');
