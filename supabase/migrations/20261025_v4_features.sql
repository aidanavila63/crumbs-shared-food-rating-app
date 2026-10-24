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
  ('menu_import', 'everyone', 'Import menu from website (AI)'),
  ('restaurant_claims', 'admin', 'Restaurants can claim their page (#100) — switch to Everyone when public')
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
  claimed boolean not null default false, -- confirmed by 2+ different groups: Crumbs' own
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
    if p.created_at > now() - interval '1 hour' and p.created_at > coalesce(r.details_checked_at, '-infinity') then
      update public.restaurants set
        formatted_address = coalesce(p.formatted_address, formatted_address),
        latitude = coalesce(p.latitude, latitude), longitude = coalesce(p.longitude, longitude),
        price_level = coalesce(p.price_level, price_level), website = coalesce(p.website, website),
        google_maps_url = coalesce(p.google_maps_url, google_maps_url), details_checked_at = p.created_at
      where id = r.id returning * into r;
    end if;
    -- Fill gaps from the group's copy (never overwrite with blanks).
    update public.restaurants set
      formatted_address = coalesce(formatted_address, p.formatted_address),
      latitude = coalesce(latitude, p.latitude), longitude = coalesce(longitude, p.longitude),
      cuisine = coalesce(cuisine, p.cuisine), price_level = coalesce(price_level, p.price_level),
      website = coalesce(website, p.website), google_maps_url = coalesce(google_maps_url, p.google_maps_url),
      opening_hours = case when coalesce(p.hours_checked_at, '-infinity') > coalesce(hours_checked_at, '-infinity') then p.opening_hours else opening_hours end,
      business_status = case when coalesce(p.hours_checked_at, '-infinity') > coalesce(hours_checked_at, '-infinity') then p.business_status else business_status end,
      hours_checked_at = greatest(hours_checked_at, p.hours_checked_at),
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
  update public.restaurants set opening_hours = hours, business_status = left(status, 40),
         hours_checked_at = now(), updated_at = now()
   where id = target;
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
begin
  if not (public.my_restaurant(target) or public.manages_restaurant(target)) then raise exception 'Not one of your restaurants'; end if;
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
      price = coalesce(excluded.price, restaurant_dishes.price),
      price_checked_at = case when excluded.price is not null then now() else restaurant_dishes.price_checked_at end,
      description = coalesce(restaurant_dishes.description, excluded.description),
      course = coalesce(restaurant_dishes.course, excluded.course)
    returning id, (xmax = 0) into row_id, is_new;
    perform public.award_points(auth.uid(), case when is_new then 'dish' else 'check' end, 1, target,
                                case when is_new then 'dish:' else 'check:' end || row_id);
    -- Adding a dish that's already there is a vote that it's real.
    insert into public.restaurant_dish_votes (dish_id, user_id, vote) values (row_id, auth.uid(), 'confirm')
    on conflict (dish_id, user_id) do update set vote = 'confirm';
    added := added + 1;
  end loop;
  update public.restaurant_dishes rd set
    confirms = (select count(*) from public.restaurant_dish_votes v where v.dish_id = rd.id and v.vote = 'confirm'),
    flags = (select count(*) from public.restaurant_dish_votes v where v.dish_id = rd.id and v.vote = 'flag')
  where rd.restaurant_id = target;
  update public.restaurant_dishes set hidden = (flags >= 2 and flags > confirms) where restaurant_id = target;
  update public.restaurant_dishes rd set claimed = (
    select count(distinct p.group_id) from public.restaurant_dish_votes v
      join public.group_members gm on gm.user_id = v.user_id
      join public.places p on p.group_id = gm.group_id and p.restaurant_id = rd.restaurant_id
     where v.dish_id = rd.id and v.vote = 'confirm') >= 2
  where rd.restaurant_id = target;
  return added;
end $$;

