\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
-- D is shaky (from batch 17 test: many unbacked facts) → starter caps
begin; set local role authenticated; set local request.jwt.claim.sub = :'D';
select 'D caps', public.my_day_caps()->>'fact', public.my_day_caps()->>'shaky';
select 'D capped', public.over_daily_cap('fact');
commit;
-- B: give Legend-level points → unlimited (if trusted)
insert into contribution_points (user_id, kind, points, ref) select :'B', 'test', 20, 'legend' || n from generate_series(1, 40) n;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B tier/caps', public.my_tier(), public.my_day_caps()->'fact', public.my_day_caps()->>'shaky';
select 'B capped', public.over_daily_cap('fact');
select 'B contributions has caps', (public.my_contributions() ? 'caps');
select 'gem counts', public.gem_counts(array(select id from restaurants where source_key='gp9'));
select 'export keys', (select count(*) from jsonb_object_keys(public.export_me()));
select 'export ratings', jsonb_array_length(public.export_me()->'place_ratings') >= 0;
commit;
-- admin edits caps
begin; set local role authenticated; set local request.jwt.claim.sub = :'A';
select public.set_point_rules((select to_jsonb(pr) - 'id' from point_rules pr) || '{"day_caps": {"fact": [5, 10, 20, 30, 40]}}');
commit;
select 'caps after edit', day_caps->'fact', day_caps->'vote' from point_rules;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B fact cap now', public.my_day_caps()->'fact';
commit;
begin; set local role anon;
select 'anon export (expect error)', public.export_me();
commit;
