-- Round 78 (Nov 17): what the Terms and Privacy Policy draft promises, built into the app.
-- Safe to run more than once; the app works before it runs (Admin → Database updates).
--   1. Agreeing to the terms (stored version + date) and the allergen tick box; owner terms on claims
--   2. Deleting your account: names cleared (not handed to the group owner), comments kept or
--      removed as you choose, your photo files removed
--   3. Report a wrong restaurant detail; reported allergen/diet details hidden until reviewed
--   4. Hibernation: last seen, technical records cleared after 12 months, quiet groups counted
--   5. Invite from the waitlist in one tap (approved on arrival)
--   6. Record of this file

-- ============================================================================================
-- 1. Agreeing to the terms (third pass: consent screen) and the owner terms
-- ============================================================================================
alter table public.profiles add column if not exists terms_version text check (char_length(terms_version) <= 40);
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists allergen_ack_at timestamptz;

-- The screen is switched on from Admin → Feature switches once the wording is final.
insert into public.feature_flags (key, state, note) values
  ('consent_screen', 'admin',
   'Ask everyone to agree to the Terms and Privacy Policy (and the allergen warning) after signing in. Admin = only admins see it, to check it first')
on conflict (key) do nothing;

create or replace function public.accept_terms(version text, allergen boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if version is null or char_length(version) > 40 then raise exception 'Bad version'; end if;
  if not allergen then raise exception 'Please tick the allergen line too'; end if;
  update public.profiles
     set terms_version = version, terms_accepted_at = now(), allergen_ack_at = coalesce(allergen_ack_at, now())
   where id = me;
  return jsonb_build_object('version', version, 'at', now());
end $$;

create or replace function public.my_terms()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', p.terms_version, 'at', p.terms_accepted_at, 'allergen_at', p.allergen_ack_at)
    from public.profiles p where p.id = (select auth.uid())
$$;

alter table public.restaurant_claims add column if not exists owner_terms_version text check (char_length(owner_terms_version) <= 40);
alter table public.restaurant_claims add column if not exists owner_terms_at timestamptz;

-- Called right after a claim is sent: the owner terms they ticked go with it.
create or replace function public.accept_owner_terms(target uuid, version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'Please sign in first'; end if;
  update public.restaurant_claims
     set owner_terms_version = left(version, 40), owner_terms_at = now()
   where restaurant_id = target and user_id = (select auth.uid()) and status = 'pending';
end $$;
revoke execute on function public.accept_terms(text, boolean), public.my_terms(), public.accept_owner_terms(uuid, text) from public, anon;
grant execute on function public.accept_terms(text, boolean), public.my_terms(), public.accept_owner_terms(uuid, text) to authenticated;

-- ============================================================================================
-- 2. Deleting your account (Privacy Policy, "How long data is kept"; Aidan, Nov 17: "the only
-- things that go are their own personal data and comments to people. Everything of data value —
-- confirmations, filled data, ratings — stays")
-- Before: places, lists, visits, plans and meals you added were handed to the group's owner (so
-- they showed the owner's name); your ratings, votes, price reports and every comment you wrote
-- were deleted with the account.
-- Now: everything of data value stays with no name on it — places, lists, visits, plans, meals,
-- your ratings (stars, points and their notes), dish scores, recipe reviews, and your yes/no
-- confirmations and price reports on restaurants. Ratings and votes move to an anonymous id
-- (a fresh random one per deleted account, linked to nothing), so totals and averages don't
-- change. Comments stay without your name unless you untick "Keep my notes and comments"
-- (ticked by default), which also clears the notes on your visits. Your personal data goes:
-- account, profile, photos, private notes, draft ratings, saved areas, settings, reactions,
-- plan answers, swipe votes, points. Photo files are removed by the server (/api/delete-account).
-- ============================================================================================
-- Ratings and confirmations can now outlive the account that made them (anonymous id).
do $$
declare spec record;
begin
  for spec in select * from (values
      ('place_ratings', 'place_ratings_user_id_fkey'), ('dish_ratings', 'dish_ratings_user_id_fkey'),
      ('home_meal_ratings', 'home_meal_ratings_user_id_fkey'), ('recipe_reviews', 'recipe_reviews_user_id_fkey'),
      ('restaurant_attr_votes', 'restaurant_attr_votes_user_id_fkey'),
      ('restaurant_dish_votes', 'restaurant_dish_votes_user_id_fkey'),
      ('restaurant_dish_prices', 'restaurant_dish_prices_user_id_fkey'),
      ('restaurant_tip_votes', 'restaurant_tip_votes_user_id_fkey')) as t(tbl, fk)
  loop
    execute format('alter table public.%I drop constraint if exists %I', spec.tbl, spec.fk);
  end loop;
end $$;
alter table public.places alter column created_by drop not null;
alter table public.lists alter column created_by drop not null;
alter table public.list_places alter column added_by drop not null;
alter table public.list_shares alter column created_by drop not null;
alter table public.place_visits alter column created_by drop not null;
alter table public.home_meals alter column created_by drop not null;
alter table public.home_meal_cooks alter column created_by drop not null;
alter table public.swipe_sessions alter column created_by drop not null;
alter table public.plans alter column created_by drop not null;
alter table public.comments alter column user_id drop not null;
do $$ begin
  alter table public.comments drop constraint if exists comments_user_id_fkey;
  alter table public.comments add constraint comments_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;
end $$;

drop function if exists public.delete_my_account();
create or replace function public.delete_my_account(keep_notes boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid());
  ghost uuid := gen_random_uuid();
  g record;
  heir uuid;
  photos int;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  -- Groups you own go to the next admin, else the longest-standing member (never a guest);
  -- a group with nobody else in it is deleted.
  for g in select id from public.groups where created_by = me loop
    heir := public.group_heir(g.id, me);
    if heir is null then
      delete from public.groups where id = g.id;
    else
      update public.groups set created_by = heir where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = heir;
    end if;
  end loop;
  -- Photos you uploaded: the links are cleared here; the server removes the files.
  with mine as (
    select name from storage.objects where bucket_id = 'crumbs-photos' and owner = me)
  select count(*) into photos from mine;
  update public.places set photo_path = null
   where photo_path in (select name from storage.objects where bucket_id = 'crumbs-photos' and owner = me);
  update public.dishes set photo_path = null
   where photo_path in (select name from storage.objects where bucket_id = 'crumbs-photos' and owner = me);
  update public.home_meals set photo_path = null
   where photo_path in (select name from storage.objects where bucket_id = 'crumbs-photos' and owner = me);
  update public.groups set cover_path = null
   where cover_path in (select name from storage.objects where bucket_id = 'crumbs-photos' and owner = me);
  delete from public.restaurant_tips where user_id = me and body is null;
  update public.restaurant_tips set photo_path = null where user_id = me;
  -- Ratings and confirmations stay, under an anonymous id (drafts were private: they go).
  delete from public.place_ratings where user_id = me and draft;
  update public.place_ratings set user_id = ghost where user_id = me;
  update public.dish_ratings set user_id = ghost where user_id = me;
  update public.home_meal_ratings set user_id = ghost where user_id = me;
  update public.recipe_reviews set user_id = ghost where user_id = me;
  update public.restaurant_attr_votes set user_id = ghost where user_id = me;
  update public.restaurant_dish_votes set user_id = ghost where user_id = me;
  update public.restaurant_dish_prices set user_id = ghost where user_id = me;
  update public.restaurant_tip_votes set user_id = ghost where user_id = me;
  -- What stays in your groups stays without your name.
  update public.places set created_by = null where created_by = me;
  update public.lists set created_by = null where created_by = me;
  update public.list_places set added_by = null where added_by = me;
  update public.list_shares set created_by = null where created_by = me;
  update public.place_visits set created_by = null,
         note = case when keep_notes then note else null end
   where created_by = me;
  update public.home_meals set created_by = null where created_by = me;
  update public.home_meal_cooks set created_by = null where created_by = me;
  update public.swipe_sessions set created_by = null where created_by = me;
  update public.plans set created_by = null where created_by = me;
  update public.dishes set created_by = null where created_by = me;
  update public.place_facts set updated_by = null where updated_by = me;
  if not keep_notes then delete from public.comments where user_id = me; end if;
  delete from auth.users where id = me;
  return jsonb_build_object('photos', photos, 'kept_notes', keep_notes);
end $$;
revoke execute on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;

-- The server asks which photo files to remove before deleting the account.
create or replace function public.my_photo_files()
returns setof text language sql stable security definer set search_path = public as $$
  select name from storage.objects where bucket_id = 'crumbs-photos' and owner = (select auth.uid())
$$;
revoke execute on function public.my_photo_files() from public, anon;
grant execute on function public.my_photo_files() to authenticated;

-- ============================================================================================
-- 3. Report a wrong restaurant detail (liability: "act on reports quickly")
-- Anyone let in can report a detail on a restaurant (hours, phone, a Good to know answer, a
-- dish's allergen or diet tag…). Reported allergen and diet details are hidden from everyone
-- until a Crumbs admin has looked (Admin → Reports). Who reported is only visible to admins.
-- ============================================================================================
create table if not exists public.detail_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  detail text not null check (char_length(detail) between 1 and 80),
  sensitive boolean not null default false,
  note text check (note is null or char_length(note) <= 300),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists detail_reports_open_idx on public.detail_reports (restaurant_id) where status = 'open';
create index if not exists detail_reports_user_idx on public.detail_reports (user_id);
create index if not exists detail_reports_resolved_by_idx on public.detail_reports (resolved_by);
alter table public.detail_reports enable row level security;
drop policy if exists detail_reports_insert on public.detail_reports;
create policy detail_reports_insert on public.detail_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and public.is_let_in((select auth.uid())));
drop policy if exists detail_reports_read on public.detail_reports;
create policy detail_reports_read on public.detail_reports for select to authenticated
  using (user_id = (select auth.uid()) or public.is_crumbs_admin());
drop policy if exists detail_reports_admin on public.detail_reports;
create policy detail_reports_admin on public.detail_reports for update to authenticated
  using (public.is_crumbs_admin()) with check (public.is_crumbs_admin());
drop trigger if exists crumbs_rate_limit on public.detail_reports;
create trigger crumbs_rate_limit before insert on public.detail_reports
  for each row execute function public.crumbs_rate_limit(20);

-- Which details of a restaurant are waiting for a look (no names). Anyone may ask.
create or replace function public.reported_details(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('detail', detail, 'sensitive', sensitive)), '[]')
    from public.detail_reports where restaurant_id = target and status = 'open'
$$;
revoke execute on function public.reported_details(uuid) from public;
grant execute on function public.reported_details(uuid) to anon, authenticated;

create or replace function public.admin_reports()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can see this'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', d.id, 'restaurant_id', d.restaurant_id, 'restaurant', r.name, 'detail', d.detail,
            'sensitive', d.sensitive, 'note', d.note, 'by', p.display_name, 'created_at', d.created_at)
          order by d.sensitive desc, d.created_at), '[]')
            from public.detail_reports d
            join public.restaurants r on r.id = d.restaurant_id
            left join public.profiles p on p.id = d.user_id
           where d.status = 'open');
