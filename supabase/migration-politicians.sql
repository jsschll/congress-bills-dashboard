-- Politicians + follow relationships
-- Run in Supabase SQL editor (after base schema).

create table if not exists public.politicians (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique,
  bioguide_id text,
  level text not null check (
    level in ('federal', 'state', 'county', 'city', 'school', 'local')
  ),
  chamber text,
  office_title text,
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
  p_metadata jsonb default '{}'::jsonb,
  p_office_title text default null
)
returns public.politicians
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.politicians;
  resolved_title text;
begin
  resolved_title := coalesce(
    nullif(trim(p_office_title), ''),
    nullif(trim(p_metadata ->> 'office_title'), ''),
    nullif(trim(p_chamber), '')
  );

  insert into public.politicians as pol (
    external_key, bioguide_id, level, chamber, office_title, name, party, state, district,
    photo_url, website_url, phone, source, metadata, updated_at
  )
  values (
    p_external_key, p_bioguide_id, p_level, p_chamber, resolved_title, p_name, p_party, p_state, p_district,
    p_photo_url, p_website_url, p_phone, p_source, coalesce(p_metadata, '{}'::jsonb), now()
  )
  on conflict (external_key) do update set
    bioguide_id = coalesce(excluded.bioguide_id, pol.bioguide_id),
    level = excluded.level,
    chamber = coalesce(excluded.chamber, pol.chamber),
    office_title = coalesce(excluded.office_title, pol.office_title),
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
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb, text
) to anon, authenticated;
