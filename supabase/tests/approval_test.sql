-- Every new person needs the gatekeeper's OK (Nov 2), invite link or not.
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set H '00000000-0000-0000-0000-000000000077'
\set I '00000000-0000-0000-0000-000000000078'
\set J '00000000-0000-0000-0000-000000000079'
update feature_flags set state = 'admin' where key = 'new_people';
update feature_flags set state = 'admin' where key = 'start_groups';
-- A (an admin) is the gatekeeper; another admin isn't.
update profiles set is_admin = true where id = :'A';
update profiles set lets_people_in = false;
update profiles set lets_people_in = true where id = :'A';
update profiles set access = 'approved' where id in (:'A', :'B');
insert into auth.users (id, email) values (:'H', 'h@example.com'), (:'I', 'i@example.com'), (:'J', 'j@example.com')
  on conflict do nothing;
insert into profiles (id, display_name) values (:'H', 'Hal'), (:'I', 'Ivy'), (:'J', 'Jo') on conflict do nothing;
create temp table ap as select id, join_code from groups where created_by = :'B' limit 1;
grant select on ap to anon, authenticated;
update groups set invite_approval = false where id = (select id from ap);

-- A brand-new profile can't make itself let in or a gatekeeper (errors 1, 2).
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
update profiles set access = 'approved' where id = :'H';
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
update profiles set lets_people_in = true where id = :'H';
rollback;
select 'H still waiting', access, lets_people_in from profiles where id = :'H';

-- H opens a straight-in invite: not let in yet, so it asks the gatekeeper instead of joining.
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select 'H preview', p->>'access', (p->>'gate')::boolean, (p->>'asked')::boolean
  from (select public.invite_preview((select join_code from ap)) p) x;
select 'H joins?', public.join_by_invite((select join_code from ap))->>'status';
select 'H asked', (public.my_access()->>'asked')::boolean, public.my_access()->>'status', public.my_access()->>'group';
commit;
select 'H not in', count(*) from group_members where user_id = :'H';
-- …and can't sneak in with the code box (3) or start a group (4).
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select public.join_group((select join_code from ap));
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select public.create_group('Hal eats');
rollback;
-- H can't answer their own request (5), and neither can B, the group's owner (6).
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select public.answer_access(:'H', true);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select public.answer_access(:'H', true);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B sees list', count(*) from public.access_request_list();
commit;

-- I signs in with no invite and asks with a note.
begin; set local role authenticated; set local request.jwt.claim.sub = :'I';
select 'I asks', public.request_access(null, '  Friend of Hal  ')->>'status';
commit;

-- The gatekeeper sees both (with the invite's group), lets H in → H joins the straight-in group.
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A list', display_name, group_name, note from public.access_request_list() order by display_name;
select 'A says yes to H', public.answer_access(:'H', true)->>'status';
commit;
select 'H in as', role from group_members where group_id = (select id from ap) and user_id = :'H';

-- Approved I has no group: may start one now (invite-only = let in).
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A says yes to I', public.answer_access(:'I', true)->>'status';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'I';
select 'I can start', public.can_start_group(), public.my_access()->>'status';
commit;

-- Group rule still applies: B lets each person in. J asks via the link → gatekeeper first, then
-- after the yes, J waits on B.
update groups set invite_approval = true where id = (select id from ap);
begin; set local role authenticated; set local request.jwt.claim.sub = :'J';
select 'J joins?', public.join_by_invite((select join_code from ap))->>'status';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A says yes to J', public.answer_access(:'J', true)->>'status';
commit;
select 'J waiting on B', count(*) from group_join_requests where group_id = (select id from ap) and user_id = :'J';
select 'J not in yet', count(*) from group_members where group_id = (select id from ap) and user_id = :'J';
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select public.answer_join_request((select id from ap), :'J', true);
commit;
select 'J in', count(*) from group_members where group_id = (select id from ap) and user_id = :'J';

-- Saying no: they can't ask again (7) until the gatekeeper changes their mind.
delete from group_members where user_id in (:'H', :'J');
update profiles set access = 'pending' where id = :'H';
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select public.request_access(null, 'please');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A says no to H', public.answer_access(:'H', false)->>'status';
select 'declined list', count(*) from public.declined_people();
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select 'H status', public.my_access()->>'status';
select public.request_access(null, 'again?');
rollback;

-- Closed (Off): no new requests (8). Open (Everyone): anyone is let in.
update profiles set access = 'pending' where id = :'H';
update feature_flags set state = 'off' where key = 'new_people';
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select public.request_access(null, null);
rollback;
update feature_flags set state = 'everyone' where key = 'new_people';
begin; set local role authenticated; set local request.jwt.claim.sub = :'H';
select 'open sign-up', public.my_access()->>'status';
commit;

-- Back to how the other tests expect it.
update groups set invite_approval = false where id = (select id from ap);
update feature_flags set state = 'everyone' where key = 'start_groups';
