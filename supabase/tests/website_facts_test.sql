-- Round 55: facts remember the website page they came from, the public page hands that out for
-- website facts only, reading a website has a budget, and admins can re-pull stale places.
-- Expected refusals: 2 (a non-admin re-pulling places; someone outside the group feeding a site fact).
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
insert into places (group_id, google_place_id, name, formatted_address, latitude, longitude, website, cuisine, created_by)
select id, 'gplace-web-1', 'Lantern Pho', 'Google addr', 43.7001, -79.4001, 'https://lanternpho.example', 'Vietnamese', :'A'
  from groups where name = 'Test G' limit 1
on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'linked', (public.link_restaurant((select id from places where google_place_id = 'gplace-web-1'))).id is not null;
commit;
create temp table web as select id from restaurants where source_key = 'gplace-web-1';
grant select on web to authenticated;

-- Other test files may leave A an admin; this one needs a plain member.
update profiles set is_admin = false where id = :'A';
-- Someone outside the group can't feed it (error 1).
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.merge_site_data((select id from web), '{"phone":"416 555 0100","source_url":"https://lanternpho.example/contact"}');
rollback;

-- The page is kept with each fact the website gave us (and only those).
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'took', public.merge_site_data((select id from web), '{
  "phone": "416 555 0100", "address": "1 King St W, Toronto", "price_level": 9,
  "source_url": "https://lanternpho.example/contact"}');
commit;
select 'urls kept', source_urls->>'phone', source_urls->>'address', not (source_urls ? 'price_level'), not (source_urls ? 'cuisine')
  from restaurants where id = (select id from web);

-- A link that isn't a web page is not kept, and what was kept stays.
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.merge_site_data((select id from web), '{"cuisine": "Pho", "source_url": "javascript:alert(1)"}');
commit;
select 'bad link ignored', cuisine, source_urls->>'phone', not (source_urls ? 'cuisine')
  from restaurants where id = (select id from web);

-- The public page shows the page and date for website facts, and nothing for the others.
select 'public',
  (restaurant_public_data(id)->'source_urls'->>'phone') = 'https://lanternpho.example/contact',
  restaurant_public_data(id)->'source_at' ? 'phone',
  not (restaurant_public_data(id)->'source_urls' ? 'cuisine') as cuisine_not_listed
  from (select id from web) w;
-- A member's answer takes over: the website's page is no longer shown for that fact.
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.contribute_fact((select id from web), 'phone', '"416 555 0111"', 'in_person');
commit;
select 'member replaces', not (restaurant_public_data(id)->'source_urls' ? 'phone') from (select id from web) w;

-- Reading websites is in the spending guard: a plain member gets a handful a day (8 to 20 by tier),
-- then is told to wait.
select 'budget row', daily_total, monthly_total, per_tier[1] from usage_budgets where kind = 'website';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'allowance runs out', count(*) filter (where ok) between 8 and 20, count(*) filter (where not ok) >= 5
  from (select (public.use_allowance('website')->>'ok')::boolean as ok from generate_series(1, 25)) s;
commit;

-- Re-pull stale places: admins only (error 2); counts first, then clears the "checked" dates.
update restaurants set site_checked_at = now(), osm_checked_at = now() where id = (select id from web);
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.admin_recheck_open_data();
rollback;
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'dry run counts it (still has Google facts)', (public.admin_recheck_open_data()->>'restaurants')::int >= 1;
select 'dry run changes nothing', site_checked_at is not null from restaurants where id = (select id from web);
select 'applied', (public.admin_recheck_open_data(true)->>'restaurants')::int >= 1;
commit;
update profiles set is_admin = false where id = :'A';
select 'stamps cleared', site_checked_at is null, osm_checked_at is null from restaurants where id = (select id from web);
-- A place whose owner runs the page is left alone.
update restaurants set site_checked_at = now(), owner_verified = true where id = (select id from web);
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.admin_recheck_open_data(true);
commit;
update profiles set is_admin = false where id = :'A';
select 'owner page untouched', site_checked_at is not null from restaurants where id = (select id from web);
update restaurants set owner_verified = false where id = (select id from web);
