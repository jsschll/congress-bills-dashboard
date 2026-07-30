-- Processed congressional roll-call votes (plain-English cards).
-- Used by /api/sync-votes (and app/api/sync-votes when on Next.js).

create table if not exists public.processed_votes (
  id text primary key,
  congress integer not null,
  session_number integer not null default 1,
  roll_call_number integer not null,
  chamber text not null default 'house'
    check (chamber in ('house', 'senate')),
  bill_type text,
  bill_number text,
  legislation_number text,
  title text,
  vote_question text,
  result text,
  vote_date date,
  vote_kind text,
  official_url text,
  clerk_url text,
  summary text,
  yea_means text,
  nay_means text,
  yea_label text,
  nay_label text,
  summary_source text default 'llm',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chamber, congress, session_number, roll_call_number)
);

create index if not exists processed_votes_date_idx
  on public.processed_votes (vote_date desc nulls last);

create index if not exists processed_votes_bill_idx
  on public.processed_votes (bill_type, legislation_number);

alter table public.processed_votes enable row level security;

-- Public read for vote cards; writes go through the service role (bypasses RLS).
drop policy if exists "Anyone can read processed votes" on public.processed_votes;
create policy "Anyone can read processed votes"
  on public.processed_votes for select
  using (true);

create or replace function public.set_processed_votes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists processed_votes_set_updated_at on public.processed_votes;
create trigger processed_votes_set_updated_at
  before update on public.processed_votes
  for each row
  execute function public.set_processed_votes_updated_at();
