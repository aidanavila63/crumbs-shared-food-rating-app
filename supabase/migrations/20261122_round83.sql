-- Round 83 (Nov 22): the design pass. Only one database change: a group's emoji can be any single
-- emoji from the phone's keyboard (Aidan, Nov 17), including longer ones like flags, skin tones and
-- family emoji, which take more than 8 characters. Safe to run more than once.
alter table public.groups drop constraint if exists groups_emoji_check;
alter table public.groups add constraint groups_emoji_check
  check (emoji is null or char_length(emoji) <= 32);

insert into public.crumbs_migrations (name) values ('20261122_round83')
on conflict (name) do nothing;

-- (Crumbs' own badges are stored as "crumbs:<name>", which fits the same limit.)
select public.crumbs_local_days();
