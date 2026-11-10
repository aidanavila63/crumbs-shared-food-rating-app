-- Round 57: the read caches belong to the server alone.
-- Expected refusals: 0 (nothing here raises; the checks print true/false).
select 'site cache closed', not has_table_privilege('authenticated', 'public.site_read_cache', 'select')
  and not has_table_privilege('authenticated', 'public.site_read_cache', 'insert')
  and not has_table_privilege('anon', 'public.site_read_cache', 'select');
select 'menu cache closed', not has_table_privilege('authenticated', 'public.menu_read_cache', 'select')
  and not has_table_privilege('authenticated', 'public.menu_read_cache', 'insert')
  and not has_table_privilege('anon', 'public.menu_read_cache', 'select');
select 'row security on', (select count(*) from pg_class where relname in ('site_read_cache', 'menu_read_cache') and relrowsecurity) = 2;
