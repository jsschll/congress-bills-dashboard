-- Pocketbook baselines + roll-call match tracking.
-- Run after migration-bill-stances.sql / migration-profile-civic-prefs.sql.

alter table public.profiles
  add column if not exists estimated_property_value integer,
  add column if not exists estimated_income integer,
  add column if not exists filing_status text
    check (
      filing_status is null
      or filing_status in ('single', 'married_joint', 'married_separate', 'head')
    ),
  add column if not exists vehicle_count integer;

create table if not exists public.stance_vote_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bill_id text not null references public.bill_items (id) on delete cascade,
  bioguide_id text not null,
  politician_name text,
  politician_level text default 'federal',
  user_stance text not null check (user_stance in ('support', 'oppose')),
  member_vote text,
  matched boolean,
  roll_call_number integer,
  congress integer,
  session_number integer,
  vote_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bill_id, bioguide_id)
);

create index if not exists stance_vote_matches_user_idx
  on public.stance_vote_matches (user_id);

create index if not exists stance_vote_matches_bioguide_idx
  on public.stance_vote_matches (user_id, bioguide_id);

alter table public.stance_vote_matches enable row level security;

drop policy if exists "Users read own vote matches" on public.stance_vote_matches;
create policy "Users read own vote matches"
  on public.stance_vote_matches for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own vote matches" on public.stance_vote_matches;
create policy "Users insert own vote matches"
  on public.stance_vote_matches for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own vote matches" on public.stance_vote_matches;
create policy "Users update own vote matches"
  on public.stance_vote_matches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own vote matches" on public.stance_vote_matches;
create policy "Users delete own vote matches"
  on public.stance_vote_matches for delete
  using (auth.uid() = user_id);

create or replace function public.get_user_rep_match_scores(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_rows jsonb;
  v_levels jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('politicians', '[]'::jsonb, 'levels', '[]'::jsonb);
  end if;
  if auth.uid() is distinct from v_uid then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_rows
  from (
    select
      bioguide_id,
      max(politician_name) as politician_name,
      max(politician_level) as politician_level,
      count(*)::int as compared,
      count(*) filter (where matched is true)::int as matched_count,
      case
        when count(*) filter (where matched is not null) = 0 then null
        else round(
          (
            count(*) filter (where matched is true)::numeric
            / nullif(count(*) filter (where matched is not null), 0)::numeric
          ) * 100
        )
      end as score
    from public.stance_vote_matches
    where user_id = v_uid
      and member_vote is not null
    group by bioguide_id
    order by score desc nulls last
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  into v_levels
  from (
    select
      coalesce(politician_level, 'federal') as level,
      count(*)::int as compared,
      count(*) filter (where matched is true)::int as matched_count,
      case
        when count(*) filter (where matched is not null) = 0 then null
        else round(
          (
            count(*) filter (where matched is true)::numeric
            / nullif(count(*) filter (where matched is not null), 0)::numeric
          ) * 100
        )
      end as score
    from public.stance_vote_matches
    where user_id = v_uid
      and member_vote is not null
    group by coalesce(politician_level, 'federal')
  ) t;

  return jsonb_build_object('politicians', v_rows, 'levels', v_levels);
end;
$$;

revoke all on function public.get_user_rep_match_scores(uuid) from public;
grant execute on function public.get_user_rep_match_scores(uuid) to authenticated;
