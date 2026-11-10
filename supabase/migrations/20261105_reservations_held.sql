-- Round 56: booking links are kept but not shown until Crumbs has agreed something with the
-- restaurant. Safe to run twice. Run after 20261104_website_facts.sql.
--
-- Reading a restaurant's own website can turn up a booking link. Crumbs keeps it here, in a table
-- nobody but an admin can read, with an on/off switch that starts OFF. While it is off nothing
-- shows anywhere (place page, public page). An admin turns it on per restaurant when there is a
-- deal (commission, a perk for members...) and can note who the partner is.

create table if not exists public.restaurant_reservations (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  url text not null check (url ~* '^https?://' and char_length(url) <= 300 and url !~ '\s'),
  found_at timestamptz not null default now(),
  enabled boolean not null default false,
  partner text check (partner is null or char_length(partner) <= 80),
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id) on delete set null
);
alter table public.restaurant_reservations enable row level security;
-- No policies on purpose: only the functions below can touch it.
revoke all on public.restaurant_reservations from public, anon, authenticated;

-- Called after a website was read: keep the link (a re-read refreshes it, the switch stays as is).
create or replace function public.hold_reservation_link(target uuid, link text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.my_restaurant(target) then raise exception 'Not one of your restaurants'; end if;
  if coalesce(link, '') !~* '^https?://' or char_length(link) > 300 or link ~ '\s' then return false; end if;
  insert into public.restaurant_reservations (restaurant_id, url) values (target, link)
  on conflict (restaurant_id) do update set url = excluded.url, found_at = now();
  return true;
end $$;
revoke execute on function public.hold_reservation_link(uuid, text) from public, anon;
grant execute on function public.hold_reservation_link(uuid, text) to authenticated;

-- What the place page and the public page ask: the link, only when it has been switched on.
create or replace function public.reservation_link(target uuid)
returns text language sql stable security definer set search_path = public as $$
  select url from public.restaurant_reservations where restaurant_id = target and enabled
$$;
grant execute on function public.reservation_link(uuid) to anon, authenticated;

-- Admin: every held link, switched on or not.
create or replace function public.admin_reservations()
returns table (restaurant_id uuid, name text, city text, url text, found_at timestamptz,
               enabled boolean, partner text, enabled_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  return query
    select x.restaurant_id, r.name,
           (select s.city from public.restaurant_slugs s where s.restaurant_id = x.restaurant_id and s.is_current limit 1),
           x.url, x.found_at, x.enabled, x.partner, x.enabled_at
      from public.restaurant_reservations x join public.restaurants r on r.id = x.restaurant_id
     order by x.enabled desc, x.found_at desc
     limit 300;
end $$;
revoke execute on function public.admin_reservations() from public, anon;
grant execute on function public.admin_reservations() to authenticated;

-- Admin: switch one on or off (and say who it's agreed with).
create or replace function public.admin_set_reservations(target uuid, on_ boolean, partner_ text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  update public.restaurant_reservations set
    enabled = on_,
    partner = case when on_ then nullif(left(trim(coalesce(partner_, partner, '')), 80), '') else partner end,
    enabled_at = case when on_ then now() else null end,
    enabled_by = case when on_ then auth.uid() else null end
   where restaurant_id = target;
  if not found then raise exception 'No booking link held for that restaurant'; end if;
  return on_;
end $$;
revoke execute on function public.admin_set_reservations(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_reservations(uuid, boolean, text) to authenticated;
