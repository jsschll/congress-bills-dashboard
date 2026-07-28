-- Expand notifications for critical / digest / neighborhood delivery.

alter table public.notifications
  drop constraint if exists notifications_matched_kind_check;

alter table public.notifications
  add constraint notifications_matched_kind_check
  check (
    matched_kind in (
      'policy_area',
      'keyword',
      'critical',
      'digest',
      'neighborhood'
    )
  );

alter table public.notifications
  add column if not exists category text;

alter table public.notifications
  add column if not exists email_sent_at timestamptz;

update public.notifications
set category = coalesce(
  category,
  case
    when matched_kind in ('critical', 'digest', 'neighborhood') then matched_kind
    else 'topic'
  end
)
where category is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_category_check'
  ) then
    alter table public.notifications
      add constraint notifications_category_check
      check (
        category in ('topic', 'critical', 'digest', 'neighborhood')
      );
  end if;
end $$;

alter table public.notifications
  alter column category set default 'topic';

alter table public.profiles
  add column if not exists last_digest_sent_at timestamptz;

create index if not exists notifications_email_pending_idx
  on public.notifications (created_at desc)
  where email_sent_at is null
    and category in ('critical', 'digest');
