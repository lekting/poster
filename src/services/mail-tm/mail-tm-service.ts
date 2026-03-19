import { logger } from '../../shared/logger.js';

const BASE_URL = 'https://api.mail.tm';

const ADJECTIVES = [
  'swift', 'dark', 'bright', 'cool', 'tech', 'fast', 'smart', 'bold',
  'fresh', 'wild', 'crisp', 'sharp', 'keen', 'lean', 'pure', 'raw'
];
const NOUNS = [
  'pixel', 'wave', 'node', 'chain', 'flux', 'byte', 'spark', 'loop',
  'drift', 'echo', 'grid', 'pulse', 'core', 'edge', 'root', 'base'
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateRandomUsername(): string {
  const adj = randomElement(ADJECTIVES);
  const noun = randomElement(NOUNS);
  const num = Math.floor(Math.random() * 9000 + 1000);
  return `${adj}_${noun}${num}`;
}

function generateRandomPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%';
  const all = upper + lower + digits + special;
  let pass = '';
  pass += upper[Math.floor(Math.random() * upper.length)];
  pass += lower[Math.floor(Math.random() * lower.length)];
  pass += digits[Math.floor(Math.random() * digits.length)];
  pass += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 16; i++) {
    pass += all[Math.floor(Math.random() * all.length)];
  }
  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

function extractVerificationCode(text: string): string | null {
  const matches = text.match(/\b(\d{6,8})\b/g);
  return matches?.[0] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface MailTmAccount {
  id: string;
  address: string;
  password: string;
  token: string;
}

interface MailTmDomainMember {
  domain: string;
  isActive: boolean;
}

interface MailTmMessageSummary {
  id: string;
  subject: string;
  intro: string;
  createdAt: string;
}

interface MailTmMessageFull {
  id: string;
  subject: string;
  text?: string;
  html?: string[];
}

export class MailTmService {
  async createAccount(): Promise<MailTmAccount> {
    const domainsRes = await fetch(`${BASE_URL}/domains`);
    if (!domainsRes.ok) {
      throw new Error(`mail.tm: failed to get domains (${domainsRes.status})`);
    }
    const domainsData = (await domainsRes.json()) as {
      'hydra:member': MailTmDomainMember[];
    };
    const activeDomain = domainsData['hydra:member'].find((d) => d.isActive)?.domain;
    if (!activeDomain) throw new Error('mail.tm: no active domains available');

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < 5; attempt++) {
      const username = generateRandomUsername();
      const address = `${username}@${activeDomain}`;
      const password = generateRandomPassword();

      try {
        const createRes = await fetch(`${BASE_URL}/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, password })
        });

        if (!createRes.ok) {
          const errBody = await createRes.text();
          lastError = new Error(
            `mail.tm: account creation failed (${createRes.status}): ${errBody}`
          );
          logger.warn({ attempt, address }, 'mail.tm account creation failed, retrying');
          await sleep(1500);
          continue;
        }

        const accountData = (await createRes.json()) as { id: string };

        const tokenRes = await fetch(`${BASE_URL}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, password })
        });

        if (!tokenRes.ok) {
          throw new Error(`mail.tm: token request failed (${tokenRes.status})`);
        }

        const tokenData = (await tokenRes.json()) as { token: string };
        logger.info({ address }, 'mail.tm account created successfully');

        return { id: accountData.id, address, password, token: tokenData.token };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await sleep(1500);
      }
    }

    throw lastError;
  }

  async waitForVerificationCode(
    token: string,
    opts?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<string | null> {
    const timeout = opts?.timeoutMs ?? 180_000;
    const interval = opts?.pollIntervalMs ?? 5_000;
    const deadline = Date.now() + timeout;
    const seenIds = new Set<string>();

    logger.info('Waiting for verification code from mail.tm...');

    while (Date.now() < deadline) {
      try {
        const messages = await this.getMessages(token);
        for (const msg of messages) {
          if (seenIds.has(msg.id)) continue;
          seenIds.add(msg.id);

          const full = await this.getMessage(token, msg.id);
          const body = full.text ?? full.html?.join('\n') ?? msg.intro;
          const code = extractVerificationCode(body);
          if (code) {
            logger.info({ code, subject: full.subject }, 'Verification code found in mail.tm');
            return code;
          }
        }
      } catch (err) {
        logger.warn({ err }, 'mail.tm polling error, will retry');
      }

      await sleep(interval);
    }

    logger.warn({ timeoutMs: timeout }, 'Timed out waiting for mail.tm verification code');
    return null;
  }

  private async getMessages(token: string): Promise<MailTmMessageSummary[]> {
    const res = await fetch(`${BASE_URL}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`mail.tm: GET /messages failed (${res.status})`);
    const data = (await res.json()) as { 'hydra:member': MailTmMessageSummary[] };
    return data['hydra:member'] ?? [];
  }

  private async getMessage(token: string, id: string): Promise<MailTmMessageFull> {
    const res = await fetch(`${BASE_URL}/messages/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`mail.tm: GET /messages/${id} failed (${res.status})`);
    return res.json() as Promise<MailTmMessageFull>;
  }
}
