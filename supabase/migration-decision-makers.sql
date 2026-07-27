-- Decision makers directory
-- Run in Supabase SQL editor (after base schema / politicians migrations).

create table if not exists public.decision_makers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,
  level text not null check (
    level in ('federal', 'state', 'county', 'city', 'school', 'local')
  ),
  email text,
  phone text,
  website_url text,
  address text,
  state text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decision_makers_name_idx
  on public.decision_makers (name);

create index if not exists decision_makers_level_idx
  on public.decision_makers (level);

create index if not exists decision_makers_state_idx
  on public.decision_makers (state);

alter table public.decision_makers enable row level security;

drop policy if exists "Anyone can read decision makers" on public.decision_makers;
create policy "Anyone can read decision makers"
  on public.decision_makers for select
  using (true);

drop policy if exists "Authenticated users can insert decision makers" on public.decision_makers;
create policy "Authenticated users can insert decision makers"
  on public.decision_makers for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update decision makers" on public.decision_makers;
create policy "Authenticated users can update decision makers"
  on public.decision_makers for update
  to authenticated
  using (true);

drop policy if exists "Authenticated users can delete decision makers" on public.decision_makers;
create policy "Authenticated users can delete decision makers"
  on public.decision_makers for delete
  to authenticated
  using (true);
