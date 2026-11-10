-- Part three: the restaurant decides about its booking button. Safe to run twice.
-- Run after 20261111_dish_of_week.sql.
--
-- A restaurant's confirmed owner (claim approved by an admin) can add their booking link and switch
-- the "Book a table" button on or off themselves. If the owner switches it off, an admin can't
-- switch it back on — no restaurant gets a booking button it doesn't want.

alter table public.restaurant_reservations add column if not exists owner_off boolean not null default false;
-- An owner can say "no booking button" before Crumbs ever found a link, so the link may be empty;
-- it can only be switched on with a link.
alter table public.restaurant_reservations alter column url drop not null;
alter table public.restaurant_reservations drop constraint if exists restaurant_reservations_on_needs_url;
alter table public.restaurant_reservations add constraint restaurant_reservations_on_needs_url check (not enabled or url is not null);

-- What the owner sees about their own booking button.
create or replace function public.owner_reservation(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages_restaurant(target) then raise exception 'Only this restaurant''s owner can see that'; end if;
  return (select jsonb_build_object('url', url, 'enabled', enabled, 'owner_off', owner_off)
            from public.restaurant_reservations where restaurant_id = target);
end $$;
revoke execute on function public.owner_reservation(uuid) from public, anon;
grant execute on function public.owner_reservation(uuid) to authenticated;

-- The owner sets their link (optional) and switches the button on or off.
create or replace function public.owner_set_reservation(target uuid, link text, on_ boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare clean text := nullif(trim(coalesce(link, '')), '');
begin
  if not public.manages_restaurant(target) then raise exception 'Only this restaurant''s owner can change that'; end if;
  if clean is not null and (clean !~* '^https?://' or char_length(clean) > 300 or clean ~ '\s') then
    raise exception 'That doesn''t look like a web link (it should start with https://)';
  end if;
  if on_ and clean is null and not exists (select 1 from public.restaurant_reservations where restaurant_id = target and url is not null) then
    raise exception 'Add your booking link first';
  end if;
  insert into public.restaurant_reservations (restaurant_id, url, enabled, owner_off, enabled_at, enabled_by)
  values (target, clean, on_, not on_, case when on_ then now() end, case when on_ then auth.uid() end)
  on conflict (restaurant_id) do update set
    url = coalesce(clean, public.restaurant_reservations.url),
    found_at = case when clean is not null then now() else public.restaurant_reservations.found_at end,
    enabled = on_,
    owner_off = not on_,
    enabled_at = case when on_ then now() else null end,
    enabled_by = case when on_ then auth.uid() else null end;
  return on_;
end $$;
revoke execute on function public.owner_set_reservation(uuid, text, boolean) from public, anon;
grant execute on function public.owner_set_reservation(uuid, text, boolean) to authenticated;

-- Admin switch: same as before, but it can't override an owner who said no.
create or replace function public.admin_set_reservations(target uuid, on_ boolean, partner_ text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  if on_ and exists (select 1 from public.restaurant_reservations where restaurant_id = target and owner_off) then
    raise exception 'The restaurant''s owner switched booking off';
  end if;
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
