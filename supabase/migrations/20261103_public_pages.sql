-- Public pages (Nov 3): a restaurant page anyone with the link can read, and opt-in public profiles.
-- Safe to run twice. Run after 20261102_invites_approval.sql.
--
-- Rules baked in here (not just in the app):
--   * A public page only ever gets TOTALS, and only once 3+ different groups agree. Never names, group
--     names, notes, private photos or who said what.
--   * Details borrowed from Google are not shown on public pages. A detail shows only when Crumbs members,
--     open map data or the owner is its source. Directions open in the maps app from the place id.
--   * Profiles are private until the person switches theirs on, and the handle rules live here.

-- ---------------------------------------------------------------------------------------------
-- 1. Restaurant links: /r/<city>/<name>  (name + street only when two places in a city clash)
-- ---------------------------------------------------------------------------------------------
create or replace function public.slugify(t text)
returns text language sql immutable as $$
  select nullif(trim(both '-' from regexp_replace(
    translate(lower(coalesce(t, '')), 'àáâãäåèéêëìíîïòóôõöùúûüçñœ', 'aaaaaaeeeeiiiiooooouuuucno'),
    '[^a-z0-9]+', '-', 'g')), '')
$$;

-- "1234 Sample Rd, Etobicoke, ON M9A 1A1, Canada" -> "Etobicoke"
create or replace function public.city_from_address(addr text)
returns text language plpgsql immutable as $$
declare parts text[]; n integer;
begin
  if addr is null then return null; end if;
  parts := array(select trim(x) from unnest(string_to_array(addr, ',')) x where trim(x) <> '');
  n := coalesce(array_length(parts, 1), 0);
  if n >= 4 then return parts[n - 2]; end if;
  if n = 3 then
    -- "Etobicoke, ON, Canada" has the city first; "1 Main St, Etobicoke, ON M9A 1A1" has it second
    if parts[2] ~ '^[A-Za-z]{2}$' then return parts[1]; end if;
    return parts[2];
  end if;
  if n = 2 then return parts[1]; end if;
  return null;
end $$;

create table if not exists public.restaurant_slugs (
  city text not null,
  slug text not null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (city, slug)
);
create unique index if not exists restaurant_slugs_current on public.restaurant_slugs (restaurant_id) where is_current;
alter table public.restaurant_slugs enable row level security;
-- (no policies: the pages read through the functions below)

create or replace function public.assign_restaurant_slug(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.restaurants%rowtype;
  c text; base text; street text; cand text; i integer := 2;
begin
  if exists (select 1 from public.restaurant_slugs where restaurant_id = target and is_current) then return; end if;
  select * into r from public.restaurants where id = target;
  if not found then return; end if;
  c := coalesce(public.slugify(public.city_from_address(r.formatted_address)), 'other');
  base := left(coalesce(public.slugify(r.name), 'restaurant'), 60);
  cand := base;
  if exists (select 1 from public.restaurant_slugs where city = c and slug = cand) then
    street := public.slugify(regexp_replace(split_part(coalesce(r.formatted_address, ''), ',', 1), '^[0-9a-z-]*[0-9]+[a-z]?\s+', ''));
    if street is not null then cand := left(base || '-' || street, 80); end if;
  end if;
  while exists (select 1 from public.restaurant_slugs where city = c and slug = cand) loop
    cand := left(base, 70) || '-' || i; i := i + 1;
  end loop;
  insert into public.restaurant_slugs (city, slug, restaurant_id) values (c, cand, target);
end $$;
revoke execute on function public.assign_restaurant_slug(uuid) from public, anon, authenticated;

create or replace function public.slug_new_restaurant()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.assign_restaurant_slug(new.id); return new; end $$;
drop trigger if exists slug_new_restaurant on public.restaurants;
create trigger slug_new_restaurant after insert on public.restaurants
  for each row execute function public.slug_new_restaurant();
select public.assign_restaurant_slug(id) from public.restaurants;

-- ---------------------------------------------------------------------------------------------
-- 2. Profile handles
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists handle text;
alter table public.profiles add column if not exists profile_public boolean not null default false;
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 160);
alter table public.profiles add column if not exists handle_changed_at timestamptz;
alter table public.profiles add column if not exists public_off_at timestamptz;
alter table public.profiles add column if not exists public_show jsonb not null
  default '{"favourites": true, "dishes": true, "badges": true, "map": true, "passport": true}'::jsonb;
