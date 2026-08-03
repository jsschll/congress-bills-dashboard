-- Canonical Congress.gov bills cache (not roll-call votes).
-- Used by scripts/sync-all-bills.js. Safe to re-run.

create table if not exists public.bills (
  bill_id text primary key,
  congress integer not null default 119,
  title text not null,
  type text not null,
  number text not null,
  origin_chamber text,
  update_date date,
  sponsor text,
  status text,
  official_summary text,
  summary text,
  yea_means text,
  nay_means text,
  yea_label text,
  nay_label text,
  summary_source text,
  official_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bills_congress_type_number_idx
  on public.bills (congress, type, number);

create index if not exists bills_update_date_idx
  on public.bills (update_date desc nulls last);

create index if not exists bills_summary_source_idx
  on public.bills (summary_source);

alter table public.bills enable row level security;

drop policy if exists "Anyone can read bills" on public.bills;
create policy "Anyone can read bills"
  on public.bills for select
  using (true);

create or replace function public.set_bills_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bills_set_updated_at on public.bills;
create trigger bills_set_updated_at
  before update on public.bills
  for each row
  execute function public.set_bills_updated_at();
