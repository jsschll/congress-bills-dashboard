-- Saved home address for Bills location filtering (and related features).

alter table public.profiles
  add column if not exists home_address text;
