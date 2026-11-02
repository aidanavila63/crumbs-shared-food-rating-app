\set ON_ERROR_STOP 0
-- rebuild users after delete test
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a','a@x.io'),('00000000-0000-0000-0000-00000000000b','b@x.io') on conflict do nothing;
insert into profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000a','A'),('00000000-0000-0000-0000-00000000000b','B') on conflict do nothing;
create temp table g2 as select id from groups where name='Test G';
insert into group_members (group_id, user_id) select id, '00000000-0000-0000-0000-00000000000a' from g2 on conflict do nothing;
grant select on g2 to authenticated;
select 'sources at start', name, sources from restaurants;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B osm merge', public.merge_open_data((select id from restaurants limit 1), '{"phone":"+1 416 555 0100","hours":{"utc":-240,"periods":[{"o":[1,11,0],"c":[1,22,0]}]},"website":"javascript:x"}'::jsonb, 'N55');
select 'B phone fact', public.contribute_fact((select id from restaurants limit 1), 'phone', '"+1 416 555 0199"'::jsonb, 'in_person');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B bad website (should fail)', public.contribute_fact((select id from restaurants limit 1), 'website', '"ftp://x"'::jsonb, 'website');
rollback;
select 'after B', phone, sources, verified->'phone' from restaurants;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A different phone', public.contribute_fact((select id from restaurants limit 1), 'phone', '"+1 416 555 0123"'::jsonb, 'in_person');
commit;
select 'phone still B (needs 2)', phone from restaurants;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A agrees with B', public.contribute_fact((select id from restaurants limit 1), 'phone', '"+1 416 555 0199"'::jsonb, 'in_person');
select 'A contributions', public.my_contributions();
commit;
select 'verified', verified->'phone' from restaurants;
update profiles set is_admin = true where id='00000000-0000-0000-0000-00000000000a';
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'stats', public.admin_stats()->>'owned_hours', public.admin_stats()->>'facts', (public.admin_stats()->>'db_bytes')::bigint > 0;
commit;
