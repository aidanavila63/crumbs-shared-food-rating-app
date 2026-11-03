-- Crumbs: every new person needs Aidan's OK (Nov 2). Run after 20261102_invites.sql. Safe to re-run.
--
-- Anyone who signs in — with an invite link or without — waits until the person who lets people
-- into Crumbs says yes (the "gatekeeper": Aidan's account, see the line at the bottom). After that,
-- the group they were invited to follows its own rule (straight in, or the owner lets each in).
-- Everyone already in a group, admins and Builders count as let in already.
-- Feature switch `new_people` (Admin → switches):
--   Admin    = new people wait for the gatekeeper's OK (the default)
--   Everyone = anyone who signs in is let in (open sign-up)
--   Off      = Crumbs isn't taking new people (no new requests)

-- ---------------------------------------------------------------------------------------------
-- 1. Who's let in, and who lets people in
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists access text not null default 'pending';
alter table public.profiles add column if not exists lets_people_in boolean not null default false;
do $$ begin
  alter table public.profiles add constraint profiles_access_check
    check (access in ('pending', 'approved', 'declined'));
exception when duplicate_object then null; end $$;

-- Grandfather (only the first time this runs, before anyone has been answered): people already in
-- a group, admins and Builders are let in.
do $$ begin
  if not exists (select 1 from public.profiles where access <> 'pending') then
    update public.profiles p set access = 'approved'
     where p.is_admin or p.is_builder
        or exists (select 1 from public.group_members m where m.user_id = p.id);
  end if;
end $$;

insert into public.feature_flags (key, state, note) values
  ('new_people', 'admin',
   'Who gets into Crumbs. Admin = new people wait for your OK (Group tab → Wants to join Crumbs); Everyone = anyone who signs in; Off = not taking new people')
on conflict (key) do nothing;

create or replace function public.new_people_mode()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select state from public.feature_flags where key = 'new_people'), 'admin')
$$;

