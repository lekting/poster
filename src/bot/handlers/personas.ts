import type { AppContext } from '../context.js';
import type { InputFlow } from '../session.js';
import { cancelKb, PAGE_SIZE, personasKb, totalPages } from '../keyboards.js';
import { buildPersonasMessage } from '../messages.js';
import { clearFlow, pushScreen } from '../navigation.js';
import { renderScreen } from '../render.js';
import { onCallback } from './callback-router.js';

/* ---------------------------------------------------------------- */
/*  Render                                                           */
/* ---------------------------------------------------------------- */

export async function renderPersonas(ctx: AppContext): Promise<void> {
  const personas = await ctx.services.personaService.getAll();
  const page = ctx.session.page['personas'] ?? 0;
  const tp = totalPages(personas.length);
  const p = Math.max(0, Math.min(page, tp - 1));
  const slice = personas.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  await renderScreen(
    ctx,
    buildPersonasMessage(
      slice.map((p) => ({ name: p.name, slug: p.slug })),
      p,
      tp,
    ),
    personasKb(
      personas.map((p) => ({ id: p.id, name: p.name })),
      p,
    ),
  );
}

/* ---------------------------------------------------------------- */
/*  Callbacks                                                        */
/* ---------------------------------------------------------------- */

export function registerPersonaCallbacks(): void {
  onCallback('page:personas', async (ctx, param) => {
    ctx.session.page['personas'] = parseInt(param, 10) || 0;
    await renderPersonas(ctx);
  });

  // Detail view (reuse the list for now – personas are simple)
  onCallback('persona:details', async (ctx, id) => {
    const persona = await ctx.services.personaService.getById(id);
    if (!persona) {
      await renderPersonas(ctx);
      return;
    }
    pushScreen(ctx.session, 'persona_details', { id });
    const promptPreview = persona.systemPrompt
      ? persona.systemPrompt.slice(0, 200) + (persona.systemPrompt.length > 200 ? '...' : '')
      : '<i>no prompt</i>';
    const { InlineKeyboard } = await import('grammy');
    const kb = new InlineKeyboard()
      .text('🗑 Delete', `persona:delete_ask:${id}`)
      .row()
      .text('🔙 Back', 'nav:personas');
    await renderScreen(
      ctx,
      `🎭 <b>${persona.name}</b>\n\n📌 Slug: <code>${persona.slug}</code>\n💬 Prompt: ${promptPreview}`,
      kb,
    );
  });

  // Create persona flow
  onCallback('persona:add', async (ctx) => {
    ctx.session.inputFlow = { type: 'create_persona', step: 'name' };
    await renderScreen(ctx, '🎭 <b>Create persona</b>\n\n📝 Send persona name:', cancelKb());
  });

  // Delete – ask
  onCallback('persona:delete_ask', async (ctx, id) => {
    const persona = await ctx.services.personaService.getById(id);
    const { confirmDeleteKb } = await import('../keyboards.js');
    await renderScreen(
      ctx,
      `⚠️ Delete persona <b>${persona?.name ?? 'unknown'}</b>?\n\n❌ This cannot be undone.`,
      confirmDeleteKb('persona', id, `persona:details:${id}`),
    );
  });

  // Delete – confirmed
  onCallback('persona:delete_yes', async (ctx, id) => {
    await ctx.services.personaService.delete(id);
    await ctx.answerCallbackQuery({ text: 'Persona deleted' }).catch(() => {});
    await renderPersonas(ctx);
  });
}

/* ---------------------------------------------------------------- */
/*  Text input                                                       */
/* ---------------------------------------------------------------- */

export async function handleCreatePersonaText(
  ctx: AppContext,
  text: string,
  flow: Extract<InputFlow, { type: 'create_persona' }>,
): Promise<void> {
  switch (flow.step) {
    case 'name': {
      ctx.session.inputFlow = { type: 'create_persona', step: 'slug', name: text };
      await renderScreen(
        ctx,
        `🎭 <b>Create persona</b>\n\n✏️ Name: ${text}\n\n📝 Send slug (e.g. <code>aggressive-trader</code>):`,
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
      ctx.session.inputFlow = { type: 'create_persona', step: 'prompt', name: flow.name, slug };
      await renderScreen(
        ctx,
        `🎭 <b>Create persona</b>\n\n✏️ Name: ${flow.name}\n📌 Slug: <code>${slug}</code>\n\n💬 Send system prompt (or <code>-</code> to skip):`,
        cancelKb(),
      );
      break;
    }
    case 'prompt': {
      const systemPrompt = text === '-' || text === 'skip' ? null : text;
      await ctx.services.personaService.create({
        name: flow.name!,
        slug: flow.slug!,
        systemPrompt,
      });
      clearFlow(ctx.session);
      await ctx.reply('✅ Persona created!');
      await renderPersonas(ctx);
      break;
    }
  }
}
