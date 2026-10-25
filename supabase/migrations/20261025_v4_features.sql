-- Crumbs v4: group roles + settings, richer ratings, dish details, visit details, home cooking,
-- activity feed, reactions + comments, decide together, plans, food crawls, admin tools, waitlist.
-- Safe to run more than once. Run in Supabase -> SQL Editor BEFORE deploying the matching code.
-- (The app keeps working without it, but the new features stay hidden until it has run.)

-- ============================================================================================
-- 0. Helpers
-- ============================================================================================
-- Membership check used by almost every policy. SECURITY DEFINER so it can read group_members
-- without re-triggering group_members' own policy (otherwise Postgres recurses forever).
-- Same answer as before; safe if the live database already has it this way.
create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = target_group and user_id = (select auth.uid()))
$$;

-- Owner = the person who created the group. Admins are members the owner promoted.
create or replace function public.is_group_admin(target_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups g where g.id = target_group and g.created_by = (select auth.uid()))
      or exists (select 1 from public.group_members m
                 where m.group_id = target_group and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin'))
$$;

alter table public.profiles add column if not exists is_admin boolean not null default false;
create or replace function public.is_crumbs_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;

-- ============================================================================================
-- 1. Group roles, settings and look (#43, #46, group-owner settings)
-- ============================================================================================
do $$ begin
  alter table public.group_members drop constraint if exists group_members_role_check;
  alter table public.group_members add constraint group_members_role_check check (role in ('owner', 'admin', 'member'));
end $$;

alter table public.groups add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.groups add column if not exists emoji text check (emoji is null or char_length(emoji) <= 8);
alter table public.groups add column if not exists color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
-- #46 group cover photo (a file in the group's photo folder)
alter table public.groups add column if not exists cover_path text check (cover_path is null or char_length(cover_path) <= 200);

-- Admins can edit the group too (name, settings, look); only the owner can delete it.
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));

