/**
 * XCamoufoxTool — Camoufox-based X/Twitter automation.
 * All account registration and posting goes through browser automation.
 */
import { Page } from 'playwright';
import { XBrowserTool } from './x-browser.js';
import { logger } from '../shared/logger.js';

export interface RegisterAccountInput {
  email: string;
  password: string;
  username: string;
  proxyUrl?: string;
  /** Called when X requires email verification. Should return the code or null on timeout. */
  getVerificationCode?: () => Promise<string | null>;
}

export interface RegisterAccountResult {
  success: boolean;
  handle?: string;
  error?: string;
}

export interface PostTweetInput {
  email: string;
  password: string;
  text: string;
}

export interface PostTweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

const SIGNUP_URL = 'https://x.com/i/flow/signup';
const LOGIN_URL = 'https://x.com/i/flow/login';
const DEFAULT_TIMEOUT = 30000;

async function waitAndFill(
  page: Page,
  selectors: string[],
  value: string,
  label: string
): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.fill(value);
      logger.debug({ label, selector: sel }, 'Filled field');
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function waitAndClick(page: Page, selectors: string[], label: string): Promise<boolean> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.click();
      logger.debug({ label, selector: sel }, 'Clicked');
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export class XCamoufoxTool {
  async registerAccount(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    const browser = new XBrowserTool();
    try {
      await browser.launch(input.proxyUrl);
      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      await page.goto(SIGNUP_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

      await page.waitForSelector('[data-testid="apple_sign_in_button"]');
      await page.locator('[data-testid="apple_sign_in_button"] + * + *').click();

      const nameSelectors = [
        'input[autocomplete="name"]',
      ];

      if (!(await waitAndFill(page, nameSelectors, input.username, 'name'))) {
        return { success: false, error: 'Could not find name input' };
      }

      const emailSelectors = [
        'input[autocomplete="email"]',
      ];

      if (!(await waitAndFill(page, emailSelectors, input.email, 'email'))) {
        return { success: false, error: 'Could not find email input' };
      }

      const dobInputs = await page.locator('select').all();
      if (dobInputs.length >= 3) {
        await dobInputs[0].fill('1');
        await dobInputs[1].fill('1');
        await dobInputs[2].fill('1990');
      }

      const nextSelectors = [
        'button[data-testid="ocfSignupNextButton"]',
        'button:has-text("Next")',
        'span:has-text("Next")',
        '[role="button"]:has-text("Next")'
      ];
      await waitAndClick(page, nextSelectors, 'next after dob').catch(() => {});
      await page.waitForTimeout(1500);

      const usernameSelectors = [
        'input[data-testid="ocfSignupTextInput"]',
        'input[name="username"]',
        'input[placeholder*="username" i]'
      ];
      if (!(await waitAndFill(page, usernameSelectors, input.username, 'username'))) {
        return { success: false, error: 'Could not find username input' };
      }
      await waitAndClick(page, nextSelectors, 'next after username').catch(() => {});
      await page.waitForTimeout(1500);

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[data-testid="ocfSignupTextInput"]'
      ];
      if (!(await waitAndFill(page, passwordSelectors, input.password, 'password'))) {
        return { success: false, error: 'Could not find password input' };
      }

      const signupSelectors = [
        'button[data-testid="ocfSignupSubmitButton"]',
        'button:has-text("Sign up")',
        'span:has-text("Sign up")'
      ];
      if (!(await waitAndClick(page, signupSelectors, 'sign up'))) {
        return { success: false, error: 'Could not find Sign up button' };
      }
      await page.waitForTimeout(3000);

      const verificationSelectors = [
        'input[data-testid="ocfSignupTextInput"]',
        'input[type="text"]',
        'input[inputmode="numeric"]'
      ];
      const verificationInput = page.locator(verificationSelectors.join(', ')).first();
      const isVerificationVisible = await verificationInput.isVisible().catch(() => false);

      if (isVerificationVisible) {
        logger.info('X signup requires email verification, requesting code...');
        const code = input.getVerificationCode ? await input.getVerificationCode() : null;
        if (!code) {
          return { success: false, error: 'Verification code required but could not be obtained' };
        }
        await verificationInput.fill(code);
        await waitAndClick(page, nextSelectors, 'submit verification').catch(() => {});
        await page.waitForTimeout(5000);
      }

      const currentUrl = page.url();
      if (
        currentUrl.includes('home') ||
        currentUrl.includes('explore') ||
        currentUrl.includes('flow')
      ) {
        const handleFromUrl = currentUrl.match(/x\.com\/([^/?]+)/)?.[1];
        return { success: true, handle: handleFromUrl ?? input.username };
      }

      const errorEl = page.locator('[data-testid="error"]').first();
      const errorText = await errorEl.textContent().catch(() => null);
      return {
        success: false,
        error: errorText?.trim() || 'Registration did not complete. Check for captcha or blocks.'
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, email: input.email }, 'X registration failed');
      return { success: false, error: msg };
    } finally {
      await browser.close();
    }
  }

  async postTweet(input: PostTweetInput): Promise<PostTweetResult> {
    const browser = new XBrowserTool();
    try {
      await browser.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const usernameSelectors = [
        'input[autocomplete="username"]',
        'input[name="text"]',
        'input[data-testid="loginFormUserIdentifierInput"]'
      ];
      if (!(await waitAndFill(page, usernameSelectors, input.email, 'username/email'))) {
        return { success: false, error: 'Could not find login input' };
      }

      const nextSelectors = [
        'button[data-testid="loginFormNextButton"]',
        'button:has-text("Next")',
        'span:has-text("Next")'
      ];
      if (!(await waitAndClick(page, nextSelectors, 'next'))) {
        return { success: false, error: 'Could not find Next button' };
      }
      await page.waitForTimeout(2000);

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[data-testid="loginFormPasswordInput"]'
      ];
      if (!(await waitAndFill(page, passwordSelectors, input.password, 'password'))) {
        return { success: false, error: 'Could not find password input' };
      }

      const loginSelectors = [
        'button[data-testid="loginFormLoginButton"]',
        'button:has-text("Log in")',
        'span:has-text("Log in")'
      ];
      if (!(await waitAndClick(page, loginSelectors, 'login'))) {
        return { success: false, error: 'Could not find Log in button' };
      }
      await page.waitForTimeout(5000);

      const url = page.url();
      if (url.includes('login') && !url.includes('home')) {
        throw new Error('Login failed - check credentials or 2FA');
      }

      await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2000);

      const composeSelectors = [
        '[data-testid="tweetTextarea_0"]',
        '[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]'
      ];
      let composed = false;
      for (const sel of composeSelectors) {
        try {
          const el = page.locator(sel).first();
          await el.waitFor({ state: 'visible', timeout: 5000 });
          await el.click();
          await el.fill(input.text);
          composed = true;
          break;
        } catch {
          continue;
        }
      }
      if (!composed) {
        return { success: false, error: 'Could not find compose area' };
      }

      const postSelectors = [
        'button[data-testid="tweetButton"]',
        'button[data-testid="tweetButtonInline"]'
      ];
      if (!(await waitAndClick(page, postSelectors, 'post'))) {
        return { success: false, error: 'Could not find Post button' };
      }
      await page.waitForTimeout(3000);

      const tweetUrl = page.url();
      const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
      return { success: true, tweetId: tweetIdMatch?.[1] ?? undefined };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'X post via Camoufox failed');
      return { success: false, error: msg };
    } finally {
      await browser.close();
    }
  }
}
