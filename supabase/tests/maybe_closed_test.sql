-- Part three: "Might be closed" needs 2 different groups; an "it's open" answer clears it.
-- Expected refusals: 0. (Reports are written directly here: this checks the counting rule.)
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
create temp table mc as select r.id from restaurants r where coalesce(r.business_status, 'OPERATIONAL') = 'OPERATIONAL' order by r.id limit 1;
insert into groups (name, created_by, join_code) values ('MC one', :'A', 'MCQAAA'), ('MC two', :'A', 'MCQBBB');
insert into group_members (group_id, user_id) select id, :'A' from groups where name = 'MC one';
insert into group_members (group_id, user_id) select id, :'E' from groups where name = 'MC two';
insert into places (group_id, google_place_id, name, formatted_address, latitude, longitude, created_by, restaurant_id)
select g.id, 'gplace-mc-' || g.name, 'MC Spot', 'addr', 43.7, -79.4, :'A', (select id from mc)
  from groups g where g.name in ('MC one', 'MC two');
delete from restaurant_facts where restaurant_id = (select id from mc) and field = 'status';

-- one group says closed: no banner
insert into restaurant_facts (restaurant_id, field, value, evidence, user_id)
values ((select id from mc), 'status', '"CLOSED_TEMPORARILY"', 'in_person', :'A');
do $$ begin if public.maybe_closed((select id from mc)) is not null then raise exception 'one group is not enough'; end if; end $$;

-- a second group says closed (even "for good" vs "temporarily"): banner, and anyone can see it
insert into restaurant_facts (restaurant_id, field, value, evidence, user_id)
values ((select id from mc), 'status', '"CLOSED_PERMANENTLY"', 'in_person', :'E');
do $$ begin if coalesce((public.maybe_closed((select id from mc))->>'groups')::int, 0) <> 2 then raise exception 'two groups should show the banner'; end if; end $$;
grant select on mc to anon;
begin; set local role anon;
do $$ begin if public.maybe_closed((select id from mc)) is null then raise exception 'public page should see it'; end if; end $$;
rollback;

-- old reports (over 60 days) don't count
update restaurant_facts set created_at = now() - interval '61 days' where restaurant_id = (select id from mc) and user_id = :'E' and field = 'status';
do $$ begin if public.maybe_closed((select id from mc)) is not null then raise exception 'old reports should not count'; end if; end $$;
update restaurant_facts set created_at = now() - interval '2 days' where restaurant_id = (select id from mc) and user_id = :'E' and field = 'status';

-- someone says it's open, newer than both: banner gone
update restaurant_facts set value = '"OPERATIONAL"', created_at = now() where restaurant_id = (select id from mc) and user_id = :'A' and field = 'status';
do $$ begin if public.maybe_closed((select id from mc)) is not null then raise exception 'an open answer should clear it'; end if; end $$;

delete from restaurant_facts where restaurant_id = (select id from mc) and field = 'status';
delete from places where google_place_id like 'gplace-mc-%';
delete from groups where name in ('MC one', 'MC two');
