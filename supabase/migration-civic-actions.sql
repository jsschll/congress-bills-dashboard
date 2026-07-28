-- Private civic action tracker: bill notes + representative contact log.

create extension if not exists "pgcrypto";

create table if not exists public.civic_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('note', 'contact')),
  title text,
  body text not null,
  bill_id text,
  bill_label text,
  politician_id uuid references public.politicians (id) on delete set null,
  politician_name text,
  contact_method text
    check (
      contact_method is null
      or contact_method in ('email', 'call', 'meeting', 'other')
    ),
  action_date date not null default (timezone('utc', now()))::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists civic_actions_user_id_idx
  on public.civic_actions (user_id);

create index if not exists civic_actions_user_kind_idx
  on public.civic_actions (user_id, kind);

create index if not exists civic_actions_action_date_idx
  on public.civic_actions (user_id, action_date desc);

alter table public.civic_actions enable row level security;

drop policy if exists "Users can read own civic actions" on public.civic_actions;
create policy "Users can read own civic actions"
  on public.civic_actions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own civic actions" on public.civic_actions;
create policy "Users can insert own civic actions"
  on public.civic_actions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own civic actions" on public.civic_actions;
create policy "Users can update own civic actions"
  on public.civic_actions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own civic actions" on public.civic_actions;
create policy "Users can delete own civic actions"
  on public.civic_actions for delete
  using (auth.uid() = user_id);
