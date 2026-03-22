import { logger } from '../../shared/logger.js';
import type { AppContext } from '../context.js';
import type { InputFlow } from '../session.js';
import {
  campaignDetailKb,
  campaignsKb,
  cancelKb,
  mainMenuKb,
  PAGE_SIZE,
  postConfirmKb,
  targetCategoriesKb,
  totalPages,
} from '../keyboards.js';
import {
  buildCampaignDetailMessage,
  buildCampaignsMessage,
  buildDeleteConfirmMessage,
  buildPostConfirmMessage,
  buildPostingStartedMessage,
  buildTargetCategoriesMessage,
} from '../messages.js';
import { clearFlow, pushScreen } from '../navigation.js';
import { renderScreen } from '../render.js';
import { onCallback } from './callback-router.js';

/* ---------------------------------------------------------------- */
/*  Render helpers                                                   */
/* ---------------------------------------------------------------- */

export async function renderCampaigns(ctx: AppContext): Promise<void> {
  const campaigns = await ctx.services.campaignService.getCampaignsByUser(ctx.authUserId!);
  const page = ctx.session.page['campaigns'] ?? 0;
  const tp = totalPages(campaigns.length);
  const p = Math.max(0, Math.min(page, tp - 1));
  const slice = campaigns.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  await renderScreen(
    ctx,
    buildCampaignsMessage(
      slice.map((c) => ({ name: c.name, id: c.id, status: c.status })),
      p,
      tp,
    ),
    campaignsKb(
      campaigns.map((c) => ({ id: c.id, name: c.name })),
      p,
    ),
  );
}

async function renderCampaignDetail(ctx: AppContext, campaignId: string): Promise<void> {
  const campaign = await ctx.services.campaignService.getCampaignById(campaignId);
  if (!campaign) {
    await renderCampaigns(ctx);
    return;
  }
  pushScreen(ctx.session, 'campaign_details', { id: campaignId });

  const targetIds = ctx.services.campaignService.getTargetCategoryIds(campaign);
  let targetCategoryNames = '';
  if (targetIds.length > 0) {
    const categories = await ctx.services.categoryService.getAll();
    targetCategoryNames = targetIds
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  }

  await renderScreen(
    ctx,
    buildCampaignDetailMessage({
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      materialsCount: campaign.materials?.length ?? 0,
      targetCategoryNames: targetCategoryNames || undefined,
    }),
    campaignDetailKb(campaignId),
  );
}

/* ---------------------------------------------------------------- */
/*  Callbacks                                                        */
/* ---------------------------------------------------------------- */

