\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
-- 10 visits with meal times and waits at Sora (gp9) across B and D
insert into place_visits (place_id, visited_on, spend, people, created_by, kind, meal_time, wait_minutes)
select (select id from places where google_place_id='gp9' and created_by=:'B'), date '2026-10-02' + (n % 2), 60, 2, :'B', 'dine_in',
       case when n <= 7 then 'dinner' else 'lunch' end, n * 3
  from generate_series(1, 10) n;
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'insights', public.restaurant_insights((select id from restaurants where source_key='gp9')) - 'visits' - 'groups';
-- plan tomorrow with booking
insert into plans (group_id, title, starts_at, place_id, created_by, booked_under, booking_ref, party)
select group_id, 'Dinner', now() + interval '20 hours', id, :'B', 'Maya', 'A1', 4 from places where google_place_id='gp9' and created_by=:'B';
update plans set outcome = 'went' where title = 'Dinner';
select 'outcome', outcome from plans where title='Dinner';
commit;
update plans set outcome = null;
select 'remind', jsonb_array_length(public.plans_to_remind()), public.plans_to_remind()->0->>'booked_under';
begin; set local role authenticated; set local request.jwt.claim.sub = :'B';
select 'B calls plans_to_remind (expect error)';
select public.plans_to_remind();
rollback;
