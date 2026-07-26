-- Run this if you already applied the earlier schema.
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, username)
  values (
    new.id,
    new.email,
    new.phone,
    nullif(lower(coalesce(new.raw_user_meta_data->>'username', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        username = coalesce(excluded.username, public.profiles.username);
  return new;
end;
$$;

create or replace function public.get_email_for_username(uname text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email
  from public.profiles
  where username is not null
    and lower(username) = lower(uname)
  limit 1;
$$;

grant execute on function public.get_email_for_username(text) to anon, authenticated;
