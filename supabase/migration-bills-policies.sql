-- Bills, Laws & Policies feature
-- Add a canonical bill cache plus per-user followed bills.

create extension if not exists "pgcrypto";

create table if not exists public.bill_items (
  id text primary key,
  bill_number text not null,
  title text not null,
  level text not null check (level in ('Federal', 'State', 'City', 'District')),
  jurisdiction text not null,
  government_source text,
  primary_sponsor_name text,
  primary_sponsor_title text,
  last_updated timestamptz not null default now(),
  status_step_number integer not null default 1,
  status_total_steps integer not null default 4,
  status_step_name text not null default 'Introduced',
  short_pitch text,
  delta_summary jsonb not null default '{"added":[],"changed":[],"removed":[]}'::jsonb,
  official_url text,
  tags text[] not null default '{}',
  all_steps jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bill_items_level_idx
  on public.bill_items (level);

create index if not exists bill_items_last_updated_idx
  on public.bill_items (last_updated desc);

create index if not exists bill_items_tags_idx
  on public.bill_items using gin (tags);

create table if not exists public.followed_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bill_id text not null references public.bill_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, bill_id)
);

create index if not exists followed_bills_user_id_idx
  on public.followed_bills (user_id);

alter table public.bill_items enable row level security;
alter table public.followed_bills enable row level security;

drop policy if exists "Anyone can read bill items" on public.bill_items;
create policy "Anyone can read bill items"
  on public.bill_items for select
  using (true);

drop policy if exists "Authenticated users can insert bill items" on public.bill_items;
create policy "Authenticated users can insert bill items"
  on public.bill_items for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update bill items" on public.bill_items;
create policy "Authenticated users can update bill items"
  on public.bill_items for update
  to authenticated
  using (true);

drop policy if exists "Users can read own followed bills" on public.followed_bills;
create policy "Users can read own followed bills"
  on public.followed_bills for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own followed bills" on public.followed_bills;
create policy "Users can insert own followed bills"
  on public.followed_bills for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own followed bills" on public.followed_bills;
create policy "Users can delete own followed bills"
  on public.followed_bills for delete
  using (auth.uid() = user_id);
