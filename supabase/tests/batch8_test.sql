\set ON_ERROR_STOP 0
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
select 'restaurant', name, phone, website, opening_hours is not null as hours, price_level, sources from restaurants;
-- next_question for B and D (different rotation, missing first)
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B next', public.next_question((select id from restaurants limit 1));
select 'B skip website', public.skip_question((select id from restaurants limit 1), (public.next_question((select id from restaurants limit 1)))->>'field', 90);
select 'B next after skip', public.next_question((select id from restaurants limit 1));
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D next', public.next_question((select id from restaurants limit 1));
commit;
-- allowances: B (tier 0) gets 3 AI a day
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B ai', n, public.use_allowance('ai') from generate_series(1,4) n;
commit;
-- global budget: set google daily total to 1, D uses it, B blocked by budget
update usage_budgets set daily_total = 1 where kind = 'google';
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D google', public.use_allowance('google');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B google (budget)', public.use_allowance('google');
select 'B usage_today (not admin, empty)', public.usage_today();
select 'B set_budget (should fail)', public.set_budget('ai', 1, 1, '{1,1,1,1,1}');
commit;
-- owner claim
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D claims', public.claim_restaurant((select id from restaurants limit 1), 'Dana', 'Owner', 'dana@hana.example', '', 'Email from our domain');
commit;
update profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a';
insert into group_members (group_id, user_id) select g.id, '00000000-0000-0000-0000-00000000000a' from groups g where g.name='Test G' on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A approves', public.review_claim((select id from restaurant_claims limit 1), true);
select 'A usage today', jsonb_array_length(public.usage_today());
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'owner sets price', public.contribute_fact((select id from restaurants limit 1), 'price_level', '3'::jsonb, 'in_person');
select 'owner next q', public.next_question((select id from restaurants limit 1));
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'member disagrees', public.contribute_fact((select id from restaurants limit 1), 'price_level', '2'::jsonb, 'in_person');
commit;
select 'price after', price_level, sources->>'price_level' from restaurants;
-- points cap: award many
select 'cap', public.award_points(:'B', 'test', 20, null, 'x1'), public.award_points(:'B', 'test', 20, null, 'x2'), public.award_points(:'B', 'test', 20, null, 'x3');
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B direct award (should fail)', public.award_points(:'B', 'cheat', 20, null, 'y');
rollback;
