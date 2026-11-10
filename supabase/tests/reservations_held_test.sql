-- Round 56: booking links are held, hidden until an admin switches them on.
-- Expected refusals: 3 (outsider holding a link; non-admin listing; non-admin switching on).
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
insert into places (group_id, google_place_id, name, formatted_address, latitude, longitude, website, created_by)
select id, 'gplace-resv-1', 'Table Nine', 'Google addr', 43.7002, -79.4002, 'https://tablenine.example', :'A'
  from groups where name = 'Test G' limit 1
on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'linked', (public.link_restaurant((select id from places where google_place_id = 'gplace-resv-1'))).id is not null;
commit;
create temp table rv as select id from restaurants where source_key = 'gplace-resv-1';
grant select on rv to authenticated, anon;
update profiles set is_admin = false where id = :'A';

-- Someone outside the group can't hold a link (error 1).
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.hold_reservation_link((select id from rv), 'https://book.example/table-nine');
rollback;

-- A member's read of the website keeps it; a bad link is refused quietly.
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'held', public.hold_reservation_link((select id from rv), 'https://book.example/table-nine');
select 'bad ignored', public.hold_reservation_link((select id from rv), 'javascript:alert(1)');
select 'spaces ignored', public.hold_reservation_link((select id from rv), 'https://x.example/a b');
-- Not shown while off, to anyone.
select 'hidden', public.reservation_link((select id from rv)) is null;
commit;
begin; set local role anon;
select 'hidden from public', public.reservation_link((select id from rv)) is null;
rollback;

-- The table itself can't be read directly (0 rows or permission refusal both mean "can't see").
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'cannot list' as t, has_table_privilege('authenticated', 'public.restaurant_reservations', 'select') = false;
commit;

-- A plain member can't list or switch on (errors 2 and 3).
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select * from public.admin_reservations();
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.admin_set_reservations((select id from rv), true, 'Nobody');
rollback;

-- An admin lists it, switches it on, and everyone (even signed out) now gets the link.
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'listed', count(*) = 1, bool_and(not enabled) from public.admin_reservations() where restaurant_id = (select id from rv);
select 'on', public.admin_set_reservations((select id from rv), true, 'Table Nine group');
commit;
begin; set local role anon;
select 'shown', public.reservation_link((select id from rv));
rollback;
-- A re-read refreshes the link but doesn't switch it off.
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.hold_reservation_link((select id from rv), 'https://book.example/table-nine-2');
commit;
select 'kept on', enabled, url, partner from restaurant_reservations where restaurant_id = (select id from rv);
-- Off again hides it.
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.admin_set_reservations((select id from rv), false);
commit;
select 'off', public.reservation_link((select id from rv)) is null;
update profiles set is_admin = false where id = :'A';
