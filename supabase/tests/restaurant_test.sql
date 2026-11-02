\set ON_ERROR_STOP 0
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
create temp table pl as select id from places limit 1;
grant select on pl to authenticated;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A link', (public.link_restaurant((select id from pl))).name;
select 'A adds', public.add_restaurant_dishes((select restaurant_id from places where id=(select id from pl)), '[{"name":"Tonkotsu Ramen","price":16.5},{"name":"Pork Gyoza","price":"9.50","description":"six pieces"},{"name":"x"}]'::jsonb, 'photo');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B adds same', public.add_restaurant_dishes((select restaurant_id from places where id=(select id from pl)), '[{"name":"TONKOTSU  ramen!","price":17}]'::jsonb, 'photo');
commit;
select 'dishes', name, price, confirms, flags, hidden from restaurant_dishes order by name;
-- C not a member: can read, cannot add or vote
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'C reads restaurants', count(*) from restaurants;
select 'C add (should fail)', public.add_restaurant_dishes((select restaurant_id from places where id=(select id from pl)), '[{"name":"Spam"}]'::jsonb);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'C direct insert (should fail)'; insert into restaurant_dishes (restaurant_id, name, name_key) select id, 'Hack', 'hack' from restaurants limit 1;
rollback;
-- C saves the same restaurant in their own group -> shares the profile
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
create temp table cg as select * from public.create_group('C group');
insert into places (group_id, google_place_id, name, created_by) select cg.id, p.google_place_id, 'Hana (C copy)', :'C' from cg, places p where p.id = (select id from pl);
select 'C link', (public.link_restaurant((select id from places where name = 'Hana (C copy)'))).places_count;
select 'C sees menu', count(*) from restaurant_dishes;
select 'C flags gyoza', public.vote_restaurant_dish((select id from restaurant_dishes where name_key='pork gyoza'), 'flag');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B flags gyoza', public.vote_restaurant_dish((select id from restaurant_dishes where name_key='pork gyoza'), 'flag');
select 'B share hours', public.share_restaurant_hours((select restaurant_id from places where id=(select id from pl)), '{"periods":[]}'::jsonb, 'OPERATIONAL');
select 'B search', name from public.search_restaurants('han');
commit;
select 'after flags', name, confirms, flags, hidden from restaurant_dishes order by name;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'C sees visible menu', count(*) from restaurant_dishes;
rollback;
select 'hours shared', business_status, hours_checked_at is not null from restaurants;
-- manual places are not shared
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
insert into places (group_id, google_place_id, name, created_by) select id, 'manual:abc', 'Home spot', :'C' from cg;
select 'manual link', (public.link_restaurant((select id from places where google_place_id='manual:abc'))).id is null;
commit;
