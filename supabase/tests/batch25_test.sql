\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
create temp table g as select id from groups where created_by = :'B' limit 1;
grant select on g to authenticated;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'guest code', length(public.guest_invite((select id from g))) = 7;
commit;
create temp table codes as select guest_code, join_code from groups where id = (select id from g);
grant select on codes to authenticated;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D joins as guest', (public.join_group((select guest_code from codes))).name is not null;
select 'D role', role from group_members where user_id = :'D' and group_id = (select id from g);
select 'D reads places', count(*) > 0 from places where group_id = (select id from g);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
insert into places (group_id, google_place_id, name, created_by) values ((select id from g), 'guestx', 'Guest place', :'D');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
update places set restaurant_id = restaurant_id where group_id = (select id from g);
select 'D quiet link update ok';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
update places set name = 'Hacked' where group_id = (select id from g);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D joins with member code → member', (public.join_group((select join_code from codes))).name is not null;
select 'D role now', role from group_members where user_id = :'D' and group_id = (select id from g);
commit;
-- copy a list
insert into lists (group_id, name, emoji, created_by) select id, 'Faves', '♡', :'B' from g;
insert into list_places (list_id, place_id, added_by) select l.id, p.id, :'B' from lists l, places p where l.name = 'Faves' and p.group_id = l.group_id;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
create temp table other on commit drop as select * from public.create_group('B other');
create temp table copied on commit drop as select public.copy_list((select id from lists where name='Faves'), (select id from other)) as id;
select 'copy', (select count(*) from list_places where list_id = (select id from copied)) as copied_places, (select count(*) from list_places lp join lists l on l.id = lp.list_id where l.name='Faves' and l.group_id = (select id from g)) as source_places;
select 'places now in other', count(*) from places where group_id = (select id from other);
insert into group_goals (group_id, kind, target, year) values ((select id from other), 'new_cuisines', 10, 2026);
select 'goal', count(*) from group_goals;
commit;
