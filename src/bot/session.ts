/* ---------------------------------------------------------------- */
/*  Session types                                                    */
/* ---------------------------------------------------------------- */

export type ScreenId =
  | 'main'
  | 'accounts'
  | 'account_details'
  | 'personas'
  | 'persona_details'
  | 'categories'
  | 'category_details'
  | 'campaigns'
  | 'campaign_details'
  | 'post_confirm';

export interface NavEntry {
  screen: ScreenId;
  /** e.g. { id: '<uuid>' } for detail screens */
  params?: Record<string, string>;
}

/* Discriminated union – each multi-step flow keeps only its own data */
export type InputFlow =
  | { type: 'add_x_accounts' }
  | { type: 'add_threads_accounts' }
  | { type: 'register_x' }
  | { type: 'create_persona'; step: 'name' | 'slug' | 'prompt'; name?: string; slug?: string }
  | { type: 'create_category'; step: 'name' | 'slug'; name?: string }
  | { type: 'create_campaign' }
  | { type: 'add_material'; step: 'content' | 'media'; campaignId: string; content?: string };

export interface BotSession {
  /** Breadcrumb stack (max 6). Back = pop. */
  navStack: NavEntry[];

  /** Active text-input flow, or null when idle */
  inputFlow: InputFlow | null;

  /** Per-screen page cursors */
  page: Record<string, number>;

  /** Multi-select: target category picker */
  targetCategoryIds: string[];
  targetCampaignId: string | null;

  /** ID of the bot's "active menu" message so we always edit it */
  menuMessageId: number | null;
}

export const initialSession = (): BotSession => ({
  navStack: [{ screen: 'main' }],
  inputFlow: null,
  page: {},
  targetCategoryIds: [],
  targetCampaignId: null,
  menuMessageId: null,
});
