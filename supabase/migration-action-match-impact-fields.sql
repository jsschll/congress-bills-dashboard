-- Action Match impact fields on processed_votes.
-- Powers plain-English titles + Yea/Nay impact copy on agree/differ cards.
-- Safe to re-run.

alter table public.processed_votes
  add column if not exists short_title text,
  add column if not exists what_it_does text,
  add column if not exists yea_impact text,
  add column if not exists nay_impact text;

comment on column public.processed_votes.short_title is
  'Plain-English topic title for Action Match cards (e.g. Local Police Hiring Grants).';
comment on column public.processed_votes.what_it_does is
  'One-sentence real-world impact summary for the roll call.';
comment on column public.processed_votes.yea_impact is
  'What a Support / Yea vote advocates for.';
comment on column public.processed_votes.nay_impact is
  'What an Oppose / Nay vote advocates for.';

-- Best-effort backfill from existing LLM copy so cards improve before re-sync.
update public.processed_votes
set what_it_does = coalesce(
  nullif(trim(what_it_does), ''),
  nullif(trim(summary), '')
)
where coalesce(nullif(trim(what_it_does), ''), '') = ''
  and coalesce(nullif(trim(summary), ''), '') <> '';

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
