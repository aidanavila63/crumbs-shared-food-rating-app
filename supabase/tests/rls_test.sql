\set ON_ERROR_STOP 0
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.io'),('00000000-0000-0000-0000-00000000000b','b@x.io'),('00000000-0000-0000-0000-00000000000c','c@x.io')
 on conflict do nothing;
-- A creates a group
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
create temp table g as select * from public.create_group('Test G');
commit;
grant select on g to authenticated;
select 'group', name, join_code from g;
-- B joins with code
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B joined', (public.join_group((select join_code from g))).name;
commit;
-- 1. C tries to insert itself directly (should FAIL)
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into public.group_members (group_id, user_id) select id, '00000000-0000-0000-0000-00000000000c' from g;
rollback;
-- 2. B (not owner) tries to promote itself (should FAIL); A promotes B (ok)
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.set_member_role((select id from g), '00000000-0000-0000-0000-00000000000b', 'admin');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'promote ok', public.set_member_role((select id from g), '00000000-0000-0000-0000-00000000000b', 'admin');
commit;
-- 3. Admin B updates settings (1 row), C updates (0 rows)
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
with u as (update public.groups set settings = '{"scale":"10"}' where id = (select id from g) returning 1) select 'B settings rows', count(*) from u;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
with u as (update public.groups set settings = '{}' where id = (select id from g) returning 1) select 'C settings rows', count(*) from u;
commit;
-- 4. A adds a place, B rates twice + visits -> activity; C sees none
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.places (group_id, google_place_id, name, created_by) select id, 'gp1', 'Hana', '00000000-0000-0000-0000-00000000000a' from g;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.place_ratings (place_id, user_id, score, food, would_return, points) select id, '00000000-0000-0000-0000-00000000000b', 4, 5, 'yes', 80 from public.places where name='Hana';
update public.place_ratings set score = 5 where user_id = '00000000-0000-0000-0000-00000000000b';
update public.place_ratings set notes = 'yum' where user_id = '00000000-0000-0000-0000-00000000000b';
insert into public.place_visits (place_id, visited_on, created_by, kind, people, score, occasion, milestone) select id, '2026-10-20', '00000000-0000-0000-0000-00000000000b', 'takeout', 2, 5, 'date', 'First date' from public.places where name='Hana';
update public.place_visits set note = 'great' where created_by = '00000000-0000-0000-0000-00000000000b';
select 'B sees activity', kind, detail from public.activity order by created_at;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'C activity count', count(*) from public.activity;
commit;
-- 5. B tries to make itself site admin (FAIL)
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000b';
rollback;
-- 6. SQL editor makes A admin; A gets stats; B can't
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a';
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A stats', public.admin_stats();
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.admin_stats();
rollback;
-- 7. B can't remove owner; A removes... (keep B) check error only
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.remove_member((select id from g), '00000000-0000-0000-0000-00000000000a');
rollback;
-- 8. Home meal + rating + cook
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.home_meals (group_id, name, created_by) select id, 'Lasagna', '00000000-0000-0000-0000-00000000000b' from g;
insert into public.home_meal_ratings (meal_id, user_id, score) select id, '00000000-0000-0000-0000-00000000000b', 5 from public.home_meals;
insert into public.home_meal_cooks (meal_id, cooked_on, cooked_by, created_by) select id, '2026-10-21', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b' from public.home_meals;
insert into public.reactions (group_id, target, user_id, emoji) select id, 'activity:x', '00000000-0000-0000-0000-00000000000b', '❤️' from g;
insert into public.comments (group_id, target, user_id, body) select id, 'activity:x', '00000000-0000-0000-0000-00000000000b', 'so good' from g;
insert into public.swipe_sessions (group_id, created_by, place_ids) select id, '00000000-0000-0000-0000-00000000000b', array(select id from public.places) from g;
insert into public.swipe_votes (session_id, place_id, user_id, yes) select s.id, p.id, '00000000-0000-0000-0000-00000000000b', true from public.swipe_sessions s, public.places p;
insert into public.plans (group_id, title, starts_at, created_by) select id, 'Friday', now(), '00000000-0000-0000-0000-00000000000b' from g;
insert into public.plan_rsvps (plan_id, user_id, answer) select id, '00000000-0000-0000-0000-00000000000b', 'yes' from public.plans;
insert into public.feedback (body) values ('love it');
insert into public.client_errors (message) values ('boom');
select 'B activity kinds', array_agg(kind order by created_at) from public.activity;
commit;
-- C can't see meals / plans
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'C meals', count(*), 'C plans', (select count(*) from public.plans), 'C feedback', (select count(*) from public.feedback) from public.home_meals;
commit;
-- 9. anon waitlist
begin; set local role anon;
insert into public.waitlist (email) values ('fan@example.com');
commit;
begin; set local role anon; select 'anon reads waitlist', count(*) from public.waitlist; rollback;
-- 10. A resets code, A admin sees feedback/errors
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'new code', public.reset_join_code((select id from g)) <> (select join_code from g);
select 'A sees feedback', count(*) from public.feedback; select 'A sees errors', count(*) from public.client_errors;
select 'A waitlist', count(*) from public.waitlist;
commit;
