-- Crumbs: invite landing page + invite-only for now (Nov 2). Run after 20261101_owned_facts.sql.
-- Safe to re-run.
--
-- Invite links (crumbs…/invite/CODE) open a page about the group first. Each group's owner chooses
-- whether people with the link get in straight away or ask first and wait to be let in.
-- Starting a new group is invite-only for now: feature switch `start_groups` (Admin → switches):
--   Admin    = admins, Builders and anyone already in a group (the default)
--   Everyone = anyone who signs in (open sign-up)
--   Off      = only admins and Builders

-- ---------------------------------------------------------------------------------------------
-- 1. Per-group choice: invite links let people straight in (false) or the owner lets each in (true)
-- ---------------------------------------------------------------------------------------------
alter table public.groups add column if not exists invite_approval boolean not null default false;

-- Requests now remember what they'd join as (a guest link asks to join as a guest) and where
-- they came from ('public' = Find a group, 'invite' = an invite link).
alter table public.group_join_requests add column if not exists role text not null default 'member';
alter table public.group_join_requests add column if not exists via text not null default 'public';
do $$ begin
  alter table public.group_join_requests add constraint group_join_requests_role_check
    check (role in ('member', 'guest'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.group_join_requests add constraint group_join_requests_via_check
    check (via in ('public', 'invite'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Invite-only: who may start a group
-- ---------------------------------------------------------------------------------------------
insert into public.feature_flags (key, state, note) values
  ('start_groups', 'admin',
   'Who can start a new group. Admin = invite-only (admins, Builders, people already in a group); Everyone = open sign-up; Off = admins and Builders only')
on conflict (key) do nothing;

create or replace function public.can_start_group()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_builder_user(auth.uid())
    or coalesce((select state from public.feature_flags where key = 'start_groups'), 'everyone') = 'everyone'
    or (coalesce((select state from public.feature_flags where key = 'start_groups'), 'everyone') = 'admin'
        and exists (select 1 from public.group_members where user_id = auth.uid()))
  )
$$;
revoke execute on function public.can_start_group() from public, anon;
grant execute on function public.can_start_group() to authenticated;

-- Same as Builders' version, plus the invite-only check first.
create or replace function public.create_group(group_name text)
returns public.groups language plpgsql security definer
set search_path = public, extensions as $$
declare
  new_group public.groups;
  cap jsonb := public.my_day_caps()->'groups';
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if not public.can_start_group() then
    raise exception 'Crumbs is invite-only for now — open an invite link from a friend to get started';
  end if;
  if coalesce(trim(group_name), '') = '' then raise exception 'Group name is required'; end if;
  -- How many groups you can own at once grows with your tier (Admin → Points; null = no limit).
  if cap is not null and jsonb_typeof(cap) = 'number'
     and (select count(*) from public.groups where created_by = auth.uid()) >= cap::text::int then
    raise exception 'You can own % group% at once for now — leave or hand one over first, or keep helping build Crumbs to unlock more',
      cap::text::int, case when cap::text::int = 1 then '' else 's' end;
  end if;
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups where join_code = code);
  end loop;
  insert into public.groups (name, join_code, created_by)
    values (trim(group_name), code, auth.uid()) returning * into new_group;
  insert into public.group_members (group_id, user_id, role)
    values (new_group.id, auth.uid(), 'owner');
  return new_group;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. The invite page
-- ---------------------------------------------------------------------------------------------
-- Which group a code belongs to (member code first, then the guest code).
create or replace function public.group_for_code(code text, out g public.groups, out as_guest boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  c text := upper(trim(coalesce(code, '')));
begin
  as_guest := false;
  if c !~ '^[A-Z0-9]{6,8}$' then return; end if;
  select * into g from public.groups where join_code = c;
  if g.id is null then
    select * into g from public.groups where guest_code = c;
    as_guest := g.id is not null;
  end if;
end $$;
revoke execute on function public.group_for_code(text) from public, anon, authenticated;

-- What the invite page shows. Anyone holding the code may see it (signed in or not): the name,
-- emoji, colour, description, owner's first name and counts — never places, ratings or codes.
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
    -- Only members learn the id (to open the group in the app).
    'id', case when is_member then g.id end);
end $$;
revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- "Join" / "Ask to join" on the invite page. Returns {status: member | joined | requested, id?}.
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

-- Changed your mind while waiting.
create or replace function public.cancel_join_by_invite(code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  found record;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into found from public.group_for_code(code);
  if (found.g).id is null then return; end if;
  delete from public.group_join_requests where group_id = (found.g).id and user_id = auth.uid();
end $$;

-- Groups you're waiting to be let into (shown on the "not in a group yet" screen).
create or replace function public.my_join_requests()
returns table (group_id uuid, name text, emoji text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.emoji, r.created_at
    from public.group_join_requests r join public.groups g on g.id = r.group_id
   where r.user_id = auth.uid()
   order by r.created_at desc
$$;

revoke execute on function public.join_by_invite(text), public.cancel_join_by_invite(text),
  public.my_join_requests() from public, anon;
grant execute on function public.join_by_invite(text), public.cancel_join_by_invite(text),
  public.my_join_requests() to authenticated;

-- The old code box (join_group) follows the same rule: groups that let people in one by one
-- send you to ask instead.
create or replace function public.join_group(code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  found record;
  target public.groups;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into found from public.group_for_code(code);
  target := found.g;
  if target.id is null then raise exception 'That code does not match a group'; end if;
  if exists (select 1 from public.group_members where group_id = target.id and user_id = auth.uid()) then
    return target;
  end if;
  if target.invite_approval then
    raise exception '% lets people in one by one — open the invite link and tap Ask to join', target.name;
  end if;
  insert into public.group_members (group_id, user_id, role)
    values (target.id, auth.uid(), case when found.as_guest then 'guest' else 'member' end)
  on conflict (group_id, user_id) do nothing;
  return target;
end $$;
revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Owners see who's asking (and how), and letting someone in uses the role they asked for
-- ---------------------------------------------------------------------------------------------
-- (A new name, because join_requests() can't change its columns while older files still define it.)
create or replace function public.join_request_list(target uuid)
returns table (user_id uuid, display_name text, created_at timestamptz, role text, via text)
language sql stable security definer set search_path = public as $$
  select r.user_id, coalesce(p.display_name, 'Someone'), r.created_at, r.role, r.via
    from public.group_join_requests r left join public.profiles p on p.id = r.user_id
   where r.group_id = target and public.is_group_admin(target)
   order by r.created_at
$$;

create or replace function public.answer_join_request(target uuid, person uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.group_join_requests;
begin
  if not public.is_group_admin(target) then raise exception 'Only the group owner or an admin can do that'; end if;
  select * into r from public.group_join_requests where group_id = target and user_id = person;
  if r.group_id is null then raise exception 'That request is gone'; end if;
  if accept then
    insert into public.group_members (group_id, user_id, role) values (target, person, r.role)
    on conflict (group_id, user_id) do nothing;
  end if;
  delete from public.group_join_requests where group_id = target and user_id = person;
end $$;

revoke execute on function public.join_request_list(uuid), public.answer_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.join_request_list(uuid), public.answer_join_request(uuid, uuid, boolean) to authenticated;
