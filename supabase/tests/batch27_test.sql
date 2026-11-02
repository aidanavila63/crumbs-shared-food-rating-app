\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
create temp table r as select id from restaurants where source_key='gp9';
grant select on r to authenticated;
insert into restaurant_managers (restaurant_id, user_id) select id, :'D' from r on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
insert into restaurant_menu_files (restaurant_id, path) select id, id::text || '/x.pdf' from r;
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
insert into restaurant_menu_files (restaurant_id, path, bytes) select id, id::text || '/m.pdf', 1000 from r;
insert into restaurant_menu_files (restaurant_id, path) select id, 'elsewhere/m.pdf' from r;
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
insert into restaurant_menu_files (restaurant_id, path, bytes) select id, id::text || '/m.pdf', 1000 from r;
commit;
select 'import', public.import_menu_file((select id from restaurant_menu_files limit 1),
  '[{"name":"Spicy Miso Ramen","price":17.5,"course":"main","description":"chili"},{"name":"Edamame","price":5,"course":"starter"}]');
select 'file', status, dishes_added from restaurant_menu_files;
select 'dishes', name, price, source, owner_ok from restaurant_dishes where source = 'pdf' order by name;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B reads files', count(*) from restaurant_menu_files;
select public.import_menu_file((select id from restaurant_menu_files limit 1), '[]');
rollback;
