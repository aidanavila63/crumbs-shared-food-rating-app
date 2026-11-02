\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
create temp table g as select m.group_id as id from group_members m where m.user_id = :'A' and exists (select 1 from group_members x where x.group_id = m.group_id and x.user_id = :'B') limit 1;
insert into swipe_sessions (group_id, created_by, title, place_ids) select id, :'B', 'Tonight', array(select p.id from places p where p.group_id = g.id limit 3) from g;
create temp table s as select id from swipe_sessions where title = 'Tonight';
grant select on s to authenticated;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
insert into swipe_votes (session_id, place_id, user_id, yes, veto) select (select id from s), place_ids[1], :'B', false, true from swipe_sessions where title='Tonight';
select 'second veto (expect error)';
insert into swipe_votes (session_id, place_id, user_id, yes, veto) select (select id from s), place_ids[2], :'B', false, true from swipe_sessions where title='Tonight';
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
insert into swipe_limits (session_id, max_price, max_km, cravings) values ((select id from s), 2, 5, '{ramen,thai}');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
insert into swipe_limits (session_id, max_price, max_km, cravings) values ((select id from s), 3, 2, '{Ramen}');
select 'A sees limits rows (expect 1 = own)', count(*) from swipe_limits;
select 'overlap', public.session_overlap((select id from s));
commit;
