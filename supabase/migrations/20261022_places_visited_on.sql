-- Adds an optional "visited on" date to places. Safe to run more than once.
alter table public.places add column if not exists visited_on date;
