-- Public pages (Nov 3): restaurant links, totals-only data (3+ groups), nothing borrowed from Google,
-- opt-in profiles and the handle rules. Expected refusals: 10.
\set M '00000000-0000-0000-0000-0000000000f1'
\set N '00000000-0000-0000-0000-0000000000f2'
\set O '00000000-0000-0000-0000-0000000000f3'
\set P '00000000-0000-0000-0000-0000000000f4'
insert into auth.users (id, email) values (:'M', 'm@pp.io'), (:'N', 'n@pp.io'), (:'O', 'o@pp.io'), (:'P', 'p@pp.io') on conflict do nothing;
insert into profiles (id, display_name) values (:'M', 'Maya'), (:'N', 'Noor'), (:'O', 'Omar'), (:'P', 'Pia') on conflict do nothing;
update profiles set access = 'approved' where id in (:'M', :'N', :'O', :'P');
update profiles set display_name = 'Maya' where id = :'M';
update profiles set display_name = 'Noor' where id = :'N';
update profiles set display_name = 'Omar' where id = :'O';
update profiles set display_name = 'Pia' where id = :'P';

-- ---- links ----------------------------------------------------------------------------------
insert into restaurants (source_key, name, formatted_address, latitude, longitude, sources)
values ('pp-1', 'Lantern Pho & Grill', '1234 Sample Rd, Etobicoke, ON M9A 1A1, Canada', 43.65, -79.52, '{"address":"google","location":"google","cuisine":"google"}'),
       ('pp-2', 'Lantern Pho & Grill', '77 Other St, Etobicoke, ON M9A 2B2, Canada', 43.66, -79.53, '{}'),
       ('pp-3', 'Lantern Pho & Grill', 'Etobicoke, ON, Canada', null, null, '{}');
select 'links', city, slug from restaurant_slugs s join restaurants r on r.id = s.restaurant_id where r.source_key like 'pp-%' order by r.source_key;
create temp table pp as select id from restaurants where source_key = 'pp-1';
grant select on pp to anon, authenticated;

-- ---- three groups needed ---------------------------------------------------------------------
create temp table gg (n int, gid uuid, uid uuid);
grant select on gg to authenticated, anon;
do $$ declare i int; g uuid; u uuid; pl uuid; us uuid[] := array['00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4']; begin
  for i in 1..4 loop
    u := us[i];
    insert into groups (name, join_code, created_by) values ('PP group ' || i, 'PPG' || repeat(chr(64 + i), 3), u) returning id into g;
    insert into group_members (group_id, user_id, role) values (g, u, 'owner') on conflict do nothing;
    insert into places (group_id, google_place_id, name, created_by, restaurant_id)
      values (g, 'pp-place-' || i, 'Lantern Pho', u, (select id from pp)) returning id into pl;
    insert into place_ratings (place_id, user_id, score, points, reasons, would_return) values (pl, u, 5, 90, array['great_broth'], 'yes');
    insert into place_visits (place_id, visited_on, spend, people, meal_time, wait_minutes, created_by, kind)
      values (pl, current_date - i, 50, 2, 'dinner', 10 + i, u, 'dine_in');
    insert into dishes (place_id, name, created_by) values (pl, 'Beef pho', u);
    insert into dish_ratings (dish_id, user_id, score, points) select d.id, u, 5, 92 from dishes d where d.place_id = pl;
    insert into gg values (i, g, u);
    -- only the first two groups so far
    exit when i = 2;
  end loop;
end $$;
select 'two groups: no rating', (public.restaurant_public('etobicoke', 'lantern-pho-grill') -> 'rating') = 'null'::jsonb as hidden,
       public.restaurant_public('etobicoke', 'lantern-pho-grill') -> 'top_dishes' as dishes,
       public.restaurant_public('etobicoke', 'lantern-pho-grill') -> 'visits' as visits;
