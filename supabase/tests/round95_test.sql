-- Round 95: merge places (U13), trip currency (U10), hand over a page (O6), heads-up (O11),
-- paste prices (O5), menu look (O15).
-- Expected refusals: 9
--   1 a guest merging places
--   2 merging places from two groups
--   3 a trip currency that isn't a 3-letter code
--   4 a non-owner inviting a manager
--   5 accepting an invite you don't have
--   6 a heads-up for a restaurant nobody runs on Crumbs
--   7 a non-owner pasting prices
--   8 a logo that isn't the restaurant's
--   9 saving a shared list into a group you're not in
\set o '95959595-0000-0000-0000-000000000001'
\set m '95959595-0000-0000-0000-000000000002'
\set q '95959595-0000-0000-0000-000000000003'
\set n '95959595-0000-0000-0000-000000000004'
\set g '95959595-0000-0000-0000-0000000000a1'
\set g2 '95959595-0000-0000-0000-0000000000a2'
\set p1 '95959595-0000-0000-0000-0000000000b1'
\set p2 '95959595-0000-0000-0000-0000000000b2'
\set p3 '95959595-0000-0000-0000-0000000000b3'
\set r '95959595-0000-0000-0000-0000000000e1'
\set r2 '95959595-0000-0000-0000-0000000000e2'
\set plan '95959595-0000-0000-0000-0000000000d1'
insert into auth.users (id, email) values (:'o', 'o95@example.com'), (:'m', 'm95@example.com'), (:'q', 'q95@example.com'), (:'n', 'n95@example.com')
on conflict do nothing;
update profiles set access = 'approved', handle = case id when :'n' then 'newowner95' else handle end where id in (:'o', :'m', :'q', :'n');
delete from groups where id in (:'g', :'g2');
delete from restaurants where id in (:'r', :'r2');
insert into groups (id, name, created_by, join_code) values (:'g', 'r95 group', :'o', 'RQBXQV'), (:'g2', 'r95 other', :'o', 'RQBXQW');
insert into group_members (group_id, user_id, role) values (:'g', :'o', 'owner'), (:'g', :'m', 'member'), (:'g', :'q', 'guest'), (:'g2', :'o', 'owner')
on conflict do nothing;
insert into restaurants (id, source_key, name, owner_verified) values (:'r', 'osm:95e1', 'r95 Bistro', false), (:'r2', 'osm:95e2', 'r95 Plain', false);
insert into restaurant_managers (restaurant_id, user_id) values (:'r', :'o') on conflict do nothing;
insert into places (id, group_id, google_place_id, name, status, created_by, tags, restaurant_id) values
  (:'p1', :'g', 'manual:r95-1', 'r95 Bistro', 'Want to try', :'m', '{patio}', null),
  (:'p2', :'g', 'gp:r95-real', 'Bistro (dup)', 'Been', :'m', '{date night}', :'r'),
  (:'p3', :'g2', 'manual:r95-3', 'r95 Elsewhere', 'Been', :'o', '{}', null);
insert into place_visits (place_id, visited_on, created_by) values (:'p2', '2026-11-01', :'m');
insert into place_ratings (place_id, user_id, score) values (:'p2', :'m', 5), (:'p1', :'o', 3), (:'p2', :'o', 4);

-- U13 merge
begin; set local role authenticated; set local request.jwt.claim.sub = :'q';
select public.merge_places(:'p1', :'p2');  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
select public.merge_places(:'p1', :'p3');  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
select public.merge_places(:'p1', :'p2');
commit;
select 1 / (case when (select status = 'Been' and restaurant_id = :'r' and google_place_id = 'gp:r95-real'
                         and tags @> '{patio,"date night"}' from places where id = :'p1')
                  and not exists (select 1 from places where id = :'p2')
                  and (select count(*) from place_visits where place_id = :'p1') = 1
                  and (select count(*) from place_ratings where place_id = :'p1') = 2  -- Ben's moved, Odette kept hers
                  and (select score from place_ratings where place_id = :'p1' and user_id = :'o') = 3
                 then 1 else 0 end) as merged;

-- U10 trip currency
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
insert into lists (group_id, name, emoji, created_by, currency) values (:'g', 'r95 trip', '✈️', :'o', 'EUR');
insert into lists (group_id, name, emoji, created_by, currency) values (:'g', 'r95 bad', '✈️', :'o', 'euro');  -- [refusal 3]
rollback;

