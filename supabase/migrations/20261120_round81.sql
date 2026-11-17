-- Round 81 (Nov 20): your recipes are yours (solo-first, decided Nov 12; Aidan's choices Nov 17:
-- the same recipe shows in every group you share it with, existing recipes move automatically,
-- "public" means everyone on Crumbs, ratings stay as they are for now).
-- Safe to run more than once. Run after 20261119_round80.sql.
--   1. A personal space can be made for anyone (used by My Crumbs and by the move below)
--   2. Recipes belong to the person who added them; sharing a recipe into groups
--   3. Who sees ratings and "we made it" entries on a shared recipe
--   4. Moving every existing recipe to the person who added it (stays shared with its group)
--   5. A group being deleted never takes a recipe that's shared somewhere else with it
--   6. Show a place on your public profile in one tap
--   7. Record of this file

-- ============================================================================================
-- 1. Personal spaces
-- ============================================================================================
-- Makes (or finds) someone's My Crumbs. Only the database calls this.
create or replace function public.make_personal_space(uid uuid)
returns uuid language plpgsql security definer
set search_path = public, extensions as $$
declare
  space uuid;
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if uid is null then return null; end if;
  select id into space from public.groups where created_by = uid and is_personal;
  if space is null then
    loop
      code := '';
      for i in 1..6 loop
        code := code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
      end loop;
      exit when not exists (select 1 from public.groups where join_code = code);
    end loop;
    insert into public.groups (name, join_code, created_by, is_personal, emoji)
      values ('My Crumbs', code, uid, true, '🍞')
    on conflict do nothing
    returning id into space;
    if space is null then
      select id into space from public.groups where created_by = uid and is_personal;
    end if;
  end if;
  insert into public.group_members (group_id, user_id, role) values (space, uid, 'owner')
  on conflict (group_id, user_id) do nothing;
  return space;
end $$;
revoke execute on function public.make_personal_space(uuid) from public, anon, authenticated;

create or replace function public.ensure_my_crumbs()
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine public.groups;
  space uuid;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if not public.is_let_in(me) then raise exception 'Crumbs hasn''t let you in yet'; end if;
  space := public.make_personal_space(me);
  select * into mine from public.groups where id = space;
  return mine;
end $$;
revoke execute on function public.ensure_my_crumbs() from public, anon;
grant execute on function public.ensure_my_crumbs() to authenticated;