end $$;
create or replace function public.resolve_report(report uuid, outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can do this'; end if;
  if outcome not in ('fixed', 'dismissed') then raise exception 'fixed or dismissed'; end if;
  -- Every open report on the same detail is answered together.
  update public.detail_reports d set status = outcome, resolved_by = (select auth.uid()), resolved_at = now()
   from public.detail_reports r
   where r.id = report and d.restaurant_id = r.restaurant_id and d.detail = r.detail and d.status = 'open';
end $$;
revoke execute on function public.admin_reports(), public.resolve_report(uuid, text) from public, anon;
grant execute on function public.admin_reports(), public.resolve_report(uuid, text) to authenticated;

-- ============================================================================================
-- 4. Hibernation, not deletion (Privacy Policy)
-- profiles.last_seen_on is set (once a day at most) when the app opens. After 12 months without
-- it, an account's technical records go (phones' push keys, error reports, usage counters);
-- nothing the person wrote is touched. Groups where nobody has opened Crumbs for 12 months are
-- counted for Admin; shrinking their photos waits for the 30-day warning email (needs email).
-- People who haven't opened Crumbs since this change count from today, not from sign-up.
-- ============================================================================================
alter table public.profiles add column if not exists last_seen_on date;

create or replace function public.seen_today()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_on = current_date
   where id = (select auth.uid()) and last_seen_on is distinct from current_date
