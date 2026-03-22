import { encryptText } from '../../shared/crypto.js';
import { logger } from '../../shared/logger.js';
import type { AppContext } from '../context.js';
import {
  accountDetailKb,
  accountsKb,
  cancelKb,
  categoryPickerKb,
  confirmDeleteKb,
  PAGE_SIZE,
  personaPickerKb,
  totalPages,
} from '../keyboards.js';
import {
  buildAccountDetailMessage,
  buildAccountsMessage,
  buildDeleteConfirmMessage,
  esc,
} from '../messages.js';
import { clearFlow, pushScreen } from '../navigation.js';
import { renderScreen } from '../render.js';
import { onCallback } from './callback-router.js';

/* ---------------------------------------------------------------- */
/*  Render helpers                                                   */
/* ---------------------------------------------------------------- */

export async function renderAccounts(ctx: AppContext): Promise<void> {
  const accounts = await ctx.services.accountService.getAll();
  const page = ctx.session.page['accounts'] ?? 0;
  const tp = totalPages(accounts.length);
  const p = Math.max(0, Math.min(page, tp - 1));
  const slice = accounts.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  const list = slice.map((a) => ({
    handle: a.handle,
    platform: a.platform,
    personaName: a.persona?.name,
    categoryName: a.category?.name,
    status: a.status,
  }));

  await renderScreen(
    ctx,
    buildAccountsMessage(list, p, tp),
    accountsKb(
      accounts.map((a) => ({ id: a.id, handle: a.handle })),
      p,
    ),
  );
}

async function renderAccountDetail(ctx: AppContext, accountId: string): Promise<void> {
  const account = await ctx.services.accountService.getById(accountId);
  if (!account) {
    await renderAccounts(ctx);
    return;
  }
  pushScreen(ctx.session, 'account_details', { id: accountId });
  await renderScreen(
    ctx,
    buildAccountDetailMessage({
      handle: account.handle,
      platform: account.platform,
      status: account.status,
      personaName: account.persona?.name,
      categoryName: account.category?.name,
    }),
    accountDetailKb(accountId),
  );
}

/* ---------------------------------------------------------------- */
/*  Callback handlers                                                */
/* ---------------------------------------------------------------- */

export function registerAccountCallbacks(): void {
  // Pagination
  onCallback('page:accounts', async (ctx, param) => {
    ctx.session.page['accounts'] = parseInt(param, 10) || 0;
    await renderAccounts(ctx);
  });

  // Account detail
  onCallback('account:details', async (ctx, id) => {
    await renderAccountDetail(ctx, id);
  });

  // Add X manual
  onCallback('account:add_manual', async (ctx) => {
    ctx.session.inputFlow = { type: 'add_x_accounts' };
    await renderScreen(
      ctx,
      '🔑 <b>Add X account</b>\n\nSend credentials in format:\n<code>login:pass:email:pass:phone:token:cookies</code>\n\n📝 One account per line.',
      cancelKb(),
    );
  });

  // Add Threads
  onCallback('account:add_threads', async (ctx) => {
    ctx.session.inputFlow = { type: 'add_threads_accounts' };
    await renderScreen(
      ctx,
      '🧵 <b>Add Threads account</b>\n\nSend credentials in format:\n<code>username:password:2fa_key</code>\n\n🔐 The 2FA key is your TOTP secret (base32).\n📝 One account per line.',
      cancelKb(),
    );
  });

  // Auto-register
  onCallback('account:register', async (ctx) => {
    ctx.session.inputFlow = { type: 'register_x' };
    await renderScreen(
      ctx,
      '🤖 <b>Auto-register X accounts</b>\n\nHow many accounts to create? (1–20)',
      cancelKb(),
    );
  });

  // Assign persona – show picker
  onCallback('account:persona', async (ctx, accountId) => {
    pushScreen(ctx.session, 'account_details', { id: accountId, action: 'persona' });
    const personas = await ctx.services.personaService.getAll();
    if (personas.length === 0) {
      await renderScreen(ctx, '🎭 No personas yet. Create one first!', cancelKb());
      return;
    }
    await renderScreen(
      ctx,
      '🎭 <b>Select persona:</b>',
      personaPickerKb(
        personas.map((p) => ({ id: p.id, name: p.name })),
        0,
      ),
    );
  });

  // Persona picked
  onCallback('persona:pick', async (ctx, personaId) => {
    const entry = ctx.session.navStack[ctx.session.navStack.length - 1];
    const accountId = entry?.params?.['id'];
    if (accountId) {
      await ctx.services.accountService.assignPersona(accountId, personaId);
      await ctx.answerCallbackQuery({ text: 'Persona assigned' }).catch(() => {});
      await renderAccountDetail(ctx, accountId);
    }
  });

  onCallback('page:persona_picker', async (ctx, param) => {
    const personas = await ctx.services.personaService.getAll();
    const page = parseInt(param, 10) || 0;
    await renderScreen(
      ctx,
      '🎭 <b>Select persona:</b>',
      personaPickerKb(
        personas.map((p) => ({ id: p.id, name: p.name })),
        page,
      ),
    );
  });

  // Assign category – show picker
  onCallback('account:category', async (ctx, accountId) => {
    pushScreen(ctx.session, 'account_details', { id: accountId, action: 'category' });
    const categories = await ctx.services.categoryService.getAll();
    if (categories.length === 0) {
      await renderScreen(ctx, '📂 No categories yet. Create one first!', cancelKb());
      return;
    }
    await renderScreen(
      ctx,
      '📂 <b>Select category:</b>',
      categoryPickerKb(
        categories.map((c) => ({ id: c.id, name: c.name })),
        0,
      ),
    );
  });

  // Category picked
  onCallback('category:pick', async (ctx, categoryId) => {
    const entry = ctx.session.navStack[ctx.session.navStack.length - 1];
    const accountId = entry?.params?.['id'];
    if (accountId) {
      await ctx.services.accountService.assignCategory(accountId, categoryId);
      await ctx.answerCallbackQuery({ text: 'Category assigned' }).catch(() => {});
      await renderAccountDetail(ctx, accountId);
    }
  });

  onCallback('page:category_picker', async (ctx, param) => {
    const categories = await ctx.services.categoryService.getAll();
    const page = parseInt(param, 10) || 0;
    await renderScreen(
      ctx,
      '📂 <b>Select category:</b>',
      categoryPickerKb(
        categories.map((c) => ({ id: c.id, name: c.name })),
        page,
      ),
    );
  });

  // Delete – ask confirmation
  onCallback('account:delete_ask', async (ctx, accountId) => {
    const account = await ctx.services.accountService.getById(accountId);
    await renderScreen(
      ctx,
      buildDeleteConfirmMessage('account', account?.handle ?? 'unknown'),
      confirmDeleteKb('account', accountId, `account:details:${accountId}`),
    );
  });

  // Delete – confirmed
  onCallback('account:delete_yes', async (ctx, accountId) => {
    await ctx.services.accountService.delete(accountId);
    await ctx.answerCallbackQuery({ text: 'Account deleted' }).catch(() => {});
    await renderAccounts(ctx);
  });
}

