-- Round 95 (Nov 18): a big batch from the approved list.
--   U13 merge duplicate places · U10 currency on trips · O6 hand over / share a restaurant page ·
--   O11 heads-up to a restaurant from a plan · O5 paste a price list · O15 table menu looks + logo
-- Safe to run more than once. The app works before this runs (the new buttons say they aren't
-- switched on yet).

-- ============================================================================================
-- 1. U13: merge two copies of the same place in a group. Everything moves to the one you keep
--    (visits, ratings, dishes, notes, lists, plans, facts); the keeper's own details win, empty
--    ones are filled from the other; then the other goes to Recently deleted.
-- ============================================================================================
create or replace function public.merge_places(keep uuid, other uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k public.places;
  o public.places;
  moved jsonb;
begin
  select * into k from public.places where id = keep;
  select * into o from public.places where id = other;
  if k.id is null or o.id is null or k.id = o.id then raise exception 'Pick two different places'; end if;
  if k.group_id <> o.group_id then raise exception 'Both places have to be in the same group'; end if;
  if not public.plan_writer(k.group_id) then raise exception 'Only people in this group can merge its places'; end if;
  if not public.may_delete_place(o.group_id, o.created_by) then
    raise exception 'In this group only whoever added “%” (or an owner or admin) can merge it away', o.name;
  end if;

  update public.place_visits set place_id = keep where place_id = other;
  -- one rating each: keep yours on the keeper; move it across only if you had none there
  update public.place_ratings r set place_id = keep
   where r.place_id = other and not exists (select 1 from public.place_ratings x where x.place_id = keep and x.user_id = r.user_id);
  update public.place_private_notes n set place_id = keep
   where n.place_id = other and not exists (select 1 from public.place_private_notes x where x.place_id = keep and x.user_id = n.user_id);
  update public.dishes set place_id = keep where place_id = other;
  insert into public.list_places (list_id, place_id)
  select lp.list_id, keep from public.list_places lp where lp.place_id = other
  on conflict do nothing;
  update public.plans set place_id = keep where place_id = other;
  update public.activity set place_id = keep where place_id = other;
  update public.place_facts f set place_id = keep
   where f.place_id = other and not exists (select 1 from public.place_facts x where x.place_id = keep);

  -- the other copy goes first (to Recently deleted), so the keeper can take its map link and
  -- restaurant without tripping the "already on your list" rule; its photo moves to the keeper
  if k.photo_path is null and o.photo_path is not null then
    update public.places set photo_path = null where id = other;
  end if;
  delete from public.places where id = other;
  update public.places set
    google_place_id = case when k.google_place_id like 'manual:%' and o.google_place_id not like 'manual:%'
                           then o.google_place_id else k.google_place_id end,
    formatted_address = coalesce(k.formatted_address, o.formatted_address),
    latitude = coalesce(k.latitude, o.latitude),
    longitude = coalesce(k.longitude, o.longitude),
    price_level = coalesce(k.price_level, o.price_level),
    cuisine = coalesce(k.cuisine, o.cuisine),
    website = coalesce(k.website, o.website),
    google_maps_url = coalesce(k.google_maps_url, o.google_maps_url),
    photo_path = coalesce(k.photo_path, o.photo_path),
    opening_hours = coalesce(k.opening_hours, o.opening_hours),
    restaurant_id = coalesce(k.restaurant_id, o.restaurant_id),
    heard_from = coalesce(k.heard_from, o.heard_from),
    tags = (select coalesce(array_agg(distinct t), '{}') from unnest(coalesce(k.tags, '{}') || coalesce(o.tags, '{}')) t),
    pinned = k.pinned or o.pinned,
    status = case when k.status = 'Been' or o.status = 'Been' then 'Been' else k.status end,
    visited_on = greatest(k.visited_on, o.visited_on)
   where id = keep;
  select jsonb_build_object('kept', keep, 'name', k.name) into moved;
  return moved;
end $$;
revoke execute on function public.merge_places(uuid, uuid) from public, anon;
grant execute on function public.merge_places(uuid, uuid) to authenticated;

-- ============================================================================================
-- 2. U10: a trip's currency (amounts logged on a trip are in it; no conversion)
-- ============================================================================================
alter table public.lists add column if not exists currency text;
alter table public.lists drop constraint if exists lists_currency_ok;
alter table public.lists add constraint lists_currency_ok check (currency is null or currency ~ '^[A-Z]{3}$');

-- ============================================================================================
-- 3. O6: hand over or share a restaurant page. A manager invites someone by their Crumbs handle;
--    they accept in Crumbs; any manager can leave (the last one leaving makes the page unclaimed)
--    or take another manager off. (Approval of new owners by Aidan still applies to claims.)
-- ============================================================================================
create table if not exists public.restaurant_manager_invites (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
alter table public.restaurant_manager_invites enable row level security;
-- (no policies: read and answered through the functions below)

create or replace function public.owner_invite_manager(target uuid, who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  person record;
  h text := lower(regexp_replace(btrim(coalesce(who, '')), '^@', ''));
begin
  if not public.manages_restaurant(target) then raise exception 'Only this restaurant''s owner can do this'; end if;
  select id, display_name into person from public.profiles where lower(handle) = h;
  if person.id is null then raise exception 'No one on Crumbs has the handle @%', h; end if;
  if exists (select 1 from public.restaurant_managers where restaurant_id = target and user_id = person.id) then
    raise exception '% already helps run this page', split_part(coalesce(person.display_name, 'They'), ' ', 1);
  end if;
  if (select count(*) from public.restaurant_manager_invites where restaurant_id = target) >= 5 then
    raise exception 'Up to 5 open invites';
  end if;
  insert into public.restaurant_manager_invites (restaurant_id, user_id, invited_by)
  values (target, person.id, auth.uid()) on conflict (restaurant_id, user_id) do nothing;
  return jsonb_build_object('name', split_part(coalesce(person.display_name, 'They'), ' ', 1));
end $$;

create or replace function public.my_manager_invites()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('restaurant_id', i.restaurant_id, 'name', r.name,
           'by', split_part(coalesce(p.display_name, 'Someone'), ' ', 1)) order by i.created_at), '[]')
    from public.restaurant_manager_invites i
    join public.restaurants r on r.id = i.restaurant_id
    left join public.profiles p on p.id = i.invited_by
   where i.user_id = auth.uid()
$$;

create or replace function public.answer_manager_invite(target uuid, yes boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.restaurant_manager_invites where restaurant_id = target and user_id = auth.uid()) then
    raise exception 'That invite isn''t there any more';
  end if;
  delete from public.restaurant_manager_invites where restaurant_id = target and user_id = auth.uid();
  if yes then
    insert into public.restaurant_managers (restaurant_id, user_id) values (target, auth.uid()) on conflict do nothing;
  end if;
  return yes;
end $$;

-- The people who run this page (first names), and the open invites.
create or replace function public.owner_team(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then raise exception 'Owners only'; end if;
  return jsonb_build_object(
    'managers', (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'me', m.user_id = auth.uid(),
                   'name', coalesce(p.display_name, 'Someone'), 'handle', p.handle) order by m.since), '[]')
                   from public.restaurant_managers m left join public.profiles p on p.id = m.user_id
                  where m.restaurant_id = target),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.user_id, 'name', coalesce(p.display_name, 'Someone'),
                   'handle', p.handle) order by i.created_at), '[]')
                  from public.restaurant_manager_invites i left join public.profiles p on p.id = i.user_id
                 where i.restaurant_id = target));
