import { InlineKeyboard } from 'grammy';

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📱 Accounts', 'menu:accounts')
    .text('🎭 Personas', 'menu:personas')
    .row()
    .text('📂 Categories', 'menu:categories')
    .text('📢 Campaigns', 'menu:campaigns')
    .row()
    .text('📤 Post', 'menu:post');
}

export function accountsKeyboard(
  accounts?: Array<{ id: string; handle: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (accounts?.length) {
    for (const a of accounts) {
      kb.text(`@${a.handle}`, `account:details:${a.id}`).row();
    }
  }
  kb.text('🤖 Register X (auto)', 'account:register').row();
  kb.text('🔑 Add X account (auth_token)', 'account:add_manual').row();
  kb.text('🧵 Add Threads account', 'account:add_threads').row();
  kb.text('🏠 Main menu', 'menu:main');
  return kb;
}

export function accountDetailsKeyboard(accountId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Assign Persona', `account:persona:${accountId}`)
    .text('Assign Category', `account:category:${accountId}`)
    .row()
    .text('🗑 Delete', `account:delete:${accountId}`)
    .row()
    .text('◀ Back', 'menu:accounts');
}

export function personasKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Create Persona', 'persona:add')
    .row()
    .text('🏠 Main menu', 'menu:main');
}

export function personaSelectKeyboard(personas: Array<{ id: string; name: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of personas) {
    kb.text(p.name, `persona:select:${p.id}`).row();
  }
  kb.text('◀ Back', 'menu:accounts');
  return kb;
}

export function categoriesKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Create Category', 'category:add')
    .row()
    .text('🏠 Main menu', 'menu:main');
}

export function categorySelectKeyboard(categories: Array<{ id: string; name: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of categories) {
    kb.text(c.name, `category:select:${c.id}`).row();
  }
  kb.text('◀ Back', 'menu:accounts');
  return kb;
}

export function campaignsKeyboard(
  campaigns?: Array<{ id: string; name: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (campaigns?.length) {
    for (const c of campaigns) {
      kb.text(c.name, `campaign:details:${c.id}`).row();
    }
  }
  kb.text('➕ Create Campaign', 'campaign:add').row();
  kb.text('🏠 Main menu', 'menu:main');
  return kb;
}

export function campaignDetailsKeyboard(campaignId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Add Material', `campaign:material:${campaignId}`)
    .text('📂 Target Categories', `campaign:target_categories:${campaignId}`)
    .row()
    .text('🗑 Delete', `campaign:delete:${campaignId}`)
    .row()
    .text('◀ Back', 'menu:campaigns');
}

export function campaignTargetCategoriesKeyboard(
  campaignId: string,
  categories: Array<{ id: string; name: string }>,
  selectedIds: string[]
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of categories) {
    const isSelected = selectedIds.includes(c.id);
    kb.text(isSelected ? `✓ ${c.name}` : c.name, `category:target_toggle:${c.id}`).row();
  }
  kb.text('✅ Done', `campaign:target_done:${campaignId}`).row();
  kb.text('◀ Back', `campaign:details:${campaignId}`);
  return kb;
}

export function campaignSelectKeyboard(campaigns: Array<{ id: string; name: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of campaigns) {
    kb.text(c.name, `campaign:select:${c.id}`).row();
  }
  kb.text('◀ Back', 'menu:main');
  return kb;
}

export function postCampaignKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Select Campaign', 'post:select_campaign')
    .row()
    .text('🏠 Main menu', 'menu:main');
}

export function postConfirmKeyboard(campaignId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Start Posting', `post:confirm:${campaignId}`)
    .row()
    .text('◀ Back', 'menu:post');
}
