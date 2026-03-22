/** Escape HTML special characters in user-supplied content */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const STATUS_EMOJI: Record<string, string> = {
  active: '🟢',
  inactive: '⚪',
  suspended: '🔴',
  banned: '🔴',
  pending: '🟡',
  running: '🟢',
  paused: '⏸',
  completed: '✅',
  draft: '📝',
};

function statusIcon(status: string): string {
  return STATUS_EMOJI[status] ?? '⚪';
}

/* ---------------------------------------------------------------- */
/*  Main menu                                                        */
/* ---------------------------------------------------------------- */

export function buildMainMenuMessage(): string {
  return (
    `🚀 <b>Qwebek</b>\n\n` +
    `Advertising platform for social media management.\n\n` +
    `Choose a section below 👇`
  );
}

/* ---------------------------------------------------------------- */
/*  Accounts                                                         */
/* ---------------------------------------------------------------- */

export function buildAccountsMessage(
  accounts: Array<{
    handle: string;
    platform: string;
    personaName?: string;
    categoryName?: string;
    status: string;
  }>,
  page: number,
  totalPages: number,
): string {
  if (accounts.length === 0) {
    return '📱 <b>Accounts</b>\n\n📭 No accounts yet. Add one to get started!';
  }
  const platformIcon = (p: string) => (p === 'threads' ? '🧵' : '𝕏');
  const lines = accounts.map((a) => {
    let line = `${statusIcon(a.status)} ${platformIcon(a.platform)} <b>@${esc(a.handle)}</b>`;
    if (a.personaName) line += ` · 🎭 ${esc(a.personaName)}`;
    if (a.categoryName) line += ` · 📂 ${esc(a.categoryName)}`;
    return line;
  });
  const pageInfo = totalPages > 1 ? ` · ${page + 1}/${totalPages}` : '';
  return `📱 <b>Accounts</b>${pageInfo}\n\n${lines.join('\n')}`;
}

export function buildAccountDetailMessage(account: {
  handle: string;
  platform: string;
  status: string;
  personaName?: string;
  categoryName?: string;
}): string {
  const platformIcon = account.platform === 'threads' ? '🧵' : '𝕏';
  const lines = [
    `📱 <b>@${esc(account.handle)}</b>`,
    '',
    `${platformIcon} Platform: <i>${account.platform}</i>`,
    `${statusIcon(account.status)} Status: <code>${account.status}</code>`,
  ];
  if (account.personaName) lines.push(`🎭 Persona: ${esc(account.personaName)}`);
  else lines.push(`🎭 Persona: <i>not assigned</i>`);
  if (account.categoryName) lines.push(`📂 Category: ${esc(account.categoryName)}`);
  else lines.push(`📂 Category: <i>not assigned</i>`);
  return lines.join('\n');
}

/* ---------------------------------------------------------------- */
/*  Personas                                                         */
/* ---------------------------------------------------------------- */

export function buildPersonasMessage(
  personas: Array<{ name: string; slug: string }>,
  page: number,
  totalPages: number,
): string {
  if (personas.length === 0) {
    return '🎭 <b>Personas</b>\n\n📭 No personas yet. Create one first!';
  }
  const lines = personas.map((p) => `🎭 <b>${esc(p.name)}</b> · <code>${esc(p.slug)}</code>`);
  const pageInfo = totalPages > 1 ? ` · ${page + 1}/${totalPages}` : '';
  return `🎭 <b>Personas</b>${pageInfo}\n\n${lines.join('\n')}`;
}

/* ---------------------------------------------------------------- */
/*  Categories                                                       */
/* ---------------------------------------------------------------- */

export function buildCategoriesMessage(
  categories: Array<{ name: string; slug: string }>,
  page: number,
  totalPages: number,
): string {
  if (categories.length === 0) {
    return '📂 <b>Categories</b>\n\n📭 No categories yet. Create one first!';
  }
  const lines = categories.map((c) => `📂 <b>${esc(c.name)}</b> · <code>${esc(c.slug)}</code>`);
  const pageInfo = totalPages > 1 ? ` · ${page + 1}/${totalPages}` : '';
  return `📂 <b>Categories</b>${pageInfo}\n\n${lines.join('\n')}`;
}

/* ---------------------------------------------------------------- */
/*  Campaigns                                                        */
/* ---------------------------------------------------------------- */

export function buildCampaignsMessage(
  campaigns: Array<{ name: string; id: string; status: string }>,
  page: number,
  totalPages: number,
): string {
  if (campaigns.length === 0) {
    return '📢 <b>Campaigns</b>\n\n📭 No campaigns yet. Create one first!';
  }
  const lines = campaigns.map(
    (c) => `${statusIcon(c.status)} <b>${esc(c.name)}</b> · <code>${c.status}</code>`,
  );
  const pageInfo = totalPages > 1 ? ` · ${page + 1}/${totalPages}` : '';
  return `📢 <b>Campaigns</b>${pageInfo}\n\n${lines.join('\n')}`;
}

export function buildCampaignDetailMessage(campaign: {
  name: string;
  description?: string | null;
  status: string;
  materialsCount: number;
  targetCategoryNames?: string;
}): string {
  const lines = [
    `📢 <b>${esc(campaign.name)}</b>`,
    '',
    `${statusIcon(campaign.status)} Status: <code>${campaign.status}</code>`,
    `📎 Materials: ${campaign.materialsCount}`,
    campaign.targetCategoryNames
      ? `🎯 Target: ${esc(campaign.targetCategoryNames)}`
      : '🎯 Target: all categories',
  ];
  if (campaign.description) lines.push(`\n💬 ${esc(campaign.description)}`);
  return lines.filter(Boolean).join('\n');
}

/* ---------------------------------------------------------------- */
/*  Posting                                                          */
/* ---------------------------------------------------------------- */

export function buildPostConfirmMessage(
  campaignName: string,
  accountCount: number,
  hint: string,
): string {
  return (
    `🚀 <b>Launch campaign</b>\n\n` +
    `📢 Campaign: <b>${esc(campaignName)}</b>\n` +
    `👥 Accounts: ${accountCount}\n` +
    `💡 ${hint}\n\n` +
    `Press <b>🚀 Launch</b> to confirm.`
  );
}

export function buildPostingStartedMessage(
  campaignName: string,
  count: number,
): string {
  return (
    `✅ <b>Posting launched!</b>\n\n` +
    `📢 Campaign: ${esc(campaignName)}\n` +
    `📤 Posts queued: ${count}\n\n` +
    `⏳ Check back later for status.`
  );
}

/* ---------------------------------------------------------------- */
/*  Shared                                                           */
/* ---------------------------------------------------------------- */

export function buildDeleteConfirmMessage(
  entityType: string,
  entityName: string,
): string {
  return (
    `⚠️ <b>Delete ${entityType}?</b>\n\n` +
    `You are about to delete <b>${esc(entityName)}</b>.\n\n` +
    `❌ This action cannot be undone.`
  );
}

export function buildTargetCategoriesMessage(
  selectedNames: string[],
): string {
  if (selectedNames.length === 0) {
    return '🎯 <b>Target categories</b>\n\n📋 Tap categories to toggle, then press ✅ Done.';
  }
  return (
    `🎯 <b>Target categories</b>\n\n` +
    `✅ Selected: ${selectedNames.map((n) => esc(n)).join(', ')}\n\n` +
    `📋 Tap to toggle, then press ✅ Done.`
  );
}

export function buildInputPrompt(prompt: string): string {
  return prompt;
}
