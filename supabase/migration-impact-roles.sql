-- Roles used by the pocketbook impact estimator (audience matching).
-- Run after migration-pocketbook-and-votes.sql.

alter table public.profiles
  add column if not exists impact_roles text[] not null default '{}'::text[];
