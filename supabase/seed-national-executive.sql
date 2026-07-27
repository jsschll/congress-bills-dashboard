-- Add party + photo_url to national_officials (used by Federal cards).
-- Then seed / update President & Vice President with party + portraits.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.national_officials
  add column if not exists party text;

alter table public.national_officials
  add column if not exists photo_url text;

-- Insert if missing.
insert into public.national_officials (
  full_name, title, category, branch, department, party, photo_url
)
select v.full_name, v.title, v.category, v.branch, v.department, v.party, v.photo_url
from (
  values
    (
      'Donald J. Trump',
      'President of the United States',
      'President',
      'Executive',
      'White House',
      'Republican',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg/960px-January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg'
    ),
    (
      'JD Vance',
      'Vice President of the United States',
      'Vice President',
      'Executive',
      'White House',
      'Republican',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg/960px-January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg'
    )
) as v(full_name, title, category, branch, department, party, photo_url)
where not exists (
  select 1
  from public.national_officials existing
  where lower(existing.full_name) = lower(v.full_name)
);

-- Always refresh party + photo for known executives (covers earlier inserts).
update public.national_officials
set
  title = 'President of the United States',
  category = 'President',
  branch = 'Executive',
  department = 'White House',
  party = 'Republican',
  photo_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg/960px-January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg'
where lower(full_name) in ('donald j. trump', 'donald trump', 'donald john trump')
   or (
     lower(coalesce(category, '')) = 'president'
     and lower(full_name) like '%trump%'
   );

update public.national_officials
set
  title = 'Vice President of the United States',
  category = 'Vice President',
  branch = 'Executive',
  department = 'White House',
  party = 'Republican',
  photo_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg/960px-January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg'
where lower(full_name) in ('jd vance', 'j.d. vance', 'james david vance')
   or (
     lower(coalesce(category, '')) = 'vice president'
     and lower(full_name) like '%vance%'
   );

-- Confirm:
-- select full_name, title, category, party, left(photo_url, 60) as photo
-- from public.national_officials
-- where lower(category) in ('president', 'vice president');
