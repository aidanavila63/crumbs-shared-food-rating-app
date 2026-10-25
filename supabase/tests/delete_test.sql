\set ON_ERROR_STOP 0
select 'before', g.name, g.created_by, (select count(*) from places where group_id=g.id) places from groups g;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'export keys', (select array_agg(k) from jsonb_object_keys(public.export_group((select id from groups limit 1))) k);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'C export other group (should fail)', public.export_group((select id from groups limit 1));
rollback;
-- C makes a solo group then deletes account
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'C group', (public.create_group('Solo')).name;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'C deletes', public.delete_my_account();
commit;
select 'solo gone', count(*) from groups where name='Solo';
-- A (owner of Test G with B admin) deletes
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A deletes', public.delete_my_account();
commit;
select 'after', g.name, g.created_by, (select count(*) from places where group_id=g.id) places, (select string_agg(user_id::text||':'||role, ',') from group_members where group_id=g.id) members from groups g;
select 'A ratings left', count(*) from place_ratings where user_id='00000000-0000-0000-0000-00000000000a';
select 'users left', count(*) from auth.users;
