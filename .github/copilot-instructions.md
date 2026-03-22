# Qwebek — Copilot Instructions

## Project Overview

Qwebek is a Telegram bot (TypeScript, ESM) that automates social media account management, ad campaign distribution, and organic content generation across X (Twitter) and Threads using browser automation (Camoufox + Playwright). Users interact via a Telegram conversation interface.

## Tech Stack

- **Language:** TypeScript 5.x with ES modules (`NodeNext` resolution)
- **Bot:** grammY, @grammyjs/runner, @grammyjs/menu
- **Database:** SQLite via TypeORM 0.3 + better-sqlite3
- **Validation:** Zod 4
- **LLM:** Vercel AI SDK + @ai-sdk/openai (OpenAI / OpenRouter)
- **Browser:** Playwright + camoufox-js
- **Logging:** Pino
- **Package Manager:** pnpm (never npm or yarn)

## Critical Conventions

### ESM Imports

Always use `.js` extensions in import paths, even for `.ts` source files. This is required by `NodeNext` module resolution:

```ts
import { foo } from './foo.js';       // correct
import { foo } from './foo';          // WRONG
import type { Bar } from './bar.js';  // type-only imports
```

### TypeORM Entities

- One entity per file in `src/db/entities/`.
- Register new entities in `src/db/data-source.ts`.
- Use `integer` (0/1) instead of `boolean` for SQLite compatibility.
- Use `type: 'text'` for string columns.
- Store arrays as JSON text columns.
- Never modify existing migrations — create new ones.

### GrammyJS Bot

- Always use `AppContext` from `src/bot/context.ts`, never bare `Context`.
- Access services via `ctx.services` (e.g., `ctx.services.accountService`).
- Use `parse_mode: 'HTML'` — never Markdown.
- Escape user content with the shared `escapeHtml` helper.
- Multi-step flows use session state (`awaitingInput` pattern in `src/bot/session.ts`).

### Service Architecture

- Services are plain classes with constructor injection via `buildServices(dataSource)` in `src/services/index.ts`.
- No IoC container — manual wiring.
- Services must NOT import from `src/bot/` — keep bot and business logic separate.
- New services: create in `src/services/{feature}/`, add to `AppServices` interface, wire in `buildServices()`.

### Configuration

- All env vars validated via Zod in `src/config/index.ts`.
- Never read `process.env` directly outside `src/config/`.
- Add new env vars to the Zod schema — fail fast if missing.

### Logging

- Use Pino logger from `src/shared/logger.ts` — never `console.log`.
- Structured logging: `logger.info({ userId, action }, 'message')`.
- Sensitive data (tokens, secrets, passwords) is auto-redacted.

### Encryption

- All credentials stored encrypted using `encryptText()` / `decryptText()` from `src/shared/crypto.ts`.
- Algorithm: AES-256-GCM.
- Never store plaintext credentials in the database.

### Workers

- Background workers in `src/workers/`, managed by `WorkerManager`.
- Use polling loops with configurable intervals.
- Three workers: post distribution, account registration, daily organic posts.

### Browser Automation Tools

- `src/tools/x-camoufoxe-tool.ts` — X/Twitter automation (Playwright).
- `src/tools/threads-camoufox-tool.ts` — Threads automation (Playwright).
- Services in `src/services/x-camoufox/` and `src/services/threads-camoufox/` wrap the tools.

## TypeScript Rules

- `noImplicitAny: true`, `strictNullChecks: true` — no `any` without justification.
- `experimentalDecorators` and `emitDecoratorMetadata` enabled (TypeORM requirement).
- Import `reflect-metadata` only at entry point (`src/index.ts`).
- Max 800 lines per file — split by feature/responsibility if exceeded.

## File Structure

```
src/
  index.ts              — bootstrap entry point
  bot/                  — Telegram bot (context, handlers, keyboards, messages, session)
  config/               — Zod-validated environment config
  db/entities/          — TypeORM entities (one per file)
  db/migrations/        — timestamped migration files
  services/             — business logic (account, campaign, category, persona, user, post,
                          registration, llm, mail-tm, x-camoufox, threads-camoufox, oauth)
  workers/              — background workers (posting, registration, organic content)
  tools/                — Playwright browser automation tools
  shared/               — logger, crypto, totp, media, format utilities
```

## Scripts

```bash
pnpm build          # compile TypeScript
pnpm dev            # build + run with ts-node
pnpm start          # build + run compiled output
pnpm db:migrate     # run TypeORM migrations
pnpm db:revert      # revert last migration
```

## Adding a New Feature

1. Create service in `src/services/{feature}/{feature}-service.ts`.
2. Add entity + migration if new DB tables needed; register entity in `data-source.ts`.
3. Add service to `AppServices` interface and `buildServices()`.
4. Add bot handlers, keyboards, and message formatters in `src/bot/`.
5. Add worker in `src/workers/` if background processing is needed.
