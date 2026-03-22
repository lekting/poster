# Qwebek — Project Instructions

## Project Overview

**Qwebek** is a Telegram bot built with TypeScript that automates social media account management, posting campaigns, and organic engagement across X (Twitter) and Threads platforms using browser automation (Camoufox + Playwright). It provides a Telegram conversation interface for managing accounts, running ad campaigns, auto-registering accounts, and generating AI-powered organic content.

Key capabilities:

- Multi-platform account management (X/Twitter, Threads)
- Automated account registration via browser automation
- Ad campaign creation, targeting, and distribution
- AI-powered content generation (ads + organic posts) via OpenAI/OpenRouter
- Persona and category-based account organization
- Encrypted credential storage (AES-256-GCM)
- Background workers for posting, registration, and organic content

## Tech Stack

| Layer              | Technology                                                    |
| ------------------ | ------------------------------------------------------------- |
| Language           | TypeScript 5.x, ESM (`NodeNext`)                             |
| Telegram Bot       | grammY `^1.41`, `@grammyjs/runner`, `@grammyjs/menu`         |
| Database           | SQLite via TypeORM `^0.3` + `better-sqlite3`                  |
| Validation         | Zod `^4`                                                      |
| LLM                | Vercel AI SDK `^6` + `@ai-sdk/openai` (OpenAI / OpenRouter)  |
| Browser Automation | Playwright `^1.58` + `camoufox-js`                            |
| Logging            | Pino `^10` (console + file transport)                         |
| HTTP               | Axios `^1`                                                    |
| Package Manager    | **pnpm only**                                                 |
| Runtime            | Node.js (ES2022)                                              |

---

## Hard Rules

### Package Manager

- **Always use `pnpm`**. Never use `npm` or `yarn`.
- Install: `pnpm add <pkg>` / `pnpm add -D <pkg>`
- Run scripts: `pnpm run <script>` or `pnpm <script>`

### File Size

- **Maximum 800 lines per file.** If a file exceeds this, split it into logical modules.
- Prefer cohesion over arbitrary splits: group by feature/responsibility when splitting.

### No Hardcoded Secrets

- Never commit `.env`, credentials, tokens, or encryption keys.
- All secrets come from environment variables validated via Zod in `src/config/index.ts`.

---

## TypeORM Conventions

### Entities

- One entity per file: `src/db/entities/{name}.entity.ts`.
- Register new entities in `src/db/data-source.ts` (the `entities` array).
- Use class decorators: `@Entity`, `@Column`, `@PrimaryGeneratedColumn('uuid')`, `@Index`.
- Always define non-nullable columns with `!` (strict null checks).
- Use `string | null` for nullable text columns and mark them `nullable: true`.
- Prefer `type: 'text'` for strings.
- Use `integer` (0/1) instead of `boolean` columns for SQLite compatibility.
- Timestamps: use `@CreateDateColumn` / `@UpdateDateColumn`.
- Avoid lazy relations — use explicit `find` with `relations` option.
- Store arrays as JSON text columns (e.g., `targetCategoryIds`, `mediaUrls`).

### Migrations

- Migrations live in `src/db/migrations/`. Naming: `{timestamp}-{description}.ts`.
- **Never modify existing migrations.** Create a new one for schema changes.
- Run: `pnpm db:migrate` / Revert: `pnpm db:revert`.

### Queries

- Use `DataSource` / `Repository` from TypeORM — injected via `buildServices(dataSource)`.
- Prefer `repository.findOne({ where: {...}, relations: [...] })` for simple lookups.
- Use `QueryBuilder` for complex joins/aggregations.
- Always handle `null` from `findOne` explicitly.

---

## GrammyJS Conventions

### Context

- Extended context type is `AppContext` (`src/bot/context.ts`) — always use it, never bare `Context`.
- `ctx.services` — all injected `AppServices` (account, campaign, persona, etc.)
- `ctx.authUserId` — populated by middleware before handlers.

### Handlers & Routing

- Callback query routing is in `src/bot/bot.ts`.
- Callback data uses prefixed patterns (e.g., `account:details:${id}`) for routing.
- Use `bot.use(...)` for middleware — sequentialize and session are already configured.

### Keyboards & Messages

- Keyboard builders: `src/bot/keyboards.ts`.
- Message text formatters: `src/bot/messages.ts`.
- Use `parse_mode: 'HTML'` — never Markdown.
- Escape HTML in user-supplied content with a shared helper.

### Multi-Step Flows

- Multi-step user input flows track state via `BotSession` (`src/bot/session.ts`).
- Session stores `awaitingInput` type and temporary IDs.
- Always clear session state on completion or cancellation.

### Runner

- The bot uses `@grammyjs/runner` for concurrent update processing.
- Do not block the event loop inside handlers — offload heavy work to services/workers.

---

## Architecture

### Dependency Injection

- **No IoC container.** All services are wired manually in `buildServices(dataSource)` (`src/services/index.ts`).
- When adding a new service: create it in `src/services/{feature}/`, add it to `AppServices` interface, and wire it in `buildServices`.

### Services

- Services are plain TypeScript classes with constructor injection.
- One responsibility per service. Large services (>800 lines) must be split.
- Services should not import from `src/bot/` — keep bot layer separate from business logic.

### Workers

- Background workers live in `src/workers/`.
- All workers are started/stopped by `WorkerManager` (`src/workers/worker-manager.ts`).
- Workers use polling loops with configurable intervals — avoid unbounded tight loops.
- Three workers: `PostDistributionWorker`, `AccountRegistrationWorker`, `DailyOrganicPostWorker`.

