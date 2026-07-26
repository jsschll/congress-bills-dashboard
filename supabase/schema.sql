-- Run this in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text,
  username text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.followed_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('policy_area', 'keyword')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bill_congress integer not null,
  bill_type text not null,
  bill_number text not null,
  bill_title text not null,
  matched_topic text not null,
  matched_kind text not null check (matched_kind in ('policy_area', 'keyword')),
  action_text text,
  action_date text,
  summary_excerpt text,
  update_fingerprint text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, update_fingerprint)
);

create index if not exists followed_topics_user_id_idx
  on public.followed_topics (user_id);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.profiles enable row level security;
alter table public.followed_topics enable row level security;
alter table public.notifications enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, username)
  values (
    new.id,
    new.email,
    new.phone,
    nullif(lower(coalesce(new.raw_user_meta_data->>'username', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        username = coalesce(excluded.username, public.profiles.username);
  return new;
end;
$$;

create or replace function public.get_email_for_username(uname text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email
  from public.profiles
  where username is not null
    and lower(username) = lower(uname)
  limit 1;
$$;

grant execute on function public.get_email_for_username(text) to anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can read own follows" on public.followed_topics;
create policy "Users can read own follows"
  on public.followed_topics for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own follows" on public.followed_topics;
create policy "Users can insert own follows"
  on public.followed_topics for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own follows" on public.followed_topics;
create policy "Users can delete own follows"
  on public.followed_topics for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);
