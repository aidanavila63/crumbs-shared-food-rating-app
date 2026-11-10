-- Round 57: a shared memory for website reads, so a restaurant's site is fetched once for
-- everyone (not once per server), and a menu is only sent to the AI again when it changed.
-- Safe to run twice. Run after 20261105_reservations_held.sql.
--
-- Both tables are written and read only by the server (the service-role key). They have row
-- security on and no policies, and no access for signed-in people or the public: what a site
-- said is merged onto profiles through the checked merge functions, never from here.

create table if not exists public.site_read_cache (
  site_key text primary key check (char_length(site_key) <= 300),
  info jsonb,
  read_at timestamptz not null default now()
);
alter table public.site_read_cache enable row level security;
revoke all on public.site_read_cache from public, anon, authenticated;

create table if not exists public.menu_read_cache (
  site_key text primary key check (char_length(site_key) <= 300),
  fingerprint text not null check (char_length(fingerprint) <= 64),
  dishes jsonb not null default '[]'::jsonb,
  read_at timestamptz not null default now()
);
alter table public.menu_read_cache enable row level security;
revoke all on public.menu_read_cache from public, anon, authenticated;
