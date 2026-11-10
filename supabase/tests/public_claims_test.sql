-- Part two: owners claim from the public page without a group. Admins still review.
-- Expected refusals: 3 (claim while claims are closed; signed-out claim; a 4th waiting claim).
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
insert into places (group_id, google_place_id, name, formatted_address, latitude, longitude, created_by)
select g.id, 'gplace-claim-' || n, 'Claim Spot ' || n, 'addr ' || n, 43.7 + n / 1000.0, -79.4, :'A'
  from groups g, generate_series(1, 5) n where g.name = 'Test G'
on conflict do nothing;
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.link_restaurant(id) from places where google_place_id like 'gplace-claim-%';
commit;
create temp table cr as select id, source_key from restaurants where source_key like 'gplace-claim-%' order by source_key;
grant select on cr to authenticated, anon;

-- claims closed (switch on Admin): E (no group) is refused  [refusal 1]
update feature_flags set state = 'admin' where key = 'restaurant_claims';
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
do $$ begin if public.claims_open() then raise exception 'claims should look closed'; end if; end $$;
select public.claim_restaurant_direct((select id from cr limit 1), 'Eve', 'Owner', 'eve@spot.example', '', '');
rollback;

-- signed out: the check works, claiming doesn't  [refusal 2]
update feature_flags set state = 'everyone' where key = 'restaurant_claims';
begin; set local role anon;
do $$ begin if not public.claims_open() then raise exception 'claims should look open signed out'; end if; end $$;
select public.claim_restaurant_direct((select id from cr limit 1), 'Anon', '', 'a@b.example', '', '');
rollback;

-- open: E claims three restaurants without having saved any of them
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.claim_restaurant_direct(id, 'Eve', 'Owner', 'eve@spot.example', '', '')
  from (select id from cr order by source_key limit 3) x;
commit;
do $$ begin
  if (select count(*) from restaurant_claims where user_id = '00000000-0000-0000-0000-0000000000ee' and status = 'pending') <> 3
  then raise exception 'expected 3 waiting claims'; end if;
end $$;
-- re-sending one of them is fine (updates it), a 4th restaurant is refused  [refusal 3]
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.claim_restaurant_direct((select id from cr order by source_key limit 1), 'Eve B', 'Owner', '', '4165550100', '');
commit;
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.claim_restaurant_direct((select id from cr order by source_key offset 3 limit 1), 'Eve', 'Owner', 'eve@spot.example', '', '');
rollback;

delete from restaurant_claims where user_id = :'E';
update feature_flags set state = 'admin' where key = 'restaurant_claims';
