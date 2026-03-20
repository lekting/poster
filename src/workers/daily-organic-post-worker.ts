import { decryptText, encryptText } from '../shared/crypto.js';
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
    this.tick(); // Immediate start
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
      const xAccounts =
        await this.services.accountService.getAccountsDueForOrganicPost(
          'x',
          this.minAgeMs
        );
      const threadsAccounts =
        await this.services.accountService.getAccountsDueForOrganicPost(
          'threads',
          this.minAgeMs
        );
      const accounts = [...xAccounts, ...threadsAccounts];
      if (accounts.length === 0) return;

      logger.info(
        { count: accounts.length },
        'Organic post tick: found accounts due'
      );

      for (const account of accounts) {
        await this.processAccount(account);
      }

      logger.info(
        { count: accounts.length },
        'Organic post tick: finished batch'
      );
    } catch (err) {
      logger.error({ err }, 'Daily organic post worker tick error');
    } finally {
      this.running = false;
    }
  }

  private async processAccount(account: {
    id: string;
    platform: string;
    handle: string;
    encryptedCamoufoxCredentials: string | null;
    encryptedPassword: string | null;
    encrypted2faSecret: string | null;
    encryptedCookies: string | null;
    useCamoufox: number;
    persona?: { name: string; systemPrompt: string | null } | null;
    category?: { name: string } | null;
  }): Promise<void> {
    const handle = account.handle;
    const platform = account.platform ?? 'x';

    // Mark timestamp early to prevent re-pick on next tick
    await this.services.accountService.setLastOrganicPostAt(
      account.id,
      new Date()
    );

    if (platform === 'threads') {
      await this.processThreadsOrganic(account);
    } else {
      await this.processXOrganic(account);
    }
  }

  private async processXOrganic(account: {
    id: string;
    handle: string;
    encryptedCamoufoxCredentials: string | null;
    useCamoufox: number;
    persona?: { name: string; systemPrompt: string | null } | null;
    category?: { name: string } | null;
  }): Promise<void> {
    const handle = account.handle;

    if (account.useCamoufox !== 1 || !account.encryptedCamoufoxCredentials) {
      logger.debug(
        { accountId: account.id, handle },
        'Skipping organic post: no Camoufox credentials'
      );
      return;
    }

    const persona = account.persona;
    let text: string;
    try {
      logger.info(
        { accountId: account.id, handle },
        'Generating organic post text via LLM'
      );
      text = await this.services.llmService.generateOrganicPost({
        personaName: persona?.name ?? 'Default',
        personaSystemPrompt: persona?.systemPrompt ?? null,
        categoryName: account.category?.name ?? null
      });
      logger.info(
        {
          accountId: account.id,
          handle,
          textLength: text.length,
          generatedText: text
        },
        'LLM organic text generated'
      );
    } catch (err) {
      logger.error(
        { err, accountId: account.id, handle },
        'LLM organic post generation failed'
      );
      return;
    }

    const authToken = decryptText(account.encryptedCamoufoxCredentials);
    if (!authToken) {
      logger.warn(
        { accountId: account.id, handle },
        'Empty auth token for organic post'
      );
      return;
    }

    try {
      logger.info(
        { accountId: account.id, handle },
        'Launching browser for organic post'
      );
      const result = await this.services.xCamoufoxService.postTweet({
        authToken,
        text
      });
      if (result.success) {
        logger.info(
          { accountId: account.id, handle },
          'Organic post published'
        );
      } else {
        logger.warn(
          { accountId: account.id, handle, error: result.error },
          'Organic post failed'
        );
      }
    } catch (err) {
      logger.error(
        { err, accountId: account.id, handle },
        'Organic post publish crashed'
      );
    }
  }

  private async processThreadsOrganic(account: {
    id: string;
    handle: string;
    encryptedPassword: string | null;
    encrypted2faSecret: string | null;
    encryptedCookies: string | null;
    persona?: { name: string; systemPrompt: string | null } | null;
    category?: { name: string } | null;
  }): Promise<void> {
    const handle = account.handle;

    if (!account.encryptedPassword || !account.encrypted2faSecret) {
      logger.debug(
        { accountId: account.id, handle },
        'Skipping Threads organic post: missing credentials'
      );
      return;
    }

    const persona = account.persona;
    let text: string;
    try {
      logger.info(
        { accountId: account.id, handle },
        'Generating Threads organic post via LLM'
      );
      text = await this.services.llmService.generateThreadsOrganicPost({
        personaName: persona?.name ?? 'Default',
        personaSystemPrompt: persona?.systemPrompt ?? null,
        categoryName: account.category?.name ?? null
      });
      logger.info(
        {
          accountId: account.id,
          handle,
          textLength: text.length,
          generatedText: text
        },
        'LLM Threads organic text generated'
      );
    } catch (err) {
      logger.error(
        { err, accountId: account.id, handle },
        'LLM Threads organic post generation failed'
      );
      return;
    }

    const password = decryptText(account.encryptedPassword);
    const totpSecret = decryptText(account.encrypted2faSecret);
    const cookies = account.encryptedCookies
      ? JSON.parse(decryptText(account.encryptedCookies))
      : undefined;

    try {
      logger.info(
        { accountId: account.id, handle },
        'Launching browser for Threads organic post'
      );
      const result = await this.services.threadsCamoufoxService.postThread({
        parts: [text],
        username: handle,
        password,
        totpSecret,
        cookies
      });

      // Save updated cookies
      if (result.cookies && result.cookies.length > 0) {
        await this.services.accountService.setCookies(
          account.id,
          encryptText(JSON.stringify(result.cookies))
        );
      }

      if (result.success) {
        logger.info(
          { accountId: account.id, handle },
          'Threads organic post published'
        );
      } else {
        logger.warn(
          { accountId: account.id, handle, error: result.error },
          'Threads organic post failed'
        );
      }
    } catch (err) {
      logger.error(
        { err, accountId: account.id, handle },
        'Threads organic post publish crashed'
      );
    }
  }
}
