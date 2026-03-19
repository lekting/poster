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
}

function createModel(modelName: string): LanguageModel {
  if (config.LLM_PROVIDER === 'openrouter') {
    if (!config.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter');
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
  async generatePostText(input: GeneratePostInput): Promise<string> {
    const systemPrompt = input.personaSystemPrompt
      ? `You are a social media account with this personality: ${input.personaSystemPrompt}. Rewrite the following ad content in your voice and style. The result must NOT look like advertising: weave the message naturally, make it feel like your personal opinion or recommendation, not a sponsored post. Keep it authentic. Output only the post text, no explanations. Max 280 characters for X/Twitter.`
      : `Rewrite the following ad content for social media. The result must NOT look like advertising: make it feel organic and natural, like a personal recommendation. Output only the post text. Max 280 characters for X/Twitter.`;

    const { text } = await generateText({
      model: createModel(config.OPENAI_MODEL_POST_AD),
      system: systemPrompt,
      prompt: `Ad content to adapt:\n\n${input.adContent}`,
      maxOutputTokens: 150
    });

    const trimmed = text.trim();
    return trimmed.length > 280 ? trimmed.substring(0, 277) + '...' : trimmed;
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
      prompt: `Handle: @${handle}`,
      maxOutputTokens: 300
    });

    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '');
    const parsed = JSON.parse(cleaned) as GeneratePersonaAndCategoryResult;

    return {
      personaName: String(parsed.personaName ?? 'Default').trim() || 'Default',
      personaSlug:
        String(parsed.personaSlug ?? 'default')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || 'default',
      personaSystemPrompt: String(parsed.personaSystemPrompt ?? '').trim() || '',
      categoryName: String(parsed.categoryName ?? 'General').trim() || 'General',
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
    const categoryHint = input.categoryName ? `Category/niche: ${input.categoryName}.` : '';

    const systemPrompt = `You are a social media account (${input.personaName}). ${personaDesc}. ${categoryHint}

Generate ONE short organic post (not advertising) that fits this persona. Examples: opinion, tip, observation, question, hot take, meme-style comment. Be authentic and varied. Output ONLY the post text. Max 280 characters for X/Twitter. No hashtag spam.`;

    const { text } = await generateText({
      model: createModel(config.OPENAI_MODEL_ORGANIC_POST),
      system: systemPrompt,
      prompt: 'Generate a single organic post now.',
      maxOutputTokens: 150
    });

    const trimmed = text.trim();
    return trimmed.length > 280 ? trimmed.substring(0, 277) + '...' : trimmed;
  }
}
