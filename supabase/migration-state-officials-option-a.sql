-- Option A: address-based state / appellate / county officials
-- Tables: public.state_officials + public.county_district_mapping
--
-- Lookup flow:
-- 1) Geocode address -> state_code + county_name
-- 2) county_district_mapping(state_code, county_name)
--      -> appellate_district_numbers[], judicial_district_numbers[]
-- 3) state_officials where:
--      level = 'Statewide'
--      OR (level = 'Appellate' AND district_number IN appellate array)
--      OR (level = 'District' AND district_number IN judicial array)
--      OR (level = 'County/Magistrate' AND county_name matches)
--
-- Run in Supabase SQL editor if these tables are not created yet.
-- If tables already exist with data, skip CREATE and still run ENABLE RLS /
-- grants/policies below (or run migration-fix-rls-state-tables.sql).
-- Skipping RLS left these tables publicly writable (Supabase rls_disabled_in_public).

create table if not exists public.county_district_mapping (
  id uuid primary key default gen_random_uuid(),
  state_code text not null,
  county_name text not null,
  appellate_district_numbers integer[] not null default '{}'::integer[],
  judicial_district_numbers integer[] not null default '{}'::integer[],
  unique (state_code, county_name)
);

create table if not exists public.state_officials (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  level text not null check (
    level in ('Statewide', 'Appellate', 'District', 'County/Magistrate', 'County')
  ),
  state_code text not null,
  district_number text,
  county_name text
);

create index if not exists county_district_mapping_state_county_idx
  on public.county_district_mapping (state_code, county_name);

create index if not exists state_officials_state_level_idx
  on public.state_officials (state_code, level);

create index if not exists state_officials_district_number_idx
  on public.state_officials (district_number);

create index if not exists state_officials_county_name_idx
  on public.state_officials (county_name);

alter table public.county_district_mapping enable row level security;
alter table public.state_officials enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.county_district_mapping to anon, authenticated;
grant select on table public.state_officials to anon, authenticated;

drop policy if exists "Anyone can read county district mapping"
  on public.county_district_mapping;
create policy "Anyone can read county district mapping"
  on public.county_district_mapping
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read state officials" on public.state_officials;
create policy "Anyone can read state officials"
  on public.state_officials
  for select
  to anon, authenticated
  using (true);
