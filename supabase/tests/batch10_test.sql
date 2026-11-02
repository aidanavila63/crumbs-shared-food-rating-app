\set ON_ERROR_STOP 0
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c','c@x.io') on conflict do nothing;
insert into profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000c','C') on conflict do nothing;
delete from menu_contributions; delete from menu_counts; delete from restaurant_claims where restaurant_id in (select id from restaurants where source_key='gp10');
delete from places where google_place_id='gp10'; delete from restaurants where source_key='gp10'; delete from groups where name in ('B10','C10','D10');
-- B, C, D each save "Kumo" in their own group
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
create temp table g10b as select * from public.create_group('B10');
insert into places (group_id, google_place_id, name, created_by, latitude, longitude) select id, 'gp10', 'Kumo', :'B', 43.6, -79.5 from g10b;
select 'B link', (public.link_restaurant((select id from places where google_place_id='gp10' and created_by=:'B'))).name;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
create temp table g10c as select * from public.create_group('C10');
insert into places (group_id, google_place_id, name, created_by) select id, 'gp10', 'Kumo', :'C' from g10c;
select 'C link', (public.link_restaurant((select id from places where google_place_id='gp10' and created_by=:'C'))).places_count;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
create temp table g10d as select * from public.create_group('D10');
insert into places (group_id, google_place_id, name, created_by) select id, 'gp10', 'Kumo', :'D' from g10d;
select 'D link', (public.link_restaurant((select id from places where google_place_id='gp10' and created_by=:'D'))).places_count;
commit;
create temp table r10 as select id from restaurants where source_key='gp10';
grant select on r10 to authenticated;
delete from contribution_points;

-- questions now include name and the map pin; skip list works
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B q', public.next_question((select id from r10));
select 'B q skip all but name', public.next_question((select id from r10), array['hours','phone','website','cuisine','address','location']);
-- confirmation points are limited: B new (2), C confirms (1, makes it claimed, B gets +2 backed), D confirms after claimed (0)
select 'B phone', public.contribute_fact((select id from r10), 'phone', '"+1 416 555 0300"', 'in_person')->>'points';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'C q (should be phone: one member said it)', public.next_question((select id from r10), array['hours','website','cuisine','address','location','name']);
select 'C confirms', public.contribute_fact((select id from r10), 'phone', '"+1 416 555 0300"', 'in_person');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D confirms after claimed', public.contribute_fact((select id from r10), 'phone', '"+1 416 555 0300"', 'in_person')->>'points';
commit;
select 'phone ledger', user_id, kind, points from contribution_points order by id;

