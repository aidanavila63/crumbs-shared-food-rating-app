-- Round 87: more Good to know questions (U4), Good to know for a whole space (U3), mute a group and
-- quiet hours (U5), where you heard about a place (U6).
-- Expected refusals: 2
--   1 a Good to know question that doesn't exist
--   2 a "where I heard about it" longer than 200 characters
\set a '87878787-0000-0000-0000-000000000001'
\set b '87878787-0000-0000-0000-000000000002'
\set c '87878787-0000-0000-0000-000000000003'
\set g '87878787-0000-0000-0000-0000000000a1'
\set r '87878787-0000-0000-0000-0000000000e1'
insert into auth.users (id, email) values (:'a', 'a87@example.com'), (:'b', 'b87@example.com'), (:'c', 'c87@example.com')
on conflict do nothing;
insert into profiles (id, display_name) values (:'a', 'Ana'), (:'b', 'Ben'), (:'c', 'Cy') on conflict do nothing;
update profiles set access = 'approved', notify = '{}' where id in (:'a', :'b', :'c');
delete from groups where id = :'g';
insert into groups (id, name, created_by, join_code) values (:'g', 'r87 group', :'a', 'GTRBXT');
insert into group_members (group_id, user_id, role) values (:'g', :'a', 'owner'), (:'g', :'b', 'member') on conflict do nothing;
insert into restaurants (id, source_key, name) values (:'r', 'osm:87e1', 'Dog Patio Bar') on conflict do nothing;
insert into places (group_id, google_place_id, name, status, created_by, restaurant_id)
values (:'g', 'osm:87e1', 'Dog Patio Bar', 'Been', :'a', :'r');

-- U4: the new questions can be answered; 2 agreeing makes it count
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
select public.set_restaurant_attr(:'r', 'dog_friendly', true);
select public.set_restaurant_attr(:'r', 'wifi', true);
select public.set_restaurant_attr(:'r', 'no_such_thing', true);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
select public.set_restaurant_attr(:'r', 'dog_friendly', true);
select public.set_restaurant_attr(:'r', 'wifi', true);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'b';
select public.set_restaurant_attr(:'r', 'dog_friendly', true);
-- U3: the space's confirmed facts (one yes isn't enough yet for Wi-Fi)
select 1 / (case when public.space_facts(:'g') = jsonb_build_object(:'r', jsonb_build_array('dog_friendly')) then 1 else 0 end) as space_facts;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'c';
select 1 / (case when public.space_facts(:'g') = '{}'::jsonb then 1 else 0 end) as outsiders_get_nothing;
commit;

-- U5: quiet hours and muting
select 1 / (case when public.in_quiet_hours('{"from": 22, "to": 7}', '2026-11-18 04:30:00+00')  -- 11:30 pm Toronto
                  and not public.in_quiet_hours('{"from": 22, "to": 7}', '2026-11-18 17:00:00+00') -- noon
                  and public.in_quiet_hours('{"from": 13, "to": 15}', '2026-11-18 19:00:00+00') -- 2 pm
                  and not public.in_quiet_hours(null) and not public.in_quiet_hours('{"from": 9, "to": 9}')
                 then 1 else 0 end) as quiet_hours;
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (:'b', 'https://push.example/r87b', 'k', 'x') on conflict do nothing;
select 1 / (case when (select count(*) from public.push_targets('place', :'g', null, :'a')) = 1 then 1 else 0 end) as before_mute;
update profiles set notify = jsonb_build_object('muted', jsonb_build_array(:'g')) where id = :'b';
select 1 / (case when (select count(*) from public.push_targets('place', :'g', null, :'a')) = 0
                  and (select count(*) from public.push_targets('join', :'g', array[:'b']::uuid[], :'a')) = 1
                 then 1 else 0 end) as muted_but_join_still_comes;
update profiles set notify = '{"quiet": {"from": 0, "to": 23}}' where id = :'b';
select 1 / (case when (select count(*) from public.push_targets('join', null, array[:'b']::uuid[], :'a')) <= 1 then 1 else 0 end) as quiet_checked;

-- U6
update places set heard_from = 'Maya''s story' where restaurant_id = :'r';
update places set heard_from = repeat('x', 201) where restaurant_id = :'r';  -- [refusal 2]

-- tidy up
delete from push_subscriptions where endpoint like 'https://push.example/r87%';
delete from groups where id = :'g';
delete from restaurants where id = :'r';
delete from auth.users where id in (:'a', :'b', :'c');
