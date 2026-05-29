-- 0003_add_verifications_users_fkey.sql
-- Add the missing foreign key from verifications.user_tg_id to users.tg_id.
--
-- Without this FK, Supabase PostgREST cannot resolve the join used by
-- listVerifications: `select('..., users(username)')` returns
-- "Could not find a relationship between 'verifications' and 'users'".
--
-- Apply this manually in the Supabase SQL Editor.

alter table verifications
  add constraint verifications_user_tg_id_fkey
  foreign key (user_tg_id) references users(tg_id) on delete cascade;