-- a draft never counts
do $$ declare pl uuid; g uuid; u uuid := '00000000-0000-0000-0000-0000000000f3'; begin
  insert into groups (name, join_code, created_by) values ('PP group 3', 'PPGCCC', u) returning id into g;
  insert into group_members (group_id, user_id, role) values (g, u, 'owner') on conflict do nothing;
  insert into places (group_id, google_place_id, name, created_by, restaurant_id) values (g, 'pp-place-3', 'Lantern Pho', u, (select id from pp)) returning id into pl;
  insert into place_ratings (place_id, user_id, score, draft) values (pl, u, 1, true);
end $$;
select 'draft ignored', (public.restaurant_public('etobicoke', 'lantern-pho-grill') -> 'rating') = 'null'::jsonb as still_hidden;
update place_ratings set draft = false, score = 4, points = 80, reasons = array['great_broth'], would_return = 'yes'
 where user_id = :'O';
insert into place_visits (place_id, visited_on, spend, people, meal_time, wait_minutes, created_by, kind)
  select p.id, current_date - 7, 60, 2, 'dinner', 20, :'O', 'dine_in' from places p where p.google_place_id = 'pp-place-3';
insert into dishes (place_id, name, created_by) select p.id, 'Beef pho', :'O' from places p where p.google_place_id = 'pp-place-3';
insert into dish_ratings (dish_id, user_id, score, points) select d.id, :'O', 4, 80 from dishes d join places p on p.id = d.place_id where p.google_place_id = 'pp-place-3';
select 'three groups: totals', x -> 'rating' ->> 'groups' as groups, x -> 'rating' ->> 'avg' as avg, x -> 'rating' -> 'hist' as hist,
       x -> 'rating' ->> 'would_return' as back, x -> 'known_for' as known_for, x -> 'top_dishes' as dishes,
       x ->> 'visits' as visits, x -> 'spend' ->> 'per_head' as per_head
  from (select public.restaurant_public('etobicoke', 'lantern-pho-grill') x) t;

-- nothing from Google, nothing private
select 'google facts hidden', x ->> 'address' is null as no_address, x ->> 'lat' is null as no_pin, x ->> 'cuisine' is null as no_cuisine,
       x ->> 'google_place_id' is null as pid_null_ok
  from (select public.restaurant_public('etobicoke', 'lantern-pho-grill') x) t;
select 'no names anywhere', (public.restaurant_public('etobicoke', 'lantern-pho-grill')::text ~* '(maya|noor|omar|pia|PP group)') as leaks;
update restaurants set sources = sources || '{"address":"crumbs"}' where id = (select id from pp);
select 'member-sourced address shows', public.restaurant_public('etobicoke', 'lantern-pho-grill') ->> 'address';

-- anyone can read a page; the internals and the signed-in copy are closed to strangers (errors 1, 2)
begin; set local role anon;
select 'anon reads page', public.restaurant_public('etobicoke', 'lantern-pho-grill') ->> 'name';
select 'unknown link', public.restaurant_public('etobicoke', 'nope') is null;
commit;
begin; set local role anon;
select public.restaurant_public_data((select id from pp));
rollback;
begin; set local role anon;
select public.restaurant_public_by_id((select id from pp));
rollback;

-- a renamed link keeps working
select public.reslug_restaurant((select id from pp), 'Toronto', 'Lantern Pho West');
select 'old link redirects', public.restaurant_public('etobicoke', 'lantern-pho-grill') -> 'redirect';
select 'new link', public.restaurant_public('toronto', 'lantern-pho-west') ->> 'name';

