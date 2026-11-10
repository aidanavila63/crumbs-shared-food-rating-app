-- Round 60: only admins can see the data-health numbers.
-- Expected refusals: 1 (a plain member asks).
\set A '00000000-0000-0000-0000-00000000000a'
update profiles set is_admin = false where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select * from public.admin_data_health();
rollback;
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select 'admin sees six facts', count(*) = 6 from public.admin_data_health();
rollback;
update profiles set is_admin = false where id = :'A';

-- The numbers match the restaurant columns themselves, fact by fact.
create temp table dh as select * from public.restaurants r
 where exists (select 1 from public.places p where p.restaurant_id = r.id);
update profiles set is_admin = true where id = :'A';
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
create temp table got as select * from public.admin_data_health();
commit;
update profiles set is_admin = false where id = :'A';
do $$ begin if not coalesce((select total from got limit 1) = (select count(*) from dh), false) then raise exception 'data health: total matches is wrong'; end if; end $$;
do $$ begin if not coalesce((select filled from got where fact = 'hours')       = (select count(*) from dh where opening_hours is not null), false) then raise exception 'data health: hours matches is wrong'; end if; end $$;
do $$ begin if not coalesce((select filled from got where fact = 'phone')       = (select count(*) from dh where coalesce(phone, '') <> ''), false) then raise exception 'data health: phone matches is wrong'; end if; end $$;
do $$ begin if not coalesce((select filled from got where fact = 'website')     = (select count(*) from dh where coalesce(website, '') <> ''), false) then raise exception 'data health: website matches is wrong'; end if; end $$;
do $$ begin if not coalesce((select filled from got where fact = 'cuisine')     = (select count(*) from dh where coalesce(cuisine, '') <> ''), false) then raise exception 'data health: cuisine matches is wrong'; end if; end $$;
do $$ begin if not coalesce((select filled from got where fact = 'price_level') = (select count(*) from dh where price_level is not null), false) then raise exception 'data health: price matches is wrong'; end if; end $$;
do $$ begin if not coalesce((select filled from got where fact = 'address')     = (select count(*) from dh where coalesce(formatted_address, '') <> ''), false) then raise exception 'data health: address matches is wrong'; end if; end $$;
do $$ begin if not coalesce((select sum(filled) from got) > 0, false) then raise exception 'data health: some filled is wrong'; end if; end $$;
