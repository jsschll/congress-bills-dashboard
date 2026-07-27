-- Seed President & Vice President into national_officials.
-- These offices are nationwide (not address-based). Geocodio / Civic do not
-- reliably return them, so the Federal tab loads them from this table —
-- same pattern as Cabinet, Agency Directors, and Supreme Court.
--
-- Categories recognized by the app:
--   - President
--   - Vice President
--
-- Run in the Supabase SQL editor. Safe to re-run: skips existing names.

insert into public.national_officials (full_name, title, category, branch, department)
select v.full_name, v.title, v.category, v.branch, v.department
from (
  values
    (
      'Donald J. Trump',
      'President of the United States',
      'President',
      'Executive',
      'White House'
    ),
    (
      'JD Vance',
      'Vice President of the United States',
      'Vice President',
      'Executive',
      'White House'
    )
) as v(full_name, title, category, branch, department)
where not exists (
  select 1
  from public.national_officials existing
  where lower(existing.full_name) = lower(v.full_name)
    and lower(coalesce(existing.category, '')) in (
      'president',
      'vice president',
      'executive'
    )
);

-- Confirm:
-- select full_name, title, category from public.national_officials
-- where lower(category) in ('president', 'vice president')
--    or lower(title) like '%president%';