-- ✓ "this is on the menu" / ✕ "not on the menu any more". Flagged-out dishes hide, and are
-- deleted once 3 people flag them and nobody confirmed.
create or replace function public.vote_restaurant_dish(target_dish uuid, choice text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r uuid;
begin
  select restaurant_id into r from public.restaurant_dishes where id = target_dish;
  if r is null or not public.my_restaurant(r) then raise exception 'Not one of your restaurants'; end if;
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
  update public.restaurant_dishes set hidden = (flags >= 2 and flags > confirms) where id = target_dish;
  if choice is not null then perform public.award_points(auth.uid(), 'check', 1, r, 'vote:' || target_dish); end if;
  update public.restaurant_dishes rd set claimed = (
    select count(distinct p.group_id) from public.restaurant_dish_votes v
      join public.group_members gm on gm.user_id = v.user_id
      join public.places p on p.group_id = gm.group_id and p.restaurant_id = rd.restaurant_id
     where v.dish_id = rd.id and v.vote = 'confirm') >= 2
  where rd.id = target_dish;
  delete from public.restaurant_dishes where id = target_dish and flags >= 3 and confirms = 0;
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

-- A member adds or confirms a fact they saw themselves. Applied straight away over Google or
-- open data; changing something members already set needs two people to agree.
create or replace function public.contribute_fact(target uuid, fact text, val jsonb, how text default 'in_person')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants;
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
  useful boolean;
begin
  if not (public.my_restaurant(target) or manager) then raise exception 'Not one of your restaurants'; end if;
  select * into r from public.restaurants where id = target;
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
    v := jsonb_build_object('lat', (v->>'lat')::float8, 'lng', (v->>'lng')::float8);
  elsif fact = 'hours' then
    if jsonb_typeof(v->'periods') <> 'array' or jsonb_array_length(v->'periods') > 30 or jsonb_typeof(v->'utc') <> 'number' then
      raise exception 'Bad hours';
    end if;
  else
    raise exception 'Unknown field';
  end if;

  insert into public.restaurant_facts (restaurant_id, field, value, evidence, user_id)
  values (target, fact, v, how, auth.uid())
  on conflict (restaurant_id, field, user_id) do update set value = excluded.value, evidence = excluded.evidence, created_at = now();

  select count(*) into agree from public.restaurant_facts f where f.restaurant_id = target and f.field = fact and f.value = v;
  -- Cross-check: how many different groups' members independently said the same thing.
  select count(distinct p.group_id) into groups_agree
    from public.restaurant_facts f
    join public.group_members gm on gm.user_id = f.user_id
    join public.places p on p.group_id = gm.group_id and p.restaurant_id = target
   where f.restaurant_id = target and f.field = fact and f.value = v;
  src := r.sources->>fact;
  current := case fact
    when 'name' then to_jsonb(r.name) when 'address' then to_jsonb(r.formatted_address)
    when 'phone' then to_jsonb(r.phone) when 'website' then to_jsonb(r.website)
    when 'cuisine' then to_jsonb(r.cuisine) when 'price_level' then to_jsonb(r.price_level)
    when 'status' then to_jsonb(r.business_status) when 'hours' then r.opening_hours
    when 'location' then case when r.latitude is null then null else jsonb_build_object('lat', r.latitude, 'lng', r.longitude) end
  end;

  -- Claimed = verified as Crumbs' own: two different groups agree, or a member independently
  -- confirmed what OpenStreetMap says, or two people agree and one of them had a photo.
  was_claimed := coalesce((r.verified->fact->>'claimed')::boolean, false);
  last_at := coalesce((r.verified->fact->>'at')::timestamptz, case when src = 'osm' then r.osm_checked_at end);
  -- Worth points only when it adds something: new, changed, not yet ours, or due a re-check.
  useful := current is null or current is distinct from v or src is distinct from 'crumbs'
            or last_at is null or last_at < now() - make_interval(days => public.fact_refresh_days(fact));
  claimed := manager or groups_agree >= 2
    or (src = 'osm' and current = v)
    or (agree >= 2 and exists (select 1 from public.restaurant_facts f where f.restaurant_id = target
                                 and f.field = fact and f.value = v and f.evidence in ('photo', 'receipt')));
  -- The restaurant's own confirmed manager always wins; members need 3 to overrule them.
  if manager or (src = 'owner' and (agree >= 3 or current = v))
     or (coalesce(src, '') not in ('crumbs', 'owner') or current is null or (src = 'crumbs' and agree >= 2) or current = v) then
    applied := current is distinct from v or src is distinct from 'crumbs';
    if src = 'owner' and not manager and current = v then applied := false; end if;
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
      sources = sources || jsonb_build_object(fact, case when manager then 'owner'
                                                         when src = 'owner' and current = v then 'owner' else 'crumbs' end),
      verified = verified || jsonb_build_object(fact, jsonb_build_object('n', agree, 'groups', groups_agree, 'claimed', claimed, 'at', now())),
      updated_at = now()
    where id = target;
  end if;
  if useful then
    perform public.award_points(auth.uid(), 'fact', 3, target, target || ':' || fact || ':' || to_char(now(), 'YYYY-MM'));
  end if;
  -- Backed up by someone else → everyone who said the same thing gets a bonus (once).
  if claimed and not was_claimed then
    perform public.award_points(f.user_id, 'backed', 5, target, target || ':' || fact || ':backed:' || to_char(now(), 'YYYY-MM'))
      from public.restaurant_facts f where f.restaurant_id = target and f.field = fact and f.value = v and f.user_id is not null;
  end if;
  return jsonb_build_object('applied', applied, 'agree', agree, 'claimed', claimed, 'points', case when useful then 3 else 0 end);
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
  if not public.my_restaurant(target) then raise exception 'Not one of your restaurants'; end if;
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
  select coalesce(sum(cp.points), 0) into points from public.contribution_points cp where cp.user_id = me;
  tier := case when points >= 1000 then 4 when points >= 300 then 3 when points >= 100 then 2 when points >= 25 then 1 else 0 end;
  return jsonb_build_object('facts', facts, 'dishes', dishes, 'checks', checks, 'restaurants', places,
                            'verified', verified, 'points', points, 'tier', tier,
                            'today', (select coalesce(sum(c.points), 0) from public.contribution_points c
                                       where c.user_id = me and c.created_at >= date_trunc('day', now())),
                            'daily_cap', 40,
                            'manages', (select coalesce(jsonb_agg(restaurant_id), '[]') from public.restaurant_managers where user_id = me));
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

-- Points ledger: every award is a row, so points can be capped (40 a day) and audited.
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
declare
  today integer;
  given integer;
begin
  if uid is null then return 0; end if;
  select coalesce(sum(points), 0) into today from public.contribution_points
   where user_id = uid and created_at >= date_trunc('day', now());
  given := greatest(0, least(pts, 40 - today)); -- daily cap
  insert into public.contribution_points (user_id, kind, points, restaurant_id, ref)
  values (uid, what, given, rid, left(tag, 200))
  on conflict (user_id, kind, ref) do nothing;
  return given;
end $$;
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

-- The one question to ask this person about this restaurant (or null): missing details first,
-- then details Crumbs doesn't own yet (only Google's), then the oldest check that's due.
-- Each person gets a different order, so the same unanswerable question isn't asked of everyone.
create or replace function public.next_question(target uuid)
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
      case when f.val is null then 1 when coalesce(r.sources->>f.field, 'google') = 'google' then 2 else 3 end as tier,
      coalesce((r.verified->f.field->>'at')::timestamptz, case when r.sources->>f.field = 'osm' then r.osm_checked_at end) as last_at
    from (values
      ('hours', r.opening_hours::text), ('price_level', r.price_level::text), ('phone', r.phone),
      ('website', r.website), ('status', r.business_status), ('cuisine', r.cuisine), ('address', r.formatted_address)
    ) as f(field, val)
    where not exists (select 1 from public.restaurant_question_skips k
                       where k.user_id = me and k.restaurant_id = target and k.field = f.field and k.until > now())
      and not exists (select 1 from public.restaurant_facts x
                       where x.user_id = me and x.restaurant_id = target and x.field = f.field
                         and x.created_at > now() - make_interval(days => public.fact_refresh_days(f.field)))
      -- Address and cuisine: only ask when missing (they rarely change).
      and (f.val is null or f.field not in ('address', 'cuisine') or coalesce(r.sources->>f.field, 'google') = 'google' and f.field = 'cuisine')
      -- The restaurant's owner keeps their own details current.
      and coalesce(r.sources->>f.field, '') <> 'owner'
  ) c
  where c.tier < 3 or c.last_at is null or c.last_at < now() - make_interval(days => public.fact_refresh_days(c.field))
  order by c.tier, c.last_at nulls first, md5(me::text || c.field || target::text)
  limit 1;
  if pick.field is null then return null; end if;
  return jsonb_build_object('field', pick.field,
                            'reason', case pick.tier when 1 then 'missing' when 2 then 'unowned' else 'stale' end,
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
  ('google', 40, 900, '{10,12,15,18,20}', 'Google place details + hours (1,000 Enterprise free a month)')
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
  tier := coalesce((public.my_contributions()->>'tier')::int, 0);
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

-- Restaurant owners (#100): claim a profile; once an admin approves, their details apply
-- straight away as the 'owner' source (members need 3 to overrule) and their menu counts as claimed.
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
create policy restaurant_managers_read on public.restaurant_managers for select to authenticated using (true);

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
  foreach f in array array['skip_question(uuid, text, integer)', 'next_question(uuid)', 'use_allowance(text)', 'usage_today()',
                           'set_budget(text, integer, integer, integer[])', 'manages_restaurant(uuid)',
                           'claim_restaurant(uuid, text, text, text, text, text)', 'review_claim(uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
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
