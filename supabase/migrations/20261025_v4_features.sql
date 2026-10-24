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
    if tg_op = 'UPDATE' and new.score is not distinct from old.score then return new; end if;
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
create trigger activity_ratings after insert or update of score on public.place_ratings
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
-- Nobody can make themselves admin from the app; only the SQL editor (no signed-in user) can.
create or replace function public.protect_admin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'is_admin can only be changed from the Supabase SQL editor';
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
  ('menu_import', 'everyone', 'Import menu from website (AI)')
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
    'feedback', (select count(*) from public.feedback)
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
                  'ratings', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.place_ratings r where r.place_id = p.id),
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
-- 14. Make yourself the admin: run this ONE line separately, with your own sign-in email.
-- ============================================================================================
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