$$;
revoke execute on function public.seen_today() from public, anon;
grant execute on function public.seen_today() to authenticated;

create or replace function public.hibernate_quiet_accounts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  since date := (select coalesce(min(ran_at)::date, current_date) from public.crumbs_migrations where name = '20261117_round78');
  quiet uuid[];
  keys int; errors int; counts int;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and not public.is_crumbs_admin() then
    raise exception 'Not allowed';
  end if;
  select coalesce(array_agg(id), '{}') into quiet from public.profiles
   where coalesce(last_seen_on, since) < current_date - interval '12 months';
  delete from public.push_subscriptions where user_id = any (quiet);
  get diagnostics keys = row_count;
  delete from public.client_errors where user_id = any (quiet);
  get diagnostics errors = row_count;
  delete from public.usage_counts where user_id = any (quiet);
  get diagnostics counts = row_count;
  delete from public.rate_counters where who = any (select q::text from unnest(quiet) q);
  return jsonb_build_object('accounts', coalesce(array_length(quiet, 1), 0), 'push_keys', keys,
                            'errors', errors, 'usage', counts);
end $$;
revoke execute on function public.hibernate_quiet_accounts() from public, anon;
grant execute on function public.hibernate_quiet_accounts() to authenticated;

create or replace function public.admin_quiet_groups()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since date := (select coalesce(min(ran_at)::date, current_date) from public.crumbs_migrations where name = '20261117_round78');
begin
  if not public.is_crumbs_admin() then raise exception 'Only a Crumbs admin can see this'; end if;
  return jsonb_build_object(
    'quiet_people', (select count(*) from public.profiles
                      where coalesce(last_seen_on, since) < current_date - interval '12 months'),
    'quiet_groups', (select count(*) from public.groups g
                      where not exists (select 1 from public.group_members m join public.profiles p on p.id = m.user_id
                                         where m.group_id = g.id
                                           and coalesce(p.last_seen_on, since) >= current_date - interval '12 months')),
    'seen_this_week', (select count(*) from public.profiles where last_seen_on >= current_date - 7));
