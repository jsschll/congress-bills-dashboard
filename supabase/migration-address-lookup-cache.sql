-- Address / ZIP lookup cache for /api/lookup-representatives
-- Stores the combined roster (live Civic APIs + national/state directors)
-- so repeat lookups can return instantly for 30 days.
--
-- Run in the Supabase SQL editor. Writes are done by the Vercel API with the
-- service role key; anon may read for debugging.

create table if not exists public.address_lookup_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  query_raw text not null,
  zip_code text,
  state text,
  city text,
  county text,
  place_mode boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists address_lookup_cache_zip_code_idx
  on public.address_lookup_cache (zip_code);

create index if not exists address_lookup_cache_fetched_at_idx
  on public.address_lookup_cache (fetched_at desc);

create index if not exists address_lookup_cache_state_idx
  on public.address_lookup_cache (state);

alter table public.address_lookup_cache enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.address_lookup_cache to anon, authenticated;

drop policy if exists "Anyone can read address lookup cache"
  on public.address_lookup_cache;
create policy "Anyone can read address lookup cache"
  on public.address_lookup_cache
  for select
  to anon, authenticated
  using (true);

-- Service role bypasses RLS for insert/update from /api/lookup-representatives.
comment on table public.address_lookup_cache is
  'Cached address/ZIP representative rosters for lookup-representatives (TTL enforced in API, default 30 days).';
