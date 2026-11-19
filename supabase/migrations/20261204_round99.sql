-- Round 99 (Nov 19): O15 v2 table menus. The owner picks only the look (a ready-made style or
-- build-your-own, fonts, layout, logo, extras) — everything on the menu comes from what they keep
-- in Crumbs: their own categories (in their order, each shown its own way: sizes in columns,
-- colour swatches, add-ons…), and per dish: size prices, "sold out today", badges, a colour, the
-- name in its own language, spice, "pairs with" and a photo.
-- Safe to run more than once; the app works before it runs (old look and courses as before).

-- 1. Categories the owner makes (Pizza, Pasta, Flavours of the day…), in their order.
create table if not exists public.restaurant_menu_sections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_name text check (menu_name is null or char_length(menu_name) between 1 and 30),
  name text not null check (char_length(name) between 1 and 40),
  name_local text check (name_local is null or char_length(name_local) between 1 and 40),
  position integer not null default 0,
  -- how the category is shown: {"effect": "sizes", "sizes": ["10\"", "14\""], "show_prices": true, "note": "", "label": ""}
  display jsonb not null default '{}'::jsonb check (jsonb_typeof(display) = 'object' and pg_column_size(display) < 2000),
  created_at timestamptz not null default now()
);
create index if not exists restaurant_menu_sections_idx on public.restaurant_menu_sections (restaurant_id, position);
alter table public.restaurant_menu_sections enable row level security;
drop policy if exists restaurant_menu_sections_read on public.restaurant_menu_sections;
create policy restaurant_menu_sections_read on public.restaurant_menu_sections for select to authenticated using (true);
-- (no insert/update/delete policies: writes go through the owner functions below)

-- 2. What a dish can carry on the table menu.
alter table public.restaurant_dishes add column if not exists section_id uuid references public.restaurant_menu_sections(id) on delete set null;
alter table public.restaurant_dishes add column if not exists position integer;
alter table public.restaurant_dishes add column if not exists prices numeric(10,2)[];
alter table public.restaurant_dishes add column if not exists sold_out_on date;
alter table public.restaurant_dishes add column if not exists badges text[];
alter table public.restaurant_dishes add column if not exists swatch text;
alter table public.restaurant_dishes add column if not exists name_local text;
alter table public.restaurant_dishes add column if not exists spice smallint;
alter table public.restaurant_dishes add column if not exists pairs_with text;
alter table public.restaurant_dishes add column if not exists photo_path text;
alter table public.restaurant_dishes drop constraint if exists restaurant_dishes_look_ok;
alter table public.restaurant_dishes add constraint restaurant_dishes_look_ok check (
  (prices is null or (cardinality(prices) between 2 and 4 and array_position(prices, null) is null
                      and 0 <= all (prices) and 10000 > all (prices)))
  and (badges is null or (badges <@ array['New', 'Popular', 'House favourite', 'Seasonal'] and cardinality(badges) <= 4))
  and (swatch is null or swatch ~ '^#[0-9A-Fa-f]{6}$')
  and (name_local is null or char_length(name_local) between 1 and 120)
  and (spice is null or spice between 0 and 3)
  and (pairs_with is null or char_length(pairs_with) between 1 and 80));
create index if not exists restaurant_dishes_section_idx on public.restaurant_dishes (section_id);

-- 3. The look itself (v2 design; menu_theme stays for older apps and as the fallback).
alter table public.restaurants add column if not exists menu_design jsonb;
alter table public.restaurants drop constraint if exists restaurants_menu_design_ok;
alter table public.restaurants add constraint restaurants_menu_design_ok check (
  menu_design is null or (jsonb_typeof(menu_design) = 'object' and pg_column_size(menu_design) < 4000));

