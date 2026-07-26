-- Expand politician levels beyond federal/state for city, county, school, and local offices.
-- Run in Supabase SQL editor after migration-politicians.sql (or schema.sql).

alter table public.politicians
  drop constraint if exists politicians_level_check;

alter table public.politicians
  add constraint politicians_level_check
  check (
    level in ('federal', 'state', 'county', 'city', 'school', 'local')
  );

alter table public.politicians
  add column if not exists office_title text;

create index if not exists politicians_office_title_idx
  on public.politicians (office_title);

drop function if exists public.upsert_politician(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb
);
drop function if exists public.upsert_politician(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb, text
);

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
