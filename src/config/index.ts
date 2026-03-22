import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

function read(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function readNumber(name: string): number | undefined {
  const value = read(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBool(name: string): boolean | undefined {
  const value = read(name);
  if (value === undefined) return undefined;
  return value === 'true' || value === '1';
}

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PROJECT_NAME: z.string().min(1).default('Qwebek'),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_BOT_USERNAME: z.string().min(1).default('QwebekBot'),

  DATABASE_PATH: z.string().min(1).default('./data/qwebek.sqlite'),

  /** LLM provider: 'openai' (default) or 'openrouter' */
  LLM_PROVIDER: z.enum(['openai', 'openrouter']).default('openai'),
  OPENAI_API_KEY: z.string().default(''),
  OPENROUTER_API_KEY: z.string().default(''),
  /** Optional: your site URL shown in OpenRouter rankings */
  OPENROUTER_SITE_URL: z.string().default(''),
  /** LLM models per action. For OpenRouter use format like "anthropic/claude-3.5-sonnet" */
  OPENAI_MODEL_POST_AD: z.string().default('gpt-4o-mini'),
  OPENAI_MODEL_PERSONA: z.string().default('gpt-4o-mini'),
  OPENAI_MODEL_ORGANIC_POST: z.string().default('gpt-4o-mini'),

  ACCOUNT_ENCRYPTION_SECRET: z.string().default(''),

  /** All account operations go through Camoufox browser automation */
  CAMOUFOX_HEADLESS: z.boolean().default(true),

  POST_WORKER_INTERVAL_MS: z.number().int().min(1000).default(5000),
  REG_WORKER_INTERVAL_MS: z.number().int().min(5000).default(30000),
  /** How often to check for accounts due for organic post (ms). Default: 1 hour. */
  ORGANIC_POST_CHECK_INTERVAL_MS: z.number().int().min(60000).default(3600000),
  /** Min time between organic posts per account (ms). Default: 24 hours. */
  ORGANIC_POST_MIN_AGE_MS: z.number().int().min(3600000).default(86400000),

  /** Comma-separated Telegram user IDs allowed to use the bot */
  ADMIN_TELEGRAM_IDS: z.array(z.string().min(1)).default([])
});

function readList(name: string): string[] | undefined {
  const value = read(name);
  if (!value) return undefined;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

const parsed = schema.safeParse({
  NODE_ENV: read('NODE_ENV'),
  PROJECT_NAME: read('PROJECT_NAME'),
  TELEGRAM_BOT_TOKEN: read('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_BOT_USERNAME: read('TELEGRAM_BOT_USERNAME'),
  DATABASE_PATH: read('DATABASE_PATH'),
  LLM_PROVIDER: read('LLM_PROVIDER') as 'openai' | 'openrouter' | undefined,
  OPENAI_API_KEY: read('OPENAI_API_KEY'),
  OPENROUTER_API_KEY: read('OPENROUTER_API_KEY'),
  OPENROUTER_SITE_URL: read('OPENROUTER_SITE_URL'),
  OPENAI_MODEL_POST_AD: read('OPENAI_MODEL_POST_AD'),
  OPENAI_MODEL_PERSONA: read('OPENAI_MODEL_PERSONA'),
  OPENAI_MODEL_ORGANIC_POST: read('OPENAI_MODEL_ORGANIC_POST'),
  ACCOUNT_ENCRYPTION_SECRET: read('ACCOUNT_ENCRYPTION_SECRET'),
  CAMOUFOX_HEADLESS: readBool('CAMOUFOX_HEADLESS'),
  POST_WORKER_INTERVAL_MS: readNumber('POST_WORKER_INTERVAL_MS'),
  REG_WORKER_INTERVAL_MS: readNumber('REG_WORKER_INTERVAL_MS'),
  ORGANIC_POST_CHECK_INTERVAL_MS: readNumber('ORGANIC_POST_CHECK_INTERVAL_MS'),
  ORGANIC_POST_MIN_AGE_MS: readNumber('ORGANIC_POST_MIN_AGE_MS'),
  ADMIN_TELEGRAM_IDS: readList('ADMIN_TELEGRAM_IDS')
});

if (!parsed.success) {
  console.error('Invalid configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export type AppConfig = z.infer<typeof schema>;
export const config: AppConfig = parsed.data;

export function assertRuntimeConfig(): void {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is required to start bot runtime');
    process.exit(1);
  }

  if (
    !config.ACCOUNT_ENCRYPTION_SECRET ||
    config.ACCOUNT_ENCRYPTION_SECRET.length < 8
  ) {
    console.error('ACCOUNT_ENCRYPTION_SECRET (min 8 chars) is required');
    process.exit(1);
  }
}
