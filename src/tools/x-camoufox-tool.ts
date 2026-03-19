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
  authToken?: string;
  error?: string;
}

export interface PostTweetInput {
  authToken: string;
  text: string;
}

export interface PostTweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
  isPremium?: boolean;
}

const SIGNUP_URL = 'https://x.com/i/flow/signup';
const DEFAULT_TIMEOUT = 30000;
const SCREENSHOTS_DIR = 'screenshots';

async function capturePageDiagnostics(
  page: Page,
  label: string
): Promise<string | null> {
  try {
    // Take screenshot
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${SCREENSHOTS_DIR}/${label}-${ts}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    logger.info({ filename }, `${label}: screenshot saved`);

    // Capture any visible error/toast text on the page
    const diagnostics = await page.evaluate(() => {
      const results: Record<string, string | null> = {};
      // Toast messages
      const toast = document.querySelector('[data-testid="toast"]');
      results.toast = toast?.textContent?.trim() ?? null;
      // Inline errors
      const inlineError = document.querySelector(
        '[data-testid="inline_error"]'
      );
      results.inlineError = inlineError?.textContent?.trim() ?? null;
      // Any alert/error role elements
      const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
      results.alerts =
        alerts
          .map((a) => a.textContent?.trim())
          .filter(Boolean)
          .join(' | ') || null;
      // Page title and URL
      results.url = location.href;
      results.title = document.title;
      return results;
    });
    logger.info({ label, ...diagnostics }, `${label}: page diagnostics`);
    return (
      diagnostics.toast || diagnostics.inlineError || diagnostics.alerts || null
    );
  } catch (err) {
    logger.warn({ err, label }, 'Failed to capture page diagnostics');
    return null;
  }
}

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

