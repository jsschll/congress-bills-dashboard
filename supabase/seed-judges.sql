-- seed-judges.sql
-- Paste into Supabase → SQL Editor → Run
-- Idempotent for Fort Bend / Harris mapping + sample TX officials.

-- 1) County → district mapping
insert into public.county_district_mapping (
  state_code,
  county_name,
  appellate_district_numbers,
  judicial_district_numbers
)
values
  (
    'TX',
    'Fort Bend',
    array['1', '14'],
    array['240', '268', '328', '387', '434', '458']
  ),
  (
    'TX',
    'Harris',
    array['1', '14'],
    array['11', '55', '61', '80', '113', '125']
  )
on conflict (state_code, county_name) do update
set
  appellate_district_numbers = excluded.appellate_district_numbers,
  judicial_district_numbers = excluded.judicial_district_numbers;

-- 2) Confirm what you already have (optional)
-- select * from public.county_district_mapping where state_code = 'TX';
-- select level, count(*) from public.state_officials where state_code = 'TX' group by level;

-- Note: Your Fort Bend state_officials rows are already populated (Statewide /
-- Appellate / District / County/Magistrate). Only re-insert officials if a
-- level is empty. Example for one missing district judge:

-- insert into public.state_officials
--   (full_name, title, level, state_code, district_number, county_name)
-- values
--   ('Steve Rogers', 'District Judge', 'District', 'TX', '268', 'Fort Bend')
-- on conflict do nothing;