alter table public.profiles add column if not exists public_snapshot jsonb not null default '{}'::jsonb;
create unique index if not exists profiles_handle_key on public.profiles (lower(handle)) where handle is not null;

-- Old handles stay reserved for 90 days so nobody can grab one to pretend to be the last owner.
create table if not exists public.handle_reservations (
  handle text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  until timestamptz not null
);
alter table public.handle_reservations enable row level security;

-- Words a handle can't contain. whole = only blocked as the whole name or a dot/underscore piece of it
-- (short words would otherwise block innocent names). Admins can add to this from the SQL editor.
create table if not exists public.blocked_handle_words (
  word text primary key,
  whole boolean not null default false
);
alter table public.blocked_handle_words enable row level security;
insert into public.blocked_handle_words (word, whole) values
  ('fuck', false), ('shit', false), ('cunt', false), ('nigg', false), ('fagg', false), ('whore', false),
  ('retard', false), ('nazi', false), ('hitler', false), ('bitch', false), ('twat', false), ('wank', false),
  ('porn', false), ('rapist', false), ('bastard', false), ('piss', false), ('slut', false), ('dildo', false),
  ('ass', true), ('arse', true), ('dick', true), ('cock', true), ('tit', true), ('tits', true), ('sex', true),
  ('anal', true), ('rape', true), ('kkk', true), ('nsfw', true), ('xxx', true)
on conflict (word) do nothing;

-- Names the app (or a business) is likely to use itself.
create or replace function public.handle_is_reserved(h text)
returns boolean language sql immutable as $$
  select h = any (array[
    'crumbs', 'crumb', 'admin', 'administrator', 'support', 'help', 'official', 'staff', 'owner', 'owners',
    'team', 'moderator', 'mod', 'system', 'root', 'null', 'undefined', 'anonymous', 'me', 'you', 'everyone',
    'r', 'u', 'api', 'auth', 'invite', 'share', 'welcome', 'login', 'signin', 'signup', 'settings', 'profile',
    'profiles', 'restaurant', 'restaurants', 'app', 'www', 'terms', 'privacy', 'about', 'contact', 'billing'])
$$;

-- "Is this name allowed?" -> null when fine, otherwise the reason in plain words.
create or replace function public.handle_problem(h text, me uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  low text := lower(coalesce(h, ''));
  norm text;
begin
  if low !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$' or char_length(low) not between 3 and 20 then
    return 'Use 3 to 20 letters, numbers, underscores or single dots, starting with a letter';
  end if;
  if public.handle_is_reserved(low) then return 'That name is kept for Crumbs'; end if;
  -- look past number-for-letter swaps and dots (f.u.c.k, sh1t)
  norm := regexp_replace(translate(low, '013457', 'oieast'), '[._0-9]', '', 'g');
  if exists (select 1 from public.blocked_handle_words b
              where (not b.whole and (norm like '%' || b.word || '%' or low like '%' || b.word || '%'))
                 or (b.whole and (norm = b.word or b.word = any (string_to_array(replace(low, '_', '.'), '.')))))
  then return 'That name isn’t allowed'; end if;
  if exists (select 1 from public.restaurants r join public.restaurant_slugs s on s.restaurant_id = r.id
              where r.owner_verified
                and (regexp_replace(s.slug, '[^a-z0-9]', '', 'g') = regexp_replace(low, '[^a-z0-9]', '', 'g')
                     or regexp_replace(lower(r.name), '[^a-z0-9]', '', 'g') = regexp_replace(low, '[^a-z0-9]', '', 'g')))
  then return 'That name belongs to a restaurant'; end if;
  if exists (select 1 from public.profiles p
              where lower(p.handle) = low and p.id is distinct from me
                and (p.profile_public or p.public_off_at is null or p.public_off_at > now() - interval '30 days'))
     or exists (select 1 from public.handle_reservations x
                 where x.handle = low and x.user_id is distinct from me and x.until > now())
  then return 'That one’s taken'; end if;
  return null;
end $$;
revoke execute on function public.handle_problem(text, uuid) from public, anon, authenticated;

create or replace function public.handle_check(h text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', public.handle_problem(h, auth.uid()) is null,
                            'reason', public.handle_problem(h, auth.uid()))
   where auth.uid() is not null
$$;
revoke execute on function public.handle_check(text) from public, anon;
grant execute on function public.handle_check(text) to authenticated;

-- Which of someone's restaurants and dishes they chose to show.
create table if not exists public.profile_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('place', 'dish')),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  dish text check (dish is null or char_length(dish) <= 80),
  position smallint not null default 0,
  check ((kind = 'dish') = (dish is not null))
);
create unique index if not exists profile_picks_once on public.profile_picks (user_id, kind, restaurant_id, coalesce(dish, ''));
alter table public.profile_picks enable row level security;
drop policy if exists profile_picks_own on public.profile_picks;
create policy profile_picks_own on public.profile_picks for select to authenticated using (user_id = (select auth.uid()));

