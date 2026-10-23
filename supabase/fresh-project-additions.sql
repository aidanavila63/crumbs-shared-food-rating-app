-- FOR A BRAND-NEW SUPABASE PROJECT ONLY (run after schema.sql). Never run on the live database.
-- Reconstructed from what production is known to do; it was NOT executed against Postgres.
-- Review it, and compare with your live functions, before relying on it.

create extension if not exists pgcrypto with schema extensions;

alter table public.places add column if not exists visited_on date;

-- Create a group and make the caller its owner. Join codes avoid I, O, 0, 1 (matches the table check).
create or replace function public.create_group(group_name text)
returns public.groups language plpgsql security definer
set search_path = public, extensions as $$
declare
  new_group public.groups;
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if coalesce(trim(group_name), '') = '' then raise exception 'Group name is required'; end if;
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

-- Join with a code. (Avoid naming a variable "found": it is reserved in plpgsql.)
create or replace function public.join_group(code text)
returns public.groups language plpgsql security definer
set search_path = public as $$
declare target public.groups;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into target from public.groups where join_code = upper(trim(code));
  if target.id is null then raise exception 'That code does not match a group'; end if;
  insert into public.group_members (group_id, user_id, role)
    values (target.id, auth.uid(), 'member') on conflict do nothing;
  return target;
end $$;

revoke execute on function public.create_group(text), public.join_group(text) from public, anon;
grant execute on function public.create_group(text), public.join_group(text) to authenticated;

-- Any group member can edit and delete places, dishes and lists (couples share everything).
drop policy if exists places_delete on public.places;
create policy places_delete on public.places for delete to authenticated
  using (public.is_group_member(group_id));
drop policy if exists dishes_delete on public.dishes;
create policy dishes_delete on public.dishes for delete to authenticated
  using (public.is_group_member(public.place_group(place_id)));
drop policy if exists lists_delete on public.lists;
create policy lists_delete on public.lists for delete to authenticated
  using (public.is_group_member(group_id));
drop policy if exists list_places_delete on public.list_places;
create policy list_places_delete on public.list_places for delete to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and public.is_group_member(l.group_id)));
