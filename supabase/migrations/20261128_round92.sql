-- Round 92 (Nov 18): U12 who may delete places in a group.
-- Group settings → "Who can delete places": everyone in the group (as before), or only the person
-- who added it, the group's owner and admins. Safe to run more than once; until it runs, anyone in
-- the group can delete, as before.

create or replace function public.may_delete_place(target_group uuid, added_by uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members m join public.groups g on g.id = m.group_id
     where m.group_id = target_group and m.user_id = (select auth.uid())
       and (coalesce(g.settings ->> 'delete_rule', 'anyone') <> 'own'
            or added_by = (select auth.uid())
            or m.role in ('owner', 'admin')
            or g.created_by = (select auth.uid()))
  )
$$;
revoke execute on function public.may_delete_place(uuid, uuid) from public, anon;
grant execute on function public.may_delete_place(uuid, uuid) to authenticated;

drop policy if exists places_delete on public.places;
create policy places_delete on public.places for delete to authenticated
  using (public.may_delete_place(group_id, created_by));

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261128_round92') on conflict (name) do nothing;
