import { decryptText, encryptText } from '../shared/crypto.js';
import {
  deleteTempFile,
  downloadToTemp,
  parseMediaUrls
} from '../shared/media.js';
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
      platform: string;
      isPremium: number;
      encryptedCamoufoxCredentials: string | null;
      encryptedPassword: string | null;
      encrypted2faSecret: string | null;
      encryptedCookies: string | null;
      useCamoufox: number;
      handle: string;
      persona?: { name: string; systemPrompt: string | null } | null;
    };
  }): Promise<void> {
    const handle = post.account.handle;
    const platform = post.account.platform ?? 'x';
    logger.info({ postId: post.id, handle, platform }, 'Processing post');

    // Mark as in_progress immediately so next tick won't pick it up
    await this.services.postService.updateStatus(post.id, 'in_progress');

    const materials = post.campaign.materials ?? [];
    const selectedMaterial = materials.find((m) => m.content) ?? null;
    const textMaterial = selectedMaterial?.content ?? '';
    if (!textMaterial) {
      logger.warn({ postId: post.id, handle }, 'No ad content in campaign');
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: 'No ad content in campaign'
      });
      return;
    }

    if (platform === 'threads') {
      await this.processThreadsPost(post, textMaterial, selectedMaterial);
    } else {
      await this.processXPost(post, textMaterial, selectedMaterial);
    }
  }

  private async processXPost(
    post: {
      id: string;
      account: {
        id: string;
        isPremium: number;
        encryptedCamoufoxCredentials: string | null;
        useCamoufox: number;
        handle: string;
        persona?: { name: string; systemPrompt: string | null } | null;
      };
    },
    textMaterial: string,
    selectedMaterial: { content: string | null; mediaUrls: string | null } | null
  ): Promise<void> {
    const handle = post.account.handle;
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

    const mediaUrls = parseMediaUrls(selectedMaterial?.mediaUrls);
    const mediaPaths: string[] = [];
    const failedMediaUrls: string[] = [];

    if (mediaUrls.length > 0) {
      logger.info(
        { postId: post.id, handle, mediaUrls },
        'Downloading media before posting'
      );
      for (const mediaUrl of mediaUrls) {
        const filePath = await downloadToTemp(mediaUrl);
        if (filePath) {
          mediaPaths.push(filePath);
          continue;
        }
        failedMediaUrls.push(mediaUrl);
      }

      if (mediaPaths.length === 0) {
        await this.services.postService.updateStatus(post.id, 'failed', {
          generatedText,
          errorMessage: `Failed to download media: ${failedMediaUrls.join(', ')}`
        });
        logger.warn(
          { postId: post.id, handle, failedMediaUrls },
          'Post failed: media download failed'
        );
        return;
      }

      if (failedMediaUrls.length > 0) {
        logger.warn(
          { postId: post.id, handle, failedMediaUrls, downloadedCount: mediaPaths.length },
          'Some media files failed to download; continuing with available files'
        );
      }
    }

    try {
      logger.info({ postId: post.id, handle }, 'Launching browser to post tweet');
      const result = await this.services.xCamoufoxService.postTweet({
        authToken,
        text: generatedText,
        mediaPaths
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
    } finally {
      for (const mediaPath of mediaPaths) {
        deleteTempFile(mediaPath);
      }
    }
  }

  private async processThreadsPost(
    post: {
      id: string;
      account: {
        id: string;
        handle: string;
        encryptedPassword: string | null;
        encrypted2faSecret: string | null;
        encryptedCookies: string | null;
        persona?: { name: string; systemPrompt: string | null } | null;
      };
    },
    textMaterial: string,
    selectedMaterial: { content: string | null; mediaUrls: string | null } | null
  ): Promise<void> {
    const handle = post.account.handle;
    const persona = post.account.persona;

    // Generate Threads-specific multi-part post via LLM
    let threadsContent: { parts: string[]; linkComment: string | null };
    try {
      logger.info({ postId: post.id, handle }, 'Generating Threads post via LLM');
      threadsContent = await this.services.llmService.generateThreadsPost({
        adContent: textMaterial,
        personaName: persona?.name ?? 'Default',
        personaSystemPrompt: persona?.systemPrompt ?? null
      });
      const generatedText = threadsContent.parts.join('\n---\n')
        + (threadsContent.linkComment ? `\n[comment]: ${threadsContent.linkComment}` : '');
      logger.info(
        { postId: post.id, handle, partsCount: threadsContent.parts.length, generatedText },
        'LLM Threads text generated'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, postId: post.id, handle }, 'LLM Threads post generation failed');
      await this.services.postService.updateStatus(post.id, 'failed', {
        errorMessage: `LLM: ${msg}`
      });
      return;
    }

    // Decrypt credentials
    if (!post.account.encryptedPassword || !post.account.encrypted2faSecret) {
      logger.warn({ postId: post.id, handle }, 'Threads account missing credentials');
      await this.services.postService.updateStatus(post.id, 'failed', {
        generatedText: threadsContent.parts.join('\n'),
        errorMessage: 'Threads account missing password or 2FA secret'
      });
      return;
    }

    const password = decryptText(post.account.encryptedPassword);
    const totpSecret = decryptText(post.account.encrypted2faSecret);
    const cookies = post.account.encryptedCookies
      ? JSON.parse(decryptText(post.account.encryptedCookies))
      : undefined;

    // Download media if any
    const mediaUrls = parseMediaUrls(selectedMaterial?.mediaUrls);
    const mediaPaths: string[] = [];
    if (mediaUrls.length > 0) {
      for (const mediaUrl of mediaUrls) {
        const filePath = await downloadToTemp(mediaUrl);
        if (filePath) mediaPaths.push(filePath);
      }
    }

    const generatedText = threadsContent.parts.join('\n---\n')
      + (threadsContent.linkComment ? `\n[comment]: ${threadsContent.linkComment}` : '');

    try {
      // Append link comment as an additional thread part
      const allParts = [...threadsContent.parts];
      if (threadsContent.linkComment) {
        allParts.push(threadsContent.linkComment);
      }

      logger.info({ postId: post.id, handle, partCount: allParts.length }, 'Launching browser to post on Threads');
      const result = await this.services.threadsCamoufoxService.postThread({
        parts: allParts,
        mediaParts: mediaPaths.length > 0 ? [mediaPaths] : undefined,
        username: handle,
        password,
        totpSecret,
        cookies
      });

      // Save updated cookies
      if (result.cookies && result.cookies.length > 0) {
        await this.services.accountService.setCookies(
          post.account.id,
          encryptText(JSON.stringify(result.cookies))
        );
        logger.info(
          { postId: post.id, handle, cookieCount: result.cookies.length },
          'Threads cookies saved to DB'
        );
      } else {
        logger.warn(
          { postId: post.id, handle, hasCookies: !!result.cookies },
          'Threads result had no cookies to save'
        );
      }

      if (result.success) {
        await this.services.postService.updateStatus(post.id, 'posted', {
          generatedText,
          postedAt: new Date(),
          externalId: result.postUrl
        });
        logger.info({ postId: post.id, handle, postUrl: result.postUrl }, 'Threads post published');
      } else {
        await this.services.postService.updateStatus(post.id, 'failed', {
          generatedText,
          errorMessage: result.error
        });
        logger.warn({ postId: post.id, handle, error: result.error }, 'Threads post failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, postId: post.id, handle }, 'Threads post publish crashed');
      await this.services.postService.updateStatus(post.id, 'failed', {
        generatedText,
        errorMessage: msg
      });
    } finally {
      for (const mediaPath of mediaPaths) {
        deleteTempFile(mediaPath);
      }
    }
  }
}
