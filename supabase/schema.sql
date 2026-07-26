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

-- Politicians feature (also in migration-politicians.sql)
create table if not exists public.politicians (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  bioguide_id text,
  level text not null check (level in ('federal', 'state')),
  chamber text,
  name text not null,
  party text,
  state text,
  district text,
  photo_url text,
  website_url text,
  phone text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists politicians_level_idx on public.politicians (level);
create index if not exists politicians_state_idx on public.politicians (state);
create index if not exists politicians_party_idx on public.politicians (party);
create index if not exists politicians_bioguide_idx on public.politicians (bioguide_id);

create table if not exists public.followed_politicians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  politician_id uuid not null references public.politicians (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, politician_id)
);

create index if not exists followed_politicians_user_id_idx
  on public.followed_politicians (user_id);

alter table public.politicians enable row level security;
alter table public.followed_politicians enable row level security;

drop policy if exists "Anyone can read politicians" on public.politicians;
create policy "Anyone can read politicians"
  on public.politicians for select
  using (true);

drop policy if exists "Authenticated users can upsert politicians" on public.politicians;
create policy "Authenticated users can upsert politicians"
  on public.politicians for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update politicians" on public.politicians;
create policy "Authenticated users can update politicians"
  on public.politicians for update
  to authenticated
  using (true);

drop policy if exists "Users can read own politician follows" on public.followed_politicians;
create policy "Users can read own politician follows"
  on public.followed_politicians for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own politician follows" on public.followed_politicians;
create policy "Users can insert own politician follows"
  on public.followed_politicians for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own politician follows" on public.followed_politicians;
create policy "Users can delete own politician follows"
  on public.followed_politicians for delete
  using (auth.uid() = user_id);

create or replace function public.upsert_politician(
  p_external_key text,
  p_bioguide_id text,
  p_level text,
  p_chamber text,
  p_name text,
  p_party text,
  p_state text,
  p_district text,
  p_photo_url text,
  p_website_url text,
  p_phone text,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.politicians
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.politicians;
begin
  insert into public.politicians as pol (
    external_key, bioguide_id, level, chamber, name, party, state, district,
    photo_url, website_url, phone, source, metadata, updated_at
  )
  values (
    p_external_key, p_bioguide_id, p_level, p_chamber, p_name, p_party, p_state, p_district,
    p_photo_url, p_website_url, p_phone, p_source, coalesce(p_metadata, '{}'::jsonb), now()
  )
  on conflict (external_key) do update set
    bioguide_id = coalesce(excluded.bioguide_id, pol.bioguide_id),
    level = excluded.level,
    chamber = coalesce(excluded.chamber, pol.chamber),
    name = excluded.name,
    party = coalesce(excluded.party, pol.party),
    state = coalesce(excluded.state, pol.state),
    district = coalesce(excluded.district, pol.district),
    photo_url = coalesce(excluded.photo_url, pol.photo_url),
    website_url = coalesce(excluded.website_url, pol.website_url),
    phone = coalesce(excluded.phone, pol.phone),
    source = coalesce(excluded.source, pol.source),
    metadata = pol.metadata || excluded.metadata,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

grant execute on function public.upsert_politician(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb
) to anon, authenticated;