-- ============================================================================================
-- 2. Your recipes, shared into groups
-- A recipe (home meal) lives in its owner's My Crumbs and shows in every group they share it
-- with — the same recipe, so edits show everywhere. Only the owner edits or deletes it (a recipe
-- whose owner deleted their account can be edited by the group it's in). Members of a group it's
-- shared with can rate it, log "we made it" and comment. The owner shares and unshares; a group's
-- owner or admins can take it out of their group. "Share this recipe on Crumbs" (everyone on
-- Crumbs) is unchanged.
-- ============================================================================================
create table if not exists public.home_meal_shares (
  meal_id uuid not null references public.home_meals(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  shared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (meal_id, group_id)
);
create index if not exists home_meal_shares_group_idx on public.home_meal_shares (group_id);
create index if not exists home_meal_shares_by_idx on public.home_meal_shares (shared_by);
alter table public.home_meal_shares enable row level security;

-- Every recipe you can see: ones in your groups and ones shared into them.
create or replace function public.my_meal_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select h.id from public.home_meals h where h.group_id in (select public.my_group_ids())
  union
  select s.meal_id from public.home_meal_shares s where s.group_id in (select public.my_group_ids())
$$;
-- Recipes shared into your groups, and recipes you added (used by the read rules below; these
-- run as the database so the two tables' rules don't loop into each other).
create or replace function public.meals_shared_with_me()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.meal_id from public.home_meal_shares s where s.group_id in (select public.my_group_ids())
$$;
create or replace function public.my_own_meal_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select h.id from public.home_meals h where h.created_by = (select auth.uid())
$$;
-- The groups a recipe shows in.
create or replace function public.meal_groups(meal uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select group_id from public.home_meals where id = meal
  union
  select group_id from public.home_meal_shares where meal_id = meal
$$;
-- Can rate it / log it: a full member (not a guest) of a group it shows in.
create or replace function public.meal_writer(meal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m
                  where m.user_id = (select auth.uid()) and m.role is distinct from 'guest'
                    and m.group_id in (select public.meal_groups(meal)))
$$;
-- Whose ratings and "we made it" entries you see on a recipe: yours, the owner's, and those of
-- people in a group where you both see it (a rating made in one group doesn't show in another).
-- Entries from deleted accounts (in no group any more) show to everyone who sees the recipe.
create or replace function public.meal_entry_visible(meal uuid, author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select author is null
      or author = (select auth.uid())
      or author = (select created_by from public.home_meals where id = meal)
      or not exists (select 1 from public.group_members where user_id = author)
      or exists (select 1 from public.group_members a
                   join public.group_members b on b.group_id = a.group_id and b.user_id = author
                  where a.user_id = (select auth.uid())
                    and a.group_id in (select public.meal_groups(meal)))
$$;
revoke execute on function public.my_meal_ids(), public.meal_groups(uuid), public.meal_writer(uuid),
  public.meal_entry_visible(uuid, uuid), public.meals_shared_with_me(), public.my_own_meal_ids() from public, anon;
grant execute on function public.my_meal_ids(), public.meal_groups(uuid), public.meal_writer(uuid),
  public.meal_entry_visible(uuid, uuid), public.meals_shared_with_me(), public.my_own_meal_ids() to authenticated;

drop policy if exists home_meal_shares_read on public.home_meal_shares;
create policy home_meal_shares_read on public.home_meal_shares for select to authenticated
  using (group_id in (select public.my_group_ids()) or meal_id in (select public.my_own_meal_ids()));

drop policy if exists home_meals_all on public.home_meals;
drop policy if exists home_meals_read on public.home_meals;
-- (Checks the row's own group first, so adding a recipe and reading it back in one go works.)
create policy home_meals_read on public.home_meals for select to authenticated
  using (group_id in (select public.my_group_ids())
         or id in (select public.meals_shared_with_me()));
drop policy if exists home_meals_add on public.home_meals;
create policy home_meals_add on public.home_meals for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
drop policy if exists home_meals_change on public.home_meals;
create policy home_meals_change on public.home_meals for update to authenticated
  using (created_by = (select auth.uid()) or (created_by is null and public.is_group_member(group_id)))
  with check (public.is_group_member(group_id) and (created_by = (select auth.uid()) or created_by is null));
drop policy if exists home_meals_remove on public.home_meals;
create policy home_meals_remove on public.home_meals for delete to authenticated
  using (created_by = (select auth.uid()) or (created_by is null and public.is_group_member(group_id)));

drop policy if exists home_meal_ratings_read on public.home_meal_ratings;
create policy home_meal_ratings_read on public.home_meal_ratings for select to authenticated
  using (meal_id in (select public.my_meal_ids()) and public.meal_entry_visible(meal_id, user_id));
drop policy if exists home_meal_ratings_write on public.home_meal_ratings;
create policy home_meal_ratings_write on public.home_meal_ratings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.meal_writer(meal_id));

drop policy if exists home_meal_cooks_all on public.home_meal_cooks;
drop policy if exists home_meal_cooks_read on public.home_meal_cooks;
create policy home_meal_cooks_read on public.home_meal_cooks for select to authenticated
  using (meal_id in (select public.my_meal_ids()) and public.meal_entry_visible(meal_id, created_by));
drop policy if exists home_meal_cooks_add on public.home_meal_cooks;
create policy home_meal_cooks_add on public.home_meal_cooks for insert to authenticated
  with check (public.meal_writer(meal_id) and created_by = (select auth.uid()));
drop policy if exists home_meal_cooks_change on public.home_meal_cooks;
create policy home_meal_cooks_change on public.home_meal_cooks for update to authenticated
  using (created_by = (select auth.uid()) or created_by is null and public.meal_writer(meal_id))
  with check (public.meal_writer(meal_id));
drop policy if exists home_meal_cooks_remove on public.home_meal_cooks;
create policy home_meal_cooks_remove on public.home_meal_cooks for delete to authenticated
  using (created_by = (select auth.uid())
         or (created_by is null and public.meal_writer(meal_id))
         or meal_id in (select public.my_own_meal_ids()));

-- "We made it" marks the recipe as cooked, whoever logs it (the status used to be set by the app,
-- which only the owner can do now).
create or replace function public.cook_marks_cooked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.home_meals set status = 'Cooked' where id = new.meal_id and status <> 'Cooked';
  return new;
end $$;
revoke execute on function public.cook_marks_cooked() from public, anon, authenticated;
drop trigger if exists cook_marks_cooked on public.home_meal_cooks;
create trigger cook_marks_cooked after insert on public.home_meal_cooks
  for each row execute function public.cook_marks_cooked();

-- Share a recipe into one of your groups, or take it out.
create or replace function public.share_meal(meal uuid, target_group uuid, shared boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.home_meals;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  select * into m from public.home_meals where id = meal;
  if m.id is null or m.id not in (select public.my_meal_ids()) then raise exception 'Not one of your recipes'; end if;
  if coalesce(shared, true) then
    if m.created_by is distinct from me then raise exception 'Only whoever added a recipe can share it'; end if;
    if target_group = m.group_id then return jsonb_build_object('shared', true); end if;
    if not exists (select 1 from public.group_members where group_id = target_group and user_id = me
                                                           and role is distinct from 'guest') then
      raise exception 'You can only share into a group you''re a member of';
    end if;
    if exists (select 1 from public.groups where id = target_group and is_personal) then
      raise exception 'That''s a private space';
    end if;
    insert into public.home_meal_shares (meal_id, group_id, shared_by) values (meal, target_group, me)
    on conflict do nothing;
    return jsonb_build_object('shared', true);
  end if;
  -- taking it out: the owner, or that group's owner or admins
  if not (m.created_by = me or exists (select 1 from public.group_members where group_id = target_group
                                         and user_id = me and role in ('owner', 'admin'))
          or exists (select 1 from public.groups where id = target_group and created_by = me)) then
    raise exception 'Only whoever added it, or the group''s owner or admins, can take it out';
  end if;
  delete from public.home_meal_shares where meal_id = meal and group_id = target_group;
  return jsonb_build_object('shared', false);
end $$;
revoke execute on function public.share_meal(uuid, uuid, boolean) from public, anon;
grant execute on function public.share_meal(uuid, uuid, boolean) to authenticated;

-- A recipe added in a group goes to its owner's My Crumbs and stays shared with that group (so
-- phones on any version of the app keep working: the app still adds recipes to the group it's in).
create or replace function public.move_meal_to_owner(meal uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m public.home_meals;
  space uuid;
begin
  select * into m from public.home_meals where id = meal;
  if m.id is null or m.created_by is null then return null; end if;
  if exists (select 1 from public.groups where id = m.group_id and is_personal) then return m.group_id; end if;
  -- someone the gate hasn't let in can't have a space (they can't add recipes either)
  if (select auth.uid()) is not null and not public.is_let_in(m.created_by) then return null; end if;
  space := public.make_personal_space(m.created_by);
  if space is null then return null; end if;
  insert into public.home_meal_shares (meal_id, group_id, shared_by, created_at)
    values (m.id, m.group_id, m.created_by, m.created_at)
  on conflict do nothing;
  update public.home_meals set group_id = space where id = m.id;
  return space;
end $$;
revoke execute on function public.move_meal_to_owner(uuid) from public, anon, authenticated;

create or replace function public.meal_belongs_to_person()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.move_meal_to_owner(new.id);
  return new;
end $$;
revoke execute on function public.meal_belongs_to_person() from public, anon, authenticated;
drop trigger if exists meal_belongs_to_person on public.home_meals;
create trigger meal_belongs_to_person after insert on public.home_meals
  for each row execute function public.meal_belongs_to_person();

-- Shared recipes on Crumbs: leave out every recipe you can already see in your own spaces.
create or replace function public.public_recipes(q text default null, lim integer default 30, mode text default 'search')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by
      case when mode = 'trending' then (x->>'recent')::numeric end desc nulls last,
      case when mode = 'suggested' then (x->>'diet_match')::numeric end desc nulls last,
      (x->>'score')::numeric desc nulls last, x->>'created_at' desc), '[]') from (
    select jsonb_build_object(
      'id', m.id, 'name', m.name, 'notes', m.notes, 'recipe', m.recipe, 'recipe_url', m.recipe_url,
      'photo_path', m.photo_path, 'dietary', m.dietary, 'spice', m.spice, 'created_at', m.created_at,
      'kind', m.kind, 'cuisine', m.cuisine, 'ingredients', m.ingredients,
      'saved', exists (select 1 from public.recipe_saves s where s.meal_id = m.id and s.user_id = auth.uid()),
      'by', split_part(coalesce(p.display_name, 'Someone'), ' ', 1),
      'mine', m.created_by = auth.uid(),
      'score', (select round(avg(r.score)::numeric, 1) from public.recipe_reviews r where r.meal_id = m.id),
      'reviews', (select count(*) from public.recipe_reviews r where r.meal_id = m.id),
      'recent', (select count(*) from public.recipe_reviews r where r.meal_id = m.id and r.created_at > now() - interval '14 days'),
      'diet_match', (select count(*) from unnest(m.dietary) d
                      where d = any(coalesce((select diet from public.profiles where id = auth.uid()), '{}'))),
      'tips', (select coalesce(jsonb_agg(jsonb_build_object('tip', r.tip, 'score', r.score,
                 'by', split_part(coalesce(rp.display_name, 'Someone'), ' ', 1), 'mine', r.user_id = auth.uid())
                 order by r.created_at desc), '[]')
                 from public.recipe_reviews r left join public.profiles rp on rp.id = r.user_id
                where r.meal_id = m.id and (r.tip is not null or r.user_id = auth.uid()))) as x
    from public.home_meals m left join public.profiles p on p.id = m.created_by
    where m.recipe_public and auth.uid() is not null
      and m.id not in (select public.my_meal_ids()) -- recipes in your own spaces live in "Our kitchen"
      and (q is null or m.name ilike '%' || left(q, 60) || '%' or coalesce(m.recipe, '') ilike '%' || left(q, 60) || '%'
           or coalesce(m.cuisine, '') ilike '%' || left(q, 60) || '%' or coalesce(m.kind, '') ilike '%' || left(q, 60) || '%'
           or m.ingredients::text ilike '%' || left(q, 60) || '%')
      and (mode <> 'saved' or exists (select 1 from public.recipe_saves s where s.meal_id = m.id and s.user_id = auth.uid()))
      and (mode <> 'trending' or exists (select 1 from public.recipe_reviews r where r.meal_id = m.id and r.created_at > now() - interval '14 days'))
      and (mode <> 'suggested' or (m.created_by <> auth.uid()
           and coalesce((select avg(r.score) from public.recipe_reviews r where r.meal_id = m.id), 0) >= 4))
    order by case when mode = 'trending'
                  then (select count(*) from public.recipe_reviews r where r.meal_id = m.id and r.created_at > now() - interval '14 days') end desc nulls last,
             m.created_at desc
    limit least(greatest(lim, 1), 100)) t
$$;

-- Live updates when a recipe is shared into (or out of) a group.
do $$ begin
  alter publication supabase_realtime add table public.home_meal_shares;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- ============================================================================================
-- 4. Every existing recipe moves to the person who added it (Aidan, Nov 17: automatically)
-- It goes to their My Crumbs (made for them if they don't have one) and stays shared with the
-- group it was in, so nobody loses anything. Recipes whose owner deleted their account stay in
-- their group. Running this again moves nothing new.
-- ============================================================================================
do $$
declare r record;
begin
  for r in select h.id from public.home_meals h join public.groups g on g.id = h.group_id
            where h.created_by is not null and not g.is_personal
            order by h.created_at loop
    perform public.move_meal_to_owner(r.id);
  end loop;
end $$;

-- ============================================================================================
-- 5. Deleting a space or group never takes a recipe that's also shared somewhere else
-- (deleting My Crumbs, or deleting your account, which deletes it): the recipe moves to the
-- group it was shared with first. Recipes shared nowhere go with the space, as before.
-- ============================================================================================
create or replace function public.rescue_shared_meals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select h.id,
                  (select s.group_id from public.home_meal_shares s
                    where s.meal_id = h.id and s.group_id <> old.id order by s.created_at limit 1) as heir
             from public.home_meals h where h.group_id = old.id loop
    if r.heir is not null then
      update public.home_meals set group_id = r.heir where id = r.id;
      delete from public.home_meal_shares where meal_id = r.id and group_id = r.heir;
    end if;
  end loop;
  return old;
end $$;
revoke execute on function public.rescue_shared_meals() from public, anon, authenticated;
drop trigger if exists rescue_shared_meals on public.groups;
create trigger rescue_shared_meals before delete on public.groups
  for each row execute function public.rescue_shared_meals();

-- ============================================================================================
-- 6. Show a place on your public profile in one tap (only once your public profile is on;
-- same rules as the profile settings: a place one of your spaces saved, up to 12).
-- ============================================================================================
create or replace function public.toggle_profile_pick(restaurant uuid, show boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if not coalesce((select profile_public from public.profiles where id = me), false) then
    raise exception 'Turn on your public profile first (Settings → Public profile)';
  end if;
  if not coalesce(show, false) then
    delete from public.profile_picks where user_id = me and kind = 'place' and restaurant_id = restaurant;
    return jsonb_build_object('shown', false);
  end if;
  if not public.my_restaurant(restaurant) then raise exception 'Save the place in one of your spaces first'; end if;
  if exists (select 1 from public.profile_picks where user_id = me and kind = 'place' and restaurant_id = restaurant) then
    return jsonb_build_object('shown', true);
  end if;
  if (select count(*) from public.profile_picks where user_id = me and kind = 'place') >= 12 then
    raise exception 'Your profile shows 12 places at most — take one off first';
  end if;
  insert into public.profile_picks (user_id, kind, restaurant_id, position)
  values (me, 'place', restaurant, (select count(*) from public.profile_picks where user_id = me and kind = 'place'))
  on conflict do nothing;
  return jsonb_build_object('shown', true);
end $$;
revoke execute on function public.toggle_profile_pick(uuid, boolean) from public, anon;
grant execute on function public.toggle_profile_pick(uuid, boolean) to authenticated;

-- ============================================================================================
-- 7. Record of this file
-- ============================================================================================
select public.crumbs_local_days();

insert into public.crumbs_migrations (name) values ('20261120_round81')
on conflict (name) do nothing;
