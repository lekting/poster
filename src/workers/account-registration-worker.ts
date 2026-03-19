import { encryptText } from '../shared/crypto.js';
import { AppServices } from '../services/index.js';
import { logger } from '../shared/logger.js';

export class AccountRegistrationWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly services: AppServices,
    private readonly intervalMs: number
  ) {}

  start(): void {
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, 'Account registration worker started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Account registration worker stopped');
    }
  }

  private async tick(): Promise<void> {
    try {
      const task = await this.services.registrationService.getNextPending();
      if (task) {
        await this.processTask(task.id, task.proxyUrl);
      }
    } catch (err) {
      logger.error({ err }, 'Account registration worker tick error');
    }
  }

  private async processTask(taskId: string, proxyUrl: string | null): Promise<void> {
    logger.info({ taskId }, 'Processing registration task');

    // Mark as in_progress immediately so next tick won't pick the same task
    await this.services.registrationService.updateStatus(taskId, 'in_progress');

    try {
      await this.doProcessTask(taskId, proxyUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, taskId }, 'Registration task crashed');
      await this.services.registrationService.updateStatus(taskId, 'failed', {
        errorMessage: msg
      });
    }
  }

  private async doProcessTask(taskId: string, proxyUrl: string | null): Promise<void> {
    // 1. Create temporary email via mail.tm
    let mailAccount: Awaited<ReturnType<typeof this.services.mailTmService.createAccount>>;
    try {
      mailAccount = await this.services.mailTmService.createAccount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ taskId, err }, 'Failed to create mail.tm account');
      await this.services.registrationService.updateStatus(taskId, 'failed', {
        errorMessage: `mail.tm error: ${msg}`
      });
      return;
    }

    // 2. Generate a random X-compatible username (max 15 chars for X)
    const desiredHandle = this.generateXHandle();

    // 3. Save generated credentials to DB (encrypted)
    await this.services.registrationService.setGeneratedCredentials(
      taskId,
      mailAccount.address,
      mailAccount.password,
      desiredHandle
    );

    logger.info(
      { taskId, email: mailAccount.address, handle: desiredHandle },
      'Generated credentials, starting X registration'
    );

    // 4. Register on X via Camoufox with auto-verification via mail.tm
    const result = await this.services.xCamoufoxService.registerAccount({
      email: mailAccount.address,
      password: mailAccount.password,
      username: desiredHandle,
      proxyUrl: proxyUrl ?? undefined,
      getVerificationCode: () =>
        this.services.mailTmService.waitForVerificationCode(mailAccount.token, {
          timeoutMs: 180_000,
          pollIntervalMs: 5_000
        })
    });

    if (result.success && result.handle) {
      if (!result.authToken) {
        await this.services.registrationService.updateStatus(taskId, 'failed', {
          errorMessage: 'Registration succeeded but auth_token was not captured'
        });
        return;
      }

      // 5. Create account record in DB with auth_token
      const account = await this.services.accountService.create({
        platform: 'x',
        handle: result.handle,
        username: result.handle,
        encryptedTokens: null,
        useCamoufox: 1
      });

      await this.services.accountService.setCamoufoxCredentials(
        account.id,
        encryptText(result.authToken)
      );

      // 6. Assign persona and category via LLM
      await this.assignPersonaAndCategory(account.id, result.handle);

      await this.services.registrationService.updateStatus(taskId, 'completed', {
        accountId: account.id
      });

      logger.info(
        { taskId, accountId: account.id, handle: result.handle },
        'Registration completed successfully'
      );
    } else {
      await this.services.registrationService.updateStatus(taskId, 'failed', {
        errorMessage: result.error ?? 'Unknown registration error'
      });
      logger.error({ taskId, error: result.error }, 'X registration failed');
    }
  }

  private generateXHandle(): string {
    const prefixes = [
      'swift', 'dark', 'bright', 'cool', 'tech', 'fast', 'smart', 'bold',
      'fresh', 'wild', 'crisp', 'sharp', 'keen', 'lean', 'pure', 'raw',
      'neo', 'cyber', 'ultra', 'mega'
    ];
    const suffixes = [
      'pixel', 'wave', 'node', 'flux', 'byte', 'spark', 'loop',
      'drift', 'echo', 'grid', 'pulse', 'core', 'edge', 'root'
    ];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]!;
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]!;
    const num = Math.floor(Math.random() * 900 + 100);
    const handle = `${prefix}_${suffix}${num}`;
    return handle.slice(0, 15);
  }

  private async assignPersonaAndCategory(accountId: string, handle: string): Promise<void> {
    try {
      const llmResult = await this.services.llmService.generatePersonaAndCategoryForAccount(handle);
      const persona = await this.services.personaService.findOrCreate({
        name: llmResult.personaName,
        slug: llmResult.personaSlug,
        systemPrompt: llmResult.personaSystemPrompt || null
      });
      const category = await this.services.categoryService.findOrCreate({
        name: llmResult.categoryName,
        slug: llmResult.categorySlug
      });
      await this.services.accountService.assignPersona(accountId, persona.id);
      await this.services.accountService.assignCategory(accountId, category.id);
      logger.info(
        { accountId, persona: persona.name, category: category.name },
        'LLM assigned persona and category'
      );
    } catch (err) {
      logger.warn(
        { err, accountId, handle },
        'Failed to assign persona/category via LLM, account created without them'
      );
    }
  }
}
