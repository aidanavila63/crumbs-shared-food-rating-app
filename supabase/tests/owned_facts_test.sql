-- Round 46: fact dates, the restaurant's own website as a source, owned facts reaching every
-- group's copy, and forgetting Google-only facts. Expected refusals: 2.
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
insert into places (group_id, google_place_id, name, formatted_address, latitude, longitude, website, cuisine, created_by)
select id, 'gplace-owned-1', 'Bamiyan Kabob', 'Google addr', 43.7001, -79.4001, 'https://g.example', 'Afghan', :'A'
  from groups where name = 'Test G' limit 1
on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'linked', (public.link_restaurant((select id from places where google_place_id = 'gplace-owned-1'))).sources;
commit;
create temp table owned as select id from restaurants where source_key = 'gplace-owned-1';
grant select on owned to authenticated;
select 'dates on google facts', source_at ? 'address' and source_at ? 'cuisine' from restaurants where id = (select id from owned);
-- Someone outside the group can't feed it (error 1).
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.merge_site_data((select id from owned), '{"phone":"416 555 0100"}');
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'site took', public.merge_site_data((select id from owned), '{
  "hours": {"utc": -240, "periods": [{"o": [1, 11, 0], "c": [1, 22, 0]}]},
  "phone": "416 555 0100", "address": "1 King St W, Toronto", "website": "https://bamiyan.ca",
  "location": {"lat": 43.7005, "lng": -79.4004}, "price_level": 9, "cuisine": ""}');
commit;
select 'profile', formatted_address, website, phone, sources->>'address', sources->>'location', sources->>'price_level' is null,
       site_checked_at is not null from restaurants where id = (select id from owned);
select 'group copy follows', formatted_address = '1 King St W, Toronto', website = 'https://bamiyan.ca', latitude = 43.7005
  from places where google_place_id = 'gplace-owned-1';
-- Another group saving the same restaurant gets the owned facts on its copy.
insert into groups (name, join_code, created_by) values ('Owned G2', 'QQWWEE', :'A');
insert into places (group_id, google_place_id, name, formatted_address, created_by)
select id, 'gplace-owned-1', 'Bamiyan', 'Old Google addr', :'A' from groups where name = 'Owned G2';
update places set restaurant_id = (select id from owned) where google_place_id = 'gplace-owned-1' and restaurant_id is null;
select 'new copy takes owned', formatted_address = '1 King St W, Toronto', website = 'https://bamiyan.ca'
  from places p join groups g on g.id = p.group_id where g.name = 'Owned G2';
-- A member's phone beats the website.
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.contribute_fact((select id from owned), 'phone', '"416 555 0111"', 'in_person');
select 'site no longer wins phone', public.merge_site_data((select id from owned), '{"phone":"416 555 0100"}')->'applied' = '[]';
commit;
select 'phone stays', phone = '416 555 0111' from restaurants where id = (select id from owned);
-- Cuisine is still only Google's; make it old.
update restaurants set source_at = source_at || '{"cuisine": "2020-01-01T00:00:00Z"}' where id = (select id from owned);
select 'old date kept', source_at->>'cuisine' like '2020%' from restaurants where id = (select id from owned);
-- Only admins can forget (error 2).
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.forget_google_facts();
rollback;
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'dry run', (public.forget_google_facts()->'fields'->>'cuisine')::int >= 1;
select 'still there', cuisine from restaurants where id = (select id from owned);
select 'forget', (public.forget_google_facts(true)->>'group_copies')::int >= 1;
commit;
update profiles set is_admin = false where id = :'A';
select 'cuisine gone', cuisine is null, not (sources ? 'cuisine'), not (source_at ? 'cuisine'), formatted_address is not null
  from restaurants where id = (select id from owned);
select 'copy cuisine gone', cuisine is null, formatted_address is not null from places where google_place_id = 'gplace-owned-1';
