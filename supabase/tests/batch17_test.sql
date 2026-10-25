\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
-- A copy of Sora (gp9) made separately, 30 m away, with one place pointing at it
insert into restaurants (source_key, name, latitude, longitude, phone) values ('osm:N17', 'Sora', 43.7002, -79.4001, '+1 416 555 0199');
update places set restaurant_id = (select id from restaurants where source_key='osm:N17') where google_place_id='gp9' and created_by=:'D';
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B dupes (not admin, expect [])', public.possible_duplicates();
select 'B cap fact', public.over_daily_cap('fact');
select 'B merge (expect error)';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A dupes (expect 1)', jsonb_array_length(public.possible_duplicates());
select 'A busy people', jsonb_array_length(public.recent_contributors()) > 0;
select 'A merge', public.merge_restaurants((select id from restaurants where source_key='gp9'), (select id from restaurants where source_key='osm:N17'));
commit;
select 'after merge: copies left (expect 0)', count(*) from restaurants where source_key='osm:N17';
select 'places on kept (expect 2)', places_count from restaurants where source_key='gp9';
select 'trust B', public.user_trust(:'B');
select 'limit report has db', (public.limit_report()->>'db_bytes')::bigint > 0;
-- daily cap: 60 facts today blocks the 61st
insert into restaurants (source_key, name, latitude, longitude) select 'cap' || n, 'Cap ' || n, 40 + n, -70 from generate_series(1, 60) n;
insert into restaurant_facts (restaurant_id, user_id, field, value, evidence)
select id, :'D', 'phone', '"1"', 'in_person' from restaurants where source_key like 'cap%';
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D capped', public.over_daily_cap('fact');
commit;
