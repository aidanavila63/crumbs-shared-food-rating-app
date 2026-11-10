-- Part three: only Crumbs makes someone the owner of a page, and Crumbs can take it back.
-- Expected refusals: 2 (re-claiming a page you already run; a non-admin approving a claim).
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
update feature_flags set state = 'everyone' where key = 'restaurant_claims';
update profiles set is_admin = true where id = :'A';
create temp table cs as select r.id from restaurants r
  where not exists (select 1 from restaurant_managers m where m.restaurant_id = r.id) order by r.id limit 1;
grant select on cs to authenticated;

-- E claims: waiting, not an owner yet
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.claim_restaurant_direct((select id from cs), 'Eve', 'Owner', 'eve@spot.example', '', '');
commit;
do $$ begin
  if exists (select 1 from restaurant_managers where user_id = '00000000-0000-0000-0000-0000000000ee') then
    raise exception 'a claim alone must not make an owner'; end if;
end $$;

-- E can't approve their own claim  [refusal 1]
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.review_claim((select id from restaurant_claims where user_id = :'E'), true);
rollback;

-- A (admin) approves → owner
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.review_claim((select id from restaurant_claims where user_id = :'E'), true);
commit;
do $$ begin
  if not exists (select 1 from restaurant_managers where user_id = '00000000-0000-0000-0000-0000000000ee') then
    raise exception 'approval should make E an owner'; end if;
  if not (select owner_verified from restaurants where id = (select id from cs)) then
    raise exception 'page should show as verified'; end if;
end $$;

-- E sends the claim again: refused, stays approved  [refusal 2]
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.claim_restaurant_direct((select id from cs), 'Eve', 'Owner', 'eve@spot.example', '', '');
rollback;
do $$ begin
  if (select status from restaurant_claims where user_id = '00000000-0000-0000-0000-0000000000ee') <> 'approved' then
    raise exception 'claim should still be approved'; end if;
end $$;

-- A rejects it after all → no longer an owner, page no longer verified
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.review_claim((select id from restaurant_claims where user_id = :'E'), false);
commit;
do $$ begin
  if exists (select 1 from restaurant_managers where user_id = '00000000-0000-0000-0000-0000000000ee') then
    raise exception 'rejecting should take the page away'; end if;
  if (select owner_verified from restaurants where id = (select id from cs)) then
    raise exception 'page should not show as verified'; end if;
end $$;

delete from restaurant_claims where user_id = :'E';
update feature_flags set state = 'admin' where key = 'restaurant_claims';
