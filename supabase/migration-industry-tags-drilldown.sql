-- Interactive Industry Drill-Down (Follow the Money → Votes)
-- ============================================================
-- WHEN TO RUN
--   Run this once in the Supabase Dashboard → SQL Editor → New query,
--   then click Run. Safe to re-run (IF NOT EXISTS / OR REPLACE).
--
-- WHY
--   Lets Top Industry contributor clicks filter roll-call votes by
--   industry_tags (array overlap). The live site already filters
--   client-side via category/keywords; this migration enables exact
--   tag matching and an optional RPC for server-side queries.
--
-- AFTER RUNNING
--   No deploy required for the frontend (already ships). Optional:
--   re-sync Claude vote summaries so industry_tags fill in over time.

-- 1) Tag columns ----------------------------------------------------------

alter table public.scorecard_bills
  add column if not exists industry_tags text[] not null default '{}'::text[];

comment on column public.scorecard_bills.industry_tags is
  'OpenSecrets-style industry labels linked to this roll call (e.g. Oil & Gas, Real Estate). Used by Follow the Money drill-down.';

alter table public.processed_votes
  add column if not exists industry_tags text[] not null default '{}'::text[];

comment on column public.processed_votes.industry_tags is
  'Industry labels for Money vs. Vote filtering; overlaps with campaign_finance.top_industries names.';

create index if not exists scorecard_bills_industry_tags_gin
  on public.scorecard_bills using gin (industry_tags);

create index if not exists processed_votes_industry_tags_gin
  on public.processed_votes using gin (industry_tags);

-- 2) Best-effort backfill from primary_category / title -------------------

update public.scorecard_bills
set industry_tags = case
  when coalesce(category, '') ~* 'energy|environment|oil|gas|climate'
    then array['Oil & Gas', 'Energy & Environment']
  when coalesce(category, '') ~* 'housing|infra'
    then array['Real Estate', 'Housing & Infrastructure']
  when coalesce(category, '') ~* 'health'
    then array['Health Professionals', 'Healthcare']
  when coalesce(category, '') ~* 'foreign|defense'
    then array['Defense Aerospace', 'Foreign Policy & Defense']
  when coalesce(category, '') ~* 'education|labor'
    then array['Public Sector Unions', 'Education & Labor']
  when coalesce(category, '') ~* 'immigration|border'
    then array['Immigration & Border']
  when coalesce(category, '') ~* 'civil|justice'
    then array['Lawyers & Lobbyists', 'Civil Rights & Justice']
  else array[coalesce(nullif(trim(category), ''), 'Economy & Taxes')]
end
where coalesce(cardinality(industry_tags), 0) = 0;

update public.processed_votes
set industry_tags = case
  when coalesce(primary_category, '') = 'Energy & Environment'
    or coalesce(title, '') ~* 'oil|gas|petroleum|pipeline|epa|climate|emission'
    then array['Oil & Gas', 'Energy & Environment']
  when coalesce(primary_category, '') = 'Housing & Infrastructure'
    or coalesce(title, '') ~* 'housing|mortgage|rent|zoning|infra|transit'
    then array['Real Estate', 'Housing & Infrastructure']
  when coalesce(primary_category, '') = 'Healthcare'
    or coalesce(title, '') ~* 'health|medicare|medicaid|pharma|hospital'
    then array['Health Professionals', 'Healthcare']
  when coalesce(primary_category, '') = 'Foreign Policy & Defense'
    or coalesce(title, '') ~* 'defense|military|nato|war|troop|sanction'
    then array['Defense Aerospace', 'Foreign Policy & Defense']
  when coalesce(primary_category, '') = 'Education & Labor'
    or coalesce(title, '') ~* 'school|educat|labor|union|wage|worker'
    then array['Public Sector Unions', 'Education & Labor']
  when coalesce(primary_category, '') = 'Immigration & Border'
    then array['Immigration & Border']
  when coalesce(primary_category, '') = 'Civil Rights & Justice'
    then array['Lawyers & Lobbyists', 'Civil Rights & Justice']
  when coalesce(primary_category, '') = 'Economy & Taxes'
    or coalesce(title, '') ~* 'tax|bank|securities|budget|tariff'
    then array['Securities & Investment', 'Economy & Taxes']
  else array[coalesce(nullif(trim(primary_category), ''), 'Economy & Taxes')]
