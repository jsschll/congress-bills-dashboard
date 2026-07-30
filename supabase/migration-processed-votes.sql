-- Processed congressional roll-call votes (plain-English cards).
-- Used by /api/sync-votes (and app/api/sync-votes when on Next.js).
-- Safe to re-run: creates the table if missing, then adds any missing columns.

create table if not exists public.processed_votes (
  id text primary key
);

alter table public.processed_votes
  add column if not exists congress integer,
  add column if not exists session_number integer not null default 1,
  add column if not exists roll_call_number integer,
  add column if not exists chamber text not null default 'house',
  add column if not exists bill_type text,
  add column if not exists bill_number text,
  add column if not exists legislation_number text,
  add column if not exists title text,
  add column if not exists vote_question text,
  add column if not exists result text,
  add column if not exists vote_date date,
  add column if not exists vote_kind text,
  add column if not exists official_url text,
  add column if not exists clerk_url text,
  add column if not exists summary text,
  add column if not exists yea_means text,
  add column if not exists nay_means text,
  add column if not exists yea_label text,
  add column if not exists nay_label text,
  add column if not exists summary_source text default 'llm',
  add column if not exists raw_payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Backfill NOT NULL fields that may have been added as nullable on older stubs.
update public.processed_votes
set congress = coalesce(congress, 119)
where congress is null;

update public.processed_votes
set roll_call_number = coalesce(roll_call_number, 0)
where roll_call_number is null;

alter table public.processed_votes
  alter column congress set not null,
  alter column roll_call_number set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'processed_votes_chamber_check'
      and conrelid = 'public.processed_votes'::regclass
  ) then
    alter table public.processed_votes
      add constraint processed_votes_chamber_check
      check (chamber in ('house', 'senate'));
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'processed_votes_chamber_congress_session_number_roll_call_number_key'
      and conrelid = 'public.processed_votes'::regclass
  ) then
    alter table public.processed_votes
      add constraint processed_votes_chamber_congress_session_number_roll_call_number_key
      unique (chamber, congress, session_number, roll_call_number);
  end if;
exception
  when duplicate_object then null;
end $$;

create index if not exists processed_votes_date_idx
  on public.processed_votes (vote_date desc nulls last);

create index if not exists processed_votes_bill_idx
  on public.processed_votes (bill_type, legislation_number);

alter table public.processed_votes enable row level security;

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
