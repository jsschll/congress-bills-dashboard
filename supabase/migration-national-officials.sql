-- National officials (President/VP, Cabinet, Agency Directors, Supreme Court)
-- Categories used by the app:
--   - President / Vice President  -> President & Vice President
--   - Cabinet Secretaries
--   - Agency Director            -> Federal Agency Directors
--   - Supreme Court Justices
--
-- President & VP are NOT returned by Geocodio address lookup. Seed them with:
--   supabase/seed-national-executive.sql
--
-- Run this in the Supabase SQL editor if rows exist in the table but do not
-- appear in the app. An empty client response usually means RLS is enabled
-- without a public SELECT policy (or anon lacks GRANT SELECT).

create table if not exists public.national_officials (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  category text,
  branch text,
  department text
);

create index if not exists national_officials_full_name_idx
  on public.national_officials (full_name);

create index if not exists national_officials_category_idx
  on public.national_officials (category);

alter table public.national_officials enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.national_officials to anon, authenticated;

drop policy if exists "Anyone can read national officials" on public.national_officials;
create policy "Anyone can read national officials"
  on public.national_officials
  for select
  to anon, authenticated
  using (true);

-- Optional: confirm the app can see rows
-- select count(*) from public.national_officials;