async function waitAndClick(
  page: Page,
  selectors: string[],
  label: string
): Promise<boolean> {
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
  async registerAccount(
    input: RegisterAccountInput
  ): Promise<RegisterAccountResult> {
    const browser = new XBrowserTool();
    try {
      await browser.launch(input.proxyUrl);
      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      await page.goto(SIGNUP_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      await page.waitForSelector('[data-testid="apple_sign_in_button"]');
      await page
        .locator('[data-testid="apple_sign_in_button"] + * + *')
        .click();

      const nameSelectors = ['input[autocomplete="name"]'];

      if (!(await waitAndFill(page, nameSelectors, input.username, 'name'))) {
        return { success: false, error: 'Could not find name input' };
      }

      const emailSelectors = ['input[autocomplete="email"]'];

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
      if (
        !(await waitAndFill(
          page,
          usernameSelectors,
          input.username,
          'username'
        ))
      ) {
        return { success: false, error: 'Could not find username input' };
      }
      await waitAndClick(page, nextSelectors, 'next after username').catch(
        () => {}
      );
      await page.waitForTimeout(1500);

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[data-testid="ocfSignupTextInput"]'
      ];
      if (
        !(await waitAndFill(
          page,
          passwordSelectors,
          input.password,
          'password'
        ))
      ) {
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
      const verificationInput = page
        .locator(verificationSelectors.join(', '))
        .first();
      const isVerificationVisible = await verificationInput
        .isVisible()
        .catch(() => false);

      if (isVerificationVisible) {
        logger.info('X signup requires email verification, requesting code...');
        const code = input.getVerificationCode
          ? await input.getVerificationCode()
          : null;
        if (!code) {
          return {
            success: false,
            error: 'Verification code required but could not be obtained'
          };
        }
        await verificationInput.fill(code);
        await waitAndClick(page, nextSelectors, 'submit verification').catch(
          () => {}
        );
        await page.waitForTimeout(5000);
      }

      const currentUrl = page.url();
      if (
        currentUrl.includes('home') ||
        currentUrl.includes('explore') ||
        currentUrl.includes('flow')
      ) {
        const handleFromUrl = currentUrl.match(/x\.com\/([^/?]+)/)?.[1];
        const cookies = await browser.getCookies('https://x.com');
        const authCookie = cookies.find((c) => c.name === 'auth_token');
        return {
          success: true,
          handle: handleFromUrl ?? input.username,
          authToken: authCookie?.value
        };
      }

      const errorEl = page.locator('[data-testid="error"]').first();
      const errorText = await errorEl.textContent().catch(() => null);
      return {
        success: false,
        error:
          errorText?.trim() ||
          'Registration did not complete. Check for captcha or blocks.'
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
      logger.info('postTweet: launching browser');
      await browser.launch();

      logger.info('postTweet: setting auth_token cookie');
      await browser.addCookies([
        {
          name: 'auth_token',
          value: input.authToken,
          domain: '.x.com',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'None'
        }
      ]);

      const page = await browser.newPage();
      page.setDefaultTimeout(DEFAULT_TIMEOUT);

      // Navigate to home first to establish full session (ct0 CSRF cookie, etc.)
      logger.info('postTweet: navigating to x.com/home to init session');
      await page.goto('https://x.com/home', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {});

      const homeUrl = page.url();
      logger.info({ url: homeUrl }, 'postTweet: home loaded');
      if (homeUrl.includes('login') || homeUrl.includes('flow/login')) {
        logger.warn(
          'postTweet: redirected to login — auth_token invalid or expired'
        );
        return { success: false, error: 'auth_token is invalid or expired' };
      }

      // Detect premium: check for verified badge on the account switcher in sidebar
      let isPremium = false;
      try {
        isPremium = await page.evaluate(() => {
          // Premium users have a verified badge icon near their profile in the sidebar
          const switcher = document.querySelector(
            '[data-testid="SideNav_AccountSwitcher_Button"]'
          );
          if (switcher) {
            const badge = switcher.querySelector(
              'svg[data-testid="icon-verified"]'
            );
            if (badge) return true;
          }
          // Also check for premium nav link text — non-premium see "Premium" subscribe CTA
          // while premium users see "Premium" with checkmark or different styling
          // Fallback: check if the "Get Verified" / premium signup link exists
          const premiumSignup = document.querySelector(
            'a[href="/i/premium_sign_up"]'
          );
          if (premiumSignup) return false;
          // If no signup link found, check for verified badge anywhere in nav
          const navBadge = document.querySelector(
            'nav svg[data-testid="icon-verified"]'
          );
          return !!navBadge;
        });
        logger.info({ isPremium }, 'postTweet: premium status detected');
      } catch {
        logger.warn('postTweet: could not detect premium status');
      }

      // Now open compose
      logger.info('postTweet: navigating to compose');
      await page.goto('https://x.com/compose/post', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await page.waitForTimeout(2000);

      logger.info('postTweet: filling compose area');
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
          await page.waitForTimeout(300);

          // Insert text line-by-line: execCommand('insertText') doesn't handle \n
          // in contenteditable, so we split by newlines and press Enter between parts.
          const lines = input.text.split('\n');
          let insertOk = true;
          for (let i = 0; i < lines.length; i++) {
            if (i > 0) {
              await page.keyboard.press('Enter');
            }
            if (lines[i].length > 0) {
              const ok = await el.evaluate((node, line) => {
                node.focus();
                return document.execCommand('insertText', false, line);
              }, lines[i]);
              if (!ok) { insertOk = false; break; }
            }
          }

          if (!insertOk) {
            // Fallback: clear and use keyboard.type which handles \n natively
            logger.warn('postTweet: execCommand failed, falling back to keyboard.type');
            await el.evaluate((node) => { node.textContent = ''; }, null);
            await page.keyboard.type(input.text, { delay: 15 });
          }

          composed = true;
          logger.info(
            { selector: sel, method: insertOk ? 'execCommand' : 'keyboard' },
            'postTweet: text entered'
          );
          break;
        } catch {
          continue;
        }
      }
      if (!composed) {
        logger.warn('postTweet: could not find compose area');
        return { success: false, error: 'Could not find compose area' };
      }

      await page.waitForTimeout(1000);

      const postButtonSelectors = [
        '[data-testid="tweetButton"]',
        'button[data-testid="tweetButton"]'
      ];

      const MAX_POST_ATTEMPTS = 3;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= MAX_POST_ATTEMPTS; attempt++) {
        // Click the Post button
        logger.info({ attempt }, 'postTweet: clicking Post button');
        let submitted = false;
        for (const sel of postButtonSelectors) {
          try {
            const btn = page.locator(sel).first();
            await btn.waitFor({ state: 'visible', timeout: 5000 });
            await btn.click();
            submitted = true;
            logger.info({ selector: sel, attempt }, 'postTweet: Post button clicked');
            break;
          } catch {
            continue;
          }
        }
        if (!submitted) {
          logger.warn('postTweet: Post button not found, falling back to Ctrl+Enter');
          await page.keyboard.press('Control+Enter');
        }

        // Wait for success OR error signals
        logger.info({ attempt }, 'postTweet: waiting for confirmation or error');
        const outcome = await page
          .waitForFunction(
            () => {
              const compose = document.querySelector(
                '[data-testid="tweetTextarea_0"]'
              );
              const hasStatus = location.href.includes('/status/');

              if (!compose || hasStatus)
                return { done: true, success: true, error: null };

              const toast = document.querySelector('[data-testid="toast"]');
              if (toast) {
                const toastText = toast.textContent?.trim() ?? '';
                if (!toastText) return { done: true, success: true, error: null };
                const lower = toastText.toLowerCase();
                if (lower.includes('sent') || lower.includes('posted')) {
                  return { done: true, success: true, error: null };
                }
                return { done: true, success: false, error: toastText };
              }

              const inlineError = document.querySelector(
                '[data-testid="inline_error"]'
              );
              if (inlineError?.textContent?.trim()) {
                return { done: true, success: false, error: inlineError.textContent.trim() };
              }

              const alerts = document.querySelectorAll('[role="alert"]');
              for (const alert of alerts) {
                if (alert.closest('[data-testid="tweetTextarea_0"]')) continue;
                if (alert.closest('[contenteditable]')) continue;
                const t = alert.textContent?.trim();
                if (t && t.length > 10)
                  return { done: true, success: false, error: t };
              }

              return { done: false, success: false, error: null };
            },
            { timeout: 15000 }
          )
          .then((handle) => handle.jsonValue())
          .catch(() => ({ done: false, success: false, error: null as string | null }));

        const tweetUrl = page.url();
        const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);

        logger.info({ tweetUrl, outcome, attempt, tweetId: tweetIdMatch?.[1] ?? null }, 'postTweet: attempt result');

        // Success
        if (outcome.success || tweetIdMatch) {
          return { success: true, tweetId: tweetIdMatch?.[1] ?? undefined, isPremium };
        }

        lastError = outcome.error;

        // Error from X — dismiss toast/error and retry
        if (outcome.error && attempt < MAX_POST_ATTEMPTS) {
          logger.warn({ error: outcome.error, attempt }, 'postTweet: X error, will retry');

          // Dismiss the toast by clicking it or waiting for it to disappear
          try {
            const toast = page.locator('[data-testid="toast"]').first();
            if (await toast.isVisible().catch(() => false)) {
              await toast.click().catch(() => {});
            }
          } catch { /* ignore */ }

          // Wait for toast to disappear
          await page.waitForFunction(
            () => !document.querySelector('[data-testid="toast"]'),
            { timeout: 5000 }
          ).catch(() => {});

          // Small delay before retry
          await page.waitForTimeout(2000);
          continue;
        }
      }

      // All attempts failed
      await capturePageDiagnostics(page, 'postTweet-failed');
      return {
        success: false,
        error: lastError || 'Post failed after all retry attempts',
        isPremium
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Try to capture diagnostics even on crash
      if (browser) {
        try {
          const pages = browser['context']?.pages?.() ?? [];
          const activePage = pages[0];
          if (activePage)
            await capturePageDiagnostics(activePage, 'postTweet-crash');
        } catch {
          /* ignore */
        }
      }
      logger.error({ err }, 'postTweet: crashed');
      return { success: false, error: msg };
    } finally {
      logger.info('postTweet: closing browser');
      // await browser.close();
    }
  }
}
