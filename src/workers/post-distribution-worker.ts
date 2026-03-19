import { decryptText } from '../shared/crypto.js';
import { AppServices } from '../services/index.js';
import { logger } from '../shared/logger.js';

const CREDENTIALS_DELIMITER = '\x00';

export class PostDistributionWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;

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
    try {
      const pending = await this.services.postService.getPending();
      for (const post of pending) {
        await this.processPost(post);
      }
    } catch (err) {
      logger.error({ err }, 'Post distribution worker tick error');
    }
  }

  private async processPost(post: {
    id: string;
    campaign: { materials?: Array<{ content: string | null; mediaUrls: string | null }> };
    account: {
      id: string;
      encryptedCamoufoxCredentials: string | null;
      useCamoufox: number;
      handle: string;
      persona?: { name: string; systemPrompt: string | null } | null;
    };
  }): Promise<void> {
    const materials = post.campaign.materials ?? [];
    const textMaterial = materials.find((m) => m.content)?.content ?? '';
    if (!textMaterial) {
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: 'No ad content in campaign'
      });
      return;
    }

    const persona = post.account.persona;
    let generatedText: string;
    try {
      generatedText = await this.services.llmService.generatePostText({
        adContent: textMaterial,
        personaName: persona?.name ?? 'Default',
        personaSystemPrompt: persona?.systemPrompt ?? null,
        platform: 'x'
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, postId: post.id }, 'LLM post generation failed');
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: `LLM: ${msg}`
      });
      return;
    }

    if (post.account.useCamoufox !== 1 || !post.account.encryptedCamoufoxCredentials) {
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: 'Account has no Camoufox credentials'
      });
      return;
    }

    const creds = decryptText(post.account.encryptedCamoufoxCredentials);
    const [email, password] = creds.split(CREDENTIALS_DELIMITER);
    if (!email || !password) {
      await this.services.postService.updateStatus(post.id, 'failed', {
        generatedText,
        errorMessage: 'Invalid Camoufox credentials format'
      });
      return;
    }

    try {
      const result = await this.services.xCamoufoxService.postTweet({
        email,
        password,
        text: generatedText
      });
      if (result.success) {
        await this.services.postService.updateStatus(post.id, 'posted', {
          generatedText,
          postedAt: new Date(),
          externalId: result.tweetId
        });
        logger.info({ postId: post.id, tweetId: result.tweetId, handle: post.account.handle }, 'Post published via Camoufox');
      } else {
        await this.services.postService.updateStatus(post.id, 'failed', {
          generatedText,
          errorMessage: result.error
        });
        logger.warn({ postId: post.id, error: result.error }, 'Camoufox post failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, postId: post.id }, 'Post publish failed');
      await this.services.postService.updateStatus(post.id, 'failed', {
        generatedText,
        errorMessage: msg
      });
    }
  }
}
