\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
\set C '00000000-0000-0000-0000-00000000000c'
create temp table r as select id from restaurants where source_key='gp9';
grant select on r to authenticated;
delete from contribution_points where kind in ('attr', 'tip');
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B patio yes', public.set_restaurant_attr((select id from r), 'patio', true)->>'points';
select 'B cash yes', public.set_restaurant_attr((select id from r), 'cash_only', true)->>'points';
select 'B bad key (expect error)';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select public.set_restaurant_attr((select id from r), 'nonsense', true);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D patio yes', public.set_restaurant_attr((select id from r), 'patio', true)->>'points';
select 'D sees', public.restaurant_attrs((select id from r))->'attrs'->'patio';
select 'D sees B votes directly (expect 0)', count(*) from restaurant_attr_votes where user_id <> auth.uid();
select 'D tip', public.add_restaurant_tip((select id from r), 'entrance', 'Side door', null) is not null;
select 'D second entrance tip no pts', public.add_restaurant_tip((select id from r), 'entrance', 'Up stairs', null) is not null;
commit;
select 'points', user_id = :'B' as is_b, kind, points from contribution_points where kind in ('attr', 'tip') order by 1, 2;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B reads tips', count(*) from restaurant_tips;
insert into restaurant_tip_votes (tip_id, still) select id, true from restaurant_tips limit 1;
delete from restaurant_tips; 
select 'B deleted others tips (expect 2 remain)', (select count(*) from restaurant_tips);
commit;
-- group dealbreakers: 2 groups say loud
insert into place_facts (place_id, noise) select id, 'loud' from places where google_place_id='gp9' on conflict (place_id) do update set noise = 'loud';
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'groups', public.restaurant_attrs((select id from r))->'groups';
commit;
-- closed for good spreads
update restaurants set business_status = 'CLOSED_PERMANENTLY' where source_key = 'gp9';
select 'spread', count(*) from places where google_place_id='gp9' and business_status = 'CLOSED_PERMANENTLY';