end $$;
revoke execute on function public.admin_quiet_groups() from public, anon;
grant execute on function public.admin_quiet_groups() to authenticated;

-- ============================================================================================
-- 5. Invite from the waitlist in one tap (third pass #18)
-- The gatekeeper taps Invite on a waitlist email: when that email signs in it is let in
-- straight away (no "ask to join"), and it leaves the waitlist. The invitation email goes out
-- when email sending is set up; until then Admin offers the message to copy.
-- ============================================================================================
alter table public.waitlist add column if not exists invited_at timestamptz;
create table if not exists public.preapproved_emails (
  email text primary key check (char_length(email) <= 200),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists preapproved_emails_invited_by_idx on public.preapproved_emails (invited_by);
alter table public.preapproved_emails enable row level security;
drop policy if exists preapproved_admin on public.preapproved_emails;
create policy preapproved_admin on public.preapproved_emails for select to authenticated using (public.is_gatekeeper());

create or replace function public.invite_from_waitlist(entry uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.waitlist; person uuid;
begin
  if not public.is_gatekeeper() then raise exception 'Only the person who lets people in can do this'; end if;
  select * into w from public.waitlist where id = entry;
  if w.id is null then raise exception 'That email isn''t on the waitlist any more'; end if;
  insert into public.preapproved_emails (email, invited_by) values (lower(w.email), (select auth.uid()))
  on conflict (email) do nothing;
  update public.waitlist set invited_at = now() where id = entry;
  -- Already signed in and waiting? Let them in now.
  select u.id into person from auth.users u where lower(u.email) = lower(w.email);
  if person is not null then
    update public.profiles set access = 'approved' where id = person and access is distinct from 'approved';
    delete from public.access_requests where user_id = person and group_id is null;
  end if;
  return jsonb_build_object('email', w.email, 'already_signed_up', person is not null);
end $$;
revoke execute on function public.invite_from_waitlist(uuid) from public, anon;
grant execute on function public.invite_from_waitlist(uuid) to authenticated;

-- On arrival: a new account whose email was invited from the waitlist starts let in.
create or replace function public.preapproved_on_arrival()
returns trigger language plpgsql security definer set search_path = public as $$
declare mail text := (select lower(email) from auth.users where id = new.id);
begin
  if mail is not null and exists (select 1 from public.preapproved_emails where email = mail) then
    new.access := 'approved';
    delete from public.preapproved_emails where email = mail;
    delete from public.waitlist where lower(email) = mail;
  end if;
  return new;
end $$;
revoke execute on function public.preapproved_on_arrival() from public, anon, authenticated;
drop trigger if exists preapproved_on_arrival on public.profiles;
create trigger preapproved_on_arrival before insert on public.profiles
  for each row execute function public.preapproved_on_arrival();

-- ============================================================================================
-- 6. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261117_round78')
on conflict (name) do nothing;
