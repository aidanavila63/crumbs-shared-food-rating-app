\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d','d@x.io') on conflict do nothing;
insert into profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000d','D') on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
create temp table dg as select * from public.create_group('D group');
insert into places (group_id, google_place_id, name, created_by, latitude, longitude) select id, 'gp1', 'Hana', '00000000-0000-0000-0000-00000000000d', 43.65, -79.38 from dg;
select 'D link', (public.link_restaurant((select id from places where group_id=(select id from dg)))).places_count;
select 'D agrees phone (2nd group)', public.contribute_fact((select id from restaurants limit 1), 'phone', '"+1 416 555 0199"'::jsonb, 'in_person');
select 'D confirms gyoza? tonkotsu', public.vote_restaurant_dish((select id from restaurant_dishes where name_key='tonkotsu ramen'), 'confirm');
commit;
select 'phone verified', verified->'phone' from restaurants;
select 'dishes', name, confirms, claimed from restaurant_dishes order by name;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B contributions', public.my_contributions();
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'admin', public.admin_stats()->>'claimed_facts', public.admin_stats()->>'claimed_dishes', public.admin_stats()->>'borrowed_fields';
commit;