end
where coalesce(cardinality(industry_tags), 0) = 0;

-- 3) RPC: votes for a politician filtered by industry --------------------
-- Example client call:
--   const { data } = await supabase.rpc('get_votes_for_industry', {
--     p_industry: 'Oil & Gas',
--     p_bioguide: 'H001089',
--     p_limit: 25
--   });

create or replace function public.get_votes_for_industry(
  p_industry text,
  p_bioguide text default null,
  p_limit integer default 25
)
returns table (
  bill_id text,
  bill_number text,
  title text,
  category text,
  industry_tags text[],
  vote_position text,
  vote_date date,
  plain_english_summary text
)
language sql
stable
security invoker
as $$
  with industry as (
    select trim(p_industry) as label
  ),
  tags as (
    -- Match exact industry name OR related policy category tag.
    select array_agg(distinct t) as needles
    from (
      select lower(label) as t from industry where label <> ''
      union all
      select lower(case
        when label ~* 'oil|gas|energy|petroleum|coal|mining|utilities'
          then 'Energy & Environment'
        when label ~* 'real estate|construction|housing'
          then 'Housing & Infrastructure'
        when label ~* 'health|pharma|hospital|medical'
          then 'Healthcare'
        when label ~* 'defense|aerospace'
          then 'Foreign Policy & Defense'
        when label ~* 'edu|labor|union|teacher'
          then 'Education & Labor'
        when label ~* 'immigra|border'
          then 'Immigration & Border'
        when label ~* 'law|legal|gun|civil'
          then 'Civil Rights & Justice'
        else 'Economy & Taxes'
      end)
      from industry
      where label <> ''
    ) s
  )
  select
    coalesce(b.id::text, pv.roll_call_id) as bill_id,
    coalesce(b.bill_number, pv.bill_number) as bill_number,
    coalesce(b.title, pv.title) as title,
    coalesce(b.category, pv.primary_category) as category,
    coalesce(b.industry_tags, pv.industry_tags, '{}'::text[]) as industry_tags,
    r.vote_position,
    coalesce(b.vote_date, pv.vote_date) as vote_date,
    coalesce(b.plain_english_summary, pv.plain_summary, pv.card_summary) as plain_english_summary
  from public.representative_vote_records r
  join public.representative_profiles p
    on p.id = r.politician_id
  join public.scorecard_bills b
    on b.id = r.bill_id
  left join public.processed_votes pv
    on pv.bill_number = b.bill_number
  cross join tags
  where
    (p_bioguide is null or upper(p.bioguide_id) = upper(p_bioguide))
    and (
      exists (
        select 1
        from unnest(coalesce(b.industry_tags, '{}'::text[])) tag
        where lower(tag) = any (tags.needles)
      )
      or exists (
        select 1
        from unnest(coalesce(pv.industry_tags, '{}'::text[])) tag
        where lower(tag) = any (tags.needles)
      )
      or lower(coalesce(b.category, '')) = any (tags.needles)
      or lower(coalesce(pv.primary_category, '')) = any (tags.needles)
    )
  order by coalesce(b.vote_date, pv.vote_date) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

comment on function public.get_votes_for_industry(text, text, integer) is
  'Follow the Money drill-down: return scorecard votes whose industry_tags overlap the selected industry.';

grant execute on function public.get_votes_for_industry(text, text, integer)
  to anon, authenticated;

-- 4) Quick verification ---------------------------------------------------
-- select bill_number, category, industry_tags
-- from public.scorecard_bills
-- where industry_tags && array['Oil & Gas']
-- limit 10;
--
-- select * from public.get_votes_for_industry('Oil & Gas', 'H001089', 10);
