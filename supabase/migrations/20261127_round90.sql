-- Round 90 (Nov 18): make your own version of a recipe, with credit; no near-copies on Crumbs.
-- Aidan (Nov 18): "if you like a recipe and you want to modify it you can take it to your
-- personal and make any kind of modifications. Recipes that are identical cannot be put public if
-- another recipe exists that actually is the same." His answers: always credit the original;
-- "the same" = nearly the same (about 90%+ of ingredients and steps, ignoring capitals, spacing,
-- order and amounts).
-- Safe to run more than once. The app works before this runs (no "Make my own version" button
-- result, no check).

-- ============================================================================================
-- 1. Columns: where a version came from (the credit) and a fingerprint for the copy check
-- ============================================================================================
alter table public.home_meals add column if not exists based_on uuid references public.home_meals(id) on delete set null;
alter table public.home_meals add column if not exists based_on_name text;
alter table public.home_meals add column if not exists based_on_by uuid;
alter table public.home_meals add column if not exists public_since timestamptz;
alter table public.home_meals add column if not exists fp_ingredients text[];
alter table public.home_meals add column if not exists fp_steps integer[];
alter table public.home_meals drop constraint if exists home_meals_based_on_name_len;
alter table public.home_meals add constraint home_meals_based_on_name_len
  check (based_on_name is null or char_length(based_on_name) <= 120);
create index if not exists home_meals_based_on_idx on public.home_meals (based_on);
create index if not exists home_meals_fp_ingredients_idx on public.home_meals using gin (fp_ingredients) where recipe_public;
create index if not exists home_meals_fp_steps_idx on public.home_meals using gin (fp_steps) where recipe_public;

-- ============================================================================================
-- 2. Fingerprints. Ingredients: the names only (no amounts or units), accents and capitals
--    ignored, a plural "s" dropped. Steps: every run of three words, accents, capitals, numbers
--    and punctuation ignored (so one changed word changes only a few of them).
-- ============================================================================================
create or replace function public.recipe_words(t text)
returns text[] language sql immutable parallel safe set search_path = public as $$
  select coalesce(array_agg(w order by n), '{}')
    from (select w, n from regexp_split_to_table(
                   btrim(regexp_replace(public.fold(coalesce(t, '')), '[^a-z]+', ' ', 'g')), ' ')
                   with ordinality as x(w, n)
           where w <> '') s
$$;

