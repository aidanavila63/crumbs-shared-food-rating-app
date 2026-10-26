-- Builders and how many groups you can own.
\set A '00000000-0000-0000-0000-00000000000a'
\set C '00000000-0000-0000-0000-00000000000c'
\set E '00000000-0000-0000-0000-0000000000ee'
update point_rules set day_caps = day_caps || '{"groups": [1, 1, 2, 3, null]}';
insert into auth.users (id, email) values (:'E', 'e@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'E', 'Eve') on conflict do nothing;
-- E can't make themselves a Builder (error 1) or use set_builder (error 2).
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
update profiles set is_builder = true where id = :'E';
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.set_builder(:'E', true);
rollback;
-- Taster: one group of their own; the second is refused (error 3).
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select 'first group', (public.create_group('Eve eats')).name;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.create_group('Eve eats 2');
rollback;
-- An admin makes E a Builder: no group limit, no daily caps.
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.set_builder(:'E', true);
select 'admin sees people', count(*) > 0 from public.admin_people('');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select 'builder second group', (public.create_group('Eve eats 2')).name;
select 'builder caps', (public.my_day_caps()->>'builder')::boolean, public.my_day_caps()->'fact' = 'null'::jsonb;
commit;
update profiles set is_admin = false where id = :'A';
update point_rules set day_caps = day_caps || '{"groups": [null, null, null, null, null]}';
