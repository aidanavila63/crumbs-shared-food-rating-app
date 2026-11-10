-- Part three: Dish of the week — needs 3 groups, stays the same all week, last winners sit out.
-- Expected refusals: 0.
\set A '00000000-0000-0000-0000-00000000000a'
create temp table dw as select r.id from restaurants r order by r.id limit 1;
grant select on dw to anon;
delete from dish_of_week;
-- use a restaurant that already has a public link
delete from dw; insert into dw select restaurant_id from restaurant_slugs where is_current order by restaurant_id limit 1;
create temp table dw_slug as select slug from restaurant_slugs where restaurant_id = (select id from dw) and is_current;
grant select on dw_slug to anon;
insert into groups (name, created_by, join_code) values ('DW one', :'A', 'DWQAAA'), ('DW two', :'A', 'DWQBBB'), ('DW three', :'A', 'DWQCCC');
insert into places (group_id, google_place_id, name, formatted_address, latitude, longitude, created_by, restaurant_id)
select g.id, 'gplace-dw-' || g.name, 'DW Spot', 'addr', 43.7, -79.4, :'A', (select id from dw)
  from groups g where g.name like 'DW %';
-- Noodles in all three groups, Dumplings only in two
insert into dishes (place_id, name) select p.id, 'Hand-pulled Noodles' from places p where p.google_place_id like 'gplace-dw-%';
insert into dishes (place_id, name) select p.id, 'Dumplings' from places p where p.google_place_id in ('gplace-dw-DW one', 'gplace-dw-DW two');
insert into dish_ratings (dish_id, user_id, score, points)
select d.id, :'A', 5, case when d.name = 'Dumplings' then 100 else 90 end
  from dishes d join places p on p.id = d.place_id where p.google_place_id like 'gplace-dw-%';

-- only 2 groups for Dumplings (even at 100): Noodles wins, and anyone can see it
begin; set local role anon;
do $$ declare w jsonb := public.dish_of_the_week(); begin
  if coalesce(w->>'name', '') <> 'Hand-pulled Noodles' then raise exception 'wrong winner: %', w; end if;
  if (w->>'groups')::int <> 3 or (w->>'points')::int <> 90 then raise exception 'wrong totals: %', w; end if;
  if w->>'slug' <> (select slug from dw_slug) then raise exception 'wrong link: %', w; end if;
end $$;
commit;

-- the pick holds for the week even when something better comes along
insert into dishes (place_id, name) select p.id, 'Dumplings' from places p where p.google_place_id = 'gplace-dw-DW three';
insert into dish_ratings (dish_id, user_id, score, points)
select d.id, :'A', 5, 100 from dishes d join places p on p.id = d.place_id
 where p.google_place_id = 'gplace-dw-DW three' and d.name = 'Dumplings';
do $$ begin if public.dish_of_the_week()->>'name' <> 'Hand-pulled Noodles' then raise exception 'should hold all week'; end if; end $$;

-- next week: last week's winner sits out, Dumplings (now 3 groups) wins
update dish_of_week set week = week - 7;
do $$ begin if public.dish_of_the_week()->>'name' <> 'Dumplings' then raise exception 'new week should pick Dumplings'; end if; end $$;

-- the table itself isn't readable directly
begin; set local role anon;
do $$ begin if exists (select 1 from dish_of_week) then raise exception 'table should be closed'; end if; end $$;
rollback;

delete from dish_of_week;
delete from places where google_place_id like 'gplace-dw-%';
delete from groups where name like 'DW %';
