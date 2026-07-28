-- Seed White House & Executive Office principals into national_officials.
-- These are nationwide roles (not address-district offices). Safe to re-run.
--
-- Run in the Supabase SQL editor after migration-national-officials.sql.

insert into public.national_officials (
  full_name, title, category, branch, department, party, photo_url
)
select v.full_name, v.title, v.category, v.branch, v.department, v.party, v.photo_url
from (
  values
    (
      'Susan Wiles',
      'White House Chief of Staff',
      'White House',
      'Executive',
      'White House',
      null,
      null
    ),
    (
      'Michael Waltz',
      'Ambassador to the United Nations',
      'White House',
      'Executive',
      'Executive Office of the President',
      'Republican',
      null
    ),
    (
      'Pierre Yared',
      'Chair of the Council of Economic Advisers',
      'White House',
      'Executive',
      'Council of Economic Advisers',
      null,
      null
    ),
    (
      'Michael Kratsios',
      'Director of the Office of Science and Technology Policy',
      'White House',
      'Executive',
      'Office of Science and Technology Policy',
      null,
      null
    ),
    (
      'Jamieson Greer',
      'United States Trade Representative',
      'White House',
      'Executive',
      'Office of the United States Trade Representative',
      null,
      null
    )
) as v(full_name, title, category, branch, department, party, photo_url)
where not exists (
  select 1
  from public.national_officials existing
  where lower(existing.full_name) = lower(v.full_name)
    and lower(coalesce(existing.title, '')) = lower(v.title)
);

-- Confirm:
-- select full_name, title, category
-- from public.national_officials
-- where lower(category) in ('white house', 'executive office')
-- order by title;