create or replace function public.recipe_fp_ingredients(items jsonb)
returns text[] language sql immutable parallel safe set search_path = public as $$
  select coalesce(array_agg(distinct k), '{}')
    from (select array_to_string(array(select case when char_length(w) > 3 and w ~ '[^s]s$'
                                                   then left(w, -1) else w end
                                         from unnest(public.recipe_words(
                                                case when jsonb_typeof(i) = 'object' then i ->> 'item'
                                                     when jsonb_typeof(i) = 'string' then i #>> '{}' end)) w), ' ') as k
            from jsonb_array_elements(case when jsonb_typeof(items) = 'array' then items else '[]'::jsonb end) i) s
   where k <> ''
$$;

create or replace function public.recipe_fp_steps(steps text)
returns integer[] language sql immutable parallel safe set search_path = public as $$
  with w as (select public.recipe_words(steps) as a)
  select coalesce(array_agg(distinct hashtext(a[i] || ' ' || a[i + 1] || ' ' || a[i + 2])), '{}')
    from w, generate_series(1, greatest(cardinality(a) - 2, 0)) i
$$;

create or replace function public.set_overlap(a anyarray, b anyarray)
returns numeric language sql immutable parallel safe as $$
  select case when cardinality(coalesce(a, '{}')) + cardinality(coalesce(b, '{}')) = 0 then null
              else (select count(*) from (select unnest(a) intersect select unnest(b)) i)::numeric
                   / (select count(*) from (select unnest(a) union select unnest(b)) u) end
$$;

-- How alike two recipes are, 0–1: the average of the ingredient match and the steps match
-- (only the parts at least one of them has).
create or replace function public.recipe_likeness(ia text[], sa integer[], ib text[], sb integer[])
returns numeric language sql immutable parallel safe set search_path = public as $$
  select avg(x) from (values (public.set_overlap(ia, ib)), (public.set_overlap(sa, sb))) v(x) where x is not null
$$;

-- Enough to be worth protecting: 3+ ingredients or a dozen words of steps.
create or replace function public.recipe_has_substance(fi text[], fs integer[])
returns boolean language sql immutable parallel safe as $$
  select cardinality(coalesce(fi, '{}')) >= 3 or cardinality(coalesce(fs, '{}')) >= 10
$$;

-- The recipe this one is nearly the same as (90%+), if any: one already on Crumbs (shared
-- before this one, by someone else), or the recipe it's a version of. Never one you can't see by
-- name: other people's private recipes aren't checked.
drop function if exists public.recipe_twin(public.home_meals);
create or replace function public.recipe_twin(meal public.home_meals)
returns table (id uuid, name text, by_name text, likeness numeric, on_crumbs boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, split_part(coalesce(p.display_name, 'someone'), ' ', 1),
         round(public.recipe_likeness(meal.fp_ingredients, meal.fp_steps, t.fp_ingredients, t.fp_steps), 3),
         t.recipe_public
    from public.home_meals t
    left join public.profiles p on p.id = t.created_by
   where t.id <> meal.id
     and public.recipe_has_substance(t.fp_ingredients, t.fp_steps)
     and (
       (t.id = meal.based_on and t.created_by is distinct from meal.created_by)
       or (t.recipe_public and t.created_by is distinct from meal.created_by
           and coalesce(t.public_since, t.created_at) < coalesce(meal.public_since, now())
           and (t.fp_ingredients && meal.fp_ingredients or t.fp_steps && meal.fp_steps))
     )
     and public.recipe_likeness(meal.fp_ingredients, meal.fp_steps, t.fp_ingredients, t.fp_steps) >= 0.9
   order by 4 desc, coalesce(t.public_since, t.created_at)
   limit 1
$$;
revoke execute on function public.recipe_twin(public.home_meals) from public, anon, authenticated;

-- ============================================================================================
-- 3. The trigger: keeps the fingerprint up to date, keeps the credit, and stops a recipe going
--    on Crumbs (or being edited while on Crumbs) when it's nearly the same as one already there.
--    Recipes already on Crumbs before this ran stay as they are.
-- ============================================================================================
create or replace function public.recipe_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  by_person boolean := coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
                       and coalesce(current_setting('crumbs.crediting', true), '') <> 'on';
  twin record;
begin
  if tg_op = 'INSERT' or new.ingredients is distinct from old.ingredients or new.recipe is distinct from old.recipe
     or new.fp_ingredients is null then
    new.fp_ingredients := public.recipe_fp_ingredients(new.ingredients);
    new.fp_steps := public.recipe_fp_steps(new.recipe);
  end if;
  -- the credit stays (it only goes when the original is deleted)
  if tg_op = 'UPDATE' and by_person then
    if new.based_on is distinct from old.based_on
       and not (new.based_on is null and not exists (select 1 from public.home_meals where id = old.based_on)) then
      new.based_on := old.based_on;
    end if;
    new.based_on_name := old.based_on_name;
    new.based_on_by := old.based_on_by;
  elsif tg_op = 'INSERT' and by_person then
    new.based_on := null;  -- only "Make my own version" sets a credit
    new.based_on_name := null;
    new.based_on_by := null;
  end if;
  if new.recipe_public and (tg_op = 'INSERT' or not old.recipe_public) then
    new.public_since := now();
  elsif not new.recipe_public then
    new.public_since := null;
  end if;
  if by_person and new.recipe_public
     and (tg_op = 'INSERT' or not old.recipe_public
          or new.fp_ingredients is distinct from old.fp_ingredients or new.fp_steps is distinct from old.fp_steps)
     and public.recipe_has_substance(new.fp_ingredients, new.fp_steps) then
    select * into twin from public.recipe_twin(new);
    if found then
      raise exception 'This is nearly the same as “%” by %, %. Make it your own (change about a tenth of it) to share it, or keep it in your spaces.',
        twin.name, twin.by_name,
        case when twin.on_crumbs then 'which is already on Crumbs' else 'the recipe it''s based on' end
        using errcode = 'P0001', hint = 'recipe_twin';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.recipe_guard() from public, anon, authenticated;
drop trigger if exists recipe_guard on public.home_meals;
create trigger recipe_guard before insert or update on public.home_meals
  for each row execute function public.recipe_guard();

-- Fingerprints and "on Crumbs since" for the recipes already there (runs as the database owner,
-- so nothing already on Crumbs is blocked).
update public.home_meals set fp_ingredients = public.recipe_fp_ingredients(ingredients),
       fp_steps = public.recipe_fp_steps(recipe),
       public_since = case when recipe_public then coalesce(public_since, created_at) end
 where fp_ingredients is null;

-- ============================================================================================
-- 4. Make my own version: a copy in your My Crumbs that you can change any way you like,
--    credited "Based on Ana's Sunday lasagna". Any recipe you can see: your groups', ones shared
--    with you, or ones on Crumbs. Your notes, photo, ratings and cooks aren't copied.
-- ============================================================================================
create or replace function public.make_my_version(meal uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  src public.home_meals;
  space uuid;
  made public.home_meals;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  select * into src from public.home_meals where id = meal;
  if not found or not (src.recipe_public or meal in (select public.my_meal_ids())
                       or meal in (select public.meals_shared_with_me())) then
    raise exception 'Recipe not found';
  end if;
  if (select count(*) from public.home_meals where created_by = me and based_on is not null
        and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That''s a lot of versions for one day — try again tomorrow';
  end if;
  space := (public.ensure_my_crumbs()).id;
  -- the credit is set only here (recipe_guard keeps people from setting or changing it)
  perform set_config('crumbs.crediting', 'on', true);
  insert into public.home_meals (group_id, name, status, created_by, recipe_url, dietary, spice, recipe,
                                 kind, cuisine, ingredients, servings, prep_minutes, cook_minutes, recipe_public,
                                 based_on, based_on_name, based_on_by)
  values (space, src.name, 'Want to cook', me, src.recipe_url, src.dietary, src.spice, src.recipe,
          src.kind, src.cuisine, src.ingredients, src.servings, src.prep_minutes, src.cook_minutes, false,
          src.id, src.name, src.created_by)
  returning * into made;
  perform set_config('crumbs.crediting', '', true);
  return to_jsonb(made);
end $$;
revoke execute on function public.make_my_version(uuid) from public, anon;
grant execute on function public.make_my_version(uuid) to authenticated;

-- The credit line for a recipe you can see: whose recipe it's based on, and the original itself
-- when it's on Crumbs (so the app can show it).
create or replace function public.recipe_credit(meal uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'name', m.based_on_name,
           'by', case when m.based_on_by = auth.uid() then 'you'
                      else split_part(coalesce(p.display_name, 'someone'), ' ', 1) end,
           'original', case when o.recipe_public then jsonb_build_object(
               'id', o.id, 'name', o.name, 'ingredients', o.ingredients, 'recipe', o.recipe,
               'recipe_url', o.recipe_url) end)
    from public.home_meals m
    left join public.profiles p on p.id = m.based_on_by
    left join public.home_meals o on o.id = m.based_on
   where m.id = meal and m.based_on_name is not null and auth.uid() is not null
     and (m.recipe_public or m.id in (select public.my_meal_ids()) or m.id in (select public.meals_shared_with_me()))
$$;
revoke execute on function public.recipe_credit(uuid) from public, anon;
grant execute on function public.recipe_credit(uuid) to authenticated;

-- ============================================================================================
-- 5. Recipes on Crumbs show their credit too (Round 81's version plus based_on_name / based_on_by)
-- ============================================================================================
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
      'servings', m.servings, 'prep_minutes', m.prep_minutes, 'cook_minutes', m.cook_minutes,
      'based_on_name', m.based_on_name,
      'based_on_by', case when m.based_on_name is null then null
                          when m.based_on_by = auth.uid() then 'you'
                          else split_part(coalesce(bp.display_name, 'someone'), ' ', 1) end,
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
    from public.home_meals m
    left join public.profiles p on p.id = m.created_by
    left join public.profiles bp on bp.id = m.based_on_by
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
revoke execute on function public.public_recipes(text, integer, text) from public, anon;
grant execute on function public.public_recipes(text, integer, text) to authenticated;

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261127_round90') on conflict (name) do nothing;
