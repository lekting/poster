import { generateText, LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../../config/index.js';

export interface GeneratePersonaAndCategoryResult {
  personaName: string;
  personaSlug: string;
  personaSystemPrompt: string;
  categoryName: string;
  categorySlug: string;
}

export interface GeneratePostInput {
  adContent: string;
  personaName: string;
  personaSystemPrompt: string | null;
  platform?: string;
  isPremium?: boolean;
}

function createModel(modelName: string): LanguageModel {
  if (config.LLM_PROVIDER === 'openrouter') {
    if (!config.OPENROUTER_API_KEY) {
      throw new Error(
        'OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter'
      );
    }
    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.OPENROUTER_API_KEY,
      headers: {
        ...(config.OPENROUTER_SITE_URL
          ? { 'HTTP-Referer': config.OPENROUTER_SITE_URL }
          : {}),
        'X-Title': config.PROJECT_NAME
      }
    });
    return openrouter(modelName);
  }

  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }
  process.env.OPENAI_API_KEY = config.OPENAI_API_KEY;
  const openai = createOpenAI({ apiKey: config.OPENAI_API_KEY });
  return openai(modelName);
}

export class LLMService {
  /** Calculate post length the way X does: each URL counts as 23 chars (t.co shortening). */
  static xCharCount(text: string): number {
    const URL_WEIGHT = 23;
    const urlRegex = /https?:\/\/[^\s)}\]]+/g;
    let count = text.length;
    for (const match of text.matchAll(urlRegex)) {
      count -= match[0].length;
      count += URL_WEIGHT;
    }
    return count;
  }
  async generatePostText(input: GeneratePostInput): Promise<string> {
    const maxLength = input.isPremium ? 1200 : 280;

    const personaHint = input.personaSystemPrompt
      ? `Your personality/voice: ${input.personaSystemPrompt}\nAdapt the tone to match this personality.`
      : 'Write in a casual, authentic social media voice.';

    const lengthRule = input.isPremium
      ? `Keep it concise but include enough detail to be convincing. Max ${maxLength} characters.`
      : `STRICT LIMIT: Max ${maxLength} characters total (non-premium X account). IMPORTANT: On X, every URL counts as only 23 characters regardless of actual length. So you have room for text + links. Be concise — short punchy sentences. You MUST include ALL links from the original.`;

    const systemPrompt = `You are rewriting ad content for a social media post on X/Twitter.

${personaHint}

CRITICAL RULES:
1. You MUST preserve ALL links/URLs from the ad content exactly as they are.
2. You MUST preserve the core message and key facts (product names, wallet addresses, stats, numbers).
3. Make it feel like a personal recommendation or experience, NOT like a copy-pasted ad.
4. ${lengthRule}
5. Do NOT add hashtags unless they were in the original.
6. Output ONLY the post text, no explanations or commentary.`;

    const { text } = await generateText({
      model: createModel(config.OPENAI_MODEL_POST_AD),
      system: systemPrompt,
      prompt: `Ad content to rewrite (preserve all links and key details):\n\n${input.adContent}`
    });

    const trimmed = text.trim();

    // Use X-aware character counting (URLs = 23 chars each)
    if (LLMService.xCharCount(trimmed) <= maxLength) return trimmed;

    // Smart truncation: preserve URLs, trim surrounding text
    return LLMService.smartTruncate(trimmed, maxLength);
  }

  /** Truncate text to fit X char limit while preserving all URLs. */
  private static smartTruncate(text: string, maxLength: number): string {
    const urlRegex = /https?:\/\/[^\s)}\]]+/g;
    const urls: string[] = [];
    for (const m of text.matchAll(urlRegex)) urls.push(m[0]);

    // If no URLs, simple truncation
    if (urls.length === 0) {
      return text.substring(0, maxLength - 1) + '…';
    }

    // Split text into segments around URLs, truncate non-URL parts
    const URL_WEIGHT = 23;
    const urlTotalWeight = urls.length * URL_WEIGHT;
    const budgetForText = maxLength - urlTotalWeight - 1; // -1 for safety

    // Rebuild: keep text before/between/after URLs, truncating as needed
    const parts = text.split(urlRegex);
    const totalTextLen = parts.reduce((s, p) => s + p.length, 0);

    if (budgetForText <= 0) {
      // Extreme case: just URLs
      return urls.join('\n');
    }

    const ratio = Math.min(1, budgetForText / totalTextLen);
    let result = '';
    for (let i = 0; i < parts.length; i++) {
      const partBudget = Math.floor(parts[i].length * ratio);
      const trimmedPart = parts[i].substring(0, partBudget).trimEnd();
      result += trimmedPart;
      if (i < urls.length) {
        if (result.length > 0 && !result.endsWith('\n') && !result.endsWith(' ')) result += ' ';
        result += urls[i];
      }
    }

    return result.trim();
  }

  async generatePersonaAndCategoryForAccount(
    handle: string
  ): Promise<GeneratePersonaAndCategoryResult> {
    const systemPrompt = `You are helping set up a social media advertising account. Given an X/Twitter handle (username), invent a fitting persona and category for this account.

Output a JSON object with exactly these keys (no extra keys):
- personaName: short display name (e.g. "Aggressive Trader", "Beauty Blogger")
- personaSlug: URL-safe slug (lowercase, hyphens, e.g. "aggressive-trader")
- personaSystemPrompt: 1-2 sentences describing the persona's voice, style, and interests for LLM post adaptation
- categoryName: category display name (e.g. "Crypto", "Beauty")
- categorySlug: URL-safe slug (lowercase, hyphens, e.g. "crypto")

Be creative and varied. Match persona/category to what the handle might suggest. Output ONLY valid JSON, no markdown or explanation.`;

    const { text } = await generateText({
      model: createModel(config.OPENAI_MODEL_PERSONA),
      system: systemPrompt,
      prompt: `Handle: @${handle}`
    });

    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/\s*```\s*$/i, '');
    const parsed = JSON.parse(cleaned) as GeneratePersonaAndCategoryResult;

    return {
      personaName: String(parsed.personaName ?? 'Default').trim() || 'Default',
      personaSlug:
        String(parsed.personaSlug ?? 'default')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || 'default',
      personaSystemPrompt:
        String(parsed.personaSystemPrompt ?? '').trim() || '',
      categoryName:
        String(parsed.categoryName ?? 'General').trim() || 'General',
      categorySlug:
        String(parsed.categorySlug ?? 'general')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || 'general'
    };
  }

  async generateOrganicPost(input: {
    personaName: string;
    personaSystemPrompt: string | null;
    categoryName?: string | null;
  }): Promise<string> {
    const personaDesc = input.personaSystemPrompt
      ? `Personality: ${input.personaSystemPrompt}`
      : 'Generic social media user';
    const categoryHint = input.categoryName
      ? `Category/niche: ${input.categoryName}.`
      : '';

    const systemPrompt = `You are a social media account (${input.personaName}). ${personaDesc}. ${categoryHint}

Generate ONE short organic post (not advertising) that fits this persona. Examples: opinion, tip, observation, question, hot take, meme-style comment. Be authentic and varied. Output ONLY the post text. Max 280 characters for X/Twitter. No hashtag spam.`;

    const { text } = await generateText({
      model: createModel(config.OPENAI_MODEL_ORGANIC_POST),
      system: systemPrompt,
      prompt: 'Generate a single organic post now.'
    });

    const trimmed = text.trim();
    return trimmed.length > 280 ? trimmed.substring(0, 277) + '...' : trimmed;
  }
}
