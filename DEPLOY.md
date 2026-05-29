# Deploy

Production runs on a Zomro VPS (Ubuntu 24.04) in **polling mode** under `pm2`.
No webhook, no reverse proxy, no domain — Telegraf long-polls Telegram directly.

## Why polling (not webhook)

Webhook needs a public HTTPS endpoint (domain + TLS + reverse proxy). On a plain
VPS that's avoidable overhead. Polling has ~100ms extra latency, irrelevant for
this bot's traffic. Render forced webhook (web services must bind a port and be
publicly reachable); the VPS does not.

`src/index.ts` auto-selects the mode: if `WEBHOOK_DOMAIN` is empty and
`RENDER_EXTERNAL_HOSTNAME` is unset, it runs `bot.launch()` (polling). Leave
`WEBHOOK_DOMAIN` empty in the VPS `.env`.

## First deploy

```bash
ssh root@<vps-ip>

# Toolchain (already present on this VPS)
node --version            # v22.x
pm2 --version
npm install -g pnpm@9.12.0  # if pnpm missing

# Clone (private repo: use HTTPS + PAT or a deploy key)
cd ~
git clone https://github.com/dxnght/uid-verifier.git
cd uid-verifier
pnpm install --frozen-lockfile

# Env
cp .env.example .env
chmod 600 .env
# Fill values. CRITICAL: leave WEBHOOK_DOMAIN empty (selects polling).
# Set PORT to a free port if another service uses 3000.

# Detach any old webhook (e.g. leftover from a previous Render deploy)
# In a browser: https://api.telegram.org/bot<TOKEN>/deleteWebhook?drop_pending_updates=true

# Smoke test in foreground
pnpm start
# Expect: [bot] polling telegram, http listening :<PORT> (env: production)
# Send /start in Telegram, confirm reply, then Ctrl+C

# Run under pm2
pm2 start npm --name uid-verifier -- start
pm2 logs uid-verifier        # confirm startup
pm2 status

# Persist across reboot
pm2 save
pm2 startup                  # run the command it prints (sets up systemd unit)
```

## Updating to a new version

```bash
cd ~/uid-verifier
git pull
pnpm install --frozen-lockfile   # only if deps changed
pm2 restart uid-verifier
pm2 logs uid-verifier --lines 20 # confirm clean restart
```

## Operations

- Logs: `pm2 logs uid-verifier` (live) / `pm2 logs uid-verifier --lines 100`
- Restart: `pm2 restart uid-verifier`
- Stop: `pm2 stop uid-verifier`
- Status / memory / uptime: `pm2 status`
- After VPS reboot: pm2 auto-starts the process if `pm2 save` + `pm2 startup` were done

## Notes

- `.env` lives only on the server, `chmod 600`, never committed. Back it up
  separately (encrypted) — it is not in git.
- The HTTP server still binds `PORT` even in polling mode (health endpoint).
  Harmless on VPS; just ensure the port doesn't clash with the other bot.
- The `punycode` DeprecationWarning in logs comes from a transitive Supabase SDK
  dependency, not our code. Safe to ignore.
- Supabase and Telegram credentials are unchanged from the Render setup; only
  `WEBHOOK_DOMAIN` (now empty) and `PORT` differ.
