-- Round 96: Loved near you (U22), change history (U23).
-- Expected refusals: 1
--   1 Loved near you signed out
\set a '96969696-0000-0000-0000-000000000001'
\set d '96969696-0000-0000-0000-000000000002'
\set r '96969696-0000-0000-0000-0000000000e1'
\set far '96969696-0000-0000-0000-0000000000e2'
insert into auth.users (id, email) values (:'a', 'a96@example.com'), (:'d', 'd96@example.com') on conflict do nothing;
update profiles set access = 'approved' where id in (:'a', :'d');
delete from restaurants where id in (:'r', :'far');
insert into restaurants (id, source_key, name, latitude, longitude) values
  (:'r', 'osm:96e1', 'r96 Loved', 43.6510, -79.3810), (:'far', 'osm:96e2', 'r96 Far', 45.50, -73.56);
do $$
declare i int; gid uuid; pid uuid; rid uuid;
begin
  foreach rid in array array['96969696-0000-0000-0000-0000000000e1'::uuid, '96969696-0000-0000-0000-0000000000e2'::uuid] loop
    for i in 1..3 loop
      gid := gen_random_uuid();
      insert into public.groups (id, name, created_by, join_code)
        values (gid, 'r96 group ' || i, '96969696-0000-0000-0000-000000000001', 'T' || chr(64 + i) || substr(md5(rid::text), 1, 0) || case when rid = '96969696-0000-0000-0000-0000000000e1' then 'QRBX' else 'QRBY' end);
      insert into public.group_members (group_id, user_id, role) values (gid, '96969696-0000-0000-0000-000000000001', 'owner');
      insert into public.places (id, group_id, google_place_id, name, status, created_by, restaurant_id)
        values (gen_random_uuid(), gid, 'osm:r96-' || i || rid, 'r96 place', 'Been', '96969696-0000-0000-0000-000000000001', rid)
        returning id into pid;
      insert into public.place_ratings (place_id, user_id, score) values (pid, '96969696-0000-0000-0000-000000000001', 5);
    end loop;
  end loop;
end $$;

begin; set local role anon;
select public.loved_near(43.65, -79.38);  -- [refusal 1]
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'d';
select 1 / (case when (public.loved_near(43.65, -79.38) -> 0 ->> 'name') = 'r96 Loved'
                  and (public.loved_near(43.65, -79.38) -> 0 ->> 'groups')::int = 3
                  and jsonb_array_length(public.loved_near(43.65, -79.38)) = 1 then 1 else 0 end) as loved_nearby_only;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'a';
select 1 / (case when jsonb_array_length(public.loved_near(43.65, -79.38)) = 0 then 1 else 0 end) as not_ones_you_have;
-- change history
update places set cuisine = 'Lao' where group_id in (select id from groups where name = 'r96 group 1') and restaurant_id = :'r';
select 1 / (case when exists (select 1 from place_changes c join places p on p.id = c.place_id
                               where p.restaurant_id = :'r' and c.field = 'cuisine' and c.new_value = 'Lao' and c.user_id = :'a')
                 then 1 else 0 end) as change_logged;
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'d';
select 1 / (case when (select count(*) from place_changes c join places p on p.id = c.place_id where p.restaurant_id = :'r') = 0
                 then 1 else 0 end) as outsiders_see_no_history;
commit;

delete from groups where name like 'r96 group %';
delete from restaurants where id in (:'r', :'far');
delete from auth.users where id in (:'a', :'d');
