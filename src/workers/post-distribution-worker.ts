import { decryptText } from '../shared/crypto.js';
import { AppServices } from '../services/index.js';
import { logger } from '../shared/logger.js';

export class PostDistributionWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly services: AppServices,
    private readonly intervalMs: number
  ) {}

  start(): void {
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, 'Post distribution worker started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Post distribution worker stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug('Post distribution tick skipped — previous tick still running');
      return;
    }
    this.running = true;
    try {
      const pending = await this.services.postService.getPending();
      if (pending.length === 0) return;

      logger.info({ count: pending.length }, 'Post distribution tick: found pending posts');

      for (const post of pending) {
        await this.processPost(post);
      }

      logger.info({ count: pending.length }, 'Post distribution tick: finished batch');
    } catch (err) {
      logger.error({ err }, 'Post distribution worker tick error');
    } finally {
      this.running = false;
    }
  }

  private async processPost(post: {
    id: string;
    campaign: { materials?: Array<{ content: string | null; mediaUrls: string | null }> };
    account: {
      id: string;
      isPremium: number;
      encryptedCamoufoxCredentials: string | null;
      useCamoufox: number;
      handle: string;
      persona?: { name: string; systemPrompt: string | null } | null;
    };
  }): Promise<void> {
    const handle = post.account.handle;
    logger.info({ postId: post.id, handle }, 'Processing post');

    // Mark as in_progress immediately so next tick won't pick it up
    await this.services.postService.updateStatus(post.id, 'in_progress');

    const materials = post.campaign.materials ?? [];
    const textMaterial = materials.find((m) => m.content)?.content ?? '';
    if (!textMaterial) {
      logger.warn({ postId: post.id, handle }, 'No ad content in campaign');
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: 'No ad content in campaign'
      });
      return;
    }

    const persona = post.account.persona;
    let generatedText: string;
    try {
      logger.info({ postId: post.id, handle }, 'Generating post text via LLM');
      generatedText = await this.services.llmService.generatePostText({
        adContent: textMaterial,
        personaName: persona?.name ?? 'Default',
        personaSystemPrompt: persona?.systemPrompt ?? null,
        platform: 'x',
        isPremium: post.account.isPremium === 1
      });
      logger.info({ postId: post.id, handle, textLength: generatedText.length, generatedText }, 'LLM text generated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, postId: post.id, handle }, 'LLM post generation failed');
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: `LLM: ${msg}`
      });
      return;
    }

    if (post.account.useCamoufox !== 1 || !post.account.encryptedCamoufoxCredentials) {
      logger.warn({ postId: post.id, handle }, 'Account has no Camoufox credentials');
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: 'Account has no Camoufox credentials'
      });
      return;
    }

    const authToken = decryptText(post.account.encryptedCamoufoxCredentials);
    if (!authToken) {
      logger.warn({ postId: post.id, handle }, 'Empty auth token');
      await this.services.postService.updateStatus(post.id, 'failed', {
        generatedText,
        errorMessage: 'Empty auth token'
      });
      return;
    }

    try {
      logger.info({ postId: post.id, handle }, 'Launching browser to post tweet');
      const result = await this.services.xCamoufoxService.postTweet({
        authToken,
        text: generatedText
      });
      // Persist detected premium status back to account
      if (result.isPremium !== undefined && result.isPremium !== (post.account.isPremium === 1)) {
        await this.services.accountService.setPremium(post.account.id, result.isPremium);
        logger.info({ accountId: post.account.id, handle, isPremium: result.isPremium }, 'Account premium status updated');
      }

      if (result.success) {
        await this.services.postService.updateStatus(post.id, 'posted', {
          generatedText,
          postedAt: new Date(),
          externalId: result.tweetId
        });
        logger.info({ postId: post.id, tweetId: result.tweetId, handle }, 'Post published');
      } else {
        await this.services.postService.updateStatus(post.id, 'failed', {
          generatedText,
          errorMessage: result.error
        });
        logger.warn({ postId: post.id, handle, error: result.error }, 'Post failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, postId: post.id, handle }, 'Post publish crashed');
      await this.services.postService.updateStatus(post.id, 'failed', {
        generatedText,
        errorMessage: msg
      });
    }
  }
}
