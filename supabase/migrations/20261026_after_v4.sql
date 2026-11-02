-- Crumbs: changes after the v4 database update (run once in Supabase -> SQL Editor; safe to re-run).
-- Run AFTER 20261025_v4_features.sql. From now on every change gets its own dated file like this.

-- ============================================================================================
-- 1. What members add shows straight away (Aidan, Oct 26): no second person needed. Others can
--    still agree or correct it. Owners' details, far map-pin moves and low-trust accounts keep
--    their extra checks. Good to know answers are worth 1 point each.
-- ============================================================================================
create or replace function public.restaurant_attrs(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'attrs', (select coalesce(jsonb_object_agg(k, jsonb_build_object(
        'yes', y, 'no', n, 'mine', mine, 'owner', owner,
        'verdict', case when owner is not null then owner
                        when y > n then true when n > y then false end)), '{}')
      from (select v.key as k,
                   count(*) filter (where v.value) as y, count(*) filter (where not v.value) as n,
                   bool_or(v.value) filter (where v.user_id = auth.uid()) as mine,
                   bool_or(v.value) filter (where exists (select 1 from public.restaurant_managers m
                                                           where m.restaurant_id = target and m.user_id = v.user_id)) as owner
              from public.restaurant_attr_votes v where v.restaurant_id = target group by v.key) t),
    'groups', (select jsonb_build_object(
        'loud', count(*) filter (where f.noise = 'loud') >= 2,
        'hard_parking', count(*) filter (where f.parking in ('hard', 'none')) >= 2,
        'long_wait', count(*) filter (where f.wait = 'long') >= 2,
        'cash_only', count(*) filter (where f.cash_only) >= 2,
        'not_accessible', count(*) filter (where f.accessible = false) >= 2)
      from public.place_facts f join public.places p on p.id = f.place_id where p.restaurant_id = target)
  ) where auth.uid() is not null
$$;

