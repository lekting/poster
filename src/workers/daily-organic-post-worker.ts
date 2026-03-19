import { decryptText } from '../shared/crypto.js';
import { AppServices } from '../services/index.js';
import { logger } from '../shared/logger.js';

export class DailyOrganicPostWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly services: AppServices,
    private readonly intervalMs: number,
    private readonly minAgeMs: number
  ) {}

  start(): void {
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
    logger.info(
      { intervalMs: this.intervalMs, minAgeMs: this.minAgeMs },
      'Daily organic post worker started'
    );
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Daily organic post worker stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug('Organic post tick skipped — previous tick still running');
      return;
    }
    this.running = true;
    try {
      const accounts = await this.services.accountService.getAccountsDueForOrganicPost(
        'x',
        this.minAgeMs
      );
      if (accounts.length === 0) return;

      logger.info({ count: accounts.length }, 'Organic post tick: found accounts due');

      for (const account of accounts) {
        await this.processAccount(account);
      }

      logger.info({ count: accounts.length }, 'Organic post tick: finished batch');
    } catch (err) {
      logger.error({ err }, 'Daily organic post worker tick error');
    } finally {
      this.running = false;
    }
  }

  private async processAccount(account: {
    id: string;
    handle: string;
    encryptedCamoufoxCredentials: string | null;
    useCamoufox: number;
    persona?: { name: string; systemPrompt: string | null } | null;
    category?: { name: string } | null;
  }): Promise<void> {
    const handle = account.handle;

    if (account.useCamoufox !== 1 || !account.encryptedCamoufoxCredentials) {
      logger.debug({ accountId: account.id, handle }, 'Skipping organic post: no Camoufox credentials');
      return;
    }

    // Mark timestamp early to prevent re-pick on next tick
    await this.services.accountService.setLastOrganicPostAt(account.id, new Date());

    const persona = account.persona;
    let text: string;
    try {
      logger.info({ accountId: account.id, handle }, 'Generating organic post text via LLM');
      text = await this.services.llmService.generateOrganicPost({
        personaName: persona?.name ?? 'Default',
        personaSystemPrompt: persona?.systemPrompt ?? null,
        categoryName: account.category?.name ?? null
      });
      logger.info({ accountId: account.id, handle, textLength: text.length, generatedText: text }, 'LLM organic text generated');
    } catch (err) {
      logger.error({ err, accountId: account.id, handle }, 'LLM organic post generation failed');
      return;
    }

    const authToken = decryptText(account.encryptedCamoufoxCredentials);
    if (!authToken) {
      logger.warn({ accountId: account.id, handle }, 'Empty auth token for organic post');
      return;
    }

    try {
      logger.info({ accountId: account.id, handle }, 'Launching browser for organic post');
      const result = await this.services.xCamoufoxService.postTweet({ authToken, text });
      if (result.success) {
        logger.info({ accountId: account.id, handle }, 'Organic post published');
      } else {
        logger.warn({ accountId: account.id, handle, error: result.error }, 'Organic post failed');
      }
    } catch (err) {
      logger.error({ err, accountId: account.id, handle }, 'Organic post publish crashed');
    }
  }
}
