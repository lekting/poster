import { InlineKeyboard } from 'grammy';

export const PAGE_SIZE = 8;

export function totalPages(count: number): number {
  return Math.max(1, Math.ceil(count / PAGE_SIZE));
}

/* ---------------------------------------------------------------- */
/*  Generic pagination builder                                       */
/* ---------------------------------------------------------------- */

export function paginatedList(
  items: Array<{ id: string; label: string }>,
  page: number,
  callbackPrefix: string,
  pagePrefix: string,
  opts?: {
    actions?: Array<{ label: string; data: string }>;
    back?: string;
  },
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const tp = totalPages(items.length);
  const p = Math.max(0, Math.min(page, tp - 1));
  const slice = items.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  for (const item of slice) {
    kb.text(item.label, `${callbackPrefix}:${item.id}`).row();
  }

  if (tp > 1) {
    if (p > 0) kb.text('◀️', `${pagePrefix}:${p - 1}`);
    kb.text(`📄 ${p + 1}/${tp}`, 'noop');
    if (p < tp - 1) kb.text('▶️', `${pagePrefix}:${p + 1}`);
    kb.row();
  }

  if (opts?.actions) {
    for (const a of opts.actions) {
      kb.text(a.label, a.data).row();
    }
  }

  if (opts?.back) kb.text('🔙 Back', opts.back);
  return kb;
}

/* ---------------------------------------------------------------- */
/*  Main menu                                                        */
/* ---------------------------------------------------------------- */

export function mainMenuKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📱 Accounts', 'nav:accounts')
    .text('🎭 Personas', 'nav:personas')
    .row()
    .text('📂 Categories', 'nav:categories')
    .text('📢 Campaigns', 'nav:campaigns');
}

/* ---------------------------------------------------------------- */
/*  Accounts                                                         */
/* ---------------------------------------------------------------- */

export function accountsKb(
  accounts: Array<{ id: string; handle: string }>,
  page: number,
): InlineKeyboard {
  return paginatedList(
    accounts.map((a) => ({ id: a.id, label: `📱 @${a.handle}` })),
    page,
    'account:details',
    'page:accounts',
    {
      actions: [
        { label: '🤖 Register X (auto)', data: 'account:register' },
        { label: '🔑 Add X (auth_token)', data: 'account:add_manual' },
        { label: '🧵 Add Threads', data: 'account:add_threads' },
      ],
      back: 'nav:main',
    },
  );
}

export function accountDetailKb(accountId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎭 Persona', `account:persona:${accountId}`)
    .text('📂 Category', `account:category:${accountId}`)
    .row()
    .text('🗑 Delete', `account:delete_ask:${accountId}`)
    .row()
    .text('🔙 Back', 'nav:accounts');
}

/* ---------------------------------------------------------------- */
/*  Personas                                                         */
/* ---------------------------------------------------------------- */

export function personasKb(
  personas: Array<{ id: string; name: string }>,
  page: number,
): InlineKeyboard {
  return paginatedList(
    personas.map((p) => ({ id: p.id, label: `🎭 ${p.name}` })),
    page,
    'persona:details',
    'page:personas',
    {
      actions: [{ label: '➕ Create Persona', data: 'persona:add' }],
      back: 'nav:main',
    },
  );
}

/** Persona picker used when assigning persona to an account */
export function personaPickerKb(
  personas: Array<{ id: string; name: string }>,
  page: number,
): InlineKeyboard {
  return paginatedList(
    personas.map((p) => ({ id: p.id, label: `🎭 ${p.name}` })),
    page,
    'persona:pick',
    'page:persona_picker',
    { back: 'nav:back' },
  );
}

/* ---------------------------------------------------------------- */
/*  Categories                                                       */
/* ---------------------------------------------------------------- */

export function categoriesKb(
  categories: Array<{ id: string; name: string }>,
  page: number,
): InlineKeyboard {
  return paginatedList(
    categories.map((c) => ({ id: c.id, label: `📂 ${c.name}` })),
    page,
    'category:details',
    'page:categories',
    {
      actions: [{ label: '➕ Create Category', data: 'category:add' }],
      back: 'nav:main',
    },
  );
}

/** Category picker used when assigning category to an account */
export function categoryPickerKb(
  categories: Array<{ id: string; name: string }>,
  page: number,
): InlineKeyboard {
  return paginatedList(
    categories.map((c) => ({ id: c.id, label: `📂 ${c.name}` })),
    page,
    'category:pick',
    'page:category_picker',
    { back: 'nav:back' },
  );
}

/* ---------------------------------------------------------------- */
/*  Campaigns                                                        */
/* ---------------------------------------------------------------- */

export function campaignsKb(
  campaigns: Array<{ id: string; name: string }>,
  page: number,
): InlineKeyboard {
  return paginatedList(
    campaigns.map((c) => ({ id: c.id, label: `📢 ${c.name}` })),
    page,
    'campaign:details',
    'page:campaigns',
    {
      actions: [{ label: '➕ Create Campaign', data: 'campaign:add' }],
      back: 'nav:main',
    },
  );
}

export function campaignDetailKb(campaignId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('📎 Add Material', `campaign:material:${campaignId}`)
    .text('🎯 Targets', `campaign:targets:${campaignId}`)
    .row()
    .text('🚀 Launch', `campaign:post_ask:${campaignId}`)
    .row()
    .text('🗑 Delete', `campaign:delete_ask:${campaignId}`)
    .row()
    .text('🔙 Back', 'nav:campaigns');
}

export function targetCategoriesKb(
  campaignId: string,
  categories: Array<{ id: string; name: string }>,
  selectedIds: string[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of categories) {
    const sel = selectedIds.includes(c.id);
    kb.text(sel ? `✅ ${c.name}` : `⬜ ${c.name}`, `target:toggle:${c.id}`).row();
  }
  kb.text('✅ Done', `target:done:${campaignId}`).row();
  kb.text('🔙 Back', `campaign:details:${campaignId}`);
  return kb;
}

/* ---------------------------------------------------------------- */
/*  Confirm / Cancel                                                 */
/* ---------------------------------------------------------------- */

export function confirmDeleteKb(
  prefix: string,
  entityId: string,
  cancelTarget: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text('🗑 Yes, delete', `${prefix}:delete_yes:${entityId}`)
    .text('↩️ Cancel', cancelTarget);
}

export function postConfirmKb(campaignId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🚀 Launch', `campaign:post_yes:${campaignId}`)
    .row()
    .text('🔙 Back', `campaign:details:${campaignId}`);
}

export function cancelKb(): InlineKeyboard {
  return new InlineKeyboard().text('↩️ Cancel', 'cancel_input');
}
