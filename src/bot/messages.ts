/** Escape Markdown v1 special characters */
export function escMd(s: string): string {
  return s.replace(/([_*`\[])/g, '\\$1');
}

export function buildMainMenuMessage(): string {
  return `*Welcome to Qwebek*

Advertising platform for social media management.

Choose an option:`;
}

export function buildAccountsListMessage(
  accounts: Array<{ handle: string; platform: string; personaName?: string; categoryName?: string; status: string }>
): string {
  if (accounts.length === 0) {
    return 'No accounts yet. Add an account to get started.';
  }
  const lines = accounts.map(
    (a) =>
      `• @${escMd(a.handle)} (${a.platform})`
      + (a.personaName ? ` | ${escMd(a.personaName)}` : '')
      + (a.categoryName ? ` | ${escMd(a.categoryName)}` : '')
      + ` | ${a.status}`
  );
  return `*Accounts* (${accounts.length})\n\n${lines.join('\n')}`;
}

export function buildPersonasListMessage(
  personas: Array<{ name: string; slug: string }>
): string {
  if (personas.length === 0) {
    return 'No personas yet. Create a persona first.';
  }
  const lines = personas.map((p) => `• ${escMd(p.name)} (\`${escMd(p.slug)}\`)`);
  return `*Personas* (${personas.length})\n\n${lines.join('\n')}`;
}

export function buildCategoriesListMessage(
  categories: Array<{ name: string; slug: string }>
): string {
  if (categories.length === 0) {
    return 'No categories yet. Create a category first.';
  }
  const lines = categories.map((c) => `• ${escMd(c.name)} (\`${escMd(c.slug)}\`)`);
  return `*Categories* (${categories.length})\n\n${lines.join('\n')}`;
}

export function buildCampaignsListMessage(
  campaigns: Array<{ name: string; id: string; status: string }>
): string {
  if (campaigns.length === 0) {
    return 'No campaigns yet. Create a campaign first.';
  }
  const lines = campaigns.map((c) => `• ${escMd(c.name)} | \`${c.id}\` | ${c.status}`);
  return `*Campaigns* (${campaigns.length})\n\n${lines.join('\n')}`;
}

export function buildCampaignDetailsMessage(
  campaign: {
    name: string;
    description?: string | null;
    status: string;
    materialsCount: number;
    targetCategoryNames?: string;
  }
): string {
  const lines = [
    `*Campaign: ${escMd(campaign.name)}*`,
    '',
    `Status: ${campaign.status}`,
    `Materials: ${campaign.materialsCount}`,
    campaign.targetCategoryNames ? `Target categories: ${escMd(campaign.targetCategoryNames)}` : 'Target categories: all',
    campaign.description ? `\n${escMd(campaign.description)}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildOAuthPromptMessage(authUrl: string): string {
  return `*Connect X account*

1. Open this link in your browser:
${authUrl}

2. Authorize the app and copy the PIN code

3. Send me the PIN here`;
}

export function buildPostingStartedMessage(campaignName: string, count: number): string {
  return `*Posting started*

Campaign: ${escMd(campaignName)}
Posts queued: ${count}

Check back later for status.`;
}
