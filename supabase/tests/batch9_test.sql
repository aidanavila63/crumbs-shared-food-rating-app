\set ON_ERROR_STOP 0
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
\set A '00000000-0000-0000-0000-00000000000a'
-- B and D each save a new restaurant "Sora" in their own group
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
create temp table bg9 as select * from public.create_group('B9');
insert into places (group_id, google_place_id, name, created_by, latitude, longitude, price_level, website) select id, 'gp9', 'Sora', :'B', 43.7, -79.4, 4, 'https://google-said.example' from bg9;
select 'B link', (public.link_restaurant((select id from places where google_place_id='gp9' and created_by=:'B'))).name;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
create temp table dg9 as select * from public.create_group('D9');
insert into places (group_id, google_place_id, name, created_by) select id, 'gp9', 'Sora', :'D' from dg9;
select 'D link', (public.link_restaurant((select id from places where google_place_id='gp9' and created_by=:'D'))).places_count;
commit;
create temp table r9 as select id from restaurants where source_key='gp9';
grant select on r9 to authenticated;
delete from contribution_points where user_id = :'B';
-- next question never asks price or status
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B q', public.next_question((select id from r9))->>'field';
-- new info (missing phone) = 2 points; same answer again = 0
select 'B phone new', public.contribute_fact((select id from r9), 'phone', '"+1 416 555 0100"', 'in_person')->>'points';
select 'B phone again', public.contribute_fact((select id from r9), 'phone', '"+1 416 555 0100"', 'in_person')->>'points';
-- confirming Google's website (Crumbs doesn't own it yet) = 2
select 'B website confirm', public.contribute_fact((select id from r9), 'website', '"https://google-said.example"', 'website')->>'points';
-- receipt dishes: data in, no points
select 'B receipt', public.add_restaurant_dishes((select id from r9), '[{"name":"Salmon Don","price":22},{"name":"Miso Soup","price":4,"course":"side"},{"name":"Karaage","price":12}]'::jsonb, 'receipt');
select 'B votes', public.vote_restaurant_dish((select id from restaurant_dishes where name_key='karaage'), 'confirm');
select 'B points so far', public.my_contributions()->>'points', public.my_contributions()->'allowances';
commit;
select 'price from menu', price_level, sources->>'price_level' from restaurants where id=(select id from r9);
-- menu photo with 3+ new dishes = 3 points once a quarter
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D menu photo', public.add_restaurant_dishes((select id from r9), '[{"name":"Unagi Don","price":28,"course":"main"},{"name":"Tempura Udon","price":19,"course":"main"},{"name":"Katsu Curry","price":18,"course":"main"}]'::jsonb, 'photo');
select 'D menu photo again', public.add_restaurant_dishes((select id from r9), '[{"name":"Gyudon","price":17},{"name":"Oyakodon","price":16},{"name":"Chirashi","price":30}]'::jsonb, 'photo');
select 'D points', public.my_contributions()->>'points';
-- D changes B's phone: not applied (needs 2), no points yet
select 'D phone change', public.contribute_fact((select id from r9), 'phone', '"+1 416 555 0200"', 'phone_call');
commit;
select 'phone now', phone from restaurants where id=(select id from r9);
select 'ledger', user_id, kind, points from contribution_points where restaurant_id=(select id from r9) order by id;
-- expiry: an old award doesn't count
insert into contribution_points (user_id, kind, points, ref, created_at) values (:'B', 'fact', 20, 'old', now() - interval '200 days');
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B after expiry', public.my_contributions()->>'points', public.my_contributions()->>'lifetime', public.my_tier();
commit;
-- managers table is private now
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B sees managers', count(*) from restaurant_managers;
select 'B sets owner flag (should fail)'; update profiles set restaurant_owner = true where id = :'B';
rollback;
-- D claims Sora, admin approves -> Verified by Owner + tag
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D claims', public.claim_restaurant((select id from r9), 'Dee', 'Owner', 'dee@sora.example', '', '');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A approves', public.review_claim((select id from restaurant_claims where restaurant_id=(select id from r9)), true);
commit;
select 'verified', owner_verified from restaurants where id=(select id from r9);
select 'D tag', restaurant_owner from profiles where id=:'D';
-- member edits to locked fields become suggestions
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B hours on owner page', public.contribute_fact((select id from r9), 'hours', '{"utc":-240,"periods":[{"o":[1,11,0],"c":[1,22,0]}]}', 'photo');
select 'B q on owner page', public.next_question((select id from r9));
select 'B status still allowed', public.contribute_fact((select id from r9), 'status', '"CLOSED_TEMPORARILY"', 'in_person')->>'applied';
select 'B my_restaurants', public.my_restaurants();
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B owner_suggestions (should fail)', public.owner_suggestions((select id from r9));
rollback;
select 'hours still null', opening_hours is null from restaurants where id=(select id from r9);
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D my_restaurants', public.my_restaurants();
select 'D suggestions', public.owner_suggestions((select id from r9));
select 'D accepts phone', public.contribute_fact((select id from r9), 'phone', '"+1 416 555 0200"', 'phone_call')->>'applied';
select 'D keeps website', public.keep_owner_value((select id from r9), 'website');
select 'D suggestions after', jsonb_array_length(public.owner_suggestions((select id from r9)));
select 'D edits dish', public.owner_edit_dish((select id from restaurant_dishes where name_key='chirashi'), 'Chirashi Bowl', 34, 'main', false);
select 'D removes dish', public.owner_edit_dish((select id from restaurant_dishes where name_key='miso soup'), null, null, null, true);
select 'D insights', public.restaurant_insights((select id from r9));
commit;
select 'final', phone, price_level, sources, owner_verified from restaurants where id=(select id from r9);
select 'dishes', name, price, owner_ok, claimed from restaurant_dishes where restaurant_id=(select id from r9) order by name;
-- B can't edit dishes; admin removes manager -> flags drop
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B edit dish (should fail)', public.owner_edit_dish((select id from restaurant_dishes where name_key='karaage'), 'Hack', 1, null, false);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A removes', public.remove_manager((select id from r9), :'D');
commit;
select 'after removal', owner_verified from restaurants where id=(select id from r9);
select 'D tag after', restaurant_owner from profiles where id=:'D';
