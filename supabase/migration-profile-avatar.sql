-- Avatar + display name for account menu / profile.
-- Run in Supabase SQL editor. Safe to re-run.

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists display_name text;

-- Optional public bucket for profile photos.
-- If this block errors, the avatar_url / display_name columns above still work
-- (the app can store a compressed data URL until Storage is configured).
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'avatars',
    'avatars',
    true,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
  on conflict (id) do update
  set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists "Avatar images are publicly readable" on storage.objects';
  execute $pol$
    create policy "Avatar images are publicly readable"
      on storage.objects for select
      using (bucket_id = 'avatars')
  $pol$;

  execute 'drop policy if exists "Users can upload own avatar" on storage.objects';
  execute $pol$
    create policy "Users can upload own avatar"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $pol$;

  execute 'drop policy if exists "Users can update own avatar" on storage.objects';
  execute $pol$
    create policy "Users can update own avatar"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $pol$;

  execute 'drop policy if exists "Users can delete own avatar" on storage.objects';
  execute $pol$
    create policy "Users can delete own avatar"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $pol$;
exception
  when others then
    raise notice 'Avatar storage bucket/policies skipped: %', sqlerrm;
end;
$$;
