import type { AppContext } from '../context.js';
import type { InputFlow } from '../session.js';
import { cancelKb, categoriesKb, PAGE_SIZE, totalPages } from '../keyboards.js';
import { buildCategoriesMessage } from '../messages.js';
import { clearFlow, pushScreen } from '../navigation.js';
import { renderScreen } from '../render.js';
import { onCallback } from './callback-router.js';

/* ---------------------------------------------------------------- */
/*  Render                                                           */
/* ---------------------------------------------------------------- */

export async function renderCategories(ctx: AppContext): Promise<void> {
  const categories = await ctx.services.categoryService.getAll();
  const page = ctx.session.page['categories'] ?? 0;
  const tp = totalPages(categories.length);
  const p = Math.max(0, Math.min(page, tp - 1));
  const slice = categories.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  await renderScreen(
    ctx,
    buildCategoriesMessage(
      slice.map((c) => ({ name: c.name, slug: c.slug })),
      p,
      tp,
    ),
    categoriesKb(
      categories.map((c) => ({ id: c.id, name: c.name })),
      p,
    ),
  );
}

/* ---------------------------------------------------------------- */
/*  Callbacks                                                        */
/* ---------------------------------------------------------------- */

export function registerCategoryCallbacks(): void {
  onCallback('page:categories', async (ctx, param) => {
    ctx.session.page['categories'] = parseInt(param, 10) || 0;
    await renderCategories(ctx);
  });

  // Detail view
  onCallback('category:details', async (ctx, id) => {
    const category = await ctx.services.categoryService.getById(id);
    if (!category) {
      await renderCategories(ctx);
      return;
    }
    pushScreen(ctx.session, 'category_details', { id });
    const { InlineKeyboard } = await import('grammy');
    const kb = new InlineKeyboard()
      .text('🗑 Delete', `category:delete_ask:${id}`)
      .row()
      .text('🔙 Back', 'nav:categories');
    await renderScreen(
      ctx,
      `📂 <b>${category.name}</b>\n\n📌 Slug: <code>${category.slug}</code>`,
      kb,
    );
  });

  // Create flow
  onCallback('category:add', async (ctx) => {
    ctx.session.inputFlow = { type: 'create_category', step: 'name' };
    await renderScreen(ctx, '📂 <b>Create category</b>\n\n📝 Send category name:', cancelKb());
  });

  // Delete – ask
  onCallback('category:delete_ask', async (ctx, id) => {
    const category = await ctx.services.categoryService.getById(id);
    const { confirmDeleteKb } = await import('../keyboards.js');
    await renderScreen(
      ctx,
      `⚠️ Delete category <b>${category?.name ?? 'unknown'}</b>?\n\n❌ This cannot be undone.`,
      confirmDeleteKb('category', id, `category:details:${id}`),
    );
  });

  // Delete – confirmed
  onCallback('category:delete_yes', async (ctx, id) => {
    await ctx.services.categoryService.delete(id);
    await ctx.answerCallbackQuery({ text: 'Category deleted' }).catch(() => {});
    await renderCategories(ctx);
  });
}

/* ---------------------------------------------------------------- */
/*  Text input                                                       */
/* ---------------------------------------------------------------- */

export async function handleCreateCategoryText(
  ctx: AppContext,
  text: string,
  flow: Extract<InputFlow, { type: 'create_category' }>,
): Promise<void> {
  switch (flow.step) {
    case 'name': {
      ctx.session.inputFlow = { type: 'create_category', step: 'slug', name: text };
      await renderScreen(
        ctx,
        `📂 <b>Create category</b>\n\n✏️ Name: ${text}\n\n📝 Send slug (e.g. <code>crypto</code>):`,
        cancelKb(),
      );
      break;
    }
    case 'slug': {
      const slug = text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (!slug) {
        await ctx.reply('Invalid slug. Use letters, numbers, hyphens.');
        return;
      }
      await ctx.services.categoryService.create({ name: flow.name!, slug });
      clearFlow(ctx.session);
      await ctx.reply('✅ Category created!');
      await renderCategories(ctx);
      break;
    }
  }
}
