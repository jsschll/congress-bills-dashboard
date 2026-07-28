-- Civic profile preferences for address precision, feed priority, and notifications.

alter table public.profiles
  add column if not exists home_address text;

alter table public.profiles
  add column if not exists location_precision text;

alter table public.profiles
  add column if not exists impact_scale text;

alter table public.profiles
  add column if not exists notify_critical boolean;

alter table public.profiles
  add column if not exists notify_digest text;

alter table public.profiles
  add column if not exists notify_neighborhood boolean;

update public.profiles
set
  location_precision = coalesce(location_precision, 'street'),
  impact_scale = coalesce(impact_scale, 'state'),
  notify_critical = coalesce(notify_critical, true),
  notify_digest = coalesce(notify_digest, 'weekly'),
  notify_neighborhood = coalesce(notify_neighborhood, false)
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_location_precision_check'
  ) then
    alter table public.profiles
      add constraint profiles_location_precision_check
      check (location_precision in ('street', 'zip'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_impact_scale_check'
  ) then
    alter table public.profiles
      add constraint profiles_impact_scale_check
      check (impact_scale in ('hyperlocal', 'state', 'national'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_notify_digest_check'
  ) then
    alter table public.profiles
      add constraint profiles_notify_digest_check
      check (notify_digest in ('off', 'daily', 'weekly'));
  end if;
end $$;

alter table public.profiles
  alter column location_precision set default 'street';

alter table public.profiles
  alter column impact_scale set default 'state';

alter table public.profiles
  alter column notify_critical set default true;

alter table public.profiles
  alter column notify_digest set default 'weekly';

alter table public.profiles
  alter column notify_neighborhood set default false;