-- Nobody edits the public-profile columns directly: only set_public_profile() does.
create or replace function public.protect_public_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('crumbs.pp_write', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.handle := null; new.profile_public := false; new.bio := null;
    return new;
  end if;
  if new.handle is distinct from old.handle or new.profile_public is distinct from old.profile_public
     or new.bio is distinct from old.bio or new.handle_changed_at is distinct from old.handle_changed_at
     or new.public_off_at is distinct from old.public_off_at or new.public_show is distinct from old.public_show
     or new.public_snapshot is distinct from old.public_snapshot then
    raise exception 'Use the Public profile settings to change that';
  end if;
  return new;
end $$;
drop trigger if exists protect_public_profile on public.profiles;
create trigger protect_public_profile before insert or update on public.profiles
  for each row execute function public.protect_public_profile();

-- Switch a public profile on/off or change it. p_picks = [{"kind":"place","restaurant_id":…}, {"kind":"dish","restaurant_id":…,"dish":"Beef pho"}]
-- p_snapshot = {"stats": {...numbers}, "badges": [{"key","label","emoji"}], "passport": [{"city","count"}]} (worked out on the phone).
create or replace function public.set_public_profile(p_on boolean, p_handle text, p_bio text, p_show jsonb, p_snapshot jsonb, p_picks jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prof public.profiles%rowtype;
  h text := lower(trim(coalesce(p_handle, '')));
  problem text;
  snap jsonb := '{}'::jsonb;
  stats jsonb := '{}'::jsonb;
  k text;
  item jsonb;
  arr jsonb;
  pick jsonb;
  n integer := 0;
  show jsonb;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if not public.is_let_in(me) then raise exception 'Crumbs hasn’t let you in yet'; end if;
  select * into prof from public.profiles where id = me for update;
  if not found then raise exception 'No profile'; end if;
  perform set_config('crumbs.pp_write', 'on', true);

  if not coalesce(p_on, false) then
    update public.profiles set profile_public = false, public_off_at = now() where id = me;
    return jsonb_build_object('public', false, 'handle', prof.handle);
  end if;

  if p_bio is not null and char_length(p_bio) > 160 then raise exception 'Keep your bio to 160 characters'; end if;
  problem := public.handle_problem(h, me);
  if problem is not null then raise exception '%', problem; end if;
  if prof.handle is not null and lower(prof.handle) <> h
     and prof.handle_changed_at is not null and prof.handle_changed_at > now() - interval '30 days' then
    raise exception 'You can change your handle once every 30 days — next time: %',
      to_char(prof.handle_changed_at + interval '30 days', 'Mon DD');
  end if;

  -- a handle someone switched off long ago is free to take
  update public.profiles set handle = null
   where lower(handle) = h and id <> me and not profile_public and public_off_at <= now() - interval '30 days';
  if prof.handle is not null and lower(prof.handle) <> h then
    insert into public.handle_reservations (handle, user_id, until)
    values (lower(prof.handle), me, now() + interval '90 days')
    on conflict (handle) do update set user_id = excluded.user_id, until = excluded.until;
  end if;
  delete from public.handle_reservations where handle = h and user_id = me;

  -- what to show: only known switches, each true/false
  show := jsonb_build_object(
    'favourites', coalesce((p_show ->> 'favourites')::boolean, true),
    'dishes', coalesce((p_show ->> 'dishes')::boolean, true),
    'badges', coalesce((p_show ->> 'badges')::boolean, true),
    'map', coalesce((p_show ->> 'map')::boolean, true),
    'passport', coalesce((p_show ->> 'passport')::boolean, true));

  -- the snapshot: only numbers and short labels, capped
  if jsonb_typeof(p_snapshot -> 'stats') = 'object' then
    foreach k in array array['places', 'cuisines', 'cities', 'visits'] loop
      if jsonb_typeof(p_snapshot -> 'stats' -> k) = 'number' then
        stats := stats || jsonb_build_object(k, least(greatest(((p_snapshot -> 'stats' ->> k)::numeric)::integer, 0), 100000));
      end if;
    end loop;
  end if;
  snap := jsonb_build_object('stats', stats);
  arr := '[]'::jsonb; n := 0;
  if jsonb_typeof(p_snapshot -> 'badges') = 'array' then
    for item in select * from jsonb_array_elements(p_snapshot -> 'badges') loop
      exit when n >= 24;
      if jsonb_typeof(item) = 'object' and char_length(coalesce(item ->> 'label', '')) between 1 and 40 then
        arr := arr || jsonb_build_object('key', left(coalesce(item ->> 'key', ''), 40),
                                         'label', left(item ->> 'label', 40), 'emoji', left(coalesce(item ->> 'emoji', ''), 8));
        n := n + 1;
      end if;
    end loop;
  end if;
  snap := snap || jsonb_build_object('badges', arr);
  arr := '[]'::jsonb; n := 0;
  if jsonb_typeof(p_snapshot -> 'passport') = 'array' then
    for item in select * from jsonb_array_elements(p_snapshot -> 'passport') loop
      exit when n >= 24;
      if jsonb_typeof(item) = 'object' and char_length(coalesce(item ->> 'city', '')) between 1 and 40 then
        arr := arr || jsonb_build_object('city', left(item ->> 'city', 40),
                                         'count', least(greatest(coalesce((item ->> 'count')::numeric, 0)::integer, 0), 100000));
        n := n + 1;
      end if;
    end loop;
  end if;
  snap := snap || jsonb_build_object('passport', arr);

  update public.profiles set
    handle = h, profile_public = true, public_off_at = null,
    handle_changed_at = case when prof.handle is null or lower(prof.handle) <> h then now() else prof.handle_changed_at end,
    bio = nullif(trim(p_bio), ''), public_show = show, public_snapshot = snap
  where id = me;

  -- picks: only places your groups have saved; up to 12 places and 12 dishes
  delete from public.profile_picks where user_id = me;
  n := 0;
  if jsonb_typeof(p_picks) = 'array' then
    for pick in select * from jsonb_array_elements(p_picks) loop
      exit when n >= 24;
      if (pick ->> 'kind') in ('place', 'dish')
         and pick ->> 'restaurant_id' ~ '^[0-9a-f-]{36}$'
         and public.my_restaurant((pick ->> 'restaurant_id')::uuid)
         and ((pick ->> 'kind') = 'place' or char_length(coalesce(pick ->> 'dish', '')) between 1 and 80)
         and (select count(*) from public.profile_picks where user_id = me and kind = pick ->> 'kind') < 12
      then
        insert into public.profile_picks (user_id, kind, restaurant_id, dish, position)
        values (me, pick ->> 'kind', (pick ->> 'restaurant_id')::uuid,
                case when pick ->> 'kind' = 'dish' then left(pick ->> 'dish', 80) end, n)
        on conflict do nothing;
        n := n + 1;
      end if;
    end loop;
  end if;
  return jsonb_build_object('public', true, 'handle', h);
end $$;
revoke execute on function public.set_public_profile(boolean, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.set_public_profile(boolean, text, text, jsonb, jsonb, jsonb) to authenticated;

-- My own settings, for the settings screen (works whether or not it's switched on).
create or replace function public.my_public_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'public', p.profile_public, 'handle', p.handle, 'bio', p.bio, 'show', p.public_show,
    'can_change_after', case when p.handle_changed_at is not null and p.handle_changed_at > now() - interval '30 days'
                             then p.handle_changed_at + interval '30 days' end,
    'picks', (select coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'restaurant_id', k.restaurant_id, 'dish', k.dish)
                                        order by k.position), '[]') from public.profile_picks k where k.user_id = p.id))
    from public.profiles p where p.id = auth.uid()