-- ---------- owner functions ----------
create or replace function public.owner_set_menu_design(target uuid, design jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can do this'; end if;
  if design is null or jsonb_typeof(design) <> 'object' or coalesce(design ->> 'v', '') <> '2' then
    raise exception 'That isn''t a menu look';
  end if;
  if pg_column_size(design) >= 4000 then raise exception 'That look is too big'; end if;
  update public.restaurants set menu_design = design, updated_at = now() where id = target;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = auth.uid();
  return true;
end $$;
revoke execute on function public.owner_set_menu_design(uuid, jsonb) from public, anon;
grant execute on function public.owner_set_menu_design(uuid, jsonb) to authenticated;

-- Add (section null) or change a category.
create or replace function public.owner_menu_section_save(target uuid, section uuid, sec_name text,
                                                         sec_local text, sec_menu text, disp jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid; n integer;
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can do this'; end if;
  if btrim(coalesce(sec_name, '')) = '' then raise exception 'Give the category a name'; end if;
  if disp is not null and (jsonb_typeof(disp) <> 'object' or pg_column_size(disp) >= 2000) then
    raise exception 'Those category settings aren''t right';
  end if;
  if section is null then
    select count(*) into n from public.restaurant_menu_sections where restaurant_id = target;
    if n >= 40 then raise exception 'That''s the most categories a menu can have (40)'; end if;
    insert into public.restaurant_menu_sections (restaurant_id, name, name_local, menu_name, display, position)
    values (target, left(btrim(sec_name), 40), nullif(left(btrim(coalesce(sec_local, '')), 40), ''),
            nullif(left(btrim(coalesce(sec_menu, '')), 30), ''), coalesce(disp, '{}'::jsonb), n)
    returning id into sid;
  else
    update public.restaurant_menu_sections
       set name = left(btrim(sec_name), 40), name_local = nullif(left(btrim(coalesce(sec_local, '')), 40), ''),
           menu_name = nullif(left(btrim(coalesce(sec_menu, '')), 30), ''), display = coalesce(disp, display)
     where id = section and restaurant_id = target
    returning id into sid;
    if sid is null then raise exception 'That category isn''t on this menu'; end if;
  end if;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = auth.uid();
  return sid;
end $$;
revoke execute on function public.owner_menu_section_save(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.owner_menu_section_save(uuid, uuid, text, text, text, jsonb) to authenticated;

-- Remove a category (its dishes stay on the menu, back under their course).
create or replace function public.owner_menu_section_remove(section uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.restaurant_menu_sections where id = section;
  if rid is null or not public.manages_restaurant(rid) then raise exception 'Only the restaurant can do this'; end if;
  delete from public.restaurant_menu_sections where id = section;
  return true;
end $$;
revoke execute on function public.owner_menu_section_remove(uuid) from public, anon;
grant execute on function public.owner_menu_section_remove(uuid) to authenticated;

-- Put categories and dishes in the owner's order (each list in order, first = top).
create or replace function public.owner_menu_order(target uuid, section_ids uuid[], dish_ids uuid[])
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can do this'; end if;
  if exists (select 1 from unnest(coalesce(section_ids, '{}')) x(id)
              where not exists (select 1 from public.restaurant_menu_sections s where s.id = x.id and s.restaurant_id = target))
     or exists (select 1 from unnest(coalesce(dish_ids, '{}')) x(id)
              where not exists (select 1 from public.restaurant_dishes d where d.id = x.id and d.restaurant_id = target)) then
    raise exception 'Something in that order isn''t on this menu';
  end if;
  update public.restaurant_menu_sections s set position = o.i - 1
    from unnest(coalesce(section_ids, '{}')) with ordinality o(id, i) where s.id = o.id;
  update public.restaurant_dishes d set position = o.i - 1
    from unnest(coalesce(dish_ids, '{}')) with ordinality o(id, i) where d.id = o.id;
  return true;
end $$;
revoke execute on function public.owner_menu_order(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.owner_menu_order(uuid, uuid[], uuid[]) to authenticated;

-- Everything a dish shows on the table menu (besides name/price/course, which owner_edit_dish keeps).
-- size_prices: one price per size (2–4); null = a single price. The usual price becomes the first size.
create or replace function public.owner_dish_look(target_dish uuid, section uuid, size_prices numeric[],
                                                  dish_badges text[], dish_diet text[], dish_swatch text, local text,
                                                  dish_spice integer, pairs text, photo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.restaurant_dishes where id = target_dish;
  if rid is null or not public.manages_restaurant(rid) then raise exception 'Only the restaurant can do this'; end if;
  if section is not null and not exists (select 1 from public.restaurant_menu_sections where id = section and restaurant_id = rid) then
    raise exception 'That category isn''t on this menu';
  end if;
  if photo is not null and not (photo like rid::text || '/%' or photo like 'r2:' || rid::text || '/%') then
    raise exception 'That photo isn''t one of this restaurant''s photos';
  end if;
  if dish_diet is not null and not dish_diet <@ array['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal'] then
    raise exception 'That isn''t one of the diet labels';
  end if;
  if size_prices is not null and cardinality(size_prices) = 1 then size_prices := null; end if;
  update public.restaurant_dishes
     set section_id = section,
         prices = size_prices,
         price = case when size_prices is not null then size_prices[1] else price end,
         badges = nullif(dish_badges, '{}'),
         dietary = coalesce(dish_diet, dietary),
         swatch = nullif(btrim(coalesce(dish_swatch, '')), ''),
         name_local = nullif(btrim(coalesce(local, '')), ''),
         spice = nullif(dish_spice, 0),
         pairs_with = nullif(btrim(coalesce(pairs, '')), ''),
         photo_path = photo,
         owner_ok = true, hidden = false
   where id = target_dish;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = rid and user_id = auth.uid();
  return true;
end $$;
revoke execute on function public.owner_dish_look(uuid, uuid, numeric[], text[], text[], text, text, integer, text, text) from public, anon;
grant execute on function public.owner_dish_look(uuid, uuid, numeric[], text[], text[], text, text, integer, text, text) to authenticated;

-- "Sold out today": greyed out on the menu until tomorrow (Toronto), then back by itself.
create or replace function public.owner_dish_sold_out(target_dish uuid, sold boolean)
returns date language plpgsql security definer set search_path = public as $$
declare rid uuid; today date := (now() at time zone 'America/Toronto')::date;
begin
  select restaurant_id into rid from public.restaurant_dishes where id = target_dish;
  if rid is null or not public.manages_restaurant(rid) then raise exception 'Only the restaurant can do this'; end if;
  update public.restaurant_dishes set sold_out_on = case when sold then today end where id = target_dish;
  return case when sold then today end;
end $$;
revoke execute on function public.owner_dish_sold_out(uuid, boolean) from public, anon;
grant execute on function public.owner_dish_sold_out(uuid, boolean) to authenticated;

-- ---------- what the table menu gets ----------
-- The owner's categories, look and each dish's table-menu details (owner-verified pages only;
-- members' dishes on unclaimed pages come through as before, grouped by course).
create or replace function public.restaurant_menu_bits(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'menu_design', case when r.owner_verified then r.menu_design end,
    'menu_sections', case when r.owner_verified then
        (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'name_local', s.name_local,
                                                      'menu_name', s.menu_name, 'display', s.display)
                                   order by s.position, s.created_at), '[]'::jsonb)
           from public.restaurant_menu_sections s where s.restaurant_id = target) else '[]'::jsonb end,
    'menu_items', case when r.owner_verified then
        (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', d.id, 'name', d.name, 'section', d.section_id, 'position', d.position, 'prices', to_jsonb(d.prices),
                  'sold_out_on', d.sold_out_on, 'badges', to_jsonb(d.badges), 'swatch', d.swatch, 'name_local', d.name_local,
                  'spice', d.spice, 'pairs_with', d.pairs_with, 'photo_path', d.photo_path, 'dietary', to_jsonb(d.dietary))
                order by d.position nulls last, d.name), '[]'::jsonb)
           from public.restaurant_dishes d
          where d.restaurant_id = target and not d.hidden
            and (d.section_id is not null or d.position is not null or d.prices is not null or d.sold_out_on is not null
                 or d.badges is not null or d.swatch is not null or d.name_local is not null or d.spice is not null
                 or d.pairs_with is not null or d.photo_path is not null)) else '[]'::jsonb end)
    from public.restaurants r where r.id = target
$$;
revoke execute on function public.restaurant_menu_bits(uuid) from public, anon, authenticated;

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
  return public.restaurant_public_data(s.restaurant_id) || coalesce(public.restaurant_owner_bits(s.restaurant_id), '{}'::jsonb)
         || coalesce(public.restaurant_menu_bits(s.restaurant_id), '{}'::jsonb);
end $$;
revoke execute on function public.restaurant_public(text, text) from public;
grant execute on function public.restaurant_public(text, text) to anon, authenticated;

create or replace function public.restaurant_public_by_id(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.restaurant_public_data(target) || coalesce(public.restaurant_owner_bits(target), '{}'::jsonb)
         || coalesce(public.restaurant_menu_bits(target), '{}'::jsonb)
   where auth.uid() is not null
$$;
revoke execute on function public.restaurant_public_by_id(uuid) from public, anon;
grant execute on function public.restaurant_public_by_id(uuid) to authenticated;

-- Dish photos count as photos in use (Admin → Photos never removes them).
create or replace function public.photo_refs()
returns table (path text) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select photo_path from public.places where photo_path is not null
  union select photo_path from public.dishes where photo_path is not null
  union select photo_path from public.home_meals where photo_path is not null
  union select cover_path from public.groups where cover_path is not null
  union select photo_path from public.restaurant_tips where photo_path is not null
  union select logo_path from public.restaurants where logo_path is not null
  union select d.photo_path from public.restaurant_dishes d where d.photo_path is not null
  union select unnest(photo_paths) from public.place_visits where photo_paths <> '{}'
  union select split_part(avatar_url, '/public/crumbs-photos/', 2) from public.profiles
   where avatar_url like '%/public/crumbs-photos/%'
  union select x->>'photo_path' from public.deleted_items d,
         jsonb_array_elements(coalesce(d.snapshot->'places', '[]') || coalesce(d.snapshot->'dishes', '[]')) x
   where x->>'photo_path' is not null
  union select p.value from public.deleted_items d,
         jsonb_array_elements(coalesce(d.snapshot->'place_visits', '[]')) v,
         jsonb_array_elements_text(coalesce(v->'photo_paths', '[]')) p(value);
end $$;
revoke execute on function public.photo_refs() from public, anon, authenticated;

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261204_round99') on conflict (name) do nothing;
