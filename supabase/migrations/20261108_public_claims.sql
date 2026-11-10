-- Part two: owners can claim their page straight from the public /r/… page.
-- Before this, claiming needed the restaurant saved to one of your groups, which a new owner
-- (invite-only Crumbs, no group yet) could never do. Admins still review every claim.
-- Safe to run twice.

-- Are claims open right now? Readable signed out, so the public page knows whether to offer it.
-- 'everyone' = open; 'admin' = only admins (testing); 'off' or anything else = closed.
create or replace function public.claims_open()
returns boolean language sql stable security definer set search_path = public as $$
  select case coalesce((select state from public.feature_flags where key = 'restaurant_claims'), 'admin')
           when 'everyone' then true
           when 'admin' then auth.uid() is not null and public.is_crumbs_admin()
           else false end
$$;
grant execute on function public.claims_open() to anon, authenticated;

create or replace function public.claim_restaurant_direct(target uuid, contact text, job text, mail text, tel text, evidence text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.claims_open() then raise exception 'Claims aren''t open yet'; end if;
  if not exists (select 1 from public.restaurants where id = target) then raise exception 'Restaurant not found'; end if;
  if coalesce(trim(contact), '') = '' or (coalesce(trim(mail), '') = '' and coalesce(trim(tel), '') = '') then
    raise exception 'Add your name and an email or phone we can reach you on';
  end if;
  -- one person can't flood the review queue: at most 3 claims waiting for other restaurants
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
