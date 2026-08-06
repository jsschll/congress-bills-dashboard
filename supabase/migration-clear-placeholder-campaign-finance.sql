-- Clear identical party-template campaign_finance placeholders
-- so OpenFEC sync can refill per-candidate totals.
-- Safe to re-run.
--
-- WHEN: After deploying the FEC finance sync (lib/services/fecFinance.js).
-- WHERE: Supabase Dashboard → SQL Editor → Run.
--
-- These signatures match scorecardAutoSeed.placeholderFinance():

delete from public.campaign_finance
where
  (
    round(total_raised::numeric, 0) = 3120000
    and round(small_donor_pct::numeric, 0) = 18
    and round(pac_pct::numeric, 0) = 44
  )
  or (
    round(total_raised::numeric, 0) = 2450000
    and round(small_donor_pct::numeric, 0) = 28
    and round(pac_pct::numeric, 0) = 31
  )
  or (
    round(total_raised::numeric, 0) = 980000
    and round(small_donor_pct::numeric, 0) = 35
    and round(pac_pct::numeric, 0) = 25
  );

-- Optional verify after visiting a few scorecards:
-- select p.name, f.total_raised, f.small_donor_pct, f.pac_pct, f.cycle, f.top_industries
-- from public.campaign_finance f
-- join public.representative_profiles p on p.id = f.politician_id
-- order by f.updated_at desc
-- limit 20;
