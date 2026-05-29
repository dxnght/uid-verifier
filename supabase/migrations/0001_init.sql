-- 0001_init.sql
-- UID Verifier — initial schema

create extension if not exists pgcrypto;

create table if not exists communities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  chat_id       bigint unique,
  admin_tg_id   bigint not null,
  ref_code      text,
  exchanges     text[] not null default array['binance','bybit']::text[],
  created_at    timestamptz not null default now()
);

create index if not exists communities_admin_idx on communities (admin_tg_id);

create table if not exists users (
  tg_id         bigint primary key,
  username      text,
  first_name    text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists whitelist (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  uid           text not null,
  exchange      text not null check (exchange in ('binance','bybit','other')),
  added_at      timestamptz not null default now(),
  unique (community_id, exchange, uid)
);

create index if not exists whitelist_lookup_idx on whitelist (community_id, exchange, uid);

create table if not exists verifications (
  id            uuid primary key default gen_random_uuid(),
  user_tg_id    bigint not null,
  community_id  uuid not null references communities(id) on delete cascade,
  uid           text not null,
  exchange      text not null check (exchange in ('binance','bybit','other')),
  status        text not null check (status in ('verified','rejected','pending')),
  attempted_at  timestamptz not null default now(),
  unique (user_tg_id, community_id)
);

create index if not exists verifications_community_idx on verifications (community_id);
create index if not exists verifications_user_idx on verifications (user_tg_id);