-- ---- handles ---------------------------------------------------------------------------------
begin; set local role authenticated; set local request.jwt.claim.sub = :'M';
select 'ok name', public.handle_check('maya.eats') ->> 'ok';
select 'too short', public.handle_check('ab') ->> 'reason';
select 'reserved', public.handle_check('Admin') ->> 'reason';
select 'swapped letters', public.handle_check('sh1tpost') ->> 'reason';
select 'dotted', public.handle_check('f.u.c.k') ->> 'reason';
select 'innocent word kept', public.handle_check('class_act') ->> 'ok', public.handle_check('scunthorpe') ->> 'ok';
select 'bad start', public.handle_check('9lives') ->> 'reason';
select 'double dot', public.handle_check('a..b') ->> 'reason';
select 'switched on', public.set_public_profile(true, 'MayaEats', 'Soup first', '{"map": false}',
  '{"stats": {"places": 87, "cuisines": 19, "cities": 6, "visits": 412, "evil": 1}, "badges": [{"key": "soup", "label": "Soup scholar", "emoji": "🍜"}, {"label": ""}], "passport": [{"city": "Toronto", "count": 41}]}',
  jsonb_build_array(jsonb_build_object('kind', 'place', 'restaurant_id', (select id from pp)),
                    jsonb_build_object('kind', 'dish', 'restaurant_id', (select id from pp), 'dish', 'Beef pho'),
                    jsonb_build_object('kind', 'place', 'restaurant_id', (select id from restaurants where source_key = 'pp-2'))));
commit;
select 'saved', handle, profile_public, bio, public_snapshot -> 'stats' as stats, jsonb_array_length(public_snapshot -> 'badges') as badges
  from profiles where id = :'M';
select 'only my own picks', count(*) from profile_picks where user_id = :'M';
-- a stranger sees it (no email, no groups)
begin; set local role anon;
select 'stranger sees', p ->> 'handle', p ->> 'name', p ->> 'bio', p -> 'stats' ->> 'places' as places,
       jsonb_array_length(p -> 'places') as places_shown, p -> 'places' -> 0 ->> 'score' as my_score, p -> 'places' -> 0 ->> 'slug' as slug,
       jsonb_array_length(p -> 'dishes') as dishes, jsonb_array_length(p -> 'badges') as badges,
       p::text ~* '(m@pp.io|PP group|email|group)' as leaks
  from (select public.public_profile('mayaeats') p) t;
commit;
-- can't edit the public columns directly (error 3)
begin; set local role authenticated; set local request.jwt.claim.sub = :'M';
update profiles set handle = 'sneaky' where id = :'M';
rollback;
-- bad names are refused: too short (4), reserved (5), vulgar (6)
begin; set local role authenticated; set local request.jwt.claim.sub = :'N';
select public.set_public_profile(true, 'ab', null, '{}', '{}', '[]');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'N';
select public.set_public_profile(true, 'support', null, '{}', '{}', '[]');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'N';
select public.set_public_profile(true, 'big_bitch', null, '{}', '{}', '[]');
rollback;
-- someone else's handle (7), and a restaurant's name once it's claimed (8)
begin; set local role authenticated; set local request.jwt.claim.sub = :'N';
select public.set_public_profile(true, 'MAYAEATS', null, '{}', '{}', '[]');
rollback;
update restaurants set owner_verified = true where id = (select id from pp);
begin; set local role authenticated; set local request.jwt.claim.sub = :'N';
select public.set_public_profile(true, 'lantern.pho.grill', null, '{}', '{}', '[]');
rollback;
-- changing your own handle twice inside 30 days (9)
begin; set local role authenticated; set local request.jwt.claim.sub = :'M';
select public.set_public_profile(true, 'maya_chen', 'Soup first', '{}', '{}', '[]');
rollback;
-- …after 30 days it's fine, and the old one is held for someone else for 90 days (10)
update profiles set handle_changed_at = now() - interval '31 days' where id = :'M';
begin; set local role authenticated; set local request.jwt.claim.sub = :'M';
select 'changed', public.set_public_profile(true, 'maya_chen', 'Soup first', '{}', '{}', '[]') ->> 'handle';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'N';
select public.set_public_profile(true, 'mayaeats', null, '{}', '{}', '[]');
rollback;
-- switching it off hides it
begin; set local role authenticated; set local request.jwt.claim.sub = :'M';
select 'off', public.set_public_profile(false, null, null, null, null, null) ->> 'public';
commit;
begin; set local role anon;
select 'private now', public.public_profile('maya_chen') is null;
commit;
