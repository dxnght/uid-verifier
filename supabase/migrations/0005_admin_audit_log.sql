-- 0005_admin_audit_log.sql
-- Audit trail for admin actions.
-- Apply manually in Supabase SQL Editor.

create table if not exists admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  actor_tg_id   bigint not null,
  action        text not null,
  args          text,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_log_community_idx
  on admin_audit_log (community_id, created_at desc);

create index if not exists admin_audit_log_actor_idx
  on admin_audit_log (actor_tg_id);