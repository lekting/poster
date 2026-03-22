import type { InlineKeyboard } from 'grammy';
import type { AppContext } from './context.js';
import { logger } from '../shared/logger.js';

/**
 * Single-menu-message strategy.
 * Always edits the tracked menu message; falls back to sending a new one
 * if the old message is gone / too old.
 */
export async function renderScreen(
  ctx: AppContext,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const menuMsgId = ctx.session.menuMessageId;

  if (menuMsgId) {
    try {
      await ctx.api.editMessageText(chatId, menuMsgId, text, {
        reply_markup: keyboard,
      });
      return;
    } catch (err: unknown) {
      const desc = errDesc(err);
      if (desc.includes('message is not modified')) return;
      // message too old / deleted – send a new one below
      logger.debug({ err }, 'Menu message edit failed, sending new');
    }
  }

  const sent = await ctx.api.sendMessage(chatId, text, {
    reply_markup: keyboard,
  });
  ctx.session.menuMessageId = sent.message_id;
}

function errDesc(err: unknown): string {
  if (err && typeof err === 'object' && 'description' in err) {
    return String((err as { description?: string }).description);
  }
  return '';
}
