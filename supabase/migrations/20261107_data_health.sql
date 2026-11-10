-- Round 60: how complete is the information on saved restaurants, and where did it come from?
-- One row per fact. Admins only. Safe to run twice.
create or replace function public.admin_data_health()
returns table (fact text, total integer, filled integer,
               owner integer, crumbs integer, site integer, osm integer, google integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_crumbs_admin() then raise exception 'Admins only'; end if;
  return query
    with saved as (
      select r.* from public.restaurants r
       where exists (select 1 from public.places p where p.restaurant_id = r.id)
    ), facts as (
      select f.key as fact, s.sources ->> f.key as src
        from saved s, lateral jsonb_each_text(public.fact_values(s)) f
       where f.key in ('hours', 'phone', 'website', 'cuisine', 'price_level', 'address')
         and coalesce(f.value, '') <> ''
    )
    select k.fact,
           (select count(*)::integer from saved),
           count(x.fact)::integer,
           (count(*) filter (where x.src = 'owner'))::integer,
           (count(*) filter (where x.src = 'crumbs'))::integer,
           (count(*) filter (where x.src = 'site'))::integer,
           (count(*) filter (where x.src = 'osm'))::integer,
           (count(*) filter (where x.src = 'google'))::integer
      from (values ('hours'), ('phone'), ('website'), ('cuisine'), ('price_level'), ('address')) k(fact)
      left join facts x on x.fact = k.fact
     group by k.fact
     order by 3;
end $$;
revoke execute on function public.admin_data_health() from public, anon;