end $$;

-- Take someone off (or yourself: "leave this page"). The last one leaving makes it unclaimed.
create or replace function public.owner_remove_manager(target uuid, person uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare left_over integer;
begin
  if not public.manages_restaurant(target) then raise exception 'Only this restaurant''s owner can do this'; end if;
  delete from public.restaurant_manager_invites where restaurant_id = target and user_id = person;
  delete from public.restaurant_managers where restaurant_id = target and user_id = person;
  select count(*) into left_over from public.restaurant_managers where restaurant_id = target;
  if left_over = 0 then
    -- nobody runs it now: the owner's notice and tags come off; the details stay as they are
    update public.restaurants set owner_notice = null, owner_tags = null where id = target;
  end if;
  return left_over;
end $$;

revoke execute on function public.owner_invite_manager(uuid, text), public.my_manager_invites(),
  public.answer_manager_invite(uuid, boolean), public.owner_team(uuid), public.owner_remove_manager(uuid, uuid) from public, anon;
grant execute on function public.owner_invite_manager(uuid, text), public.my_manager_invites(),
  public.answer_manager_invite(uuid, boolean), public.owner_team(uuid), public.owner_remove_manager(uuid, uuid) to authenticated;

-- ============================================================================================
-- 4. O11: "let the restaurant know we're coming" on a plan (opt-in). The owner sees only the day,
--    time and how many — never who, never which group.
-- ============================================================================================
create table if not exists public.plan_headsups (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  made_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.plan_headsups enable row level security;
drop policy if exists plan_headsups_read on public.plan_headsups;
create policy plan_headsups_read on public.plan_headsups for select to authenticated
  using (public.is_group_member(public.plan_group(plan_id)));

create or replace function public.plan_headsup(target_plan uuid, send boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.plans;
  rid uuid;
begin
  select * into p from public.plans where id = target_plan;
  if p.id is null or not public.plan_writer(p.group_id) then raise exception 'Plan not found'; end if;
  if not send then
    delete from public.plan_headsups where plan_id = target_plan;
    return false;
  end if;
  select restaurant_id into rid from public.places where id = p.place_id;
  if rid is null or not exists (select 1 from public.restaurants where id = rid and owner_verified) then
    raise exception 'This restaurant isn''t run on Crumbs by its owner yet';
  end if;
  if p.starts_at is null or p.starts_at < now() then raise exception 'Pick the day and time first'; end if;
  insert into public.plan_headsups (plan_id, made_by) values (target_plan, auth.uid()) on conflict (plan_id) do nothing;
  return true;
end $$;

-- What's coming up, for the owner: day, time, how many (the plan's party size, or how many said
-- they're in; at least 1). Live from the plan, so a changed time or place shows straight away.
create or replace function public.owner_headsups(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.manages_restaurant(target) or public.is_crumbs_admin()) then raise exception 'Owners only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('starts_at', x.starts_at, 'party', x.party) order by x.starts_at), '[]')
            from (select p.starts_at,
                         greatest(1, coalesce(p.party, (select count(*) from public.plan_rsvps r
                                                         where r.plan_id = p.id and r.answer = 'yes'))) as party
                    from public.plan_headsups h
                    join public.plans p on p.id = h.plan_id
                    join public.places pl on pl.id = p.place_id
                   where pl.restaurant_id = target and p.starts_at > now() - interval '2 hours'
                   order by p.starts_at limit 30) x);
end $$;
revoke execute on function public.plan_headsup(uuid, boolean), public.owner_headsups(uuid) from public, anon;
grant execute on function public.plan_headsup(uuid, boolean), public.owner_headsups(uuid) to authenticated;

-- ============================================================================================
-- 5. O5: paste a price list — prices change on dishes already on the menu, new ones are added.
-- ============================================================================================
create or replace function public.owner_paste_prices(target uuid, items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  k text;
  nm text;
  pr numeric;
  changed integer := 0;
  added integer := 0;
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can do this'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 150 then raise exception 'Up to 150 lines at a time'; end if;
  for it in select * from jsonb_array_elements(items) loop
    nm := btrim(coalesce(it ->> 'name', ''));
    k := public.dish_key(nm);
    pr := case when (it ->> 'price') ~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' then (it ->> 'price')::numeric end;
    continue when k is null or length(k) < 2 or char_length(nm) > 120;
    update public.restaurant_dishes
       set price = coalesce(pr, price), price_set_at = case when pr is distinct from price then now() else price_set_at end,
           price_checked_at = now(), owner_ok = true, claimed = true, hidden = false
     where restaurant_id = target and name_key = k;
    if found then
      changed := changed + 1;
    else
      insert into public.restaurant_dishes (restaurant_id, name, name_key, price, source, added_by, owner_ok, claimed)
      values (target, nm, k, pr, 'manual', auth.uid(), true, true)
      on conflict (restaurant_id, name_key) do nothing;
      added := added + 1;
    end if;
  end loop;
  update public.restaurant_managers set last_active_at = now() where restaurant_id = target and user_id = auth.uid();
  perform public.refresh_menu_price(target);
  perform public.menu_settle(target);
  return jsonb_build_object('changed', changed, 'added', added);
end $$;
revoke execute on function public.owner_paste_prices(uuid, jsonb) from public, anon;
grant execute on function public.owner_paste_prices(uuid, jsonb) to authenticated;

-- ============================================================================================
-- 6. O15: the table menu's look (a theme) and the restaurant's logo
-- ============================================================================================
alter table public.restaurants add column if not exists menu_theme text;
alter table public.restaurants add column if not exists logo_path text;
alter table public.restaurants drop constraint if exists restaurants_menu_theme_ok;
alter table public.restaurants add constraint restaurants_menu_theme_ok
  check (menu_theme is null or menu_theme ~ '^[a-z0-9-]{2,30}$');
alter table public.restaurants drop constraint if exists restaurants_logo_path_ok;
alter table public.restaurants add constraint restaurants_logo_path_ok
  check (logo_path is null or (char_length(logo_path) <= 200 and logo_path !~ '\.\.'));

create or replace function public.owner_set_menu_look(target uuid, theme text, logo text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_restaurant(target) then raise exception 'Only the restaurant can do this'; end if;
  if logo is not null and not (logo like target::text || '/%' or logo like 'r2:' || target::text || '/%') then
    raise exception 'That logo isn''t one of this restaurant''s photos';
  end if;
  update public.restaurants set menu_theme = nullif(theme, ''), logo_path = logo, updated_at = now() where id = target;
  return true;
end $$;
revoke execute on function public.owner_set_menu_look(uuid, text, text) from public, anon;
grant execute on function public.owner_set_menu_look(uuid, text, text) to authenticated;

-- The page gets the look too (owner-verified pages only).
create or replace function public.restaurant_owner_bits(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner_tags', case when r.owner_verified then coalesce(to_jsonb(r.owner_tags), '[]'::jsonb) else '[]'::jsonb end,
    'owner_notice', case when r.owner_verified and r.owner_notice is not null
                          and (r.owner_notice ->> 'until' is null
                               or (r.owner_notice ->> 'until')::date >= (now() at time zone 'America/Toronto')::date)
                         then r.owner_notice end,
    'menu_theme', case when r.owner_verified then r.menu_theme end,
    'logo_path', case when r.owner_verified then r.logo_path end)
    from public.restaurants r where r.id = target
$$;
revoke execute on function public.restaurant_owner_bits(uuid) from public, anon, authenticated;

-- Logos count as photos in use (Admin → Photos never removes them).
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

-- ============================================================================================
-- 7. U11: a better shared list page — each place's map link, website and Crumbs page, in the
--    list's own order — and "Save to my Crumbs" (copies the list and its places into one of your
--    spaces; places you already have are reused).
-- ============================================================================================
create or replace function public.get_shared_list(share_token text)
returns jsonb language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'name', l.name,
    'emoji', l.emoji,
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name,
        'address', p.formatted_address,
        'cuisine', p.cuisine,
        'price_level', p.price_level,
        'status', p.status,
        'lat', p.latitude,
        'lng', p.longitude,
        'website', case when p.website ~* '^https?://' then p.website end,
        'maps_url', case when p.google_maps_url ~* '^https?://' then p.google_maps_url end,
        'city', sl.city,
        'slug', sl.slug,
        'avg', (select round(avg(r.score)::numeric, 1) from public.place_ratings r
                 where r.place_id = p.id and not coalesce(r.draft, false))
      ) order by lp.position nulls last, p.name)
      from public.list_places lp join public.places p on p.id = lp.place_id
      left join public.restaurant_slugs sl on sl.restaurant_id = p.restaurant_id and sl.is_current
      where lp.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.list_shares s join public.lists l on l.id = s.list_id
  where s.token = share_token
$$;
grant execute on function public.get_shared_list(text) to anon, authenticated;

create or replace function public.copy_shared_list(share_token text, target_group uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  src public.lists;
  new_list uuid;
  p public.places;
  have uuid;
  added integer := 0;
  reused integer := 0;
  pos integer := 0;
begin
  if not public.plan_writer(target_group) then raise exception 'Pick one of your own spaces'; end if;
  select l.* into src from public.list_shares s join public.lists l on l.id = s.list_id where s.token = share_token;
  if src.id is null then raise exception 'That link isn''t active any more'; end if;
  insert into public.lists (group_id, name, emoji, created_by)
  values (target_group, left(src.name, 60), src.emoji, auth.uid()) returning id into new_list;
  for p in select pl.* from public.list_places lp join public.places pl on pl.id = lp.place_id
            where lp.list_id = src.id order by lp.position nulls last, pl.name limit 100 loop
    pos := pos + 1;
    select id into have from public.places
     where group_id = target_group
       and (google_place_id = p.google_place_id or (p.restaurant_id is not null and restaurant_id = p.restaurant_id))
     limit 1;
    if have is null then
      insert into public.places (group_id, google_place_id, name, formatted_address, latitude, longitude, price_level,
                                 cuisine, website, google_maps_url, status, created_by, restaurant_id, opening_hours)
      values (target_group, p.google_place_id, p.name, p.formatted_address, p.latitude, p.longitude, p.price_level,
              p.cuisine, p.website, p.google_maps_url, 'Want to try', auth.uid(), p.restaurant_id, p.opening_hours)
      returning id into have;
      added := added + 1;
    else
      reused := reused + 1;
    end if;
    insert into public.list_places (list_id, place_id, position) values (new_list, have, pos) on conflict do nothing;
  end loop;
  return jsonb_build_object('list_id', new_list, 'added', added, 'reused', reused, 'name', src.name);
end $$;
revoke execute on function public.copy_shared_list(text, uuid) from public, anon;
grant execute on function public.copy_shared_list(text, uuid) to authenticated;

select public.crumbs_local_days();
insert into public.crumbs_migrations (name) values ('20261201_round95') on conflict (name) do nothing;