create or replace function public.set_restaurant_attr(target uuid, attr text, val boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owner boolean := public.manages_restaurant(target);
  before integer;
  agree integer;
  pts integer := 0;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if not (public.my_restaurant(target) or owner) then raise exception 'Not one of your restaurants'; end if;
  if not (attr = any (public.attr_keys())) then raise exception 'Unknown detail'; end if;
  if val is null then
    delete from public.restaurant_attr_votes where restaurant_id = target and key = attr and user_id = me;
    return public.restaurant_attrs(target);
  end if;
  if not owner and public.over_daily_cap('fact') then raise exception 'That’s the most details for today — thanks! Try again tomorrow.'; end if;
  select count(*) into before from public.restaurant_attr_votes where restaurant_id = target and key = attr and user_id <> me;
  select count(*) into agree from public.restaurant_attr_votes where restaurant_id = target and key = attr and user_id <> me and value = val;
  insert into public.restaurant_attr_votes (restaurant_id, key, user_id, value) values (target, attr, me, val)
  on conflict (restaurant_id, key, user_id) do update set value = excluded.value, created_at = now();
  -- New info earns: the first answer (detail), or one of the first few agreeing (confirm). Owners: none.
  if not owner then
    -- Quick yes/no taps: 1 point for the first answer or one of the first few agreeing.
    if before = 0 or agree between 1 and 2 then pts := 1; end if;
    perform public.award_points(me, 'attr', pts, target, target::text || ':' || attr);
  end if;
  return public.restaurant_attrs(target) || jsonb_build_object('points', pts);
end $$;

-- A member changes a detail another member set: their answer is used right away.
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
        (coalesce(src, '') not in ('crumbs', 'owner') or current is null or src = 'crumbs' or current = v) then
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
  if true then -- one member's price is used straight away; others can still correct it
    update public.restaurant_dishes set price = new_price, price_set_at = now(), price_checked_at = now() where id = target_dish;
    perform public.refresh_menu_price(d.restaurant_id);
    perform public.menu_settle(d.restaurant_id);
    return jsonb_build_object('applied', true, 'agree', agree);
  end if;
  return jsonb_build_object('applied', false, 'agree', agree);
end $$;

-- ============================================================================================
-- 2. Groups: public groups people can find, and how they get in (invite only / ask / open).
--    Public shows only the name, emoji, colour, description and counts — never places or notes.
-- ============================================================================================
alter table public.groups add column if not exists visibility text not null default 'private';
alter table public.groups add column if not exists join_mode text not null default 'invite';
alter table public.groups add column if not exists description text;
do $$ begin
  alter table public.groups add constraint groups_visibility_check check (visibility in ('private', 'public'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.groups add constraint groups_join_mode_check check (join_mode in ('invite', 'request', 'open'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.groups add constraint groups_description_len check (char_length(description) <= 160);
exception when duplicate_object then null; end $$;

create table if not exists public.group_join_requests (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_join_requests enable row level security;
drop policy if exists group_join_requests_own on public.group_join_requests;
create policy group_join_requests_own on public.group_join_requests for select to authenticated
  using (user_id = (select auth.uid()));

-- Find a group: public groups only, safe fields only (no codes).
create or replace function public.public_groups(q text default '')
returns table (id uuid, name text, emoji text, color text, description text, join_mode text,
               members integer, places integer, is_member boolean, requested boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.emoji, g.color, g.description, g.join_mode,
         (select count(*) from public.group_members m where m.group_id = g.id and m.role is distinct from 'guest')::int,
         (select count(*) from public.places p where p.group_id = g.id)::int,
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
         exists (select 1 from public.group_join_requests r where r.group_id = g.id and r.user_id = auth.uid())
    from public.groups g
   where auth.uid() is not null and g.visibility = 'public'
     and (coalesce(trim(q), '') = '' or g.name ilike '%' || replace(replace(trim(q), '%', ''), '_', '') || '%')
   order by 7 desc, g.name
   limit 50
$$;

-- Join an open public group straight away.
create or replace function public.join_public_group(target uuid)
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into g from public.groups where id = target;
  if g.id is null or g.visibility <> 'public' then raise exception 'That group isn’t public'; end if;
  if g.join_mode <> 'open' then raise exception 'This group asks first — tap Ask to join'; end if;
  insert into public.group_members (group_id, user_id, role) values (g.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  delete from public.group_join_requests where group_id = g.id and user_id = auth.uid();
  return g;
end $$;

-- Ask to join a public group that asks first.
create or replace function public.request_to_join(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into g from public.groups where id = target;
  if g.id is null or g.visibility <> 'public' or g.join_mode = 'invite' then
    raise exception 'That group only takes invites';
  end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then return; end if;
  if (select count(*) from public.group_join_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That’s a lot of requests for one day — try again tomorrow';
  end if;
  insert into public.group_join_requests (group_id, user_id) values (g.id, auth.uid())
  on conflict (group_id, user_id) do nothing;
end $$;

-- The owner / admins see who's asking, and say yes or no.
create or replace function public.join_requests(target uuid)
returns table (user_id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, coalesce(p.display_name, 'Someone'), r.created_at
    from public.group_join_requests r left join public.profiles p on p.id = r.user_id
   where r.group_id = target and public.is_group_admin(target)
   order by r.created_at
$$;
create or replace function public.answer_join_request(target uuid, person uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_admin(target) then raise exception 'Only the group owner or an admin can do that'; end if;
  if not exists (select 1 from public.group_join_requests where group_id = target and user_id = person) then
    raise exception 'That request is gone';
  end if;
  if accept then
    insert into public.group_members (group_id, user_id, role) values (target, person, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;
  delete from public.group_join_requests where group_id = target and user_id = person;
end $$;

revoke execute on function public.public_groups(text), public.join_public_group(uuid), public.request_to_join(uuid),
  public.join_requests(uuid), public.answer_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.public_groups(text), public.join_public_group(uuid), public.request_to_join(uuid),
  public.join_requests(uuid), public.answer_join_request(uuid, uuid, boolean) to authenticated;

-- ============================================================================================
-- 3. Recipes: what kind of dish it is and its cuisine, ingredients as rows (amount, measure,
--    what), and saving other people's shared recipes ("Saved" in Home cooking).
-- ============================================================================================
alter table public.home_meals add column if not exists kind text;
alter table public.home_meals add column if not exists cuisine text;
alter table public.home_meals add column if not exists ingredients jsonb not null default '[]';
do $$ begin
  alter table public.home_meals add constraint home_meals_kind_check check (kind is null or kind in
    ('Breakfast', 'Main', 'Side', 'Soup', 'Salad', 'Snack', 'Dessert', 'Baking', 'Drink', 'Sauce'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.home_meals add constraint home_meals_cuisine_len check (cuisine is null or char_length(cuisine) <= 40);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.home_meals add constraint home_meals_ingredients_check
    check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 80 and octet_length(ingredients::text) <= 12000);
exception when duplicate_object then null; end $$;

create table if not exists public.recipe_saves (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_id uuid not null references public.home_meals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, meal_id)
);
alter table public.recipe_saves enable row level security;
drop policy if exists recipe_saves_own_read on public.recipe_saves;
create policy recipe_saves_own_read on public.recipe_saves for select to authenticated
  using (user_id = (select auth.uid()));
-- (Shared recipes belong to other groups, so this check looks past their privacy.)
create or replace function public.recipe_is_public(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.home_meals m where m.id = target and m.recipe_public)
$$;
drop policy if exists recipe_saves_own_add on public.recipe_saves;
create policy recipe_saves_own_add on public.recipe_saves for insert to authenticated
  with check (user_id = (select auth.uid()) and public.recipe_is_public(meal_id));
drop policy if exists recipe_saves_own_remove on public.recipe_saves;
create policy recipe_saves_own_remove on public.recipe_saves for delete to authenticated
  using (user_id = (select auth.uid()));

-- Shared recipes now include kind, cuisine, ingredients and whether you saved it; mode 'saved'
-- lists the ones you saved.
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
      and not public.is_group_member(m.group_id) -- your own group's recipes live in "Our kitchen"
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

-- ============================================================================================
-- 4. Decide together: "head to head" (would you rather) as well as swipe to match.
-- ============================================================================================
alter table public.swipe_sessions add column if not exists style text not null default 'swipe';
do $$ begin
  alter table public.swipe_sessions add constraint swipe_sessions_style_check check (style in ('swipe', 'duel'));
exception when duplicate_object then null; end $$;
