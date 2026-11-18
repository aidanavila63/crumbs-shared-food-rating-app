-- Round 89: owner tools — tags (O14), big changes (O7), change all prices (O5), tap counts (O3).
-- Expected refusals: 5
--   1 a member who isn't the owner setting tags
--   2 a tag that's a link
--   3 a member changing all prices
--   4 a +150% price change
--   5 a member reading the owner's numbers
\set own '89898989-0000-0000-0000-000000000001'
\set mem '89898989-0000-0000-0000-000000000002'
\set r1 '89898989-0000-0000-0000-0000000000e1'
\set r2 '89898989-0000-0000-0000-0000000000e2'
insert into auth.users (id, email) values (:'own', 'o89@example.com'), (:'mem', 'm89@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'own', 'Odette'), (:'mem', 'Marco') on conflict do nothing;
update profiles set access = 'approved' where id in (:'own', :'mem');
delete from restaurants where id in (:'r1', :'r2');
insert into restaurants (id, source_key, name, formatted_address, latitude, longitude, owner_verified) values
  (:'r1', 'osm:89e1', 'Rosa Taqueria', '10 Old St, Toronto', 43.65, -79.38, true),
  (:'r2', 'osm:89e2', 'Not Claimed Diner', '20 Elm St, Toronto', 43.66, -79.39, false);
select public.assign_restaurant_slug(:'r1');
insert into restaurant_managers (restaurant_id, user_id) values (:'r1', :'own') on conflict do nothing;
insert into restaurant_dishes (restaurant_id, name, name_key, price, course) values
  (:'r1', 'Al pastor taco', 'al pastor taco', 4.50, 'main'),
  (:'r1', 'Horchata', 'horchata', 3.99, 'drink'),
  (:'r1', 'Salsa trio', 'salsa trio', null, 'starter');

-- ---------------------------------------------------------------------------------------------
-- Owner says tags
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.owner_set_tags(:'r1', array['Family-run']);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_set_tags(:'r1', array['see www.rosa.com']);  -- [refusal 2]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_set_tags(:'r1', array[' Family-run ', 'family-run', 'Since  1987', '']);
commit;
select 1 / (case when (select owner_tags = array['Family-run', 'Since 1987'] from restaurants where id = :'r1') then 1 else 0 end) as tags_clean;

-- ---------------------------------------------------------------------------------------------
-- Change all prices
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.owner_bulk_price(:'r1', 10);  -- [refusal 3]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_bulk_price(:'r1', 150);  -- [refusal 4]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select 1 / (case when public.owner_bulk_price(:'r1', 10, 'drink') = 1 then 1 else 0 end) as drinks_only;
select 1 / (case when public.owner_bulk_price(:'r1', 10) = 2 then 1 else 0 end) as all_priced;
commit;
-- 3.99 → 4.39 → 4.83 → 4.85 (to 5 cents); 4.50 → 4.95
select 1 / (case when (select price from restaurant_dishes where restaurant_id = :'r1' and name_key = 'horchata') = 4.85
                  and (select price from restaurant_dishes where restaurant_id = :'r1' and name_key = 'al pastor taco') = 4.95
                  and (select price from restaurant_dishes where restaurant_id = :'r1' and name_key = 'salsa trio') is null
                 then 1 else 0 end) as rounded_to_nickels;

-- ---------------------------------------------------------------------------------------------
-- Tap counts
-- ---------------------------------------------------------------------------------------------
begin; set local role anon;
select 1 / (case when public.count_tap(:'r1', 'call', 'visitor-aaaa-1111') then 1 else 0 end) as anon_counts;
select 1 / (case when not public.count_tap(:'r1', 'call', 'visitor-aaaa-1111') then 1 else 0 end) as once_a_day;
select 1 / (case when public.count_tap(:'r1', 'call', 'visitor-bbbb-2222') then 1 else 0 end) as second_visitor;
select 1 / (case when not public.count_tap(:'r1', 'call', null) then 1 else 0 end) as needs_an_id;
select 1 / (case when not public.count_tap(:'r1', 'sms', 'visitor-aaaa-1111') then 1 else 0 end) as known_kinds_only;
select 1 / (case when not public.count_tap(:'r2', 'call', 'visitor-aaaa-1111') then 1 else 0 end) as claimed_pages_only;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select 1 / (case when public.count_tap(:'r1', 'call') then 1 else 0 end) as member_counts;
select 1 / (case when public.count_tap(:'r1', 'table_menu') then 1 else 0 end) as table_menu_counts;
select public.owner_tools(:'r1');  -- [refusal 5]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mem';
select public.count_tap(:'r1', 'call');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select 1 / (case when not public.count_tap(:'r1', 'call') then 1 else 0 end) as owner_not_counted;
select 1 / (case when (public.owner_tools(:'r1') #>> '{taps,call,last30}')::int = 3 then 1 else 0 end) as three_calls;
select 1 / (case when public.owner_tools(:'r1') #> '{taps,website,last30}' = '0'::jsonb then 1 else 0 end) as zero_shows;
select 1 / (case when public.owner_tools(:'r1') ->> 'slug' is not null then 1 else 0 end) as has_link;
commit;
insert into restaurant_taps (restaurant_id, kind, day, n)
values (:'r1', 'menu', (now() at time zone 'America/Toronto')::date, 2) on conflict (restaurant_id, kind, day) do update set n = 2;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select 1 / (case when public.owner_tools(:'r1') #> '{taps,menu,last30}' = 'null'::jsonb then 1 else 0 end) as small_hidden;
commit;

-- ---------------------------------------------------------------------------------------------
-- Big changes: renamed, moved, closed, cleared; the page shows tags and the notice
-- ---------------------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_big_change(:'r1', 'renamed', 'Rosa Cocina', 'Same family, bigger menu');
commit;
select 1 / (case when (select name = 'Rosa Cocina' and 'Rosa Taqueria' = any (aka) from restaurants where id = :'r1') then 1 else 0 end) as renamed_keeps_old;
select 1 / (case when public.restaurant_public_data(:'r1') || public.restaurant_owner_bits(:'r1')
                      @> '{"owner_notice": {"kind": "renamed", "old": "Rosa Taqueria"}, "owner_tags": ["Family-run", "Since 1987"]}'
                 then 1 else 0 end) as page_shows_notice_and_tags;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_big_change(:'r1', 'moved', '99 New Ave, Toronto', null, 43.70, -79.40);
commit;
select 1 / (case when (select formatted_address = '99 New Ave, Toronto' and round(latitude::numeric, 2) = 43.70
                         and owner_notice ->> 'old' = '10 Old St, Toronto' from restaurants where id = :'r1')
                 then 1 else 0 end) as moved_with_pin;
-- an expired notice isn't shown
update restaurants set owner_notice = owner_notice || jsonb_build_object('until', current_date - 100) where id = :'r1';
select 1 / (case when public.restaurant_owner_bits(:'r1') -> 'owner_notice' = 'null'::jsonb then 1 else 0 end) as expired_hidden;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_big_change(:'r1', 'closed', null, 'Thank you for 12 years');
commit;
select 1 / (case when (select business_status = 'CLOSED_PERMANENTLY' and owner_notice ->> 'kind' = 'closed'
                         and not owner_notice ? 'until' from restaurants where id = :'r1') then 1 else 0 end) as closed_noted;
begin; set local role authenticated; set local request.jwt.claim.sub = :'own';
select public.owner_big_change(:'r1', 'clear');
commit;
select 1 / (case when (select owner_notice is null from restaurants where id = :'r1') then 1 else 0 end) as cleared;
-- an unclaimed page never shows tags or a notice
update restaurants set owner_tags = array['Fake'], owner_notice = '{"kind": "closed"}' where id = :'r2';
select 1 / (case when public.restaurant_owner_bits(:'r2') @> '{"owner_tags": [], "owner_notice": null}'::jsonb then 1 else 0 end) as unclaimed_quiet;

-- tidy up
delete from restaurant_slugs where restaurant_id in (:'r1', :'r2');
delete from restaurants where id in (:'r1', :'r2');
delete from auth.users where id in (:'own', :'mem');