-- O6 hand over a page
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
select public.owner_invite_manager(:'r', '@newowner95');  -- [refusal 4]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
select public.owner_invite_manager(:'r', '@NewOwner95');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
select public.answer_manager_invite(:'r', true);  -- [refusal 5]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'n';
select 1 / (case when jsonb_array_length(public.my_manager_invites()) = 1 then 1 else 0 end) as invite_seen;
select public.answer_manager_invite(:'r', true);
commit;
select 1 / (case when (select restaurant_owner from profiles where id = :'n')
                  and (select owner_verified from restaurants where id = :'r') then 1 else 0 end) as new_manager;
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
select 1 / (case when jsonb_array_length(public.owner_team(:'r') -> 'managers') = 2 then 1 else 0 end) as team_of_two;
select 1 / (case when public.owner_remove_manager(:'r', :'o') = 1 then 1 else 0 end) as first_owner_left;
commit;
select 1 / (case when (select owner_verified from restaurants where id = :'r') and not (select restaurant_owner from profiles where id = :'o')
                 then 1 else 0 end) as handed_over;

-- O11 heads-up (Bistro is run by the new owner; Plain isn't run by anyone)
insert into places (id, group_id, google_place_id, name, status, created_by, restaurant_id) values
  ('95959595-0000-0000-0000-0000000000b4', :'g', 'manual:r95-4', 'r95 Plain', 'Want to try', :'m', :'r2');
insert into plans (id, group_id, title, created_by, place_id, starts_at, party) values
  (:'plan', :'g', 'r95 dinner', :'m', :'p1', now() + interval '3 days', 4),
  ('95959595-0000-0000-0000-0000000000d2', :'g', 'r95 other dinner', :'m', '95959595-0000-0000-0000-0000000000b4', now() + interval '3 days', 2);
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
select public.plan_headsup(:'plan', true);
select public.plan_headsup('95959595-0000-0000-0000-0000000000d2', true);  -- [refusal 6]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
select public.plan_headsup(:'plan', true);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'n';
select 1 / (case when public.owner_headsups(:'r') -> 0 ->> 'party' = '4' and not (public.owner_headsups(:'r') -> 0 ? 'title')
                 then 1 else 0 end) as owner_sees_count_only;
commit;

-- O5 paste prices
insert into restaurant_dishes (restaurant_id, name, name_key, price) values (:'r', 'Steak frites', public.dish_key('Steak frites'), 30);
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
select public.owner_paste_prices(:'r', '[{"name": "Steak frites", "price": "32"}]');  -- [refusal 7]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'n';
select 1 / (case when public.owner_paste_prices(:'r', '[{"name": "steak FRITES", "price": "32.50"}, {"name": "Onion soup", "price": "12"}, {"name": "x", "price": "1"}]')
                      = '{"added": 1, "changed": 1}' then 1 else 0 end) as pasted;
commit;
select 1 / (case when (select price from restaurant_dishes where restaurant_id = :'r' and name = 'Steak frites') = 32.50
                  and exists (select 1 from restaurant_dishes where restaurant_id = :'r' and name = 'Onion soup' and price = 12)
                 then 1 else 0 end) as prices_in;

-- O15 menu look
begin; set local role authenticated; set local request.jwt.claim.sub = :'n';
select public.owner_set_menu_look(:'r', 'portuguese', 'someone-else/logo.jpg');  -- [refusal 8]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'n';
select public.owner_set_menu_look(:'r', 'black-gold', :'r' || '/logo.jpg');
commit;
select 1 / (case when public.restaurant_owner_bits(:'r') @> jsonb_build_object('menu_theme', 'black-gold', 'logo_path', :'r' || '/logo.jpg')
                  and exists (select 1 from public.photo_refs() x where x.path = :'r' || '/logo.jpg')
                 then 1 else 0 end) as look_on_page;

-- U11 shared list: save a copy into your own space (places you have are reused)
insert into lists (id, group_id, name, emoji, created_by) values ('95959595-0000-0000-0000-0000000000f1', :'g', 'r95 faves', '⭐', :'o');
insert into list_places (list_id, place_id, position) values ('95959595-0000-0000-0000-0000000000f1', :'p1', 1);
insert into list_shares (list_id, token) values ('95959595-0000-0000-0000-0000000000f1', 'abcdef0123456789abcdef95');
select 1 / (case when public.get_shared_list('abcdef0123456789abcdef95') -> 'places' -> 0 ->> 'name' = 'r95 Bistro' then 1 else 0 end) as shared_page;
begin; set local role authenticated; set local request.jwt.claim.sub = :'m';
select public.copy_shared_list('abcdef0123456789abcdef95', :'g2');  -- [refusal 9]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'o';
select 1 / (case when public.copy_shared_list('abcdef0123456789abcdef95', :'g2') @> '{"added": 1, "reused": 0}' then 1 else 0 end) as copied;
select 1 / (case when public.copy_shared_list('abcdef0123456789abcdef95', :'g2') @> '{"added": 0, "reused": 1}' then 1 else 0 end) as reused_second_time;
commit;

delete from groups where id in (:'g', :'g2');
delete from deleted_items where name like 'Bistro (dup)%';
delete from restaurants where id in (:'r', :'r2');
delete from auth.users where id in (:'o', :'m', :'q', :'n');
