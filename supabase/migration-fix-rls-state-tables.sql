-- Fix Supabase security alert: rls_disabled_in_public
--
-- Live check (Aug 2026): anon insert was allowed on
--   - public.state_officials
--   - public.county_district_mapping
-- because Row Level Security was never enabled on the deployed tables
-- (CREATE ran, but the ENABLE RLS / policies section was skipped, or
-- tables were recreated without RLS).
--
-- Desired access:
--   - anon / authenticated: SELECT only (directory data)
--   - service_role: full access for import scripts / API (bypasses RLS)
--
-- Run this entire file in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 1) Enable RLS
-- ---------------------------------------------------------------------------
alter table public.county_district_mapping enable row level security;
alter table public.state_officials enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Tighten privileges: no client-side writes
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke insert, update, delete, truncate
  on table public.county_district_mapping
  from anon, authenticated;
revoke insert, update, delete, truncate
  on table public.state_officials
  from anon, authenticated;

grant select on table public.county_district_mapping to anon, authenticated;
grant select on table public.state_officials to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Public-read policies (idempotent)
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can read county district mapping"
  on public.county_district_mapping;
create policy "Anyone can read county district mapping"
  on public.county_district_mapping
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read state officials"
  on public.state_officials;
create policy "Anyone can read state officials"
  on public.state_officials
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4) Safety net: re-assert RLS on every known public app table
--    (no-op if already enabled; does not change existing policies)
-- ---------------------------------------------------------------------------
alter table if exists public.profiles enable row level security;
alter table if exists public.followed_topics enable row level security;
alter table if exists public.notifications enable row level security;
alter table if exists public.politicians enable row level security;
alter table if exists public.followed_politicians enable row level security;
alter table if exists public.decision_makers enable row level security;
alter table if exists public.bill_items enable row level security;
alter table if exists public.followed_bills enable row level security;
alter table if exists public.civic_actions enable row level security;
alter table if exists public.bill_stances enable row level security;
alter table if exists public.stance_vote_matches enable row level security;
alter table if exists public.processed_votes enable row level security;
alter table if exists public.representative_profiles enable row level security;
alter table if exists public.campaign_finance enable row level security;
alter table if exists public.attendance_voting_activity enable row level security;
alter table if exists public.scorecard_bills enable row level security;
alter table if exists public.representative_vote_records enable row level security;
alter table if exists public.address_lookup_cache enable row level security;
alter table if exists public.national_officials enable row level security;
alter table if exists public.local_officials enable row level security;
alter table if exists public.state_judges enable row level security;

-- ---------------------------------------------------------------------------
-- 5) Verify (run after applying; both should show rowsecurity = true)
-- ---------------------------------------------------------------------------
-- select c.relname as table_name, c.relrowsecurity as rls_enabled
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
--   and c.relname in ('state_officials', 'county_district_mapping')
-- order by 1;