-- menu points: sets of 5 (1 point when they enter the queue of 50, 2 per 5 confirmed)
update point_rules set menu_queue = 10; -- smaller queue to test the overflow line
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B adds 12', public.add_restaurant_dishes((select id from r10), (select jsonb_agg(jsonb_build_object('name', 'Dish ' || n, 'price', 10 + n)) from generate_series(1, 12) n), 'photo');
select 'B menu', public.my_contributions()->>'menu_active', public.my_contributions()->>'menu_waiting';
commit;
select 'B counts', credited, confirmed, try_paid, ok_paid from menu_counts where user_id=:'B';
select 'B menu ledger', kind, points, ref from contribution_points where user_id=:'B' and kind like 'menu%' order by id;
-- receipts: nothing
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D receipt', public.add_restaurant_dishes((select id from r10), '[{"name":"Tantanmen","price":18},{"name":"Chashu Don","price":12},{"name":"Iced Tea","price":3}]'::jsonb, 'receipt');
commit;
select 'D rows', count(*) from menu_contributions where user_id=:'D';
-- C and D tick Dish 1..5 -> 5 confirmed -> +2, and 5 more slots free -> Dish 11,12 move in (credited 12 -> try point 2)
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select public.vote_restaurant_dish(id, 'confirm') from restaurant_dishes where restaurant_id=(select id from r10) and name in ('Dish 1','Dish 2','Dish 3','Dish 4','Dish 5');
commit;
-- D ticks Dish 1..4, but Dish 5's price changes first (C's tick no longer counts for Dish 5)
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D fixes price', public.suggest_dish_price((select id from restaurant_dishes where name='Dish 5' and restaurant_id=(select id from r10)), 99);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'C same price', public.suggest_dish_price((select id from restaurant_dishes where name='Dish 5' and restaurant_id=(select id from r10)), 99);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select public.vote_restaurant_dish(id, 'confirm') from restaurant_dishes where restaurant_id=(select id from r10) and name in ('Dish 1','Dish 2','Dish 3','Dish 4','Dish 5');
commit;
select 'after 4 confirmed', stage, count(*) from menu_contributions where user_id=:'B' group by stage order by stage;
-- Dish 5: C ticks again after the price change -> 5 confirmed
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select public.vote_restaurant_dish(id, 'confirm') from restaurant_dishes where restaurant_id=(select id from r10) and name = 'Dish 5';
commit;
select 'after 5 confirmed', stage, count(*) from menu_contributions where user_id=:'B' group by stage order by stage;
select 'B counts 2', credited, confirmed, try_paid, ok_paid from menu_counts where user_id=:'B';
select 'B menu ledger 2', kind, points, ref from contribution_points where user_id=:'B' and kind like 'menu%' order by id;
update point_rules set menu_queue = 50;
-- no daily cap any more
select 'big award', public.award_points(:'D', 'test', 15, null, 't1') + public.award_points(:'D', 'test', 15, null, 't2');
select 'tiers', public.tier_for_points(29), public.tier_for_points(30), public.tier_for_points(600);
-- admin rules
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B set rules (should fail)', public.set_point_rules('{"window_days":60,"tiers":[1,2,3,4],"detail":2,"confirm":1,"backed":2,"menu_try":1,"menu_ok":2,"menu_queue":50,"menu_set":5}');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A set rules', public.set_point_rules('{"window_days":60,"tiers":[40,120,300,700],"detail":2,"confirm":1,"backed":2,"menu_try":1,"menu_ok":2,"menu_queue":50,"menu_set":5}');
commit;
select 'rules', window_days, tiers from point_rules;
update point_rules set window_days = 90, tiers = '{30,100,250,600}';

-- owner away: D claims Kumo; B, C (+ a 3rd person) suggest same hours; after 14 days with owner away 30 days -> applied
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select public.claim_restaurant((select id from r10), 'Dee', 'Owner', 'd@kumo.example', '', '');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.review_claim((select id from restaurant_claims where restaurant_id=(select id from r10)), true);
commit;
insert into group_members (group_id, user_id) select id, :'A' from g10b on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B hours', public.contribute_fact((select id from r10), 'hours', '{"utc":-240,"periods":[{"o":[1,11,0],"c":[1,21,0]}]}', 'photo')->>'locked';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'C hours', public.contribute_fact((select id from r10), 'hours', '{"utc":-240,"periods":[{"o":[1,11,0],"c":[1,21,0]}]}', 'in_person')->>'locked';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A hours', public.contribute_fact((select id from r10), 'hours', '{"utc":-240,"periods":[{"o":[1,11,0],"c":[1,21,0]}]}', 'in_person')->>'locked';
select 'settle now (owner active)', public.settle_owner_suggestions((select id from r10));
commit;
update restaurant_facts set created_at = now() - interval '15 days' where restaurant_id = (select id from r10) and field = 'hours';
update restaurant_managers set last_active_at = now() - interval '31 days' where restaurant_id = (select id from r10);
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'settle (owner away)', public.settle_owner_suggestions((select id from r10));
commit;
select 'hours now', opening_hours is not null, sources->>'hours', verified->'hours'->>'owner_away' from restaurants where id=(select id from r10);
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D suggestions', public.owner_suggestions((select id from r10));
select 'D list', public.my_restaurants();
commit;
select 'D active again', last_active_at > now() - interval '1 minute' from restaurant_managers where restaurant_id=(select id from r10);
