\set ON_ERROR_STOP 0
\set C '00000000-0000-0000-0000-00000000000c'
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
insert into restaurant_dishes (restaurant_id, name, name_key) values ((select id from restaurants limit 1), 'Hack', 'hack');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
create temp table cg as select * from public.create_group('C group');
insert into places (group_id, google_place_id, name, created_by) select cg.id, 'gp1', 'Hana (C copy)', :'C' from cg;
select 'C link', (public.link_restaurant((select id from places where name = 'Hana (C copy)'))).places_count;
select 'C flags gyoza', public.vote_restaurant_dish((select id from restaurant_dishes where name_key='pork gyoza'), 'flag');
insert into places (group_id, google_place_id, name, created_by) select id, 'manual:abc', 'Home spot', :'C' from cg;
select 'manual link null', (public.link_restaurant((select id from places where google_place_id='manual:abc'))).id is null;
commit;
select 'after 2 flags', name, confirms, flags, hidden from restaurant_dishes order by name;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'C visible menu', count(*) from restaurant_dishes;
rollback;
