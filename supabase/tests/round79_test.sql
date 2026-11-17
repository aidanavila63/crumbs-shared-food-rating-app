-- Round 79 (Nov 18): name search without accents, near-me on our own table, the Overture merge.
-- Expected refusals: 3 (a member merging; a member reading the import numbers; near-me signed out)
\set admin '79797979-0000-0000-0000-000000000001'
\set mate '79797979-0000-0000-0000-000000000002'
insert into auth.users (id, email) values (:'admin', 'a79@example.com'), (:'mate', 'm79@example.com') on conflict do nothing;
insert into profiles (id, display_name) values (:'admin', 'Ada'), (:'mate', 'Mo') on conflict do nothing;
update profiles set is_admin = (id = :'admin'), access = 'approved' where id in (:'admin', :'mate');
delete from overture_places where id like 'r79-%';
delete from restaurants where source_key like 'r79:%' or source_key like 'ovt:r79-%';
insert into restaurants (source_key, name, latitude, longitude, website) values
  ('r79:1', 'Crêperie Tranquille', 43.7001, -79.4001, 'https://tranquille.example'),
  ('r79:2', 'Shawarma Royale', 43.7010, -79.4010, null),
  ('r79:3', 'Gone Diner', 43.7002, -79.4002, null);
update restaurants set business_status = 'CLOSED_PERMANENTLY' where source_key = 'r79:3';

begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select 1 / (case when exists (select 1 from public.search_restaurants('creperie tranq') where source_key = 'r79:1') then 1 else 0 end) as accents_folded;
select 1 / (case when exists (select 1 from public.search_restaurants('shwarma royal') where source_key = 'r79:2') then 1 else 0 end) as near_miss_found;
select 1 / (case when (select source_key from public.restaurants_near(43.7001, -79.4001, 0.5) where source_key like 'r79:%' order by distance_km limit 1) = 'r79:1'
                 then 1 else 0 end) as nearest_first;
select 1 / (case when not exists (select 1 from public.restaurants_near(43.7001, -79.4001, 0.5) where source_key = 'r79:3') then 1 else 0 end) as closed_left_out;
select 1 / (case when (select count(*) from overture_places) = 0 then 1 else 0 end) as holding_table_private;
select public.merge_overture(10);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'mate';
select public.admin_overture();  -- [refusal 2]
rollback;
begin; set local role anon;
select * from public.restaurants_near(43.7, -79.4);  -- [refusal 3]
rollback;

-- The import: one already in Crumbs (same name, 20 m away), one new, one with a website already set.
insert into overture_places (id, name, category, latitude, longitude, address, city, phone, website, release) values
  ('r79-a', 'Shawarma Royale', 'middle_eastern_restaurant', 43.7011, -79.4011, '1 Main St', 'Toronto', '+1 416 555 0101', 'https://royale.example', '2026-11'),
  ('r79-b', 'Brand New Noodles', 'noodles_restaurant', 43.7050, -79.4050, '9 Side St', 'Toronto', null, null, '2026-11'),
  ('r79-c', 'Creperie Tranquille', 'cafe', 43.7001, -79.4001, null, null, null, 'https://other.example', '2026-11');
begin; set local role authenticated; set local request.jwt.claim.sub = :'admin';
select public.merge_overture(100);
select 1 / (case when (public.admin_overture()->>'waiting')::int = 0 then 1 else 0 end) as all_merged;
commit;
do $$ begin
  if (select overture_id from restaurants where source_key = 'r79:2') <> 'r79-a' then raise exception 'should link the match'; end if;
  if (select phone from restaurants where source_key = 'r79:2') is null then raise exception 'an empty detail should be filled'; end if;
  if (select sources->>'phone' from restaurants where source_key = 'r79:2') <> 'overture' then raise exception 'and say where it came from'; end if;
  if not exists (select 1 from restaurants where source_key = 'ovt:r79-b' and cuisine = 'Noodles') then raise exception 'new place should be added'; end if;
  if (select website from restaurants where source_key = 'r79:1') <> 'https://tranquille.example' then raise exception 'never overwrite a detail'; end if;
  if (select overture_id from restaurants where source_key = 'r79:1') <> 'r79-c' then raise exception 'accented match should link'; end if;
end $$;
-- running it again changes nothing
begin; set local role authenticated; set local request.jwt.claim.sub = :'admin';
select 1 / (case when (public.merge_overture(100)->>'added')::int = 0 then 1 else 0 end) as nothing_twice;
commit;

delete from overture_places where id like 'r79-%';
delete from restaurants where source_key like 'r79:%' or source_key like 'ovt:r79-%';
delete from auth.users where id in (:'admin', :'mate');
