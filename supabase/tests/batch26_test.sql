\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
create temp table r as select id from restaurants where source_key='gp9';
grant select on r to authenticated;
insert into restaurant_managers (restaurant_id, user_id) select id, :'D' from r on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
insert into restaurant_posts (restaurant_id, kind, title, weekdays) select id, 'special', 'Wings', '{2,4}' from r;
select 'owner insights', public.owner_insights((select id from r)) ? 'saved';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B reads posts', count(*) from restaurant_posts;
insert into restaurant_posts (restaurant_id, kind, title) select id, 'news', 'Fake' from r;
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select public.owner_insights((select id from r));
rollback;
