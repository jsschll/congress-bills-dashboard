-- seed-judges.sql
-- Paste into Supabase → SQL Editor → Run
-- Matches integer[] district columns on county_district_mapping.

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
    array[1, 14]::integer[],
    array[240, 268, 328, 387, 434, 458]::integer[]
  ),
  (
    'TX',
    'Harris',
    array[1, 14]::integer[],
    array[11, 55, 61, 80, 113, 125]::integer[]
  )
on conflict (state_code, county_name) do update
set
  appellate_district_numbers = excluded.appellate_district_numbers,
  judicial_district_numbers = excluded.judicial_district_numbers;

-- Confirm:
-- select * from public.county_district_mapping where state_code = 'TX';
-- select level, count(*) from public.state_officials where state_code = 'TX' group by level;
