export type AwaitingInput =
  | 'account_credentials'
  | 'reg_count'
  | 'persona_name'
  | 'persona_slug'
  | 'persona_prompt'
  | 'category_name'
  | 'category_slug'
  | 'campaign_name'
  | 'ad_content'
  | 'ad_media'
  | 'oauth_pin'
  | null;

export interface BotSession {
  awaitingInput: AwaitingInput;
  accountIdForInput: string | null;
  campaignIdForInput: string | null;
  pendingNameForInput: string | null;
  oauthTokenForInput: string | null;
  oauthTokenSecretForInput: string | null;
  selectedCampaignId: string | null;
  selectedAccountIds: string[];
  campaignIdForTargetCategories: string | null;
  targetCategoriesSelected: string[];
  pendingAdContent: string | null;
}

export const initialSession = (): BotSession => ({
  awaitingInput: null,
  accountIdForInput: null,
  campaignIdForInput: null,
  pendingNameForInput: null,
  oauthTokenForInput: null,
  oauthTokenSecretForInput: null,
  selectedCampaignId: null,
  selectedAccountIds: [],
  campaignIdForTargetCategories: null,
  targetCategoriesSelected: [],
  pendingAdContent: null
});
