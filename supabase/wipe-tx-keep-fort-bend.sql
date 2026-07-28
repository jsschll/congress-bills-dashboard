-- wipe-tx-keep-fort-bend.sql
-- Paste into Supabase SQL Editor and Run.
--
-- Keeps ONLY Fort Bend:
--   • county_district_mapping for Fort Bend
--   • District + County/Magistrate officials for Fort Bend
--   • Statewide officers/high courts (still needed for Fort Bend)
--   • Appellate districts 1 and 14 (Fort Bend's courts of appeals)
--
-- Deletes:
--   • mapping for every other TX county
--   • District / County officials outside Fort Bend
--   • Appellate officials for districts other than 1 and 14

-- ===== Preview (optional — run these first) =====
-- select count(*) as mapping_rows_to_delete
-- from public.county_district_mapping
-- where state_code = 'TX'
--   and county_name not ilike '%Fort Bend%';
--
-- select level, count(*) as official_rows_to_delete
-- from public.state_officials
-- where state_code = 'TX'
--   and (
--     (level in ('District', 'County/Magistrate', 'County')
--       and (county_name is null or county_name not ilike '%Fort Bend%'))
--     or (level = 'Appellate'
--       and coalesce(district_number, -1) not in (1, 14))
--   )
-- group by level
-- order by 1;

-- ===== 1) Other counties' mapping =====
delete from public.county_district_mapping
where state_code = 'TX'
  and county_name not ilike '%Fort Bend%';

-- ===== 2) District / county courts outside Fort Bend =====
delete from public.state_officials
where state_code = 'TX'
  and level in ('District', 'County/Magistrate', 'County')
  and (county_name is null or county_name not ilike '%Fort Bend%');

-- ===== 3) Appellate courts that are not Fort Bend's (1st / 14th) =====
delete from public.state_officials
where state_code = 'TX'
  and level = 'Appellate'
  and coalesce(district_number, -1) not in (1, 14);

-- ===== Confirm what's left =====
-- select count(*) as tx_mapping_left
-- from public.county_district_mapping where state_code = 'TX';
--
-- select level, count(*)
-- from public.state_officials where state_code = 'TX'
-- group by level order by 1;
--
-- select county_name, count(*)
-- from public.state_officials
-- where state_code = 'TX'
--   and level in ('District', 'County/Magistrate', 'County')
-- group by county_name;
