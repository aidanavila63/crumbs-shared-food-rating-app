-- Invite landing page (Nov 2): preview, join straight away vs ask first, guests, invite-only.
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set F '00000000-0000-0000-0000-0000000000ff'
\set G '00000000-0000-0000-0000-000000000099'
insert into auth.users (id, email) values (:'F', 'f@example.com'), (:'G', 'g@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'F', 'Fay'), (:'G', 'Gus') on conflict do nothing;
update feature_flags set state = 'admin' where key = 'start_groups';
create temp table ig as select id, join_code from groups where created_by = :'B' limit 1;
grant select on ig to anon, authenticated;

-- Signed out: the page shows the group but not who's in it or any codes.
begin; set local role anon;
select 'anon preview', p->>'name' is not null, p->>'member', p->'id' is null, p ? 'join_code'
  from (select public.invite_preview((select join_code from ig)) p) x;
select 'bad code', public.invite_preview('nope!!') is null, public.invite_preview('ZZZZZZ') is null;
commit;
-- Signed out can't join (error 1).
begin; set local role anon;
select public.join_by_invite((select join_code from ig));
rollback;

-- Invite-only: F (in no group) can't start one (error 2); can_start_group says so.
begin; set local role authenticated; set local request.jwt.claim.sub = :'F';
select 'F can start', public.can_start_group();
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'F';
select public.create_group('Fay eats');
rollback;

-- Straight-in group: F joins with the link and is a member; now F may start groups.
begin; set local role authenticated; set local request.jwt.claim.sub = :'F';
select 'F joins', public.join_by_invite((select join_code from ig))->>'status';
select 'F again', public.join_by_invite((select join_code from ig))->>'status';
select 'F preview member', (public.invite_preview((select join_code from ig))->>'member')::boolean,
       public.invite_preview((select join_code from ig))->>'id' is not null;
select 'F can start now', public.can_start_group();
commit;

-- B switches the group to "let each person in". G asks; can't sneak in with the code box (error 3).
update groups set invite_approval = true where id = (select id from ig);
begin; set local role authenticated; set local request.jwt.claim.sub = :'G';
select 'G asks', public.join_by_invite((select join_code from ig))->>'status';
select 'G waiting', (public.invite_preview((select join_code from ig))->>'requested')::boolean,
       (select count(*) from public.my_join_requests());
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'G';
select public.join_group((select join_code from ig));
rollback;
-- G can't let themselves in (error 4); B sees the request with how it came in, and lets G in.
begin; set local role authenticated; set local request.jwt.claim.sub = :'G';
select public.answer_join_request((select id from ig), :'G', true);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B sees', role, via from public.join_request_list((select id from ig));
select public.answer_join_request((select id from ig), :'G', true);
commit;
select 'G in as', role from group_members where group_id = (select id from ig) and user_id = :'G';

-- Guest links ask to join as a guest, and are let in as a guest.
delete from group_members where group_id = (select id from ig) and user_id = :'G';
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
create temp table gc on commit drop as select public.guest_invite((select id from ig)) as code;
grant select on gc to authenticated;
commit;
create temp table gcode as select guest_code from groups where id = (select id from ig);
grant select on gcode to authenticated;
begin; set local role authenticated; set local request.jwt.claim.sub = :'G';
select 'G guest asks', public.join_by_invite((select guest_code from gcode))->>'status',
       (public.invite_preview((select guest_code from gcode))->>'guest')::boolean;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'G';
select public.cancel_join_by_invite((select guest_code from gcode));
select 'G cancelled', count(*) from public.my_join_requests();
select 'G asks again', public.join_by_invite((select guest_code from gcode))->>'status';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select public.answer_join_request((select id from ig), :'G', true);
commit;
select 'G in as', role from group_members where group_id = (select id from ig) and user_id = :'G';

-- Open sign-up switch: anyone may start a group again.
update groups set invite_approval = false where id = (select id from ig);
update feature_flags set state = 'everyone' where key = 'start_groups';
