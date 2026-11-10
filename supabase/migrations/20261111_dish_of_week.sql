-- Part three: Dish of the week. Safe to run twice. Run after 20261110_maybe_closed.sql.
--
-- Picked automatically, once per week (weeks start Monday), from dishes on public restaurant pages:
--   * rated by at least 3 different groups (same rule as the "Top dishes" strip — never fewer),
--   * dishes with a rating in the last 2 weeks go first, then the best average score,
--     then the most ratings ("lots of picks"),
--   * a dish that won in the last 4 weeks sits out.
-- Only totals are shown (average score, how many groups), never who rated it.
-- If nothing qualifies yet, there is no dish of the week; it's picked as soon as one does.

create table if not exists public.dish_of_week (
  week date primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  dish_key text,
  name text,
  points int,
  groups int,
  picked_at timestamptz not null default now()
);
alter table public.dish_of_week enable row level security; -- read only through the function below

create or replace function public.dish_of_the_week()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare wk date := date_trunc('week', now())::date; w public.dish_of_week%rowtype;
begin
  select * into w from public.dish_of_week where week = wk;
  if not found then
    insert into public.dish_of_week (week, restaurant_id, dish_key, name, points, groups)
    select wk, c.restaurant_id, c.k, c.name, c.points, c.groups
      from (select p.restaurant_id, public.dish_key(d.name) as k, min(d.name) as name,
                   round(avg(coalesce(dr.points, dr.score * 20)))::int as points,
                   count(distinct p.group_id)::int as groups, count(*) as picks,
                   max(dr.updated_at) > now() - interval '14 days' as recent
              from public.dishes d
              join public.places p on p.id = d.place_id
              join public.dish_ratings dr on dr.dish_id = d.id
             where p.restaurant_id is not null
               and exists (select 1 from public.restaurant_slugs s where s.restaurant_id = p.restaurant_id and s.is_current)
             group by p.restaurant_id, public.dish_key(d.name)
            having count(distinct p.group_id) >= 3) c
     where not exists (select 1 from public.dish_of_week o
                        where o.week >= wk - 28 and o.week < wk
                          and o.restaurant_id = c.restaurant_id and o.dish_key = c.k)
     order by c.recent desc, c.points desc, c.picks desc, c.name
     limit 1
    on conflict (week) do nothing;
    select * into w from public.dish_of_week where week = wk;
    if not found then return null; end if; -- nothing qualifies yet; try again on the next view
  end if;
  if w.restaurant_id is null then return null; end if;
  return (select jsonb_build_object('name', w.name, 'points', w.points, 'groups', w.groups,
                                    'restaurant_id', w.restaurant_id, 'restaurant', r.name,
                                    'city', s.city, 'slug', s.slug, 'week', w.week)
            from public.restaurants r
            join public.restaurant_slugs s on s.restaurant_id = r.id and s.is_current
           where r.id = w.restaurant_id);
end $$;
revoke execute on function public.dish_of_the_week() from public;
grant execute on function public.dish_of_the_week() to anon, authenticated;
