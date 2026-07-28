-- migration-selection-method-and-legislative.sql
-- Paste into Supabase SQL Editor and Run first (before legislator seeds).
-- Adds elected/appointed fields and allows level = 'Legislative'.

alter table public.state_officials
  add column if not exists party text;

alter table public.state_officials
  add column if not exists photo_url text;

alter table public.state_officials
  add column if not exists selection_method text;

alter table public.state_officials
  add column if not exists appointed_by text;

-- Legislative districts are often non-numeric (e.g. NH precinct names).
alter table public.state_officials
  alter column district_number type text using district_number::text;

-- Relax level check to include Legislative.
alter table public.state_officials drop constraint if exists state_officials_level_check;

alter table public.state_officials
  add constraint state_officials_level_check
  check (
    level in (
      'Statewide',
      'Appellate',
      'District',
      'County/Magistrate',
      'County',
      'Legislative'
    )
  );

alter table public.state_officials drop constraint if exists state_officials_selection_method_check;

alter table public.state_officials
  add constraint state_officials_selection_method_check
  check (
    selection_method is null
    or selection_method in ('elected', 'appointed')
  );

create index if not exists state_officials_court_agency_idx
  on public.state_officials (court_or_agency);

create index if not exists state_officials_legislative_lookup_idx
  on public.state_officials (state_code, level, district_number);

-- Backfill executives: default elected, then mark known appointed seats.
update public.state_officials
set selection_method = 'elected',
    appointed_by = null
where court_or_agency = 'Executive Branch'
  and selection_method is null;

update public.state_officials t
set selection_method = 'appointed',
    appointed_by = v.appointed_by
from (
  values
    ('AK', 'Attorney General', 'Governor'),
    ('DE', 'Secretary of State', 'Governor'),
    ('FL', 'Secretary of State', 'Governor'),
    ('GA', 'Treasurer', 'State Depository Board'),
    ('HI', 'Attorney General', 'Governor'),
    ('MD', 'Secretary of State', 'Governor'),
    ('MD', 'Treasurer', 'General Assembly'),
    ('ME', 'Secretary of State', 'Legislature'),
    ('ME', 'Attorney General', 'Legislature'),
    ('ME', 'Treasurer', 'Legislature'),
    ('MI', 'Treasurer', 'Governor'),
    ('MT', 'Treasurer', 'Governor'),
    ('NH', 'Attorney General', 'Governor'),
    ('NH', 'Treasurer', 'Governor'),
    ('NJ', 'Attorney General', 'Governor'),
    ('NJ', 'Secretary of State', 'Governor'),
    ('NJ', 'Treasurer', 'Governor'),
    ('NY', 'Secretary of State', 'Governor'),
    ('OK', 'Secretary of State', 'Governor'),
    ('PA', 'Secretary of State', 'Governor'),
    ('TN', 'Attorney General', 'Supreme Court of Tennessee'),
    ('TN', 'Secretary of State', 'General Assembly'),
    ('TN', 'Treasurer', 'General Assembly'),
    ('TX', 'Secretary of State', 'Governor'),
    ('VA', 'Secretary of State', 'Governor'),
    ('VA', 'Treasurer', 'Governor'),
    ('WY', 'Attorney General', 'Governor')
) as v(state_code, title, appointed_by)
where t.state_code = v.state_code
  and t.court_or_agency = 'Executive Branch'
  and lower(t.title) = lower(v.title);

-- CA Supreme Court (and similar) — appointed by Governor.
update public.state_officials
set selection_method = 'appointed',
    appointed_by = 'Governor'
where level = 'Statewide'
  and court_or_agency ilike '%Supreme Court%'
  and selection_method is null;

-- Typical TX trial / county benches — elected.
update public.state_officials
set selection_method = 'elected',
    appointed_by = null
where state_code = 'TX'
  and level in ('District', 'County/Magistrate', 'County')
  and selection_method is null;

-- Confirm:
-- select selection_method, count(*) from state_officials group by 1 order by 1;