### Tools (Browser Automation)

- Browser automation tools live in `src/tools/`.
- `XCamoufoxTool` — X/Twitter automation (signup, login, posting, token extraction).
- `ThreadsCamoufoxTool` — Threads automation (login with 2FA/TOTP, cookie persistence, multi-part thread posting).
- Services in `src/services/x-camoufox/` and `src/services/threads-camoufox/` wrap the tools.

### Configuration

- All config is validated at startup via Zod in `src/config/index.ts`.
- Add new env vars to the Zod schema — fail fast if missing.
- Never read `process.env` directly outside `src/config/`.

### Logging

- Use Pino logger from `src/shared/logger.ts` — never use `console.log`.
- Log levels: `error`, `warn`, `info`, `debug`.
- Include structured context: `logger.info({ userId, action }, 'message')`.
- Sensitive paths are automatically redacted (token, secret, password, etc.).

### Encryption

- Use `encryptText()` / `decryptText()` from `src/shared/crypto.ts` for all credential storage.
- Algorithm: AES-256-GCM with SHA-256 key derivation from `ACCOUNT_ENCRYPTION_SECRET`.
- Format: `${iv.hex}:${authTag.hex}:${encrypted.hex}`.
- Never store plaintext credentials in the database.

---

## TypeScript Conventions

- **ESM only** — always use `.js` extensions in import paths (even for `.ts` source files), required by `NodeNext` resolution.
  ```ts
  import { foo } from './foo.js'; // correct
  import { foo } from './foo';    // wrong — breaks NodeNext
  ```
- `experimentalDecorators` and `emitDecoratorMetadata` are enabled (required by TypeORM).
- `noImplicitAny: true`, `strictNullChecks: true` — fix all type errors, never use `any` without explicit justification.
- Import `reflect-metadata` once at the entry point (`src/index.ts`) — do not re-import it elsewhere.
- Prefer `type` imports for type-only symbols: `import type { Foo } from './foo.js'`.

---

## Project Scripts Reference

```bash
pnpm build              # tsc compile src/ → build/
pnpm dev                # build + run via ts-node ESM
pnpm start              # build + run compiled output
pnpm db:migrate         # run TypeORM migrations
pnpm db:revert          # revert last migration
```

---

## File Structure Reference

```
src/
  index.ts                  ← bootstrap (reflect-metadata, DB, services, bot, workers)
  bot/
    context.ts              ← AppContext type
    bot.ts                  ← TelegramBotApp (grammY + runner + handlers)
    session.ts              ← BotSession interface and initial state
    keyboards.ts            ← inline keyboard builders
    messages.ts             ← message text formatters
  config/
    index.ts                ← Zod-validated env config
  db/
    data-source.ts          ← TypeORM DataSource (9 entities, 7 migrations)
    entities/               ← one file per entity
    migrations/             ← timestamped migration files
  services/
    index.ts                ← AppServices interface + buildServices()
    account/                ← PlatformAccount CRUD, credential management
    campaign/               ← Campaign + AdMaterial management
    category/               ← Category CRUD
    persona/                ← Persona CRUD
    user/                   ← TelegramUser management
    post/                   ← AdPost CRUD, status tracking
    registration/           ← Auto-registration queue management
    llm/                    ← LLM integration (ad posts, organic posts, personas)
    mail-tm/                ← Temporary email generation (mail.tm API)
    x-camoufox/             ← X/Twitter browser automation wrapper
    threads-camoufox/       ← Threads browser automation wrapper
    oauth/                  ← OAuth flow (minimal)
  workers/
    worker-manager.ts       ← start/stop all workers
    post-distribution-worker.ts
    account-registration-worker.ts
    daily-organic-post-worker.ts
  tools/
    x-camoufoxe-tool.ts     ← X/Twitter Playwright automation
    threads-camoufox-tool.ts ← Threads Playwright automation
    x-browser.ts            ← X-specific browser helpers
    web.ts                  ← shared web utilities
  shared/
    logger.ts               ← Pino logger (console + file)
    crypto.ts               ← AES-256-GCM encryption
    totp.ts                 ← TOTP/2FA code generation
    media.ts                ← media download and temp file helpers
    concurrency.ts          ← concurrency utilities
    format.ts               ← string formatting helpers
```

---

## Key Patterns

### Adding a New Feature

1. Create service in `src/services/{feature}/{feature}-service.ts`.
2. Add entity + migration if new DB tables are needed.
3. Register entity in `src/db/data-source.ts`.
4. Register service in `AppServices` interface and `buildServices()`.
5. Add callback handlers and keyboard builders in `src/bot/`.
6. Add worker in `src/workers/` if background processing is needed.

### Zod Validation Pattern

```ts
// Always validate at system boundaries (API responses, user input, config)
const schema = z.object({ ... });
const result = schema.safeParse(data);
if (!result.success) {
  logger.warn({ error: result.error }, 'Validation failed');
  return null;
}
```

### LLM Usage Pattern

```ts
// Use LLMService for all AI content generation
// Models are configurable per use case via env vars:
//   OPENAI_MODEL_POST_AD      — ad post generation
//   OPENAI_MODEL_PERSONA      — persona/category generation
//   OPENAI_MODEL_ORGANIC_POST — organic post generation
// Provider: OPENAI or OPENROUTER (configured via LLM_PROVIDER)
```

### Encrypted Credential Pattern

```ts
import { encryptText, decryptText } from '../shared/crypto.js';

// Store credentials
account.encryptedPassword = encryptText(plainPassword);

// Retrieve credentials
const password = decryptText(account.encryptedPassword);
```