$$;
revoke execute on function public.my_public_profile() from public, anon;
grant execute on function public.my_public_profile() to authenticated;

-- What a stranger sees at /u/<handle>. Null when it doesn't exist or is private.
create or replace function public.public_profile(h text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  own text[] := array['crumbs', 'osm', 'owner', 'site'];
begin
  select * into p from public.profiles where lower(handle) = lower(coalesce(h, '')) and profile_public;
  if not found then return null; end if;
  return jsonb_build_object(
    'handle', p.handle, 'name', p.display_name, 'avatar_url', p.avatar_url, 'bio', p.bio,
    'show', p.public_show,
    'stats', p.public_snapshot -> 'stats',
    'badges', case when (p.public_show ->> 'badges')::boolean then p.public_snapshot -> 'badges' else '[]'::jsonb end,
    'passport', case when (p.public_show ->> 'passport')::boolean then p.public_snapshot -> 'passport' else '[]'::jsonb end,
    'places', case when (p.public_show ->> 'favourites')::boolean or (p.public_show ->> 'map')::boolean then
      (select coalesce(jsonb_agg(jsonb_build_object(
          'name', r.name, 'city', s.city, 'slug', s.slug,
          'cuisine', case when r.sources ->> 'cuisine' = any (own) then r.cuisine end,
          'score', (select round(max(coalesce(pr.points / 20.0, pr.score))::numeric, 1)
                      from public.place_ratings pr join public.places pl on pl.id = pr.place_id
                     where pl.restaurant_id = r.id and pr.user_id = p.id and not coalesce(pr.draft, false)),
          'lat', case when r.sources ->> 'location' = any (own) then r.latitude end,
          'lng', case when r.sources ->> 'location' = any (own) then r.longitude end) order by k.position), '[]')
         from public.profile_picks k join public.restaurants r on r.id = k.restaurant_id
         join public.restaurant_slugs s on s.restaurant_id = r.id and s.is_current
        where k.user_id = p.id and k.kind = 'place')
      else '[]'::jsonb end,
    'dishes', case when (p.public_show ->> 'dishes')::boolean then
      (select coalesce(jsonb_agg(jsonb_build_object('dish', k.dish, 'restaurant', r.name, 'city', s.city, 'slug', s.slug)
                                 order by k.position), '[]')
         from public.profile_picks k join public.restaurants r on r.id = k.restaurant_id
         join public.restaurant_slugs s on s.restaurant_id = r.id and s.is_current
        where k.user_id = p.id and k.kind = 'dish')
      else '[]'::jsonb end);
end $$;
revoke execute on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. The public restaurant page's data
-- ---------------------------------------------------------------------------------------------
create or replace function public.restaurant_public_data(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.restaurants%rowtype;
  sl record;
  own text[] := array['crumbs', 'osm', 'owner', 'site'];
  rs record;
  vs record;
  g3 boolean;
  v3 boolean;
  groups_n integer;
begin
  select * into r from public.restaurants where id = target;
  if not found then return null; end if;
  select city, slug into sl from public.restaurant_slugs where restaurant_id = target and is_current;

  select count(distinct p.group_id) as groups, count(*) as n,
         round(avg(coalesce(pr.points / 20.0, pr.score))::numeric, 1) as avg,
         count(*) filter (where pr.would_return = 'yes') as yes,
         count(*) filter (where pr.would_return is not null) as asked,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 5) as c5,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 4) as c4,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 3) as c3,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) = 2) as c2,
         count(*) filter (where round(coalesce(pr.points / 20.0, pr.score)) <= 1) as c1
    into rs
    from public.place_ratings pr join public.places p on p.id = pr.place_id
   where p.restaurant_id = target and not coalesce(pr.draft, false);
  g3 := rs.groups >= 3;

  select count(*) as visits, count(distinct p.group_id) as groups,
         count(*) filter (where v.spend > 0 and v.people > 0) as paid,
         round(avg(v.spend / v.people) filter (where v.spend > 0 and v.people > 0), 0) as per_head,
         round(avg(v.spend / v.people) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('breakfast', 'lunch')), 0) as lunch,
         count(*) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('breakfast', 'lunch')) as lunch_n,
         round(avg(v.spend / v.people) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('dinner', 'late')), 0) as dinner,
         count(*) filter (where v.spend > 0 and v.people > 0 and v.meal_time in ('dinner', 'late')) as dinner_n,
         count(*) filter (where v.meal_time is not null) as timed,
         (select round(percentile_cont(0.5) within group (order by w.wait_minutes))::int
            from public.place_visits w join public.places wp on wp.id = w.place_id
           where wp.restaurant_id = target and w.wait_minutes is not null and coalesce(w.kind, 'dine_in') = 'dine_in') as wait,
         (select count(*) from public.place_visits w join public.places wp on wp.id = w.place_id
           where wp.restaurant_id = target and w.wait_minutes is not null and coalesce(w.kind, 'dine_in') = 'dine_in') as wait_n
    into vs
    from public.place_visits v join public.places p on p.id = v.place_id
   where p.restaurant_id = target;
  v3 := vs.groups >= 3;
  select count(distinct group_id) into groups_n from public.places where restaurant_id = target;

  return jsonb_build_object(
    'id', r.id, 'name', r.name, 'city', sl.city, 'slug', sl.slug,
    'claimed', r.owner_verified,
    'google_place_id', r.google_place_id,
    'cuisine', case when r.sources ->> 'cuisine' = any (own) then r.cuisine end,
    'price_level', case when r.sources ->> 'price_level' = any (own) then r.price_level end,
    'address', case when r.sources ->> 'address' = any (own) then r.formatted_address end,
    'phone', case when r.sources ->> 'phone' = any (own) then r.phone end,
    'website', case when r.sources ->> 'website' = any (own) then r.website end,
    'hours', case when r.sources ->> 'hours' = any (own) then r.opening_hours end,
    'business_status', case when r.sources ->> 'status' = any (own) then r.business_status end,
    'lat', case when r.sources ->> 'location' = any (own) then r.latitude end,
    'lng', case when r.sources ->> 'location' = any (own) then r.longitude end,
    'sources', (select coalesce(jsonb_object_agg(e.key, e.value), '{}')
                  from jsonb_each_text(r.sources) e where e.value = any (own)),
    'saved_by_groups', case when groups_n >= 3 then groups_n end,
    'rating', case when g3 then jsonb_build_object(
        'avg', rs.avg, 'groups', rs.groups, 'ratings', rs.n,
        'hist', jsonb_build_object('5', rs.c5, '4', rs.c4, '3', rs.c3, '2', rs.c2, '1', rs.c1),
        'would_return', case when rs.asked >= 3 then round(100.0 * rs.yes / rs.asked) end) end,
    'visits', case when v3 then vs.visits end,
    'known_for', case when g3 then
        (select coalesce(jsonb_agg(jsonb_build_object('reason', t.reason, 'n', t.n) order by t.n desc, t.reason), '[]')
           from (select x.reason, count(distinct p.group_id) as n
                   from public.place_ratings pr join public.places p on p.id = pr.place_id
                   cross join lateral unnest(pr.reasons) as x(reason)
                  where p.restaurant_id = target and not coalesce(pr.draft, false)
                  group by x.reason having count(distinct p.group_id) >= 3
                  order by n desc, x.reason limit 6) t) else '[]'::jsonb end,
    'top_dishes', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'points', t.points, 'groups', t.groups)
                                              order by t.points desc, t.name), '[]')
                     from (select min(d.name) as name, round(avg(coalesce(dr.points, dr.score * 20)))::int as points,
                                  count(distinct p.group_id) as groups
                             from public.dishes d join public.places p on p.id = d.place_id
                             join public.dish_ratings dr on dr.dish_id = d.id
                            where p.restaurant_id = target
                            group by public.dish_key(d.name)
                           having count(distinct p.group_id) >= 3
                            order by 2 desc limit 6) t),
    'menu', (select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'price', m.price, 'course', m.course,
                                                          'dietary', m.dietary, 'description', m.description,
                                                          'claimed', m.claimed) order by m.claimed desc, m.name), '[]')
               from (select * from public.restaurant_dishes d where d.restaurant_id = target and not d.hidden
                      order by d.claimed desc, d.name limit 80) m),
    'spend', case when v3 and vs.paid >= 3 then jsonb_build_object(
        'per_head', vs.per_head,
        'lunch', case when vs.lunch_n >= 3 then vs.lunch end,
        'dinner', case when vs.dinner_n >= 3 then vs.dinner end) end,
    'wait', case when v3 and vs.wait_n >= 3 then vs.wait end,
    'busy', case when v3 and vs.timed >= 8 then
        (select coalesce(jsonb_agg(jsonb_build_object('dow', b.dow, 'meal', b.meal_time, 'n', b.n) order by b.n desc), '[]')
           from (select extract(dow from v.visited_on)::int as dow, v.meal_time, count(*) as n
                   from public.place_visits v join public.places p on p.id = v.place_id
                  where p.restaurant_id = target and v.meal_time is not null
                  group by 1, 2 order by 3 desc limit 6) b) end,
    'good_to_know', (select coalesce(jsonb_object_agg(t.k, jsonb_build_object('verdict', t.verdict, 'owner', t.owner)), '{}')
                       from (select k, owner, case when owner is not null then owner
                                                   when y >= 2 and y > n then true
                                                   when n >= 2 and n > y then false end as verdict
                               from (select v.key as k,
                                            count(*) filter (where v.value) as y, count(*) filter (where not v.value) as n,
                                            bool_or(v.value) filter (where exists (select 1 from public.restaurant_managers m
                                                                                    where m.restaurant_id = target and m.user_id = v.user_id)) as owner
                                       from public.restaurant_attr_votes v where v.restaurant_id = target group by v.key) a) t
                      where t.verdict is not null),
    'tips', (select coalesce(jsonb_agg(jsonb_build_object('kind', t.kind, 'body', t.body, 'photo_path', t.photo_path)
                                       order by t.created_at desc), '[]')
               from (select * from public.restaurant_tips where restaurant_id = target
                        and kind in ('entrance', 'parking', 'storefront') order by created_at desc limit 8) t),
    'posts', case when r.owner_verified then
        (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'title', x.title, 'body', x.body,
                                                      'ends_on', x.ends_on) order by x.created_at desc), '[]')
           from (select * from public.restaurant_posts po
                  where po.restaurant_id = target
                    and (po.starts_on is null or po.starts_on <= current_date)
                    and (po.ends_on is null or po.ends_on >= current_date)
                    and (po.weekdays is null or extract(dow from current_date)::int = any (po.weekdays))
                  order by po.created_at desc limit 5) x) else '[]'::jsonb end);
