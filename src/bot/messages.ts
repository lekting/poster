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
      `• @${a.handle} (${a.platform})`
      + (a.personaName ? ` | ${a.personaName}` : '')
      + (a.categoryName ? ` | ${a.categoryName}` : '')
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
  const lines = personas.map((p) => `• ${p.name} (\`${p.slug}\`)`);
  return `*Personas* (${personas.length})\n\n${lines.join('\n')}`;
}

export function buildCategoriesListMessage(
  categories: Array<{ name: string; slug: string }>
): string {
  if (categories.length === 0) {
    return 'No categories yet. Create a category first.';
  }
  const lines = categories.map((c) => `• ${c.name} (\`${c.slug}\`)`);
  return `*Categories* (${categories.length})\n\n${lines.join('\n')}`;
}

export function buildCampaignsListMessage(
  campaigns: Array<{ name: string; id: string; status: string }>
): string {
  if (campaigns.length === 0) {
    return 'No campaigns yet. Create a campaign first.';
  }
  const lines = campaigns.map((c) => `• ${c.name} | \`${c.id}\` | ${c.status}`);
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
    `*Campaign: ${campaign.name}*`,
    '',
    `Status: ${campaign.status}`,
    `Materials: ${campaign.materialsCount}`,
    campaign.targetCategoryNames ? `Target categories: ${campaign.targetCategoryNames}` : 'Target categories: all',
    campaign.description ? `\n${campaign.description}` : ''
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

Campaign: ${campaignName}
Posts queued: ${count}

Check back later for status.`;
}
