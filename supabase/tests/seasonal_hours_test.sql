-- Part three: seasonal hours — owners and admins only, the usual hours come back after the last day.
-- Expected refusals: 2 (a member who isn't the owner; a last day in the past).
\set A '00000000-0000-0000-0000-00000000000a'
\set E '00000000-0000-0000-0000-0000000000ee'
update profiles set is_admin = false where id = :'A';
create temp table sh as select r.id from restaurants r
  where not exists (select 1 from restaurant_managers m where m.restaurant_id = r.id) order by r.id desc offset 1 limit 1;
grant select on sh to authenticated;
create temp table sh_old as select opening_hours, sources from restaurants where id = (select id from sh);
update restaurants set opening_hours = '{"utc": -300, "periods": [{"o": [1, 9, 0], "c": [1, 17, 0]}]}'::jsonb where id = (select id from sh);
insert into restaurant_managers (restaurant_id, user_id) select id, :'E' from sh;

-- A isn't the owner  [refusal 1]
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.set_seasonal_hours((select id from sh), '{"periods": []}'::jsonb, current_date + 10);
rollback;

-- a last day in the past  [refusal 2]
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.set_seasonal_hours((select id from sh), '{"periods": []}'::jsonb, current_date - 1);
rollback;

-- owner sets holiday hours (closed every day) until in 10 days; the usual hours are kept underneath
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.set_seasonal_hours((select id from sh), '{"periods": []}'::jsonb, current_date + 10);
commit;
do $$ declare h jsonb := (select opening_hours from restaurants where id = (select id from sh)); begin
  if (h->>'until')::date <> current_date + 10 or jsonb_array_length(h->'periods') <> 0 then raise exception 'special hours not saved: %', h; end if;
  if h->'regular'->'periods'->0->'o' <> '[1, 9, 0]'::jsonb then raise exception 'usual hours lost: %', h; end if;
end $$;

-- setting them again keeps the true usual hours (not the earlier special ones)
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
select public.set_seasonal_hours((select id from sh), '{"periods": [{"o": [6, 10, 0], "c": [6, 14, 0]}]}'::jsonb, current_date + 3);
commit;
do $$ begin
  if (select opening_hours->'regular'->'periods'->0->'o' from restaurants where id = (select id from sh)) <> '[1, 9, 0]'::jsonb then
    raise exception 'usual hours should survive a second change'; end if;
end $$;

-- the daily job leaves current ones alone, and puts the usual hours back once the day has passed
do $$ begin if public.end_seasonal_hours() <> 0 then raise exception 'nothing should end yet'; end if; end $$;
update restaurants set opening_hours = jsonb_set(opening_hours, '{until}', to_jsonb(current_date - 1)) where id = (select id from sh);
do $$ begin
  if public.end_seasonal_hours() <> 1 then raise exception 'one should end'; end if;
  if (select opening_hours ? 'until' from restaurants where id = (select id from sh)) then raise exception 'still special'; end if;
  if (select opening_hours->'periods'->0->'o' from restaurants where id = (select id from sh)) <> '[1, 9, 0]'::jsonb then raise exception 'usual hours not back'; end if;
end $$;

-- a signed-in non-admin can't run the job for everyone
begin; set local role authenticated; set local request.jwt.claim.sub = :'E';
do $$ begin perform public.end_seasonal_hours(); raise exception 'should refuse'; exception when others then
  if sqlerrm <> 'Admins only' then raise; end if; end $$;
rollback;

update restaurants r set opening_hours = o.opening_hours, sources = o.sources from sh_old o where r.id = (select id from sh);
delete from restaurant_managers where restaurant_id = (select id from sh) and user_id = :'E';