export function registerCampaignCallbacks(): void {
  // Pagination
  onCallback('page:campaigns', async (ctx, param) => {
    ctx.session.page['campaigns'] = parseInt(param, 10) || 0;
    await renderCampaigns(ctx);
  });

  // Campaign detail
  onCallback('campaign:details', async (ctx, id) => {
    await renderCampaignDetail(ctx, id);
  });

  // Create campaign
  onCallback('campaign:add', async (ctx) => {
    ctx.session.inputFlow = { type: 'create_campaign' };
    await renderScreen(ctx, '📢 <b>Create campaign</b>\n\n📝 Send campaign name:', cancelKb());
  });

  // Add material
  onCallback('campaign:material', async (ctx, campaignId) => {
    ctx.session.inputFlow = { type: 'add_material', step: 'content', campaignId };
    await renderScreen(ctx, '📎 <b>Add material</b>\n\n📝 Send ad content (text):', cancelKb());
  });

  // Target categories – open picker
  onCallback('campaign:targets', async (ctx, campaignId) => {
    const campaign = await ctx.services.campaignService.getCampaignById(campaignId);
    if (!campaign) return;
    ctx.session.targetCampaignId = campaignId;
    ctx.session.targetCategoryIds = ctx.services.campaignService.getTargetCategoryIds(campaign);
    const categories = await ctx.services.categoryService.getAll();
    if (categories.length === 0) {
      await renderScreen(ctx, '📂 No categories yet. Create categories first!', cancelKb());
      return;
    }
    const selectedNames = categories
      .filter((c) => ctx.session.targetCategoryIds.includes(c.id))
      .map((c) => c.name);
    await renderScreen(
      ctx,
      buildTargetCategoriesMessage(selectedNames),
      targetCategoriesKb(
        campaignId,
        categories.map((c) => ({ id: c.id, name: c.name })),
        ctx.session.targetCategoryIds,
      ),
    );
  });

  // Target toggle
  onCallback('target:toggle', async (ctx, categoryId) => {
    const campaignId = ctx.session.targetCampaignId;
    if (!campaignId) return;
    const idx = ctx.session.targetCategoryIds.indexOf(categoryId);
    if (idx >= 0) {
      ctx.session.targetCategoryIds.splice(idx, 1);
    } else {
      ctx.session.targetCategoryIds.push(categoryId);
    }
    const categories = await ctx.services.categoryService.getAll();
    const selectedNames = categories
      .filter((c) => ctx.session.targetCategoryIds.includes(c.id))
      .map((c) => c.name);
    await renderScreen(
      ctx,
      buildTargetCategoriesMessage(selectedNames),
      targetCategoriesKb(
        campaignId,
        categories.map((c) => ({ id: c.id, name: c.name })),
        ctx.session.targetCategoryIds,
      ),
    );
  });

  // Target done
  onCallback('target:done', async (ctx, campaignId) => {
    await ctx.services.campaignService.setTargetCategories(campaignId, ctx.session.targetCategoryIds);
    ctx.session.targetCampaignId = null;
    ctx.session.targetCategoryIds = [];
    await ctx.answerCallbackQuery({ text: 'Targets saved' }).catch(() => {});
    await renderCampaignDetail(ctx, campaignId);
  });

  // Delete – ask confirmation
  onCallback('campaign:delete_ask', async (ctx, campaignId) => {
    const campaign = await ctx.services.campaignService.getCampaignById(campaignId);
    const { confirmDeleteKb } = await import('../keyboards.js');
    await renderScreen(
      ctx,
      buildDeleteConfirmMessage('campaign', campaign?.name ?? 'unknown'),
      confirmDeleteKb('campaign', campaignId, `campaign:details:${campaignId}`),
    );
  });

  // Delete – confirmed
  onCallback('campaign:delete_yes', async (ctx, campaignId) => {
    await ctx.services.campaignService.deleteCampaign(campaignId);
    await ctx.answerCallbackQuery({ text: 'Campaign deleted' }).catch(() => {});
    await renderCampaigns(ctx);
  });

  // Post – ask confirmation
  onCallback('campaign:post_ask', async (ctx, campaignId) => {
    const campaign = await ctx.services.campaignService.getCampaignById(campaignId);
    if (!campaign) return;
    const targetCategoryIds = ctx.services.campaignService.getTargetCategoryIds(campaign);
    let accounts;
    if (targetCategoryIds.length > 0) {
      accounts = await ctx.services.accountService.getByCategoryIds(targetCategoryIds);
    } else {
      const xAccounts = await ctx.services.accountService.getAll('x');
      const threadsAccounts = await ctx.services.accountService.getAll('threads');
      accounts = [...xAccounts, ...threadsAccounts];
    }
    const activeAccounts = accounts.filter((a) => a.status === 'active' && a.personaId);
    if (activeAccounts.length === 0) {
      await ctx.answerCallbackQuery({ text: 'No active accounts with persona' }).catch(() => {});
      return;
    }
    const hint = targetCategoryIds.length > 0
      ? 'Posts to accounts in selected target categories.'
      : 'Posts to all active accounts with persona.';
    pushScreen(ctx.session, 'post_confirm', { id: campaignId });
    await renderScreen(
      ctx,
      buildPostConfirmMessage(campaign.name, activeAccounts.length, hint),
      postConfirmKb(campaignId),
    );
  });

  // Post – confirmed
  onCallback('campaign:post_yes', async (ctx, campaignId) => {
    const campaign = await ctx.services.campaignService.getCampaignById(campaignId);
    if (!campaign) return;
    const targetCategoryIds = ctx.services.campaignService.getTargetCategoryIds(campaign);
    let accounts;
    if (targetCategoryIds.length > 0) {
      accounts = await ctx.services.accountService.getByCategoryIds(targetCategoryIds);
    } else {
      const xAccounts = await ctx.services.accountService.getAll('x');
      const threadsAccounts = await ctx.services.accountService.getAll('threads');
      accounts = [...xAccounts, ...threadsAccounts];
    }
    const activeAccounts = accounts.filter((a) => a.status === 'active' && a.personaId);
    if (activeAccounts.length === 0) {
      await ctx.answerCallbackQuery({ text: 'No active accounts with persona' }).catch(() => {});
      return;
    }

    try {
      const posts = activeAccounts.map((a) => ({ campaignId, accountId: a.id }));
      await ctx.services.postService.createMany(posts);
      await ctx.services.campaignService.updateCampaignStatus(campaignId, 'running');
      await renderScreen(
        ctx,
        buildPostingStartedMessage(campaign.name, posts.length),
        mainMenuKb(),
      );
    } catch (err) {
      logger.error({ err }, 'Post creation failed');
      await ctx.answerCallbackQuery({ text: 'Failed to start posting' }).catch(() => {});
    }
  });
}

/* ---------------------------------------------------------------- */
/*  Text input                                                       */
/* ---------------------------------------------------------------- */

export async function handleCreateCampaignText(ctx: AppContext, text: string): Promise<void> {
  await ctx.services.campaignService.createCampaign({
    createdById: ctx.authUserId!,
    name: text,
  });
  clearFlow(ctx.session);
  await ctx.reply('✅ Campaign created!');
  await renderCampaigns(ctx);
}

export async function handleAddMaterialText(
  ctx: AppContext,
  text: string,
  flow: Extract<InputFlow, { type: 'add_material' }>,
): Promise<void> {
  switch (flow.step) {
    case 'content': {
      ctx.session.inputFlow = {
        type: 'add_material',
        step: 'media',
        campaignId: flow.campaignId,
        content: text,
      };
      await renderScreen(
        ctx,
        '📎 <b>Add material</b>\n\n🖼 Send media URLs (one per line) or <code>-</code> to skip:',
        cancelKb(),
      );
      break;
    }
    case 'media': {
      const mediaUrls =
        text === '-' || text.toLowerCase() === 'skip'
          ? null
          : text
              .split(/[\n,]+/)
              .map((u) => u.trim())
              .filter((u) => u.startsWith('http'));
      await ctx.services.campaignService.addMaterial({
        campaignId: flow.campaignId,
        type: 'text',
        content: flow.content!,
        mediaUrls: mediaUrls && mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      });
      clearFlow(ctx.session);
      await ctx.reply('✅ Material added!');
      await renderCampaignDetail(ctx, flow.campaignId);
      break;
    }
  }
}
