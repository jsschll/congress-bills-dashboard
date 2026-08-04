-- Key-vote gatekeeper flag for processed_votes.
-- Used by Truth in Voting / Action Match feeds to default to significant votes.
-- Safe to re-run.

alter table public.processed_votes
  add column if not exists is_key_vote boolean;

comment on column public.processed_votes.is_key_vote is
  'Claude gatekeeper: true for significant policy / War Powers / major budget / contentious amendments; false for minor procedural steps.';

-- Best-effort backfill: treat existing Claude cards as key unless clearly procedural.
update public.processed_votes
set is_key_vote = true
where is_key_vote is null
  and coalesce(nullif(trim(summary), ''), '') <> '';

update public.processed_votes
set is_key_vote = false
where coalesce(is_key_vote, true) = true
  and (
    vote_question ~* 'previous question|motion to table|motion to adjourn|quorum call|approve the journal'
    or title ~* 'previous question|motion to table|motion to adjourn'
  );
