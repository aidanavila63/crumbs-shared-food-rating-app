-- Round 93: photos on visits (U8), pick-a-day poll on plans (U17).
-- Expected refusals: 5
--   1 a fourth photo on a visit
--   2 an outsider voting
--   3 a guest voting
--   4 a seventh day on a poll
--   5 voting as someone else
\set o '93939393-0000-0000-0000-000000000001'
\set m '93939393-0000-0000-0000-000000000002'
\set q '93939393-0000-0000-0000-000000000003'
\set x '93939393-0000-0000-0000-000000000004'
\set g '93939393-0000-0000-0000-0000000000a1'
\set pl '93939393-0000-0000-0000-0000000000b1'
\set pv '93939393-0000-0000-0000-0000000000b2'
\set plan '93939393-0000-0000-0000-0000000000d1'
insert into auth.users (id, email) values (:'o', 'o93@example.com'), (:'m', 'm93@example.com'), (:'q', 'q93@example.com'), (:'x', 'x93@example.com')
on conflict do nothing;
update profiles set access = 'approved' where id in (:'o', :'m', :'q', :'x');
delete from groups where id = :'g';
insert into groups (id, name, created_by, join_code) values (:'g', 'r93 group', :'o', 'QRBXQV');
insert into group_members (group_id, user_id, role) values (:'g', :'o', 'owner'), (:'g', :'m', 'member'), (:'g', :'q', 'guest')
on conflict do nothing;
insert into places (id, group_id, google_place_id, name, status, created_by) values (:'pl', :'g', 'manual:r93', 'r93 place', 'Been', :'m');
insert into place_visits (id, place_id, visited_on, created_by) values (:'pv', :'pl', '2026-11-01', :'m');

-- photos on a visit
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
update place_visits set photo_paths = array[:'g' || '/a.jpg', :'g' || '/b.jpg'] where id = :'pv';
commit;
select 1 / (case when (select count(*) from public.photo_refs() r where r.path in (:'g' || '/a.jpg', :'g' || '/b.jpg')) = 2
                 then 1 else 0 end) as photos_in_use;
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
update place_visits set photo_paths = array['a', 'b', 'c', 'd'] where id = :'pv';  -- [refusal 1]
rollback;
-- deleting the place keeps them "in use" while it's in Recently deleted
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
delete from places where id = :'pl';
commit;
select 1 / (case when (select count(*) from public.photo_refs() r where r.path = :'g' || '/a.jpg') = 1
                 then 1 else 0 end) as kept_while_deleted;

-- pick-a-day poll
insert into plans (id, group_id, title, created_by) values (:'plan', :'g', 'r93 dinner', :'o');
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
insert into plan_options (plan_id, starts_at) select :'plan', '2026-12-01 19:00-05'::timestamptz + make_interval(days => d) from generate_series(0, 5) d;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
insert into plan_votes (option_id) select id from plan_options where plan_id = :'plan' order by starts_at limit 2;
select 1 / (case when (select count(*) from plan_votes v join plan_options o on o.id = v.option_id where o.plan_id = :'plan') = 2
                 then 1 else 0 end) as member_votes;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'x';
select 1 / (case when (select count(*) from plan_options where plan_id = :'plan') = 0 then 1 else 0 end) as outsiders_see_nothing;
insert into plan_votes (option_id) select id from plan_options limit 0;
insert into plan_votes (option_id) values ((select id from public.plan_options where plan_id = '93939393-0000-0000-0000-0000000000d1' limit 1));  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'q';
select 1 / (case when (select count(*) from plan_options where plan_id = :'plan') = 6 then 1 else 0 end) as guest_sees;
insert into plan_votes (option_id) select id from plan_options where plan_id = :'plan' limit 1;  -- [refusal 3]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
insert into plan_options (plan_id, starts_at) values (:'plan', '2026-12-20 19:00-05');  -- [refusal 4]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
insert into plan_votes (option_id, user_id) select id, :'m' from plan_options where plan_id = :'plan' order by starts_at desc limit 1;  -- [refusal 5]
rollback;

delete from groups where id = :'g';
delete from deleted_items where name = 'r93 place';
delete from auth.users where id in (:'o', :'m', :'q', :'x');
