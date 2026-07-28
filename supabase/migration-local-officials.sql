-- Local / municipal officials (starting with mayors)
-- Run once in Supabase SQL Editor before loading local mayor seed SQL.

create extension if not exists "pgcrypto";

create table if not exists public.local_officials (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text not null,
  level text not null default 'City'
    check (level in ('City', 'County', 'School', 'Local')),
  state_code text not null,
  city_name text,
  county_name text,
  party text,
  photo_url text,
  website_url text,
  selection_method text
    check (selection_method is null or selection_method in ('elected', 'appointed')),
  appointed_by text,
  source_name text,
  source_ref text,
  government_type text,
  took_office_year integer,
  term_ends_year integer,
  coverage_status text not null default 'confirmed'
    check (coverage_status in ('confirmed', 'needs_review', 'missing', 'ambiguous')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists local_officials_state_city_idx
  on public.local_officials (state_code, city_name);

create index if not exists local_officials_state_county_idx
  on public.local_officials (state_code, county_name);

create index if not exists local_officials_title_idx
  on public.local_officials (title);

create unique index if not exists local_officials_city_title_unique_idx
  on public.local_officials (
    state_code,
    coalesce(city_name, ''),
    coalesce(title, '')
  );

alter table public.local_officials enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.local_officials to anon, authenticated;

drop policy if exists "Anyone can read local officials" on public.local_officials;
create policy "Anyone can read local officials"
  on public.local_officials
  for select
  to anon, authenticated
  using (true);

-- Optional:
-- select count(*) from public.local_officials;
