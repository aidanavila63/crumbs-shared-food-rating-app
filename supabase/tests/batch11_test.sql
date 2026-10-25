\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
-- queue full: D's 5 new dishes wait in line (no points), then get confirmed while waiting -> full 3
update point_rules set menu_queue = 0;
delete from restaurant_managers where user_id = :'D';
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D adds 5 (queue full)', public.add_restaurant_dishes((select id from restaurants where source_key='gp10'), (select jsonb_agg(jsonb_build_object('name', 'Wait ' || n, 'price', 5 + n)) from generate_series(1, 5) n), 'manual');
commit;
select 'D before', stage, count(*) from menu_contributions where user_id=:'D' group by stage;
select 'D pts before', coalesce(sum(points),0) from contribution_points where user_id=:'D' and kind like 'menu%';
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select count(public.vote_restaurant_dish(id, 'confirm')) from restaurant_dishes where name like 'Wait %';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select count(public.vote_restaurant_dish(id, 'confirm')) from restaurant_dishes where name like 'Wait %';
commit;
select 'D after', stage, count(*) from menu_contributions where user_id=:'D' group by stage;
select 'D pts after (expect 3)', coalesce(sum(points),0) from contribution_points where user_id=:'D' and kind like 'menu%';
update point_rules set menu_queue = 50;
