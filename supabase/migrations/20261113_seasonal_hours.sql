-- Part three: seasonal / holiday hours. Safe to run twice. Run after 20261112_owner_booking.sql.
--
-- Only a restaurant's confirmed owner (or a Crumbs admin) can set them. They set the special hours
-- and the last day they apply. The usual hours are kept inside the same value, so:
--   * every screen that reads hours shows the special ones until that day,
--   * from the next day the app shows the usual hours again on its own,
--   * and the daily job puts the usual hours back in the database (end_seasonal_hours).
-- Stored shape: { utc, periods, until: 'YYYY-MM-DD', regular: { utc, periods } | null }

create or replace function public.set_seasonal_hours(target uuid, hours jsonb, last_day date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur jsonb; regular jsonb; result jsonb;
begin
  if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then
    raise exception 'Only this restaurant''s owner can set special hours';
  end if;
  if last_day is null or last_day < current_date then raise exception 'Pick a last day that''s today or later'; end if;
  if last_day > current_date + 200 then raise exception 'Special hours can last up to about 6 months'; end if;
  if hours is null or jsonb_typeof(hours->'periods') <> 'array' then raise exception 'Those hours look empty'; end if;
  select opening_hours into cur from public.restaurants where id = target for update;
  if not found then raise exception 'Restaurant not found'; end if;
  -- keep the usual hours (if special hours were already set, keep the ones underneath)
  regular := case when cur ? 'until' then cur->'regular' else cur end;
  result := jsonb_build_object('utc', coalesce(hours->'utc', cur->'utc'), 'periods', hours->'periods',
                               'until', last_day, 'regular', regular);
  update public.restaurants
     set opening_hours = result, hours_checked_at = now(), updated_at = now(),
         sources = sources || jsonb_build_object('hours', 'owner')
   where id = target;
  return result;
end $$;
revoke execute on function public.set_seasonal_hours(uuid, jsonb, date) from public, anon;
grant execute on function public.set_seasonal_hours(uuid, jsonb, date) to authenticated;

-- Back to the usual hours now (the owner ends them early), or for every place whose last day has
-- passed (the daily job; target null). Group copies follow.
create or replace function public.end_seasonal_hours(target uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  if target is not null then
    if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then
      raise exception 'Only this restaurant''s owner can change its hours';
    end if;
  elsif auth.uid() is not null and not public.is_crumbs_admin() then
    raise exception 'Admins only';
  end if;
  for r in select id, opening_hours->'regular' as regular from public.restaurants
            where opening_hours ? 'until'
              and (id = target or (target is null and (opening_hours->>'until')::date < current_date))
  loop
    update public.restaurants
       set opening_hours = case when jsonb_typeof(r.regular) = 'object' then r.regular end,
           hours_checked_at = now(), updated_at = now()
     where id = r.id;
    -- the copy trigger only pushes non-empty hours, so clear group copies that still hold the special ones
    update public.places set opening_hours = case when jsonb_typeof(r.regular) = 'object' then r.regular end
     where restaurant_id = r.id and opening_hours ? 'until';
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.end_seasonal_hours(uuid) from public, anon;
grant execute on function public.end_seasonal_hours(uuid) to authenticated; -- the daily job uses the service key
