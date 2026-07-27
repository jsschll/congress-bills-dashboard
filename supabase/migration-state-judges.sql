-- State judges directory for address-based court filtering.
-- court_level:
--   statewide  -> Supreme Court / Court of Criminal Appeals (whole state)
--   appellate  -> Court of Appeals (appellate_district and/or counties_served)
--   district   -> District Court tied to county / district_number
--   county     -> County court judges tied to county
--
-- Run in Supabase SQL editor. Populate rows for each state you cover.

create table if not exists public.state_judges (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  court_name text,
  court_level text not null check (
    court_level in ('statewide', 'appellate', 'district', 'county')
  ),
  state text not null,
  county text,
  district_number text,
  appellate_district text,
  counties_served text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists state_judges_state_idx
  on public.state_judges (state);

create index if not exists state_judges_court_level_idx
  on public.state_judges (court_level);

create index if not exists state_judges_county_idx
  on public.state_judges (county);

create index if not exists state_judges_appellate_district_idx
  on public.state_judges (appellate_district);

create index if not exists state_judges_district_number_idx
  on public.state_judges (district_number);

create index if not exists state_judges_counties_served_gin
  on public.state_judges using gin (counties_served);

alter table public.state_judges enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.state_judges to anon, authenticated;

drop policy if exists "Anyone can read state judges" on public.state_judges;
create policy "Anyone can read state judges"
  on public.state_judges
  for select
  to anon, authenticated
  using (true);
