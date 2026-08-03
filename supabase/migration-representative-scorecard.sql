-- Representative Scorecard tables.
-- Run after migration-politicians.sql (independent of public.politicians;
-- scorecard profiles are federal House/Senate-focused).

create extension if not exists "pgcrypto";

-- 1. Politician Profile
create table if not exists public.representative_profiles (
  id uuid primary key default gen_random_uuid(),
  bioguide_id text unique,
  fec_id text,
  name text not null,
  party text,
  district text,
  state text,
  chamber text check (chamber is null or chamber in ('House', 'Senate')),
  office_address text,
  phone text,
  website text,
  photo_url text,
  next_election_year integer
    check (
      next_election_year is null
      or (next_election_year >= 1789 and next_election_year <= 2100)
    ),
  -- Optional link into the broader politicians roster when available.
  politician_id uuid references public.politicians (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists representative_profiles_state_idx
  on public.representative_profiles (state);
create index if not exists representative_profiles_chamber_idx
  on public.representative_profiles (chamber);
create index if not exists representative_profiles_fec_idx
  on public.representative_profiles (fec_id);
create index if not exists representative_profiles_politician_idx
  on public.representative_profiles (politician_id);

-- 2. Campaign Finance (Donor Alignment) — 1:1 with profile
create table if not exists public.campaign_finance (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null unique
    references public.representative_profiles (id) on delete cascade,
  small_donor_pct numeric(5, 2)
    check (small_donor_pct is null or (small_donor_pct >= 0 and small_donor_pct <= 100)),
  large_donor_pct numeric(5, 2)
    check (large_donor_pct is null or (large_donor_pct >= 0 and large_donor_pct <= 100)),
  pac_pct numeric(5, 2)
    check (pac_pct is null or (pac_pct >= 0 and pac_pct <= 100)),
  self_funding_pct numeric(5, 2)
    check (self_funding_pct is null or (self_funding_pct >= 0 and self_funding_pct <= 100)),
  total_raised numeric(14, 2)
    check (total_raised is null or total_raised >= 0),
  -- Array of { "name": string, "amount": number }
  top_industries jsonb not null default '[]'::jsonb,
  cycle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_finance_top_industries_is_array
    check (jsonb_typeof(top_industries) = 'array')
);

create index if not exists campaign_finance_politician_idx
  on public.campaign_finance (politician_id);

-- 3. Attendance & Voting Activity — 1:1 with profile
create table if not exists public.attendance_voting_activity (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null unique
    references public.representative_profiles (id) on delete cascade,
  total_votes integer not null default 0
    check (total_votes >= 0),
  missed_votes integer not null default 0
    check (missed_votes >= 0),
  sponsored_bills_count integer not null default 0
    check (sponsored_bills_count >= 0),
  bipartisan_cosponsor_pct numeric(5, 2)
    check (
      bipartisan_cosponsor_pct is null
      or (bipartisan_cosponsor_pct >= 0 and bipartisan_cosponsor_pct <= 100)
    ),
  congress integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_missed_lte_total
    check (missed_votes <= total_votes)
);

create index if not exists attendance_voting_activity_politician_idx
  on public.attendance_voting_activity (politician_id);

-- 4. Bill Roll Call Vote ("Truth in Voting")
create table if not exists public.scorecard_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null,
  title text not null,
  plain_english_summary text,
  category text,
  vote_date date,
  wallet_impact text,
  community_impact text,
  rights_impact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scorecard_bills_number_idx
  on public.scorecard_bills (bill_number);
create index if not exists scorecard_bills_vote_date_idx
  on public.scorecard_bills (vote_date desc nulls last);
create index if not exists scorecard_bills_category_idx
  on public.scorecard_bills (category);

-- 5. Representative Vote Record
create table if not exists public.representative_vote_records (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null
    references public.representative_profiles (id) on delete cascade,
  bill_id uuid not null
    references public.scorecard_bills (id) on delete cascade,
  vote_position text not null
    check (vote_position in ('YES', 'NO', 'ABSTAIN', 'NOT_VOTING')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (politician_id, bill_id)
);

create index if not exists representative_vote_records_politician_idx
  on public.representative_vote_records (politician_id);
create index if not exists representative_vote_records_bill_idx
  on public.representative_vote_records (bill_id);
create index if not exists representative_vote_records_position_idx
  on public.representative_vote_records (vote_position);

-- updated_at helpers
create or replace function public.set_scorecard_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists representative_profiles_set_updated_at
  on public.representative_profiles;
create trigger representative_profiles_set_updated_at
  before update on public.representative_profiles
  for each row execute function public.set_scorecard_updated_at();

drop trigger if exists campaign_finance_set_updated_at on public.campaign_finance;
create trigger campaign_finance_set_updated_at
  before update on public.campaign_finance
  for each row execute function public.set_scorecard_updated_at();

drop trigger if exists attendance_voting_activity_set_updated_at
  on public.attendance_voting_activity;
create trigger attendance_voting_activity_set_updated_at
  before update on public.attendance_voting_activity
  for each row execute function public.set_scorecard_updated_at();

drop trigger if exists scorecard_bills_set_updated_at on public.scorecard_bills;
create trigger scorecard_bills_set_updated_at
  before update on public.scorecard_bills
  for each row execute function public.set_scorecard_updated_at();

drop trigger if exists representative_vote_records_set_updated_at
  on public.representative_vote_records;
create trigger representative_vote_records_set_updated_at
  before update on public.representative_vote_records
  for each row execute function public.set_scorecard_updated_at();

-- RLS: public read; writes via service role / future admin paths
alter table public.representative_profiles enable row level security;
alter table public.campaign_finance enable row level security;
alter table public.attendance_voting_activity enable row level security;
alter table public.scorecard_bills enable row level security;
alter table public.representative_vote_records enable row level security;

drop policy if exists "Anyone can read representative profiles"
  on public.representative_profiles;
create policy "Anyone can read representative profiles"
  on public.representative_profiles for select
  using (true);

drop policy if exists "Anyone can read campaign finance"
  on public.campaign_finance;
create policy "Anyone can read campaign finance"
  on public.campaign_finance for select
  using (true);

drop policy if exists "Anyone can read attendance voting activity"
  on public.attendance_voting_activity;
create policy "Anyone can read attendance voting activity"
  on public.attendance_voting_activity for select
  using (true);

drop policy if exists "Anyone can read scorecard bills"
  on public.scorecard_bills;
create policy "Anyone can read scorecard bills"
  on public.scorecard_bills for select
  using (true);

drop policy if exists "Anyone can read representative vote records"
  on public.representative_vote_records;
create policy "Anyone can read representative vote records"
  on public.representative_vote_records for select
  using (true);
