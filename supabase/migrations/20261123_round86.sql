-- Round 86 (Nov 17): speed tidy-up — fewer database round trips on server calls (E17) and
-- notifications (E25). Safe to run more than once; the app works before it runs (it falls back to
-- the old, slower checks).
--   1. One gate check per server call: signed-in account still exists, let in, feature switch
--   2. One query for who to notify and which phones to send to
--   3. Record of this file

-- ============================================================================================
-- 1. The gate (E17). Server routes used to ask "let in?" and "is this switch on for me?" as
--    separate queries (2–3 round trips); this answers both at once. The account must still exist
--    (a deleted account's sign-in token stays valid for up to an hour).
-- ============================================================================================
create or replace function public.request_gate(flag_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  state text;
  admin boolean;
begin
  if me is null or not exists (select 1 from auth.users where id = me) then
    return jsonb_build_object('signed_in', false, 'let_in', false, 'flag_ok', false);
  end if;
  admin := coalesce((select is_admin from public.profiles where id = me), false);
  if flag_key is not null then
    select f.state into state from public.feature_flags f where f.key = flag_key;
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'let_in', public.is_let_in(me),
    -- a switch nobody added = allowed; Admin = admins only; Off = nobody
    'flag_ok', flag_key is null or state is null or state = 'everyone' or (state = 'admin' and admin));
end $$;
revoke execute on function public.request_gate(text) from public, anon;
grant execute on function public.request_gate(text) to authenticated;

-- ============================================================================================
-- 2. Who gets a notification (E25). The notify route used to read the group's members, then
--    their notification settings, then their phones' push keys (3 round trips). This does it in
--    one: the phones of the people asked for (or the whole group), minus the sender and anyone who
--    switched this kind of notification off. Server key only (push keys never reach a phone).
-- ============================================================================================
create or replace function public.push_targets(kind text, target_group uuid default null,
                                               people uuid[] default null, sender uuid default null)
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  with who as (
    select m.user_id from public.group_members m
     where target_group is not null and m.group_id = target_group
       and (people is null or m.user_id = any (people))
    union
    select unnest(people) where target_group is null
  )
  select s.user_id, s.endpoint, s.p256dh, s.auth
    from who
    join public.push_subscriptions s on s.user_id = who.user_id
    left join public.profiles p on p.id = who.user_id
   where who.user_id is distinct from sender
     and coalesce((p.notify ->> kind)::boolean, true)
$$;
revoke execute on function public.push_targets(text, uuid, uuid[], uuid) from public, anon, authenticated;

-- ============================================================================================
-- 3. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261123_round86')
on conflict (name) do nothing;
