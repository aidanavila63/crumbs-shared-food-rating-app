-- Public groups, join modes, recipe saves, head to head, and first answers that show straight away.
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
create temp table pg as select id from groups where created_by = :'B' limit 1;
grant select on pg to authenticated;
-- Private by default: nobody else finds it.
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'private hidden', count(*) = 0 from public.public_groups('') where id = (select id from pg);
commit;
-- B makes it public, asking first.
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
update groups set visibility = 'public', join_mode = 'request', description = 'Our food crew' where id = (select id from pg);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select 'found', name is not null and join_mode = 'request' and not is_member from public.public_groups('') where id = (select id from pg);
select 'no join code leak', not exists (select 1 from information_schema.routines where routine_name = 'public_groups' and routine_definition ilike '%join_code%');
select public.request_to_join((select id from pg));
select 'requested', requested from public.public_groups('') where id = (select id from pg);
commit;
-- C can't let themselves in (error 1), can't join directly while it asks first (error 2).
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select public.answer_join_request((select id from pg), :'C', true);
rollback;
begin; set local role authenticated; set local request.jwt.claim.sub = :'C';
select public.join_public_group((select id from pg));
rollback;
-- The owner sees the request and says yes.
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'owner sees request', count(*) = 1 from public.join_requests((select id from pg));
select public.answer_join_request((select id from pg), :'C', true);
select 'C is a member', exists (select 1 from group_members where group_id = (select id from pg) and user_id = :'C' and role = 'member');
commit;
-- Open: anyone joins straight away.
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
update groups set join_mode = 'open' where id = (select id from pg);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'A joins open', (public.join_public_group((select id from pg))).id = (select id from pg);
commit;
-- Invite only refuses requests (error 3).
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
update groups set visibility = 'private', join_mode = 'invite' where id = (select id from pg);
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select public.request_to_join((select id from pg));
rollback;
-- Bad join mode is refused (error 4).
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
update groups set join_mode = 'anyone' where id = (select id from pg);
rollback;
-- Recipe saves: only shared recipes can be saved (error 5 for a private one).
insert into home_meals (group_id, name, created_by, recipe_public, recipe, kind, cuisine, ingredients)
  select id, 'Shared soup', :'B', true, 'Boil', 'Soup', 'Thai', '[{"qty":"2","unit":"cup","item":"stock"}]' from pg;
insert into home_meals (group_id, name, created_by, recipe_public) select id, 'Secret stew', :'B', false from pg;
create temp table meals_t as select id, name from home_meals where name in ('Shared soup', 'Secret stew');
grant select on meals_t to authenticated;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
insert into recipe_saves (meal_id) select id from meals_t where name = 'Shared soup' on conflict do nothing;
select 'saved list', (public.public_recipes(null, 10, 'saved'))->0->>'name' = 'Shared soup';
select 'kind in json', (public.public_recipes('thai', 10, 'search'))->0->>'kind' = 'Soup';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
insert into recipe_saves (meal_id) select id from meals_t where name = 'Secret stew';
rollback;
-- Head to head sessions; a bad style is refused (error 6).
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
insert into swipe_sessions (group_id, created_by, title, place_ids, style) select id, :'B', 'Duel', '{}', 'duel' from pg;
select 'duel saved', count(*) >= 1 from swipe_sessions where style = 'duel';
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
insert into swipe_sessions (group_id, created_by, title, place_ids, style) select id, :'B', 'Bad', '{}', 'fight' from pg;
rollback;
