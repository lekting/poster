import { run, RunnerHandle } from '@grammyjs/runner';
import { Bot, InlineKeyboard, session } from 'grammy';
import { config } from '../config/index.js';
import { AppServices } from '../services/index.js';
import {
  buildAccountsListMessage,
  buildCampaignDetailsMessage,
  buildCampaignsListMessage,
  buildCategoriesListMessage,
  buildMainMenuMessage,
  buildPersonasListMessage,
  buildPostingStartedMessage
} from './messages.js';
import {
  accountDetailsKeyboard,
  accountsKeyboard,
  campaignTargetCategoriesKeyboard,
  campaignsKeyboard,
  campaignDetailsKeyboard,
  campaignSelectKeyboard,
  categoriesKeyboard,
  categorySelectKeyboard,
  mainMenuKeyboard,
  personasKeyboard,
  personaSelectKeyboard,
  postCampaignKeyboard,
  postConfirmKeyboard
} from './keyboards.js';
import { AppContext } from './context.js';
import { initialSession } from './session.js';
import { logger } from '../shared/logger.js';

const PARSE_MODE = 'Markdown' as const;

export class TelegramBotApp {
  private readonly bot: Bot<AppContext>;
  private runner: RunnerHandle | null = null;

  constructor(private readonly services: AppServices) {
    this.bot = new Bot<AppContext>(config.TELEGRAM_BOT_TOKEN);

    this.bot.use(
      session({
        initial: initialSession
      })
    );

    this.bot.use(async (ctx, next) => {
      ctx.services = this.services;
      ctx.authUserId = null;
      if (ctx.from) {
        const user = await this.services.userService.ensureUser({
          telegramId: String(ctx.from.id),
          username: ctx.from.username ?? null,
          firstName: ctx.from.first_name ?? null,
          lastName: ctx.from.last_name ?? null
        });
        ctx.authUserId = user.id;
      }
      await next();
    });

    this.bot.command('start', async (ctx) => {
      if (!ctx.authUserId) return;
      await this.renderMainMenu(ctx);
    });

    this.bot.on('message:text', async (ctx) => {
      if (!ctx.authUserId) return;
      const text = ctx.message.text?.trim() ?? '';

      if (ctx.session.awaitingInput === 'reg_count') {
        const num = parseInt(text.trim(), 10);
        if (isNaN(num) || num < 1 || num > 20) {
          await ctx.reply('Please send a number between 1 and 20.', { parse_mode: PARSE_MODE });
          return;
        }
        ctx.session.awaitingInput = null;
        const tasks = await this.services.registrationService.queueAutoRegistration({
          count: num,
          createdByUserId: ctx.authUserId
        });
        await ctx.reply(
          `✅ Queued *${tasks.length}* registration task(s).\n\nThe worker will automatically generate emails via mail.tm, register accounts on X, and assign personas. Check Accounts in a few minutes.`,
          { parse_mode: PARSE_MODE }
        );
        await this.renderAccounts(ctx);
        return;
      }

      if (ctx.session.awaitingInput === 'persona_name') {
        ctx.session.awaitingInput = 'persona_slug';
        ctx.session.pendingNameForInput = text;
        await ctx.reply('Send persona slug (e.g. `aggressive-trader`):', { parse_mode: PARSE_MODE });
        return;
      }
      if (ctx.session.awaitingInput === 'persona_slug') {
        const name = ctx.session.pendingNameForInput ?? text;
        const slug = text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (!slug) {
          await ctx.reply('Invalid slug.', { parse_mode: PARSE_MODE });
          return;
        }
        ctx.session.awaitingInput = 'persona_prompt';
        ctx.session.pendingNameForInput = `${name}::${slug}`;
        await ctx.reply('Send system prompt for this persona (or send `-` to skip):', { parse_mode: PARSE_MODE });
        return;
      }
      if (ctx.session.awaitingInput === 'persona_prompt') {
        const parts = (ctx.session.pendingNameForInput ?? '').split('::');
        const name = parts[0] ?? '';
        const slug = parts[1] ?? '';
        const systemPrompt = text === '-' || text === 'skip' ? null : text;
        await this.services.personaService.create({ name, slug, systemPrompt });
        ctx.session.awaitingInput = null;
        ctx.session.pendingNameForInput = null;
        await ctx.reply('Persona created.', { parse_mode: PARSE_MODE });
        await this.renderPersonas(ctx);
        return;
      }

      if (ctx.session.awaitingInput === 'category_name') {
        ctx.session.awaitingInput = 'category_slug';
        ctx.session.pendingNameForInput = text;
        await ctx.reply('Send category slug (e.g. `crypto`):', { parse_mode: PARSE_MODE });
        return;
      }
      if (ctx.session.awaitingInput === 'category_slug') {
        const name = ctx.session.pendingNameForInput ?? text;
        const slug = text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (!slug) {
          await ctx.reply('Invalid slug.', { parse_mode: PARSE_MODE });
          return;
        }
        await this.services.categoryService.create({ name, slug });
        ctx.session.awaitingInput = null;
        ctx.session.pendingNameForInput = null;
        await ctx.reply('Category created.', { parse_mode: PARSE_MODE });
        await this.renderCategories(ctx);
        return;
      }

      if (ctx.session.awaitingInput === 'campaign_name') {
        if (!ctx.authUserId) return;
        await this.services.campaignService.createCampaign({
          createdById: ctx.authUserId,
          name: text
        });
        ctx.session.awaitingInput = null;
        await ctx.reply('Campaign created.', { parse_mode: PARSE_MODE });
        await this.renderCampaigns(ctx);
        return;
      }

      if (ctx.session.awaitingInput === 'ad_content') {
        const campaignId = ctx.session.campaignIdForInput;
        if (!campaignId) {
          ctx.session.awaitingInput = null;
          await ctx.reply('Session expired.', { parse_mode: PARSE_MODE });
          return;
        }
        ctx.session.pendingAdContent = text;
        ctx.session.awaitingInput = 'ad_media';
        await ctx.reply('Send media URLs (one per line) or `-` to skip:', { parse_mode: PARSE_MODE });
        return;
      }
      if (ctx.session.awaitingInput === 'ad_media') {
        const campaignId = ctx.session.campaignIdForInput;
        const content = ctx.session.pendingAdContent;
        if (!campaignId || content == null) {
          ctx.session.awaitingInput = null;
          ctx.session.pendingAdContent = null;
          await ctx.reply('Session expired.', { parse_mode: PARSE_MODE });
          return;
        }
        const mediaUrls =
          text === '-' || text.toLowerCase() === 'skip'
            ? null
            : text
                .split(/[\n,]+/)
                .map((u) => u.trim())
                .filter((u) => u.startsWith('http'));
        await this.services.campaignService.addMaterial({
          campaignId,
          type: 'text',
          content,
          mediaUrls: mediaUrls && mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null
        });
        ctx.session.awaitingInput = null;
        ctx.session.campaignIdForInput = null;
        ctx.session.pendingAdContent = null;
        await ctx.reply('Material added.', { parse_mode: PARSE_MODE });
        await this.renderCampaignDetails(ctx, campaignId);
        return;
      }
    });

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (!data || !ctx.authUserId) return;

      if (data === 'menu:main') {
        await this.renderMainMenu(ctx, true);
      } else if (data === 'menu:accounts') {
        await this.renderAccounts(ctx, true);
      } else if (data === 'menu:personas') {
        await this.renderPersonas(ctx, true);
      } else if (data === 'menu:categories') {
        await this.renderCategories(ctx, true);
      } else if (data === 'menu:campaigns') {
        await this.renderCampaigns(ctx, true);
      } else if (data === 'menu:post') {
        await this.renderPost(ctx, true);
      } else if (data === 'account:register') {
        ctx.session.awaitingInput = 'reg_count';
        await this.safeEdit(
          ctx,
          '🤖 *Auto-Register X Accounts*\n\nHow many accounts to register? (1–20)\n\nThe system will automatically:\n• Create temp emails via mail\\.tm\n• Generate passwords and usernames\n• Register via browser automation\n• Auto-confirm email verification\n• Assign persona via AI',
          accountsKeyboard()
        );
      } else if (data.startsWith('account:persona:')) {
        const accountId = data.replace('account:persona:', '');
        const personas = await this.services.personaService.getAll();
        await this.safeEdit(
          ctx,
          'Select persona:',
          personaSelectKeyboard(personas.map((p) => ({ id: p.id, name: p.name })))
        );
        ctx.session.accountIdForInput = accountId;
      } else if (data.startsWith('persona:select:')) {
        const personaId = data.replace('persona:select:', '');
        const accountId = ctx.session.accountIdForInput;
        if (accountId) {
          await this.services.accountService.assignPersona(accountId, personaId);
          ctx.session.accountIdForInput = null;
        }
        await this.safeEdit(ctx, 'Persona assigned.', accountsKeyboard());
      } else if (data.startsWith('account:category:')) {
        const accountId = data.replace('account:category:', '');
        const categories = await this.services.categoryService.getAll();
        await this.safeEdit(
          ctx,
          'Select category:',
          categorySelectKeyboard(categories.map((c) => ({ id: c.id, name: c.name })))
        );
        ctx.session.accountIdForInput = accountId;
      } else if (data.startsWith('category:select:')) {
        const categoryId = data.replace('category:select:', '');
        const accountId = ctx.session.accountIdForInput;
        if (accountId) {
          await this.services.accountService.assignCategory(accountId, categoryId);
          ctx.session.accountIdForInput = null;
        }
        await this.safeEdit(ctx, 'Category assigned.', accountsKeyboard());
      } else if (data.startsWith('account:delete:')) {
        const accountId = data.replace('account:delete:', '');
        await this.services.accountService.delete(accountId);
        await this.safeEdit(ctx, 'Account deleted.', accountsKeyboard());
      } else if (data.startsWith('account:details:')) {
        const accountId = data.replace('account:details:', '');
        const account = await this.services.accountService.getById(accountId);
        if (account) {
          const msg = `*Account* @${account.handle}\nPlatform: ${account.platform}\nStatus: ${account.status}`;
          await this.safeEdit(ctx, msg, accountDetailsKeyboard(accountId));
        }
      } else if (data === 'persona:add') {
        ctx.session.awaitingInput = 'persona_name';
        ctx.session.pendingNameForInput = null;
        await this.safeEdit(ctx, 'Send persona name:', personasKeyboard());
      } else if (data === 'category:add') {
        ctx.session.awaitingInput = 'category_name';
        ctx.session.pendingNameForInput = null;
        await this.safeEdit(ctx, 'Send category name:', categoriesKeyboard());
      } else if (data === 'campaign:add') {
        ctx.session.awaitingInput = 'campaign_name';
        await this.safeEdit(ctx, 'Send campaign name:', campaignsKeyboard());
      } else if (data.startsWith('campaign:material:')) {
        const campaignId = data.replace('campaign:material:', '');
        ctx.session.awaitingInput = 'ad_content';
        ctx.session.campaignIdForInput = campaignId;
        await this.safeEdit(ctx, 'Send ad content (text):', campaignDetailsKeyboard(campaignId));
      } else if (data.startsWith('campaign:delete:')) {
        const campaignId = data.replace('campaign:delete:', '');
        await this.services.campaignService.deleteCampaign(campaignId);
        await this.safeEdit(ctx, 'Campaign deleted.', campaignsKeyboard());
      } else if (data.startsWith('campaign:target_categories:')) {
        const campaignId = data.replace('campaign:target_categories:', '');
        const campaign = await this.services.campaignService.getCampaignById(campaignId);
        if (!campaign) {
          await ctx.answerCallbackQuery({ text: 'Campaign not found' });
          return;
        }
        ctx.session.campaignIdForTargetCategories = campaignId;
        ctx.session.targetCategoriesSelected = this.services.campaignService.getTargetCategoryIds(campaign);
        const categories = await this.services.categoryService.getAll();
        const text =
          categories.length === 0
            ? 'No categories yet. Create categories first.'
            : `Select target categories for this campaign. Click to toggle. Selected: ${ctx.session.targetCategoriesSelected.length ? 'yes' : 'none'}`;
        await this.safeEdit(
          ctx,
          text,
          campaignTargetCategoriesKeyboard(campaignId, categories.map((c) => ({ id: c.id, name: c.name })), ctx.session.targetCategoriesSelected)
        );
      } else if (data.startsWith('category:target_toggle:')) {
        const categoryId = data.replace('category:target_toggle:', '');
        const campaignId = ctx.session.campaignIdForTargetCategories;
        if (!campaignId) {
          await ctx.answerCallbackQuery({ text: 'Session expired' });
          return;
        }
        const idx = ctx.session.targetCategoriesSelected.indexOf(categoryId);
        if (idx >= 0) {
          ctx.session.targetCategoriesSelected.splice(idx, 1);
        } else {
          ctx.session.targetCategoriesSelected.push(categoryId);
        }
        const categories = await this.services.categoryService.getAll();
        const selectedNames = categories
          .filter((c) => ctx.session.targetCategoriesSelected!.includes(c.id))
          .map((c) => c.name)
          .join(', ');
        const text = selectedNames
          ? `Target categories: ${selectedNames}\n\nClick to toggle, Done when finished.`
          : 'Select target categories. Click to toggle, Done when finished.';
        await this.safeEdit(
          ctx,
          text,
          campaignTargetCategoriesKeyboard(campaignId, categories.map((c) => ({ id: c.id, name: c.name })), ctx.session.targetCategoriesSelected)
        );
      } else if (data.startsWith('campaign:target_done:')) {
        const campaignId = data.replace('campaign:target_done:', '');
        await this.services.campaignService.setTargetCategories(campaignId, ctx.session.targetCategoriesSelected ?? []);
        ctx.session.campaignIdForTargetCategories = null;
        ctx.session.targetCategoriesSelected = [];
        await this.renderCampaignDetails(ctx, campaignId, true);
      } else if (data.startsWith('campaign:details:')) {
        const campaignId = data.replace('campaign:details:', '');
        ctx.session.campaignIdForTargetCategories = null;
        ctx.session.targetCategoriesSelected = [];
        await this.renderCampaignDetails(ctx, campaignId, true);
      } else if (data === 'post:select_campaign') {
        const campaigns = await this.services.campaignService.getCampaignsByUser(ctx.authUserId);
        const withMaterials = campaigns.filter((c) => (c.materials?.length ?? 0) > 0);
        await this.safeEdit(
          ctx,
          'Select campaign to post:',
          campaignSelectKeyboard(withMaterials.map((c) => ({ id: c.id, name: c.name })))
        );
      } else if (data.startsWith('campaign:select:')) {
        const campaignId = data.replace('campaign:select:', '');
        ctx.session.selectedCampaignId = campaignId;
        const campaign = await this.services.campaignService.getCampaignById(campaignId);
        const targetIds = campaign ? this.services.campaignService.getTargetCategoryIds(campaign) : [];
        const hint = targetIds.length > 0
          ? 'Will post to accounts in selected target categories.'
          : 'Will post to all active accounts with persona.';
        await this.safeEdit(
          ctx,
          `Campaign selected. ${hint}\n\nClick to start posting.`,
          postConfirmKeyboard(campaignId)
        );
      } else if (data.startsWith('post:confirm:')) {
        const campaignId = data.replace('post:confirm:', '');
        const campaign = await this.services.campaignService.getCampaignById(campaignId);
        if (!campaign) {
          await ctx.answerCallbackQuery({ text: 'Campaign not found' });
          return;
        }
        const targetCategoryIds = this.services.campaignService.getTargetCategoryIds(campaign);
        const accounts =
          targetCategoryIds.length > 0
            ? await this.services.accountService.getByCategoryIds(targetCategoryIds)
            : await this.services.accountService.getAll('x');
        const activeAccounts = accounts.filter((a) => a.status === 'active' && a.personaId);
        if (activeAccounts.length === 0) {
          await ctx.answerCallbackQuery({ text: 'No active accounts with persona in target categories' });
          return;
        }
        const posts = activeAccounts.map((a) => ({ campaignId, accountId: a.id }));
        await this.services.postService.createMany(posts);
        await this.services.campaignService.updateCampaignStatus(campaignId, 'running');
        await this.safeEdit(
          ctx,
          buildPostingStartedMessage(campaign.name, posts.length),
          mainMenuKeyboard()
        );
      }

      await ctx.answerCallbackQuery();
    });
  }

  private async renderMainMenu(ctx: AppContext, edit = false): Promise<void> {
    const text = buildMainMenuMessage();
    if (edit && ctx.callbackQuery) {
      await this.safeEdit(ctx, text, mainMenuKeyboard());
    } else {
      await ctx.reply(text, { parse_mode: PARSE_MODE, reply_markup: mainMenuKeyboard() });
    }
  }

  private async renderAccounts(ctx: AppContext, edit = false): Promise<void> {
    const accounts = await this.services.accountService.getAll();
    const list = accounts.map((a) => ({
      handle: a.handle,
      platform: a.platform,
      personaName: a.persona?.name,
      categoryName: a.category?.name,
      status: a.status
    }));
    const text = buildAccountsListMessage(list);
    if (edit && ctx.callbackQuery) {
      await this.safeEdit(ctx, text, accountsKeyboard());
    } else {
      await ctx.reply(text, { parse_mode: PARSE_MODE, reply_markup: accountsKeyboard() });
    }
  }

  private async renderPersonas(ctx: AppContext, edit = false): Promise<void> {
    const personas = await this.services.personaService.getAll();
    const text = buildPersonasListMessage(personas.map((p) => ({ name: p.name, slug: p.slug })));
    if (edit && ctx.callbackQuery) {
      await this.safeEdit(ctx, text, personasKeyboard());
    } else {
      await ctx.reply(text, { parse_mode: PARSE_MODE, reply_markup: personasKeyboard() });
    }
  }

  private async renderCategories(ctx: AppContext, edit = false): Promise<void> {
    const categories = await this.services.categoryService.getAll();
    const text = buildCategoriesListMessage(categories.map((c) => ({ name: c.name, slug: c.slug })));
    if (edit && ctx.callbackQuery) {
      await this.safeEdit(ctx, text, categoriesKeyboard());
    } else {
      await ctx.reply(text, { parse_mode: PARSE_MODE, reply_markup: categoriesKeyboard() });
    }
  }

  private async renderCampaigns(ctx: AppContext, edit = false): Promise<void> {
    const campaigns = await this.services.campaignService.getCampaignsByUser(ctx.authUserId!);
    const text = buildCampaignsListMessage(
      campaigns.map((c) => ({ name: c.name, id: c.id, status: c.status }))
    );
    const kb = campaignsKeyboard(campaigns.map((c) => ({ id: c.id, name: c.name })));
    if (edit && ctx.callbackQuery) {
      await this.safeEdit(ctx, text, kb);
    } else {
      await ctx.reply(text, { parse_mode: PARSE_MODE, reply_markup: kb });
    }
  }

  private async renderCampaignDetails(
    ctx: AppContext,
    campaignId: string,
    edit = false
  ): Promise<void> {
    const campaign = await this.services.campaignService.getCampaignById(campaignId);
    if (!campaign) return;
    const targetIds = this.services.campaignService.getTargetCategoryIds(campaign);
    let targetCategoryNames = '';
    if (targetIds.length > 0) {
      const categories = await this.services.categoryService.getAll();
      targetCategoryNames = targetIds
        .map((id) => categories.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    }
    const text = buildCampaignDetailsMessage({
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      materialsCount: campaign.materials?.length ?? 0,
      targetCategoryNames: targetCategoryNames || undefined
    });
    if (edit && ctx.callbackQuery) {
      await this.safeEdit(ctx, text, campaignDetailsKeyboard(campaignId));
    } else {
      await ctx.reply(text, { parse_mode: PARSE_MODE, reply_markup: campaignDetailsKeyboard(campaignId) });
    }
  }

  private async renderPost(ctx: AppContext, edit = false): Promise<void> {
    const text = 'Select a campaign to post. Active accounts with personas will receive the ad.';
    if (edit && ctx.callbackQuery) {
      await this.safeEdit(ctx, text, postCampaignKeyboard());
    } else {
      await ctx.reply(text, { parse_mode: PARSE_MODE, reply_markup: postCampaignKeyboard() });
    }
  }

  private async safeEdit(
    ctx: AppContext,
    text: string,
    keyboard: InlineKeyboard
  ): Promise<void> {
    try {
      if (ctx.callbackQuery?.message && 'editMessageText' in ctx.api) {
        await ctx.editMessageText(text, {
          parse_mode: PARSE_MODE,
          reply_markup: keyboard
        });
      }
    } catch (err: unknown) {
      const desc = err && typeof err === 'object' && 'description' in err ? String((err as { description?: string }).description) : '';
      if (desc.includes('message is not modified')) {
        return; // Same content — nothing to do
      }
      logger.warn({ err }, 'Failed to edit message');
    }
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
