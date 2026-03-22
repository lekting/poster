import type { Bot } from 'grammy';
import { logger } from '../../shared/logger.js';
import type { AppContext } from '../context.js';
import { mainMenuKb } from '../keyboards.js';
import { buildMainMenuMessage } from '../messages.js';
import { clearFlow, popScreen, pushScreen, resetNav } from '../navigation.js';
import { renderScreen } from '../render.js';
import {
  handleAddThreadsAccountsText,
  handleAddXAccountsText,
  handleRegisterXText,
  registerAccountCallbacks,
  renderAccounts,
} from './accounts.js';
import { onCallback, routeCallback } from './callback-router.js';
import {
  handleAddMaterialText,
  handleCreateCampaignText,
  registerCampaignCallbacks,
  renderCampaigns,
} from './campaigns.js';
import {
  handleCreateCategoryText,
  registerCategoryCallbacks,
  renderCategories,
} from './categories.js';
import {
  handleCreatePersonaText,
  registerPersonaCallbacks,
  renderPersonas,
} from './personas.js';

/* ---------------------------------------------------------------- */
/*  Screen dispatcher – renders a screen by its id                   */
/* ---------------------------------------------------------------- */

async function renderByScreen(ctx: AppContext): Promise<void> {
  const entry = ctx.session.navStack[ctx.session.navStack.length - 1];
  if (!entry) {
    await renderScreen(ctx, buildMainMenuMessage(), mainMenuKb());
    return;
  }
  switch (entry.screen) {
    case 'main':
      await renderScreen(ctx, buildMainMenuMessage(), mainMenuKb());
      break;
    case 'accounts':
      await renderAccounts(ctx);
      break;
    case 'personas':
      await renderPersonas(ctx);
      break;
    case 'categories':
      await renderCategories(ctx);
      break;
    case 'campaigns':
      await renderCampaigns(ctx);
      break;
    default:
      await renderScreen(ctx, buildMainMenuMessage(), mainMenuKb());
      break;
  }
}

/* ---------------------------------------------------------------- */
/*  Register all handlers on the bot                                 */
/* ---------------------------------------------------------------- */

export function registerAllHandlers(bot: Bot<AppContext>): void {
  // -- Register all callback routes first --
  registerNavigationCallbacks();
  registerAccountCallbacks();
  registerPersonaCallbacks();
  registerCategoryCallbacks();
  registerCampaignCallbacks();

  // -- /start command --
  bot.command('start', async (ctx) => {
    if (!ctx.authUserId) return;
    resetNav(ctx.session);
    ctx.session.menuMessageId = null; // fresh start — send new message
    await renderScreen(ctx, buildMainMenuMessage(), mainMenuKb());
  });

  // -- /cancel command --
  bot.command('cancel', async (ctx) => {
    if (ctx.session.inputFlow) {
      clearFlow(ctx.session);
      popScreen(ctx.session);
      await renderByScreen(ctx);
      return;
    }
    await ctx.reply('Nothing to cancel.');
  });

  // -- Text input dispatcher --
  bot.on('message:text', async (ctx) => {
    if (!ctx.authUserId) return;
    const flow = ctx.session.inputFlow;
    if (!flow) return; // no active flow — ignore text

    const text = ctx.message?.text?.trim() ?? '';
    if (!text) return;

    try {
      switch (flow.type) {
        case 'add_x_accounts':
          await handleAddXAccountsText(ctx, text);
          break;
        case 'add_threads_accounts':
          await handleAddThreadsAccountsText(ctx, text);
          break;
        case 'register_x':
          await handleRegisterXText(ctx, text);
          break;
        case 'create_persona':
          await handleCreatePersonaText(ctx, text, flow);
          break;
        case 'create_category':
          await handleCreateCategoryText(ctx, text, flow);
          break;
        case 'create_campaign':
          await handleCreateCampaignText(ctx, text);
          break;
        case 'add_material':
          await handleAddMaterialText(ctx, text, flow);
          break;
      }
    } catch (err) {
      logger.error({ err, flowType: flow.type }, 'Text input handler failed');
      await ctx.reply('Something went wrong. Please try again or /cancel.').catch(() => {});
    }
  });

  // -- Callback query dispatcher --
  bot.on('callback_query:data', async (ctx) => {
    if (!ctx.authUserId) return;
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    try {
      const handled = await routeCallback(ctx, data);
      if (!handled) {
        logger.warn({ data }, 'Unhandled callback query');
      }
    } catch (err) {
      logger.error({ err, data }, 'Callback handler failed');
    }
    await ctx.answerCallbackQuery().catch(() => {});
  });
}

/* ---------------------------------------------------------------- */
/*  Navigation callbacks                                             */
/* ---------------------------------------------------------------- */

function registerNavigationCallbacks(): void {

  // Main menu
  onCallback('nav:main', async (ctx) => {
    resetNav(ctx.session);
    await renderScreen(ctx, buildMainMenuMessage(), mainMenuKb());
  });

  // Section navigation
  onCallback('nav:accounts', async (ctx) => {
    pushScreen(ctx.session, 'accounts');
    await renderAccounts(ctx);
  });

  onCallback('nav:personas', async (ctx) => {
    pushScreen(ctx.session, 'personas');
    await renderPersonas(ctx);
  });

  onCallback('nav:categories', async (ctx) => {
    pushScreen(ctx.session, 'categories');
    await renderCategories(ctx);
  });

  onCallback('nav:campaigns', async (ctx) => {
    pushScreen(ctx.session, 'campaigns');
    await renderCampaigns(ctx);
  });

  // Generic "back" — pops the stack
  onCallback('nav:back', async (ctx) => {
    popScreen(ctx.session);
    await renderByScreen(ctx);
  });

  // Cancel input flow via button
  onCallback('cancel_input', async (ctx) => {
    clearFlow(ctx.session);
    popScreen(ctx.session);
    await renderByScreen(ctx);
  });

  // noop — pagination indicator button
  onCallback('noop', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
  });
}
