-- 0004_verifications_per_exchange.sql
-- Allow one verification per (user, community, EXCHANGE) instead of
-- one per (user, community). Lets a member verify on Binance AND Bybit.
--
-- Apply manually in the Supabase SQL Editor.
--
-- NOTE: confirm the existing constraint name first. If 0001 was applied as
-- written, Postgres auto-named the inline `unique (user_tg_id, community_id)`
-- as `verifications_user_tg_id_community_id_key`. Verify with:
--   select conname from pg_constraint
--   where conrelid = 'verifications'::regclass and contype = 'u';
-- and adjust the DROP line below if the name differs.

alter table verifications
  drop constraint verifications_user_tg_id_community_id_key;

alter table verifications
  add constraint verifications_user_community_exchange_key
  unique (user_tg_id, community_id, exchange);
