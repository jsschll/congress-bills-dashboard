-- Policy card engagement: user Support/Oppose stances + community aggregates.
-- Run in Supabase SQL Editor after migration-bills-policies.sql.

create extension if not exists "pgcrypto";

create table if not exists public.bill_stances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bill_id text not null references public.bill_items (id) on delete cascade,
  stance text not null check (stance in ('support', 'oppose')),
  state_code text,
  district_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bill_id)
);

create index if not exists bill_stances_bill_id_idx
  on public.bill_stances (bill_id);

create index if not exists bill_stances_bill_state_idx
  on public.bill_stances (bill_id, state_code);

create index if not exists bill_stances_bill_district_idx
  on public.bill_stances (bill_id, district_key);

create index if not exists bill_stances_user_id_idx
  on public.bill_stances (user_id);

alter table public.bill_stances enable row level security;

drop policy if exists "Users can read own bill stances" on public.bill_stances;
create policy "Users can read own bill stances"
  on public.bill_stances for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own bill stances" on public.bill_stances;
create policy "Users can insert own bill stances"
  on public.bill_stances for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own bill stances" on public.bill_stances;
create policy "Users can update own bill stances"
  on public.bill_stances for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own bill stances" on public.bill_stances;
create policy "Users can delete own bill stances"
  on public.bill_stances for delete
  using (auth.uid() = user_id);

-- Aggregated community split (no individual user exposure).
create or replace function public.get_bill_community_stances(
  p_bill_id text,
  p_state_code text default null,
  p_district_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_support integer := 0;
  v_oppose integer := 0;
  v_scope text := 'national';
begin
  if p_district_key is not null and length(trim(p_district_key)) > 0 then
    select
      count(*) filter (where stance = 'support'),
      count(*) filter (where stance = 'oppose')
    into v_support, v_oppose
    from public.bill_stances
    where bill_id = p_bill_id
      and district_key = upper(trim(p_district_key));

    if (v_support + v_oppose) >= 3 then
      v_scope := 'district';
    else
      v_support := 0;
      v_oppose := 0;
    end if;
  end if;

  if v_scope = 'national'
     and p_state_code is not null
     and length(trim(p_state_code)) = 2 then
    select
      count(*) filter (where stance = 'support'),
      count(*) filter (where stance = 'oppose')
    into v_support, v_oppose
    from public.bill_stances
    where bill_id = p_bill_id
      and state_code = upper(trim(p_state_code));

    if (v_support + v_oppose) > 0 then
      v_scope := 'state';
    end if;
  end if;

  if v_scope = 'national' and (v_support + v_oppose) = 0 then
    select
      count(*) filter (where stance = 'support'),
      count(*) filter (where stance = 'oppose')
    into v_support, v_oppose
    from public.bill_stances
    where bill_id = p_bill_id;
  end if;

  return jsonb_build_object(
    'bill_id', p_bill_id,
    'scope', v_scope,
    'support', v_support,
    'oppose', v_oppose,
    'total', v_support + v_oppose
  );
end;
$$;

revoke all on function public.get_bill_community_stances(text, text, text) from public;
grant execute on function public.get_bill_community_stances(text, text, text) to anon, authenticated;

-- Alignment = share of the user's stances that match their district (or state) majority.
create or replace function public.get_user_alignment_score(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_compared integer := 0;
  v_matched integer := 0;
  r record;
  v_support integer;
  v_oppose integer;
  v_majority text;
begin
  if v_uid is null then
    return jsonb_build_object(
      'score', null,
      'compared', 0,
      'matched', 0,
      'label', 'Sign in to track alignment'
    );
  end if;

  if auth.uid() is distinct from v_uid then
    raise exception 'Not authorized';
  end if;

  for r in
    select bill_id, stance, state_code, district_key
    from public.bill_stances
    where user_id = v_uid
  loop
    v_support := 0;
    v_oppose := 0;

    if r.district_key is not null and length(trim(r.district_key)) > 0 then
      select
        count(*) filter (where stance = 'support'),
        count(*) filter (where stance = 'oppose')
      into v_support, v_oppose
      from public.bill_stances
      where bill_id = r.bill_id
        and district_key = r.district_key
        and user_id <> v_uid;
    end if;

    if (v_support + v_oppose) < 2 and r.state_code is not null then
      select
        count(*) filter (where stance = 'support'),
        count(*) filter (where stance = 'oppose')
      into v_support, v_oppose
      from public.bill_stances
      where bill_id = r.bill_id
        and state_code = r.state_code
        and user_id <> v_uid;
    end if;

    if (v_support + v_oppose) < 2 then
      continue;
    end if;

    if v_support = v_oppose then
      continue;
    end if;

    v_majority := case when v_support > v_oppose then 'support' else 'oppose' end;
    v_compared := v_compared + 1;
    if r.stance = v_majority then
      v_matched := v_matched + 1;
    end if;
  end loop;

  if v_compared = 0 then
    return jsonb_build_object(
      'score', null,
      'compared', 0,
      'matched', 0,
      'label', 'Take a few stances to unlock your Representative Alignment Score'
    );
  end if;

  return jsonb_build_object(
    'score', round((v_matched::numeric / v_compared::numeric) * 100),
    'compared', v_compared,
    'matched', v_matched,
    'label', 'Representative Alignment Score'
  );
end;
$$;

revoke all on function public.get_user_alignment_score(uuid) from public;
grant execute on function public.get_user_alignment_score(uuid) to authenticated;