/* ---------------------------------------------------------------- */
/*  Text input handlers                                              */
/* ---------------------------------------------------------------- */

export async function handleAddXAccountsText(ctx: AppContext, text: string): Promise<void> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let added = 0;
  const errors: string[] = [];

  for (const line of lines) {
    const parts = line.split(':').map((p) => p.trim());
    if (parts.length < 7) {
      errors.push(`Invalid format (need 7 fields): ${esc(line.slice(0, 40))}...`);
      continue;
    }
    const [login, , , , , token] = parts;
    if (!login || !token) {
      errors.push(`Missing login or token: ${esc(line.slice(0, 40))}...`);
      continue;
    }
    const account = await ctx.services.accountService.create({
      platform: 'x',
      handle: login,
      username: login,
      encryptedTokens: null,
      useCamoufox: 1,
    });
    await ctx.services.accountService.setCamoufoxCredentials(account.id, encryptText(token));
    added++;
  }

  clearFlow(ctx.session);
  const msgParts: string[] = [];
  if (added > 0) msgParts.push(`Added <b>${added}</b> account(s).`);
  if (errors.length > 0) msgParts.push(`Errors:\n${errors.join('\n')}`);
  await ctx.reply(msgParts.join('\n\n') || 'No accounts added.', { parse_mode: 'HTML' });
  if (added > 0) await renderAccounts(ctx);
}

export async function handleAddThreadsAccountsText(ctx: AppContext, text: string): Promise<void> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let added = 0;
  const errors: string[] = [];

  for (const line of lines) {
    const parts = line.split(':').map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Invalid format (need username:password:2fa_key): ${esc(line.slice(0, 40))}...`);
      continue;
    }
    const [username, password, ...rest] = parts;
    const totpSecret = rest.join(':').trim();
    if (!username || !password || !totpSecret) {
      errors.push(`Missing field: ${esc(line.slice(0, 40))}...`);
      continue;
    }
    const account = await ctx.services.accountService.create({
      platform: 'threads',
      handle: username,
      username,
      encryptedTokens: null,
      useCamoufox: 1,
    });
    await ctx.services.accountService.setPassword(account.id, encryptText(password));
    await ctx.services.accountService.set2faSecret(account.id, encryptText(totpSecret));
    await ctx.services.accountService.updateStatus(account.id, 'active');
    added++;
  }

  clearFlow(ctx.session);
  const msgParts: string[] = [];
  if (added > 0) msgParts.push(`Added <b>${added}</b> Threads account(s).`);
  if (errors.length > 0) msgParts.push(`Errors:\n${errors.join('\n')}`);
  await ctx.reply(msgParts.join('\n\n') || 'No accounts added.', { parse_mode: 'HTML' });
  if (added > 0) await renderAccounts(ctx);
}

export async function handleRegisterXText(ctx: AppContext, text: string): Promise<void> {
  const num = parseInt(text.trim(), 10);
  if (isNaN(num) || num < 1 || num > 20) {
    await ctx.reply('Send a number between 1 and 20.');
    return;
  }
  clearFlow(ctx.session);
  try {
    const tasks = await ctx.services.registrationService.queueAutoRegistration({
      count: num,
      createdByUserId: ctx.authUserId!,
    });
    await ctx.reply(
      `✅ Queued <b>${tasks.length}</b> registration task(s).\n\n🤖 The worker will automatically generate emails, register accounts, and assign personas.\n\n⏳ Check Accounts in a few minutes.`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    logger.error({ err }, 'Registration queue failed');
    await ctx.reply('Failed to queue registration. Please try again.');
  }
  await renderAccounts(ctx);
}
