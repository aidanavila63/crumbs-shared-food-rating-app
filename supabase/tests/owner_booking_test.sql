-- Part three: the owner decides about the booking button; an admin can't override a "no".
-- Expected refusals: 3 (a non-owner sets it; a bad link; the admin switches on after the owner said no).
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
update profiles set is_admin = true where id = :'A';
create temp table ob as select r.id from restaurants r
  where not exists (select 1 from restaurant_managers m where m.restaurant_id = r.id) order by r.id desc limit 1;
grant select on ob to authenticated, anon;
delete from restaurant_reservations where restaurant_id = (select id from ob);
insert into restaurant_managers (restaurant_id, user_id) select id, :'E' from ob;

-- A isn't the owner  [refusal 1]
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.owner_set_reservation((select id from ob), 'https://book.example/x', true);
rollback;

-- not a web link  [refusal 2]
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.owner_set_reservation((select id from ob), 'call us', true);
rollback;

-- owner adds a link and switches it on: the public sees it
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.owner_set_reservation((select id from ob), 'https://book.example/x', true);
commit;
begin; set local role anon;
do $$ begin if public.reservation_link((select id from ob)) is distinct from 'https://book.example/x' then raise exception 'should show when on'; end if; end $$;
rollback;

-- owner switches it off (no link needed): gone
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.owner_set_reservation((select id from ob), null, false);
commit;
do $$ begin if public.reservation_link((select id from ob)) is not null then raise exception 'should be hidden when off'; end if; end $$;

-- admin can't switch it back on  [refusal 3]
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.admin_set_reservations((select id from ob), true, 'OpenTable');
rollback;
do $$ begin if public.reservation_link((select id from ob)) is not null then raise exception 'admin must not override the owner'; end if; end $$;

-- owner reads their own state
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
do $$ begin if (public.owner_reservation((select id from ob))->>'owner_off')::boolean is not true then raise exception 'owner should see it off'; end if; end $$;
commit;

delete from restaurant_reservations where restaurant_id = (select id from ob);
delete from restaurant_managers where restaurant_id = (select id from ob) and user_id = :'E';
update profiles set is_admin = false where id = :'A';
