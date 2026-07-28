-- Optional self-reported voter registration status for Election & Voting Center.

alter table public.profiles
  add column if not exists voter_registration_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_voter_registration_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_voter_registration_status_check
      check (
        voter_registration_status is null
        or voter_registration_status in ('registered', 'not_registered', 'unsure')
      );
  end if;
end $$;
