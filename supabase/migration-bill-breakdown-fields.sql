-- Progressive bill breakdown fields on processed_votes.
-- Powers Tier 2 accordion + Tier 3 deep-dive Bill Breakdown views.
-- Safe to re-run.

alter table public.processed_votes
  add column if not exists card_summary text,
  add column if not exists takeaway text,
  add column if not exists key_points jsonb,
  add column if not exists pro_argument text,
  add column if not exists con_argument text;

comment on column public.processed_votes.card_summary is
  'Strict 2-sentence (~35 word) summary for scorecard accordion Tier 2.';
comment on column public.processed_votes.takeaway is
  '1-line crisp takeaway headline for Tier 3 Bill Breakdown.';
comment on column public.processed_votes.key_points is
  'JSON array of up to 3 short real-world impact bullets for Tier 3.';
comment on column public.processed_votes.pro_argument is
  '1 sentence on why supporters voted Yea.';
comment on column public.processed_votes.con_argument is
  '1 sentence on why opponents voted Nay.';

-- Backfill from existing Claude fields before re-sync.
update public.processed_votes
set card_summary = coalesce(
  nullif(trim(card_summary), ''),
  nullif(trim(plain_summary), ''),
  nullif(trim(what_it_does), ''),
  nullif(trim(summary), '')
)
where coalesce(nullif(trim(card_summary), ''), '') = ''
  and (
    coalesce(nullif(trim(plain_summary), ''), '') <> ''
    or coalesce(nullif(trim(what_it_does), ''), '') <> ''
    or coalesce(nullif(trim(summary), ''), '') <> ''
  );

update public.processed_votes
set takeaway = coalesce(
  nullif(trim(takeaway), ''),
  nullif(trim(short_title), '')
)
where coalesce(nullif(trim(takeaway), ''), '') = ''
  and coalesce(nullif(trim(short_title), ''), '') <> '';

update public.processed_votes
set pro_argument = coalesce(
  nullif(trim(pro_argument), ''),
  nullif(trim(yea_impact), ''),
  nullif(trim(yea_means), '')
)
where coalesce(nullif(trim(pro_argument), ''), '') = ''
  and (
    coalesce(nullif(trim(yea_impact), ''), '') <> ''
    or coalesce(nullif(trim(yea_means), ''), '') <> ''
  );

update public.processed_votes
set con_argument = coalesce(
  nullif(trim(con_argument), ''),
  nullif(trim(nay_impact), ''),
  nullif(trim(nay_means), '')
)
where coalesce(nullif(trim(con_argument), ''), '') = ''
  and (
    coalesce(nullif(trim(nay_impact), ''), '') <> ''
    or coalesce(nullif(trim(nay_means), ''), '') <> ''
  );

-- Seed key_points from card_summary / impacts when empty.
update public.processed_votes
set key_points = jsonb_build_array(
  coalesce(nullif(trim(card_summary), ''), nullif(trim(plain_summary), ''), 'This roll call changes federal policy.'),
  coalesce(nullif(trim(yea_impact), ''), 'Supporters want to advance this change.'),
  coalesce(nullif(trim(nay_impact), ''), 'Opponents want to block this change.')
)
where key_points is null
  and coalesce(nullif(trim(card_summary), ''), nullif(trim(plain_summary), ''), '') <> '';
