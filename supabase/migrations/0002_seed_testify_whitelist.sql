-- 0002_seed_testify_whitelist.sql
-- Seed UID whitelist for the Testify_uid demo community.
-- community_id is the one auto-registered when the bot was added to the group.

insert into whitelist (community_id, uid, exchange) values
  (<community_id>, '12345678', 'binance'),
  (<community_id>, '87654321', 'binance'),
  (<community_id>, '99887766', 'binance'),
  (<community_id>, '11122233', 'bybit'),
  (<community_id>, '44455566', 'bybit'),
  (<community_id>, '77788899', 'other')
on conflict (community_id, exchange, uid) do nothing;
