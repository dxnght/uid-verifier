# uid-verifier

Telegram bot that verifies crypto exchange referral UIDs against community-uploaded whitelists. Forked from `bot-template`.

## Stack

- TypeScript (ESM, `tsconfig.json` strict)
- pnpm; Node 20 LTS
- Telegraf 4.16+ — typed via `BotContext` from `src/types.ts`
- Supabase (server-side, service-role key — bypasses RLS)
- `dotenv` for local; Render dashboard injects env in prod
- Render (frankfurt, free plan); webhook mode auto-enabled when `WEBHOOK_DOMAIN` is set OR `RENDER_EXTERNAL_HOSTNAME` is auto-injected (production default). Without either, polling mode. HTTP server always binds `PORT` — Render port-scan requirement and unified health endpoint

## Code conventions

- ESM source: imports omit file extensions (bundler resolution handles it; tsx resolves at runtime): `import { x } from './y'`. Do NOT add `.js` — files are `.ts` and never compiled to separate `.js` output (`noEmit: true`)
- **Single quotes** for all string literals: `'foo'`, not `"foo"`. JSX/HTML attributes inside Telegram message bodies stay double-quoted as part of the content, but TS source uses single quotes everywhere
- **Named exports only.** No `export default` outside framework requirements
- Arrow function declarations: `export const fn = (a: A): R => { ... }`
- Explicit return types on every exported function
- `async/await` — never callbacks, never `.then()` chains in new code
- One file = one responsibility
- Telegraf-free service layer: services in `src/services/` take plain data, return plain data. Telegram I/O stays in `src/flows/`
- Logging: `console.log` / `console.warn` / `console.error` — no pino, no winston
- Error logging idiom: `err instanceof Error ? err.stack : err`
- Prefer `parse_mode: "HTML"` over Markdown; escape user-controlled strings with `escapeHtml` from `src/utils/format.ts`

## TypeScript rules

- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`. Always guard
- `strictNullChecks: true` — return types use explicit `| null`, never implicit
- `noUnusedLocals` / `noUnusedParameters: true` — remove before commit
- Domain types in `src/types.ts`. `BotContext` extends Telegraf `Context` with typed `state`

## File layout

- `src/index.ts` — entry; signals; webhook-vs-polling branch
- `src/bot.ts` — Telegraf factory, middleware + flow wiring
- `src/env.ts` — typed env loader (fail-fast on missing required)
- `src/db.ts` — Supabase client + typed query helpers
- `src/types.ts` — domain types + `BotContext`
- `src/middlewares/` — Telegraf middlewares
- `src/flows/` — user-facing flows; one file per logical flow, exports `registerXxxFlow(bot)`. Multi-step flows are Telegraf `BaseScene` exported via `build<Name>Scene()`; scene session shape extends `Scenes.SceneSessionData` and is declared in `src/types.ts`. Admin-only flows wrap every handler with a DM+auth gate (`isAdmin(ctx.from.id, ctx.state.community)`) — never expose admin actions in groups
- `src/services/` — Telegraf-free business logic. `services/auth.ts` is the single source of truth for who can do what
- `src/utils/` — pure helpers
- `supabase/migrations/` — numbered SQL files (`0001_*.sql`), applied manually in Supabase SQL Editor

## Commands

- `pnpm check` — runs `typecheck` + `lint`. Must pass with zero errors before every commit
- `pnpm typecheck` — TypeScript only (faster, for quick sanity checks)
- `pnpm lint` — ESLint only (`pnpm lint:fix` to auto-fix)
- `pnpm dev` — polling mode locally (auto-reload)
- `pnpm start` — production entry (used by Render)

## Don'ts

- Don't add dependencies without asking first (template is intentionally minimal)
- Don't introduce zod, pino, express, axios — current deps are sufficient
- Don't commit `.env` (it's gitignored, keep it that way)
- Don't bypass typecheck with `@ts-ignore` or `as any` — if you reach for either, stop and surface the problem
- Don't change `tsconfig.json` strictness flags
- Don't refactor the template structure without a stated reason
- Don't touch `BotFather`, Supabase dashboard, or Render dashboard — those are manual human steps

## Working with the human

- Architectural decisions happen in chat (claude.ai), not here. If a task requires choosing between approaches, stop and summarize the options
- Apply changes faithfully to the spec. If the spec is ambiguous, ask
- After applying changes: run `pnpm typecheck` and report the result
- Commit messages: imperative mood, scope-prefixed. Examples: `feat(flows): add verify flow`, `fix(db): handle null username in upsertUser`
