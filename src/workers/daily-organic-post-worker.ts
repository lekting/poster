import { decryptText } from '../shared/crypto.js';
import { AppServices } from '../services/index.js';
import { logger } from '../shared/logger.js';

const CREDENTIALS_DELIMITER = '\x00';

export class DailyOrganicPostWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;

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
    try {
      const accounts = await this.services.accountService.getAccountsDueForOrganicPost(
        'x',
        this.minAgeMs
      );
      for (const account of accounts) {
        await this.processAccount(account);
      }
    } catch (err) {
      logger.error({ err }, 'Daily organic post worker tick error');
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
    if (account.useCamoufox !== 1 || !account.encryptedCamoufoxCredentials) {
      logger.debug({ accountId: account.id }, 'Skipping organic post: no Camoufox credentials');
      return;
    }

    const persona = account.persona;
    let text: string;
    try {
      text = await this.services.llmService.generateOrganicPost({
        personaName: persona?.name ?? 'Default',
        personaSystemPrompt: persona?.systemPrompt ?? null,
        categoryName: account.category?.name ?? null
      });
    } catch (err) {
      logger.error({ err, accountId: account.id }, 'LLM organic post generation failed');
      return;
    }

    const creds = decryptText(account.encryptedCamoufoxCredentials);
    const [email, password] = creds.split(CREDENTIALS_DELIMITER);
    if (!email || !password) {
      logger.warn({ accountId: account.id }, 'Invalid Camoufox credentials for organic post');
      return;
    }

    try {
      const result = await this.services.xCamoufoxService.postTweet({ email, password, text });
      if (result.success) {
        await this.services.accountService.setLastOrganicPostAt(account.id, new Date());
        logger.info(
          { accountId: account.id, handle: account.handle },
          'Organic post published via Camoufox'
        );
      } else {
        logger.warn({ accountId: account.id, error: result.error }, 'Organic post via Camoufox failed');
      }
    } catch (err) {
      logger.error({ err, accountId: account.id }, 'Organic post publish failed');
    }
  }
}
