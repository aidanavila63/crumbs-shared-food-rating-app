-- Part three: nobody runs a restaurant page without Crumbs saying yes. Safe to run twice.
-- Run after 20261108_public_claims.sql.
--
-- Already true before this file: claims only arrive through claim_restaurant /
-- claim_restaurant_direct (no table access), they always start "pending", and only an admin's
-- review_claim(…, true) adds someone to restaurant_managers.
-- This file closes two gaps:
--   1. Re-sending a claim for a page you already run used to set your claim back to pending
--      (you kept the page, but the admin list showed a stale request). Now it's refused.
--   2. Rejecting a claim that had been approved left the person running the page. Now a
--      rejection also takes the page away, so an admin can undo a mistake from the same list.

create or replace function public.claim_guard(target uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.restaurant_managers where restaurant_id = target and user_id = auth.uid()) then
    raise exception 'You already run this page';
  end if;
end $$;
revoke execute on function public.claim_guard(uuid) from public, anon, authenticated;

create or replace function public.claim_restaurant(target uuid, contact text, job text, mail text, tel text, evidence text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.my_restaurant(target) then raise exception 'Save this restaurant first, then claim it'; end if;
  perform public.claim_guard(target);
  insert into public.restaurant_claims (restaurant_id, user_id, contact_name, role, email, phone, proof)
  values (target, auth.uid(), trim(contact), nullif(trim(job), ''), nullif(trim(mail), ''), nullif(trim(tel), ''), nullif(trim(evidence), ''))
  on conflict (restaurant_id, user_id) do update set contact_name = excluded.contact_name, role = excluded.role,
    email = excluded.email, phone = excluded.phone, proof = excluded.proof, status = 'pending', created_at = now();
end $$;

create or replace function public.claim_restaurant_direct(target uuid, contact text, job text, mail text, tel text, evidence text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.claims_open() then raise exception 'Claims aren''t open yet'; end if;
  if not exists (select 1 from public.restaurants where id = target) then raise exception 'Restaurant not found'; end if;
  perform public.claim_guard(target);
  if coalesce(trim(contact), '') = '' or (coalesce(trim(mail), '') = '' and coalesce(trim(tel), '') = '') then
    raise exception 'Add your name and an email or phone we can reach you on';
  end if;
  if (select count(*) from public.restaurant_claims
       where user_id = auth.uid() and status = 'pending' and restaurant_id <> target) >= 3 then
    raise exception 'You already have 3 claims waiting — we''ll get to them soon';
  end if;
  insert into public.restaurant_claims (restaurant_id, user_id, contact_name, role, email, phone, proof)
  values (target, auth.uid(), trim(contact), nullif(trim(job), ''), nullif(trim(mail), ''), nullif(trim(tel), ''), nullif(trim(evidence), ''))
  on conflict (restaurant_id, user_id) do update set contact_name = excluded.contact_name, role = excluded.role,
    email = excluded.email, phone = excluded.phone, proof = excluded.proof, status = 'pending', created_at = now();
end $$;
revoke execute on function public.claim_restaurant_direct(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.claim_restaurant_direct(uuid, text, text, text, text, text) to authenticated;

create or replace function public.review_claim(claim uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.restaurant_claims;
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  update public.restaurant_claims set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now()
   where id = claim returning * into c;
  if c.id is null then return; end if;
  if approve then
    insert into public.restaurant_managers (restaurant_id, user_id) values (c.restaurant_id, c.user_id) on conflict do nothing;
  else
    delete from public.restaurant_managers where restaurant_id = c.restaurant_id and user_id = c.user_id;
  end if;
end $$;