end $$;
revoke execute on function public.restaurant_public_data(uuid) from public, anon, authenticated;

-- /r/<city>/<slug>: the page's data, or {"redirect": {...}} if that link was renamed.
create or replace function public.restaurant_public(city_slug text, rest_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.restaurant_slugs%rowtype; cur public.restaurant_slugs%rowtype;
begin
  select * into s from public.restaurant_slugs
   where city = lower(coalesce(city_slug, '')) and slug = lower(coalesce(rest_slug, ''));
  if not found then return null; end if;
  if not s.is_current then
    select * into cur from public.restaurant_slugs where restaurant_id = s.restaurant_id and is_current;
    return jsonb_build_object('redirect', jsonb_build_object('city', cur.city, 'slug', cur.slug));
  end if;
  return public.restaurant_public_data(s.restaurant_id);
end $$;
revoke execute on function public.restaurant_public(text, text) from public;
grant execute on function public.restaurant_public(text, text) to anon, authenticated;

-- Same data by id, for the place page inside the app.
create or replace function public.restaurant_public_by_id(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.restaurant_public_data(target) where auth.uid() is not null
$$;
revoke execute on function public.restaurant_public_by_id(uuid) from public, anon;
grant execute on function public.restaurant_public_by_id(uuid) to authenticated;

-- Admins and the SQL editor can move a restaurant to a new link; the old link keeps working (redirects).
create or replace function public.reslug_restaurant(target uuid, new_city text, new_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare c text := public.slugify(new_city); s text := public.slugify(new_slug);
begin
  if auth.uid() is not null and not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  if c is null or s is null then raise exception 'Need a city and a name'; end if;
  if exists (select 1 from public.restaurant_slugs where city = c and slug = s and restaurant_id <> target) then
    raise exception 'That link is already used';
  end if;
  update public.restaurant_slugs set is_current = false where restaurant_id = target and is_current;
  insert into public.restaurant_slugs (city, slug, restaurant_id, is_current) values (c, s, target, true)
  on conflict (city, slug) do update set is_current = true;
end $$;
revoke execute on function public.reslug_restaurant(uuid, text, text) from public, anon;
grant execute on function public.reslug_restaurant(uuid, text, text) to authenticated;
