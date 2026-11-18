-- Round 94 (Nov 18): O4 holiday prompts + U15 holiday notices. Special hours can now be set ahead
-- (a first day as well as a last day: e.g. closed on Christmas Day only); places show them up to
-- two weeks before. Safe to run more than once; until it runs, special hours start the day
-- they're set, as before.

drop function if exists public.set_seasonal_hours(uuid, jsonb, date);
create or replace function public.set_seasonal_hours(target uuid, hours jsonb, last_day date, first_day date default null)
returns jsonb language plpgsql security definer set search_path = public set timezone = 'America/Toronto' as $$
declare
  cur jsonb;
  regular jsonb;
  result jsonb;
  today date := (now() at time zone 'America/Toronto')::date;
  starts date := coalesce(first_day, today);
begin
  if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then
    raise exception 'Only this restaurant''s owner can set special hours';
  end if;
  if last_day is null or last_day < today then raise exception 'Pick a last day that''s today or later'; end if;
  if starts < today then raise exception 'Pick a first day that''s today or later'; end if;
  if starts > last_day then raise exception 'The first day has to come before the last day'; end if;
  if last_day > today + 200 then raise exception 'Special hours can be set up to about 6 months ahead'; end if;
  if hours is null or jsonb_typeof(hours->'periods') <> 'array' then raise exception 'Those hours look empty'; end if;
  select opening_hours into cur from public.restaurants where id = target for update;
  if not found then raise exception 'Restaurant not found'; end if;
  -- keep the usual hours (if special hours were already set, keep the ones underneath)
  regular := case when cur ? 'until' then cur->'regular' else cur end;
  result := jsonb_build_object('utc', coalesce(hours->'utc', cur->'utc', regular->'utc'), 'periods', hours->'periods',
                               'until', last_day, 'regular', regular)
            || case when starts > today then jsonb_build_object('from', starts) else '{}'::jsonb end;
  update public.restaurants
     set opening_hours = result, hours_checked_at = now(), updated_at = now(),
         sources = sources || jsonb_build_object('hours', 'owner')
   where id = target;
  return result;
end $$;
revoke execute on function public.set_seasonal_hours(uuid, jsonb, date, date) from public, anon;
grant execute on function public.set_seasonal_hours(uuid, jsonb, date, date) to authenticated;

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261130_round94') on conflict (name) do nothing;
