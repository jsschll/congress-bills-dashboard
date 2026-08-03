-- Add plain_summary to processed_votes for Claude Haiku roll-call cards.
-- Canonical Action Match fields:
--   short_title, plain_summary, yea_impact, nay_impact
-- Safe to re-run.

alter table public.processed_votes
  add column if not exists short_title text,
  add column if not exists plain_summary text,
  add column if not exists what_it_does text,
  add column if not exists yea_impact text,
  add column if not exists nay_impact text;

comment on column public.processed_votes.short_title is
  'Plain-English topic title (e.g. Local Police Hiring Grants).';
comment on column public.processed_votes.plain_summary is
  'One-sentence plain-English summary of what the measure does.';
comment on column public.processed_votes.what_it_does is
  'Legacy alias of plain_summary (kept for older clients).';
comment on column public.processed_votes.yea_impact is
  'What a Support / Yea vote advocates for.';
comment on column public.processed_votes.nay_impact is
  'What an Oppose / Nay vote advocates for.';

-- Backfill plain_summary from what_it_does / summary when empty.
update public.processed_votes
set plain_summary = coalesce(
  nullif(trim(plain_summary), ''),
  nullif(trim(what_it_does), ''),
  nullif(trim(summary), '')
)
where coalesce(nullif(trim(plain_summary), ''), '') = ''
  and (
    coalesce(nullif(trim(what_it_does), ''), '') <> ''
    or coalesce(nullif(trim(summary), ''), '') <> ''
  );

-- Keep what_it_does in sync for older UI paths.
update public.processed_votes
set what_it_does = coalesce(
  nullif(trim(what_it_does), ''),
  nullif(trim(plain_summary), ''),
  nullif(trim(summary), '')
)
where coalesce(nullif(trim(what_it_does), ''), '') = ''
  and (
    coalesce(nullif(trim(plain_summary), ''), '') <> ''
    or coalesce(nullif(trim(summary), ''), '') <> ''
  );

update public.processed_votes
set yea_impact = coalesce(
  nullif(trim(yea_impact), ''),
  nullif(trim(yea_means), '')
)
where coalesce(nullif(trim(yea_impact), ''), '') = ''
  and coalesce(nullif(trim(yea_means), ''), '') <> '';

update public.processed_votes
set nay_impact = coalesce(
  nullif(trim(nay_impact), ''),
  nullif(trim(nay_means), '')
)
where coalesce(nullif(trim(nay_impact), ''), '') = ''
  and coalesce(nullif(trim(nay_means), ''), '') <> '';
