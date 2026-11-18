-- Round 94: special hours set ahead (O4/U15).
-- Expected refusals: 3
--   1 a member who isn't the owner
--   2 a first day after the last day
--   3 a first day in the past
\set own '94949494-0000-0000-0000-000000000001'
\set mem '94949494-0000-0000-0000-000000000002'
\set r '94949494-0000-0000-0000-0000000000e1'
insert into auth.users (id, email) values (:'own', 'o94@example.com'), (:'mem', 'm94@example.com') on conflict do nothing;
delete from restaurants where id = :'r';
insert into restaurants (id, source_key, name, opening_hours) values
  (:'r', 'osm:94e1', 'r94 Diner', '{"utc": -300, "periods": [{"o": [1, 11, 0], "c": [1, 22, 0]}]}');
insert into restaurant_managers (restaurant_id, user_id) values (:'r', :'own') on conflict do nothing;
select ((now() at time zone 'America/Toronto')::date + 10)::text as ahead \gset
select ((now() at time zone 'America/Toronto')::date - 1)::text as yesterday \gset

begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.set_seasonal_hours(:'r', '{"periods": []}', :'ahead'::date, :'ahead'::date);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.set_seasonal_hours(:'r', '{"periods": []}', :'ahead'::date - 1, :'ahead'::date);  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.set_seasonal_hours(:'r', '{"periods": []}', :'ahead'::date, :'yesterday'::date);  -- [refusal 3]
rollback;
-- closed for one day, 10 days from now: the usual hours stay underneath, with the first day
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.set_seasonal_hours(:'r', '{"periods": []}', :'ahead'::date, :'ahead'::date);
commit;
select 1 / (case when (select opening_hours ->> 'from' = :'ahead' and opening_hours ->> 'until' = :'ahead'
                         and opening_hours -> 'regular' -> 'periods' -> 0 -> 'o' = '[1, 11, 0]'
                         and opening_hours ->> 'utc' = '-300' from restaurants where id = :'r') then 1 else 0 end) as set_ahead;
-- older apps (three values) still start today, with no first day
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.set_seasonal_hours(target => :'r', hours => '{"periods": []}', last_day => :'ahead'::date);
commit;
select 1 / (case when (select not (opening_hours ? 'from') from restaurants where id = :'r') then 1 else 0 end) as starts_today;

delete from restaurants where id = :'r';
delete from auth.users where id in (:'own', :'mem');
