-- Round 92: who may delete places (U12).
-- Expected refusals: 0 (RLS hides what you may not delete: the place just stays)
\set o '92929292-0000-0000-0000-000000000001'
\set m '92929292-0000-0000-0000-000000000002'
\set n '92929292-0000-0000-0000-000000000003'
\set g '92929292-0000-0000-0000-0000000000a1'
insert into auth.users (id, email) values (:'o', 'o92@example.com'), (:'m', 'm92@example.com'), (:'n', 'n92@example.com') on conflict do nothing;
update profiles set access = 'approved' where id in (:'o', :'m', :'n');
delete from groups where id = :'g';
insert into groups (id, name, created_by, join_code) values (:'g', 'r92 group', :'o', 'PRBXQV');
insert into group_members (group_id, user_id, role) values (:'g', :'o', 'owner'), (:'g', :'m', 'member'), (:'g', :'n', 'member')
on conflict do nothing;
insert into places (id, group_id, google_place_id, name, status, created_by) values
  ('92929292-0000-0000-0000-0000000000c1', :'g', 'manual:r92-1', 'r92 Ana spot', 'Want to try', :'m'),
  ('92929292-0000-0000-0000-0000000000c2', :'g', 'manual:r92-2', 'r92 Ben spot', 'Want to try', :'n'),
  ('92929292-0000-0000-0000-0000000000c3', :'g', 'manual:r92-3', 'r92 Third', 'Want to try', :'n');

-- as before: anyone in the group can delete
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
delete from places where id = '92929292-0000-0000-0000-0000000000c3';
commit;
select 1 / (case when not exists (select 1 from places where id = '92929292-0000-0000-0000-0000000000c3') then 1 else 0 end) as anyone_by_default;

-- "only who added it, owner and admins"
update groups set settings = coalesce(settings, '{}') || '{"delete_rule": "own"}' where id = :'g';
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
delete from places where id = '92929292-0000-0000-0000-0000000000c2';  -- not hers: stays
commit;
select 1 / (case when exists (select 1 from places where id = '92929292-0000-0000-0000-0000000000c2') then 1 else 0 end) as others_stay;
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
delete from places where id = '92929292-0000-0000-0000-0000000000c1';  -- hers: goes
commit;
select 1 / (case when not exists (select 1 from places where id = '92929292-0000-0000-0000-0000000000c1') then 1 else 0 end) as own_goes;
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
delete from places where id = '92929292-0000-0000-0000-0000000000c2';  -- the owner can
commit;
select 1 / (case when not exists (select 1 from places where id = '92929292-0000-0000-0000-0000000000c2') then 1 else 0 end) as owner_can;

delete from groups where id = :'g';
delete from auth.users where id in (:'o', :'m', :'n');
