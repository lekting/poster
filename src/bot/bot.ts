import { run, RunnerHandle } from '@grammyjs/runner';
import { Bot, session } from 'grammy';
import { config } from '../config/index.js';
import { AppServices } from '../services/index.js';
import { AppContext } from './context.js';
import { registerAllHandlers } from './handlers/index.js';
import { initialSession } from './session.js';
import { logger } from '../shared/logger.js';

export class TelegramBotApp {
  private readonly bot: Bot<AppContext>;
  private runner: RunnerHandle | null = null;

  constructor(private readonly services: AppServices) {
    this.bot = new Bot<AppContext>(config.TELEGRAM_BOT_TOKEN);

    // Default parse_mode = HTML for all outgoing text
    this.bot.api.config.use((prev, method, payload, signal) => {
      const textMethods = ['sendMessage', 'editMessageText'];
      if (textMethods.includes(method)) {
        (payload as Record<string, unknown>).parse_mode ??= 'HTML';
      }
      return prev(method, payload, signal);
    });

    // Session middleware
    this.bot.use(session({ initial: initialSession }));

    // Session migration: reset if shape is stale
    this.bot.use(async (ctx, next) => {
      if (ctx.session && !Array.isArray(ctx.session.navStack)) {
        Object.assign(ctx.session, initialSession());
      }
      await next();
    });

    // Auth middleware — attach services + resolve user
    this.bot.use(async (ctx, next) => {
      ctx.services = this.services;
      ctx.authUserId = null;
      if (ctx.from) {
        const user = await this.services.userService.ensureUser({
          telegramId: String(ctx.from.id),
          username: ctx.from.username ?? null,
          firstName: ctx.from.first_name ?? null,
          lastName: ctx.from.last_name ?? null,
        });
        ctx.authUserId = user.id;
      }
      await next();
    });

    // Register all handlers (commands, text, callbacks)
    registerAllHandlers(this.bot);

    // Error boundary
    this.bot.catch((err) => {
      logger.error({ err: err.error, update: err.ctx.update }, 'Bot error boundary');
      err.ctx.reply('An error occurred. Type /start to restart.').catch(() => {});
    });
  }

  getBot(): Bot<AppContext> {
    return this.bot;
  }

  start(): void {
    this.runner = run(this.bot);
    logger.info('Telegram bot started');
  }

  async stop(): Promise<void> {
    if (this.runner) {
      await this.runner.stop();
      this.runner = null;
      logger.info('Telegram bot stopped');
    }
  }
}
