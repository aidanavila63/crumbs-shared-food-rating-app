-- Part three: "Might be closed" banner. Safe to run twice. Run after 20261109_claims_safety.sql.
--
-- When people from at least 2 different groups said in the last 60 days that a place looked closed
-- (Info → Status → Temporarily closed / Closed for good), but the page still says it's open, the
-- place page and the public page show a banner: "Might be closed — check before you go".
-- It never changes the page itself (that still needs the usual agreement or the owner).
-- An "it's open" answer newer than every closed report clears the banner.
-- Only counts are shared, never who said it.

create or replace function public.maybe_closed(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select id, business_status from public.restaurants where id = target
  ),
  recent as (
    select f.user_id, f.value #>> '{}' as said, f.created_at
      from public.restaurant_facts f
     where f.restaurant_id = target and f.field = 'status' and f.created_at > now() - interval '60 days'
  ),
  open_at as (select max(created_at) as at from recent where said = 'OPERATIONAL'),
  closed as (
    select distinct p.group_id, x.created_at
      from recent x
      join public.group_members gm on gm.user_id = x.user_id
      join public.places p on p.group_id = gm.group_id and p.restaurant_id = target
     where x.said in ('CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY')
       and x.created_at > coalesce((select at from open_at), '-infinity'::timestamptz)
  )
  select case when (select count(distinct group_id) from closed) >= 2
              and coalesce((select business_status from r), 'OPERATIONAL') = 'OPERATIONAL'
         then jsonb_build_object('groups', (select count(distinct group_id) from closed),
                                 'last', (select max(created_at) from closed)::date)
         end
$$;
revoke execute on function public.maybe_closed(uuid) from public;
grant execute on function public.maybe_closed(uuid) to anon, authenticated;