-- Security fix: joining only happens through join_group() / create_group(), never a direct insert
-- (the old policy let anyone who knew a group's id add themselves without the code).
drop policy if exists members_join on public.group_members;

-- Owner makes someone an admin (or back to member).
create or replace function public.set_member_role(target_group uuid, target_user uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_role not in ('admin', 'member') then raise exception 'Role must be admin or member'; end if;
  if not exists (select 1 from public.groups where id = target_group and created_by = auth.uid()) then
    raise exception 'Only the group owner can change roles';
  end if;
  update public.group_members set role = new_role
   where group_id = target_group and user_id = target_user and role <> 'owner';
end $$;

-- Owner or admin removes someone (never the owner).
create or replace function public.remove_member(target_group uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_admin(target_group) then raise exception 'Only the owner or an admin can remove people'; end if;
  if exists (select 1 from public.groups where id = target_group and created_by = target_user) then
    raise exception 'The owner can''t be removed';
  end if;
  delete from public.group_members where group_id = target_group and user_id = target_user;
end $$;

-- Owner or admin gets a fresh invite code (old links and codes stop working).
create or replace function public.reset_join_code(target_group uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if not public.is_group_admin(target_group) then raise exception 'Only the owner or an admin can reset the code'; end if;
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups where join_code = code);
  end loop;
  update public.groups set join_code = code where id = target_group;
  return code;
end $$;

revoke execute on function public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.reset_join_code(uuid) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.reset_join_code(uuid) to authenticated;

-- ============================================================================================
-- 2. Richer ratings (#1 categories, #3 would go back, #2 finer scales)
-- ============================================================================================
alter table public.place_ratings add column if not exists points smallint check (points between 0 and 100);
alter table public.place_ratings add column if not exists food smallint check (food between 1 and 5);
alter table public.place_ratings add column if not exists service smallint check (service between 1 and 5);
alter table public.place_ratings add column if not exists vibe smallint check (vibe between 1 and 5);
alter table public.place_ratings add column if not exists value smallint check (value between 1 and 5);
alter table public.place_ratings add column if not exists would_return text check (would_return in ('yes', 'maybe', 'no'));
-- #12 Draft ratings: only you see a draft until you post it (no feed line, no notification).
alter table public.place_ratings add column if not exists draft boolean not null default false;
drop policy if exists place_ratings_read on public.place_ratings;
create policy place_ratings_read on public.place_ratings for select to authenticated
  using (public.is_group_member(public.place_group(place_id)) and (not draft or user_id = (select auth.uid())));

-- #10 Private notes: a note on a place only you can ever see (not your group, not admins).
create table if not exists public.place_private_notes (
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
alter table public.place_private_notes enable row level security;
drop policy if exists place_private_notes_own on public.place_private_notes;
create policy place_private_notes_own on public.place_private_notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_group_member(public.place_group(place_id)));

-- ============================================================================================
-- 3. Dish details (#18 course, #17 dietary + spice, #16 wishlist)
-- ============================================================================================
alter table public.dishes add column if not exists course text check (course in ('starter', 'main', 'side', 'dessert', 'drink'));
alter table public.dishes add column if not exists dietary text[] not null default '{}';
alter table public.dishes add column if not exists spice smallint check (spice between 0 and 3);
alter table public.dishes add column if not exists wishlist boolean not null default false;

-- ============================================================================================
-- 4. Visit details (#5 score per visit, #6 people, #78 kind, #37 who picked, #69/#70 memories)
-- ============================================================================================
alter table public.place_visits add column if not exists score numeric(2,1) check (score between 0.5 and 5);
alter table public.place_visits add column if not exists people smallint check (people between 1 and 50);
alter table public.place_visits add column if not exists kind text not null default 'dine_in'
  check (kind in ('dine_in', 'takeout', 'delivery'));
alter table public.place_visits add column if not exists picked_by uuid references auth.users(id) on delete set null;
alter table public.place_visits add column if not exists occasion text check (occasion in ('date', 'celebration'));
alter table public.place_visits add column if not exists milestone text check (milestone is null or char_length(milestone) <= 60);
alter table public.place_visits add column if not exists note text check (note is null or char_length(note) <= 500);
drop policy if exists place_visits_update on public.place_visits;
create policy place_visits_update on public.place_visits for update to authenticated
  using (public.is_group_member(public.place_group(place_id)))
  with check (public.is_group_member(public.place_group(place_id)));

-- ============================================================================================
-- 5. Home cooking (#77) — its own area, separate from restaurants
-- ============================================================================================
create table if not exists public.home_meals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'Cooked' check (status in ('Cooked', 'Want to cook')),
  verdict text check (verdict in ('again', 'never')),
  recipe_url text check (recipe_url is null or char_length(recipe_url) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  photo_path text,
  dietary text[] not null default '{}',
  spice smallint check (spice between 0 and 3),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists home_meals_group_idx on public.home_meals (group_id, created_at desc);
create table if not exists public.home_meal_ratings (
  meal_id uuid not null references public.home_meals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (meal_id, user_id)
);
create table if not exists public.home_meal_cooks (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.home_meals(id) on delete cascade,
  cooked_on date not null,
  cooked_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create or replace function public.meal_group(target_meal uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select group_id from public.home_meals where id = target_meal $$;

alter table public.home_meals enable row level security;
alter table public.home_meal_ratings enable row level security;
alter table public.home_meal_cooks enable row level security;
drop policy if exists home_meals_all on public.home_meals;
create policy home_meals_all on public.home_meals for all to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));
drop policy if exists home_meal_ratings_read on public.home_meal_ratings;
drop policy if exists home_meal_ratings_write on public.home_meal_ratings;
create policy home_meal_ratings_read on public.home_meal_ratings for select to authenticated
  using (public.is_group_member(public.meal_group(meal_id)));
create policy home_meal_ratings_write on public.home_meal_ratings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_group_member(public.meal_group(meal_id)));
drop policy if exists home_meal_cooks_all on public.home_meal_cooks;
create policy home_meal_cooks_all on public.home_meal_cooks for all to authenticated
  using (public.is_group_member(public.meal_group(meal_id)))
  with check (public.is_group_member(public.meal_group(meal_id)));

-- ============================================================================================
-- 6. Activity feed (#45) — written only by the database, read by the group
-- ============================================================================================
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  kind text not null,
  place_id uuid references public.places(id) on delete cascade,
  meal_id uuid references public.home_meals(id) on delete cascade,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_group_idx on public.activity (group_id, created_at desc);
alter table public.activity enable row level security;
drop policy if exists activity_read on public.activity;
create policy activity_read on public.activity for select to authenticated using (public.is_group_member(group_id));

create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if tg_table_name = 'places' then
    gid := new.group_id;
    insert into public.activity (group_id, actor, kind, place_id, detail)
    values (gid, new.created_by, 'place_added', new.id, jsonb_build_object('status', new.status));
  elsif tg_table_name = 'place_ratings' then
    if new.draft then return new; end if; -- drafts stay private (#12)
    if tg_op = 'UPDATE' and new.score is not distinct from old.score and not old.draft then return new; end if;
    gid := public.place_group(new.place_id);
    -- One rating line per person per place per day (re-rating just updates it).
    delete from public.activity
     where kind = 'rated' and place_id = new.place_id and actor = new.user_id and created_at > now() - interval '1 day';
    insert into public.activity (group_id, actor, kind, place_id, detail)
    values (gid, new.user_id, 'rated', new.place_id, jsonb_build_object('score', new.score));
  elsif tg_table_name = 'place_visits' then
    gid := public.place_group(new.place_id);
    insert into public.activity (group_id, actor, kind, place_id, detail)
    values (gid, new.created_by, 'visited', new.place_id,
            jsonb_strip_nulls(jsonb_build_object('on', new.visited_on, 'kind', new.kind,
                                                  'occasion', new.occasion, 'milestone', new.milestone)));
  elsif tg_table_name = 'home_meals' then
    gid := new.group_id;
    insert into public.activity (group_id, actor, kind, meal_id, detail)
    values (gid, new.created_by, 'meal_added', new.id, jsonb_build_object('status', new.status));
  elsif tg_table_name = 'home_meal_cooks' then
    gid := public.meal_group(new.meal_id);
    insert into public.activity (group_id, actor, kind, meal_id, detail)
    values (gid, new.created_by, 'cooked', new.meal_id, jsonb_build_object('on', new.cooked_on));
  elsif tg_table_name = 'group_members' then
    gid := new.group_id;
    insert into public.activity (group_id, actor, kind) values (gid, new.user_id, 'joined');
  elsif tg_table_name = 'plans' then
    gid := new.group_id;
    insert into public.activity (group_id, actor, kind, place_id, detail)
    values (gid, new.created_by, 'planned', new.place_id,
            jsonb_build_object('title', new.title, 'starts_at', new.starts_at));
  end if;
  -- Keep the feed small: drop anything older than 120 days for this group.
  delete from public.activity
   where group_id = gid and created_at < now() - interval '120 days';
  return new;
end $$;

drop trigger if exists activity_places on public.places;
create trigger activity_places after insert on public.places for each row execute function public.log_activity();
drop trigger if exists activity_ratings on public.place_ratings;
create trigger activity_ratings after insert or update of score, draft on public.place_ratings
  for each row execute function public.log_activity();
drop trigger if exists activity_visits on public.place_visits;
create trigger activity_visits after insert on public.place_visits for each row execute function public.log_activity();
drop trigger if exists activity_meals on public.home_meals;
create trigger activity_meals after insert on public.home_meals for each row execute function public.log_activity();
drop trigger if exists activity_cooks on public.home_meal_cooks;
create trigger activity_cooks after insert on public.home_meal_cooks for each row execute function public.log_activity();
drop trigger if exists activity_members on public.group_members;
create trigger activity_members after insert on public.group_members for each row execute function public.log_activity();

-- ============================================================================================
-- 7. Reactions + comments (#11). target = 'activity:<id>' or 'rating:<place id>:<user id>'
-- ============================================================================================
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  target text not null check (char_length(target) <= 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  unique (target, user_id, emoji)
);
create index if not exists reactions_group_idx on public.reactions (group_id);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  target text not null check (char_length(target) <= 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_group_idx on public.comments (group_id, target);
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
drop policy if exists reactions_read on public.reactions;
drop policy if exists reactions_insert on public.reactions;
drop policy if exists reactions_delete on public.reactions;
create policy reactions_read on public.reactions for select to authenticated using (public.is_group_member(group_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists comments_read on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_delete on public.comments;
create policy comments_read on public.comments for select to authenticated using (public.is_group_member(group_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));
create policy comments_delete on public.comments for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_admin(group_id));

-- ============================================================================================
-- 8. Decide together (#30 swipe to match, #40 list voting, #34 occasions)
-- ============================================================================================
create table if not exists public.swipe_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text check (title is null or char_length(title) <= 80),
  list_id uuid references public.lists(id) on delete set null,
  place_ids uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.swipe_votes (
  session_id uuid not null references public.swipe_sessions(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  yes boolean not null,
  created_at timestamptz not null default now(),
  primary key (session_id, place_id, user_id)
);
create or replace function public.session_group(target_session uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select group_id from public.swipe_sessions where id = target_session $$;
alter table public.swipe_sessions enable row level security;
alter table public.swipe_votes enable row level security;
drop policy if exists swipe_sessions_read on public.swipe_sessions;
drop policy if exists swipe_sessions_insert on public.swipe_sessions;
drop policy if exists swipe_sessions_update on public.swipe_sessions;
drop policy if exists swipe_sessions_delete on public.swipe_sessions;
create policy swipe_sessions_read on public.swipe_sessions for select to authenticated using (public.is_group_member(group_id));
create policy swipe_sessions_insert on public.swipe_sessions for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));
create policy swipe_sessions_update on public.swipe_sessions for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy swipe_sessions_delete on public.swipe_sessions for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));
drop policy if exists swipe_votes_read on public.swipe_votes;
drop policy if exists swipe_votes_write on public.swipe_votes;
create policy swipe_votes_read on public.swipe_votes for select to authenticated
  using (public.is_group_member(public.session_group(session_id)));
create policy swipe_votes_write on public.swipe_votes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_group_member(public.session_group(session_id)));

-- ============================================================================================
-- 9. Plan a dinner (#48) with RSVPs; a plan can point at a swipe session to pick the place
-- ============================================================================================
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz,
  place_id uuid references public.places(id) on delete set null,
  session_id uuid references public.swipe_sessions(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.plan_rsvps (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create or replace function public.plan_group(target_plan uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select group_id from public.plans where id = target_plan $$;
alter table public.plans enable row level security;
alter table public.plan_rsvps enable row level security;
drop policy if exists plans_all on public.plans;
create policy plans_all on public.plans for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
drop policy if exists plan_rsvps_read on public.plan_rsvps;
drop policy if exists plan_rsvps_write on public.plan_rsvps;
create policy plan_rsvps_read on public.plan_rsvps for select to authenticated
  using (public.is_group_member(public.plan_group(plan_id)));
create policy plan_rsvps_write on public.plan_rsvps for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_group_member(public.plan_group(plan_id)));
drop trigger if exists activity_plans on public.plans;
create trigger activity_plans after insert on public.plans for each row execute function public.log_activity();

-- ============================================================================================
-- 10. Food crawls (#26): a list can be a crawl, and list places can have an order
-- ============================================================================================
alter table public.lists add column if not exists kind text not null default 'list' check (kind in ('list', 'crawl'));
alter table public.list_places add column if not exists position integer;
drop policy if exists list_places_update on public.list_places;
create policy list_places_update on public.list_places for update to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and public.is_group_member(l.group_id)));

-- ============================================================================================
-- 11. Profiles: admin flag (#111) and notification choices (#73)
-- ============================================================================================
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists notify jsonb not null default '{}'::jsonb;
-- "Restaurant owner" tag (never says which restaurant). Set only by the claims flow (13e).
alter table public.profiles add column if not exists restaurant_owner boolean not null default false;
-- #47 Your rating in your other groups that saved the same place: 'group' = only where you rate it,
-- 'all' = copied to all of them, 'ask' = Crumbs offers each time.
alter table public.profiles add column if not exists share_ratings text not null default 'group'
  check (share_ratings in ('group', 'all', 'ask'));
-- Nobody can make themselves admin (or a restaurant owner) from the app; only the SQL editor
-- (no signed-in user) or the approved-claim trigger can.
create or replace function public.protect_admin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'is_admin can only be changed from the Supabase SQL editor';
  end if;
  if new.restaurant_owner is distinct from old.restaurant_owner and auth.uid() is not null
     and coalesce(current_setting('crumbs.owner_sync', true), '') <> 'on' then
    raise exception 'restaurant_owner is set when a claim is approved';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_admin on public.profiles;
create trigger profiles_protect_admin before update on public.profiles for each row execute function public.protect_admin_flag();

-- ============================================================================================
-- 12. Admin tools: feedback (#108), feature flags (#109), error log (#110), waitlist (#94)
-- ============================================================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  page text check (page is null or char_length(page) <= 120),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists feedback_insert on public.feedback;
drop policy if exists feedback_read on public.feedback;
drop policy if exists feedback_delete on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy feedback_read on public.feedback for select to authenticated
  using (user_id = (select auth.uid()) or public.is_crumbs_admin());
create policy feedback_delete on public.feedback for delete to authenticated using (public.is_crumbs_admin());

create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_-]{1,40}$'),
  state text not null default 'admin' check (state in ('off', 'admin', 'everyone')),
  note text check (note is null or char_length(note) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
drop policy if exists flags_read on public.feature_flags;
drop policy if exists flags_write on public.feature_flags;
create policy flags_read on public.feature_flags for select to authenticated using (true);
create policy flags_write on public.feature_flags for all to authenticated
  using (public.is_crumbs_admin()) with check (public.is_crumbs_admin());
-- The two AI features start on for everyone (as today); switch them to "Admin" on the admin page.
insert into public.feature_flags (key, state, note) values
  ('ai_ideas', 'everyone', 'AI dinner ideas on Decide & Plan'),
  ('menu_import', 'everyone', 'Import menu from website (AI)'),
  ('restaurant_claims', 'admin', 'Restaurants can claim their page (#100) — switch to Everyone when public'),
  ('menu_ai', 'admin', 'Menu photo read by AI (#19) — admin while free AI credit lasts, paid later')
on conflict (key) do nothing;

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  message text not null check (char_length(message) <= 500),
  stack text check (stack is null or char_length(stack) <= 2000),
  url text check (url is null or char_length(url) <= 300),
  created_at timestamptz not null default now()
);
alter table public.client_errors enable row level security;
drop policy if exists errors_insert on public.client_errors;
drop policy if exists errors_admin on public.client_errors;
create policy errors_insert on public.client_errors for insert to authenticated with check (user_id = (select auth.uid()));
create policy errors_admin on public.client_errors for select to authenticated using (public.is_crumbs_admin());
drop policy if exists errors_admin_delete on public.client_errors;
create policy errors_admin_delete on public.client_errors for delete to authenticated using (public.is_crumbs_admin());
-- Keep the log small (last 500 errors).
create or replace function public.trim_client_errors()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.client_errors where id <= new.id - 500;
  return new;
end $$;
drop trigger if exists client_errors_trim on public.client_errors;
create trigger client_errors_trim after insert on public.client_errors for each row execute function public.trim_client_errors();

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
drop policy if exists waitlist_insert on public.waitlist;
drop policy if exists waitlist_admin on public.waitlist;
drop policy if exists waitlist_admin_delete on public.waitlist;
create policy waitlist_insert on public.waitlist for insert to anon, authenticated with check (true);
create policy waitlist_admin on public.waitlist for select to authenticated using (public.is_crumbs_admin());
create policy waitlist_admin_delete on public.waitlist for delete to authenticated using (public.is_crumbs_admin());

-- Simple counts for the admin page (no personal data).
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'groups', (select count(*) from public.groups),
    'places', (select count(*) from public.places),
    'ratings', (select count(*) from public.place_ratings),
    'visits', (select count(*) from public.place_visits),
    'meals', (select count(*) from public.home_meals),
    'active_7d', (select count(distinct actor) from public.activity where created_at > now() - interval '7 days'),
    'waitlist', (select count(*) from public.waitlist),
    'feedback', (select count(*) from public.feedback),
    'restaurants', (select count(*) from public.restaurants),
    'menu_dishes', (select count(*) from public.restaurant_dishes where hidden = false),
    -- How much of the restaurant data Crumbs owns (from members or open data, not Google).
    'owned_hours', (select count(*) from public.restaurants where sources->>'hours' in ('crumbs', 'osm', 'owner')),
    'owned_address', (select count(*) from public.restaurants where sources->>'address' in ('crumbs', 'osm', 'owner')),
    'facts', (select count(*) from public.restaurant_facts),
    'claimed_facts', (select coalesce(sum((select count(*) from jsonb_each(r.verified) e where (e.value->>'claimed')::boolean)), 0) from public.restaurants r),
    'claimed_dishes', (select count(*) from public.restaurant_dishes where claimed),
    'claims_pending', (select count(*) from public.restaurant_claims where status = 'pending'),
    'owner_verified', (select count(*) from public.restaurants where owner_verified),
    -- Facts that are still only Google's (would need showing live, not stored, once public).
    'borrowed_fields', (select coalesce(sum((select count(*) from jsonb_each_text(r.sources) e where e.value = 'google')), 0) from public.restaurants r),
    -- Free-tier meters: database (500 MB) and photo storage (1 GB).
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'crumbs-photos')
  );
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- ============================================================================================
-- 13. Live updates for the new tables
-- ============================================================================================
do $$
declare t text;
begin
  foreach t in array array['home_meals', 'home_meal_ratings', 'home_meal_cooks', 'activity', 'reactions', 'comments',
                           'swipe_sessions', 'swipe_votes', 'plans', 'plan_rsvps', 'groups', 'group_members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- ============================================================================================
-- 13a. Shared restaurant profiles (#27 shared data layer, #19 menus feed the profile)
-- ============================================================================================
-- ONE copy per real restaurant, reused by every group. Holds only facts about the restaurant
-- (name, address, hours, menu) — never who rated it or who goes there. Groups link their own
-- place to it. Everyone signed in can read it; changes only go through the functions below,
-- and only for restaurants one of your groups has saved.
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (char_length(source_key) between 3 and 300), -- Google place id or osm:N123
  name text not null check (char_length(name) between 1 and 160),
  formatted_address text,
  latitude double precision,
  longitude double precision,
  cuisine text,
  price_level smallint check (price_level between 0 and 4),
  website text,
  google_maps_url text,
  opening_hours jsonb,
  business_status text,
  hours_checked_at timestamptz,   -- when hours/status were last fetched (Google or OSM)
  details_checked_at timestamptz, -- when name/address/price/website were last fetched
  places_count integer not null default 0, -- how many group places link here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists restaurants_name_idx on public.restaurants (lower(name));
create index if not exists restaurants_geo_idx on public.restaurants (latitude, longitude);
alter table public.places add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null;
create index if not exists places_restaurant_idx on public.places (restaurant_id);

-- The community menu: one row per dish name per restaurant (duplicates collate into one).
create table if not exists public.restaurant_dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  name_key text not null,
  price numeric(10,2) check (price is null or (price >= 0 and price < 10000)),
  description text check (description is null or char_length(description) <= 300),
  course text check (course in ('starter', 'main', 'side', 'dessert', 'drink')),
  dietary text[] not null default '{}',
  source text not null default 'manual' check (source in ('photo', 'website', 'manual', 'receipt')),
  claimed boolean not null default false, -- confirmed by 2+ different groups (or the owner): Crumbs' own
  confirms integer not null default 0,
  flags integer not null default 0,
  hidden boolean not null default false,
  added_by uuid references auth.users(id) on delete set null,
  price_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (restaurant_id, name_key)
);
create table if not exists public.restaurant_dish_votes (
  dish_id uuid not null references public.restaurant_dishes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('confirm', 'flag')),
  created_at timestamptz not null default now(),
  primary key (dish_id, user_id)
);

alter table public.restaurants enable row level security;
alter table public.restaurant_dishes enable row level security;
alter table public.restaurant_dish_votes enable row level security;
drop policy if exists restaurants_read on public.restaurants;
create policy restaurants_read on public.restaurants for select to authenticated using (true);
drop policy if exists restaurant_dishes_read on public.restaurant_dishes;
create policy restaurant_dishes_read on public.restaurant_dishes for select to authenticated using (hidden = false or public.is_crumbs_admin());
drop policy if exists restaurant_dish_votes_read on public.restaurant_dish_votes;
create policy restaurant_dish_votes_read on public.restaurant_dish_votes for select to authenticated using (user_id = (select auth.uid()));
-- (no insert/update/delete policies: writes go through the functions below)

-- Is this restaurant saved by one of my groups?
create or replace function public.my_restaurant(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.places p where p.restaurant_id = target and public.is_group_member(p.group_id))
$$;

create or replace function public.dish_key(dish text)
returns text language sql immutable as $$
  select trim(regexp_replace(lower(trim(dish)), '[^a-z0-9à-ÿ]+', ' ', 'g'))
$$;

-- Links a group place to its shared restaurant (creating it from the place if needed) and
-- returns the restaurant. Manual places (no Google/OSM id) aren't shared.
create or replace function public.link_restaurant(target_place uuid)
returns public.restaurants language plpgsql security definer set search_path = public as $$
declare
  p public.places;
  r public.restaurants;
begin
  select * into p from public.places where id = target_place;
  if p.id is null or not public.is_group_member(p.group_id) then raise exception 'Not your place'; end if;
  if p.google_place_id like 'manual:%' then return null; end if;
  select * into r from public.restaurants where source_key = p.google_place_id;
  -- Same restaurant found through the other map (Google vs OpenStreetMap)? Same name within
  -- ~60 m counts as the same place, so there's still only one copy.
  if r.id is null and p.latitude is not null then
    select * into r from public.restaurants
     where public.dish_key(name) = public.dish_key(p.name)
       and abs(latitude - p.latitude) < 0.0006 and abs(longitude - p.longitude) < 0.0008
     order by places_count desc limit 1;
  end if;
  if r.id is null then
    insert into public.restaurants (source_key, name, formatted_address, latitude, longitude, cuisine, price_level,
                                    website, google_maps_url, opening_hours, business_status, hours_checked_at, details_checked_at)
    values (p.google_place_id, left(p.name, 160), p.formatted_address, p.latitude, p.longitude, p.cuisine, p.price_level,
            p.website, p.google_maps_url, p.opening_hours, p.business_status, p.hours_checked_at, p.created_at)
    on conflict (source_key) do nothing
    returning * into r;
    if r.id is null then select * into r from public.restaurants where source_key = p.google_place_id; end if;
  else
    -- A place saved in the last hour came with a fresh Google/OSM lookup: refresh the shared
    -- details from it (never the name or cuisine, which groups may edit, and never with blanks).
    -- Only fields that are still Google's are refreshed: member, owner and open data stay.
    if p.created_at > now() - interval '1 hour' and p.created_at > coalesce(r.details_checked_at, '-infinity')
       and not coalesce(r.owner_verified, false) then
      update public.restaurants set
        formatted_address = case when coalesce(sources->>'address', 'google') = 'google' then coalesce(p.formatted_address, formatted_address) else formatted_address end,
        latitude = case when coalesce(sources->>'location', 'google') = 'google' then coalesce(p.latitude, latitude) else latitude end,
        longitude = case when coalesce(sources->>'location', 'google') = 'google' then coalesce(p.longitude, longitude) else longitude end,
        price_level = case when coalesce(sources->>'price_level', 'google') = 'google' then coalesce(p.price_level, price_level) else price_level end,
        website = case when coalesce(sources->>'website', 'google') = 'google' then coalesce(p.website, website) else website end,
        google_maps_url = coalesce(p.google_maps_url, google_maps_url), details_checked_at = p.created_at
      where id = r.id returning * into r;
    end if;
    -- Fill gaps from the group's copy (never overwrite with blanks).
    update public.restaurants set
      formatted_address = coalesce(formatted_address, p.formatted_address),
      latitude = coalesce(latitude, p.latitude), longitude = coalesce(longitude, p.longitude),
      cuisine = coalesce(cuisine, p.cuisine), price_level = coalesce(price_level, p.price_level),
      website = coalesce(website, p.website), google_maps_url = coalesce(google_maps_url, p.google_maps_url),
      opening_hours = case when coalesce(p.hours_checked_at, '-infinity') > coalesce(hours_checked_at, '-infinity')
                            and coalesce(sources->>'hours', 'google') = 'google' and not owner_verified then p.opening_hours else opening_hours end,
      business_status = case when coalesce(p.hours_checked_at, '-infinity') > coalesce(hours_checked_at, '-infinity')
                            and coalesce(sources->>'status', 'google') = 'google' and not owner_verified then p.business_status else business_status end,
      hours_checked_at = case when coalesce(sources->>'hours', 'google') = 'google' and not owner_verified
                              then greatest(hours_checked_at, p.hours_checked_at) else hours_checked_at end,
      updated_at = now()
    where id = r.id returning * into r;
  end if;
  if p.restaurant_id is distinct from r.id then
    update public.places set restaurant_id = r.id where id = p.id;
    update public.restaurants set places_count = (select count(*) from public.places where restaurant_id = r.id) where id = r.id
      returning * into r;
  end if;
  return r;
end $$;

-- Fresh hours/status from Google or OSM, shared so other groups don't pay for the same lookup.
create or replace function public.share_restaurant_hours(target uuid, hours jsonb, status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.my_restaurant(target) then raise exception 'Not one of your restaurants'; end if;
  -- Hours members, open data or the owner gave us are Crumbs' own: a Google lookup never replaces them.
  update public.restaurants set opening_hours = hours, hours_checked_at = now(), updated_at = now(),
         sources = sources || '{"hours": "google"}'
   where id = target and coalesce(sources->>'hours', 'google') = 'google' and not owner_verified;
  update public.restaurants set business_status = left(nullif(status, ''), 40), updated_at = now(),
         sources = sources || '{"status": "google"}'
   where id = target and nullif(status, '') is not null
     and coalesce(sources->>'status', 'google') = 'google' and not owner_verified;
end $$;

-- Dishes from a menu photo / website / by hand. Same name = same dish (counts as a confirmation);
-- a newer price replaces an older one.
create or replace function public.add_restaurant_dishes(target uuid, dishes jsonb, how text default 'photo')
returns integer language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
  added integer := 0;
  row_id uuid;
  is_new boolean;
  k text;
  fresh integer := 0;
  manager boolean := public.manages_restaurant(target);
begin
  if not (public.my_restaurant(target) or manager) then raise exception 'Not one of your restaurants'; end if;
  if jsonb_typeof(dishes) <> 'array' or jsonb_array_length(dishes) > 80 then raise exception 'Too many dishes at once'; end if;
  for d in select * from jsonb_array_elements(dishes) loop
    k := public.dish_key(d->>'name');
    continue when k is null or length(k) < 2 or length(d->>'name') > 120;
    insert into public.restaurant_dishes (restaurant_id, name, name_key, price, description, course, source, added_by)
    values (target, trim(d->>'name'), k,
            case when (d->>'price') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' then (d->>'price')::numeric end,
            left(nullif(trim(d->>'description'), ''), 300),
            case when d->>'course' in ('starter', 'main', 'side', 'dessert', 'drink') then d->>'course' end,
            case when how in ('photo', 'website', 'manual', 'receipt') then how else 'manual' end,
            auth.uid())
    on conflict (restaurant_id, name_key) do update set
      -- A newer price replaces an older one, except on a dish the restaurant's owner checked
      -- (then it's sent to the owner as a suggestion, below).
      price = case when restaurant_dishes.owner_ok and not manager then restaurant_dishes.price
                   else coalesce(excluded.price, restaurant_dishes.price) end,
      price_set_at = case when excluded.price is not null and excluded.price is distinct from restaurant_dishes.price
                               and not (restaurant_dishes.owner_ok and not manager)
                          then now() else restaurant_dishes.price_set_at end,
      price_checked_at = case when excluded.price is not null then now() else restaurant_dishes.price_checked_at end,
      description = coalesce(restaurant_dishes.description, excluded.description),
      course = case when manager then coalesce(excluded.course, restaurant_dishes.course)
                    else coalesce(restaurant_dishes.course, excluded.course) end
    returning id, (xmax = 0) into row_id, is_new;
    if is_new then fresh := fresh + 1; end if;
    if manager then
      update public.restaurant_dishes set owner_ok = true, hidden = false where id = row_id;
    elsif not is_new and (d->>'price') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$'
          and exists (select 1 from public.restaurant_dishes x where x.id = row_id and x.owner_ok
                        and x.price is distinct from (d->>'price')::numeric) then
      insert into public.restaurant_dish_prices (dish_id, user_id, price, evidence)
      values (row_id, auth.uid(), (d->>'price')::numeric, case when how = 'photo' then 'photo' else 'in_person' end)
      on conflict (dish_id, user_id) do update set price = excluded.price, evidence = excluded.evidence, created_at = now();
    end if;
    -- New dishes from a menu photo or typed in count towards menu points (see 13e, menu_add).
    if is_new and not manager and how in ('photo', 'manual') then
      perform public.menu_add(auth.uid(), target, row_id);
    end if;
    -- Adding a dish that's already there is a vote that it's real.
    insert into public.restaurant_dish_votes (dish_id, user_id, vote) values (row_id, auth.uid(), 'confirm')
    on conflict (dish_id, user_id) do update set vote = 'confirm', created_at = now();
    added := added + 1;
  end loop;
  -- (Receipts and website imports add dishes too, but they're part of using the app: no points.)
  update public.restaurant_dishes rd set
    confirms = (select count(*) from public.restaurant_dish_votes v where v.dish_id = rd.id and v.vote = 'confirm'),
    flags = (select count(*) from public.restaurant_dish_votes v where v.dish_id = rd.id and v.vote = 'flag')
  where rd.restaurant_id = target;
  update public.restaurant_dishes set hidden = (flags >= 2 and flags > confirms and not owner_ok) where restaurant_id = target;
  update public.restaurant_dishes rd set claimed = rd.owner_ok or (
    select count(distinct p.group_id) from public.restaurant_dish_votes v
      join public.group_members gm on gm.user_id = v.user_id
      join public.places p on p.group_id = gm.group_id and p.restaurant_id = rd.restaurant_id
     where v.dish_id = rd.id and v.vote = 'confirm') >= 2
  where rd.restaurant_id = target;
  perform public.refresh_menu_price(target);
  perform public.menu_settle(target);
  return added;
end $$;

-- ✓ "on the menu at this price" / ✕ "not on the menu any more". Flagged-out dishes hide, and are
-- deleted once 3 people flag them and nobody confirmed.
create or replace function public.vote_restaurant_dish(target_dish uuid, choice text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r uuid;
begin
  select restaurant_id into r from public.restaurant_dishes where id = target_dish;
  if r is null or not (public.my_restaurant(r) or public.manages_restaurant(r)) then raise exception 'Not one of your restaurants'; end if;
  -- The owner ticking ✓ simply confirms it.
  if choice = 'confirm' and public.manages_restaurant(r) then
    update public.restaurant_dishes set owner_ok = true, hidden = false where id = target_dish;
  end if;
  if choice is not null and public.over_daily_cap('vote') then raise exception 'That’s a lot of ticks for one day — try again tomorrow.'; end if;
  if choice is null then
    delete from public.restaurant_dish_votes where dish_id = target_dish and user_id = auth.uid();
  elsif choice in ('confirm', 'flag') then
    insert into public.restaurant_dish_votes (dish_id, user_id, vote) values (target_dish, auth.uid(), choice)
    on conflict (dish_id, user_id) do update set vote = excluded.vote, created_at = now();
  else
    raise exception 'Bad vote';
  end if;
  update public.restaurant_dishes rd set
    confirms = (select count(*) from public.restaurant_dish_votes v where v.dish_id = rd.id and v.vote = 'confirm'),
    flags = (select count(*) from public.restaurant_dish_votes v where v.dish_id = rd.id and v.vote = 'flag')
  where rd.id = target_dish;
  update public.restaurant_dishes set hidden = (flags >= 2 and flags > confirms and not owner_ok) where id = target_dish;
  -- (Dish checks are part of using the menu: no points.)
  update public.restaurant_dishes rd set claimed = rd.owner_ok or (
    select count(distinct p.group_id) from public.restaurant_dish_votes v
      join public.group_members gm on gm.user_id = v.user_id
      join public.places p on p.group_id = gm.group_id and p.restaurant_id = rd.restaurant_id
     where v.dish_id = rd.id and v.vote = 'confirm') >= 2
  where rd.id = target_dish;
  delete from public.restaurant_dishes where id = target_dish and flags >= 3 and confirms = 0 and not owner_ok;
  perform public.refresh_menu_price(r);
  perform public.menu_settle(r);
end $$;

-- Crumbs' own search, checked before Google: restaurants other groups already saved.
create or replace function public.search_restaurants(q text, lat double precision default null, lng double precision default null)
returns setof public.restaurants language sql stable security definer set search_path = public as $$
  select * from public.restaurants
  where length(trim(q)) >= 3 and lower(name) like '%' || lower(trim(q)) || '%'
    and (lat is null or latitude is null or (abs(latitude - lat) < 0.5 and abs(longitude - lng) < 0.7))
  order by places_count desc, (case when lat is null or latitude is null then 0 else abs(latitude - lat) + abs(longitude - lng) end)
  limit 5
$$;

do $$
declare f text;
begin
  foreach f in array array['my_restaurant(uuid)', 'link_restaurant(uuid)', 'share_restaurant_hours(uuid, jsonb, text)',
                           'add_restaurant_dishes(uuid, jsonb, text)', 'vote_restaurant_dish(uuid, text)',
                           'search_restaurants(text, double precision, double precision)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================================================
-- 13c. Owning the data: where each fact came from, member contributions, open data
-- ============================================================================================
-- Every profile field remembers its source: 'crumbs' (seen by members), 'osm' (OpenStreetMap,
-- free to keep), or 'google' (temporary — Google's terms don't let us keep it). Members' own
-- observations beat open data, and open data beats Google. Before going public the 'google'
-- fields can be dropped without losing anything Crumbs owns.
alter table public.restaurants add column if not exists sources jsonb not null default '{}'::jsonb;
alter table public.restaurants add column if not exists verified jsonb not null default '{}'::jsonb;
alter table public.restaurants add column if not exists phone text check (phone is null or char_length(phone) <= 40);
alter table public.restaurants add column if not exists google_place_id text;
alter table public.restaurants add column if not exists osm_id text;
alter table public.restaurants add column if not exists osm_checked_at timestamptz;

-- Fields we know the source of, from how the profile was first made.
create or replace function public.default_sources(r public.restaurants)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name', case when r.name is not null then src end,
    'address', case when r.formatted_address is not null then src end,
    'location', case when r.latitude is not null then src end,
    'cuisine', case when r.cuisine is not null then src end,
    'price_level', case when r.price_level is not null then src end,
    'website', case when r.website is not null then src end,
    'hours', case when r.opening_hours is not null then src end,
    'status', case when r.business_status is not null then src end
  ))
  from (select case when r.source_key like 'osm:%' then 'osm' else 'google' end as src) s
$$;
create or replace function public.fill_restaurant_sources()
returns trigger language plpgsql as $$
begin
  new.sources := public.default_sources(new) || coalesce(new.sources, '{}'::jsonb);
  if new.google_place_id is null and new.source_key not like 'osm:%' then new.google_place_id := new.source_key; end if;
  return new;
end $$;
drop trigger if exists restaurants_sources on public.restaurants;
create trigger restaurants_sources before insert or update on public.restaurants
  for each row execute function public.fill_restaurant_sources();

-- What members told us. One row per person per fact (their latest answer).
create table if not exists public.restaurant_facts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  field text not null check (field in ('name', 'address', 'location', 'hours', 'phone', 'website', 'price_level', 'cuisine', 'status')),
  value jsonb not null,
  evidence text not null check (evidence in ('in_person', 'photo', 'website', 'receipt', 'phone_call')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, field, user_id)
);
create index if not exists restaurant_facts_restaurant_idx on public.restaurant_facts (restaurant_id, field);
alter table public.restaurant_facts enable row level security;
drop policy if exists restaurant_facts_read on public.restaurant_facts;
create policy restaurant_facts_read on public.restaurant_facts for select to authenticated using (user_id = (select auth.uid()));

-- Writes one detail onto the shared profile (used by members' answers, owners, and member
-- agreement while an owner is away). src = where it came from; info = the check record.
create or replace function public.apply_fact(target uuid, fact text, v jsonb, src text, info jsonb)
returns void language sql security definer set search_path = public as $$
  update public.restaurants set
    name = case when fact = 'name' then left(v #>> '{}', 160) else name end,
    formatted_address = case when fact = 'address' then v #>> '{}' else formatted_address end,
    phone = case when fact = 'phone' then left(v #>> '{}', 40) else phone end,
    website = case when fact = 'website' then v #>> '{}' else website end,
    cuisine = case when fact = 'cuisine' then left(v #>> '{}', 60) else cuisine end,
    price_level = case when fact = 'price_level' then (v::text)::smallint else price_level end,
    business_status = case when fact = 'status' then v #>> '{}' else business_status end,
    opening_hours = case when fact = 'hours' then v else opening_hours end,
    hours_checked_at = case when fact in ('hours', 'status') then now() else hours_checked_at end,
    latitude = case when fact = 'location' then (v->>'lat')::float8 else latitude end,
    longitude = case when fact = 'location' then (v->>'lng')::float8 else longitude end,
    sources = sources || jsonb_build_object(fact, src),
    verified = verified || jsonb_build_object(fact, info),
    updated_at = now()
  where id = target
$$;
revoke execute on function public.apply_fact(uuid, text, jsonb, text, jsonb) from public, anon, authenticated;

-- A member adds or confirms a fact they saw themselves. Applied straight away over Google or
-- open data; changing something members already set needs two people to agree.
create or replace function public.contribute_fact(target uuid, fact text, val jsonb, how text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
  me uuid := auth.uid();
  v jsonb := val;
  current jsonb;
  agree integer;
  src text;
  applied boolean := false;
  groups_agree integer;
  claimed boolean;
  was_claimed boolean;
  manager boolean := public.manages_restaurant(target);
  last_at timestamptz;
  new_info boolean;
  confirming boolean;
  locked boolean;
  far boolean := false;
  shaky boolean := false;
  earned integer := 0;
begin
  if not (public.my_restaurant(target) or manager) then raise exception 'Not one of your restaurants'; end if;
  if not manager and public.over_daily_cap('fact') then raise exception 'That’s a lot of details for one day — thank you! Try again tomorrow.'; end if;
  -- #171 Someone whose details are rarely backed up needs a second person to agree first.
  shaky := coalesce(public.user_trust(me) < 0.3, false);
  select * into r from public.restaurants where id = target;
  -- Verified by Owner: most details are the restaurant's to change. A member's answer is kept as
  -- a suggestion the owner sees in "Your restaurants" (no points; applies only if enough people
  -- agree while the owner is away — see settle_owner_suggestions).
  locked := not manager and r.owner_verified and public.owner_locked(fact);
  -- Validate + tidy each kind of fact.
  if fact in ('name', 'address', 'phone', 'website', 'cuisine') then
    if jsonb_typeof(v) <> 'string' or length(trim(v #>> '{}')) = 0 or length(v #>> '{}') > 300 then raise exception 'Bad value'; end if;
    v := to_jsonb(trim(v #>> '{}'));
    if fact = 'website' and (v #>> '{}') !~* '^https?://' then raise exception 'Website must start with http'; end if;
  elsif fact = 'price_level' then
    if jsonb_typeof(v) <> 'number' or (v::text)::int not between 0 and 4 then raise exception 'Bad price'; end if;
  elsif fact = 'status' then
    if (v #>> '{}') not in ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY') then raise exception 'Bad status'; end if;
  elsif fact = 'location' then
    if jsonb_typeof(v->'lat') <> 'number' or jsonb_typeof(v->'lng') <> 'number' then raise exception 'Bad location'; end if;
    -- ~1 m precision is plenty, and means two phones standing at the door can agree.
    v := jsonb_build_object('lat', round((v->>'lat')::numeric, 5)::float8, 'lng', round((v->>'lng')::numeric, 5)::float8);
  elsif fact = 'hours' then
    if jsonb_typeof(v->'periods') <> 'array' or jsonb_array_length(v->'periods') > 30 or jsonb_typeof(v->'utc') <> 'number' then
      raise exception 'Bad hours';
    end if;
  else
    raise exception 'Unknown field';
  end if;

  insert into public.restaurant_facts (restaurant_id, field, value, evidence, user_id)
  values (target, fact, v, how, me)
  on conflict (restaurant_id, field, user_id) do update set value = excluded.value, evidence = excluded.evidence, created_at = now();
  if manager then
    update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = me;
  end if;
  if locked then
    perform public.settle_owner_suggestions(target);
    return jsonb_build_object('applied', false, 'agree', 1, 'claimed', false, 'points', 0, 'locked', true);
  end if;

  select count(*) into agree from public.restaurant_facts f where f.restaurant_id = target and f.field = fact and f.value = v;
  -- Cross-check: how many different groups' members independently said the same thing.
  select count(distinct p.group_id) into groups_agree
    from public.restaurant_facts f
    join public.group_members gm on gm.user_id = f.user_id
    join public.places p on p.group_id = gm.group_id and p.restaurant_id = target
   where f.restaurant_id = target and f.field = fact and f.value = v;
  src := r.sources->>fact;
  current := public.fact_value(r, fact);
  -- A map pin moved more than ~300 m always needs two people.
  if fact = 'location' and r.latitude is not null then
    far := abs(r.latitude - (v->>'lat')::float8) > 0.003 or abs(r.longitude - (v->>'lng')::float8) > 0.004;
  end if;

  -- Claimed = verified as Crumbs' own: two different groups agree, or a member independently
  -- confirmed what OpenStreetMap says, or two people agree and one of them had a photo.
  was_claimed := coalesce((r.verified->fact->>'claimed')::boolean, false);
  last_at := coalesce((r.verified->fact->>'at')::timestamptz, case when src = 'osm' then r.osm_checked_at end);
  -- Points for NEW info: filling a gap, giving Crumbs its own copy of something only Google had,
  -- or a re-check that's due. A change earns once it actually applies (below).
  new_info := current is null or coalesce(src, 'google') not in ('crumbs', 'osm', 'owner')
            or last_at is null or last_at < now() - make_interval(days => public.fact_refresh_days(fact));
  -- A smaller point for helping make a detail Crumbs' own: confirming a member's or open-data
  -- value that isn't claimed yet — only the first few confirmations, never the 30th.
  confirming := not new_info and not was_claimed and current = v and src in ('crumbs', 'osm') and agree <= 3;
  claimed := manager or groups_agree >= 2
    or (src = 'osm' and current = v)
    or (agree >= 2 and exists (select 1 from public.restaurant_facts f where f.restaurant_id = target
                                 and f.field = fact and f.value = v and f.evidence in ('photo', 'receipt')));
  -- The restaurant's own confirmed manager always wins; members need 3 to overrule them.
  -- On a Verified-by-Owner page the details members may still change (e.g. a closure) need 3.
  if manager or (src = 'owner' and (agree >= 3 or current = v))
     or (not r.owner_verified or agree >= 3) and not ((far or shaky) and agree < 2) and
        (coalesce(src, '') not in ('crumbs', 'owner') or current is null or (src = 'crumbs' and agree >= 2) or current = v) then
    applied := current is distinct from v or src is distinct from 'crumbs';
    if src = 'owner' and not manager and current = v then applied := false; end if;
    perform public.apply_fact(target, fact, v,
      case when manager then 'owner' when src = 'owner' and current = v then 'owner' else 'crumbs' end,
      jsonb_build_object('n', agree, 'groups', groups_agree, 'claimed', claimed, 'at', now()));
  end if;
  if applied and current is distinct from v then new_info := true; end if;
  if manager then new_info := false; confirming := false; end if; -- owners keep their own page right
  if new_info then
    earned := public.award_points(me, 'fact', public.points_for('detail'), target, target || ':' || fact || ':' || to_char(now(), 'YYYY-MM'));
  elsif confirming then
    earned := public.award_points(me, 'confirm', public.points_for('confirm'), target, target || ':' || fact || ':confirm:' || to_char(now(), 'YYYY-MM'));
  end if;
  -- When it becomes Crumbs' own, the people who said it before get ONE small bonus each —
  -- however many more agree later.
  if claimed and not was_claimed and not manager then
    perform public.award_points(f.user_id, 'backed', public.points_for('backed'), target, target || ':' || fact || ':backed:' || to_char(now(), 'YYYY-MM'))
      from public.restaurant_facts f
     where f.restaurant_id = target and f.field = fact and f.value = v and f.user_id is not null and f.user_id <> me;
  end if;
  return jsonb_build_object('applied', applied, 'agree', agree, 'claimed', claimed, 'points', earned);
end $$;

-- OpenStreetMap facts (free to keep forever, with credit). Fill only what's missing or from Google.
create or replace function public.merge_open_data(target uuid, data jsonb, osm text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
  can_use boolean;
begin
  if not public.my_restaurant(target) then raise exception 'Not one of your restaurants'; end if;
  select * into r from public.restaurants where id = target;
  update public.restaurants set
    osm_id = coalesce(left(osm, 40), osm_id),
    osm_checked_at = now(),
    formatted_address = case when data ? 'address' and coalesce(sources->>'address', 'google') = 'google' then left(data->>'address', 300) else formatted_address end,
    phone = case when data ? 'phone' and coalesce(sources->>'phone', 'google') = 'google' then left(data->>'phone', 40) else phone end,
    website = case when data ? 'website' and (data->>'website') ~* '^https?://' and coalesce(sources->>'website', 'google') = 'google' then left(data->>'website', 300) else website end,
    cuisine = case when data ? 'cuisine' and coalesce(sources->>'cuisine', 'google') = 'google' then left(data->>'cuisine', 60) else cuisine end,
    opening_hours = case when jsonb_typeof(data->'hours'->'periods') = 'array' and coalesce(sources->>'hours', 'google') = 'google' then data->'hours' else opening_hours end,
    hours_checked_at = case when jsonb_typeof(data->'hours'->'periods') = 'array' and coalesce(sources->>'hours', 'google') = 'google' then now() else hours_checked_at end,
    sources = sources || jsonb_strip_nulls(jsonb_build_object(
      'address', case when data ? 'address' and coalesce(sources->>'address', 'google') = 'google' then 'osm' end,
      'phone', case when data ? 'phone' and coalesce(sources->>'phone', 'google') = 'google' then 'osm' end,
      'website', case when data ? 'website' and (data->>'website') ~* '^https?://' and coalesce(sources->>'website', 'google') = 'google' then 'osm' end,
      'cuisine', case when data ? 'cuisine' and coalesce(sources->>'cuisine', 'google') = 'google' then 'osm' end,
      'hours', case when jsonb_typeof(data->'hours'->'periods') = 'array' and coalesce(sources->>'hours', 'google') = 'google' then 'osm' end
    )),
    updated_at = now()
  where id = target;
end $$;

-- What Crumbs itself knows about a restaurant from all groups' visits — only as totals, and only
-- once there are enough visits that no single group can be picked out.
create or replace function public.restaurant_insights(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not (public.my_restaurant(target) or public.manages_restaurant(target)) then raise exception 'Not one of your restaurants'; end if;
  select jsonb_build_object(
    'visits', count(*),
    'groups', count(distinct p.group_id),
    'per_head', case when count(*) filter (where v.spend > 0 and v.people > 0) >= 3
                  then round(avg(v.spend / v.people) filter (where v.spend > 0 and v.people > 0), 0) end,
    'takeout_share', case when count(*) >= 5
                  then round(100.0 * count(*) filter (where v.kind in ('takeout', 'delivery')) / count(*)) end
  ) into result
  from public.place_visits v join public.places p on p.id = v.place_id
  where p.restaurant_id = target;
  return result;
end $$;
revoke execute on function public.restaurant_insights(uuid) from public, anon;
grant execute on function public.restaurant_insights(uuid) to authenticated;

-- Your contributions (for the profile page and badges).
create or replace function public.my_contributions()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  facts integer; dishes integer; checks integer; places integer; verified integer; points integer; tier integer;
  lifetime integer; expiring integer;
begin
  select count(*) into facts from public.restaurant_facts where user_id = me;
  select count(*) into dishes from public.restaurant_dishes where added_by = me;
  select count(*) into checks from public.restaurant_dish_votes where user_id = me;
  select count(distinct restaurant_id) into places from (
    select restaurant_id from public.restaurant_facts where user_id = me
    union all select restaurant_id from public.restaurant_dishes where added_by = me) x;
  -- Your facts that others later backed up (now claimed as Crumbs' own) count extra.
  select count(*) into verified from public.restaurant_facts f join public.restaurants r on r.id = f.restaurant_id
   where f.user_id = me and coalesce((r.verified->f.field->>'claimed')::boolean, false)
     and f.value = case f.field
       when 'name' then to_jsonb(r.name) when 'address' then to_jsonb(r.formatted_address)
       when 'phone' then to_jsonb(r.phone) when 'website' then to_jsonb(r.website)
       when 'cuisine' then to_jsonb(r.cuisine) when 'price_level' then to_jsonb(r.price_level)
       when 'status' then to_jsonb(r.business_status) when 'hours' then r.opening_hours else null end;
  -- Points only count for a while (point_rules.window_days), so tiers have to be kept up.
  select coalesce(sum(cp.points), 0) into points from public.contribution_points cp
   where cp.user_id = me and cp.created_at > now() - make_interval(days => public.points_window_days());
  select coalesce(sum(cp.points), 0) into lifetime from public.contribution_points cp where cp.user_id = me;
  select coalesce(sum(cp.points), 0) into expiring from public.contribution_points cp
   where cp.user_id = me and cp.created_at > now() - make_interval(days => public.points_window_days())
     and cp.created_at <= now() - make_interval(days => public.points_window_days() - 30);
  tier := public.tier_for_points(points);
  return jsonb_build_object('facts', facts, 'dishes', dishes, 'checks', checks, 'restaurants', places,
                            'verified', verified, 'points', points, 'tier', tier,
                            'lifetime', lifetime, 'expiring', expiring, 'window_days', public.points_window_days(),
                            'today', (select coalesce(sum(c.points), 0) from public.contribution_points c
                                       where c.user_id = me and c.created_at >= date_trunc('day', now())),
                            'rules', (select to_jsonb(pr) - 'id' from public.point_rules pr where pr.id = 1),
                            'menu_active', (select count(*) from public.menu_contributions m where m.user_id = me and m.stage = 'active'),
                            'menu_waiting', (select count(*) from public.menu_contributions m where m.user_id = me and m.stage = 'waiting'),
                            'allowances', (select coalesce(jsonb_object_agg(b.kind, b.per_tier[least(tier, 4) + 1]), '{}')
                                             from public.usage_budgets b),
                            'manages', (select coalesce(jsonb_agg(restaurant_id), '[]') from public.restaurant_managers where user_id = me),
                            'caps', public.my_day_caps());
end $$;

do $$
declare f text;
begin
  foreach f in array array['contribute_fact(uuid, text, jsonb, text)', 'merge_open_data(uuid, jsonb, text)', 'my_contributions()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
update public.restaurants set sources = sources where true; -- backfill sources on existing rows

-- ============================================================================================
-- 13d. Quick questions, points, allowances and restaurant owners
-- ============================================================================================
-- How long a member-checked detail stays fresh before Crumbs asks someone to check it again.
create or replace function public.fact_refresh_days(fact text)
returns integer language sql immutable as $$
  select case fact when 'phone' then 180 when 'website' then 180 when 'hours' then 120
                   when 'price_level' then 365 when 'status' then 90 else 3650 end
$$;

-- Points ledger: every award is a row, so points can expire and be audited.
-- Only NEW information earns points (a gap filled, Crumbs' own copy of a detail, a due re-check,
-- the first few confirmations that make a detail Crumbs' own, new menu dishes). Things that are
-- just part of using the app — logging a visit, receipts, website imports, ticking dishes — still
-- feed the data but earn nothing. No daily cap: points expire (window_days), so tiers have to be
-- earned again and again. All the numbers live in point_rules (Admin → Points can change them).
create table if not exists public.point_rules (
  id integer primary key default 1 check (id = 1),
  window_days integer not null default 90 check (window_days between 14 and 730),
  tiers integer[] not null default '{30,100,250,600}', -- points needed for tiers 1..4
  detail integer not null default 2,     -- a new detail / a change that applies / a due re-check
  confirm integer not null default 1,    -- one of the first confirmations of a not-yet-claimed detail
  backed integer not null default 2,     -- once, when others back up what you said
  menu_try integer not null default 1,   -- every menu_set new dishes that enter your points queue
  menu_ok integer not null default 2,    -- every menu_set of your dishes confirmed (item + price)
  menu_queue integer not null default 50 -- dishes that can sit in your points queue at once
);
alter table public.point_rules add column if not exists menu_set integer not null default 5;
insert into public.point_rules (id) values (1) on conflict (id) do nothing;
-- (earlier test default: sets of 3, 1 + 1 points, 10 sets)
update public.point_rules set menu_ok = 2, menu_queue = 50 where menu_ok = 1 and menu_queue = 10;
alter table public.point_rules enable row level security;
drop policy if exists point_rules_read on public.point_rules;
create policy point_rules_read on public.point_rules for select to authenticated using (true);

drop function if exists public.points_daily_cap();
create or replace function public.points_window_days() returns integer language sql stable as $$
  select coalesce((select window_days from public.point_rules where id = 1), 90)
$$;
create or replace function public.points_for(what text) returns integer language sql stable as $$
  select coalesce((select case what when 'detail' then detail when 'confirm' then confirm when 'backed' then backed
                                    when 'menu_try' then menu_try when 'menu_ok' then menu_ok end
                     from public.point_rules where id = 1), 0)
$$;
create or replace function public.tier_for_points(p integer)
returns integer language sql stable as $$
  select coalesce((select (select count(*)::int from unnest(pr.tiers) t where p >= t)
                     from public.point_rules pr where pr.id = 1), 0)
$$;
create or replace function public.set_point_rules(rules jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  t integer[] := array(select jsonb_array_elements_text(rules->'tiers')::int);
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  if array_length(t, 1) <> 4 or t[1] <= 0 or t[2] <= t[1] or t[3] <= t[2] or t[4] <= t[3] then
    raise exception 'Tiers need 4 rising numbers';
  end if;
  update public.point_rules set
    window_days = least(730, greatest(14, (rules->>'window_days')::int)), tiers = t,
    detail = least(20, greatest(0, (rules->>'detail')::int)), confirm = least(20, greatest(0, (rules->>'confirm')::int)),
    backed = least(20, greatest(0, (rules->>'backed')::int)), menu_try = least(20, greatest(0, (rules->>'menu_try')::int)),
    menu_ok = least(20, greatest(0, (rules->>'menu_ok')::int)), menu_queue = least(500, greatest(0, (rules->>'menu_queue')::int)),
    menu_set = least(50, greatest(1, coalesce((rules->>'menu_set')::int, menu_set))),
    day_caps = case when jsonb_typeof(rules->'day_caps') = 'object' then day_caps || (rules->'day_caps') else day_caps end
  where id = 1;
end $$;
create table if not exists public.contribution_points (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  points integer not null check (points between 0 and 20),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  ref text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists contribution_points_user_idx on public.contribution_points (user_id, created_at);
alter table public.contribution_points enable row level security;
drop policy if exists contribution_points_read on public.contribution_points;
create policy contribution_points_read on public.contribution_points for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.award_points(uid uuid, what text, pts integer, rid uuid, tag text)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if uid is null or coalesce(pts, 0) <= 0 then return 0; end if;
  insert into public.contribution_points (user_id, kind, points, restaurant_id, ref)
  values (uid, what, pts, rid, left(tag, 200))
  on conflict (user_id, kind, ref) do nothing;
  if not found then return 0; end if; -- each thing earns once
  -- Expired rows are kept a while for the audit trail, then tidied (keeps the database small).
  delete from public.contribution_points where user_id = uid and created_at < now() - interval '400 days';
  return pts;
end $$;
-- This person's tier from their last 6 months of points (used for daily allowances).
create or replace function public.my_tier()
returns integer language sql stable security definer set search_path = public as $$
  select public.tier_for_points(coalesce((select sum(points) from public.contribution_points
    where user_id = (select auth.uid()) and created_at > now() - make_interval(days => public.points_window_days())), 0)::int)
$$;
revoke execute on function public.award_points(uuid, text, integer, uuid, text) from public, anon, authenticated;

-- "Not sure" / "not now" on a quick question: don't ask this person that again for a while.
create table if not exists public.restaurant_question_skips (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  field text not null,
  until timestamptz not null,
  primary key (user_id, restaurant_id, field)
);
alter table public.restaurant_question_skips enable row level security;
drop policy if exists question_skips_read on public.restaurant_question_skips;
create policy question_skips_read on public.restaurant_question_skips for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.skip_question(target uuid, fact text, days integer default 7)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.my_restaurant(target) then raise exception 'Not one of your restaurants'; end if;
  insert into public.restaurant_question_skips (user_id, restaurant_id, field, until)
  values (auth.uid(), target, left(fact, 20), now() + make_interval(days => least(greatest(days, 1), 365)))
  on conflict (user_id, restaurant_id, field) do update set until = excluded.until;
end $$;

-- The one question to ask this person about this restaurant (or null). Asks about everything
-- Crumbs can't call its own yet: missing → only Google's (can't be kept) → said by one member
-- (needs a cross-check) → open data (fine to use, better to own) → our own when a re-check is due.
-- Each person gets a different order, so the same unanswerable question isn't asked of everyone.
-- skip = details this phone can't answer right now (e.g. the map pin when you're not there).
drop function if exists public.next_question(uuid);
create or replace function public.next_question(target uuid, skip text[] default '{}')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.restaurants;
  me uuid := auth.uid();
  pick record;
begin
  if not public.my_restaurant(target) then return null; end if;
  select * into r from public.restaurants where id = target;
  select * into pick from (
    select f.field,
      case when f.val is null then 1                                          -- missing
           when coalesce(r.sources->>f.field, 'google') = 'google' then 2      -- only Google's: can't keep it
           when not coalesce((r.verified->f.field->>'claimed')::boolean, false) and r.sources->>f.field = 'crumbs' then 3 -- one member said it: needs a cross-check
           when not coalesce((r.verified->f.field->>'claimed')::boolean, false) and r.sources->>f.field = 'osm' then 4    -- open data: fine to use, better to own
           else 5 end as tier,                                                -- ours: re-check when due
      coalesce((r.verified->f.field->>'at')::timestamptz, case when r.sources->>f.field = 'osm' then r.osm_checked_at end) as last_at
    -- (Price comes from menu prices; "still open?" isn't asked.)
    from (values
      ('hours', r.opening_hours::text), ('phone', r.phone), ('website', r.website), ('cuisine', r.cuisine),
      ('address', r.formatted_address), ('name', r.name),
      ('location', case when r.latitude is null then null else r.latitude::text end)
    ) as f(field, val)
    where not (f.field = any(skip))
      and not exists (select 1 from public.restaurant_question_skips k
                       where k.user_id = me and k.restaurant_id = target and k.field = f.field and k.until > now())
      and not exists (select 1 from public.restaurant_facts x
                       where x.user_id = me and x.restaurant_id = target and x.field = f.field
                         and x.created_at > now() - make_interval(days => least(public.fact_refresh_days(f.field), 365)))
      -- The restaurant's owner keeps their own details current.
      and coalesce(r.sources->>f.field, '') <> 'owner'
      and not (r.owner_verified and public.owner_locked(f.field))
  ) c
  where c.tier < 5 or c.last_at is null or c.last_at < now() - make_interval(days => public.fact_refresh_days(c.field))
  order by c.tier, c.last_at nulls first, md5(me::text || c.field || target::text)
  limit 1;
  if pick.field is null then return null; end if;
  return jsonb_build_object('field', pick.field,
                            'reason', case pick.tier when 1 then 'missing' when 2 then 'unowned' when 3 then 'unclaimed'
                                                     when 4 then 'open_data' else 'stale' end,
                            'checked_at', pick.last_at);
end $$;

-- Allowances: anything that costs money or uses a free quota has a per-person daily allowance
-- (bigger for contributor tiers) AND an overall budget, so Crumbs can never be run into a bill.
create table if not exists public.usage_budgets (
  kind text primary key,
  daily_total integer,          -- everyone together, per day (null = no daily cap)
  monthly_total integer,        -- everyone together, per calendar month (null = none)
  per_tier integer[] not null,  -- per person per day, by tier 0..4
  note text
);
insert into public.usage_budgets (kind, daily_total, monthly_total, per_tier, note) values
  ('ai', 150, 3000, '{3,4,5,6,8}', 'AI ideas (Vercel AI Gateway credit)'),
  ('menu_import', 60, 1200, '{2,2,3,3,4}', 'Import menu from website (AI)'),
  ('explore', 1500, null, '{15,20,25,30,40}', 'OpenStreetMap Explore / nearby (free, fair use)'),
  ('google', 40, 900, '{10,12,15,18,20}', 'Google place details + hours (1,000 Enterprise free a month)'),
  ('menu_photo_ai', 20, 300, '{0,0,0,0,0}', 'Menu photo read by AI (admins only until per-person numbers are raised)')
on conflict (kind) do nothing;
create table if not exists public.usage_counts (
  kind text not null,
  day date not null,
  user_id uuid not null, -- all zeros = everyone together
  count integer not null default 0,
  primary key (kind, day, user_id)
);
alter table public.usage_budgets enable row level security;
alter table public.usage_counts enable row level security;
drop policy if exists usage_budgets_read on public.usage_budgets;
create policy usage_budgets_read on public.usage_budgets for select to authenticated using (true);

create or replace function public.use_allowance(what text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.usage_budgets;
  me uuid := auth.uid();
  everyone constant uuid := '00000000-0000-0000-0000-000000000000';
  admin boolean := public.is_crumbs_admin();
  tier integer;
  mine integer;
  total integer;
  month integer;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'signin'); end if;
  select * into b from public.usage_budgets where kind = what;
  if b.kind is null then return jsonb_build_object('ok', true); end if;
  tier := public.my_tier();
  select count into mine from public.usage_counts where kind = what and day = current_date and user_id = me;
  select count into total from public.usage_counts where kind = what and day = current_date and user_id = everyone;
  select coalesce(sum(count), 0) into month from public.usage_counts
   where kind = what and user_id = everyone and day >= date_trunc('month', current_date);
  if b.monthly_total is not null and month >= b.monthly_total then
    return jsonb_build_object('ok', false, 'reason', 'budget_month');
  end if;
  if b.daily_total is not null and coalesce(total, 0) >= b.daily_total then
    return jsonb_build_object('ok', false, 'reason', 'budget_day');
  end if;
  if not admin and coalesce(mine, 0) >= b.per_tier[least(tier, 4) + 1] then
    return jsonb_build_object('ok', false, 'reason', 'personal', 'limit', b.per_tier[least(tier, 4) + 1]);
  end if;
  insert into public.usage_counts (kind, day, user_id, count) values (what, current_date, me, 1), (what, current_date, everyone, 1)
  on conflict (kind, day, user_id) do update set count = usage_counts.count + 1;
  delete from public.usage_counts where day < current_date - 62; -- keep two months
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.usage_today()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', b.kind, 'note', b.note, 'daily_total', b.daily_total, 'monthly_total', b.monthly_total, 'per_tier', b.per_tier,
    'today', coalesce((select count from public.usage_counts c where c.kind = b.kind and c.day = current_date
                        and c.user_id = '00000000-0000-0000-0000-000000000000'), 0),
    'month', coalesce((select sum(count) from public.usage_counts c where c.kind = b.kind
                        and c.day >= date_trunc('month', current_date) and c.user_id = '00000000-0000-0000-0000-000000000000'), 0)
  ) order by b.kind), '[]')
  from public.usage_budgets b
  where public.is_crumbs_admin()
$$;

create or replace function public.set_budget(what text, daily integer, monthly integer, tiers integer[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  if array_length(tiers, 1) <> 5 then raise exception 'Need 5 tier values'; end if;
  update public.usage_budgets set daily_total = daily, monthly_total = monthly, per_tier = tiers where kind = what;
end $$;

-- Restaurant owners (#100): claim a profile; once an admin approves, the page is "Verified by
-- Owner": their details apply straight away as the 'owner' source and most details are theirs
-- alone to change (members can send suggestions). See 13e.
create table if not exists public.restaurant_claims (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  role text check (role is null or char_length(role) <= 60),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  proof text check (proof is null or char_length(proof) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (restaurant_id, user_id)
);
create table if not exists public.restaurant_managers (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  since timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
alter table public.restaurant_claims enable row level security;
alter table public.restaurant_managers enable row level security;
drop policy if exists restaurant_claims_read on public.restaurant_claims;
create policy restaurant_claims_read on public.restaurant_claims for select to authenticated
  using (user_id = (select auth.uid()) or public.is_crumbs_admin());
drop policy if exists restaurant_managers_read on public.restaurant_managers;
create policy restaurant_managers_read on public.restaurant_managers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_crumbs_admin());

create or replace function public.manages_restaurant(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.restaurant_managers where restaurant_id = target and user_id = (select auth.uid()))
$$;

create or replace function public.claim_restaurant(target uuid, contact text, job text, mail text, tel text, evidence text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.my_restaurant(target) then raise exception 'Save this restaurant first, then claim it'; end if;
  insert into public.restaurant_claims (restaurant_id, user_id, contact_name, role, email, phone, proof)
  values (target, auth.uid(), trim(contact), nullif(trim(job), ''), nullif(trim(mail), ''), nullif(trim(tel), ''), nullif(trim(evidence), ''))
  on conflict (restaurant_id, user_id) do update set contact_name = excluded.contact_name, role = excluded.role,
    email = excluded.email, phone = excluded.phone, proof = excluded.proof, status = 'pending', created_at = now();
end $$;

create or replace function public.review_claim(claim uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.restaurant_claims;
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  update public.restaurant_claims set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now()
   where id = claim returning * into c;
  if approve and c.id is not null then
    insert into public.restaurant_managers (restaurant_id, user_id) values (c.restaurant_id, c.user_id) on conflict do nothing;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['skip_question(uuid, text, integer)', 'next_question(uuid, text[])', 'use_allowance(text)', 'usage_today()',
                           'set_point_rules(jsonb)',
                           'set_budget(text, integer, integer, integer[])', 'manages_restaurant(uuid)',
                           'claim_restaurant(uuid, text, text, text, text, text)', 'review_claim(uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================================================
-- 13e. Verified by Owner, "Your restaurants" and menu-based price
-- ============================================================================================
alter table public.restaurants add column if not exists owner_verified boolean not null default false;
alter table public.restaurant_dishes add column if not exists owner_ok boolean not null default false;

-- Details only the restaurant can change once its page is Verified by Owner. Members can still
-- send the owner a suggestion. Open this list up field by field later if needed (status stays
-- open so a closure can still be reported).
create or replace function public.owner_locked(fact text)
returns boolean language sql immutable as $$
  select fact in ('name', 'address', 'location', 'hours', 'phone', 'website', 'cuisine', 'price_level')
$$;

-- The current value of one detail, as jsonb (same shape members send).
create or replace function public.fact_value(r public.restaurants, fact text)
returns jsonb language sql stable as $$
  select case fact
    when 'name' then to_jsonb(r.name) when 'address' then to_jsonb(r.formatted_address)
    when 'phone' then to_jsonb(r.phone) when 'website' then to_jsonb(r.website)
    when 'cuisine' then to_jsonb(r.cuisine) when 'price_level' then to_jsonb(r.price_level)
    when 'status' then to_jsonb(r.business_status) when 'hours' then r.opening_hours
    when 'location' then case when r.latitude is null then null else jsonb_build_object('lat', r.latitude, 'lng', r.longitude) end
  end
$$;

-- Approved claim ⇄ "Verified by Owner" on the page and a "Restaurant owner" tag on the person.
create or replace function public.sync_owner_flags()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid uuid := coalesce(new.restaurant_id, old.restaurant_id);
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  perform set_config('crumbs.owner_sync', 'on', true);
  update public.restaurants set owner_verified = exists (select 1 from public.restaurant_managers m where m.restaurant_id = rid)
   where id = rid;
  update public.profiles set restaurant_owner = exists (select 1 from public.restaurant_managers m where m.user_id = uid)
   where id = uid;
  perform set_config('crumbs.owner_sync', 'off', true);
  return null;
end $$;
drop trigger if exists restaurant_managers_flags on public.restaurant_managers;
create trigger restaurant_managers_flags after insert or delete on public.restaurant_managers
  for each row execute function public.sync_owner_flags();
update public.restaurants r set owner_verified = exists (select 1 from public.restaurant_managers m where m.restaurant_id = r.id)
 where owner_verified is distinct from exists (select 1 from public.restaurant_managers m where m.restaurant_id = r.id);
update public.profiles p set restaurant_owner = exists (select 1 from public.restaurant_managers m where m.user_id = p.id)
 where restaurant_owner is distinct from exists (select 1 from public.restaurant_managers m where m.user_id = p.id);

-- Owners also see dishes members flagged off their menu (to fix or remove them).
drop policy if exists restaurant_dishes_read on public.restaurant_dishes;
create policy restaurant_dishes_read on public.restaurant_dishes for select to authenticated
  using (hidden = false or public.is_crumbs_admin() or public.manages_restaurant(restaurant_id));

-- Admin: take owner access away again (e.g. the restaurant changed hands).
create or replace function public.remove_manager(target uuid, uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  delete from public.restaurant_managers where restaurant_id = target and user_id = uid;
  update public.restaurant_claims set status = 'rejected', reviewed_at = now() where restaurant_id = target and user_id = uid;
end $$;

-- Price comes from the menu: the middle price of the mains (or of everything that isn't a
-- drink, side or dessert) once 3+ dishes have prices. < $15 $, < $25 $$, < $40 $$$, else $$$$.
create or replace function public.refresh_menu_price(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  mid numeric;
  n integer;
  lvl smallint;
begin
  select percentile_cont(0.5) within group (order by price), count(*) into mid, n
    from public.restaurant_dishes where restaurant_id = target and price > 0 and not hidden and course = 'main';
  if n < 3 then
    select percentile_cont(0.5) within group (order by price), count(*) into mid, n
      from public.restaurant_dishes where restaurant_id = target and price > 0 and not hidden
       and coalesce(course, 'main') not in ('drink', 'side', 'dessert');
  end if;
  if n < 3 then return; end if;
  lvl := case when mid < 15 then 1 when mid < 25 then 2 when mid < 40 then 3 else 4 end;
  update public.restaurants set price_level = lvl, updated_at = now(),
         sources = sources || jsonb_build_object('price_level', case when owner_verified then 'owner' else 'crumbs' end),
         verified = verified || jsonb_build_object('price_level', jsonb_build_object('n', n, 'at', now(), 'claimed', true, 'menu', true))
   where id = target
     and (price_level is distinct from lvl or coalesce(sources->>'price_level', 'google') not in ('crumbs', 'owner')
          or (owner_verified and sources->>'price_level' is distinct from 'owner'));
end $$;
revoke execute on function public.refresh_menu_price(uuid) from public, anon, authenticated;

-- "Your restaurants": the pages this person is the confirmed owner of.
create or replace function public.my_restaurants()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  -- Opening "Your restaurants" counts as being around (see settle_owner_suggestions).
  update public.restaurant_managers set last_active_at = now() where user_id = auth.uid();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'address', r.formatted_address, 'saves', r.places_count,
    'dishes', (select count(*) from public.restaurant_dishes d where d.restaurant_id = r.id and not d.hidden),
    'flagged', (select count(*) from public.restaurant_dishes d where d.restaurant_id = r.id and d.hidden),
    'suggestions', (select count(distinct f.field) from public.restaurant_facts f
                     where f.restaurant_id = r.id and f.user_id is distinct from m.user_id
                       and f.created_at > coalesce((r.verified->f.field->>'at')::timestamptz, '-infinity')
                       and f.value is distinct from public.fact_value(r, f.field))
                 + (select count(distinct dp.dish_id) from public.restaurant_dish_prices dp
                      join public.restaurant_dishes d on d.id = dp.dish_id
                     where d.restaurant_id = r.id and dp.created_at > d.price_set_at and dp.price is distinct from d.price)
  ) order by r.name), '[]'::jsonb)
  from public.restaurant_managers m join public.restaurants r on r.id = m.restaurant_id
  where m.user_id = (select auth.uid()));
end $$;

-- What members say differs from the page, grouped (never who said it).
create or replace function public.owner_suggestions(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.restaurants;
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can see this'; end if;
  select * into r from public.restaurants where id = target;
  return (select coalesce(jsonb_agg(x order by x->>'field', (x->>'people')::int desc), '[]'::jsonb) from (
    select jsonb_build_object('field', f.field, 'value', f.value, 'people', count(*),
                              'photo', bool_or(f.evidence in ('photo', 'receipt')), 'latest', max(f.created_at)) as x
      from public.restaurant_facts f
     where f.restaurant_id = target
       and not exists (select 1 from public.restaurant_managers m where m.restaurant_id = target and m.user_id = f.user_id)
       and f.created_at > coalesce((r.verified->f.field->>'at')::timestamptz, '-infinity')
       and f.value is distinct from public.fact_value(r, f.field)
     group by f.field, f.value
    union all
    -- Menu prices members say are different (never who).
    select jsonb_build_object('field', 'dish_price', 'dish_id', d.id, 'dish', d.name, 'current', d.price,
                              'value', dp.price, 'people', count(*), 'photo', bool_or(dp.evidence = 'photo'),
                              'latest', max(dp.created_at))
      from public.restaurant_dish_prices dp join public.restaurant_dishes d on d.id = dp.dish_id
     where d.restaurant_id = target and dp.created_at > d.price_set_at and dp.price is distinct from d.price
     group by d.id, d.name, d.price, dp.price) s);
end $$;

-- "Keep mine": the owner looked, their detail stands; hides the current suggestions for it.
create or replace function public.keep_owner_value(target uuid, fact text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can do this'; end if;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = auth.uid();
  update public.restaurants set
    verified = verified || jsonb_build_object(fact, coalesce(verified->fact, '{}'::jsonb) || jsonb_build_object('at', now(), 'claimed', true)),
    sources = case when public.fact_value(restaurants, fact) is not null
                   then sources || jsonb_build_object(fact, 'owner') else sources end
   where id = target;
end $$;

-- Owners fix or remove dishes on their menu.
create or replace function public.owner_edit_dish(target_dish uuid, new_name text, new_price numeric, new_course text, remove boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  k text := public.dish_key(new_name);
begin
  select restaurant_id into rid from public.restaurant_dishes where id = target_dish;
  if rid is null or not public.manages_restaurant(rid) then raise exception 'Only the restaurant can do this'; end if;
  if remove then
    delete from public.restaurant_dishes where id = target_dish;
  else
    if k is null or length(k) < 2 or length(new_name) > 120 then raise exception 'Bad dish name'; end if;
    if new_price is not null and (new_price < 0 or new_price >= 10000) then raise exception 'Bad price'; end if;
    if exists (select 1 from public.restaurant_dishes where restaurant_id = rid and name_key = k and id <> target_dish) then
      raise exception 'That dish is already on the menu';
    end if;
    update public.restaurant_dishes set name = trim(new_name), name_key = k, price = new_price, price_checked_at = now(),
           price_set_at = case when price is distinct from new_price then now() else price_set_at end,
           course = case when new_course in ('starter', 'main', 'side', 'dessert', 'drink') then new_course end,
           owner_ok = true, claimed = true, hidden = false
     where id = target_dish;
  end if;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = rid and user_id = auth.uid();
  perform public.refresh_menu_price(rid);
  perform public.menu_settle(rid);
end $$;

-- ---------- Menu prices members can fix (#19) ----------
alter table public.restaurant_dishes add column if not exists price_set_at timestamptz not null default now();
create table if not exists public.restaurant_dish_prices (
  dish_id uuid not null references public.restaurant_dishes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  price numeric(10,2) not null check (price >= 0 and price < 10000),
  evidence text not null default 'in_person' check (evidence in ('in_person', 'photo')),
  created_at timestamptz not null default now(),
  primary key (dish_id, user_id)
);
alter table public.restaurant_dish_prices enable row level security;
drop policy if exists restaurant_dish_prices_read on public.restaurant_dish_prices;
create policy restaurant_dish_prices_read on public.restaurant_dish_prices for select to authenticated using (user_id = (select auth.uid()));

-- A member says a dish costs something else. No price yet → it's used. Otherwise it changes once
-- two people say the same new price. On a dish the owner checked, it goes to the owner.
create or replace function public.suggest_dish_price(target_dish uuid, new_price numeric, how text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.restaurant_dishes;
  verified_page boolean;
  agree integer;
begin
  select * into d from public.restaurant_dishes where id = target_dish;
  if d.id is null or not (public.my_restaurant(d.restaurant_id) or public.manages_restaurant(d.restaurant_id)) then
    raise exception 'Not one of your restaurants';
  end if;
  if new_price is null or new_price < 0 or new_price >= 10000 then raise exception 'Bad price'; end if;
  if public.over_daily_cap('price') then raise exception 'That’s a lot of prices for one day — try again tomorrow.'; end if;
  new_price := round(new_price, 2);
  if public.manages_restaurant(d.restaurant_id) then
    perform public.owner_edit_dish(target_dish, d.name, new_price, d.course, false);
    return jsonb_build_object('applied', true);
  end if;
  insert into public.restaurant_dish_prices (dish_id, user_id, price, evidence)
  values (target_dish, auth.uid(), new_price, case when how = 'photo' then 'photo' else 'in_person' end)
  on conflict (dish_id, user_id) do update set price = excluded.price, evidence = excluded.evidence, created_at = now();
  select owner_verified into verified_page from public.restaurants where id = d.restaurant_id;
  if d.owner_ok and verified_page then
    perform public.settle_owner_suggestions(d.restaurant_id);
    return jsonb_build_object('applied', false, 'sent', true);
  end if;
  select count(*) into agree from public.restaurant_dish_prices
   where dish_id = target_dish and price = new_price and created_at >= d.price_set_at;
  if d.price is null or agree >= 2 then
    update public.restaurant_dishes set price = new_price, price_set_at = now(), price_checked_at = now() where id = target_dish;
    perform public.refresh_menu_price(d.restaurant_id);
    perform public.menu_settle(d.restaurant_id);
    return jsonb_build_object('applied', true, 'agree', agree);
  end if;
  return jsonb_build_object('applied', false, 'agree', agree);
end $$;

-- The owner looked at a suggested price and theirs stands.
create or replace function public.keep_dish_price(target_dish uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  select restaurant_id into rid from public.restaurant_dishes where id = target_dish;
  if rid is null or not public.manages_restaurant(rid) then raise exception 'Only the restaurant can do this'; end if;
  update public.restaurant_dishes set price_set_at = now(), price_checked_at = now(), owner_ok = true where id = target_dish;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = rid and user_id = auth.uid();
end $$;

-- ---------- Owner away: members can update a Verified-by-Owner page ----------
-- The owner gets members' suggestions. If the owner hasn't been around for 30 days and 3+ people
-- from 2+ groups have said the same thing for 2+ weeks, it's applied for everyone.
alter table public.restaurant_managers add column if not exists last_active_at timestamptz not null default now();
create or replace function public.settle_owner_suggestions(target uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
  s record;
  done text[] := '{}';
  changed integer := 0;
begin
  select * into r from public.restaurants where id = target;
  if r.id is null or not r.owner_verified then return 0; end if;
  if exists (select 1 from public.restaurant_managers m where m.restaurant_id = target
              and m.last_active_at > now() - interval '30 days') then
    return 0; -- the owner is around: they decide
  end if;
  for s in
    select f.field, f.value, count(distinct f.user_id) as people, count(distinct p.group_id) as groups
      from public.restaurant_facts f
      left join public.group_members gm on gm.user_id = f.user_id
      left join public.places p on p.group_id = gm.group_id and p.restaurant_id = target
     where f.restaurant_id = target and public.owner_locked(f.field)
       and not exists (select 1 from public.restaurant_managers m where m.restaurant_id = target and m.user_id = f.user_id)
       and f.created_at > coalesce((r.verified->f.field->>'at')::timestamptz, '-infinity')
       and f.value is distinct from public.fact_value(r, f.field)
     group by f.field, f.value
    having count(distinct f.user_id) >= 3 and count(distinct p.group_id) >= 2
       and min(f.created_at) < now() - interval '14 days'
     order by count(distinct f.user_id) desc
  loop
    continue when s.field = any(done);
    done := done || s.field;
    perform public.apply_fact(target, s.field, s.value, 'crumbs',
      jsonb_build_object('n', s.people, 'groups', s.groups, 'claimed', true, 'at', now(), 'owner_away', true));
    changed := changed + 1;
  end loop;
  -- Same for menu prices on dishes the owner checked.
  update public.restaurant_dishes d set price = x.price, price_set_at = now(), price_checked_at = now()
    from (select dp.dish_id, dp.price from public.restaurant_dish_prices dp
            join public.restaurant_dishes dd on dd.id = dp.dish_id
           where dd.restaurant_id = target and dp.created_at > dd.price_set_at and dp.price is distinct from dd.price
           group by dp.dish_id, dp.price
          having count(*) >= 3 and min(dp.created_at) < now() - interval '14 days') x
   where d.id = x.dish_id;
  if found then changed := changed + 1; perform public.refresh_menu_price(target); end if;
  return changed;
end $$;

-- ---------- Menu points (point_rules.menu_set / menu_try / menu_ok / menu_queue) ----------
-- Per person, across all restaurants. Every new dish you add (menu photo or typed) goes into
-- your points queue (up to menu_queue dishes, default 50); every menu_set (5) dishes that enter it
-- earn menu_try (1) straight away. Every 5 of your dishes that get confirmed earn menu_ok (2).
-- Dishes added while the queue is full wait in line (no points yet) and move in automatically —
-- earning their initial point — as soon as there's room. A waiting dish that gets confirmed
-- before it moves in still earns the full amount (initial + confirmed).
-- Confirmed = 2 other people tick ✓ after the dish (name/price) was last changed, or the owner.
-- A dish leaves the queue (freeing its spot, keeping points already earned) when it's confirmed,
-- flagged off the menu, deleted, or nobody confirmed it within the points window (90 days).
create table if not exists public.menu_contributions (
  dish_id uuid not null references public.restaurant_dishes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  stage text not null default 'waiting' check (stage in ('active', 'waiting', 'confirmed', 'dropped')),
  credited boolean not null default false, -- counted towards the initial points
  added_at timestamptz not null default now(),
  queued_at timestamptz,
  confirmed_at timestamptz,
  primary key (dish_id, user_id)
);
create index if not exists menu_contributions_user_idx on public.menu_contributions (user_id, stage, added_at);
create index if not exists menu_contributions_restaurant_idx on public.menu_contributions (restaurant_id, stage);
-- Running totals per person (never go down, so points are never paid twice).
create table if not exists public.menu_counts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credited integer not null default 0,
  confirmed integer not null default 0,
  try_paid integer not null default 0,
  ok_paid integer not null default 0
);
alter table public.menu_contributions enable row level security;
alter table public.menu_counts enable row level security;
drop policy if exists menu_contributions_read on public.menu_contributions;
create policy menu_contributions_read on public.menu_contributions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists menu_counts_read on public.menu_counts;
create policy menu_counts_read on public.menu_counts for select to authenticated using (user_id = (select auth.uid()));

-- Pays out any whole sets reached since last time.
create or replace function public.menu_pay(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.menu_counts;
  pr public.point_rules;
begin
  select * into pr from public.point_rules where id = 1;
  select * into c from public.menu_counts where user_id = uid for update;
  if c.user_id is null then return; end if;
  while c.try_paid < c.credited / pr.menu_set loop
    c.try_paid := c.try_paid + 1;
    perform public.award_points(uid, 'menu_try', pr.menu_try, null, 'menu-try:' || c.try_paid);
  end loop;
  while c.ok_paid < c.confirmed / pr.menu_set loop
    c.ok_paid := c.ok_paid + 1;
    perform public.award_points(uid, 'menu_ok', pr.menu_ok, null, 'menu-ok:' || c.ok_paid);
  end loop;
  update public.menu_counts set try_paid = c.try_paid, ok_paid = c.ok_paid where user_id = uid;
end $$;

-- Moves waiting dishes into the points queue while there's room (oldest first).
create or replace function public.menu_fill(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  room integer;
  moved integer;
begin
  -- Nobody confirmed it within the points window: it gives up its spot.
  update public.menu_contributions set stage = 'dropped'
   where user_id = uid and stage = 'active' and queued_at < now() - make_interval(days => public.points_window_days());
  select (select menu_queue from public.point_rules where id = 1) - count(*) into room
    from public.menu_contributions where user_id = uid and stage = 'active';
  if room <= 0 then return; end if;
  with next as (
    select dish_id from public.menu_contributions
     where user_id = uid and stage = 'waiting' order by added_at, dish_id limit room
  )
  update public.menu_contributions m set stage = 'active', queued_at = now(), credited = true
    from next where m.dish_id = next.dish_id and m.user_id = uid;
  get diagnostics moved = row_count;
  if moved > 0 then
    insert into public.menu_counts (user_id, credited) values (uid, moved)
    on conflict (user_id) do update set credited = menu_counts.credited + moved;
    perform public.menu_pay(uid);
  end if;
end $$;

create or replace function public.menu_add(uid uuid, rid uuid, dish uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if uid is null then return; end if;
  insert into public.menu_contributions (dish_id, user_id, restaurant_id) values (dish, uid, rid)
  on conflict do nothing;
  perform public.menu_fill(uid);
end $$;

-- After votes, price changes or owner edits at one restaurant: confirm, drop, pay, refill.
create or replace function public.menu_settle(rid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  dropped_for uuid[];
  confirmed_for uuid[];
  u uuid;
begin
  -- Flagged off the menu (or gone): gives up its spot, no confirmation points.
  with gone as (
    update public.menu_contributions m set stage = 'dropped'
     where m.restaurant_id = rid and m.stage in ('active', 'waiting')
       and not exists (select 1 from public.restaurant_dishes x where x.id = m.dish_id and not x.hidden)
    returning m.user_id)
  select array_agg(distinct user_id) into dropped_for from gone;
  -- Confirmed: the owner checked it, or 2 other people ticked ✓ since it was last changed.
  -- A dish confirmed while still waiting in line also gets its initial share (full value).
  with done as (
    update public.menu_contributions m set stage = 'confirmed', confirmed_at = now(), credited = true
      from public.restaurant_dishes x
     where m.restaurant_id = rid and m.stage in ('active', 'waiting') and x.id = m.dish_id and not x.hidden
       and (x.owner_ok or (select count(*) from public.restaurant_dish_votes v
                            where v.dish_id = x.id and v.vote = 'confirm' and v.user_id <> m.user_id
                              and v.created_at >= x.price_set_at) >= 2)
    returning m.user_id, (m.queued_at is null) as was_waiting),
  counted as (
    insert into public.menu_counts (user_id, credited, confirmed)
    select user_id, count(*) filter (where was_waiting), count(*) from done group by user_id
    on conflict (user_id) do update set credited = menu_counts.credited + excluded.credited,
                                        confirmed = menu_counts.confirmed + excluded.confirmed
    returning user_id)
  select array_agg(user_id) into confirmed_for from counted;
  for u in select distinct x from unnest(coalesce(dropped_for, '{}') || coalesce(confirmed_for, '{}')) x loop
    perform public.menu_pay(u);
    perform public.menu_fill(u);
  end loop;
end $$;
revoke execute on function public.menu_pay(uuid) from public, anon, authenticated;
revoke execute on function public.menu_fill(uuid) from public, anon, authenticated;
revoke execute on function public.menu_add(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.menu_settle(uuid) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['remove_manager(uuid, uuid)', 'my_restaurants()', 'owner_suggestions(uuid)',
                           'suggest_dish_price(uuid, numeric, text)', 'keep_dish_price(uuid)', 'settle_owner_suggestions(uuid)',
                           'keep_owner_value(uuid, text)', 'owner_edit_dish(uuid, text, numeric, text, boolean)', 'my_tier()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================================================
-- 13g. Keeping Crumbs healthy: daily check, free-limit alerts, caps & trust, duplicates (#169–#173, #226)
-- ============================================================================================
-- Numbers for the daily job (server key only): database + photo size and every budget's use.
create or replace function public.limit_report()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'crumbs-photos'),
    'budgets', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', b.kind, 'note', b.note, 'daily_total', b.daily_total, 'monthly_total', b.monthly_total,
        'today', coalesce((select c.count from public.usage_counts c where c.kind = b.kind and c.day = current_date
                            and c.user_id = '00000000-0000-0000-0000-000000000000'), 0),
        'month', coalesce((select sum(c.count) from public.usage_counts c where c.kind = b.kind
                            and c.day >= date_trunc('month', current_date) and c.user_id = '00000000-0000-0000-0000-000000000000'), 0))), '[]')
      from public.usage_budgets b))
$$;
revoke execute on function public.limit_report() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.limit_report() to service_role;
  end if;
end $$;

-- #172 Alerts the daily job raises (one per kind per day); shown on the Admin page.
create table if not exists public.admin_alerts (
  id bigint generated always as identity primary key,
  kind text not null,
  level text not null default 'warn' check (level in ('info', 'warn', 'stop')),
  message text not null check (char_length(message) <= 300),
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (kind, day)
);
alter table public.admin_alerts enable row level security;
drop policy if exists admin_alerts_admin on public.admin_alerts;
create policy admin_alerts_admin on public.admin_alerts for all to authenticated
  using (public.is_crumbs_admin()) with check (public.is_crumbs_admin());

-- #171 Daily caps on contributions (stops runaway scripts or spam), raised by tier: the top tier
-- is unlimited. Anyone whose details others mostly don't back up (trust under 30%) drops to the
-- first tier's caps whatever their points. Numbers live in point_rules.day_caps (null = no cap).
alter table public.point_rules add column if not exists day_caps jsonb not null default
  '{"fact": [40, 80, 150, 300, null], "vote": [150, 300, 500, 1000, null], "price": [40, 80, 150, 300, null]}';
create or replace function public.my_day_caps()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  shaky boolean := coalesce(public.user_trust(me) < 0.3, false);
  t integer := case when shaky then 0 else least(public.my_tier(), 4) end;
  caps jsonb := (select day_caps from public.point_rules where id = 1);
  admin boolean := public.is_crumbs_admin();
begin
  return jsonb_build_object(
    'tier', t, 'shaky', shaky,
    'fact', case when admin then null else caps->'fact'->t end,
    'vote', case when admin then null else caps->'vote'->t end,
    'price', case when admin then null else caps->'price'->t end,
    'used', jsonb_build_object(
      'fact', (select count(*) from public.restaurant_facts where user_id = me and created_at >= current_date),
      'vote', (select count(*) from public.restaurant_dish_votes where user_id = me and created_at >= current_date),
      'price', (select count(*) from public.restaurant_dish_prices where user_id = me and created_at >= current_date)));
end $$;
create or replace function public.over_daily_cap(what text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb := public.my_day_caps();
begin
  if what not in ('fact', 'vote', 'price') or c->what is null or jsonb_typeof(c->what) = 'null' then return false; end if;
  return (c->'used'->>what)::int >= (c->>what)::int;
end $$;
-- Share (0–1) of someone's details that others later backed up; null until they have 5.
create or replace function public.user_trust(uid uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when count(*) >= 5 then round(
           count(*) filter (where coalesce((r.verified->f.field->>'claimed')::boolean, false)
                              and f.value = public.fact_value(r, f.field))::numeric / count(*), 2) end
    from public.restaurant_facts f join public.restaurants r on r.id = f.restaurant_id
   where f.user_id = uid
$$;
revoke execute on function public.user_trust(uuid) from public, anon;

-- #169 Possible duplicate restaurants (same name within ~150 m), admins only.
create or replace function public.possible_duplicates()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'a', a.id, 'a_name', a.name, 'a_places', a.places_count, 'a_owner', a.owner_verified,
    'b', b.id, 'b_name', b.name, 'b_places', b.places_count, 'b_owner', b.owner_verified,
    'meters', round((abs(a.latitude - b.latitude) * 111000 + abs(a.longitude - b.longitude) * 80000)::numeric))), '[]')
  from public.restaurants a join public.restaurants b
    on a.id < b.id and public.dish_key(a.name) = public.dish_key(b.name)
   and abs(a.latitude - b.latitude) < 0.0014 and abs(a.longitude - b.longitude) < 0.0019
  where public.is_crumbs_admin()
$$;

-- #169 Who has been busy in the last day, with their trust score (spot spam fast).
create or replace function public.recent_contributors()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'facts')::int + (x->>'votes')::int desc), '[]') from (
    select jsonb_build_object('user_id', p.id, 'name', p.display_name,
      'facts', (select count(*) from public.restaurant_facts f where f.user_id = p.id and f.created_at > now() - interval '1 day'),
      'votes', (select count(*) from public.restaurant_dish_votes v where v.user_id = p.id and v.created_at > now() - interval '1 day'),
      'flags', (select count(*) from public.restaurant_dish_votes v where v.user_id = p.id and v.vote = 'flag' and v.created_at > now() - interval '1 day'),
      'trust', public.user_trust(p.id)) as x
    from public.profiles p
    where public.is_crumbs_admin()
      and (exists (select 1 from public.restaurant_facts f where f.user_id = p.id and f.created_at > now() - interval '1 day')
        or exists (select 1 from public.restaurant_dish_votes v where v.user_id = p.id and v.created_at > now() - interval '1 day'))
    limit 30) t
$$;

-- #170 Merge two copies of the same restaurant (admins): everything moves to `keep`.
create or replace function public.merge_restaurants(keep uuid, dupe uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  if keep = dupe or not exists (select 1 from public.restaurants where id = keep)
     or not exists (select 1 from public.restaurants where id = dupe) then raise exception 'Pick two different restaurants'; end if;
  update public.places set restaurant_id = keep where restaurant_id = dupe;
  -- Dishes: same name → keep one and move the ✓/✕ over; others just move.
  insert into public.restaurant_dish_votes (dish_id, user_id, vote, created_at)
  select k.id, v.user_id, v.vote, v.created_at
    from public.restaurant_dish_votes v
    join public.restaurant_dishes d on d.id = v.dish_id and d.restaurant_id = dupe
    join public.restaurant_dishes k on k.restaurant_id = keep and k.name_key = d.name_key
  on conflict (dish_id, user_id) do nothing;
  update public.menu_contributions m set dish_id = k.id
    from public.restaurant_dishes d, public.restaurant_dishes k
   where m.dish_id = d.id and d.restaurant_id = dupe and k.restaurant_id = keep and k.name_key = d.name_key
     and not exists (select 1 from public.menu_contributions x where x.dish_id = k.id and x.user_id = m.user_id);
  delete from public.restaurant_dishes d where d.restaurant_id = dupe
     and exists (select 1 from public.restaurant_dishes k where k.restaurant_id = keep and k.name_key = d.name_key);
  update public.restaurant_dishes set restaurant_id = keep where restaurant_id = dupe;
  update public.menu_contributions set restaurant_id = keep where restaurant_id = dupe;
  update public.restaurant_facts f set restaurant_id = keep where restaurant_id = dupe
     and not exists (select 1 from public.restaurant_facts k where k.restaurant_id = keep and k.field = f.field and k.user_id is not distinct from f.user_id);
  update public.restaurant_claims c set restaurant_id = keep where restaurant_id = dupe
     and not exists (select 1 from public.restaurant_claims k where k.restaurant_id = keep and k.user_id = c.user_id);
  insert into public.restaurant_managers (restaurant_id, user_id, since, last_active_at)
  select keep, user_id, since, last_active_at from public.restaurant_managers where restaurant_id = dupe
  on conflict do nothing;
  update public.contribution_points set restaurant_id = keep where restaurant_id = dupe;
  -- Fill gaps on the kept copy from the other one.
  update public.restaurants k set
    formatted_address = coalesce(k.formatted_address, d.formatted_address), phone = coalesce(k.phone, d.phone),
    website = coalesce(k.website, d.website), cuisine = coalesce(k.cuisine, d.cuisine),
    opening_hours = coalesce(k.opening_hours, d.opening_hours), osm_id = coalesce(k.osm_id, d.osm_id),
    google_place_id = coalesce(k.google_place_id, d.google_place_id), sources = d.sources || k.sources,
    verified = d.verified || k.verified
  from public.restaurants d where k.id = keep and d.id = dupe;
  delete from public.restaurants where id = dupe;
  update public.restaurants set places_count = (select count(*) from public.places where restaurant_id = keep),
         owner_verified = exists (select 1 from public.restaurant_managers where restaurant_id = keep)
   where id = keep;
  perform public.refresh_menu_price(keep);
end $$;

do $$
declare f text;
begin
  foreach f in array array['over_daily_cap(text)', 'my_day_caps()', 'possible_duplicates()', 'recent_contributors()', 'merge_restaurants(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================================================
-- 13f. Automatic backups (#89): a private bucket the weekly backup job writes to (with the server
-- key, which skips these rules). Only Crumbs admins can list and download the files.
-- ============================================================================================
insert into storage.buckets (id, name, public) values ('crumbs-backups', 'crumbs-backups', false)
on conflict (id) do nothing;
drop policy if exists crumbs_backups_admin_read on storage.objects;
create policy crumbs_backups_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'crumbs-backups' and public.is_crumbs_admin());

-- ============================================================================================
-- 13b. Your data (#88 delete account, #89 backups)
-- ============================================================================================
-- Deletes the signed-in account. Groups you own pass to the next member (admins first, then
-- longest-standing); a group with nobody else in it is deleted. Things you added to a shared
-- group (places, lists, visits, meals, plans…) stay for the group and are credited to its owner.
-- Your own ratings, notes, reactions, comments and votes are deleted.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  g record;
  heir uuid;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  for g in select id from public.groups where created_by = me loop
    select user_id into heir from public.group_members
     where group_id = g.id and user_id <> me
     order by (role = 'admin') desc, joined_at
     limit 1;
    if heir is null then
      delete from public.groups where id = g.id;
    else
      update public.groups set created_by = heir where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = heir;
    end if;
  end loop;
  -- Hand over what you added to the (new) owner of each group.
  update public.places p set created_by = gr.created_by from public.groups gr
   where p.created_by = me and gr.id = p.group_id;
  update public.lists l set created_by = gr.created_by from public.groups gr
   where l.created_by = me and gr.id = l.group_id;
  update public.list_places lp set added_by = gr.created_by from public.lists l join public.groups gr on gr.id = l.group_id
   where lp.added_by = me and l.id = lp.list_id;
  update public.list_shares ls set created_by = gr.created_by from public.lists l join public.groups gr on gr.id = l.group_id
   where ls.created_by = me and l.id = ls.list_id;
  update public.place_visits v set created_by = gr.created_by from public.places p join public.groups gr on gr.id = p.group_id
   where v.created_by = me and p.id = v.place_id;
  update public.home_meals m set created_by = gr.created_by from public.groups gr
   where m.created_by = me and gr.id = m.group_id;
  update public.home_meal_cooks c set created_by = gr.created_by from public.home_meals m join public.groups gr on gr.id = m.group_id
   where c.created_by = me and m.id = c.meal_id;
  update public.swipe_sessions s set created_by = gr.created_by from public.groups gr
   where s.created_by = me and gr.id = s.group_id;
  update public.plans pl set created_by = gr.created_by from public.groups gr
   where pl.created_by = me and gr.id = pl.group_id;
  update public.dishes set created_by = null where created_by = me;
  update public.place_facts set updated_by = null where updated_by = me;
  delete from auth.users where id = me;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Everything a group has saved, as one JSON file (members only). Photos stay in storage.
create or replace function public.export_group(target_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(target_group) then raise exception 'Not your group'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'group', (select to_jsonb(g) - 'join_code' from public.groups g where id = target_group),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'role', m.role)), '[]')
                  from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = target_group),
    'places', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
                  'ratings', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.place_ratings r
                               where r.place_id = p.id and (not r.draft or r.user_id = auth.uid())),
                  'visits', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.place_visits v where v.place_id = p.id),
                  'facts', (select to_jsonb(f) from public.place_facts f where f.place_id = p.id),
                  'dishes', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object(
                     'ratings', (select coalesce(jsonb_agg(to_jsonb(dr)), '[]') from public.dish_ratings dr where dr.dish_id = d.id))), '[]')
                     from public.dishes d where d.place_id = p.id))), '[]')
               from public.places p where p.group_id = target_group),
    'lists', (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
                 'places', (select coalesce(jsonb_agg(to_jsonb(lp)), '[]') from public.list_places lp where lp.list_id = l.id))), '[]')
              from public.lists l where l.group_id = target_group),
    'home_meals', (select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object(
                 'ratings', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.home_meal_ratings r where r.meal_id = m.id),
                 'cooks', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.home_meal_cooks c where c.meal_id = m.id))), '[]')
              from public.home_meals m where m.group_id = target_group),
    'plans', (select coalesce(jsonb_agg(to_jsonb(pl)), '[]') from public.plans pl where pl.group_id = target_group),
    'comments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.comments c where c.group_id = target_group)
  );
end $$;
revoke execute on function public.export_group(uuid) from public, anon;
grant execute on function public.export_group(uuid) to authenticated;

-- ============================================================================================
-- 13h. Hidden gems (#185) and "Download my data" (#234)
-- ============================================================================================
-- #185 How many groups saved each of these restaurants, plus how many groups Crumbs has in total
-- (hidden gems only switch on once there are 5+ groups, so "only you know it" means something).
create or replace function public.gem_counts(ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'groups', (select count(*) from public.groups),
    'saved', (select coalesce(jsonb_object_agg(r.id, r.places_count), '{}')
                from public.restaurants r where r.id = any(ids[1:500])))
$$;
revoke execute on function public.gem_counts(uuid[]) from public, anon;
grant execute on function public.gem_counts(uuid[]) to authenticated;

-- #234 Everything you've added, across all your groups, in one file (Settings → Your data).
create or replace function public.export_me()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  out jsonb := jsonb_build_object('app', 'crumbs', 'version', 1, 'exported_at', now());
  t text;
  col text;
  rows jsonb;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  out := out || jsonb_build_object('profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'role', m.role)), '[]')
                 from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = me));
  for t, col in select * from (values
      ('place_ratings', 'user_id'), ('place_visits', 'created_by'), ('places', 'created_by'),
      ('place_private_notes', 'user_id'), ('dishes', 'created_by'), ('dish_ratings', 'user_id'),
      ('home_meals', 'created_by'), ('home_meal_ratings', 'user_id'), ('home_meal_cooks', 'created_by'),
      ('recipe_reviews', 'user_id'),
      ('lists', 'created_by'), ('comments', 'user_id'), ('reactions', 'user_id'), ('plans', 'created_by'),
      ('plan_rsvps', 'user_id'), ('restaurant_facts', 'user_id'), ('restaurant_dishes', 'added_by'),
      ('restaurant_dish_votes', 'user_id'), ('restaurant_dish_prices', 'user_id'),
      ('contribution_points', 'user_id'), ('feedback', 'user_id')) v(t, col)
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where %I = $1', t, col)
      into rows using me;
    out := out || jsonb_build_object(t, rows);
  end loop;
  return out;
end $$;
revoke execute on function public.export_me() from public, anon;
grant execute on function public.export_me() to authenticated;

-- ============================================================================================
-- 13i. Dishes & ratings round (#112 reasons, #121 safe for me, #123 recipes, #179 next time, #181 spice)
-- ============================================================================================
-- #112 One-tap reasons on a rating ("Great service", "Too salty"), max 4.
alter table public.place_ratings add column if not exists reasons text[] not null default '{}';
alter table public.place_ratings drop constraint if exists place_ratings_reasons_check;
alter table public.place_ratings add constraint place_ratings_reasons_check
  check (cardinality(reasons) <= 4 and coalesce(array_length(reasons, 1), 0) <= 4);

-- #181 Spice you're happy with (0 none … 3 hot; null = anything), #121 your diet + the
-- "Safe for me" switch (only on after accepting the note that it's people's reports, not a promise).
alter table public.profiles add column if not exists spice_max smallint check (spice_max between 0 and 3);
alter table public.profiles add column if not exists diet text[] not null default '{}';
alter table public.profiles add column if not exists safe_for_me boolean not null default false;

-- #179 "Next time" note, private like the rest of your notes (body can now be empty).
alter table public.place_private_notes add column if not exists next_time text check (char_length(next_time) <= 200);
alter table public.place_private_notes drop constraint if exists place_private_notes_body_check;
alter table public.place_private_notes add constraint place_private_notes_body_check check (char_length(body) <= 4000);

-- #123 "Make it at home" (a home meal made from a restaurant dish) and recipes you choose to share
-- with everyone on Crumbs, which anyone can rate and leave a tip on to make it better.
alter table public.home_meals add column if not exists from_dish uuid references public.dishes(id) on delete set null;
alter table public.home_meals add column if not exists recipe_public boolean not null default false;
alter table public.home_meals add column if not exists recipe text check (char_length(recipe) <= 6000);

create or replace function public.is_public_recipe(meal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select recipe_public from public.home_meals where id = meal), false)
$$;

create table if not exists public.recipe_reviews (
  meal_id uuid not null references public.home_meals(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  tip text check (char_length(tip) <= 300),
  created_at timestamptz not null default now(),
  primary key (meal_id, user_id)
);
alter table public.recipe_reviews enable row level security;
drop policy if exists recipe_reviews_read on public.recipe_reviews;
drop policy if exists recipe_reviews_write on public.recipe_reviews;
drop policy if exists recipe_reviews_delete on public.recipe_reviews;
create policy recipe_reviews_read on public.recipe_reviews for select to authenticated
  using (public.is_public_recipe(meal_id) or user_id = (select auth.uid()));
create policy recipe_reviews_write on public.recipe_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_public_recipe(meal_id));
create policy recipe_reviews_delete on public.recipe_reviews for delete to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists recipe_reviews_update on public.recipe_reviews;
create policy recipe_reviews_update on public.recipe_reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_public_recipe(meal_id));

-- Shared recipes for the Home tab: newest or best first, with first names only and the tips.
create or replace function public.public_recipes(q text default null, lim integer default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'score')::numeric desc nulls last, x->>'created_at' desc), '[]') from (
    select jsonb_build_object(
      'id', m.id, 'name', m.name, 'notes', m.notes, 'recipe', m.recipe, 'recipe_url', m.recipe_url,
      'photo_path', m.photo_path, 'dietary', m.dietary, 'spice', m.spice, 'created_at', m.created_at,
      'by', split_part(coalesce(p.display_name, 'Someone'), ' ', 1),
      'mine', m.created_by = auth.uid(),
      'score', (select round(avg(r.score)::numeric, 1) from public.recipe_reviews r where r.meal_id = m.id),
      'reviews', (select count(*) from public.recipe_reviews r where r.meal_id = m.id),
      'tips', (select coalesce(jsonb_agg(jsonb_build_object('tip', r.tip, 'score', r.score,
                 'by', split_part(coalesce(rp.display_name, 'Someone'), ' ', 1), 'mine', r.user_id = auth.uid())
                 order by r.created_at desc), '[]')
                 from public.recipe_reviews r left join public.profiles rp on rp.id = r.user_id
                where r.meal_id = m.id and (r.tip is not null or r.user_id = auth.uid()))) as x
    from public.home_meals m left join public.profiles p on p.id = m.created_by
    where m.recipe_public and auth.uid() is not null
      and (q is null or m.name ilike '%' || left(q, 60) || '%')
    order by m.created_at desc
    limit least(greatest(lim, 1), 100)) t
$$;
revoke execute on function public.public_recipes(text, integer) from public, anon;
grant execute on function public.public_recipes(text, integer) to authenticated;

-- ============================================================================================
-- 14. Make yourself the admin: run this ONE line separately, with your own sign-in email.
-- ============================================================================================
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
