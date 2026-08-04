-- Standardized primary policy category on processed_votes.
-- Safe to re-run.

alter table public.processed_votes
  add column if not exists primary_category text;

comment on column public.processed_votes.primary_category is
  'Exactly one of: Economy & Taxes, Healthcare, Immigration & Border, Housing & Infrastructure, Foreign Policy & Defense, Civil Rights & Justice, Energy & Environment, Education & Labor.';

-- Best-effort backfill from existing titles/summaries (Claude re-sync will refine).
update public.processed_votes
set primary_category = case
  when coalesce(title, '') ~* 'immigra|border|asylum|visa|deport|refugee|customs'
    or coalesce(card_summary, plain_summary, '') ~* 'immigra|border|asylum|visa|deport'
    then 'Immigration & Border'
  when coalesce(title, '') ~* 'health|medicare|medicaid|hospital|pharma|vaccine|aca'
    or coalesce(card_summary, plain_summary, '') ~* 'health|medicare|medicaid|hospital|drug'
    then 'Healthcare'
  when coalesce(title, '') ~* 'hous(e|ing)|rent|mortgage|homeless|infra|transit|highway|bridge'
    or coalesce(card_summary, plain_summary, '') ~* 'hous(e|ing)|rent|infra|transit'
    then 'Housing & Infrastructure'
  when coalesce(title, '') ~* 'war|military|defense|nato|israel|ukraine|troop|foreign|sanction'
    or coalesce(card_summary, plain_summary, '') ~* 'military|defense|foreign|war powers'
    then 'Foreign Policy & Defense'
  when coalesce(title, '') ~* 'civil rights|voting rights|discrim|police|prison|justice|gun|court'
    or coalesce(card_summary, plain_summary, '') ~* 'civil rights|voting|police|prison|gun'
    then 'Civil Rights & Justice'
  when coalesce(title, '') ~* 'climat|environment|energy|epa|emission|oil|gas|renewable'
    or coalesce(card_summary, plain_summary, '') ~* 'climate|environment|energy|emission'
    then 'Energy & Environment'
  when coalesce(title, '') ~* 'school|educat|student|labor|union|wage|worker|osha'
    or coalesce(card_summary, plain_summary, '') ~* 'school|educat|student|labor|wage|worker'
    then 'Education & Labor'
  when coalesce(title, '') ~* 'tax|budget|spend|deficit|debt|tariff|irs|economy|fee|payroll'
    or coalesce(card_summary, plain_summary, '') ~* 'tax|budget|spend|tariff|fee'
    then 'Economy & Taxes'
  else coalesce(nullif(trim(primary_category), ''), 'Economy & Taxes')
end
where coalesce(nullif(trim(primary_category), ''), '') = '';
