# uid-verifier

A Telegram bot that lets crypto communities verify which Telegram users are
registered under their exchange referral.

[Demo on Telegram → @dxngh_uidVerifierBot](https://t.me/dxngh_uidVerifierBot)

## The problem

Crypto communities (alpha groups, trading rooms, signal channels) commonly
gate access on members signing up to an exchange via the community's referral
link. The community earns a share of trading fees in exchange for premium
content.

Two pain points:

1. **No good way to verify membership.** Members claim "yes, I signed up
   under your link" but admins have no quick way to confirm without exporting
   referral lists from the exchange and manually cross-referencing usernames.

2. **Manual onboarding doesn't scale.** A 500-member group means 500 manual
   checks, repeated as people leave and new ones join.

## What this bot does

1. **Auto-installs** when added to a Telegram group (the bot's owner is
   verified as a group admin/creator at install time).
2. **Lets community admins** upload a CSV whitelist of their referral UIDs
   from each exchange (Binance / Bybit / Other) and manage it inline.
3. **Lets members verify** by DM: pick exchange → submit UID → instant
   verified/rejected response. One verification per exchange (a member can
   prove Binance and Bybit separately).
4. **Tracks attempts**, rate-limits brute force (5/hour persistent across
   restarts), and logs every admin action for audit.

It's deliberately small. The whitelist mechanism IS the verification: the bot
doesn't talk to exchange APIs directly. That's the natural next step when a
real installation calls for it.

## Demo

[Loom: 2-minute product walkthrough →](#)
[Loom: live demo, group install to verified member →](#)

Quick visual:

| User flow                                       | Admin flow                                                     |
| ----------------------------------------------- | -------------------------------------------------------------- |
| /verify → pick exchange → submit UID → verified | /admin_whitelist_import → upload CSV → 247 imported, 3 invalid |
| /status → ✅ Binance, ✅ Bybit                  | /admin_stats → counts, exports                                 |

## Stack

- TypeScript (strict, ESM) on Node 22
- [Telegraf 4.x](https://telegraf.js.org) for the Telegram layer
- [Supabase](https://supabase.com) (Postgres) for persistent state
- [Upstash Redis](https://upstash.com) for persistent rate-limiting
- Hosted on a single VPS under `pm2`, polling mode (no webhook, no reverse
  proxy needed)

## Try it locally

```bash
git clone https://github.com/dxnght/uid-verifier.git
cd uid-verifier
pnpm install

cp .env.example .env
# Fill in BOT_TOKEN (from @BotFather), SUPABASE_URL + key, and (optional)
# UPSTASH_REDIS_REST_URL + token for persistent rate-limit

# Apply schema migrations in order: paste each .sql from supabase/migrations/
# into Supabase SQL Editor

pnpm typecheck   # strict TS, zero errors expected
pnpm lint        # ESLint with @stylistic + typescript-eslint
pnpm dev         # polling mode, auto-reload
```

For production deploy notes (VPS + pm2): [`DEPLOY.md`](./DEPLOY.md).

## Commands reference

**Members (DM with bot):**

- `/start` — onboarding
- `/verify` — verify your exchange UID
- `/status` — show your current verifications
- `/help`, `/cancel`

**Group:**

- `/start`, `/verify` — both redirect to DM (verification is private)

**Admins (DM, operator or community admin only):**

- `/admin_stats` — verification + whitelist counts
- `/admin_whitelist_add <exchange> <uid>` — add one UID
- `/admin_whitelist_remove <exchange> <uid>` — remove one UID
- `/admin_whitelist_check <exchange> <uid>` — presence lookup
- `/admin_whitelist_import` — upload CSV (`exchange,uid` format)
- `/admin_whitelist_export` — download whitelist as CSV
- `/admin_export` — download verification records as CSV
- `/admin_reset <user_tg_id>` — clear a user's verification + rate-limit
- `/admin_audit [limit]` — show recent admin actions
- `/admin_help` — full admin command list

## Status

Production-deployed (single community demo). Multi-exchange verification,
admin tooling, audit log, persistent rate-limiting all working.

Not yet in scope:

- Exchange API integration for real ownership proof (the natural upsell)
- Group membership gating (kick / restrict unverified users)
- Web admin panel
- Test suite

These are deliberate omissions — they get built when a real customer needs
them, not before.

## License

MIT.

## Contact

Built by **dxnght** — TypeScript / Web3 / AI integration freelancer.

- Telegram: [@dxnght](https://t.me/dxnght)
- GitHub: [@dxnght](https://github.com/dxnght)

Open to building similar tooling for your community or product.
