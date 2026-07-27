-- National officials (Cabinet Secretaries + Supreme Court Justices)
-- Table was created in Supabase; this documents the expected shape for the app.
-- Columns used by the client: id, full_name, title, category, branch, department
--
-- category / branch / title are used to bucket rows into:
--   - Cabinet Secretaries
--   - Supreme Court Justices
-- Prefer category values like "Cabinet Secretaries" or "Supreme Court Justices".

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

drop policy if exists "Anyone can read national officials" on public.national_officials;
create policy "Anyone can read national officials"
  on public.national_officials for select
  using (true);