-- Let in = approved, an admin or Builder, or open sign-up is on.
create or replace function public.is_let_in(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and (
    public.new_people_mode() = 'everyone'
    or coalesce((select p.access = 'approved' or p.is_admin or p.is_builder
                   from public.profiles p where p.id = uid), false))
$$;

-- The gatekeeper: whoever has lets_people_in (Aidan). If nobody has it yet, admins do it.
create or replace function public.is_gatekeeper(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and case
    when exists (select 1 from public.profiles where lets_people_in)
      then coalesce((select p.lets_people_in from public.profiles p where p.id = uid), false)
    else coalesce((select p.is_admin from public.profiles p where p.id = uid), false)
  end
$$;

create or replace function public.gatekeeper_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
   where case when exists (select 1 from public.profiles where lets_people_in) then p.lets_people_in
              else p.is_admin end
$$;

revoke execute on function public.new_people_mode(), public.is_let_in(uuid), public.is_gatekeeper(uuid),
  public.gatekeeper_ids() from public, anon;
grant execute on function public.new_people_mode(), public.is_let_in(uuid), public.is_gatekeeper(uuid)
  to authenticated;

-- Nobody lets themselves in: access changes only through answer_access() (or the SQL editor), and
-- lets_people_in only from the SQL editor. New profiles always start waiting.
create or replace function public.protect_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.access := 'pending';
    new.lets_people_in := false;
    return new;
  end if;
  if new.lets_people_in is distinct from old.lets_people_in then
    raise exception 'lets_people_in can only be changed from the Supabase SQL editor';
  end if;
  if new.access is distinct from old.access
     and coalesce(current_setting('crumbs.access_sync', true), '') <> 'on' then
    raise exception 'Only the person who lets people into Crumbs can change that';
  end if;
  return new;
end $$;
drop trigger if exists protect_access on public.profiles;
create trigger protect_access before insert or update on public.profiles
  for each row execute function public.protect_access();

-- Nobody joins or asks to join a group until they're let in, whichever way they try.
create or replace function public.require_let_in()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_let_in(new.user_id) then return new; end if;
  raise exception 'Crumbs lets new people in one by one — you’ll get in once you’re let in';
end $$;
drop trigger if exists require_let_in on public.group_members;
create trigger require_let_in before insert on public.group_members
  for each row execute function public.require_let_in();
drop trigger if exists require_let_in on public.group_join_requests;
create trigger require_let_in before insert on public.group_join_requests
  for each row execute function public.require_let_in();

-- ---------------------------------------------------------------------------------------------
-- 2. Asking to get into Crumbs
-- ---------------------------------------------------------------------------------------------
-- One request per person: why they're here (optional note) and the invite they came with, if any.
create table if not exists public.access_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  role text not null default 'member' check (role in ('member', 'guest')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.access_requests enable row level security;
drop policy if exists access_requests_read on public.access_requests;
create policy access_requests_read on public.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_gatekeeper());
-- Writes go through the functions below only.

-- Anyone waiting on a group from before this file ran: move it into their Crumbs request.
insert into public.access_requests (user_id, group_id, role, created_at)
select distinct on (r.user_id) r.user_id, r.group_id, r.role, r.created_at
  from public.group_join_requests r join public.profiles p on p.id = r.user_id
 where not public.is_let_in(r.user_id)
 order by r.user_id, r.created_at desc
on conflict (user_id) do nothing;
delete from public.group_join_requests r using public.profiles p
 where p.id = r.user_id and not public.is_let_in(r.user_id);

-- Where you stand: approved | pending | declined, plus whether you've asked and who decides.
create or replace function public.my_access()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.access_requests;
begin
  if me is null then return null; end if;
  select * into r from public.access_requests where user_id = me;
  return jsonb_build_object(
    'status', case when public.is_let_in(me) then 'approved'
                   else coalesce((select access from public.profiles where id = me), 'pending') end,
    'mode', public.new_people_mode(),
    'asked', r.user_id is not null,
    'note', r.note,
    'group', (select g.name from public.groups g where g.id = r.group_id),
    'gatekeeper', (select split_part(coalesce(p.display_name, ''), ' ', 1)
                     from public.profiles p where p.id in (select public.gatekeeper_ids())
                    order by p.created_at limit 1),
    'is_gatekeeper', public.is_gatekeeper(me));
end $$;

-- Ask (or update your note). With an invite code, the group comes along.
create or replace function public.request_access(code text default null, note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  found record;
  gid uuid;
  as_role text := 'member';
  clean_note text := nullif(left(trim(coalesce(note, '')), 300), '');
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if public.is_let_in(me) then return jsonb_build_object('status', 'approved'); end if;
  if (select access from public.profiles where id = me) = 'declined' then
    raise exception 'Crumbs isn’t open to this account right now';
  end if;
  if public.new_people_mode() = 'off' then
    raise exception 'Crumbs isn’t taking new people right now — join the waitlist instead';
  end if;
  if coalesce(code, '') <> '' then
    select * into found from public.group_for_code(code);
    gid := (found.g).id;
    if gid is not null and found.as_guest then as_role := 'guest'; end if;
  end if;
  insert into public.access_requests (user_id, group_id, role, note)
    values (me, gid, as_role, clean_note)
  on conflict (user_id) do update set
    group_id = coalesce(excluded.group_id, access_requests.group_id),
    role = case when excluded.group_id is not null then excluded.role else access_requests.role end,
    note = coalesce(excluded.note, access_requests.note);
  return jsonb_build_object('status', 'pending');
end $$;

create or replace function public.cancel_access_request()
returns void language sql security definer set search_path = public as $$
  delete from public.access_requests where user_id = auth.uid()
$$;

revoke execute on function public.my_access(), public.request_access(text, text),
  public.cancel_access_request() from public, anon;
grant execute on function public.my_access(), public.request_access(text, text),
  public.cancel_access_request() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. The gatekeeper's list: yes or no
-- ---------------------------------------------------------------------------------------------
create or replace function public.access_request_list()
returns table (user_id uuid, display_name text, email text, note text, group_name text, role text,
               created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, coalesce(p.display_name, 'Someone'), u.email::text, r.note, g.name, r.role, r.created_at
    from public.access_requests r
    join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.groups g on g.id = r.group_id
   where public.is_gatekeeper() and p.access = 'pending'
   order by r.created_at
$$;

-- People you said no to (newest first), in case you change your mind.
create or replace function public.declined_people()
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.display_name, 'Someone'), u.email::text
    from public.profiles p left join auth.users u on u.id = p.id
   where public.is_gatekeeper() and p.access = 'declined'
   order by p.created_at desc
   limit 30
$$;

-- Yes: they're in Crumbs, and the group they were invited to follows its own rule (straight in,
-- or a request the owner answers). No: they can't ask again until you let them in from the list.
-- Returns {status: approved | joined | requested | declined, group_id?, group?}.
create or replace function public.answer_access(person uuid, accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.access_requests;
  g public.groups;
  result jsonb;
begin
  if not public.is_gatekeeper() then raise exception 'Only the person who lets people into Crumbs can do that'; end if;
  if not exists (select 1 from public.profiles where id = person) then raise exception 'That person is gone'; end if;
  perform set_config('crumbs.access_sync', 'on', true);
  update public.profiles set access = case when accept then 'approved' else 'declined' end where id = person;
  perform set_config('crumbs.access_sync', '', true);
  select * into r from public.access_requests where user_id = person;
  delete from public.access_requests where user_id = person;
  if not accept then return jsonb_build_object('status', 'declined'); end if;
  result := jsonb_build_object('status', 'approved');
  if r.group_id is not null then
    select * into g from public.groups where id = r.group_id;
  end if;
  if g.id is null or exists (select 1 from public.group_members where group_id = g.id and user_id = person) then
    return result;
  end if;
  if g.invite_approval then
    insert into public.group_join_requests (group_id, user_id, role, via) values (g.id, person, r.role, 'invite')
    on conflict (group_id, user_id) do update set role = excluded.role, via = 'invite';
    return jsonb_build_object('status', 'requested', 'group_id', g.id, 'group', g.name);
  end if;
  insert into public.group_members (group_id, user_id, role) values (g.id, person, r.role)
  on conflict (group_id, user_id) do nothing;
  return jsonb_build_object('status', 'joined', 'group_id', g.id, 'group', g.name);
end $$;

revoke execute on function public.access_request_list(), public.declined_people(),
  public.answer_access(uuid, boolean) from public, anon;
grant execute on function public.access_request_list(), public.declined_people(),
  public.answer_access(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Invites and starting groups check it too
-- ---------------------------------------------------------------------------------------------
-- Starting a group: you must be let in. Invite-only ('admin'): being let in is enough (Aidan's OK
-- replaces "already in a group").
create or replace function public.can_start_group()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_let_in(auth.uid()) and (
    public.is_builder_user(auth.uid())
    or coalesce((select state from public.feature_flags where key = 'start_groups'), 'everyone') = 'everyone'
    or (coalesce((select state from public.feature_flags where key = 'start_groups'), 'everyone') = 'admin'
        and (exists (select 1 from public.group_members where user_id = auth.uid())
             or (select access from public.profiles where id = auth.uid()) = 'approved'))
  )
$$;

-- The invite page also says where you stand with Crumbs itself.
create or replace function public.invite_preview(code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  found record;
  g public.groups;
  me uuid := auth.uid();
  is_member boolean := false;
begin
  select * into found from public.group_for_code(code);
  g := found.g;
  if g.id is null then return null; end if;
  is_member := me is not null and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = me);
  return jsonb_build_object(
    'name', g.name, 'emoji', g.emoji, 'color', g.color, 'description', g.description,
    'guest', found.as_guest, 'approval', g.invite_approval,
    'owner', (select split_part(coalesce(p.display_name, ''), ' ', 1)
                from public.group_members m join public.profiles p on p.id = m.user_id
               where m.group_id = g.id and m.role = 'owner' limit 1),
    'members', (select count(*) from public.group_members m where m.group_id = g.id and m.role is distinct from 'guest'),
    'places', (select count(*) from public.places p where p.group_id = g.id),
    'member', is_member,
    'requested', me is not null and exists (select 1 from public.group_join_requests r where r.group_id = g.id and r.user_id = me),
    -- Crumbs itself: does a new person need the gatekeeper's OK, and where do you stand?
    'gate', public.new_people_mode() <> 'everyone',
    'access', case when me is null then null
                   when public.is_let_in(me) then 'approved'
                   else coalesce((select access from public.profiles where id = me), 'pending') end,
    'asked', me is not null and exists (select 1 from public.access_requests a where a.user_id = me),
    'closed', public.new_people_mode() = 'off',
    'gatekeeper', (select split_part(coalesce(p.display_name, ''), ' ', 1)
                     from public.profiles p where p.id in (select public.gatekeeper_ids())
                    order by p.created_at limit 1),
    'id', case when is_member then g.id end);
end $$;
revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- "Join" / "Ask to join": someone not let in yet asks the gatekeeper first (status 'pending_app').
create or replace function public.join_by_invite(code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  found record;
  g public.groups;
  me uuid := auth.uid();
  as_role text;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  select * into found from public.group_for_code(code);
  g := found.g;
  if g.id is null then raise exception 'That invite doesn’t work any more — ask for a new link'; end if;
  as_role := case when found.as_guest then 'guest' else 'member' end;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = me) then
    return jsonb_build_object('status', 'member', 'id', g.id);
  end if;
  if not public.is_let_in(me) then
    perform public.request_access(code, null);
    return jsonb_build_object('status', 'pending_app');
  end if;
  if not g.invite_approval then
    insert into public.group_members (group_id, user_id, role) values (g.id, me, as_role)
    on conflict (group_id, user_id) do nothing;
    delete from public.group_join_requests where group_id = g.id and user_id = me;
    return jsonb_build_object('status', 'joined', 'id', g.id);
  end if;
  if not exists (select 1 from public.group_join_requests where group_id = g.id and user_id = me)
     and (select count(*) from public.group_join_requests where user_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That’s a lot of requests for one day — try again tomorrow';
  end if;
  insert into public.group_join_requests (group_id, user_id, role, via) values (g.id, me, as_role, 'invite')
  on conflict (group_id, user_id) do update set role = excluded.role, via = 'invite';
  return jsonb_build_object('status', 'requested');
end $$;
revoke execute on function public.join_by_invite(text) from public, anon;
grant execute on function public.join_by_invite(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. The gatekeeper (run once in the SQL editor if it isn't you yet — swap in your sign-in email):
-- update public.profiles set lets_people_in = true where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
-- Until someone has it, admins let people in. With exactly one admin, that admin gets it now:
do $$ begin
  if not exists (select 1 from public.profiles where lets_people_in)
     and (select count(*) from public.profiles where is_admin) = 1 then
    update public.profiles set lets_people_in = true where is_admin;
  end if;
end $$;
