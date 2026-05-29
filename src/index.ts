import http from 'node:http';
import { buildBot } from './bot';
import { env } from './env';

/**
 * Resolve the webhook domain in priority order:
 *  1. Explicit WEBHOOK_DOMAIN (override for non-Render platforms or local tunnels)
 *  2. RENDER_EXTERNAL_HOSTNAME (auto-injected by Render — production default)
 *  3. Empty string → polling mode
 */
const resolveWebhookDomain = (): string => {
  if (env.WEBHOOK_DOMAIN.length > 0) return env.WEBHOOK_DOMAIN;
  const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME?.trim();
  return renderHost && renderHost.length > 0 ? renderHost : '';
};

type WebhookHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => Promise<void>;

const main = async (): Promise<void> => {
  const bot = buildBot();
  let server: http.Server | null = null;

  const shutdown = (signal: string): void => {
    console.log(`[bot] received ${signal}, stopping...`);
    bot.stop(signal);
    if (server) {
      server.close(() => process.exit(0));
      // Force exit if server.close hangs on open connections.
      setTimeout(() => process.exit(0), 5_000).unref();
    } else {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[bot] unhandled rejection:', reason);
    process.exit(1);
  });

  const webhookDomain = resolveWebhookDomain();
  const useWebhook = webhookDomain.length > 0;
  const hookPath = useWebhook ? `/telegraf/${env.BOT_TOKEN}` : '';

  let webhookCallback: WebhookHandler | null = null;
  if (useWebhook) {
    const webhookOpts: { domain: string; path: string; secret_token?: string } = {
      domain: webhookDomain,
      path: hookPath,
    };
    if (env.WEBHOOK_SECRET) webhookOpts.secret_token = env.WEBHOOK_SECRET;
    webhookCallback = await bot.createWebhook(webhookOpts);
  }

  // HTTP server always runs — Render web services require a bound port for
  // health probes. In polling mode it only serves /health; in webhook mode it
  // additionally routes Telegram deliveries.
  server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (
      useWebhook &&
      webhookCallback &&
      req.method === 'POST' &&
      req.url === hookPath
    ) {
      void webhookCallback(req, res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  server.listen(env.PORT, () => {
    if (useWebhook) {
      console.log(
        `[bot] webhook on ${webhookDomain}${hookPath}, http listening :${env.PORT}`,
      );
    } else {
      console.log(
        `[bot] polling telegram, http listening :${env.PORT} (env: ${env.NODE_ENV})`,
      );
    }
  });

  if (!useWebhook) {
    // Polling alongside the HTTP server. Fire-and-forget — bot.launch only
    // resolves on stop, and the server keeps the process alive.
    bot.launch().catch((err: unknown) => {
      console.error(
        '[bot] polling failed:',
        err instanceof Error ? err.stack : err,
      );
      process.exit(1);
    });
  }
};

main().catch((err: unknown) => {
  console.error('[bot] startup failed:', err);
  process.exit(1);
});
