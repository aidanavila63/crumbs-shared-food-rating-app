-- Round 86: the one-call gate for server routes (E17) and who gets a notification (E25).
-- Expected refusals: 2
--   1 the gate asked while signed out (routes stop before asking)
--   2 a signed-in person reading phones' push keys through push_targets (server key only)
\set a '86868686-0000-0000-0000-000000000001'
\set b '86868686-0000-0000-0000-000000000002'
\set c '86868686-0000-0000-0000-000000000003'
\set g '86868686-0000-0000-0000-0000000000a1'
insert into auth.users (id, email) values (:'a', 'a86@example.com'), (:'b', 'b86@example.com'), (:'c', 'c86@example.com')
on conflict do nothing;
insert into profiles (id, display_name) values (:'a', 'Ana'), (:'b', 'Ben'), (:'c', 'Cy') on conflict do nothing;
update profiles set access = 'approved', is_admin = (id = :'a'), notify = '{}' where id in (:'a', :'b', :'c');
update profiles set notify = '{"rating": false}' where id = :'c';
delete from groups where id = :'g';
insert into groups (id, name, created_by, join_code) values (:'g', 'r86 group', :'a', 'GTRBXS');
insert into group_members (group_id, user_id, role) values (:'g', :'a', 'owner'), (:'g', :'b', 'member'), (:'g', :'c', 'member')
on conflict do nothing;
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values
  (:'a', 'https://push.example/r86a', 'k', 'x'), (:'b', 'https://push.example/r86b', 'k', 'x'),
  (:'c', 'https://push.example/r86c', 'k', 'x')
on conflict do nothing;
insert into feature_flags (key, state) values ('r86_switch', 'admin') on conflict (key) do update set state = 'admin';

-- The gate
begin; set local role anon;
select public.request_gate();  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
select 1 / (case when public.request_gate() @> '{"signed_in": true, "let_in": true, "flag_ok": true}' then 1 else 0 end) as member_passes;
select 1 / (case when (public.request_gate('r86_switch') ->> 'flag_ok')::boolean = false then 1 else 0 end) as admin_switch_stops_member;
select 1 / (case when (public.request_gate('no_such_switch') ->> 'flag_ok')::boolean then 1 else 0 end) as missing_switch_allowed;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
select 1 / (case when (public.request_gate('r86_switch') ->> 'flag_ok')::boolean then 1 else 0 end) as admin_switch_lets_admin;
commit;
update feature_flags set state = 'admin' where key = 'new_people';
update profiles set access = 'pending' where id = :'c';
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
select 1 / (case when (public.request_gate() ->> 'let_in')::boolean = false then 1 else 0 end) as not_let_in;
commit;
update profiles set access = 'approved' where id = :'c';
update feature_flags set state = 'everyone' where key = 'new_people';
begin; set local role authenticated; set local request.jwt.claim.sub = '86868686-0000-0000-0000-0000000000ff';
select 1 / (case when (public.request_gate() ->> 'signed_in')::boolean = false then 1 else 0 end) as deleted_account_stopped;
commit;

-- Who gets a notification
select 1 / (case when (select array_agg(endpoint order by endpoint) from public.push_targets('rating', :'g', null, :'a'))
                 = array['https://push.example/r86b'] then 1 else 0 end) as group_minus_sender_and_switched_off;
select 1 / (case when (select count(*) from public.push_targets('place', :'g', null, :'a')) = 2 then 1 else 0 end) as others_get_places;
select 1 / (case when (select array_agg(endpoint) from public.push_targets('mention', :'g', array[:'c']::uuid[], :'a'))
                 = array['https://push.example/r86c'] then 1 else 0 end) as only_the_people_named;
select 1 / (case when (select array_agg(endpoint) from public.push_targets('join', null, array[:'a']::uuid[], :'b'))
                 = array['https://push.example/r86a'] then 1 else 0 end) as fixed_people_without_group;
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
select * from public.push_targets('place', :'g', null, :'a');  -- [refusal 2]
rollback;

-- tidy up
delete from feature_flags where key = 'r86_switch';
delete from push_subscriptions where endpoint like 'https://push.example/r86%';
delete from groups where id = :'g';
delete from auth.users where id in (:'a', :'b', :'c');
